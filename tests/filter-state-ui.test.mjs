import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-data-tools.css',import.meta.url),'utf8');

test('filter workspace exposes a persistent active state with match and hidden counts',()=>{
  assert.match(tools,/function activeFilterState\(layer\)/);
  assert.match(tools,/Filter active/);
  assert.match(tools,/features shown/);
  assert.match(tools,/hidden/);
  assert.match(tools,/Update active filter/);
  assert.match(tools,/No active filter/);
});

test('filter state remains visible from the tab and attribute table',()=>{
  assert.match(tools,/function updateFilterTabState\(layer\)/);
  assert.match(tools,/gis-tab-badge/);
  assert.match(tools,/gis-table-filter-state/);
  assert.match(tools,/data-action="open-filter"/);
  assert.match(tools,/data-action="view-filtered-records"/);
});

test('filter state controls provide direct edit and clear actions',()=>{
  assert.match(tools,/else if\(action==='open-filter'\)\{render\('filter'\);\}/);
  assert.match(tools,/else if\(action==='view-filtered-records'\)\{render\('table'\);\}/);
  assert.match(tools,/All features are included again/);
  assert.match(css,/\.gis-filter-state\.active/);
  assert.match(css,/\.gis-data-shell nav button\.has-active-filter/);
  assert.match(css,/\.gis-table-filter-state/);
});
