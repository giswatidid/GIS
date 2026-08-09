import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const analysisSource=fs.readFileSync(new URL('../docs/assets/gis-analysis-core.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapterSource=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

function analysisCore(){
  const context={console,Math,Number,Object,Array,JSON,Date,Map,Set};
  context.globalThis=context;context.window=context;
  vm.createContext(context);
  vm.runInContext(analysisSource,context,{filename:'gis-analysis-core.js'});
  return context.EditPolygonGISAnalysisCore;
}

function plain(value){return JSON.parse(JSON.stringify(value));}

test('longitude-periodic spatial query keeps canonical Australian features visible after repeated world pans',()=>{
  const core=analysisCore();
  const index=core.buildSpatialIndex([
    {id:'qld',bbox:[140,-30,155,-10]},
    {id:'nz',bbox:[165,-48,179,-33]},
    {id:'europe',bbox:[0,40,20,55]}
  ]);
  // 140..180 shifted two complete worlds east => 860..900.
  assert.deepEqual(plain(core.querySpatialIndexWrapped(index,[860,-32,900,0])).sort(),['qld']);
  // Same view shifted three complete worlds west.
  assert.deepEqual(plain(core.querySpatialIndexWrapped(index,[-940,-32,-900,0])).sort(),['qld']);
});

test('world-wrap query respects continuous-longitude project geometry as well as canonical geometry',()=>{
  const core=analysisCore();
  const index=core.buildSpatialIndex([
    {id:'canonical',bbox:[140,-30,155,-10]},
    {id:'moved-one-world',bbox:[500,-30,515,-10]}
  ]);
  const hits=plain(core.querySpatialIndexWrapped(index,[860,-40,900,0])).sort();
  assert.deepEqual(hits,['canonical','moved-one-world']);
});

test('world-wrap query keeps latitude filtering and handles a viewport wider than one world',()=>{
  const core=analysisCore();
  const index=core.buildSpatialIndex([
    {id:'south',bbox:[140,-35,155,-20]},
    {id:'north',bbox:[140,20,155,35]}
  ]);
  assert.deepEqual(plain(core.querySpatialIndexWrapped(index,[860,10,900,45])),['north']);
  assert.deepEqual(plain(core.querySpatialIndexWrapped(index,[-50,-40,400,0])),['south']);
});

test('authoritative viewport renderer and map spatial selection use longitude-periodic spatial queries',()=>{
  const render=/function renderCandidateFeatures\(file\)\{([^}]|\}(?!\n))*?\}/s.exec(appSource)?.[0]||'';
  assert.match(render,/querySpatialIndexWrapped\(file,bbox\)/);
  const geometryMatches=/function geometryMatchesForFile\(file,selectionFeature\)\{[\s\S]*?\n  \}/.exec(appSource)?.[0]||'';
  assert.match(geometryMatches,/querySpatialIndexWrapped\(file,bbox\)/);
});

test('map adapter preserves continuous Web Mercator x and exposes nearest-world longitude helper',()=>{
  const context={console,Math,Number,Object,Array,JSON,Date,URLSearchParams,document:{body:{classList:{add(){},remove(){}}},documentElement:{classList:{add(){},remove(){}}}}};
  context.globalThis=context;context.window=context;
  vm.createContext(context);
  vm.runInContext(adapterSource,context,{filename:'editpolygon-map-adapter.js'});
  const api=context.EditPolygonMapAdapter;
  assert.equal(api.wrapLongitudeNear(153,873),873);
  assert.equal(api.wrapLongitudeNear(153,-567),-567);
  const canonical=api.mercatorWorldPixel([153,-27],2),wrapped=api.mercatorWorldPixel([873,-27],2);
  assert.ok(Math.abs((wrapped.x-canonical.x)-2048)<1e-9); // two 1024px worlds at z2
  assert.equal(wrapped.y,canonical.y);
});
