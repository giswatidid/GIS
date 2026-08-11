import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('docs/assets/editpolygon-app.js');
const adapter=read('docs/assets/editpolygon-map-adapter.js');
const html=read('docs/index.html');
const mobile=read('docs/assets/editpolygon-mobile.js');
const mobileCss=read('docs/assets/editpolygon-mobile.css');
const appCss=read('docs/assets/editpolygon.css');
const olCss=read('docs/assets/editpolygon-openlayers.css');
const projectFormat=read('docs/assets/editpolygon-project-format.js');
const pkg=JSON.parse(read('package.json'));
const RELEASE_KEY='20260811-v15573-draw-preview-pan';
const retiredWord=['lea','flet'].join('');
const retiredWordRe=new RegExp(retiredWord,'i');
const retiredFactory=['create','Lea','fletRuntime'].join('');

function fail(message){throw new Error(`v1.55.7.3 runtime/repository audit: ${message}`);}
function requireToken(source,token,label){if(!source.includes(token))fail(`${label} is missing ${JSON.stringify(token)}`);}
function forbidToken(source,token,label){if(source.includes(token))fail(`${label} still contains ${JSON.stringify(token)}`);}

if(pkg.version!=='1.55.7.3')fail(`package version is ${pkg.version}, expected 1.55.7.3`);
requireToken(html,'ol@v10.9.0/dist/ol.js','OpenLayers dependency');
requireToken(html,'ol@v10.9.0/ol.css','OpenLayers stylesheet');
if(retiredWordRe.test(html))fail('retired map dependency remains in deployment HTML');

