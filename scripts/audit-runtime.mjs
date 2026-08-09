import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('docs/assets/editpolygon-app.js');
const adapter=read('docs/assets/editpolygon-map-adapter.js');
const olCss=read('docs/assets/editpolygon-openlayers.css');
const html=read('docs/index.html');
const pkg=JSON.parse(read('package.json'));

function fail(message){throw new Error(`v1.55.3 runtime audit: ${message}`);}
function requireToken(text,token,where){if(!text.includes(token))fail(`${where} is missing ${token}`);}
function forbidToken(text,token,where){if(text.includes(token))fail(`${where} still contains obsolete compatibility token ${token}`);}

if(pkg.version!=='1.55.3')fail(`package version is ${pkg.version}, expected 1.55.3`);

const compatibilityTokens=[
  'editpolygon-leaflet-compat',
  '__peGetLeafletMap',
  '__polygonEditorLeafletMap',
  'getLegacyMap',
  'syncLegacy',
  "parityBridge:'leaflet-legacy-audit'",
  'mapParityBridge'
];
for(const token of compatibilityTokens){
  forbidToken(app,token,'editpolygon-app.js');
  forbidToken(adapter,token,'editpolygon-map-adapter.js');
  forbidToken(olCss,token,'editpolygon-openlayers.css');
}

const olStart=adapter.indexOf('function createOpenLayersRuntime');
const runtimeStart=adapter.indexOf('function createRuntime(',olStart);
if(olStart<0||runtimeStart<olStart)fail('could not isolate createOpenLayersRuntime');
const olRuntime=adapter.slice(olStart,runtimeStart);
if(/\bL\./.test(olRuntime))fail('OpenLayers runtime still invokes Leaflet');
if(/\blegacyMap\b/.test(olRuntime))fail('OpenLayers runtime still owns a legacy map');
requireToken(olRuntime,"className='editpolygon-openlayers-dom-overlays'",'OpenLayers runtime');

const leafStart=adapter.indexOf('function createLeafletRuntime');
if(leafStart<0||olStart<leafStart)fail('could not isolate createLeafletRuntime');
const leafletRuntime=adapter.slice(leafStart,olStart);
requireToken(leafletRuntime,'L.map(','Leaflet runtime');
requireToken(leafletRuntime,'function createWmsLayer','Leaflet runtime');

