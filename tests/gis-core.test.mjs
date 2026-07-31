import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-core.js',import.meta.url),'utf8');
const context={
  console,
  URL,
  Date,
  Math,
  JSON,
  crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'}
};
context.globalThis=context;
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'gis-core.js'});
const core=context.EditPolygonGISCore;

test('creates a simple browser-local GIS state by default',()=>{
  const state=core.createDefaultState();
  assert.equal(state.workspace,'simple');
  assert.equal(state.activeBasemap,'builtin:osm');
  assert.equal(state.sources.length,0);
  assert.equal(state.layers.length,0);
});

test('normalises sources, layers and removes orphan layer references',()=>{
  const state=core.normaliseState({
    workspace:'advanced',
    sources:[{id:'source_1',type:'xyz',name:'Tiles',url:'https://tiles/{z}/{x}/{y}.png'}],
    layers:[
      {id:'layer_1',sourceId:'source_1',name:'Tiles',role:'basemap',opacity:2},
      {id:'orphan',sourceId:'missing',name:'Missing'}
    ]
  });
  assert.equal(state.workspace,'advanced');
  assert.equal(state.layers.length,1);
  assert.equal(state.layers[0].opacity,1);
  assert.equal(state.layers[0].role,'basemap');
});

test('validates XYZ and TMS URL templates',()=>{
  assert.equal(core.validateTileTemplate('https://tiles/{z}/{x}/{y}.png').ok,true);
  assert.equal(core.validateTileTemplate('https://tiles/{z}/{x}.png').ok,false);
  assert.match(core.validateTileTemplate('https://tiles/{z}/{x}.png').message,/\{y\}/);
});

test('converts TileJSON into a persisted XYZ source',()=>{
  const source=core.tileJsonToSource({
    name:'Example',
    tiles:['https://tiles/{z}/{x}/{y}.png'],
    minzoom:2,
    maxzoom:18,
    bounds:[140,-30,155,-10],
    attribution:'Example provider'
  },{tileJsonUrl:'https://example.com/tilejson.json'});
  assert.equal(source.type,'xyz');
  assert.equal(source.minZoom,2);
  assert.equal(source.maxZoom,18);
  assert.equal(JSON.stringify(source.bounds),JSON.stringify([140,-30,155,-10]));
  assert.equal(source.metadata.tileJsonUrl,'https://example.com/tilejson.json');
});

test('describes remote source privacy accurately',()=>{
  const policy=core.networkPolicy({type:'wms'});
  assert.equal(policy.scope,'remote');
  assert.match(policy.detail,/browser contacts this provider directly/i);
  assert.match(policy.detail,/geometry is not sent/i);
});
