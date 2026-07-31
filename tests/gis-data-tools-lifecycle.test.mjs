import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../docs/assets/gis-data-tools.js', import.meta.url), 'utf8');

test('attribute tools initialise immediately when loaded after DOMContentLoaded', () => {
  assert.match(source, /if\(document\.readyState==='loading'\).*else initialise\(\)/s);
});

test('attribute tools observe editable GIS rows rendered after startup', () => {
  assert.match(source, /new MutationObserver/);
  assert.match(source, /gis-layer-row\[data-layer-key\^=/);
  assert.match(source, /observer\.observe\(target,\{childList:true,subtree:true\}\)/);
});

test('attribute tools expose a supported manual recovery hook', () => {
  assert.match(source, /window\.EditPolygonGISDataTools=Object\.freeze\(\{open,openLayer:open,ensureButtons:queueEnsureButtons\}\)/);
});
