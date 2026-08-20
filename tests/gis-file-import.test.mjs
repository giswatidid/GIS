import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-file-import.js',import.meta.url),'utf8');

function load(extra={}){
  const window={...extra};
  const context=vm.createContext({
    window,globalThis:window,console,Object,Array,Map,Set,String,Number,Boolean,Math,JSON,Promise,Error,Uint8Array,ArrayBuffer,TextDecoder
  });
  vm.runInContext(source,context);
  return {window,api:window.EditPolygonGISFileImport,context};
}

test('classifies nested QSpatial-style GeoPackage, FileGDB, and Shapefile ZIP contents',()=>{
  const {api}=load();
  const gpkg=api.classifyZipEntries(['export/data.gpkg','export/metadata.xml']);
  assert.deepEqual([...gpkg.gpkg],['export/data.gpkg']);
  assert.equal(gpkg.gdbFiles.length,0);
  assert.equal(gpkg.shp.length,0);

  const gdb=api.classifyZipEntries(['export/data.gdb/a00000001.gdbtable','export/data.gdb/a00000001.gdbtablx','export/readme.xml']);
  assert.equal(gdb.gdbFiles.length,2);
  assert.deepEqual([...gdb.gdbRoots],['export/data.gdb']);

  const shp=api.classifyZipEntries(['export/Local_Government_Areas.shp','export/Local_Government_Areas.dbf','export/Local_Government_Areas.prj']);
  assert.deepEqual([...shp.shp],['export/Local_Government_Areas.shp']);
});

test('detects Microsoft Intune managed-encryption wrapper before ZIP parsing',()=>{
  const {api}=load();
  const bytes=new TextEncoder().encode('MSMAMARPCRYPT AES/CBC/NoPadding');
  assert.equal(api._test.detectManagedEncryption(bytes.buffer),true);
  assert.equal(api._test.detectManagedEncryption(new Uint8Array([0x50,0x4b,0x03,0x04]).buffer),false);
});

test('GeoPackage parser combines feature tables and identifies source layer when multiple tables exist',async()=>{
  let locateFile=null,closed=false;
  const fakePackage={
    getFeatureTables:()=>['Districts','Stations'],
    queryForGeoJSONFeaturesInTable:table=>table==='Districts'
      ?[{type:'Feature',properties:{name:'A'},geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]}}]
      :{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'B'},geometry:{type:'Point',coordinates:[153.5,-27.5]}}]},
    close:()=>{closed=true;}
  };
  const {api}=load({GeoPackage:{
    setSqljsWasmLocateFile:fn=>{locateFile=fn;},
    GeoPackageAPI:{open:async()=>fakePackage}
  }});
  const result=await api.parseGeoPackageBytes(new Uint8Array([1,2,3]),'mock.gpkg');
  const plain=JSON.parse(JSON.stringify(result));
  assert.equal(plain.features.length,2);
  assert.deepEqual(plain.features.map(feature=>feature.properties.source_layer),['Districts','Stations']);
  assert.equal(plain.__editpolygonSource,'geopackage');
  assert.deepEqual(plain.__editpolygonLayers,['Districts','Stations']);
  assert.equal(typeof locateFile,'function');
  assert.match(locateFile('sql-wasm.wasm'),/@ngageoint\/geopackage@4\.2\.8\/dist\/sql-wasm\.wasm$/);
  assert.equal(closed,true);
});

test('single-layer normalisation does not add an unnecessary source_layer attribute',()=>{
  const {api}=load();
  const collection=api._test.normaliseLayerMap({Only:{type:'FeatureCollection',features:[
    {type:'Feature',properties:{name:'One'},geometry:{type:'Point',coordinates:[153,-27]}}
  ]}},'Fallback');
  assert.equal(collection.features.length,1);
  assert.equal(collection.features[0].properties.source_layer,'Only');
});
