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

test('OpenLayers map selection prefers native rendered-feature hit detection for true circles',()=>{
  assert.match(app,/MAP_RUNTIME\.engine==='openlayers'&&typeof MAP_RUNTIME\.editableFeatureIdsAtPixel==='function'/);
  assert.match(app,/editableFeatureIdsAtPixel\(hitPixel,\{hitTolerance:10\}\)/);
});
