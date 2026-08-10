import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');

test('CRS core loads before the main application',()=>{
  assert.ok(html.indexOf('gis-crs-core.js')<html.indexOf('editpolygon-app.js'));
  assert.match(html,/gis-crs-core\.js\?v=20260810-mobile-parity-1554417/);
});

test('application exposes assignment, coordinate interpretation and CRS-aware export APIs',()=>{
  for(const name of ['getLayerCrsInfo','assignCrs','interpretCoordinates','setExportCrs','exportLayerCrs','transformCoordinate','transformGeometry'])assert.match(app,new RegExp(name));
  assert.match(app,/gisStorageCrs='EPSG:4326'/);
  assert.match(app,/gisSourceCrs/);
});

test('CRS interface clearly separates metadata assignment from reprojection',()=>{
  assert.match(tools,/Assign metadata only/);
  assert.match(tools,/Interpret current coordinates and reproject to map/);
  assert.match(tools,/Download layer/);
  assert.match(tools,/RFC 7946 GeoJSON is always WGS 84/);
});

test('CRS release detects ArcGIS source CRS and offers multi-format export',()=>{
  assert.match(app,/sourceSpatialReference/);
  assert.match(app,/latestWkid\|\|sr\.wkid/);
  assert.match(app,/format==='shp'/);
  assert.match(app,/wktDefinition\(target\)/);
  assert.match(tools,/Shapefile ZIP \+ \.prj/);
  assert.match(tools,/CSV \+ geometry WKT/);
});