for(const direct of [
  /\bmap\.removeLayer\(/,
  /\bmap\.addLayer\(/,
  /\bmap\.hasLayer\(/,
  /\bmap\.getPane\(/,
  /\bmap\.createPane\(/
]) if(direct.test(app)) fail(`direct transitional map call remains: ${direct}`);

for(const name of [
  'featuresAtLatLng',
  'featureHitAtMapPoint',
  'parametricCircleHitAtMapPoint',
  'applyMapFeatureSelection',
  'selectFromMapClick'
]){
  const declaration=app.indexOf(`function ${name}(`);
  if(declaration<0)fail(`critical selector ${name} is missing`);
  const tail=app.slice(declaration+1);
  if(new RegExp(`(?:^|[^\\w$.])${name}\\s*=\\s*(?:async\\s*)?function\\s*\\(`,'m').test(tail))
    fail(`critical selector ${name} is overwritten later`);
}

const finalRenderer=app.indexOf('renderMap=cachedRenderMap;window.renderMap=renderMap;');
if(finalRenderer<0)fail('authoritative cached renderMap binding is missing');
const renderTail=app.slice(finalRenderer+'renderMap=cachedRenderMap;window.renderMap=renderMap;'.length);
if(/(?:^|[;\n])\s*renderMap\s*=\s*(?:async\s*)?function\s*\(/m.test(renderTail))
  fail('renderMap is overwritten after the authoritative cached renderer');
requireToken(app,"if(file.tableOnly||isFileSleeping(file))continue",'cached renderer');
requireToken(app,"if(featureGroup)featureGroup.clearLayers()",'cached renderer');

const initialRenderer=app.slice(app.indexOf('function renderMap(){'),app.indexOf('function renderAll()',app.indexOf('function renderMap(){')));
if(!/MAP_RUNTIME\.engine==='openlayers'\)return/.test(initialRenderer))fail('initial Leaflet renderer is not guarded from OpenLayers');
const v130Anchor=app.indexOf('function v130BringLayerForward');
const v130Render=app.slice(app.indexOf('renderMap=function(){',v130Anchor),app.indexOf('// Geometry changes are recomputed',v130Anchor));
if(!/MAP_RUNTIME\.engine==='openlayers'\)return/.test(v130Render))fail('v1.30 Leaflet renderer is not guarded from OpenLayers');

if(!html.includes('20260809-openlayers-compat-free-audit-1553'))fail('index does not use the v1.55.3 cache key');
if(!html.includes('leaflet@1.9.4/dist/leaflet.js'))fail('Leaflet transition engine was removed too early');
if(!html.includes('cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js'))fail('OpenLayers 10.9.0 is not loaded');

const staleTopLevel=fs.readdirSync('.').filter(name=>
  /^GIS_.*(?:RELEASE_NOTES|HOTFIX|FIX_155|NOTES)\.md$/i.test(name) ||
  /^V1\.55\.(?:1(?:\.\d+)?|2)_CHANGED_FILES\.md$/i.test(name)
);
if(staleTopLevel.length)fail(`historical release clutter remains at repository root: ${staleTopLevel.join(', ')}`);

for(const required of ['README.md','ARCHITECTURE.md','CHANGELOG.md','V1.55.3_AUDIT.md','V1.55.3_CHANGED_FILES.md','CRS_VALIDATION.md'])
  if(!fs.existsSync(required))fail(`missing consolidated repository document ${required}`);

function localRefs(file){
  const source=read(file);
  const refs=[];
  for(const match of source.matchAll(/(?:href|src)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)){
    const ref=match[1];
    if(!ref||/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(ref))continue;
    refs.push(ref);
  }
  return refs;
}
// Stale deployment assets are a common source of repository clutter. Every
// top-level runtime asset and every guide image must be referenced by a deployable
// HTML/JS/CSS/text resource. Dynamic workers are covered because their filenames
// appear in the runtime modules that construct them.
const deployText=[];
for(const name of fs.readdirSync('docs',{recursive:true})){
  const full=path.join('docs',name);
  if(!fs.existsSync(full)||!fs.statSync(full).isFile())continue;
  if(/\.(?:html|js|css|xml|txt|md|webmanifest)$/i.test(name)||['_headers','_redirects','robots.txt','sitemap.xml'].includes(path.basename(name))){
    try{deployText.push([full,read(full)]);}catch(_){ }
  }
}
function referencedByDeployable(file){
  const base=path.basename(file);
  return deployText.some(([source,text])=>source!==file&&text.includes(base));
}
for(const name of fs.readdirSync('docs/assets')){
  const full=path.join('docs/assets',name);
  if(!fs.statSync(full).isFile())continue;
  if(!referencedByDeployable(full))fail(`unreferenced top-level deployment asset remains: ${full}`);
}
for(const name of fs.readdirSync('docs/assets/guides')){
  const full=path.join('docs/assets/guides',name);
  if(fs.statSync(full).isFile()&&!referencedByDeployable(full))fail(`unreferenced guide asset remains: ${full}`);
}

for(const file of fs.readdirSync('docs',{recursive:true}).filter(name=>name.endsWith('.html'))){
  const full=path.join('docs',file),base=path.dirname(full);
  for(const ref of localRefs(full)){
    const resolved=path.normalize(ref.startsWith('/')?path.join('docs',ref.slice(1)):path.join(base,ref));
    if(!resolved.startsWith('docs'+path.sep)&&resolved!=='docs')continue;
    let exists=fs.existsSync(resolved);
    if(!exists&&ref.endsWith('/'))exists=fs.existsSync(path.join(resolved,'index.html'));
    if(!exists)fail(`broken local HTML reference in ${full}: ${ref}`);
  }
}

console.log('v1.55.3 runtime/repository audit passed.');
