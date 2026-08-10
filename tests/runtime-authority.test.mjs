import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

function block(startToken,endToken){
  const start=app.indexOf(startToken);assert.ok(start>=0,`missing ${startToken}`);
  const end=app.indexOf(endToken,start);assert.ok(end>start,`missing ${endToken}`);
  return app.slice(start,end);
}

test('v1.55.4 publishes one final runtime-authority snapshot at the end of the application scope',()=>{
  const marker='/* v1.55.4 — runtime authority boundary.';
  const start=app.indexOf(marker);assert.ok(start>=0);
  const tail=app.slice(start);
  assert.match(tail,/version:'1\.55\.4'/);
  assert.match(tail,/renderAll\(\);[\s\S]*window\.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY/);
  assert.match(tail,/renderMap,renderAll,renderSidebar,renderSelected,renderOverlay/);
  assert.match(tail,/featuresAtLatLng,featureHitAtMapPoint,parametricCircleHitAtMapPoint/);
  const publish=tail.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY');
  assert.doesNotMatch(tail.slice(publish),/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/);
});


test('core public runtime entry points keep stable function identities',()=>{
  for(const name of ['renderMap','selectFeature','selectFeatureMulti','clearSelection','deletePolygon','undo','redo']){
    const declaration=new RegExp(`function\\s+${name}\\s*\\(`,'g');
    assert.equal((app.match(declaration)||[]).length,1,`${name} should have one public function declaration`);
    const patch=new RegExp(`(?<![\\w$.])${name}\\s*=\\s*(?:async\\s*)?function\\b`,'g');
    assert.equal((app.match(patch)||[]).length,0,`${name} must not be monkey-patched later`);
  }
  assert.match(app,/let RENDER_MAP_IMPL=bootstrapRenderMap/);
  assert.match(app,/RENDER_MAP_IMPL=cachedRenderMap;window\.renderMap=renderMap/);
  assert.match(app,/SELECT_FEATURE_IMPL=featureId=>v132SelectSync/);
  assert.match(app,/registerRuntimeTransition\('history',\(\)=>\{invalidateSpatialIndex\(\);invalidateRenderCache\(\);\}\)/);
});

