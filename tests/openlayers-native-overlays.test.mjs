import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const olCss=fs.readFileSync(new URL('../docs/assets/editpolygon-openlayers.css',import.meta.url),'utf8');

test('map runtime owns transient vector overlays and draggable DOM map handles',()=>{
  assert.match(adapter,/createVectorOverlayLayer/);
  assert.match(adapter,/setVectorOverlayFeatures/);
  assert.match(adapter,/clearVectorOverlayLayer/);
  assert.match(adapter,/createDomOverlay/);
  assert.match(adapter,/createDomOverlayController/);
});

test('Geometry Health and processing previews use map-runtime overlays through the map-runtime contract',()=>{
  const health=app.slice(app.indexOf('const geometryHealthIssueLayer'),app.indexOf('function createGeometryHealthLayer'));
  assert.match(health,/MAP_RUNTIME\.createVectorOverlayLayer/);
  assert.match(health,/MAP_RUNTIME\.setVectorOverlayFeatures/);
  assert.doesNotMatch(health,/L\.circleMarker|L\.geoJSON|map\.removeLayer/);
  const processing=app.slice(app.indexOf('const GEOMETRY_OP='),app.indexOf('function featureGeom',app.indexOf('const GEOMETRY_OP=')));
  assert.match(processing,/MAP_RUNTIME\.setVectorOverlayFeatures/);
  assert.doesNotMatch(processing,/L\.geoJSON/);
});

test('point and true-circle editing handles are engine-neutral DOM overlays',()=>{
  const points=app.slice(app.indexOf('function installV146PointEditing'),app.indexOf('const v146BaseVStart',app.indexOf('function installV146PointEditing')));
  assert.match(points,/MAP_RUNTIME\.createDomOverlay/);
  assert.match(points,/__editpolygonLiveGeometryUpdate/);
  assert.doesNotMatch(points,/L\.marker|L\.layerGroup|L\.divIcon/);
  const circles=app.slice(app.indexOf('const CIRCLE_EDIT='),app.indexOf('function startCircleEditMode',app.indexOf('const CIRCLE_EDIT=')));
  assert.match(circles,/MAP_RUNTIME\.createDomOverlay/);
  assert.match(circles,/MAP_RUNTIME\.createVectorOverlayLayer/);
  assert.doesNotMatch(circles,/L\.marker|L\.polyline|L\.layerGroup|L\.divIcon/);
});

test('measurements and selected-line endpoint markers use native runtime overlays',()=>{
  const measurement=app.slice(app.indexOf('function clearMeasurementDomOverlays'),app.indexOf('function measurePopupHtml'));
  assert.match(measurement,/MAP_RUNTIME\.createDomOverlay/);
  assert.match(measurement,/MAP_RUNTIME\.setVectorOverlayFeatures/);
  assert.doesNotMatch(measurement,/L\.marker|L\.polyline|L\.polygon|L\.circleMarker/);
  const endpoints=app.slice(app.indexOf('let endpointLayer=null'),app.indexOf('function installEndpointTracking',app.indexOf('let endpointLayer=null')));
  assert.match(endpoints,/MAP_RUNTIME\.createVectorOverlayLayer/);
  assert.match(endpoints,/MAP_RUNTIME\.setVectorOverlayFeatures/);
  assert.doesNotMatch(endpoints,/L\.layerGroup|L\.circleMarker/);
});

test('OpenLayers CDN bootstrap no longer uses parser-blocking document.write',()=>{
  assert.match(html,/cdn\.jsdelivr\.net\/npm\/ol@v10\.9\.0\/dist\/ol\.js/);
  assert.match(html,/cdn\.jsdelivr\.net\/npm\/ol@v10\.9\.0\/ol\.css/);
  assert.doesNotMatch(html,/document\.write\([^\n]*openlayers|document\.write\([^\n]*ol@v10\.9\.0/);
});


test('OpenLayers DOM overlays use a dedicated pane above the OL viewport',()=>{
  assert.match(adapter,/const domOverlayPane=global\.document\.createElement\('div'\)/);
  assert.match(adapter,/domOverlayPane\.className='editpolygon-dom-overlays'/);
  assert.match(adapter,/zIndex:'40'/);
  assert.match(adapter,/createDomOverlayController\(\{\.\.\.spec,container:domOverlayPane/);
});

test('cached vector signatures include active and picked selection state for immediate redraw',()=>{
  const signature=app.slice(app.indexOf('function renderSignature'),app.indexOf('function buildCachedLayer',app.indexOf('function renderSignature')));
  assert.match(signature,/activeSelection/);
  assert.match(signature,/pickedSelection/);
  assert.match(signature,/selection:\$\{activeSelection\}/);
  assert.match(signature,/picked:\$\{pickedSelection\}/);
});

test('saved measurement clicks select without immediately re-entering edit mode',()=>{
  const measurement=app.slice(app.indexOf('function markOverlayMapClickHandled'),app.indexOf('function measurePopupHtml'));
  assert.match(measurement,/function selectMeasurementItem\(id,event=null\)/);
  assert.match(measurement,/MEASURE\.selectedId=id;MEASURE\.editingId=null;MEASURE\.active=false/);
  assert.match(measurement,/open=event=>selectMeasurementItem\(item\.id,event\)/);
  assert.doesNotMatch(measurement,/open=.*startEditMeasure/);
  assert.match(app,/if\(e\?\.originalEvent\?\.__editpolygonOverlaySelectionHandled\)return/);
});


test('retired compatibility surface and legacy editable renderer are absent',()=>{
  assert.doesNotMatch(olCss,/compat|\.leaf/i);
  assert.doesNotMatch(app,/v130Leaf.*TransitionRenderMap|bulkVectorRenderer|featureGroup/i);
  assert.doesNotMatch(adapter,/requestedEngine|createLeaf.*Runtime|fallbackReason/i);
});
