from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'docs/assets/editpolygon-app.js'
DATA_TOOLS = ROOT / 'docs/assets/gis-data-tools.js'
INDEX = ROOT / 'docs/index.html'
WORKSPACE = ROOT / 'docs/assets/gis-workspace.js'
PACKAGE = ROOT / 'package.json'
ARCH = ROOT / 'ARCHITECTURE.md'
RELEASE = ROOT / 'RELEASE_MANIFEST.md'
README = ROOT / 'README.md'
OLD_KEY = '20260820-v1561-processing-preview-v9'
NEW_KEY = '20260821-v1561-local-import-v10'
SELF = 'scripts/apply-local-import-csv-fix.py'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def replace_regex_once(text, pattern, replacement, label, flags=0):
    matches = list(re.finditer(pattern, text, flags))
    if len(matches) != 1:
        raise RuntimeError(f'{label}: expected exactly one regex match, found {len(matches)}')
    return re.sub(pattern, replacement, text, count=1, flags=flags)


# ---------------------------------------------------------------------------
# Authoritative local-file import routing + typed table export.
# ---------------------------------------------------------------------------
app = APP.read_text(encoding='utf-8')
old_route = """  }else if(ext==='wkt'||ext==='txt'){
    onProgress(`Parsing ${file.name}…`,35);
    data=wktToGeo(await file.text(),file.name);
  }else if(ext==='zip'||ext==='shp'){
    data=await shapefileZipToGeo(file,onProgress);
  }else if(ext==='epz'){"""
new_route = """  }else if(ext==='wkt'||ext==='txt'){
    onProgress(`Parsing ${file.name}…`,35);
    data=wktToGeo(await file.text(),file.name);
  }else if(ext==='gpkg'){
    if(!window.EditPolygonGISFileImport)throw Error('Advanced local import module is not loaded. Refresh the page and try again.');
    data=await window.EditPolygonGISFileImport.parseGeoPackageFile(file,onProgress);
  }else if(ext==='zip'){
    if(!window.EditPolygonGISFileImport)throw Error('Advanced local import module is not loaded. Refresh the page and try again.');
    const routed=await window.EditPolygonGISFileImport.parseZip(file,onProgress);
    data=routed||await shapefileZipToGeo(file,onProgress);
  }else if(ext==='shp'){
    data=await shapefileZipToGeo(file,onProgress);
  }else if(ext==='epz'){"""
app = replace_once(app, old_route, new_route, 'local import routing')

old_error = "throw Error('Unsupported file type. Supported: GML, KML, KMZ, GeoJSON, JSON, CSV, WKT, TXT, zipped Shapefile, or EditPolygon .epz project');"
new_error = "throw Error('Unsupported file type. Supported: GML, KML, KMZ, GeoJSON, JSON, GeoPackage (GPKG), CSV, WKT, TXT, zipped Shapefile, zipped File Geodatabase, or EditPolygon .epz project');"
if app.count(old_error) < 1:
    raise RuntimeError('unsupported-file message was not found')
app = app.replace(old_error, new_error)

