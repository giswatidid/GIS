import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../docs/assets/gis-core.js',import.meta.url),'utf8');

function loadGisCore(){
  const window={crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'}};
  const context=vm.createContext({window,globalThis:window,console});
  vm.runInContext(coreSource,context,{filename:'gis-core.js'});
  return window.EditPolygonGISCore;
}

test('manual project save includes the GIS workspace containing remote service definitions',()=>{
  assert.match(app,/createSaveProjectPayload=function\(\)\{const payload=v140BaseCreateSaveProjectPayload[\s\S]*?payload\.gisWorkspace=gisClone\(gisState\(\)\)/);
  assert.match(app,/payload\.version=Math\.max\(3,Number\(payload\.version\)\|\|0\)/);
});

test('project-file normalisation preserves GIS workspace and reference overlays before restore',()=>{
  const start=app.indexOf('function normaliseSavedProjectPayload(raw)');
  const end=app.indexOf('function restoreCompleteProjectPayload(raw',start);
  assert.ok(start>=0&&end>start,'authoritative project normaliser is missing');
  const block=app.slice(start,end);
  assert.match(block,/referenceOverlays:Array\.isArray\(d\.referenceOverlays\)\?clone\(d\.referenceOverlays\):\[\]/);
  assert.match(block,/gisWorkspace:d\.gisWorkspace&&typeof d\.gisWorkspace==='object'\?clone\(d\.gisWorkspace\):null/);
});

test('restored project consumes the preserved GIS workspace and rebuilds runtime services',()=>{
  const start=app.indexOf('const v140BaseRestoreCompleteProjectPayload=restoreCompleteProjectPayload;');
  const end=app.indexOf('window.restoreCompleteProjectPayload=restoreCompleteProjectPayload;',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/const gis=gisClone\(data\?\.gisWorkspace\|\|gisDefaultState\(\)\)/);
  assert.match(block,/project\.gisWorkspace=gisCore\(\)\?\.normaliseState\(gis\)\|\|gis/);
  assert.match(block,/syncGisRuntime\(\)/);
});

test('GIS core round-trips a WMS source and layer display state without dropping service fields',()=>{
  const core=loadGisCore();
  assert.ok(core);
  const input={
    version:1,
    workspace:'advanced',
    activeBasemap:'builtin:osm',
    sources:[{
      id:'source_wms',type:'wms',name:'States WMS',url:'https://ahocevar.com/geoserver/wms',
      wmsLayers:'topp:states',wmsStyles:'',wmsFormat:'image/png',wmsVersion:'1.3.0',transparent:true,
      minZoom:2,maxZoom:19,bounds:[-124.731,24.956,-66.97,49.372],
      metadata:{wmsAdvertisedLayer:'topp:states'}
    }],
    layers:[{id:'layer_wms',sourceId:'source_wms',name:'States WMS',role:'reference',visible:false,opacity:.42,order:7,locked:true}],
    groups:[],assignments:{},panel:{tab:'layers',open:true},privacy:{remoteRequestsAcknowledged:true}
  };
  const saved=JSON.parse(JSON.stringify(input));
  const state=core.normaliseState(saved);
  assert.equal(state.workspace,'advanced');
  assert.equal(state.sources.length,1);
  assert.equal(state.layers.length,1);
  const source=state.sources[0],layer=state.layers[0];
  assert.equal(source.type,'wms');
  assert.equal(source.url,'https://ahocevar.com/geoserver/wms');
  assert.equal(source.wmsLayers,'topp:states');
  assert.equal(source.wmsFormat,'image/png');
  assert.equal(source.wmsVersion,'1.3.0');
  assert.equal(source.transparent,true);
  assert.deepEqual(Array.from(source.bounds),[-124.731,24.956,-66.97,49.372]);
  assert.equal(source.metadata.wmsAdvertisedLayer,'topp:states');
  assert.equal(layer.sourceId,'source_wms');
  assert.equal(layer.visible,false);
  assert.equal(layer.opacity,.42);
  assert.equal(layer.order,7);
  assert.equal(layer.locked,true);
});
