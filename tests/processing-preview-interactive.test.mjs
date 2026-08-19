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