export_pattern = r"function exportLayerRecords\(fileId,\{scope='all',format='geojson',featureIds=null\}=\{\}\)\{.*?\n\s*\}\n\n\s*const previousSaveSelection="
export_replacement = r'''function exportLayerRecords(fileId,{scope='all',format='geojson',featureIds=null}={}){
    const file=gisEditableFile(fileId);if(!file)throw Error('Layer not found.');ensureSchema(file);
    const features=recordsForScope(file,scope,featureIds);if(!features.length)throw Error('No records match this export scope.');
    const safe=String(file.name||'layer').replace(/[^\w.-]+/g,'_');
    const fields=file.gisSchema.fields,quote=value=>`"${String(value??'').replace(/"/g,'""')}"`;
    if(format==='csv-attributes'){
      const lines=[fields.map(field=>field.name).map(quote).join(',')];
      for(const feature of features)lines.push(fields.map(field=>feature.properties?.[field.name]).map(quote).join(','));
      // UTF-8 BOM + CRLF gives Excel/Power BI a conventional tabular CSV while
      // deliberately omitting all geometry from an attribute-table export.
      downloadText(`${safe}_${scope}.csv`,`\uFEFF${lines.join('\r\n')}`,'text/csv;charset=utf-8');
    }else if(format==='csv'){
      const lines=[[...fields.map(field=>field.name),'geometry_wkt'].map(quote).join(',')];
      for(const feature of features)lines.push([...fields.map(field=>feature.properties?.[field.name]),(getDisplayGeometry(feature)?geomToWKT(getDisplayGeometry(feature)):'')].map(quote).join(','));
      downloadText(`${safe}_${scope}_wkt.csv`,`\uFEFF${lines.join('\r\n')}`,'text/csv;charset=utf-8');
    }else if(format==='geojson'){
      const collection={type:'FeatureCollection',features:features.map(featJSON),editpolygonSchema:clone(file.gisSchema)};
      downloadText(`${safe}_${scope}.geojson`,JSON.stringify(collection,null,2),'application/geo+json;charset=utf-8');
    }else throw Error(`Unsupported table export format: ${format}.`);
    return {count:features.length,scope,format};
  }

  const previousSaveSelection='''
app = replace_regex_once(app, export_pattern, export_replacement, 'attribute-table export', flags=re.S)
APP.write_text(app, encoding='utf-8')

# ---------------------------------------------------------------------------
# Attribute-table UI: plain CSV is the default because this is a data table.
# ---------------------------------------------------------------------------
data_tools = DATA_TOOLS.read_text(encoding='utf-8')
old_options = '<option value="geojson">GeoJSON</option><option value="csv">CSV + WKT</option>'
new_options = '<option value="csv-attributes">CSV — attributes only</option><option value="csv">CSV + WKT</option><option value="geojson">GeoJSON</option>'
data_tools = replace_once(data_tools, old_options, new_options, 'attribute-table export options')
DATA_TOOLS.write_text(data_tools, encoding='utf-8')

# ---------------------------------------------------------------------------
# Browser entry points and user-facing format descriptions.
# ---------------------------------------------------------------------------
index = INDEX.read_text(encoding='utf-8')
old_accept = '.gml,.kml,.kmz,.geojson,.json,.csv,.wkt,.txt,.zip,.shp,.epz'
accept_count = index.count(old_accept)
if accept_count != 3:
    raise RuntimeError(f'file input accept lists: expected 3 matches, found {accept_count}')
index = index.replace(old_accept, '.gml,.kml,.kmz,.geojson,.json,.gpkg,.csv,.wkt,.txt,.zip,.shp,.epz')
jszip_script = '<script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>'
import_script = f'{jszip_script}\n<script src="assets/gis-file-import.js?v={NEW_KEY}"></script>'
index = replace_once(index, jszip_script, import_script, 'local import module script')
index = index.replace('Import GML, KML, KMZ, GeoJSON, TopoJSON, Shapefile ZIP, WKT and CSV', 'Import GML, KML, KMZ, GeoJSON, GeoPackage, TopoJSON, Shapefile ZIP, zipped File Geodatabase, WKT and CSV')
index = index.replace('Work with GML, KML, KMZ, GeoJSON, TopoJSON, ESRI Shapefile ZIP, WKT and CSV polygon data.', 'Work with GML, KML, KMZ, GeoJSON, GeoPackage, TopoJSON, ESRI Shapefile ZIP, zipped File Geodatabase, WKT and CSV spatial data.')
index = index.replace('Supported workflows include GML, KML, KMZ, GeoJSON, TopoJSON, Shapefile ZIP, WKT and CSV.', 'Supported workflows include GML, KML, KMZ, GeoJSON, GeoPackage, TopoJSON, Shapefile ZIP, zipped File Geodatabase, WKT and CSV.')
INDEX.write_text(index, encoding='utf-8')

workspace = WORKSPACE.read_text(encoding='utf-8')
old_help = 'Use the existing importer for GeoJSON, KML/KMZ, GML, Shapefile ZIP, CSV, WKT, TopoJSON and project files.'
new_help = 'Use the browser-local importer for GeoJSON, KML/KMZ, GML, GeoPackage, Shapefile ZIP, zipped File Geodatabase, CSV, WKT, TopoJSON and project files.'
workspace = replace_once(workspace, old_help, new_help, 'Advanced GIS import help')
WORKSPACE.write_text(workspace, encoding='utf-8')

