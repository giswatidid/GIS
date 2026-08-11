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

test('v1.56.0.1 publishes one final runtime-authority snapshot at the end of the application scope',()=>{
  const marker='/* v1.56.0.1 — runtime authority boundary.';
  const start=app.indexOf(marker);assert.ok(start>=0);
  const tail=app.slice(start);
  assert.match(tail,/version:'1\.56\.0\.1'/);
  assert.match(tail,/renderAll\(\);[\s\S]*window\.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY/);
  assert.match(tail,/renderMap,renderAll,renderSidebar,renderSelected,renderOverlay/);
  assert.match(tail,/featuresAtLatLng,featureHitAtMapPoint,parametricCircleHitAtMapPoint/);
  const publish=tail.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY');
  assert.doesNotMatch(tail.slice(publish),/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/);
});


test('retired pan-recovery drag hook cannot abort startup before Advanced GIS installs',()=>{
  assert.doesNotMatch(app,/customPointerDragActive/);
  const phase3=app.indexOf("window.refreshPhase3Ui=function");
  const gisInstall=app.indexOf('window.EditPolygonGIS={');
  const authority=app.indexOf('/* v1.56.0.1 — runtime authority boundary.');
  assert.ok(phase3>=0&&gisInstall>phase3&&authority>gisInstall,{phase3,gisInstall,authority});
  assert.match(app.slice(gisInstall,authority),/applyGisWorkspaceMode/);
});

test('core public runtime entry points keep stable function identities',()=>{
  for(const name of ['renderMap','selectFeature','selectFeatureMulti','clearSelection','deletePolygon','undo','redo']){
    const declaration=new RegExp(`function\\s+${name}\\s*\\(`,'g');
    assert.equal((app.match(declaration)||[]).length,1,`${name} should have one public function declaration`);
    const patch=new RegExp(`(?<![\\w$.])${name}\\s*=\\s*(?:async\\s*)?function\\b`,'g');
    assert.equal((app.match(patch)||[]).length,0,`${name} must not be monkey-patched later`);
  }
  assert.match(app,/let RENDER_MAP_IMPL=\(\)=>\{\};/);
  assert.match(app,/RENDER_MAP_IMPL=cachedRenderMap;window\.renderMap=renderMap/);
  assert.match(app,/SELECT_FEATURE_IMPL=featureId=>v132SelectSync/);
  assert.match(app,/registerRuntimeTransition\('history',\(\)=>\{invalidateSpatialIndex\(\);invalidateRenderCache\(\);\}\)/);
});

test('circle and point editors use central lifecycle hooks rather than late selection/history patches',()=>{
  for(const token of ['v137BaseSelectFeature','v137BaseSelectFeatureMulti','v137BaseClearSelection','v137BaseUndo','v137BaseRedo','v146BaseSelectFeature','v146BaseSelectFeatureMulti','v146BaseClearSelection','v146BaseUndo','v146BaseRedo'])assert.equal(app.includes(token),false,token);
  assert.match(app,/registerRuntimeTransition\('selection',[\s\S]*CIRCLE_EDIT/);
  assert.match(app,/registerRuntimeTransition\('selection',[\s\S]*POINT_EDIT/);
  assert.match(app,/runRuntimeTransition\('history',\{action:'undo'\}\)/);
  assert.match(app,/runRuntimeTransition\('history',\{action:'redo'\}\)/);
});

test('authoritative cached editable rendering stays behind the map contract',()=>{
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
  assert.doesNotMatch(renderer,/featureGroup/);
});

test('true-circle click testing is shared with the authoritative rendered geometry',()=>{
  const circle=block('function parametricCircleHitAtMapPoint','function featureHitAtMapPoint');
  assert.match(circle,/const rendered=mapFeatureJSON\(feature\)\?\.geometry/);
  assert.match(circle,/booleanPointInPolygon/);
  assert.match(circle,/polygonBoundaryHitPixel/);
  assert.doesNotMatch(circle,/MAP_RUNTIME\.engine/);
});

test('selection highlight refresh always uses the authoritative renderer',()=>{
  const v132=block('function v132ApplyFeatureStyles','function v132RefreshLayerUi');
  const v133=block('function v133ApplyMapStyles','function v133SyncFeatureRow');
  for(const source of [v132,v133]){
    assert.match(source,/renderMap\(\)/);
    assert.doesNotMatch(source,/MAP_RUNTIME\.engine/);
    assert.doesNotMatch(source,/\b(?:L|ol)\./);
  }
});

test('reference overlays and GIS services share runtime-owned layer state',()=>{
  const refs=block('function buildLayer(item,index=0)','window.syncReferenceMapLayers=syncReferenceMapLayers');
  for(const token of ['MAP_RUNTIME.createTileLayer','MAP_RUNTIME.createGeoJsonLayer','MAP_RUNTIME.createStaticImageLayer','MAP_RUNTIME.setDisplayLayerVisible','MAP_RUNTIME.setDisplayLayerOpacity','MAP_RUNTIME.setDisplayLayerZIndex'])assert.match(refs,new RegExp(token.replaceAll('.','\\.')));
  assert.doesNotMatch(refs,/MAP_RUNTIME\.engine|\bol\./);
  const services=block('function gisBuildServiceLayer','function applyGisWorkspaceMode');
  for(const token of ['MAP_RUNTIME.createTileLayer','MAP_RUNTIME.createWmsLayer','MAP_RUNTIME.setDisplayLayerVisible','MAP_RUNTIME.setDisplayLayerOpacity','MAP_RUNTIME.setDisplayLayerZIndex'])assert.match(services,new RegExp(token.replaceAll('.','\\.')));
  assert.doesNotMatch(services,/MAP_RUNTIME\.engine|\bol\./);
});

test('native OpenLayers implementation stays confined to the adapter and no retired runtime remains',()=>{
  assert.doesNotMatch(app,/\bol\.[A-Za-z_$][\w$]*/);
  assert.equal((app.match(/getNativeMap/g)||[]).length,0,'application code must not escape the map adapter through getNativeMap');
  assert.doesNotMatch(adapter,/requestedEngine|fallbackReason|createLeaf.*Runtime/i);
  const runtimeStart=adapter.indexOf('function createRuntime('),runtimeEnd=adapter.indexOf('global.EditPolygonMapAdapter',runtimeStart);
  assert.ok(runtimeStart>=0&&runtimeEnd>runtimeStart);
  assert.match(adapter.slice(runtimeStart,runtimeEnd),/\bol\./);
  assert.doesNotMatch(adapter,/createOpenLayersRuntime|getNativeMap/);
});
