import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('docs/assets/editpolygon-app.js');
const adapter=read('docs/assets/editpolygon-map-adapter.js');
const olCss=read('docs/assets/editpolygon-openlayers.css');
const html=read('docs/index.html');
const pkg=JSON.parse(read('package.json'));
const RELEASE_KEY='20260809-draw-preview-init-155445';

function fail(message){throw new Error(`v1.55.4.5 runtime/repository audit: ${message}`);}
function requireToken(text,token,where){if(!text.includes(token))fail(`${where} is missing ${token}`);}
function forbidToken(text,token,where){if(text.includes(token))fail(`${where} still contains obsolete token ${token}`);}

if(pkg.version!=='1.55.4.5')fail(`package version is ${pkg.version}, expected 1.55.4.5`);
if(!html.includes(RELEASE_KEY))fail(`index does not use release cache key ${RELEASE_KEY}`);
if(!html.includes('leaflet@1.9.4/dist/leaflet.js'))fail('Leaflet transition/reference engine was removed before the parity gate');
if(!html.includes('cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js'))fail('OpenLayers 10.9.0 is not loaded');

// The synchronized compatibility map is permanently gone. OpenLayers must be
// able to run without creating or reaching into a Leaflet map.
for(const token of ['editpolygon-leaflet-compat','__peGetLeafletMap','__polygonEditorLeafletMap','getLegacyMap','syncLegacy','mapParityBridge']){
  forbidToken(app,token,'editpolygon-app.js');
  forbidToken(adapter,token,'editpolygon-map-adapter.js');
  forbidToken(olCss,token,'editpolygon-openlayers.css');
}

const leafStart=adapter.indexOf('function createLeafletRuntime');
const olStart=adapter.indexOf('function createOpenLayersRuntime');
const runtimeStart=adapter.indexOf('function createRuntime(',olStart);
if(leafStart<0||olStart<leafStart||runtimeStart<olStart)fail('could not isolate both map runtime implementations');
const leafRuntime=adapter.slice(leafStart,olStart),olRuntime=adapter.slice(olStart,runtimeStart);
if(/\bol\./.test(leafRuntime))fail('Leaflet runtime calls OpenLayers');
if(/\bL\./.test(olRuntime))fail('OpenLayers runtime calls Leaflet');
requireToken(leafRuntime,'L.map(','Leaflet runtime');
requireToken(olRuntime,"className='editpolygon-openlayers-dom-overlays'",'OpenLayers runtime');
for(const method of [
  'ensureDisplayPane','createEmptyLayerGroup','createTileLayer','createWmsLayer',
  'createGeoJsonLayer','createStaticImageLayer','createEditableVectorLayer',
  'editableFeatureIdsAtPixel','updateEditableFeatureGeometry',
  'setDisplayLayerOpacity','setDisplayLayerVisible','setDisplayLayerZIndex',
  'createVectorOverlayLayer','createDomOverlay'
]){
  if(!leafRuntime.includes(method)||!olRuntime.includes(method))fail(`map-runtime contract is asymmetric for ${method}`);
}

