import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

test('v1.55.4 OpenLayers reference vectors, tiles and GeoTIFF previews use map-runtime primitives',()=>{
  const start=app.indexOf('const REF=window.REFERENCE_OVERLAYS');
  const end=app.indexOf('function serializeRefs()',start);
  assert.ok(start>0&&end>start);
  const refs=app.slice(start,end);
  assert.match(refs,/MAP_RUNTIME\.createTileLayer/);
  assert.match(refs,/MAP_RUNTIME\.createGeoJsonLayer/);
  assert.match(refs,/MAP_RUNTIME\.createStaticImageLayer/);
  assert.match(refs,/MAP_RUNTIME\.setDisplayLayerVisible/);
  assert.match(refs,/MAP_RUNTIME\.setDisplayLayerOpacity/);
  assert.match(refs,/MAP_RUNTIME\.setDisplayLayerZIndex/);
  assert.match(refs,/MAP_RUNTIME\.setGeoJsonLayerStyle/);
});

test('legacy large-reference renderer cannot draw in OpenLayers mode',()=>{
  const start=app.indexOf('function v96RenderOneReference');
  const end=app.indexOf('function v96AddGeoJsonReferenceOverlay',start);
  const legacy=app.slice(start,end);
  assert.match(legacy,/MAP_RUNTIME\?\.engine==='openlayers'/);
  assert.match(legacy,/window\.syncReferenceMapLayers/);
  const renderBody=legacy.slice(0,legacy.indexOf('function v96SyncReferenceLayers'));
  assert.ok(renderBody.indexOf("MAP_RUNTIME?.engine==='openlayers'") < renderBody.indexOf('const REF=v96ReferenceStore()'));
});

test('reference deletion, restoration and GIS reordering remove layers through the engine-neutral map path',()=>{
  assert.match(app,/for\(const layer of REF\.layers\.values\(\)\)referenceLayerRemove\(layer\)/);
  assert.match(app,/if\(instance\)mapLayerRemove\(instance\)/);
  assert.match(app,/for\(const layer of store\.layers\.values\(\)\)mapLayerRemove\(layer\)/);
});

test('georeferenceable image overlays are already engine-neutral DOM content rather than Leaflet compatibility layers',()=>{
  const start=app.indexOf('function renderImageOverlays()');
  const end=app.indexOf('function bestRectFromPts',start);
  const render=app.slice(start,end);
  assert.match(render,/MAP_RUNTIME\.latLngToPixel/);
  assert.doesNotMatch(render,/\bL\./);
  assert.doesNotMatch(render,/__peGetLeafletMap/);
});

test('map adapter exposes native OpenLayers reference vector and static-image primitives',()=>{
  assert.match(adapter,/function createGeoJsonLayer\(spec=\{\}\)/);
  assert.match(adapter,/new ol\.layer\.Vector/);
  assert.match(adapter,/new ol\.source\.ImageStatic/);
  assert.match(adapter,/new ol\.layer\.Image/);
  assert.doesNotMatch(adapter,/parityBridge|getLegacyMap|syncLegacy|editpolygon-leaflet-compat/);
});
