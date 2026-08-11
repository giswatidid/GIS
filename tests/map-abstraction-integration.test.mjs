import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

test('v1.55.7.4 loads the sole OpenLayers dependency before the map adapter and application',()=>{
  const openlayers=html.indexOf('cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js');
  const mapAdapter=html.indexOf('editpolygon-map-adapter.js');
  const application=html.indexOf('editpolygon-app.js');
  assert.ok(openlayers>=0&&mapAdapter>openlayers&&application>mapAdapter,{openlayers,mapAdapter,application});
  assert.doesNotMatch(html,/unpkg\.com\/leaf/i);
});

test('application creates and publishes the sole map runtime through the adapter',()=>{
  assert.match(app,/EditPolygonMapAdapter/);
  assert.match(app,/createRuntime\(/);
  assert.match(app,/window\.EditPolygonMap=MAP_RUNTIME/);
  assert.doesNotMatch(app,/requestedEngine|fallbackReason|mapEngineRequested/);
  assert.doesNotMatch(adapter,/requestedEngine|createLeaf.*Runtime|fallbackReason/i);
});

test('editor viewport, coordinate and interaction calls route through MAP_RUNTIME',()=>{
  for(const method of ['latLngToContainerPoint','containerPointToLatLng','latLngToLayerPoint','layerPointToLatLng','getZoom','getCenter','setView','fitBounds','distance','project','dragging','doubleClickZoom']){
    const direct=new RegExp(`(^|[^_A-Za-z0-9])map\\.${method.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}(?:\\(|\\b)`,'m');
    assert.equal(direct.test(app),false,`direct editor map dependency remains: map.${method}`);
  }
  assert.match(app,/MAP_RUNTIME\.lonLatToPixel|MAP_RUNTIME\.latLngToPixel/);
  assert.match(app,/MAP_RUNTIME\.fitExtent/);
  assert.match(app,/MAP_RUNTIME\.setPanEnabled/);
  assert.match(app,/MAP_RUNTIME\.setDoubleClickZoomEnabled/);
});

test('application does not reach into native map implementation details',()=>{
  assert.doesNotMatch(app,/\bol\./);
  assert.doesNotMatch(app,/getNativeMap\(/);
  assert.doesNotMatch(adapter,/nativePanLooksActive|recoverNativePan|getNativeMap/);
  assert.doesNotMatch(app,/MAP_PAN_GUARD|mapPanLooksActive|hardResetMapPan/);
});

test('main map event subscriptions use normalised adapter events',()=>{
  assert.match(app,/MAP_RUNTIME\.on\('click',selectFromMapClick\)/);
  assert.match(app,/MAP_RUNTIME\.on\('contextmenu'/);
  assert.match(app,/MAP_RUNTIME\.on\('mousemove'/);
  assert.doesNotMatch(app,/\nmap\.on\('/);
  assert.match(adapter,/lonLat:/);
  assert.match(adapter,/originalEvent:/);
});

test('OpenLayers runtime owns editable, service and reference primitives',()=>{
  assert.doesNotMatch(adapter,/createOpenLayersRuntime/);
  assert.match(adapter,/function createRuntime\(options=\{\}\)/);
  assert.match(adapter,/engine:'openlayers'/);
  assert.match(adapter,/createEditableVectorLayer/);
  assert.match(adapter,/createGeoJsonLayer/);
  assert.match(adapter,/createStaticImageLayer/);
  assert.doesNotMatch(adapter,/createLeaf.*Runtime|requestedEngine|fallbackReason/i);
  for(const token of ['parityBridge','getLegacyMap','syncLegacy','__peGetLegacyMap','editpolygon-legacy-compat']){
    assert.equal(adapter.includes(token)||app.includes(token),false,`obsolete compatibility token remains: ${token}`);
  }
});

test('built-in basemaps, GIS tile services and cached editable vectors use the shared runtime contract',()=>{
  assert.match(app,/makeBuiltinBasemaps/);
  assert.match(app,/MAP_RUNTIME\.createTileLayer/);
  assert.match(app,/MAP_RUNTIME\.createWmsLayer/);
  assert.match(app,/buildRuntimeCachedLayer/);
  assert.match(app,/MAP_RUNTIME\.createEditableVectorLayer/);
  assert.doesNotMatch(app,/function buildOpenLayersCachedLayer|function buildCachedLayer/);
});

test('vertex dragging live-updates cached geometry without committing history on every pointermove',()=>{
  assert.match(adapter,/updateEditableFeatureGeometry/);
  assert.match(app,/__editpolygonLiveGeometryUpdate/);
  assert.match(app,/scheduleVertexDragVisualUpdate/);
  assert.match(app,/12000/);
  assert.match(app,/linkedBaseGeometries/);
});
