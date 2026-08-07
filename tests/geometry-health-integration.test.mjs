import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-geometry-health.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../docs/assets/gis-geometry-health-worker.js',import.meta.url),'utf8');
const geosAdapter=fs.readFileSync(new URL('../docs/assets/gis-geos-adapter.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-geometry-health.css',import.meta.url),'utf8');
const layerUi=fs.readFileSync(new URL('../docs/assets/gis-ui-integration.js',import.meta.url),'utf8');

test('Geometry Health assets load in safe dependency order',()=>{
  assert.ok(html.indexOf('gis-geometry-health-core.js')<html.indexOf('editpolygon-app.js'));
  assert.ok(html.indexOf('editpolygon-app.js')<html.indexOf('gis-geometry-health.js'));
  assert.match(html,/gis-geometry-health\.css/);
  assert.match(html,/Check &amp; fix geometry/);
});

test('layer GIS menu exposes Geometry Health as a first-class analysis action',()=>{
  assert.ok(layerUi.includes("menuAction('health','Check & fix geometry','v1.54')"));
  assert.match(layerUi,/tab==='health'/);
  assert.match(layerUi,/EditPolygonGeometryHealth\?\.open/);
});

test('Geometry Health bridge materialises an undoable derived layer with provenance',()=>{
  for(const token of ['geometryHealthLayerSnapshot','createGeometryHealthLayer','focusGeometryHealthIssue','previewGeometryHealthProposal','gisGeometryHealth','pushHistory()'])assert.ok(app.includes(token),`Missing ${token}`);
  assert.match(app,/original layer was not changed/i);
  assert.match(app,/will not silently drop them/i);
  assert.match(app,/sourceFormat:'geometry-health'/);
});

test('guided UI uses plain-language exclusive risk categories and preserves source layer',()=>{
  for(const phrase of ['Ready','Safe to fix','Needs review','Manual review','Standard geometry checks','The original layer is preserved','Unresolved issues remain'])assert.ok(ui.includes(phrase),`Missing ${phrase}`);
  assert.match(ui,/Feature counts above are exclusive/);
  assert.match(ui,/Fix safe issues/);
  assert.match(ui,/Preview repair/);
  assert.match(ui,/Create repaired layer/);
  assert.match(ui,/Export report JSON/);
  assert.match(ui,/Export issue CSV/);
});

test('review repairs are explicitly previewed and never include automatic duplicate-feature deletion',()=>{
  for(const action of ['close_ring','drop_invalid_hole','drop_collapsed_hole','drop_duplicate_ring','drop_collapsed_polygon','make_valid'])assert.ok(worker.includes(`action==='${action}'`),`Missing ${action}`);
  assert.doesNotMatch(worker,/dropDuplicateFeatures/);
  assert.match(worker,/consequence='high'/);
  assert.match(worker,/remainingIssues/);
});

test('Geometry Health runs long work in a dedicated worker and supports cancellation',()=>{
  assert.match(ui,/new Worker\('assets\/gis-geometry-health-worker\.js/);
  assert.match(ui,/worker\.terminate/);
  assert.match(ui,/data-gh-action="cancel"/);
  assert.match(worker,/postProgress/);
});

test('Geometry Health panel is viewport bounded, internally scrollable and mobile-safe',()=>{
  assert.match(css,/position:fixed/);
  assert.match(css,/bottom:28px/);
  assert.match(css,/#geometryHealthContent\{height:100%;overflow:auto/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/body\.night-mode/);
});


test('robust polygon validation and MakeValid are wired to pinned GEOS-WASM with an explicit fallback',()=>{
  assert.match(worker,/geos-wasm@3\.1\.1/);
  assert.match(worker,/augmentRobustPolygonValidity/);
  assert.match(worker,/GEOSisValidReason|robustValidity/);
  assert.match(worker,/makeValidPolygonFeature/);
  assert.match(worker,/Turf fallback/);
  assert.match(geosAdapter,/GEOSMakeValid/);
  assert.match(geosAdapter,/GEOSGeoJSONReader_readGeometry/);
  assert.match(geosAdapter,/GEOSGeoJSONWriter_writeGeometry/);
  assert.match(ui,/GEOS verified/);
  assert.match(ui,/Repair engine:/);
});

test('repair provenance retains engine status, warnings and unresolved issue summary',()=>{
  for(const token of ['beforeEngine','afterEngine','unresolvedIssueSummary','acceptedRepairs'])assert.ok(app.includes(token),`Missing provenance ${token}`);
  for(const token of ['beforeEngine','afterEngine','unresolvedIssueSummary'])assert.ok(ui.includes(token),`UI does not pass ${token}`);
});


test('legacy file-validator fallback uses conservative defaults only',()=>{
  assert.match(app,/const recommended=new Set\(\['removeDupes','enforceWinding'\]\)/);
  assert.ok(app.includes("if(cb)cb.checked=mode==='all';"));
  assert.doesNotMatch(html,/checked="" data-validator-fix="dropDuplicateFeatures"/);
  assert.doesNotMatch(html,/checked="" data-validator-fix="closeRings"/);
  assert.match(html,/Legacy Recommended fixes are intentionally conservative/);
});
