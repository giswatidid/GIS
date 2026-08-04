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
  assert.match(html,/gis-schema-core\.js\?v=20260804-typed-fields-1520/);
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
