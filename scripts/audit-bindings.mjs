import fs from 'node:fs';

const app=fs.readFileSync('docs/assets/editpolygon-app.js','utf8');
const adapter=fs.readFileSync('docs/assets/editpolygon-map-adapter.js','utf8');

function fail(message){throw new Error(`v1.55.4 binding/architecture audit: ${message}`);}
function lineAt(index){return app.slice(0,index).split('\n').length;}

// This deliberately audits declarations and historical `name = function` patches.
// It is not a JavaScript parser; it is a stable source-order tripwire for the
// monolithic legacy application until the remaining historical sections are
// moved into modules after OpenLayers becomes the sole renderer.
const bindingPattern=/(?:^|[;\n{}]\s*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?<![\w$.])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(/gm;
const bindings=new Map();
for(const match of app.matchAll(bindingPattern)){
  const name=match[1]||match[2];
  if(!bindings.has(name))bindings.set(name,[]);
  bindings.get(name).push(lineAt(match.index));
}
const duplicateNames=[...bindings].filter(([,sites])=>sites.length>1);
const extraBindings=[...bindings.values()].reduce((sum,sites)=>sum+Math.max(0,sites.length-1),0);

// v1.55.4 establishes a no-growth ceiling for historical wrapper debt. Future
// releases should lower these numbers as sections are modularised, never raise
// them casually by appending another wrapper.
if(duplicateNames.length>199)fail(`duplicate function-binding names grew to ${duplicateNames.length} (baseline ceiling 199)`);
if(extraBindings>373)fail(`extra historical function bindings grew to ${extraBindings} (baseline ceiling 373)`);

const bindingCeilings={
  renderMap:1,
  selectFeature:1,
  selectFeatureMulti:1,
  clearSelection:1,
  deletePolygon:1,
  undo:1,
  redo:1,
  renderAll:10,
  renderSelected:15,
  renderSidebar:13,
  updateButtons:7,
  updateStatus:5,
  showFileLayerMenu:8,
  showFeatureLayerMenu:7
};
for(const [name,max] of Object.entries(bindingCeilings)){
  const count=bindings.get(name)?.length||0;
  if(count>max)fail(`${name} has ${count} declaration/reassignment sites; v1.55.4 ceiling is ${max}`);
}

for(const name of ['featuresAtLatLng','featureHitAtMapPoint','parametricCircleHitAtMapPoint','applyMapFeatureSelection','selectFromMapClick']){
  const sites=bindings.get(name)||[];
  if(sites.length!==1)fail(`${name} must have exactly one authoritative function binding; found ${sites.length} at ${sites.join(', ')||'none'}`);
}

// OpenLayers implementation details belong in the adapter only. Leaflet direct
// calls remain transition debt for the Leaflet reference engine, but v1.55.4
// freezes that debt so it cannot spread back into application code.
if(/\bol\.[A-Za-z_$][\w$]*/.test(app))fail('application code directly calls OpenLayers; use EditPolygonMap instead');
const leafletCalls=[...app.matchAll(/\bL\.[A-Za-z_$][\w$]*/g)];
if(leafletCalls.length>16)fail(`direct Leaflet calls in application grew to ${leafletCalls.length}; v1.55.4 ceiling is 16`);
const allowedLeafletBlocks=[
  ['measurement label bootstrap','function makeMeasureLabelIcon','function clearMeasurementDomOverlays'],
  ['bootstrap Leaflet renderer','function bootstrapRenderMap(){','function renderAll(){recomputeAllFeatures'],
  ['large-reference Leaflet canvas','function v98CanvasLayer(item)','window.v98ReferenceNeedsCanvas=v98RefNeedsCanvas'],
  ['v1.30 Leaflet transition renderer','function v130BulkVectorRenderer()','function v130BringLayerForward']
].map(([label,startToken,endToken])=>{
  const start=app.indexOf(startToken),end=app.indexOf(endToken,start);
  if(start<0||end<start)fail(`could not isolate allowed Leaflet debt block: ${label}`);
  return {label,start,end};
});
for(const call of leafletCalls){
  if(!allowedLeafletBlocks.some(block=>call.index>=block.start&&call.index<block.end))fail(`direct Leaflet call escaped the documented transition-debt blocks at line ${lineAt(call.index)}: ${call[0]}`);
}

const engineMentions=[...app.matchAll(/MAP_RUNTIME\.engine/g)];
if(engineMentions.length>6)fail(`application map-engine branches/metadata references grew to ${engineMentions.length}; v1.55.4 ceiling is 6`);
if((app.match(/getNativeMap/g)||[]).length!==0)fail('application code must not escape to a native map object');

const finalRendererStart=app.indexOf('function buildRuntimeCachedLayer');
const finalRendererEnd=app.indexOf('function invalidateRenderCache',finalRendererStart);
if(finalRendererStart<0||finalRendererEnd<0)fail('could not isolate authoritative cached renderer');
const finalRenderer=app.slice(finalRendererStart,finalRendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer']){
  if(!finalRenderer.includes(token))fail(`authoritative cached renderer is missing ${token}`);
}
if(/\b(?:L|ol)\./.test(finalRenderer))fail('authoritative cached renderer contains engine-specific map calls');
if(finalRenderer.includes("MAP_RUNTIME.engine==='openlayers'"))fail('authoritative cached renderer still branches by map engine');
if(!app.includes('RENDER_MAP_IMPL=cachedRenderMap;window.renderMap=renderMap;'))fail('final cached renderer is not installed through the stable renderMap delegate');
for(const forbidden of [/\brenderMap\s*=\s*(?:async\s*)?function\b/,/\bselectFeature\s*=\s*(?:async\s*)?function\b/,/\bselectFeatureMulti\s*=\s*(?:async\s*)?function\b/,/\bclearSelection\s*=\s*(?:async\s*)?function\b/,/\bdeletePolygon\s*=\s*(?:async\s*)?function\b/,/\bundo\s*=\s*(?:async\s*)?function\b/,/\bredo\s*=\s*(?:async\s*)?function\b/]){
  if(forbidden.test(app))fail(`critical public runtime function is reassigned instead of using a stable identity: ${forbidden}`);
}
for(const required of ['let RENDER_MAP_IMPL=bootstrapRenderMap','SELECT_FEATURE_IMPL=baseSelectFeature','SELECT_FEATURE_MULTI_IMPL=baseSelectFeatureMulti','CLEAR_SELECTION_IMPL=baseClearSelection','registerRuntimeTransition(\'history\',()=>{invalidateSpatialIndex();invalidateRenderCache();})']){
  if(!app.includes(required))fail(`stable runtime delegation/lifecycle hook is missing: ${required}`);
}

const circleStart=app.indexOf('function parametricCircleHitAtMapPoint');
const circleEnd=app.indexOf('function featureHitAtMapPoint',circleStart);
const circleBlock=app.slice(circleStart,circleEnd);
if(!circleBlock.includes('const rendered=mapFeatureJSON(feature)?.geometry'))fail('true-circle click selection no longer follows the exact projection-aware map display geometry');
if(/MAP_RUNTIME\.engine/.test(circleBlock))fail('true-circle click selection diverges by map engine again');

for(const stale of ['v137BaseSelectFeature','v137BaseSelectFeatureMulti','v137BaseClearSelection','v137BaseUndo','v137BaseRedo','v146BaseSelectFeature','v146BaseSelectFeatureMulti','v146BaseClearSelection','v146BaseUndo','v146BaseRedo']){
  if(app.includes(stale))fail(`obsolete edit-mode monkey patch remains: ${stale}`);
}
for(const required of ["registerRuntimeTransition('selection'","registerRuntimeTransition('history'","registerRuntimeTransition('delete'","runRuntimeTransition('selection'","runRuntimeTransition('history'","runRuntimeTransition('delete'"]){
  if(!app.includes(required))fail(`central runtime lifecycle is missing ${required}`);
}

const authorityMarker='/* v1.55.4 — runtime authority boundary.';
const authority=app.indexOf(authorityMarker);
if(authority<0)fail('runtime authority boundary is missing');
const authorityTail=app.slice(authority);
if(!authorityTail.includes('renderAll();'))fail('runtime authority boundary no longer performs final renderer handoff');
if(!authorityTail.includes("version:'1.55.4'"))fail('runtime authority snapshot has the wrong version');
if(!authorityTail.includes('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY'))fail('runtime authority snapshot is not published');
// No feature-patch code is allowed after the boundary. The only executable
// statements are the authority snapshot and the enclosing-IIFE close.
const afterPublish=app.slice(app.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY',authority));
if(/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/.test(afterPublish))fail('new function patch appears after runtime authority boundary');

const leafStart=adapter.indexOf('function createLeafletRuntime');
const olStart=adapter.indexOf('function createOpenLayersRuntime');
const runtimeStart=adapter.indexOf('function createRuntime(',olStart);
if(leafStart<0||olStart<leafStart||runtimeStart<olStart)fail('could not isolate map runtime implementations');
const leafBlock=adapter.slice(leafStart,olStart),olBlock=adapter.slice(olStart,runtimeStart);
if(/\bol\./.test(leafBlock))fail('Leaflet adapter runtime calls OpenLayers');
if(/\bL\./.test(olBlock))fail('OpenLayers adapter runtime calls Leaflet');
for(const method of ['ensureDisplayPane','createEditableVectorLayer','editableFeatureIdsAtPixel','updateEditableFeatureGeometry','createGeoJsonLayer','createStaticImageLayer','createVectorOverlayLayer','createDomOverlay']){
  if(!leafBlock.includes(method)||!olBlock.includes(method))fail(`map runtime contract is asymmetric for ${method}`);
}

const top=duplicateNames.sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([name,sites])=>`${name}:${sites.length}`).join(', ');
console.log(`v1.55.4 binding/architecture audit passed: ${bindings.size} named bindings, ${duplicateNames.length} duplicate names, ${extraBindings} extra sites, ${leafletCalls.length} transitional Leaflet calls in documented blocks, ${engineMentions.length} engine references, 0 native-map escapes. Highest wrapper chains: ${top}.`);
