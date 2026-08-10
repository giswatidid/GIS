import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

test('WMS display does not force anonymous CORS on image tiles',()=>{
  const leafStart=adapter.indexOf('function createWmsLayer(spec={})',adapter.indexOf('function createLeafletRuntime'));
  const olRuntime=adapter.indexOf('function createOpenLayersRuntime');
  const olStart=adapter.indexOf('function createWmsLayer(spec={})',olRuntime);
  const olEnd=adapter.indexOf('function parseDash',olStart);
  assert.ok(leafStart>=0&&olStart>=0&&olEnd>olStart);
  const leaf=adapter.slice(leafStart,olRuntime);
  const ol=adapter.slice(olStart,olEnd);
  assert.match(leaf,/if\(spec\.crossOrigin!=null\)options\.crossOrigin=spec\.crossOrigin/);
  assert.doesNotMatch(leaf,/crossOrigin:true/);
  assert.match(ol,/if\(spec\.crossOrigin!=null\)sourceOptions\.crossOrigin=spec\.crossOrigin/);
  assert.doesNotMatch(ol,/crossOrigin:'anonymous'/);
});

test('GeoServer WMS gets tiled/server hints without requiring provider-specific application code',()=>{
  const olStart=adapter.indexOf('function createWmsLayer(spec={})',adapter.indexOf('function createOpenLayersRuntime'));
  const olEnd=adapter.indexOf('function parseDash',olStart);
  const ol=adapter.slice(olStart,olEnd);
  assert.ok(ol.includes('/\\/geoserver(?:\\/|$)/i'));
  assert.match(ol,/params\.TILED=true/);
  assert.match(ol,/sourceOptions\.serverType='geoserver'/);
  assert.match(ol,/transition:spec\.transition\?\?0/);
});

test('WMS capability discovery is best-effort and persists advertised bounds for zooming',()=>{
  assert.match(app,/async function gisDiscoverWmsBounds\(source\)/);
  assert.match(app,/GetCapabilities/);
  assert.match(app,/EX_GeographicBoundingBox/);
  assert.match(app,/LatLonBoundingBox/);
  assert.match(app,/setTimeout\(\(\)=>controller\.abort\(\),3500\)/);
  assert.match(app,/gisDiscoverWmsBounds\(source\)\.then\(info=>/);
  assert.match(app,/stored\.bounds=info\.bounds/);
  assert.match(app,/MAP_RUNTIME\.fitExtent\(info\.bounds,\{padding:\[40,40\],maxZoom:12\}\)/);
});

test('OpenLayers service visibility owns map membership just like Leaflet',()=>{
  const runtimeStart=adapter.indexOf('function createOpenLayersRuntime');
  const start=adapter.indexOf('function setDisplayLayerVisible(layer,visible)',runtimeStart);
  const end=adapter.indexOf('function setDisplayLayerZIndex',start);
  const block=adapter.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(!hasDisplayLayer\(layer\)\)addDisplayLayer\(layer\)/);
  assert.match(block,/else if\(hasDisplayLayer\(layer\)\)removeDisplayLayer\(layer\)/);
  assert.match(block,/layer\.setVisible\?\.\(show\)/);
});