test('circle and point editors use central lifecycle hooks rather than late selection/history monkey patches',()=>{
  for(const token of ['v137BaseSelectFeature','v137BaseSelectFeatureMulti','v137BaseClearSelection','v137BaseUndo','v137BaseRedo','v146BaseSelectFeature','v146BaseSelectFeatureMulti','v146BaseClearSelection','v146BaseUndo','v146BaseRedo'])assert.equal(app.includes(token),false,token);
  assert.match(app,/registerRuntimeTransition\('selection',[\s\S]*CIRCLE_EDIT/);
  assert.match(app,/registerRuntimeTransition\('selection',[\s\S]*POINT_EDIT/);
  assert.match(app,/runRuntimeTransition\('selection',[\s\S]*v132/);
  assert.match(app,/runRuntimeTransition\('selection',[\s\S]*v133/);
  assert.match(app,/runRuntimeTransition\('history',\{action:'undo'\}\)/);
  assert.match(app,/runRuntimeTransition\('history',\{action:'redo'\}\)/);
});

test('authoritative cached editable rendering is engine-neutral at application level',()=>{
  const renderer=block('function buildRuntimeCachedLayer','function invalidateRenderCache');
  assert.match(renderer,/MAP_RUNTIME\.createEditableVectorLayer/);
  assert.match(renderer,/MAP_RUNTIME\.addDisplayLayer/);
  assert.match(renderer,/MAP_RUNTIME\.removeDisplayLayer/);
  assert.match(renderer,/MAP_RUNTIME\.hasDisplayLayer/);
  assert.doesNotMatch(renderer,/\b(?:L|ol)\./);
  assert.doesNotMatch(renderer,/MAP_RUNTIME\.engine/);
  assert.match(renderer,/addCachedLayer\(group\);/);
  assert.match(renderer,/if\(cached\?\.group\)removeCachedLayer\(cached\.group\);/);
  assert.match(renderer,/function buildFocusedRuntimeLayer\(file,features\)/);
  assert.match(renderer,/featureGroup\.clearLayers\(\);MAP_RUNTIME\.removeDisplayLayer\(featureGroup\)/);
});

test('true-circle click testing is shared by both renderers',()=>{
  const circle=block('function parametricCircleHitAtMapPoint','function featureHitAtMapPoint');
  assert.match(circle,/const rendered=mapFeatureJSON\(feature\)\?\.geometry/);
  assert.match(circle,/booleanPointInPolygon/);
  assert.match(circle,/polygonBoundaryHitPixel/);
  assert.doesNotMatch(circle,/MAP_RUNTIME\.engine/);
});



test('selection highlight refresh is engine-neutral and always uses the authoritative renderer',()=>{
  const v132=block('function v132ApplyFeatureStyles','function v132RefreshLayerUi');
  const v133=block('function v133ApplyMapStyles','function v133SyncFeatureRow');
  for(const source of [v132,v133]){
    assert.match(source,/renderMap\(\)/);
    assert.doesNotMatch(source,/MAP_RUNTIME\.engine/);
    assert.doesNotMatch(source,/featureGroup\.(?:clearLayers|eachLayer|addLayer|removeLayer)/);
    assert.doesNotMatch(source,/\b(?:L|ol)\./);
  }
});

test('normal references and GIS services share runtime-owned layer state across both engines',()=>{
  const refs=block('function buildLayer(item,index=0)','window.syncReferenceMapLayers=syncReferenceMapLayers');
  for(const token of ['MAP_RUNTIME.createTileLayer','MAP_RUNTIME.createGeoJsonLayer','MAP_RUNTIME.createStaticImageLayer','MAP_RUNTIME.setDisplayLayerVisible','MAP_RUNTIME.setDisplayLayerOpacity','MAP_RUNTIME.setDisplayLayerZIndex'])assert.match(refs,new RegExp(token.replaceAll('.','\\.')));
  assert.doesNotMatch(refs,/\bol\./);
  // Only the deliberately retained large-reference Leaflet canvas fallback may branch by engine.
  const engineBranches=[...refs.matchAll(/MAP_RUNTIME\.engine/g)];
  assert.equal(engineBranches.length,1);
  assert.match(refs,/MAP_RUNTIME\.engine==='leaflet'&&window\.v98ReferenceNeedsCanvas/);

  const services=block('function gisBuildServiceLayer','function applyGisWorkspaceMode');
  for(const token of ['MAP_RUNTIME.createTileLayer','MAP_RUNTIME.createWmsLayer','MAP_RUNTIME.setDisplayLayerVisible','MAP_RUNTIME.setDisplayLayerOpacity','MAP_RUNTIME.setDisplayLayerZIndex'])assert.match(services,new RegExp(token.replaceAll('.','\\.')));
  assert.doesNotMatch(services,/MAP_RUNTIME\.engine|\b(?:L|ol)\./);
});

test('OpenLayers implementation stays confined to map adapter while Leaflet application debt cannot grow silently',()=>{
  assert.doesNotMatch(app,/\bol\.[A-Za-z_$][\w$]*/);
  const leafletCalls=[...app.matchAll(/\bL\.[A-Za-z_$][\w$]*/g)];
  assert.ok(leafletCalls.length<=16,`direct Leaflet call count grew to ${leafletCalls.length}`);
  assert.equal((app.match(/getNativeMap/g)||[]).length,0,'application code must not escape the map adapter through getNativeMap');
  const leafStart=adapter.indexOf('function createLeafletRuntime'),olStart=adapter.indexOf('function createOpenLayersRuntime'),runtimeStart=adapter.indexOf('function createRuntime(',olStart);
  assert.ok(leafStart>=0&&olStart>leafStart&&runtimeStart>olStart);
  assert.doesNotMatch(adapter.slice(leafStart,olStart),/\bol\./);
  assert.doesNotMatch(adapter.slice(olStart,runtimeStart),/\bL\./);
});
