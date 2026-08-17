import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');

test('completed processing result keeps the preflight snapshot used by the run',()=>{
  assert.match(source,/const pf=state\.result&&state\.preflight\?state\.preflight:preflight\(\)/);
  assert.match(source,/function invalidateResult\(\)\{state\.result=null;state\.progress=null;\}/);
  assert.match(source,/action==='run-again'\)\{state\.result=null;state\.progress=null;render\(\);\}/);
});
