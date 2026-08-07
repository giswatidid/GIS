import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');
const mobileCss=fs.readFileSync(new URL('../docs/assets/editpolygon-mobile.css',import.meta.url),'utf8');

test('Layers panel has a persisted horizontal resizer with enforced bounds',()=>{
  assert.match(app,/storageKey:'editpolygon\.leftSidebarWidth\.v149'/);
  assert.match(app,/minWidth:280/);
  assert.match(app,/hardMax:620/);
  assert.match(app,/role','separator'/);
  assert.match(app,/setPointerCapture/);
  assert.match(app,/ArrowLeft/);
  assert.match(app,/ArrowRight/);
  assert.match(app,/dblclick/);
  assert.match(css,/\.v149-sidebar-width-resizer/);
});

test('mobile mode disables desktop horizontal resizing',()=>{
  assert.match(mobileCss,/body\.v151-mobile-layout \.v149-sidebar-width-resizer\{display:none!important;\}/);
});

test('compact Layers actions and accurate result counts remain wired',()=>{
  assert.match(app,/v149UpdateLayerResults/);
  assert.match(app,/features · .*layers/);
  assert.match(app,/Copy first style/);
  assert.match(app,/Delete selected/);
  assert.match(css,/\.v149-bulk-actions/);
});

test('layer More menu is grouped, geometry-aware and viewport-safe',()=>{
  assert.match(app,/v1\.53\.3 — bounded, consistent layer and GIS popovers/);
  assert.match(app,/window\.EditPolygonPositionPopover/);
  assert.match(app,/v1533GeometryFamily/);
  assert.match(app,/v1533SortOptions/);
  for(const section of ['View','Layer','Layer order','Appearance','Remove'])assert.match(app,new RegExp(`v1533MenuGroup\\('${section}'`));
  assert.match(app,/Select all \$\{family\.noun\}/);
  assert.match(app,/Sort \$\{family\.noun\}/);
  assert.doesNotMatch(app,/Select all polygons in layer/);
  assert.doesNotMatch(app,/Sort polygons/);
  assert.match(css,/\.layer-menu\.v1533-layer-menu/);
  assert.match(css,/overflow-y:auto!important/);
  assert.match(css,/position:sticky/);
});

test('layer More menu keeps styling concise and destructive actions separate',()=>{
  const release=app.slice(app.indexOf('v1.53.3 — bounded, consistent layer and GIS popovers'));
  assert.match(release,/Style & labels…/);
  assert.match(release,/Paste copied style/);
  assert.match(release,/Switch to single symbol/);
  assert.match(release,/v1533-menu-danger-group/);
  assert.doesNotMatch(release,/Create new polygon group after this/);
  assert.doesNotMatch(release,/data-v150-layer-color/);
});
