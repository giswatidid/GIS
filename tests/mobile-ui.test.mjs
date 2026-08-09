import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../docs/assets/editpolygon-mobile.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon-mobile.css',import.meta.url),'utf8');

test('mobile controller is loaded last and identifies the v1.51.2 baseline',()=>{
  assert.match(js,/const VERSION='1\.51\.2'/);
  assert.ok(html.indexOf('editpolygon-mobile.js')>html.indexOf('gis-ui-integration.js'));
});

test('mobile layout uses map-first drawers for Layers and Inspector',()=>{
  assert.match(js,/data-v151-drawer/);
  assert.match(js,/openDrawer\(name/);
  assert.match(js,/resetDrawerScroll/);
  assert.match(js,/aria-modal/);
  assert.match(css,/\.sidebar\.v151-mobile-drawer-open/);
  assert.match(css,/#selectedSection\.v151-mobile-drawer-open/);
  assert.match(css,/\.v151-mobile-backdrop/);
});

test('mobile project and context sheets are independent of desktop dropdown geometry',()=>{
  assert.match(js,/v151MobileProjectMenu/);
  assert.match(js,/Mobile project menu is deliberately separate from the desktop dropdown/);
  assert.match(js,/v151MobileContextSheet/);
  assert.match(js,/scrollTop=0/);
  assert.match(css,/\.v151-mobile-project-menu/);
  assert.match(css,/\.v151-mobile-context-sheet/);
});

test('mobile document prevents page-level horizontal overflow and preserves safe areas',()=>{
  assert.match(css,/overflow-x:hidden!important/);
  assert.match(css,/env\(safe-area-inset-bottom/);
  assert.match(css,/100dvh/);
});
