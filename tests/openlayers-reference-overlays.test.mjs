import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

test('OpenLayers reference vectors, tiles and GeoTIFF previews use map-runtime primitives',()=>{
  const start=app.indexOf('const REF=window.REFERENCE_OVERLAYS');
  const end=app.indexOf('function serializeRefs()',start);
  assert.ok(start>0&&end>start);
  const refs=app.slice(start,end);
  for(const token of ['MAP_RUNTIME.createTileLayer','MAP_RUNTIME.createGeoJsonLayer','MAP_RUNTIME.createStaticImageLayer','MAP_RUNTIME.setDisplayLayerVisible','MAP_RUNTIME.setDisplayLayerOpacity','MAP_RUNTIME.setDisplayLayerZIndex','MAP_RUNTIME.setGeoJsonLayerStyle'])assert.match(refs,new RegExp(token.replaceAll('.','\\.')));
  assert.doesNotMatch(refs,/MAP_RUNTIME\.engine/);
});

test('retired reference renderer is absent and old reference installer delegates to the authoritative runtime',()=>{
  const start=app.indexOf('function v96RenderOneReference');
  const end=app.indexOf('function v96AddGeoJsonReferenceOverlay',start);
  const bridge=app.slice(start,end);
  assert.match(bridge,/window\.syncReferenceMapLayers/);
  assert.doesNotMatch(app,/v98ReferenceNeedsCanvas|v98CreateFullDetailReferenceCanvasLayer|__v98ReferenceCanvas/);
});

test('reference deletion, restoration and GIS reordering remove layers through the map-runtime path',()=>{
  assert.match(app,/for\(const layer of REF\.layers\.values\(\)\)referenceLayerRemove\(layer\)/);
  assert.match(app,/if\(instance\)mapLayerRemove\(instance\)/);
  assert.match(app,/for\(const layer of store\.layers\.values\(\)\)mapLayerRemove\(layer\)/);
});

test('georeferenceable image overlays stay engine-neutral DOM content',()=>{
  const start=app.indexOf('function renderImageOverlays()');
  const end=app.indexOf('function bestRectFromPts',start),render=app.slice(start,end);
  assert.match(render,/MAP_RUNTIME\.latLngToPixel/);
  assert.doesNotMatch(render,/\bol\./);
  assert.doesNotMatch(render,/getNativeMap/);
});

test('map adapter exposes native OpenLayers reference vector and static-image primitives',()=>{
  assert.match(adapter,/function createGeoJsonLayer\(spec=\{\}\)/);
  assert.match(adapter,/new ol\.layer\.Vector/);
  assert.match(adapter,/new ol\.source\.ImageStatic/);
  assert.match(adapter,/new ol\.layer\.Image/);
  assert.doesNotMatch(adapter,/parityBridge|getLegacyMap|syncLegacy|compat/i);
});
