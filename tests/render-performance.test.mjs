import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');

test('bulk editable vectors use the adapter-owned persistent native source path',()=>{
  assert.match(app,/MAP_RUNTIME\.createEditableVectorLayer/);
  assert.match(app,/if\(performanceManagedEditableFile\(file\)\)return all/);
  assert.doesNotMatch(app,/prefersPersistentEditableVectorSource|supportsFocusedEditableOverlay/);
  assert.doesNotMatch(app,/bulkVectorRenderer|renderer:bulkRenderer/);
});

test('map movement skips image rendering for vector-only projects',()=>{
  assert.match(app,/function hasVisibleImageOverlays\(\)/);
  assert.match(app,/function scheduleImageOverlayMoveRender\(\)/);
  assert.match(app,/requestAnimationFrame/);
  assert.doesNotMatch(app,/map\.on\('move resize',\(\)=>\{scheduleOverlayRender\(\);renderImageOverlays\(\);\}\)/);
});

test('performance release uses a fresh application cache key',()=>{
  assert.match(html,/editpolygon-app\.js\?v=20260810-v15571-startup-hotfix/);
});


test('cached vector swaps add the replacement before removing the old layer to avoid pan flicker',()=>{
  const start=app.indexOf('function cachedRenderMap()');
  const block=app.slice(start,app.indexOf('function invalidateRenderCache',start));
  assert.ok(start>=0);
  assert.match(block,/addCachedLayer\(group\);[\s\S]*if\(cached\?\.group\)removeCachedLayer\(cached\.group\);/);
  assert.doesNotMatch(block,/MAP_RUNTIME\.engine==='openlayers'/);
});


test('cached editable renderer does not rebuild solely because viewport coordinates changed',()=>{
  const start=app.indexOf('function renderCandidateFeatures(file)');
  const end=app.indexOf('function invalidateRenderCache',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/function renderSignature\(file,features,renderMode=/);
  assert.doesNotMatch(block,/renderViewKey/);
  assert.doesNotMatch(block,/viewKey/);
  assert.match(block,/const features=renderCandidateFeatures\(file\),useFocusedOverlay=focusedOverlayEnabled\(file\),renderMode=editableRenderMode\(file,features\),signature=renderSignature\(file,features,renderMode,useFocusedOverlay\)/);
});

test('large remote editable layers are performance-managed without simplifying their geometry',()=>{
  assert.match(app,/coordinateCount=models\.reduce\(\(sum,feature\)=>sum\+vertexCount\(getDisplayGeometry\(feature\)\),0\)/);
  assert.match(app,/performanceManaged=models\.length>200\|\|coordinateCount>=50000/);
  assert.match(app,/file\.performanceManaged=true/);
  assert.match(app,/fullGeometry:true/);
  assert.match(app,/sidebarState\.collapsedFiles\.add\(file\.id\)/);
  assert.match(app,/!file\.largeImport&&!file\.performanceManaged&&featureCount<=V96\.sidebarRowLimit/);
  assert.match(app,/sidebarRowLimit:80/);
});


test('heavy editable layers keep a fast background and isolate selection/editing in a precise focused overlay',()=>{
  const start=app.indexOf('function focusedOverlayEnabled(file)');
  const end=app.indexOf('function invalidateRenderCache',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(app,/function performanceManagedEditableFile\(file\)/);
  assert.match(block,/function focusedOverlayEnabled\(file\)\{[\s\S]*return performanceManagedEditableFile\(file\)/);
  assert.doesNotMatch(block,/supportsFocusedEditableOverlay/);
  assert.match(block,/if\(focusedOverlayEnabled\(file\)\)return 'image'/);
  assert.match(block,/function buildFocusedRuntimeLayer\(file,features\)/);
  assert.match(block,/renderMode:'vector'/);
  assert.match(block,/interactionOptimized:false/);
  assert.match(block,/gisResolvedFeatureStyle\(file,feature,\{highlight:false\}\)/);
  assert.match(block,/const focusNow=useFocusedOverlay\?focusedFeatures\(file,features\):\[\]/);
  assert.match(block,/precisionOnlyGeometryChange/);
  assert.match(block,/geometryStateDiffersOnly\(cached\.geometryState,geometryState,precisionId\)/);
  assert.match(block,/cached\?\.focusGroup/);
  assert.doesNotMatch(block,/MAP_RUNTIME\.engine==='openlayers'/);
});

test('focused edit overlay is the live geometry target and suppresses the stale background copy only during precision editing',()=>{
  const start=app.indexOf('function liveGeometryUpdate(featureIds=[]');
  const end=app.indexOf('function cachedRenderMap()',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(cached\?\.focusGroup\)done=!!MAP_RUNTIME\.updateEditableFeatureGeometry\(cached\.focusGroup,id,getDisplayGeometry\(r\.feature\)\)/);
  assert.match(block,/function syncFocusedSuppression\(cached,file\)/);
  assert.match(block,/const next=fileHasActivePrecisionEdit\(file\)\?project\.selectedFeatureId:null/);
  assert.match(block,/MAP_RUNTIME\.setEditableFeatureSuppressed\(cached\.group,next,true\)/);
});

test('selected polygon toolbar stays out of the hot pan loop and uses cached feature bounds',()=>{
  const start=app.indexOf('function selectedPolygonToolbarAnchor(r)');
  const end=app.indexOf('// v37: edge-drag polygon editing.',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/const bbox=mapFeatureBBox\(r\.feature\)/);
  assert.doesNotMatch(block,/turf\.bbox\(mapFeatureJSON\(r\.feature\)\)/);
  assert.match(block,/let polygonContextToolbarRaf=0/);
  assert.match(block,/if\(polygonContextToolbarRaf\)return/);
  assert.match(block,/MAP_RUNTIME\.on\('movestart zoomstart',hidePolygonContextToolbar\)/);
  assert.match(block,/MAP_RUNTIME\.on\('moveend zoomend resize viewreset',updatePolygonContextToolbarSoon\)/);
  assert.doesNotMatch(block,/MAP_RUNTIME\.on\('move zoom/);
});

test('heavy OpenLayers sources stay persistent instead of rebuilding on viewport membership changes',()=>{
  const start=app.indexOf('function performanceManagedEditableFile(file)');
  const end=app.indexOf('function fileHasActivePrecisionEdit(file)',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(performanceManagedEditableFile\(file\)\)return all/);
  assert.doesNotMatch(block,/prefersPersistentEditableVectorSource/);
  assert.match(block,/querySpatialIndexWrapped\(file,bbox\)/);
});

test('single-runtime cleanup removes the dead map-pan recovery listener stack',()=>{
  assert.doesNotMatch(app,/MAP_PAN_GUARD|mapPanLooksActive|hardResetMapPan|scheduleMapPanReleaseCheck/);
  assert.doesNotMatch(app,/document\.addEventListener\('pointerup',e=>scheduleMapPanReleaseCheck/);
});

test('enhanced mouse coordinate readout replaces rather than stacks the core pointermove handler',()=>{
  assert.match(app,/const CORE_MOUSE_COORD_HANDLER=e=>/);
  assert.match(app,/window\.__editpolygonMouseCoordHandler=CORE_MOUSE_COORD_HANDLER/);
  assert.match(app,/const previous=window\.__editpolygonMouseCoordHandler/);
  assert.match(app,/MAP_RUNTIME\.off\('mousemove',previous\)/);
  assert.match(app,/window\.__editpolygonMouseCoordHandler=handler/);
});
