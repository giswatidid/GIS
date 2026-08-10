import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

test('WMS display does not force anonymous CORS on image tiles',()=>{
  const runtimeStart=adapter.indexOf('function createOpenLayersRuntime');
  const start=adapter.indexOf('function createWmsLayer(spec={})',runtimeStart);
  const end=adapter.indexOf('function parseDash',start);
  const block=adapter.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(spec\.crossOrigin!=null\)sourceOptions\.crossOrigin=spec\.crossOrigin/);
  assert.doesNotMatch(block,/crossOrigin:'anonymous'|crossOrigin:true/);
});

test('GeoServer WMS gets tiled/server hints without provider-specific application code',()=>{
  const start=adapter.indexOf('function createWmsLayer(spec={})',adapter.indexOf('function createOpenLayersRuntime'));
  const end=adapter.indexOf('function parseDash',start),block=adapter.slice(start,end);
  assert.ok(block.includes('/\\/geoserver(?:\\/|$)/i'));
  assert.match(block,/params\.TILED=true/);
  assert.match(block,/sourceOptions\.serverType='geoserver'/);
  assert.match(block,/transition:spec\.transition\?\?0/);
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

test('WMS service visibility owns map membership',()=>{
  const runtimeStart=adapter.indexOf('function createOpenLayersRuntime');
  const start=adapter.indexOf('function setDisplayLayerVisible(layer,visible)',runtimeStart);
  const end=adapter.indexOf('function setDisplayLayerZIndex',start),block=adapter.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/if\(!hasDisplayLayer\(layer\)\)addDisplayLayer\(layer\)/);
  assert.match(block,/else if\(hasDisplayLayer\(layer\)\)removeDisplayLayer\(layer\)/);
  assert.match(block,/layer\.setVisible\?\.\(show\)/);
});