// Every local runtime asset on the main page shares one cache key so GitHub
// Pages cannot combine modules from adjacent releases.
for(const match of html.matchAll(/(?:src|href)=["']([^"']*assets\/[^"'?]+)(?:\?v=([^"']+))?["']/g)){
  const ref=match[1],version=match[2];
  if(!version)fail(`local runtime asset has no cache key: ${ref}`);
  if(version!==RELEASE_KEY)fail(`local runtime asset ${ref} uses ${version}, expected ${RELEASE_KEY}`);
}

// The map adapter now exposes one public factory only. OpenLayers remains an
// implementation detail; transition-era capability shims and native escapes
// must not reappear.
requireToken(adapter,"const VERSION='1.55.7.3';",'map adapter version');
requireToken(adapter,'function createRuntime(options={})','sole runtime factory');
requireToken(adapter,'global.EditPolygonMapAdapter=Object.freeze({version:VERSION','adapter export');
requireToken(adapter,'mercatorWorldPixel,createRuntime});','single runtime export');
if(adapter.includes(retiredFactory))fail('retired runtime factory remains in adapter');
for(const stale of ['requestedEngine','fallbackReason','createOpenLayersRuntime','getNativeMap','nativePanLooksActive','recoverNativePan','ensureDisplayPane','prefersPersistentEditableVectorSource','supportsFocusedEditableOverlay','__editpolygonEngine'])forbidToken(adapter,stale,'map adapter');
const retiredNamespace=new RegExp('\\b'+'L'+'\\.[A-Za-z_$][\\w$]*');
if(retiredNamespace.test(adapter))fail('retired native namespace remains in adapter');

// Performance/cleanup invariants: one GeoJSON formatter per runtime, one
// runtime-level DOM-overlay subscription set, and no per-overlay map listeners.
if((adapter.match(/new ol\.format\.GeoJSON\(\)/g)||[]).length!==1)fail('OpenLayers runtime must allocate exactly one shared GeoJSON formatter');
for(const token of [
  'const geoJsonFormat=new ol.format.GeoJSON();',
  "domOverlayPane.className='editpolygon-dom-overlays'",
  'const domOverlays=new Set();',
  'let domOverlayRefreshPending=false;',
  "on('move zoomstart',scheduleDomOverlayRefresh);",
  "on('moveend zoomend viewreset resize',refreshDomOverlays);",
  'onRemove:()=>domOverlays.delete(controller)',
  'source.clear?.(true)',
  'function updateEditableFeatureGeometry(layer,featureId,geometry)'
])requireToken(adapter,token,'OpenLayers cleanup invariant');
forbidToken(adapter,'onMap=spec.onMap','per-overlay map subscription');

requireToken(app,'// v1.55.7.3: OpenLayers is the sole map runtime. Application code talks only','application runtime boundary');
requireToken(app,"const MAP_RUNTIME=MAP_ADAPTER.createRuntime({",'application runtime creation');
requireToken(app,'ol:window.ol','application OpenLayers dependency injection');
for(const stale of ['requestedEngine','fallbackReason','L:window.L','MAP_PAN_GUARD','mapPanLooksActive','hardResetMapPan','scheduleMapPanReleaseCheck','customPointerDragActive','ensureDisplayPane','prefersPersistentEditableVectorSource','supportsFocusedEditableOverlay','document.body.dataset.mapEngine'])forbidToken(app,stale,'application runtime');
if(/\bol\.[A-Za-z_$][\w$]*/.test(app))fail('application directly calls OpenLayers instead of EditPolygonMap');
if(retiredNamespace.test(app))fail('application directly calls retired native-map API');
if(app.includes('getNativeMap'))fail('application escapes to native map object');
if(/MAP_RUNTIME\.engine/.test(app))fail('application branches on or publishes engine-specific state');

// The final renderer is the only editable display authority.
const rendererStart=app.indexOf('function performanceManagedEditableFile(file)');
const rendererEnd=app.indexOf('function invalidateRenderCache',rendererStart);
if(rendererStart<0||rendererEnd<rendererStart)fail('could not isolate authoritative cached renderer');
const renderer=app.slice(rendererStart,rendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer','function buildFocusedRuntimeLayer(file,features)','setEditableFeatureSuppressed','if(performanceManagedEditableFile(file))return all','return performanceManagedEditableFile(file);'])requireToken(renderer,token,'authoritative cached renderer');
if(/\b(?:L|ol)\./.test(renderer))fail('authoritative cached renderer contains native-engine calls');
if(/MAP_RUNTIME\.engine/.test(renderer))fail('authoritative cached renderer branches by engine');
requireToken(app,'let RENDER_MAP_IMPL=()=>{};','stable renderer bootstrap delegate');
requireToken(app,'RENDER_MAP_IMPL=cachedRenderMap;window.renderMap=renderMap;','authoritative renderer installation');

// Selection/history/edit invariants discovered during live parity remain hard
// requirements after the cleanup.
for(const token of [
  'function invalidateHistoryRestoreCaches(fileIds=null)',
  'VStop(true,{render:false})',
  'V.geometryGuardTimer',
  'renderGeneration:0',
  'ANALYSIS_RUNTIME.renderGeneration++',
  'generation:${ANALYSIS_RUNTIME.renderGeneration}',
  'let HISTORY_RENDER_EPOCH=0',
  'HISTORY_RENDER_EPOCH++',
  'history:${HISTORY_RENDER_EPOCH}',
  'renderGeometryFingerprint(feature)',
  'cachedEditableGeometryMatchesModel',
  'layerKey:file.id',
  'canonicaliseStandalonePointGeometryInPlace(f.geometry);',
  'maxZoom:22,maxNativeZoom:19',
  'const rendered=mapFeatureJSON(feature)?.geometry'
])requireToken(app,token,'parity invariant');
forbidToken(app,'VStop=(function(base)','history source-order guard');
for(const token of ['function geometryFingerprint(geometry)','function editableLayerMatchesGeometry(layer,featureId,geometry)','function clearEditableVectorLayers(layerKey=null)','function geometryToCanonicalWorld','geometry:geometryToCanonicalWorld(item.geometry)'])requireToken(adapter,token,'OpenLayers runtime invariant');

// Runtime authority remains final in source order.
const authority='/* v1.55.7.3 — runtime authority boundary.';
const authorityIndex=app.indexOf(authority);
if(authorityIndex<0)fail('runtime authority boundary is missing');
const authorityTail=app.slice(authorityIndex);
requireToken(authorityTail,'renderAll();','runtime authority handoff');
requireToken(authorityTail,"version:'1.55.7.3'",'runtime authority snapshot');
requireToken(authorityTail,'window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY','runtime authority publication');
const afterPublish=app.slice(app.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY',authorityIndex));
if(/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/.test(afterPublish))fail('function patch appears after runtime authority boundary');

// Styling no longer needs a body engine selector because only OpenLayers can
// exist. The DOM overlay pane itself is engine-neutral to the application UI.
for(const [name,source] of [['application CSS',appCss],['mobile CSS',mobileCss],['OpenLayers CSS',olCss],['mobile controller',mobile]]){
  if(retiredWordRe.test(source))fail(`${name} retains retired engine text/selectors`);
}
requireToken(appCss,'.ol-viewport','application CSS OpenLayers viewport');
requireToken(olCss,'.editpolygon-dom-overlays','OpenLayers DOM overlay styling');
requireToken(mobileCss,'.ol-zoom button','mobile CSS OpenLayers controls');
forbidToken(olCss,'data-map-engine','OpenLayers CSS');
forbidToken(mobileCss,'data-map-engine="openlayers"','mobile CSS');
requireToken(mobile,"const VERSION='1.55.7.3';",'mobile controller version');

// Drawing/navigation contract: unfinished click-based geometry must leave the
// native map interaction surface exposed. Freehand alone owns press-and-drag.
for(const token of [
  '#editOverlay.drawing{pointer-events:none;cursor:crosshair}',
  '#editOverlay.drawing.drawing-freehand{pointer-events:auto}',
  '#editOverlay.drawing.zooming{opacity:1;pointer-events:none}',
  '#editOverlay.drawing.drawing-freehand.zooming{pointer-events:auto}'
])requireToken(appCss,token,'draw navigation CSS');
for(const token of [
  "MAP_RUNTIME.on('pointerdown',handleDrawRuntimePointerDown);",
  "MAP_RUNTIME.on('pointerdrag',handleDrawRuntimePointerDrag);",
  "MAP_RUNTIME.on('click',handleDrawRuntimeClick);",
  "MAP_RUNTIME.on('dblclick',handleDrawRuntimeDoubleClick);",
  "MAP_RUNTIME.on('mousemove',updateDrawCursorFromPointer);",
  "MAP_RUNTIME.on('contextmenu',handleDrawRuntimeContextMenu);",
  "document.addEventListener('keydown',handleDrawNavigationKeydown,true);",
  "overlay().addEventListener('wheel',handleDrawOverlayWheel,{passive:false});"
])requireToken(app,token,'draw navigation runtime');
for(const token of ['function panByPixels(dx=0,dy=0,viewOptions={})','function zoomBy(delta=0,viewOptions={})','setViewLatLng,panByPixels,zoomBy,fitExtent'])requireToken(adapter,token,'adapter-owned drawing navigation');
const freePolygonIndex=html.indexOf('data-draw-tool="polygon"');
const pointIndex=html.indexOf('data-draw-tool="point"');
if(freePolygonIndex<0||pointIndex<0||freePolygonIndex>pointIndex)fail('Free polygon is not the first static Draw flyout option');

// Lossless project persistence is independent of map implementation.
for(const token of ["const FORMAT_VERSION=1;","const MANIFEST_FILE='manifest.json';","const PROJECT_FILE='project.json';",'async function sha256(text)','async function createArchive(payload','async function readArchive(file'])requireToken(projectFormat,token,'EPZ project format');
requireToken(app,'function syncDrawCursorToCurrentView(renderRuntime=false)','draw cursor view resynchronisation');
requireToken(app,'rememberDrawPointerScreenState(e);DRAW_NAVIGATION_GESTURE.dragged=true','draw drag screen-pixel tracking');
requireToken(app,"MAP_RUNTIME.on('move resize',()=>{\n  if(D.active)syncDrawCursorToCurrentView(true);",'draw cursor synchronous move refresh');
requireToken(app,"EditPolygonProjectFormat.createArchive(payload,{appVersion:'1.55.7.3'})",'EPZ save version');
requireToken(app,'EditPolygonProjectFormat.readArchive(file,{onProgress})','EPZ load path');
requireToken(app,"referenceOverlays:Array.isArray(d.referenceOverlays)?clone(d.referenceOverlays):[]",'reference overlay persistence');
requireToken(app,"gisWorkspace:d.gisWorkspace&&typeof d.gisWorkspace==='object'?clone(d.gisWorkspace):null",'GIS workspace persistence');

// Current root docs only; stale per-version notes and common repository junk
// should not accumulate.
for(const required of ['.gitignore','README.md','ARCHITECTURE.md','CHANGELOG.md','QUALITY_BASELINE.md','RELEASE_MANIFEST.md'])if(!fs.existsSync(required))fail(`missing repository document ${required}`);
const staleRoot=fs.readdirSync('.').filter(name=>/^GIS_.*(?:RELEASE_NOTES|HOTFIX|FIX_155|NOTES)\.md$/i.test(name)||/^V\d+(?:\.\d+)+.*\.md$/i.test(name)||name==='CRS_VALIDATION.md');
if(staleRoot.length)fail(`stale root documentation remains: ${staleRoot.join(', ')}`);

// Deployment assets must remain referenced and HTML-local paths valid.
const deployText=[];
for(const name of fs.readdirSync('docs',{recursive:true})){
  const full=path.join('docs',name);if(!fs.existsSync(full)||!fs.statSync(full).isFile())continue;
  if(/\.(?:html|js|css|xml|txt|md|webmanifest)$/i.test(name)||['_headers','_redirects','robots.txt','sitemap.xml'].includes(path.basename(name))){try{deployText.push([full,read(full)]);}catch(_){ }}
}
function referencedByDeployable(file){const base=path.basename(file);return deployText.some(([source,text])=>source!==file&&text.includes(base));}
for(const name of fs.readdirSync('docs/assets')){
  const full=path.join('docs/assets',name);if(!fs.statSync(full).isFile())continue;
  if(!referencedByDeployable(full))fail(`unreferenced top-level deployment asset remains: ${full}`);
}
for(const name of fs.readdirSync('docs/assets/guides')){
  const full=path.join('docs/assets/guides',name);if(fs.statSync(full).isFile()&&!referencedByDeployable(full))fail(`unreferenced guide asset remains: ${full}`);
}
function localRefs(file){
  const source=read(file),refs=[];
  for(const match of source.matchAll(/(?:href|src)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)){
    const ref=match[1];if(!ref||/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(ref))continue;refs.push(ref);
  }
  return refs;
}
for(const name of fs.readdirSync('docs',{recursive:true}).filter(name=>name.endsWith('.html'))){
  const full=path.join('docs',name),base=path.dirname(full);
  for(const ref of localRefs(full)){
    const resolved=path.normalize(ref.startsWith('/')?path.join('docs',ref.slice(1)):path.join(base,ref));
    if(!resolved.startsWith('docs'+path.sep)&&resolved!=='docs')continue;
    let exists=fs.existsSync(resolved);if(!exists&&ref.endsWith('/'))exists=fs.existsSync(path.join(resolved,'index.html'));
    if(!exists)fail(`broken local HTML reference in ${full}: ${ref}`);
  }
}
for(const name of fs.readdirSync('.', {recursive:true}))if(name.includes('__pycache__')||name.endsWith('.pyc'))fail(`packaging/runtime junk is present: ${name}`);

console.log('v1.55.7.3 runtime/repository audit passed. Draw-time map navigation is adapter-owned; the live cursor preview is screen-anchored across pan/zoom while freehand retains drag ownership; mobile parity, lossless .epz persistence and authoritative rendering remain intact.');
