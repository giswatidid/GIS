import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');
const start=app.indexOf('/* v126-point-line-geometry-code-v2:start */');
const end=app.indexOf('/* v126-point-line-geometry-code-v2:end */',start);
assert.ok(start>=0&&end>start,'Point/Line Geometry-code module must exist');
const moduleCode=app.slice(start,end);

test('Point/Line Geometry-code card is stable in the desktop Inspector layout',()=>{
  assert.match(css,/\.plgce-section\{[^}]*flex:0 0 auto[^}]*align-self:stretch/);
  assert.match(css,/\.plgce-section\[open\]\{overflow:visible\}/);
  assert.match(moduleCode,/function plgcePlaceSection\(panel,details\)/);
  assert.match(moduleCode,/geometryCard\.nextElementSibling!==details/);
  assert.match(moduleCode,/return plgcePlaceSection\(panel,existing\)/);
});
