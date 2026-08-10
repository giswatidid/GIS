import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('docs/assets/editpolygon-app.js');
const adapter=read('docs/assets/editpolygon-map-adapter.js');
const olCss=read('docs/assets/editpolygon-openlayers.css');
const html=read('docs/index.html');
const pkg=JSON.parse(read('package.json'));
const RELEASE_KEY='20260810-wms-project-persistence-1554415';

function fail(message){throw new Error(`v1.55.4.15 runtime/repository audit: ${message}`);}
function requireToken(text,token,where){if(!text.includes(token))fail(`${where} is missing ${token}`);}
function forbidToken(text,token,where){if(text.includes(token))fail(`${where} still contains obsolete token ${token}`);}

if(pkg.version!=='1.55.4.15')fail(`package version is ${pkg.version}, expected 1.55.4.15`);
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
  'createVectorOverlayLayer','createDomOverlay','prefersPersistentEditableVectorSource',
  'supportsFocusedEditableOverlay','setEditableFeatureSuppressed'
]){
  if(!leafRuntime.includes(method)||!olRuntime.includes(method))fail(`map-runtime contract is asymmetric for ${method}`);
}


// WMS display must not require anonymous CORS merely to paint provider images.
// GeoServer sources receive only safe tiled/server hints, while capability
// discovery remains best-effort and outside the map-engine implementation.
for(const runtime of [leafRuntime,olRuntime]){
  const start=runtime.indexOf('function createWmsLayer(spec={})');
  const end=runtime.indexOf(runtime===leafRuntime?'function createGeoJsonLayer':'function parseDash',start);
  const block=runtime.slice(start,end);
  if(start<0||end<start)fail('could not isolate WMS runtime primitive');
  if(/crossOrigin:(?:true|'anonymous'|"anonymous")/.test(block))fail('WMS runtime still forces anonymous CORS');
  requireToken(block,'spec.crossOrigin!=null','WMS runtime crossOrigin opt-in');
}
requireToken(olRuntime,"sourceOptions.serverType='geoserver'",'OpenLayers GeoServer WMS hint');
requireToken(olRuntime,'params.TILED=true','OpenLayers GeoServer tiled WMS hint');
requireToken(app,'async function gisDiscoverWmsBounds(source)','WMS capabilities discovery');
requireToken(app,"stored.bounds=info.bounds",'WMS advertised extent persistence');
requireToken(app,"gisWorkspace:d.gisWorkspace&&typeof d.gisWorkspace==='object'?clone(d.gisWorkspace):null",'GIS workspace survives project normalisation');
requireToken(app,'referenceOverlays:Array.isArray(d.referenceOverlays)?clone(d.referenceOverlays):[]','reference overlays survive project normalisation');
const olVisibilityStart=olRuntime.indexOf('function setDisplayLayerVisible(layer,visible)');
const olVisibilityEnd=olRuntime.indexOf('function setDisplayLayerZIndex',olVisibilityStart);
const olVisibility=olRuntime.slice(olVisibilityStart,olVisibilityEnd);
requireToken(olVisibility,'if(!hasDisplayLayer(layer))addDisplayLayer(layer)','OpenLayers visible service membership');
requireToken(olVisibility,'else if(hasDisplayLayer(layer))removeDisplayLayer(layer)','OpenLayers hidden service membership');