// Application-level OpenLayers calls are prohibited. Remaining direct Leaflet
// calls are explicit transition debt and are budgeted by audit-bindings.mjs.
if(/\bol\.[A-Za-z_$][\w$]*/.test(app))fail('application code calls OpenLayers directly instead of EditPolygonMap');
for(const direct of [/\bmap\.removeLayer\(/,/\bmap\.addLayer\(/,/\bmap\.hasLayer\(/,/\bmap\.getPane\(/,/\bmap\.createPane\(/]){
  if(direct.test(app))fail(`direct native-map escape hatch remains: ${direct}`);
}
if((app.match(/getNativeMap/g)||[]).length!==0)fail('application code must not escape to a native map object');

// Repeated horizontal world copies are a supported map-view state. Candidate
// culling must be longitude-periodic and pixel overlays must target the world
// copy nearest the active view rather than assuming canonical -180..180 only.
const analysis=read('docs/assets/gis-analysis-core.js');
requireToken(analysis,'function querySpatialIndexWrapped','GIS analysis core');
requireToken(analysis,'querySpatialIndexWrapped,applySelectionMode','GIS analysis core API');
requireToken(app,'function querySpatialIndexWrapped(file,bbox)','application spatial-index bridge');
requireToken(app,'function renderCandidateFeatures(file){const bbox=MAP_RUNTIME.getExtent(.35),ids=new Set(querySpatialIndexWrapped(file,bbox))','authoritative cached renderer');
requireToken(adapter,'function wrapLongitudeNear','map adapter');
requireToken(adapter,'function projectedToContinuousLonLat','OpenLayers continuous inverse projection');
requireToken(adapter,'function pixelToLonLat(value){const p=point(value),c=nativeMap.getCoordinateFromPixel([p.x,p.y]);return c?projectedToContinuousLonLat(c):[0,0];}','OpenLayers pixel inverse');
if(/const lng=Math\.max\(-180,Math\.min\(180,c\[0\]\)\)/.test(adapter))fail('Web Mercator helper clamps continuous longitude back to the canonical world');

// Drawing uses the same continuous-longitude model as repeated-world rendering.
// The old LineString compatibility override discarded this branch and must not
// return. Drawing also must never become click-through because of stale zoom or
// historical Shift-pan overlay state.
requireToken(app,"const continuousKinds=new Set(['polygon','hole','split','buffer','line'])",'authoritative draw coordinate path');
requireToken(app,'if(continuousKinds.has(D.kind))c=unwrapDrawCoordNear(c,branchReference);','authoritative draw coordinate path');
if(/(?<![\w$.])constrainedDrawCoord\s*=\s*function\b/.test(app))fail('late constrainedDrawCoord monkey patch reintroduced');
forbidToken(app,'v116BaseConstrainedDrawCoord','legacy LineString draw compatibility');
requireToken(app,"overlay().classList.remove('shift-pan','zooming')",'draw-session start');
requireToken(app,'function continuousClosedRing','continuous screen-shape ring');
requireToken(app,'function renderDrawRuntimePreview','engine-neutral live draw preview');
requireToken(app,"overlay().addEventListener('pointermove',updateDrawCursorFromPointer,true)",'live draw pointer input');
requireToken(app,'MAP_RUNTIME.createVectorOverlayLayer({zIndex:1750,interactive:false})','live draw runtime preview');
const drawPreviewStateMatches=[...app.matchAll(/\blet DRAW_RUNTIME_PREVIEW_LAYER\s*=\s*null\s*;/g)];
if(drawPreviewStateMatches.length!==1)fail(`live draw preview layer state has ${drawPreviewStateMatches.length} bindings; expected exactly one`);
const drawPreviewStateIndex=drawPreviewStateMatches[0].index;
const renderOverlayIndex=app.indexOf('function renderOverlay(){');
const startupRenderIndex=app.indexOf('initResizers();renderAll();setDirty(false);updateUndo();');
if(drawPreviewStateIndex<0||renderOverlayIndex<0||startupRenderIndex<0)fail('could not verify live draw preview startup ordering');
if(drawPreviewStateIndex>renderOverlayIndex||drawPreviewStateIndex>startupRenderIndex)fail('live draw preview layer state is initialized after renderOverlay/startup render and can enter the temporal dead zone');
requireToken(app,"if(D.active){\n    overlay().classList.remove('zooming');\n    scheduleOverlayRender();",'draw zoom lifecycle');
if(/e\.key==='Shift'\)updateShiftPanState/.test(app))fail('legacy Shift-pan key binding makes Shift-click drawing non-interactive');

// The current editable renderer must be one engine-neutral implementation.
const rendererStart=app.indexOf('function buildRuntimeCachedLayer');
const rendererEnd=app.indexOf('function invalidateRenderCache',rendererStart);
if(rendererStart<0||rendererEnd<rendererStart)fail('could not isolate authoritative cached renderer');
const renderer=app.slice(rendererStart,rendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer'])requireToken(renderer,token,'authoritative cached renderer');
if(/\b(?:L|ol)\./.test(renderer))fail('authoritative cached renderer contains engine-specific calls');
if(/MAP_RUNTIME\.engine/.test(renderer))fail('authoritative cached renderer branches by engine');
requireToken(renderer,"if(file.tableOnly||isFileSleeping(file))continue",'authoritative cached renderer');
requireToken(renderer,'addCachedLayer(group);if(cached)removeCachedLayer(cached.group);','authoritative cached renderer');
requireToken(renderer,'featureGroup.clearLayers();MAP_RUNTIME.removeDisplayLayer(featureGroup);','authoritative cached renderer handoff');
requireToken(app,'RENDER_MAP_IMPL=cachedRenderMap;window.renderMap=renderMap;','application');
for(const stable of ['function renderMap(){return RENDER_MAP_IMPL.apply(this,arguments)}','function selectFeature(fid){return SELECT_FEATURE_IMPL(fid)}','function selectFeatureMulti(fid,additive){return SELECT_FEATURE_MULTI_IMPL(fid,additive)}','function clearSelection(){return CLEAR_SELECTION_IMPL()}'])requireToken(app,stable,'stable public runtime identity');

// Selection/highlight refresh also uses the authoritative renderer on both engines.
for(const token of ['function v132ApplyFeatureStyles(featureIds){','function v133ApplyMapStyles(featureIds){'])requireToken(app,token,'selection integration');
const v132=app.slice(app.indexOf('function v132ApplyFeatureStyles'),app.indexOf('function v132RefreshLayerUi'));
const v133=app.slice(app.indexOf('function v133ApplyMapStyles'),app.indexOf('function v133SyncFeatureRow'));
if(!v132.includes('renderMap()')||!v133.includes('renderMap()'))fail('selection styling no longer refreshes the authoritative renderer');
if(/MAP_RUNTIME\.engine/.test(v132+v133))fail('selection styling diverges by engine');

// No future append-only compatibility patch may appear after this boundary.
const authority='/* v1.55.4 — runtime authority boundary.';
const authorityIndex=app.indexOf(authority);
if(authorityIndex<0)fail('runtime authority boundary is missing');
const authorityTail=app.slice(authorityIndex);
requireToken(authorityTail,'renderAll();','runtime authority handoff');
requireToken(authorityTail,"version:'1.55.4'",'runtime authority snapshot');
requireToken(authorityTail,'window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY','runtime authority snapshot');
const afterPublish=app.slice(app.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY',authorityIndex));
if(/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/.test(afterPublish))fail('function patch appears after runtime authority boundary');

// Root documentation is durable rather than accumulating one-off release notes.
for(const required of ['README.md','ARCHITECTURE.md','CHANGELOG.md','QUALITY_BASELINE.md','RELEASE_MANIFEST.md']){
  if(!fs.existsSync(required))fail(`missing current repository document ${required}`);
}
const staleRoot=fs.readdirSync('.').filter(name=>
  /^GIS_.*(?:RELEASE_NOTES|HOTFIX|FIX_155|NOTES)\.md$/i.test(name) ||
  /^V\d+(?:\.\d+)+.*\.md$/i.test(name) ||
  name==='CRS_VALIDATION.md'
);
if(staleRoot.length)fail(`version-specific/stale root documentation remains: ${staleRoot.join(', ')}`);

function localRefs(file){
  const source=read(file),refs=[];
  for(const match of source.matchAll(/(?:href|src)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)){
    const ref=match[1];if(!ref||/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(ref))continue;refs.push(ref);
  }
  return refs;
}
const deployText=[];
for(const name of fs.readdirSync('docs',{recursive:true})){
  const full=path.join('docs',name);if(!fs.existsSync(full)||!fs.statSync(full).isFile())continue;
  if(/\.(?:html|js|css|xml|txt|md|webmanifest)$/i.test(name)||['_headers','_redirects','robots.txt','sitemap.xml'].includes(path.basename(name))){try{deployText.push([full,read(full)]);}catch(_){ }}
}
function referencedByDeployable(file){const base=path.basename(file);return deployText.some(([source,text])=>source!==file&&text.includes(base));}
for(const name of fs.readdirSync('docs/assets')){
  const full=path.join('docs/assets',name);if(!fs.statSync(full).isFile())continue;if(!referencedByDeployable(full))fail(`unreferenced top-level deployment asset remains: ${full}`);
}
for(const name of fs.readdirSync('docs/assets/guides')){
  const full=path.join('docs/assets/guides',name);if(fs.statSync(full).isFile()&&!referencedByDeployable(full))fail(`unreferenced guide asset remains: ${full}`);
}
for(const file of fs.readdirSync('docs',{recursive:true}).filter(name=>name.endsWith('.html'))){
  const full=path.join('docs',file),base=path.dirname(full);
  for(const ref of localRefs(full)){
    const resolved=path.normalize(ref.startsWith('/')?path.join('docs',ref.slice(1)):path.join(base,ref));
    if(!resolved.startsWith('docs'+path.sep)&&resolved!=='docs')continue;
    let exists=fs.existsSync(resolved);if(!exists&&ref.endsWith('/'))exists=fs.existsSync(path.join(resolved,'index.html'));
    if(!exists)fail(`broken local HTML reference in ${full}: ${ref}`);
  }
}
for(const name of fs.readdirSync('.', {recursive:true})){
  if(name.includes('__pycache__')||name.endsWith('.pyc'))fail(`packaging/runtime junk is present: ${name}`);
}

console.log('v1.55.4.5 runtime/repository audit passed. OpenLayers is adapter-confined; the final editable renderer and selection refresh are engine-neutral; deployment assets are clean.');
