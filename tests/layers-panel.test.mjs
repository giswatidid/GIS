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
