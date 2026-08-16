import fs from 'node:fs';

const app=fs.readFileSync('docs/assets/editpolygon-app.js','utf8');
const adapter=fs.readFileSync('docs/assets/editpolygon-map-adapter.js','utf8');

function fail(message){throw new Error(`v1.56.1 binding/architecture audit: ${message}`);}
function lineAt(index){return app.slice(0,index).split('\n').length;}

// Source-order tripwire for the remaining historical application file. New
// work should lower these ceilings by modularising authority, never append new
// wrappers or late rebindings.
const bindingPattern=/(?:^|[;\n{}]\s*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?<![\w$.])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\(/gm;
const bindings=new Map();
for(const match of app.matchAll(bindingPattern)){
  const name=match[1]||match[2];
  if(!bindings.has(name))bindings.set(name,[]);
  bindings.get(name).push(lineAt(match.index));
}
const duplicateNames=[...bindings].filter(([,sites])=>sites.length>1);
const extraBindings=[...bindings.values()].reduce((sum,sites)=>sum+Math.max(0,sites.length-1),0);
if(duplicateNames.length>196)fail(`duplicate function-binding names grew to ${duplicateNames.length} (v1.56.1 ceiling 196)`);
if(extraBindings>369)fail(`extra historical function bindings grew to ${extraBindings} (v1.56.1 ceiling 369)`);

const bindingCeilings={
  renderMap:1,selectFeature:1,selectFeatureMulti:1,clearSelection:1,deletePolygon:1,undo:1,redo:1,
  renderAll:10,renderSelected:15,renderSidebar:13,updateButtons:7,updateStatus:5,
  showFileLayerMenu:8,showFeatureLayerMenu:7
};
for(const [name,max] of Object.entries(bindingCeilings)){
  const count=bindings.get(name)?.length||0;
  if(count>max)fail(`${name} has ${count} declaration/reassignment sites; ceiling is ${max}`);
}
for(const name of ['featuresAtLatLng','featureHitAtMapPoint','parametricCircleHitAtMapPoint','applyMapFeatureSelection','selectFromMapClick']){
  const sites=bindings.get(name)||[];
  if(sites.length!==1)fail(`${name} must have exactly one authoritative binding; found ${sites.length} at ${sites.join(', ')||'none'}`);
}

// v1.56.1 keeps the native OpenLayers implementation adapter-owned. The
// application has no native-map escape and no engine-specific branch.
const directOl=[...app.matchAll(/\bol\.[A-Za-z_$][\w$]*/g)];
const retiredNamespace=new RegExp('\\b'+'L'+'\\.[A-Za-z_$][\\w$]*','g');
const directRetired=[...app.matchAll(retiredNamespace)];
if(directOl.length)fail(`application directly calls OpenLayers at line ${lineAt(directOl[0].index)}: ${directOl[0][0]}`);
if(directRetired.length)fail(`application contains ${directRetired.length} retired native-map call(s)`);
if((app.match(/getNativeMap/g)||[]).length!==0)fail('application code must not escape to a native map object');

const engineMentions=[...app.matchAll(/MAP_RUNTIME\.engine/g)];
if(engineMentions.length)fail(`application contains ${engineMentions.length} engine-specific metadata reference(s)`);

const finalRendererStart=app.indexOf('function buildRuntimeCachedLayer');
const finalRendererEnd=app.indexOf('function invalidateRenderCache',finalRendererStart);
if(finalRendererStart<0||finalRendererEnd<0)fail('could not isolate authoritative cached renderer');
const finalRenderer=app.slice(finalRendererStart,finalRendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer']){
  if(!finalRenderer.includes(token))fail(`authoritative cached renderer is missing ${token}`);
}
if(/\b(?:L|ol)\./.test(finalRenderer))fail('authoritative cached renderer contains native-engine calls');
if(/MAP_RUNTIME\.engine/.test(finalRenderer))fail('authoritative cached renderer branches by map engine');
if(!finalRenderer.includes('function buildFocusedRuntimeLayer(file,features)'))fail('focused precision overlay is missing from authoritative renderer');
if(!app.includes('RENDER_MAP_IMPL=cachedRenderMap;window.renderMap=renderMap;'))fail('final renderer is not installed through the stable renderMap delegate');

for(const forbidden of [/\brenderMap\s*=\s*(?:async\s*)?function\b/,/\bselectFeature\s*=\s*(?:async\s*)?function\b/,/\bselectFeatureMulti\s*=\s*(?:async\s*)?function\b/,/\bclearSelection\s*=\s*(?:async\s*)?function\b/,/\bdeletePolygon\s*=\s*(?:async\s*)?function\b/,/\bundo\s*=\s*(?:async\s*)?function\b/,/\bredo\s*=\s*(?:async\s*)?function\b/,/\bVStop\s*=\s*(?:async\s*)?function\b/,/\bVStop\s*=\s*\(function\b/]){
  if(forbidden.test(app))fail(`critical public runtime function is reassigned: ${forbidden}`);
}
for(const required of ['let RENDER_MAP_IMPL=()=>{};','SELECT_FEATURE_IMPL=baseSelectFeature','SELECT_FEATURE_MULTI_IMPL=baseSelectFeatureMulti','CLEAR_SELECTION_IMPL=baseClearSelection','function VStop(silent=false,options={})',"registerRuntimeTransition('history',()=>{invalidateSpatialIndex();invalidateRenderCache();})"]){
  if(!app.includes(required))fail(`stable runtime delegation/lifecycle hook is missing: ${required}`);
}

const circleStart=app.indexOf('function parametricCircleHitAtMapPoint');
const circleEnd=app.indexOf('function featureHitAtMapPoint',circleStart);
const circleBlock=app.slice(circleStart,circleEnd);
if(!circleBlock.includes('const rendered=mapFeatureJSON(feature)?.geometry'))fail('true-circle click selection no longer follows projection-aware display geometry');
if(/MAP_RUNTIME\.engine/.test(circleBlock))fail('true-circle click selection diverges by engine');

for(const stale of ['v137BaseSelectFeature','v137BaseSelectFeatureMulti','v137BaseClearSelection','v137BaseUndo','v137BaseRedo','v146BaseSelectFeature','v146BaseSelectFeatureMulti','v146BaseClearSelection','v146BaseUndo','v146BaseRedo']){
  if(app.includes(stale))fail(`obsolete edit-mode monkey patch remains: ${stale}`);
}
for(const required of ["registerRuntimeTransition('selection'","registerRuntimeTransition('history'","registerRuntimeTransition('delete'","runRuntimeTransition('selection'","runRuntimeTransition('history'","runRuntimeTransition('delete'"]){
  if(!app.includes(required))fail(`central runtime lifecycle is missing ${required}`);
}

const authorityMarker='/* v1.56.1 — runtime authority boundary.';
const authority=app.indexOf(authorityMarker);
if(authority<0)fail('runtime authority boundary is missing');
const authorityTail=app.slice(authority);
if(!authorityTail.includes('renderAll();'))fail('runtime authority boundary no longer performs final renderer handoff');
if(!authorityTail.includes("version:'1.56.1'"))fail('runtime authority snapshot has the wrong version');
if(!authorityTail.includes('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY'))fail('runtime authority snapshot is not published');
const afterPublish=app.slice(app.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY',authority));
if(/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/.test(afterPublish))fail('new function patch appears after runtime authority boundary');

const runtimeStart=adapter.indexOf('function createRuntime(');
const runtimeEnd=adapter.indexOf('global.EditPolygonMapAdapter',runtimeStart);
if(runtimeStart<0||runtimeEnd<runtimeStart)fail('could not isolate OpenLayers runtime implementation');
const olBlock=adapter.slice(runtimeStart,runtimeEnd);
for(const method of ['createEditableVectorLayer','editableFeatureIdsAtPixel','updateEditableFeatureGeometry','createGeoJsonLayer','createStaticImageLayer','createVectorOverlayLayer','createDomOverlay']){
  if(!olBlock.includes(method))fail(`OpenLayers runtime contract is missing ${method}`);
}
if(!olBlock.includes('ol.'))fail('OpenLayers implementation does not own native calls');
if(retiredNamespace.test(adapter))fail('retired native namespace remains in map adapter');
const retiredFactory=['create','Lea','fletRuntime'].join('');
if(adapter.includes(retiredFactory))fail('retired runtime factory remains in map adapter');
for(const stale of ['requestedEngine','fallbackReason','createOpenLayersRuntime','getNativeMap','nativePanLooksActive','recoverNativePan','ensureDisplayPane','prefersPersistentEditableVectorSource','supportsFocusedEditableOverlay','__editpolygonEngine'])if(adapter.includes(stale))fail(`retired runtime state remains in map adapter: ${stale}`);

const top=[...duplicateNames].sort((a,b)=>b[1].length-a[1].length).slice(0,8).map(([name,sites])=>`${name}:${sites.length}`).join(', ');
console.log(`v1.56.1 binding/architecture audit passed: ${bindings.size} named bindings, ${duplicateNames.length} duplicate names, ${extraBindings} extra sites, 0 application engine branches, 0 application native-map calls, 0 native-map escapes. Highest wrapper chains: ${top}.`);
