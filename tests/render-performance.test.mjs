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
  assert.match(html,/editpolygon-app\.js\?v=20260808-openlayers-parity-15518-circle-click-pan-swap/);
});


test('OpenLayers cached vector swaps add the replacement before removing the old layer to avoid pan flicker',()=>{
  const start=app.indexOf('function cachedRenderMap()');
  const block=app.slice(start,app.indexOf('function invalidateRenderCache',start));
  assert.ok(start>=0);
  assert.match(block,/if\(MAP_RUNTIME\.engine==='openlayers'\)\{\s*addCachedLayer\(group\);if\(cached\)removeCachedLayer\(cached\.group\);/s);
  assert.match(block,/else\{\s*if\(cached\)removeCachedLayer\(cached\.group\);addCachedLayer\(group\);/s);
});