# ---------------------------------------------------------------------------
# Test scripts.
# ---------------------------------------------------------------------------
package = json.loads(PACKAGE.read_text(encoding='utf-8'))
smoke = package['scripts']['test:browser-smoke']
local_smoke = 'python tests/browser-local-import-smoke.py'
if local_smoke not in smoke:
    smoke = smoke + ' && ' + local_smoke
package['scripts']['test:browser-smoke'] = smoke
package['scripts']['test:browser-local-import'] = local_smoke
PACKAGE.write_text(json.dumps(package, indent=2) + '\n', encoding='utf-8')

# ---------------------------------------------------------------------------
# Architecture/release documentation.
# ---------------------------------------------------------------------------
arch = ARCH.read_text(encoding='utf-8')
arch_marker = '## Browser-local multi-format import (v1.56.1)'
if arch_marker not in arch:
    arch += f'''\n\n{arch_marker}\n\n- `docs/assets/gis-file-import.js` is the format dispatcher for container formats that require inspection before parsing. ZIP archives are classified before a parser is chosen: Shapefile remains on the existing shpjs path, GeoPackage is extracted/read through GeoPackage JS, and zipped Esri File Geodatabases are routed through the browser FileGDB reader.\n- Standalone `.gpkg` files use the same GeoPackage path as a `.gpkg` nested in a ZIP. GeoPackage feature tables are converted to the app's canonical WGS84 GeoJSON feature model before normal project import continues.\n- GeoPackage and FileGDB parser code/WASM is lazy-loaded only when one of those formats is opened. Geometry bytes remain in the user's browser; EditPolygon does not upload source data to a conversion service.\n- Attribute-table CSV export has two explicit semantics: `CSV — attributes only` omits geometry entirely, while `CSV + WKT` preserves the spatial WKT column.\n'''
ARCH.write_text(arch, encoding='utf-8')

release = RELEASE.read_text(encoding='utf-8')
release_marker = '### Local import and tabular export completion'
if release_marker not in release:
    release += f'''\n\n{release_marker}\n\n- Direct GeoPackage (`.gpkg`) import.\n- ZIP content routing for GeoPackage archives, Shapefile archives and zipped Esri File Geodatabases rather than treating every `.zip` as a Shapefile.\n- Explicit managed/encrypted or unsupported ZIP diagnostics instead of a misleading “no layers found” result.\n- Attribute-table `CSV — attributes only` export for spreadsheet/BI workflows, with `CSV + WKT` retained as a separate spatial option.\n- Browser-local import regression coverage includes a generated valid GeoPackage and nested-ZIP dispatch.\n'''
RELEASE.write_text(release, encoding='utf-8')

readme = README.read_text(encoding='utf-8')
if 'GeoPackage' not in readme:
    readme += '''\n\n### Additional browser-local GIS formats\n\nAdvanced GIS import also accepts standalone GeoPackage (`.gpkg`), GeoPackage exports contained in ZIP files, and zipped Esri File Geodatabases (`.gdb`). ZIP contents are inspected before parser selection, while ordinary Shapefile ZIP import remains supported.\n'''
README.write_text(readme, encoding='utf-8')

# ---------------------------------------------------------------------------
# One coherent cache contract for every app asset touched by this release.
# ---------------------------------------------------------------------------
result = subprocess.run(['git', 'grep', '-l', OLD_KEY], cwd=ROOT, text=True, capture_output=True, check=False)
for relative in [line.strip() for line in result.stdout.splitlines() if line.strip()]:
    if relative == SELF:
        continue
    path = ROOT / relative
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    if OLD_KEY in text:
        path.write_text(text.replace(OLD_KEY, NEW_KEY), encoding='utf-8')

print('Integrated GeoPackage/FileGDB ZIP routing, attribute-only CSV export, docs/tests and cache v10.')
