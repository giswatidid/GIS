import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-ui-integration.js',import.meta.url),'utf8');

test('typed schema core loads before the application',()=>{
  assert.ok(html.indexOf('gis-schema-core.js')>html.indexOf('gis-data-core.js'));
  assert.ok(html.indexOf('gis-schema-core.js')<html.indexOf('editpolygon-app.js'));
  assert.match(html,/gis-schema-core\.js\?v=20260817-v1561-mixed-geometry-hotfix/);
});

test('application exposes schema, saved-filter, type-safe calculator and scoped export APIs',()=>{
  for(const name of ['getSchema','previewSchemaChange','addSchemaField','updateSchemaField','deleteSchemaField','saveFilter','applySavedFilter','deleteSavedFilter','exportLayerRecords'])assert.match(app,new RegExp(name));
  assert.match(app,/schemaVersion:VERSION/);
  assert.match(app,/Typed field initialisation failed/);
  assert.match(app,/data\?\.editpolygonSchema/);
  assert.match(app,/defaultValue:nullable\?null/);
});

test('attribute workspace includes typed table controls, schema editing and compound saved filters',()=>{
  assert.match(tools,/gis-typed-cell/);
  assert.match(tools,/Click a heading to sort\. Shift-click adds another sort field/);
  assert.match(tools,/Field schema/);
  assert.match(tools,/Preview change/);
  assert.match(tools,/All conditions \(AND\)/);
  assert.match(tools,/Saved filters/);
  assert.match(tools,/Type-safe field calculator/);
  assert.match(tools,/Filtered records/);
  assert.match(tools,/Selected records/);
  assert.match(tools,/datetimeLocalValue/);
  assert.match(tools,/field\.type==='datetime'\?'1'/);
});

test('Inspector uses schema types and honours read-only fields',()=>{
  assert.match(ui,/typedInspectorControl/);
  assert.match(ui,/field\.readOnly/);
  assert.match(ui,/datetime-local/);
  assert.match(ui,/datetimeLocalValue/);
  assert.match(ui,/NULL/);
});


test('typed field API registration remains inside the live application scope',()=>{
  const marker=app.indexOf('/* v1.52.2 — typed field schemas');
  const registration=app.indexOf('Object.assign(window.EditPolygonGIS,{',marker);
  const finalClose=app.indexOf('// Close the main EditPolygon application scope after all enhancements.',marker);
  assert.ok(marker>0,'typed field block marker missing');
  assert.ok(registration>marker,'typed field API registration missing');
  assert.ok(finalClose>registration,'main application closes before typed APIs register');
  assert.equal(app.slice(marker,registration).includes('\n})();\n'),false,'typed field block escaped the main application scope');
});
