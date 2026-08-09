import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

test('saved distance and area measurements expose draggable vertices and midpoint insertion handles',()=>{
  const block=app.slice(app.indexOf('function clearMeasurementEditHandles'),app.indexOf('function measureLabelHtml'));
  assert.match(block,/function renderMeasurementEditHandles\(\)/);
  assert.match(block,/\['distance','area'\]\.includes\(MEASURE\.type\)/);
  assert.match(block,/draggable:true/);
  assert.match(block,/MEASURE\.points\[index\]=event\.lonLat\.slice\(\)/);
  assert.match(block,/MEASURE\.points\.splice\(index\+1,0,midpoint\)/);
  assert.match(block,/updateMeasurementEditVectors\(\)/);
});

test('editing a saved measurement does not use pointer movement as an extra trailing vertex',()=>{
  assert.match(app,/function measureMouseMove\(e\)\{\s*if\(!MEASURE\.active\|\|MEASURE\.editingId\)return;/s);
  assert.match(app,/if\(!MEASURE\.editingId&&MEASURE\.cursor&&\(MEASURE\.type==='distance'\|\|MEASURE\.type==='area'\)\)pts\.push\(MEASURE\.cursor\)/);
});

test('measurement create edit and delete actions participate in project undo redo',()=>{
  assert.match(app,/function measurementHistoryEntry\(\)/);
  assert.match(app,/kind:'measurements'/);
  assert.match(app,/function pushMeasurementHistory\(\)/);
  assert.match(app,/entry\?\.kind==='measurements'.*restoreMeasurementHistoryEntry/s);
  assert.match(app,/entry\?\.kind==='measurements'.*measurementHistoryEntry\(\)/s);
  const save=app.slice(app.indexOf('function saveMeasureOverlay'),app.indexOf('function finishMeasure'));
  assert.ok((save.match(/pushMeasurementHistory\(\)/g)||[]).length>=2);
  const delStart=app.indexOf('function deleteMeasure');
  const del=app.slice(delStart,app.indexOf('window.__deleteMeasure',delStart));
  assert.match(del,/pushMeasurementHistory\(\)/);
});

test('full structural history snapshots also retain saved measurements',()=>{
  const compact=app.slice(app.indexOf('snapshot=function(){',app.indexOf('Compact scalable undo states')),app.indexOf('restore=function(s)',app.indexOf('Compact scalable undo states')));
  assert.match(compact,/measurements:MEASURE\.items/);
});