// Application-level OpenLayers calls are prohibited. Remaining direct Leaflet
// calls are explicit transition debt and are budgeted by audit-bindings.mjs.
if(/\bol\.[A-Za-z_$][\w$]*/.test(app))fail('application code calls OpenLayers directly instead of EditPolygonMap');
for(const direct of [/\bmap\.removeLayer\(/,/\bmap\.addLayer\(/,/\bmap\.hasLayer\(/,/\bmap\.getPane\(/,/\bmap\.createPane\(/]){
  if(direct.test(app))fail(`direct native-map escape hatch remains: ${direct}`);
}
if((app.match(/getNativeMap/g)||[]).length!==0)fail('application code must not escape to a native map object');


// Large editable layers must not rebuild solely because the viewport numeric
// extent changed. Candidate membership already encodes the spatial change.
// Remote GeoJSON keeps full editable geometry but large layers start collapsed
// and use bounded sidebar rows so the DOM cannot dominate interaction latency.
const cachedRendererStart=app.indexOf('function renderCandidateFeatures(file)');
const cachedRendererEnd=app.indexOf('function invalidateRenderCache',cachedRendererStart);
const cachedRendererBlock=app.slice(cachedRendererStart,cachedRendererEnd);
requireToken(cachedRendererBlock,'function renderSignature(file,features,renderMode=','stable candidate-set render signature');
if(/renderViewKey|viewKey/.test(cachedRendererBlock))fail('authoritative cached renderer still invalidates on raw viewport coordinates');
requireToken(app,'function performanceManagedEditableFile(file)','heavy editable-layer classifier');
requireToken(cachedRendererBlock,'MAP_RUNTIME.prefersPersistentEditableVectorSource?.()','native persistent-source capability');
requireToken(leafRuntime,'function prefersPersistentEditableVectorSource(){return false;}','Leaflet persistent-source policy');
requireToken(olRuntime,'function prefersPersistentEditableVectorSource(){return true;}','OpenLayers persistent-source policy');
requireToken(olRuntime,"new ol.layer.VectorImage",'OpenLayers adaptive VectorImage rendering');
requireToken(cachedRendererBlock,"if(!heavy)return 'vector';",'ordinary precise-vector render mode');
requireToken(cachedRendererBlock,"if(focusedOverlayEnabled(file))return 'image';",'focused heavy background render mode');
requireToken(cachedRendererBlock,'function buildFocusedRuntimeLayer(file,features)','precise focused edit overlay');
requireToken(cachedRendererBlock,"renderMode:'vector'",'focused overlay precise-vector mode');
requireToken(cachedRendererBlock,'geometryStateDiffersOnly(cached.geometryState,geometryState,precisionId)','active-edit background reuse');
requireToken(cachedRendererBlock,'MAP_RUNTIME.setEditableFeatureSuppressed(cached.group,next,true)','active-edit stale-background suppression');
requireToken(leafRuntime,'function supportsFocusedEditableOverlay(){return false;}','Leaflet focused-overlay policy');
requireToken(olRuntime,'function supportsFocusedEditableOverlay(){return true;}','OpenLayers focused-overlay policy');
requireToken(olRuntime,'function setEditableFeatureSuppressed(layer,featureId,suppressed)','OpenLayers focused-feature suppression');
requireToken(app,'performanceManaged=models.length>200||coordinateCount>=50000','remote large-layer classification');
requireToken(app,'file.performanceManaged=true','remote large-layer metadata');
requireToken(app,'sidebarRowLimit:80','bounded Layers-panel rows');
requireToken(adapter,'layer.__editpolygonStyleCacheSize=styleCache.size','OpenLayers shared style cache');
requireToken(adapter,'layer.__editpolygonDeclutter=hasDeclutterContent','OpenLayers conditional decluttering');
requireToken(adapter,"layer.__editpolygonRenderMode=canImage?'vector-image':'vector'",'OpenLayers render-mode marker');
requireToken(app,"MAP_RUNTIME.on('movestart zoomstart',hidePolygonContextToolbar)",'selected-toolbar pan suppression');
requireToken(app,"MAP_RUNTIME.on('moveend zoomend resize viewreset',updatePolygonContextToolbarSoon)",'selected-toolbar settled update');
requireToken(app,'const bbox=mapFeatureBBox(r.feature)','selected-toolbar cached bounds');
requireToken(app,"MAP_RUNTIME.off('mousemove',previous)",'single active mouse-coordinate listener');

// Repeated horizontal world copies are a supported map-view state. Candidate
// culling must be longitude-periodic and pixel overlays must target the world
// copy nearest the active view rather than assuming canonical -180..180 only.
const analysis=read('docs/assets/gis-analysis-core.js');
requireToken(analysis,'function querySpatialIndexWrapped','GIS analysis core');
requireToken(analysis,'querySpatialIndexWrapped,applySelectionMode','GIS analysis core API');
requireToken(app,'function querySpatialIndexWrapped(file,bbox)','application spatial-index bridge');
requireToken(app,'const bbox=MAP_RUNTIME.getExtent(.35),ids=new Set(querySpatialIndexWrapped(file,bbox))','authoritative cached renderer');
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

// Repeated-world editing is branch-stable as well as repeated-world rendering.
// A pointer can be reported in world copy +/-360n from the stored geometry, but
// moving one vertex/edge/handle must never connect that copy back to untouched
// coordinates with a world-spanning segment.
requireToken(app,'function unwrapCoordNear','generic continuous-longitude edit helper');
requireToken(app,'const editCoord=unwrapCoordNear(snapped.coord,drag.originalCoord||snapped.coord);','red vertex repeated-world edit guard');
requireToken(app,'const coordA=unwrapCoordNear([aLL.lng,aLL.lat],drag.originalCoordA||drag.lastCoordA);','edge repeated-world edit guard');
requireToken(app,'return [unwrapLongitudeNear(ll.lng,coord[0]),Math.max(-90,Math.min(90,ll.lat))];','whole-feature repeated-world edit guard');
requireToken(app,'const startLng=unwrapLongitudeNear(startLL.lng,origin0[0]);','geographic move repeated-world edit guard');
requireToken(adapter,'next[0]=wrapLongitudeNear(next[0],coordinate[0]);coordinate=next;','DOM handle repeated-world drag guard');
requireToken(app,'const centerCoord=unwrapCoordNear([ll.lng,Math.max(-90,Math.min(90,ll.lat))],drag?.base?.center||f.parametricGeometry.center);','circle-centre repeated-world edit guard');

// The current editable renderer must be one engine-neutral implementation.
const rendererStart=app.indexOf('function buildRuntimeCachedLayer');
const rendererEnd=app.indexOf('function invalidateRenderCache',rendererStart);
if(rendererStart<0||rendererEnd<rendererStart)fail('could not isolate authoritative cached renderer');
const renderer=app.slice(rendererStart,rendererEnd);
for(const token of ['MAP_RUNTIME.createEditableVectorLayer','MAP_RUNTIME.addDisplayLayer','MAP_RUNTIME.removeDisplayLayer','MAP_RUNTIME.hasDisplayLayer'])requireToken(renderer,token,'authoritative cached renderer');
if(/\b(?:L|ol)\./.test(renderer))fail('authoritative cached renderer contains engine-specific calls');
if(/MAP_RUNTIME\.engine/.test(renderer))fail('authoritative cached renderer branches by engine');
requireToken(renderer,"if(file.tableOnly||isFileSleeping(file))continue",'authoritative cached renderer');
requireToken(renderer,'addCachedLayer(group);','authoritative cached renderer replacement-first install');
requireToken(renderer,'if(cached?.group)removeCachedLayer(cached.group);','authoritative cached renderer old-layer retirement');
requireToken(renderer,'function buildFocusedRuntimeLayer(file,features)','authoritative focused overlay');
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

requireToken(app,'function invalidateHistoryRestoreCaches(fileIds=null)','post-history cache invalidation');
requireToken(app,'VStop(true,{render:false})','history editor shutdown without pre-restore paint');
forbidToken(app,'VStop=(function(base)','stale VStop compatibility wrapper');
requireToken(app,'V.geometryGuardTimer','history-safe delayed vertex guard ownership');
requireToken(app,'renderGeneration:0','authoritative render generation');
requireToken(app,'ANALYSIS_RUNTIME.renderGeneration++','render-generation invalidation');
requireToken(app,'generation:${ANALYSIS_RUNTIME.renderGeneration}','render signature generation');
requireToken(app,'let HISTORY_RENDER_EPOCH=0','monotonic history render epoch');
requireToken(app,'HISTORY_RENDER_EPOCH++','history render epoch advance');
requireToken(app,'history:${HISTORY_RENDER_EPOCH}','history epoch in render signature');
requireToken(app,'renderGeometryFingerprint(feature)','geometry content in render signature');
requireToken(app,'cachedEditableGeometryMatchesModel','model/native geometry cache verification');
requireToken(app,'layerKey:file.id','adapter-owned editable layer key');
requireToken(adapter,'function geometryFingerprint(geometry)','map-runtime geometry fingerprint');
requireToken(adapter,'function editableLayerMatchesGeometry(layer,featureId,geometry)','map-runtime geometry content verification');
requireToken(adapter,'function clearEditableVectorLayers(layerKey=null)','map-runtime editable layer hard purge');

requireToken(app,'canonicaliseStandalonePointGeometryInPlace(f.geometry);','canonical Point model healing');
requireToken(app,'maxZoom:22,maxNativeZoom:19','OSM native zoom cap');
requireToken(adapter,'function geometryToCanonicalWorld','OpenLayers canonical-world vector projection');
requireToken(adapter,'geometry:geometryToCanonicalWorld(item.geometry)','OpenLayers transient overlay canonicalisation');
console.log('v1.55.4.15 runtime/repository audit passed. WMS service definitions survive project normalisation/reload, WMS visibility owns map membership, heavy OpenLayers vectors keep a persistent image-backed background with precise focused selection/edit overlays, OpenLayers remains adapter-confined and deployment assets are clean.');
