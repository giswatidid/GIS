import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array});vm.runInContext(source,context,{filename:'gis-processing-registry.js'});return window.EditPolygonGISProcessingRegistry;}

const expected=[
  'buffer','centroid','point-on-surface','convex-hull','bounding-geometry','points-along-line',
  'union','intersection','difference','symmetric-difference','clip',
  'dissolve','singlepart-to-multipart',
  'multipart-to-singlepart','polygon-to-line','line-to-points',
  'select-by-attribute','select-by-location','invert-selection','select-duplicates','select-invalid',
  'nearest-feature','distance-to-nearest','count-points-in-polygon','join-by-location','spatial-summary',
  'fix-geometries','remove-duplicate-vertices','remove-duplicate-features','snap','simplify','densify'
];

test('v1.56.1 registry publishes the complete planned Processing Toolbox catalogue',()=>{
  const api=load();
  assert.equal(api.version,'1.56.1');
  assert.deepEqual(api.getTools().map(tool=>tool.id),expected);
  assert.deepEqual(api.getCategories().map(category=>category.id),['geometry','overlay','aggregation','conversion','selection','spatial','maintenance']);
  assert.equal(api.getTools().length,32);
});

test('tool metadata describes inputs, result kinds, engines and mutation policies declaratively',()=>{
  const api=load();
  const difference=api.getTool('difference');
  assert.equal(difference.engine,'geos');
  assert.equal(difference.execution,'overlay');
  assert.deepEqual(difference.inputs.map(input=>input.id),['source','overlay']);
  assert.equal(api.requiresOverlay('difference'),true);
  assert.equal(api.requiresOverlay('buffer'),false);
  assert.equal(api.getTool('select-by-location').resultKind,'selection');
  assert.equal(api.getTool('simplify').mutationPolicy,'new-or-modify');
  assert.equal(api.getTool('buffer').mutationPolicy,'new-layer');
  assert.equal(api.getTool('dissolve').parameters.some(p=>p.type==='field'),true);
});

test('catalogue is clone-safe and searchable across titles, descriptions, categories and keywords',()=>{
  const api=load(),buffer=api.getTool('buffer');
  buffer.title='changed';
  assert.equal(api.getTool('buffer').title,'Buffer');
  assert.ok(api.search('erase').some(tool=>tool.id==='difference'));
  assert.ok(api.search('nearest').some(tool=>tool.id==='nearest-feature'));
  assert.ok(api.search('repair').some(tool=>tool.id==='fix-geometries'));
  assert.equal(api.search('definitely-not-a-tool').length,0);
});
