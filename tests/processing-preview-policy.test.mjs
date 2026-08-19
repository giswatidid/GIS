import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array,Number});vm.runInContext(source,context,{filename:'gis-processing-registry.js'});return window.EditPolygonGISProcessingRegistry;}

test('preview policies are declarative with manual defaults and specialised maintenance policies',()=>{
  const api=load();
  assert.equal(api.getTool('buffer').previewPolicy.mode,'manual');
  assert.equal(api.getTool('select-by-location').previewPolicy.mode,'manual');
  const snap=api.getTool('snap').previewPolicy;
  assert.equal(snap.mode,'manual');assert.equal(snap.expensive,true);
  assert.deepEqual(snap.metrics,['vertices-before','vertices-after','vertices-moved']);
  const simplify=api.getTool('simplify').previewPolicy;
  assert.equal(simplify.mode,'live');assert.equal(simplify.debounceMs,250);assert.equal(simplify.maxAutoFeatures,2500);
  assert.deepEqual(simplify.metrics,['vertices-before','vertices-after','vertices-removed']);
  const densify=api.getTool('densify').previewPolicy;
  assert.equal(densify.mode,'live');assert.deepEqual(densify.metrics,['vertices-before','vertices-after','vertices-added']);
});
