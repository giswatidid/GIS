import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array});vm.runInContext(source,context,{filename:'gis-processing-registry.js'});return window.EditPolygonGISProcessingRegistry;}

test('v1.56.0.2 processing registry publishes the controlled first toolbox catalogue',()=>{
  const api=load();
  assert.equal(api.version,'1.56.0.2');
  assert.deepEqual(api.getTools().map(tool=>tool.id),['buffer','centroid','point-on-feature','convex-hull','bbox','clip','intersection','dissolve']);
  assert.deepEqual(api.getCategories().map(category=>category.id),['geometry','overlay','aggregation']);
  assert.equal(api.requiresOverlay('clip'),true);
  assert.equal(api.requiresOverlay('intersection'),true);
  assert.equal(api.requiresOverlay('buffer'),false);
});

test('processing catalogue is declarative, clone-safe and searchable',()=>{
  const api=load(),buffer=api.getTool('buffer');
  assert.equal(buffer.parameters[0].id,'distance');
  assert.equal(buffer.outputGeometry,'Polygon');
  assert.equal(buffer.stylePolicy,'derived','Buffer changes geometry family and must not inherit an incompatible source symbol');
  assert.equal(api.getTool('centroid').stylePolicy,'derived');
  assert.equal(api.getTool('point-on-feature').stylePolicy,'derived');
  assert.equal(api.getTool('clip').stylePolicy,'inherit');
  assert.equal(api.getTool('intersection').stylePolicy,'inherit');
  buffer.title='changed';
  assert.equal(api.getTool('buffer').title,'Buffer');
  assert.ok(api.search('inside').some(tool=>tool.id==='clip'));
  assert.ok(api.search('centre').some(tool=>tool.id==='centroid'));
  assert.equal(api.search('definitely-not-a-tool').length,0);
});
