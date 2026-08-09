import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-data-tools.css',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');

test('main Select control exposes click, rectangle, polygon and lasso modes',()=>{
  for(const kind of ['click','rectangle','polygon','lasso'])assert.match(html,new RegExp(`data-select-tool="${kind}"`));
  assert.match(app,/window\.EditPolygonSelectionTools=Object\.freeze/);
  assert.match(tools,/Select by attribute/);
  assert.match(tools,/Select by location/);
});

test('map selection provides live geometry and measurement feedback',()=>{
  assert.match(app,/gis-spatial-select-preview/);
  assert.match(app,/gis-spatial-select-vertices/);
  assert.match(app,/formatMetricArea\(metrics\.area\)/);
  assert.match(app,/perimeter/);
  assert.match(app,/Drag a box over features/);
  assert.match(app,/Click boundary points/);
  assert.match(app,/Press and drag a freehand boundary/);
  assert.match(css,/\.gis-spatial-select-overlay/);
});

test('selection tools support cancel, finish and keyboard editing',()=>{
  assert.match(app,/data-undo>Undo point/);
  assert.match(app,/data-finish>Finish/);
  assert.match(app,/data-cancel>Cancel/);
  assert.match(app,/event\.key==='Enter'/);
  assert.match(app,/event\.key==='Backspace'\|\|event\.key==='Delete'/);
  assert.match(app,/event\.key==='Escape'/);
});
