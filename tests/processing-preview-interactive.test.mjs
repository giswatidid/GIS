import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function registry(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array,Number,Math});vm.runInContext(registrySource,context);return window.EditPolygonGISProcessingRegistry;}

test('preview catalogue distinguishes geometry, selection and data result previews',()=>{
  const r=registry();
  assert.equal(r.getTool('buffer').previewPolicy.kind,'geometry');
  assert.equal(r.getTool('select-by-location').previewPolicy.kind,'selection');
  for(const id of ['nearest-feature','distance-to-nearest','count-points-in-polygon','join-by-location','spatial-summary'])assert.equal(r.getTool(id).previewPolicy.kind,'data');
});

test('Simplify and Densify declare live logarithmic metre sliders while Snap stays manual',()=>{
  const r=registry(),simplify=r.getTool('simplify'),densify=r.getTool('densify'),snap=r.getTool('snap');
  assert.equal(simplify.previewPolicy.mode,'live');assert.equal(densify.previewPolicy.mode,'live');assert.equal(snap.previewPolicy.mode,'manual');
  assert.equal(simplify.parameters.find(p=>p.id==='tolerance').slider.scale,'log');
  assert.equal(densify.parameters.find(p=>p.id==='maxSegmentLength').slider.scale,'log');
  assert.equal(simplify.parameters.find(p=>p.id==='tolerance').slider.max,100000);
});

test('Processing UI source contains explicit activation, stale refresh, data tables and rich maintenance metrics',()=>{
  const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
  for(const token of ['previewActivated','previewStale','Refresh preview','Preview data','data-processing-slider','previewDataResult','maxDisplacementM','featuresUnchanged','longestSegmentBeforeM','longestSegmentAfterM'])assert.ok(ui.includes(token),token);
  assert.match(ui,/!state\.previewActivated\|\|!state\.livePreview/);
});


test('Snap preview metrics align inserted output vertices without inflating displacement',()=>{
  const uiSource=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
  const window={};
  const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,URL,Error,Promise,Uint8Array,Float64Array});
  vm.runInContext(uiSource,context);
  const metrics=JSON.parse(vm.runInContext(`JSON.stringify(window.__editPolygonGISProcessingPreview.comparisonMetrics(
    {toolId:'snap',inputs:{source:[{id:'a',geometry:{type:'LineString',coordinates:[[0,0],[1,0],[2,0]]}}]},parameters:{tolerance:20000}},
    {kind:'layer'},
    [{id:'a',geometry:{type:'LineString',coordinates:[[0,0],[0.5,0],[1.1,0],[2,0]]}}]
  ))`,context));
  assert.equal(metrics.inputVertices,3);
  assert.equal(metrics.outputVertices,4);
  assert.equal(metrics.verticesInserted,1);
  assert.equal(metrics.verticesRemovedBySnap,0);
  assert.equal(metrics.verticesMoved,1);
  assert.ok(metrics.maxDisplacementM>10000&&metrics.maxDisplacementM<12000,`unexpected displacement ${metrics.maxDisplacementM}`);
  assert.ok(metrics.maxDisplacementM<=20000,'reported displacement must not exceed the Snap tolerance');
});
