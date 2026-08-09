import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

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

test('history restoration closes vertex editing without painting pre-history geometry',()=>{
  const stop=functionSource('VStop');
  assert.match(stop,/options=\{\}/);
  assert.match(stop,/const render=options\?\.render!==false/);
  assert.match(stop,/if\(render\)renderAll\(\)/);

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

  // Why this matters: live editing can mutate native geometry while a cache
  // signature still carries the historical revision. Selection changes used
  // to be the next thing that changed the signature and exposed the undo.
  const stale='view|generation:4|selection:f1|rev:12';
  const restoredSameRevision='view|generation:4|selection:f1|rev:12';
  const restoredNewGeneration='view|generation:5|selection:f1|rev:12';
  assert.equal(stale,restoredSameRevision);
  assert.notEqual(stale,restoredNewGeneration);
});
