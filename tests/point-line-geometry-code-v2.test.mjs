import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const geometryHealthCore=fs.readFileSync(new URL('../docs/assets/gis-geometry-health-core.js',import.meta.url),'utf8');
const START='/* v126-point-line-geometry-code-v2:start */';
const END='/* v126-point-line-geometry-code-v2:end */';
const start=app.indexOf(START),end=app.indexOf(END,start);
assert.ok(start>=0&&end>start,'point/line Geometry code module must be present');
const moduleCode=app.slice(start,end+END.length);

function loadApi(){
  const sandbox={
    console,JSON,Math,Number,String,Array,Object,Set,Map,Promise,Error,
    setTimeout,clearTimeout,
    MutationObserver:class{observe(){} disconnect(){}},
    document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    // Deliberately hostile polygon-only validator. Point/Line Geometry code must
    // never call this legacy helper.
    validateCollectionGeometry:()=>({issues:[{severity:'error',code:'LEGACY_POLYGON_VALIDATOR',message:'Legacy polygon validator was called.'}]}),
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.addEventListener=()=>{};
  vm.createContext(sandbox);
  vm.runInContext(geometryHealthCore,sandbox,{filename:'gis-geometry-health-core.js'});
  vm.runInContext(moduleCode,sandbox,{filename:'point-line-geometry-code-v2.js'});
  return sandbox.__pointLineGeometryCodeV2;
}

const api=loadApi();
const plain=value=>JSON.parse(JSON.stringify(value));

test('Point/Line module stays isolated while the final live Inspector renderer reconciles it',()=>{
  assert.deepEqual(plain(api.supportedTypes),['Point','MultiPoint','LineString','MultiLineString']);
  assert.doesNotMatch(moduleCode,/renderSelected\s*=/);
  assert.doesNotMatch(moduleCode,/window\.renderSelected/);
  assert.match(moduleCode,/new MutationObserver\(/);
  assert.match(moduleCode,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(run\)\)/);
  assert.match(moduleCode,/event\.preventDefault\(\)/);
  assert.match(moduleCode,/event\.stopPropagation\(\)/);
  assert.match(moduleCode,/data-plgce-section="code"/);
  assert.match(moduleCode,/EditPolygonGeometryHealthCore/);
  assert.match(moduleCode,/geometryHealth\.validateFeature/);
  assert.doesNotMatch(moduleCode,/typeof validateCollectionGeometry/);
  assert.match(app,/__pointLineGeometryCodeV2\?\.ensureNow\?\.\(\)/);
  assert.match(app,/Point\/Line Geometry code Inspector reconciliation failed/);
});

test('restored polygon Geometry code remains polygon-only and the failed generic retrofit stays absent',()=>{
  const polygonStart=app.indexOf('/* v125: geometry-code editor integrated inside the core app closure. */');
  const polygonEnd=app.indexOf('\nshowAutosaveRecoveryIfAvailable();',polygonStart);
  assert.ok(polygonStart>=0&&polygonEnd>polygonStart);
  const polygon=app.slice(polygonStart,polygonEnd);
  assert.match(polygon,/The editor accepts a Polygon or MultiPolygon geometry/);
  assert.match(polygon,/Selected polygon GeoJSON geometry/);
  assert.doesNotMatch(polygon,/v126-point-line-geometry-code-v2/);
  assert.doesNotMatch(app,/data-gce-section="code"/);
  assert.doesNotMatch(app,/gceOpenButton/);
  assert.doesNotMatch(app,/Final Geometry code Inspector reconciliation failed/);
  assert.ok(start>polygonEnd,'Point/Line module must be installed after the untouched polygon module');
});

test('Point and MultiPoint code validates and normalises to canonical 2D numbers',()=>{
  const point=api.analyze('{"type":"Point","coordinates":["153","-27",12]}','Point');
  assert.equal(point.valid,true);
  assert.deepEqual(plain(point.proposal),{type:'Point',coordinates:[153,-27]});
  assert.ok(point.changes.some(change=>change.code==='NUMERIC_STRINGS'));
  assert.ok(point.changes.some(change=>change.code==='EXTRA_ORDINATES'));

  const multi=api.analyze('{"type":"MultiPoint","coordinates":[[153,-27],[154,-28]]}','Point');
  assert.equal(multi.valid,true);
  assert.deepEqual(plain(multi.proposal.coordinates),[[153,-27],[154,-28]]);
});

test('LineString and MultiLineString code validates without changing geometry family',()=>{
  const line=api.analyze('[[153,-27],[154,-28]]','LineString');
  assert.equal(line.valid,true);
  assert.deepEqual(plain(line.proposal),{type:'LineString',coordinates:[[153,-27],[154,-28]]});

  const multi=api.analyze('{"type":"MultiLineString","coordinates":[[[153,-27],[154,-28]],[[150,-25],[151,-26]]]}','LineString');
  assert.equal(multi.valid,true);
  assert.equal(multi.proposal.type,'MultiLineString');
  assert.equal(multi.proposal.coordinates.length,2);
});


test('Point and Line validation uses type-aware Geometry Health rather than polygon-only validation',()=>{
  const point=api.analyze('{"type":"Point","coordinates":[142.17575195312497,-18.823877065543243]}','Point');
  assert.equal(point.valid,true);
  assert.ok(!point.issues.some(item=>item.code==='LEGACY_POLYGON_VALIDATOR'));
  assert.ok(!point.issues.some(item=>/unsupported geometry type/i.test(item.message||'')));

  const line=api.analyze('{"type":"LineString","coordinates":[[142.625947265625,-25.016656493537425],[145.438447265625,-24.717624948506227],[147.02047851562503,-22.015105167331043]]}','LineString');
  assert.equal(line.valid,true);
  assert.ok(!line.issues.some(item=>item.code==='LEGACY_POLYGON_VALIDATOR'));
  assert.ok(!line.issues.some(item=>/polygon area|open line/i.test(item.message||'')));

  const collapsed=api.analyze('{"type":"LineString","coordinates":[[153,-27],[153,-27]]}','LineString');
  assert.equal(collapsed.valid,false);
  assert.ok(collapsed.issues.some(item=>item.code==='TOO_FEW_LINE_VERTICES'));
});

test('cross-family, invalid-range, collection and too-short replacements are rejected',()=>{
  const cross=api.analyze('{"type":"Point","coordinates":[153,-27]}','LineString');
  assert.equal(cross.valid,false);
  assert.ok(cross.issues.some(item=>item.code==='GEOMETRY_FAMILY_MISMATCH'));

  const range=api.analyze('{"type":"Point","coordinates":[500,-27]}','Point');
  assert.equal(range.valid,false);
  assert.ok(range.issues.some(item=>item.code==='COORDINATE_RANGE'));

  const collection=api.analyze('{"type":"FeatureCollection","features":[]}','Point');
  assert.equal(collection.valid,false);
  assert.ok(collection.issues.some(item=>item.code==='COLLECTION_INPUT'));

  const short=api.analyze('{"type":"LineString","coordinates":[[153,-27]]}','LineString');
  assert.equal(short.valid,false);
  assert.ok(short.issues.some(item=>item.code==='SHORT_LINE'));
});

test('apply path is canonical and separately identifiable from polygon Geometry code',()=>{
  assert.match(moduleCode,/pushHistory\(\[current\.feature\.id\]\)/);
  assert.match(moduleCode,/addEdit\(current\.feature,'manual'/);
  assert.match(moduleCode,/source:'geometry-code-point-line-v2'/);
  assert.match(moduleCode,/clearFeatureCaches\(current\.feature\)/);
  assert.match(moduleCode,/setDirty\(true\)/);
  assert.match(moduleCode,/renderAll\(\)/);
});
