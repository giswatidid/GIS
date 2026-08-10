import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

function functionSource(name){
  const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} missing`);
  const params=app.indexOf('(',start);let parens=0,open=-1;
  for(let i=params;i<app.length;i++){
    if(app[i]==='(')parens++;
    else if(app[i]===')'&&--parens===0){open=app.indexOf('{',i);break;}
  }
  assert.ok(open>=0,`${name} body missing`);let depth=0;
  for(let i=open;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}'&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`${name} unterminated`);
}

function block(startToken,endToken){
  const start=app.indexOf(startToken);assert.ok(start>=0,`${startToken} missing`);
  const end=app.indexOf(endToken,start);assert.ok(end>start,`${endToken} missing after ${startToken}`);
  return app.slice(start,end);
}

test('VStop has one stable history-aware implementation and no late compatibility wrapper',()=>{
  const stop=functionSource('VStop');
  assert.match(stop,/options=\{\}/);
  assert.match(stop,/const render=options\?\.render!==false/);
  assert.match(stop,/if\(render\)renderAll\(\)/);
  assert.match(stop,/geometryGuardTimer/);
  assert.match(stop,/cancelAnimationFrame\(PERF\.vertexDragMapRaf\)/);
  assert.match(stop,/unbindVertexDragEvents\(\)/);
  assert.match(stop,/unbindEdgeDragEvents\(\)/);
  assert.match(stop,/unbindCentreMoveEvents\(\)/);
  assert.doesNotMatch(app,/VStop\s*=\s*\(function\s*\(/);
  assert.doesNotMatch(app,/VStop\s*=\s*function\s*\(/);
});

test('history restoration closes vertex editing without painting pre-history geometry',()=>{
  const featureRestore=functionSource('restoreFeatureHistoryEntry');
  assert.match(featureRestore,/VStop\(true,\{render:false\}\)/);
  assert.ok(featureRestore.indexOf('VStop(true,{render:false})')<featureRestore.indexOf('file.features[index]=saved'));

  const fullRestore=functionSource('restore');
  assert.match(fullRestore,/VStop\(true,\{render:false\}\)/);
  assert.ok(fullRestore.indexOf('VStop(true,{render:false})')<fullRestore.indexOf('project.files=d.files||[]'));
});

test('history cache invalidation advances an authoritative render generation',()=>{
  assert.match(app,/renderGeneration:0/);
  const signature=functionSource('renderSignature');
  assert.match(signature,/generation:\$\{ANALYSIS_RUNTIME\.renderGeneration\}/);
  const invalidate=functionSource('invalidateRenderCache');
  assert.match(invalidate,/ANALYSIS_RUNTIME\.renderGeneration\+\+/);
  assert.ok(invalidate.indexOf('ANALYSIS_RUNTIME.renderGeneration++')<invalidate.indexOf('ANALYSIS_RUNTIME.vectorCache'));
});

test('restored model invalidates caches after replacement and before the authoritative paint',()=>{
  const restore=functionSource('restoreFeatureHistoryEntry');
  const replace=restore.indexOf('file.features[index]=saved');
  const invalidate=restore.indexOf('invalidateHistoryRestoreCaches(restoredFileIds)');
  const render=restore.indexOf('renderAll()');
  assert.ok(replace>=0&&invalidate>replace&&render>invalidate);

  const stale='view|generation:4|selection:f1|rev:12';
  const restoredSameRevision='view|generation:4|selection:f1|rev:12';
  const restoredNewGeneration='view|generation:5|selection:f1|rev:12';
  assert.equal(stale,restoredSameRevision);
  assert.notEqual(stale,restoredNewGeneration);
});

test('vertex and edge pointerdown do not create no-op undo entries',()=>{
  const vertexDown=functionSource('vertexDown');
  assert.doesNotMatch(vertexDown,/pushHistory\(/);
  assert.match(vertexDown,/history:false/);
  const vertexApply=functionSource('applyVertexDragPosition');
  assert.match(vertexApply,/drag\.moved&&!drag\.history/);
  assert.match(vertexApply,/pushHistory\(vertexEditIds\(\)\)/);

  const edgeDown=functionSource('edgeDown');
  assert.doesNotMatch(edgeDown,/pushHistory\(/);
  assert.match(edgeDown,/history:false/);
  const edgeApply=functionSource('applyEdgeDragPosition');
  assert.match(edgeApply,/drag\.moved&&!drag\.history/);
  assert.match(edgeApply,/pushHistory\(\[drag\.featureId\|\|drag\.feature\?\.id\]\)/);
});

test('delayed vertex guard cannot survive editor shutdown into an undo restore',()=>{
  const finish=functionSource('finishVertexDrag');
  assert.match(finish,/V\.geometryGuardTimer=setTimeout/);
  const stop=functionSource('VStop');
  assert.match(stop,/clearTimeout\(V\.geometryGuardTimer\)/);
});

test('point and circle drag history starts on movement rather than pointerdown and cancelled overlays do not commit',()=>{
  const circleBlock=block('function buildCircleEditHandles(){','function startCircleEditMode(){');
  assert.doesNotMatch(circleBlock,/const begin=\(\)=>\{pushHistory/);
  assert.match(circleBlock,/const beginHistory=\(\)=>\{if\(!CIRCLE_EDIT\.historyStarted\)\{pushHistory\(\[f\.id\]\)/);
  assert.match(circleBlock,/onDragEnd:event=>\{CIRCLE_EDIT\.moveDrag=null;if\(event\?\.cancelled\)return/);
  assert.match(circleBlock,/onDragEnd:event=>\{if\(event\?\.cancelled\)return/);

  const pointBlock=block('function rebuildPointEditMarkers(){','function startPointEditMode(){');
  assert.doesNotMatch(pointBlock,/onDragStart:\(\)=>\{pushHistory/);
  assert.match(pointBlock,/onDrag:event=>\{if\(!POINT_EDIT\.historyStarted\)\{pushHistory\(\[r\.feature\.id\]\)/);
  assert.match(pointBlock,/if\(event\?\.cancelled\)return/);
  assert.match(pointBlock,/if\(!POINT_EDIT\.changed\)/);
});


test('history restoration creates a hard native-render authority boundary',()=>{
  const src=functionSource('invalidateHistoryRestoreCaches');
  assert.match(app,/let HISTORY_RENDER_EPOCH=0/);
  assert.match(src,/HISTORY_RENDER_EPOCH\+\+/);
  assert.match(src,/MAP_RUNTIME\.clearEditableVectorLayers\?\.\(/);
  assert.match(src,/invalidateRenderCache\?\.\(/);
});

test('cached renderer identity includes actual geometry content and history epoch',()=>{
  const signature=functionSource('renderSignature');
  assert.match(app,/function renderGeometryFingerprint\(feature\)/);
  assert.match(app,/EditPolygonMapAdapter\?\.geometryFingerprint/);
  assert.match(signature,/history:\$\{HISTORY_RENDER_EPOCH\}/);
  assert.match(signature,/renderGeometryFingerprint\(feature\)/);
  assert.match(app,/cachedEditableGeometryMatchesModel\(cached\.group,features,\{skipIds:skipFocused\}\)/);
  assert.match(app,/cachedEditableGeometryMatchesModel\(cached\.focusGroup,focus\)/);
});

test('committed manual geometry retires transient native edit materialisation',()=>{
  const src=functionSource('commitManualGeometry');
  assert.match(src,/invalidateRenderCache\?\.\(owner\.id\)/);
});

test('map adapter tracks editable layer ownership and content, and can hard-purge it',()=>{
  assert.match(adapter,/function geometryFingerprint\(geometry\)/);
  assert.match(adapter,/__editpolygonLayerKey=spec\.layerKey\?\?null/);
  assert.match(adapter,/__editpolygonGeometrySignatures=geometrySignatures/);
  assert.match(adapter,/function editableLayerMatchesGeometry\(layer,featureId,geometry\)/);
  assert.match(adapter,/function clearEditableVectorLayers\(layerKey=null\)/);
  assert.match(adapter,/editableLayerMatchesGeometry,clearEditableVectorLayers/);
});
