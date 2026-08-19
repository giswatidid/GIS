import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');

test('authoritative bridge owns prepared preview commits behind fingerprint validation',()=>{
  const bridgeStart=app.indexOf('/* v1.56.1 — Processing Toolbox application bridge.');
  const bridgeEnd=app.indexOf('/* v1.56.1 — runtime authority boundary.');
  const bridge=app.slice(bridgeStart,bridgeEnd);
  assert.ok(bridgeStart>=0&&bridgeEnd>bridgeStart);
  assert.match(bridge,/function processingRequestFingerprint/);
  assert.match(bridge,/function commitPreparedProcessingResult/);
  assert.match(bridge,/fingerprint!==currentFingerprint/);
  assert.match(bridge,/commitProcessingResult\(preflight,prepared,\{worker,prepared:true\}\)/);
  const prepared=bridge.match(/async function commitPreparedProcessingResult[\s\S]*?(?=\n  function cancelProcessing)/)?.[0]||'';
  assert.doesNotMatch(prepared,/createProcessingLayer\(/);
  assert.doesNotMatch(prepared,/modifyProcessingSource\(/);
  assert.match(bridge,/getProcessingPreviewFingerprint:processingRequestFingerprint/);
});

test('Processing UI supports live preview and verified prepared-result reuse with stale fallback',()=>{
  assert.match(ui,/function scheduleAutoPreview/);
  assert.match(ui,/data-processing-live-preview/);
  assert.match(ui,/maxAutoFeatures/);
  assert.match(ui,/preparedResult/);
  assert.match(ui,/commitPreparedProcessingResult/);
  assert.match(ui,/if\(!result\)result=await state\.api\.runProcessingRequest/);
  assert.match(ui,/verticesRemoved/);
  assert.match(ui,/verticesAdded/);
  assert.match(ui,/verticesMoved/);
});
