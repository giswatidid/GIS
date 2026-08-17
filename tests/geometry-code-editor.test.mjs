import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');
const start=app.indexOf('/* v125: geometry-code editor integrated inside the core app closure. */');
const end=app.indexOf('\nshowAutosaveRecoveryIfAvailable();',start);
const editor=app.slice(start,end);

test('Geometry code is restored to the known-good polygon-only implementation',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(editor,/The editor accepts a Polygon or MultiPolygon geometry/);
  assert.match(editor,/Selected polygon GeoJSON geometry/);
  assert.doesNotMatch(editor,/EDITABLE_GEOMETRY_TYPES/);
  assert.doesNotMatch(editor,/geometryFamilyLabel/);
});

test('generic Point and Line Inspectors no longer receive the failed geometry-code retrofit',()=>{
  assert.doesNotMatch(app,/data-gce-section="code"/);
  assert.doesNotMatch(app,/gceOpenButton/);
  assert.doesNotMatch(app,/Final Geometry code Inspector reconciliation failed/);
});

test('polygon Geometry-code styling uses the original v53 details host without generic accordion overrides',()=>{
  assert.match(css,/v125: selected-polygon GeoJSON editor/);
  assert.match(css,/\.gce-inspector-section \.v53-section-body/);
  assert.doesNotMatch(css,/\.gce-generic-section/);
});
