import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-data-tools.css',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../docs/assets/gis-join-worker.js',import.meta.url),'utf8');

test('join engine loads before the application and uses a dedicated worker',()=>{
  assert.ok(html.indexOf('gis-join-core.js')>html.indexOf('gis-analysis-core.js'));
  assert.ok(html.indexOf('gis-join-core.js')<html.indexOf('editpolygon-app.js'));
  assert.match(app,/gis-join-worker\.js\?v=20260807-menu-usability-1533/);
  assert.match(worker,/attributeJoin/);
  assert.match(worker,/groupSummary/);
  assert.match(worker,/spatialJoin/);
});

test('application exposes materialised join, summary and spatial APIs',()=>{
  for(const name of ['getJoinSources','parseJoinLookupFile','previewAttributeJoin','executeAttributeJoin','previewGroupSummary','executeGroupSummary','previewSpatialJoin','executeSpatialJoin','cancelJoinProcessing'])assert.match(app,new RegExp(name));
  assert.match(app,/tableOnly/);
  assert.match(app,/gisJoin/);
  assert.match(app,/operation:'attribute_join'/);
  assert.match(app,/operation:'group_summary'/);
  assert.match(app,/operation:'spatial_join'/);
  assert.match(app,/pushHistory\(\)/);
});

test('Join & summarize interface contains previews, scopes, duplicate handling and cancellation',()=>{
  assert.match(tools,/Join & summarize/);
  assert.match(tools,/Join by field/);
  assert.match(tools,/Summarize/);
  assert.match(tools,/Join by location/);
  assert.match(tools,/Load CSV \/ JSON lookup/);
  assert.match(tools,/Stop and ask me/);
  assert.match(tools,/Duplicate target geometry for each match/);
  assert.match(tools,/Filtered records/);
  assert.match(tools,/Selected records/);
  assert.match(tools,/Preview join/);
  assert.match(tools,/Preview spatial join/);
  assert.match(tools,/Join processing cancelled/);
  assert.match(css,/\.gis-join-progress/);
  assert.match(css,/\.gis-join-preview/);
});

test('non-spatial summary tables remain editable but are excluded from map-only tools',()=>{
  assert.match(app,/sourceFormat:tableOnly\?'table':'join'/);
  assert.match(app,/if\(file\.tableOnly\|\|isFileSleeping/);
  assert.match(app,/Non-spatial tables do not have a map extent/);
  assert.match(tools,/This tool requires map geometry/);
  assert.match(tools,/A location join requires map geometry/);
  assert.match(tools,/gis-table-row-number/);
});

test('join outputs retain provenance and show a persistent result explanation',()=>{
  assert.match(app,/join:gisClone\(file\.gisJoin\|\|null\)/);
  assert.match(tools,/function joinResultNotice/);
  assert.match(tools,/The original input data was not changed/);
  assert.match(tools,/confirmLargeJoinOutput/);
  assert.match(css,/\.gis-derived-result/);
});


test('join outputs and typed calculations invalidate indexes through the public GIS API',()=>{
  assert.doesNotMatch(app,/(^|[^.\w])invalidateSpatialIndex\?\./m);
  assert.match(app,/window\.EditPolygonGIS\?\.invalidateSpatialIndex\?\.\(file\.id\)/);
  assert.match(app,/window\.EditPolygonGIS\?\.invalidateSpatialIndex\?\.\(fileId\)/);
});

test('join completion wording distinguishes output rows from actual matches',()=>{
  assert.match(tools,/function joinCompletionMessage/);
  assert.match(tools,/Created “\$\{output\?\.name\|\|'Result'\}”/);
  assert.match(tools,/matchedTargets/);
  assert.match(tools,/unmatchedTargets/);
  assert.doesNotMatch(tools,/joined record\(s\)/);
  assert.doesNotMatch(tools,/spatially joined record\(s\)/);
});
