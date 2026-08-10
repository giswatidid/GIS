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
const RELEASE_KEY='20260810-openlayers-only-1556';
const retiredWord=['lea','flet'].join('');
const retiredWordRe=new RegExp(retiredWord,'i');
const retiredFactory=['create','Lea','fletRuntime'].join('');

function fail(message){throw new Error(`v1.55.6 runtime/repository audit: ${message}`);}
function requireToken(source,token,label){if(!source.includes(token))fail(`${label} is missing ${JSON.stringify(token)}`);}
function forbidToken(source,token,label){if(source.includes(token))fail(`${label} still contains ${JSON.stringify(token)}`);}

if(pkg.version!=='1.55.6')fail(`package version is ${pkg.version}, expected 1.55.6`);
requireToken(html,'ol@v10.9.0/dist/ol.js','OpenLayers dependency');
requireToken(html,'ol@v10.9.0/ol.css','OpenLayers stylesheet');
if(retiredWordRe.test(html))fail('retired map dependency remains in deployment HTML');

// Every local runtime asset on the main application page must share one cache
// key so the cutover cannot mix old and new modules after deployment.
for(const match of html.matchAll(/(?:src|href)=["']([^"']*assets\/[^"'?]+)(?:\?v=([^"']+))?["']/g)){
  const ref=match[1],version=match[2];
  if(!version)fail(`local runtime asset has no cache key: ${ref}`);
  if(version!==RELEASE_KEY)fail(`local runtime asset ${ref} uses ${version}, expected ${RELEASE_KEY}`);
}

requireToken(adapter,"const VERSION='1.55.6';",'map adapter version');
requireToken(adapter,'function createOpenLayersRuntime(options={})','OpenLayers runtime factory');
requireToken(adapter,'function createRuntime(options={}){\n    return createOpenLayersRuntime(options);\n  }','single runtime factory');
requireToken(adapter,'createRuntime,createOpenLayersRuntime','adapter exports');
if(adapter.includes(retiredFactory))fail('retired runtime factory remains in adapter');
for(const stale of ['requestedEngine','fallbackReason'])forbidToken(adapter,stale,'map adapter');
const retiredNamespace=new RegExp('\\b'+'L'+'\\.[A-Za-z_$][\\w$]*');
if(retiredNamespace.test(adapter))fail('retired native namespace remains in adapter');

requireToken(app,'// v1.55.6: OpenLayers is the sole map runtime. Application code talks only','application runtime boundary');
requireToken(app,"const MAP_RUNTIME=MAP_ADAPTER.createRuntime({",'application runtime creation');
requireToken(app,'ol:window.ol','application OpenLayers dependency injection');
for(const stale of ['requestedEngine','fallbackReason','L:window.L'])forbidToken(app,stale,'application startup');
if(/\bol\.[A-Za-z_$][\w$]*/.test(app))fail('application directly calls OpenLayers instead of EditPolygonMap');
if(retiredNamespace.test(app))fail('application directly calls retired native-map API');
if(app.includes('getNativeMap'))fail('application escapes to native map object');

// The final renderer is the only editable display authority.
const rendererStart=app.indexOf('function buildRuntimeCachedLayer');
const rendererEnd=app.indexOf('function invalidateRenderCache',rendererStart);
if(rendererStart<0||rendererEnd<rendererStart)fail('could not isolate authoritative cached renderer');
const renderer=app.slice(rendererStart,rendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer','function buildFocusedRuntimeLayer(file,features)','setEditableFeatureSuppressed'])requireToken(renderer,token,'authoritative cached renderer');
if(/\b(?:L|ol)\./.test(renderer))fail('authoritative cached renderer contains native-engine calls');
if(/MAP_RUNTIME\.engine/.test(renderer))fail('authoritative cached renderer branches by engine');
requireToken(app,'let RENDER_MAP_IMPL=()=>{};','stable renderer bootstrap delegate');
requireToken(app,'RENDER_MAP_IMPL=cachedRenderMap;window.renderMap=renderMap;','authoritative renderer installation');

// Selection/history/edit invariants discovered during live parity remain hard
// requirements after deleting the old runtime.
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
for(const token of ['function geometryFingerprint(geometry)','function editableLayerMatchesGeometry(layer,featureId,geometry)','function clearEditableVectorLayers(layerKey=null)','function geometryToCanonicalWorld','geometry:geometryToCanonicalWorld(item.geometry)','function prefersPersistentEditableVectorSource(){return true;}','function supportsFocusedEditableOverlay(){return true;}'])requireToken(adapter,token,'OpenLayers runtime invariant');

// Runtime authority must be final in source order.
const authority='/* v1.55.6 — runtime authority boundary.';
const authorityIndex=app.indexOf(authority);
if(authorityIndex<0)fail('runtime authority boundary is missing');
const authorityTail=app.slice(authorityIndex);
requireToken(authorityTail,'renderAll();','runtime authority handoff');
requireToken(authorityTail,"version:'1.55.6'",'runtime authority snapshot');
requireToken(authorityTail,'window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY','runtime authority publication');
const afterPublish=app.slice(app.indexOf('window.__EditPolygonRuntimeAuthority=EDITPOLYGON_RUNTIME_AUTHORITY',authorityIndex));
if(/\bfunction\s+[A-Za-z_$]|(?<![\w$.])[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\s*\(/.test(afterPublish))fail('function patch appears after runtime authority boundary');

// Current UI/runtime styling must address OpenLayers directly and contain no
// retired native-engine selectors.
for(const [name,source] of [['application CSS',appCss],['mobile CSS',mobileCss],['OpenLayers CSS',olCss],['mobile controller',mobile]]){
  if(retiredWordRe.test(source))fail(`${name} retains retired engine text/selectors`);
}
requireToken(appCss,'.ol-viewport','application CSS OpenLayers viewport');
requireToken(mobileCss,'.ol-zoom button','mobile CSS OpenLayers controls');
requireToken(mobile,"const VERSION='1.55.6';",'mobile controller version');

// Lossless project persistence is independent of the map implementation.
for(const token of ["const FORMAT_VERSION=1;","const MANIFEST_FILE='manifest.json';","const PROJECT_FILE='project.json';",'async function sha256(text)','async function createArchive(payload','async function readArchive(file'])requireToken(projectFormat,token,'EPZ project format');
requireToken(app,"EditPolygonProjectFormat.createArchive(payload,{appVersion:'1.55.6'})",'EPZ save version');
requireToken(app,'EditPolygonProjectFormat.readArchive(file,{onProgress})','EPZ load path');
requireToken(app,"referenceOverlays:Array.isArray(d.referenceOverlays)?clone(d.referenceOverlays):[]",'reference overlay persistence');
requireToken(app,"gisWorkspace:d.gisWorkspace&&typeof d.gisWorkspace==='object'?clone(d.gisWorkspace):null",'GIS workspace persistence');

// Current root docs only; stale per-version note files should not accumulate.
for(const required of ['README.md','ARCHITECTURE.md','CHANGELOG.md','QUALITY_BASELINE.md','RELEASE_MANIFEST.md'])if(!fs.existsSync(required))fail(`missing repository document ${required}`);
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

console.log('v1.55.6 runtime/repository audit passed. OpenLayers is the sole map runtime; mobile parity, lossless .epz persistence, authoritative rendering and adapter boundaries remain intact.');
