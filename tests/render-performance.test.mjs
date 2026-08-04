import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');

test('bulk editable vector features share a Canvas renderer',()=>{
  assert.match(app,/bulkVectorRenderer:L?null/);
  assert.match(app,/L\.canvas\(\{padding:0\.5,tolerance:8\}\)/);
  assert.match(app,/renderer:bulkRenderer/);
  assert.match(app,/pointToLayer:[\s\S]*renderer:bulkRenderer/);
});

test('map movement skips image rendering for vector-only projects',()=>{
  assert.match(app,/function hasVisibleImageOverlays\(\)/);
  assert.match(app,/function scheduleImageOverlayMoveRender\(\)/);
  assert.match(app,/requestAnimationFrame/);
  assert.doesNotMatch(app,/map\.on\('move resize',\(\)=>\{scheduleOverlayRender\(\);renderImageOverlays\(\);\}\)/);
});

test('performance release uses a fresh application cache key',()=>{
  assert.match(html,/editpolygon-app\.js\?v=20260804-stability-1512/);
});
