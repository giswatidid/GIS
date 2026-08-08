import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

test('map click selection uses one unified geometry-aware hit-test path',()=>{
  assert.match(app,/function featureHitAtMapPoint\(feature,file,latlng,pixel\)/);
  assert.match(app,/geom\.type==='Point'/);
  assert.match(app,/geom\.type==='MultiPoint'/);
  assert.match(app,/geom\.type==='LineString'/);
  assert.match(app,/geom\.type==='MultiLineString'/);
  assert.match(app,/geom\.type==='Polygon'/);
  assert.match(app,/geom\.type==='MultiPolygon'/);
  assert.match(app,/isParametricCircleFeature\(feature\).*circleContainsLatLng/s);
  assert.match(app,/featuresAtLatLng\(e\.latLng,e\.pixel\)/);
});

test('map click semantics match the Layers selection model',()=>{
  assert.match(app,/function applyMapFeatureSelection\(featureId,modifiers=\{\}\)/);
  assert.match(app,/const current=new Set\(hooks\.selectedIds\?\.\(\)\|\|\[\]\),toggle=!!\(modifiers\.ctrlKey\|\|modifiers\.metaKey\),add=!!modifiers\.shiftKey/);
  assert.match(app,/else if\(add\)\{current\.add\(featureId\);\}/);
  assert.match(app,/else\{current\.clear\(\);current\.add\(featureId\);\}/);
  assert.match(app,/if\(!candidates\.length\)\{\s*if\(!modifiers\.shiftKey&&!modifiers\.ctrlKey&&!modifiers\.metaKey\)clearMapFeatureSelection\(\)/s);
  assert.match(app,/window\.__editPolygonLayersV133\|\|null/);
});

test('OpenLayers selection state forces the cached renderer to refresh immediately',()=>{
  const v132=app.slice(app.indexOf('function v132ApplyFeatureStyles'),app.indexOf('function v132RefreshLayerUi'));
  const v133=app.slice(app.indexOf('function v133ApplyMapStyles'),app.indexOf('function v133SyncFeatureRow'));
  assert.match(v132,/MAP_RUNTIME\.engine==='openlayers'.*renderMap\(\)/s);
  assert.match(v133,/MAP_RUNTIME\.engine==='openlayers'.*renderMap\(\)/s);
});

test('overlap picker is geometry neutral',()=>{
  assert.match(app,/Select overlapping feature/);
  assert.doesNotMatch(app,/Select overlapping polygon/);
});

test('OpenLayers click selection resolves rendered hits directly and tests the visible true-circle footprint in pixels',()=>{
  const start=app.indexOf('function trueCircleHitAtPixel');
  const block=app.slice(start,app.indexOf('function mapSelectionHooks',start));
  assert.ok(start>=0);
  assert.match(block,/function trueCircleHitAtPixel\(feature,pixel,latlng=null\)/);
  assert.match(block,/centerPixel\.distanceTo\(hitPixel\)<=circleScreenRadiusPixels/);
  assert.match(block,/editableFeatureIdsAtPixel\(hitPixel,\{hitTolerance:10\}\)/);
  assert.match(block,/fileOfFeature\(String\(id\)\)/);
  assert.match(block,/hits\.set\(String\(row\.feature\.id\),row\)/);
  assert.match(block,/trueCircleHitAtPixel\(row\.feature,hitPixel,latlng\)/);
  assert.doesNotMatch(block,/if\(isLocked\(row\.file,row\.feature\)\)continue/);
});


test('OpenLayers click delivery has a compatibility-surface fallback instead of relying only on the OL viewport',()=>{
  const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');
  assert.match(adapter,/if\(type==='click'\)/);
  assert.match(adapter,/\.editpolygon-leaflet-compat/);
  assert.match(adapter,/nativeMap\.getViewport/);
  assert.match(adapter,/queueMicrotask/);
});
