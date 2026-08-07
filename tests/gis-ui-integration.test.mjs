import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../docs/assets/gis-ui-integration.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const uiCss=fs.readFileSync(new URL('../docs/assets/gis-ui-integration.css',import.meta.url),'utf8');
test('GIS UI module is loaded after the data tools',()=>{
  assert.ok(html.indexOf('gis-data-tools.js') < html.indexOf('gis-ui-integration.js'));
});
test('selected feature bridge exposes inspector data and edits',()=>{
  assert.match(app,/getSelectedFeature:gisSelectedFeatureDetails/);
  assert.match(app,/setFeatureAttributes:gisSetFeatureAttributes/);
  assert.match(app,/setDisplayField:gisSetDisplayField/);
});
test('layer integration provides every grouped GIS workspace action',()=>{
  assert.match(ui,/gis-layer-actions-btn/);
  for(const tab of ['table','select','filter','style','fields','join','crs','process'])assert.ok(ui.includes(`menuAction('${tab}'`));
  for(const section of ['Data','Query & analysis','Presentation','Coordinate system','Settings'])assert.ok(ui.includes(`menuSection('${section}'`));
  assert.match(ui,/Join & summarize/);
  assert.match(ui,/Display field/);
});
test('inspector integration supports summary, all fields and editing',()=>{
  assert.match(ui,/gis-inspector-summary/);
  assert.match(ui,/Edit attributes/);
  assert.match(ui,/Open table/);
  assert.match(ui,/setFeatureAttributes/);
});

test('hidden and locked dataset features remain recoverable in the layer list',()=>{
  assert.match(ui,/gis-persistent-child/);
  assert.match(ui,/gis-hidden-child/);
  assert.match(ui,/showAllHidden/);
  assert.match(app,/setFeatureVisibility:gisSetFeatureVisibility/);
  assert.match(app,/clearFeatureOverrides:gisClearFeatureOverrides/);
});


test('GIS UI refresh is scoped away from the Leaflet map DOM',()=>{
  assert.match(ui,/document\.getElementById\('fileList'\)/);
  assert.match(ui,/document\.getElementById\('selectedPanel'\)/);
  assert.doesNotMatch(ui,/observer\.observe\(document\.body/);
  assert.match(ui,/if\(refreshRaf\)return/);
});

test('lightweight layer snapshots do not calculate CRS bounds during UI refresh',()=>{
  const start=app.indexOf('gisLayerUiSnapshot=function()');
  const end=app.indexOf('Object.assign(window.EditPolygonGIS',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  assert.match(block,/gisFileCrsState\(file\)/);
  assert.doesNotMatch(block,/gisCrsLayerInfo\(x\.id\)/);
  assert.doesNotMatch(block,/gisLayerBounds/);
});

test('GIS shortcut menu stays bounded and restores keyboard focus',()=>{
  assert.match(ui,/EditPolygonPositionPopover/);
  assert.match(ui,/style\.maxHeight/);
  assert.match(uiCss,/overflow-y:auto/);
  assert.match(ui,/menuKeydown/);
  assert.match(ui,/removeLayerMenu\(true\)/);
  assert.match(ui,/aria-expanded/);
});
