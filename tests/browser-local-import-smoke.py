from pathlib import Path
import os
import shutil
import sqlite3
import struct
import tempfile
import zipfile
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None


def gpkg_point_blob(x,y,srs_id=4326):
    # GeoPackage standard geometry header: GP, version 0, little-endian/no
    # envelope flags, signed SRS id, followed by little-endian WKB Point.
    return b'GP'+bytes([0,1])+struct.pack('<i',srs_id)+struct.pack('<BIdd',1,1,x,y)


def make_gpkg(path):
    con=sqlite3.connect(path)
    cur=con.cursor()
    cur.executescript('''
      PRAGMA application_id=1196437808;
      PRAGMA user_version=10300;
      CREATE TABLE gpkg_spatial_ref_sys (
        srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY,
        organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
        definition TEXT NOT NULL, description TEXT
      );
      INSERT INTO gpkg_spatial_ref_sys VALUES
        ('Undefined Cartesian',-1,'NONE',-1,'undefined','undefined Cartesian coordinate reference system'),
        ('Undefined geographic',0,'NONE',0,'undefined','undefined geographic coordinate reference system'),
        ('WGS 84 geodetic',4326,'EPSG',4326,'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]','longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');
      CREATE TABLE gpkg_contents (
        table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL,
        identifier TEXT UNIQUE, description TEXT DEFAULT '',
        last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER
      );
      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL, column_name TEXT NOT NULL,
        geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
        z TINYINT NOT NULL, m TINYINT NOT NULL,
        PRIMARY KEY (table_name,column_name)
      );
      CREATE TABLE test_points (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, name TEXT, lga TEXT);
      INSERT INTO gpkg_contents(table_name,data_type,identifier,min_x,min_y,max_x,max_y,srs_id)
        VALUES ('test_points','features','test_points',153,-27,153,-27,4326);
      INSERT INTO gpkg_geometry_columns VALUES ('test_points','geom','POINT',4326,0,0);
    ''')
    cur.execute('INSERT INTO test_points(geom,name,lga) VALUES (?,?,?)',(sqlite3.Binary(gpkg_point_blob(153.0,-27.0)),'Test feature','Brisbane City'))
    con.commit();con.close()


with tempfile.TemporaryDirectory() as td:
    temp=Path(td)
    gpkg=temp/'sample.gpkg';make_gpkg(gpkg)
    gpkg_zip=temp/'gpkg-export.zip'
    with zipfile.ZipFile(gpkg_zip,'w',zipfile.ZIP_DEFLATED) as z:
        z.write(gpkg,'QSpatial_export/data.gpkg')
        z.writestr('QSpatial_export/metadata.xml','<metadata/>')
    gdb_zip=temp/'filegdb-export.zip'
    with zipfile.ZipFile(gdb_zip,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('QSpatial_export/data.gdb/a00000001.gdbtable',b'mock-table')
        z.writestr('QSpatial_export/data.gdb/a00000001.gdbtablx',b'mock-index')
        z.writestr('QSpatial_export/data.gdb/gdb',b'\x03\x00\x00\x00')
    unknown_zip=temp/'unknown.zip'
    with zipfile.ZipFile(unknown_zip,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('readme.txt','nothing spatial')

    with sync_playwright() as p:
        options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        executable=chromium_path()
        if executable:options['executable_path']=executable
        browser=p.chromium.launch(**options)
        page=browser.new_page(viewport={'width':1100,'height':760})
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content('<!doctype html><html><head></head><body><input id="file" type="file"></body></html>')
        # JSZip is already a pinned production dependency; use the same browser build.
        page.add_script_tag(url='https://unpkg.com/jszip@3.10.1/dist/jszip.min.js')
        page.add_script_tag(path=str(ROOT/'docs/assets/gis-file-import.js'))

        # Real GeoPackage JS + real sql.js WASM path against a generated valid GPKG.
        page.add_script_tag(url='https://unpkg.com/@ngageoint/geopackage@4.2.8/dist/geopackage.min.js')
        page.set_input_files('#file',str(gpkg))
        direct=page.evaluate('''async()=>{
          const file=document.getElementById('file').files[0];
          const result=await EditPolygonGISFileImport.parseGeoPackageFile(file);
          return {count:result.features.length,feature:result.features[0],source:result.__editpolygonSource,layers:result.__editpolygonLayers};
        }''')
        assert direct['count']==1,direct
        assert direct['feature']['properties']['name']=='Test feature',direct
        assert direct['feature']['properties']['lga']=='Brisbane City',direct
        assert direct['feature']['geometry']['type']=='Point',direct
        assert abs(direct['feature']['geometry']['coordinates'][0]-153)<1e-8,direct
        assert abs(direct['feature']['geometry']['coordinates'][1]+27)<1e-8,direct
        assert direct['source']=='geopackage' and direct['layers']==['test_points'],direct

        # The same GeoPackage must be discovered when nested inside an export ZIP.
        page.set_input_files('#file',str(gpkg_zip))
        zipped=page.evaluate('''async()=>{
          const result=await EditPolygonGISFileImport.parseZip(document.getElementById('file').files[0]);
          return {count:result.features.length,name:result.features[0].properties.name};
        }''')
        assert zipped=={'count':1,'name':'Test feature'},zipped

        # Exercise the complete nested .gdb ZIP routing/repack path with the parser
        # boundary mocked. The production fgdb library is lazy-loaded only if no
        # existing fgdb function is present.
        page.evaluate('''()=>{window.fgdb=async buffer=>{
          window.__fgdbBytes=buffer.byteLength;
          return {MockFeatureClass:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'GDB feature'},geometry:{type:'Point',coordinates:[152,-26]}}]}};
        }}''')
        page.set_input_files('#file',str(gdb_zip))
        gdb=page.evaluate('''async()=>{
          const result=await EditPolygonGISFileImport.parseZip(document.getElementById('file').files[0]);
          return {count:result.features.length,name:result.features[0].properties.name,sourceLayer:result.features[0].properties.source_layer||null,bytes:window.__fgdbBytes};
        }''')
        assert gdb['count']==1 and gdb['name']=='GDB feature' and gdb['bytes']>0,gdb
        # Single feature-class GDBs should not expose a redundant source_layer field.
        assert gdb['sourceLayer'] is None,gdb

        page.set_input_files('#file',str(unknown_zip))
        unknown=page.evaluate('''async()=>{try{await EditPolygonGISFileImport.parseZip(document.getElementById('file').files[0]);return 'unexpected success';}catch(error){return error.message;}}''')
        assert 'no supported spatial dataset' in unknown,unknown
        assert not errors,errors
        browser.close()

print('Browser local import smoke test passed.')
