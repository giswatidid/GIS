import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');

test('completed processing and preview results keep the preflight snapshot used by the run',()=>{
  assert.match(source,/const pf=\(state\.result\|\|state\.previewResult\)&&state\.preflight\?state\.preflight:preflight\(\)/);
  assert.match(source,/function invalidateResult\(\)\{const activated=state\.previewActivated\|\|state\.previewing\|\|!!state\.previewResult;state\.result=null;state\.progress=null;clearPreviewState\(\{cancel:true,preserveActivation:activated\}\)/);
  assert.match(source,/state\.previewActivated=activated;state\.previewStale=activated/);
  assert.match(source,/action==='run-again'\)\{state\.result=null;state\.progress=null;render\(\);\}/);
});
