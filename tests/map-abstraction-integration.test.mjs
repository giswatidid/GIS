import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

test('v1.55.1.8 loads both map engines and the map adapter before the application',()=>{
  const leaflet=html.indexOf('leaflet@1.9.4/dist/leaflet.js');
  const openlayers=html.indexOf('cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js');
  const mapAdapter=html.indexOf('editpolygon-map-adapter.js');
  const application=html.indexOf('editpolygon-app.js');
  assert.ok(leaflet>=0&&openlayers>leaflet&&mapAdapter>openlayers&&application>mapAdapter,{leaflet,openlayers,mapAdapter,application});
});

test('application creates and publishes the map runtime instead of instantiating Leaflet directly',()=>{
  assert.match(app,/EditPolygonMapAdapter/);
  assert.match(app,/createRuntime\(/);
  assert.match(app,/requestedEngine\(location\.search\)/);
  assert.match(app,/window\.EditPolygonMap=MAP_RUNTIME/);
  assert.doesNotMatch(app,/const map=L\.map\(/);
});

test('editor viewport, coordinate and interaction calls route through MAP_RUNTIME',()=>{
  for(const method of [
    'latLngToContainerPoint','containerPointToLatLng','latLngToLayerPoint','layerPointToLatLng',
    'getZoom','getCenter','setView','fitBounds','distance','project','dragging','doubleClickZoom'
  ]){
    const direct=new RegExp(`(^|[^_A-Za-z0-9])map\\.${method.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:\\(|\\b)`,'m');
    assert.equal(direct.test(app),false,`direct editor map dependency remains: map.${method}`);
  }
  assert.match(app,/MAP_RUNTIME\.lonLatToPixel|MAP_RUNTIME\.latLngToPixel/);
  assert.match(app,/MAP_RUNTIME\.fitExtent/);
  assert.match(app,/MAP_RUNTIME\.setPanEnabled/);
  assert.match(app,/MAP_RUNTIME\.setDoubleClickZoomEnabled/);
});

test('application no longer uses Leaflet Point or Leaflet private draggable state for editor logic',()=>{
  assert.doesNotMatch(app,/L\.point\(/);
  assert.doesNotMatch(app,/map\.dragging\._draggable/);
  assert.doesNotMatch(app,/leafletPanLooksActive/);
  assert.match(adapter,/nativePanLooksActive/);
  assert.match(adapter,/recoverNativePan/);
});

test('main map event subscriptions use normalised adapter events',()=>{
  assert.match(app,/MAP_RUNTIME\.on\('click',selectFromMapClick\)/);
  assert.match(app,/MAP_RUNTIME\.on\('contextmenu'/);
  assert.match(app,/MAP_RUNTIME\.on\('mousemove'/);
  assert.doesNotMatch(app,/\nmap\.on\('/);
  assert.match(adapter,/lonLat:/);
  assert.match(adapter,/originalEvent:/);
});

test('OpenLayers is available behind an explicit parity switch while Leaflet remains the safe default and reduced compatibility overlay',()=>{
  assert.match(adapter,/requestedEngine/);
  assert.match(adapter,/createOpenLayersRuntime/);
  assert.match(adapter,/engine:'openlayers'/);
  assert.match(adapter,/parityBridge:'leaflet-reference-image-overlays'/);
  assert.match(adapter,/createEditableVectorLayer/);
  assert.match(app,/MAP_RUNTIME\.engine==='openlayers'/);
  assert.match(app,/getLegacyMap/);
});

test('built-in basemaps, GIS tile services and cached editable vectors have OpenLayers paths',()=>{
  assert.match(app,/makeBuiltinBasemaps/);
  assert.match(app,/MAP_RUNTIME\.createTileLayer/);
  assert.match(app,/MAP_RUNTIME\.createWmsLayer/);
  assert.match(app,/buildOpenLayersCachedLayer/);
  assert.match(app,/MAP_RUNTIME\.createEditableVectorLayer/);
});


test('vertex dragging live-updates cached geometry without committing history on every pointermove',()=>{
  assert.match(adapter,/updateEditableFeatureGeometry/);
  assert.match(app,/__editpolygonLiveGeometryUpdate/);
  assert.match(app,/scheduleVertexDragVisualUpdate/);
  assert.match(app,/12000/);
  assert.match(app,/linkedBaseGeometries/);
});
