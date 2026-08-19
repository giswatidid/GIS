import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const RELEASE_KEY='20260819-v1561-point-line-inspector-v4';

test('all local runtime assets use the v1.56.1 release cache key',()=>{
  const refs=[...html.matchAll(/(?:href|src)="(assets\/[^"]+\.(?:css|js))\?v=([^"]+)"/g)];
  assert.ok(refs.length>=15,`Expected the complete local asset set, found ${refs.length}.`);
  const stale=refs.filter(([,asset,key])=>key!==RELEASE_KEY).map(([,asset,key])=>`${asset}: ${key}`);
  assert.deepEqual(stale,[]);
  assert.equal(new Set(refs.map(match=>match[2])).size,1);
});
