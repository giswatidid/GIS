import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../docs/assets/editpolygon-mobile.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon-mobile.css',import.meta.url),'utf8');

test('mobile controller is loaded after GIS integration and identifies the current parity release',()=>{
  assert.match(js,/const VERSION='1\.55\.7\.2'/);
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
  assert.match(css,/@media\(max-width:600px\)[\s\S]*width:100vw!important/);
});

test('Advanced GIS is reachable and stateful on the mobile dock and project sheet',()=>{
  assert.match(js,/dataset\.v155Action=name/);
  assert.match(js,/mobileActionButton\('gis','GIS'/);
  assert.match(js,/v155MobileGisProjectAction/);
  assert.match(js,/gisWorkspaceToggle/);
  assert.match(js,/editpolygon:gis-changed/);
  assert.match(css,/\.v155-mobile-action-button\[aria-pressed="true"\]/);
  assert.match(css,/\.gis-workspace-panel/);
});

test('mobile project and context sheets are independent of desktop dropdown geometry',()=>{
  assert.match(js,/v151MobileProjectMenu/);
  assert.match(js,/Mobile project menu is deliberately separate from the desktop dropdown/);
  assert.match(js,/v151MobileContextSheet/);
  assert.match(js,/scrollTop=0/);
  assert.match(css,/\.v151-mobile-project-menu/);
  assert.match(css,/\.v151-mobile-context-sheet/);
});

test('mobile document no longer presents a desktop-preference gate',()=>{
  assert.doesNotMatch(html,/mobileDesktopNotice/);
  assert.doesNotMatch(html,/works best on desktop/i);
  assert.doesNotMatch(js,/editpolygon-mobile-notice-dismissed/);
  assert.match(html,/Phone, tablet and desktop/);
});

test('mobile document prevents page-level horizontal overflow and preserves safe areas',()=>{
  assert.match(css,/overflow-x:hidden!important/);
  assert.match(css,/env\(safe-area-inset-bottom/);
  assert.match(css,/100dvh/);
});

test('mobile parity styles provide touch targets for GIS, layer management and OpenLayers controls',()=>{
  assert.match(css,/#filesSection \.v54-layer-search-row input[\s\S]*height:42px!important/);
  assert.match(css,/\.gis-tabs button[\s\S]*height:46px!important/);
  assert.match(css,/\.gis-eye,[\s\S]*width:38px!important/);
  assert.match(css,/v151-mobile-layout \.ol-control button[\s\S]*width:42px!important/);
  assert.match(css,/\.v151-mobile-sheet-close[\s\S]*width:44px!important/);
});


test('mobile layer and GIS action popovers remain touchable above the Layers drawer',()=>{
  assert.match(css,/#filesSection \.gis-layer-actions-btn,[\s\S]*width:44px!important/);
  assert.match(css,/#filesSection \.layer-kebab[\s\S]*height:44px!important/);
  assert.match(css,/\.layer-menu\.active,[\s\S]*\.gis-layer-action-menu[\s\S]*z-index:6100!important/);
  assert.match(css,/\.gis-layer-action-menu button[\s\S]*min-height:44px!important/);
  assert.match(js,/function isMobilePopoverTarget/);
  assert.match(js,/!isMobilePopoverTarget\(event\.target\)/);
});
