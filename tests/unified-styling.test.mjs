import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const dataTools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-ui-integration.js',import.meta.url),'utf8');
const styleSource=fs.readFileSync(new URL('../docs/assets/gis-style-core.js',import.meta.url),'utf8');

const context={console,JSON,Math,Number,String,Object,Array,Set,Map,Date,Error};
context.window=context;
context.globalThis=context;
vm.createContext(context);
vm.runInContext(styleSource,context,{filename:'gis-style-core.js'});
const styleCore=context.EditPolygonGISStyleCore;

test('advanced style compilation classifies values without discarding the configured base symbol',()=>{
  const style=styleCore.buildStyle({
    type:'categorized',field:'status',target:'color',
    symbol:{color:'#123456',fillColor:'#123456',weight:4,fillOpacity:.4,opacity:.9,radius:7},
    colorRamp:['#0000ff','#ff0000']
  },[
    {properties:{status:'OPEN'}},
    {properties:{status:'CLOSED'}}
  ]);
  const render=styleCore.compileStyle(style);
  const symbol=render({status:'OPEN'},'Polygon',{weight:1,radius:2});
  assert.equal(symbol.weight,4);
  assert.equal(symbol.radius,7);
  assert.match(symbol.fillColor,/^#[0-9a-f]{6}$/i);
});

test('application resolves simple style, advanced style, feature override and temporary highlight in order',()=>{
  const start=app.indexOf('function gisResolvedFeatureStyle');
  const end=app.indexOf('function gisTouchStyle',start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  const simple=body.indexOf('gisLayerSimpleStyle(file)');
  const advanced=body.indexOf('compiled(feature?.properties');
  const override=body.indexOf('feature?.styleOverride');
  const selected=body.indexOf("feature?.id===project.selectedFeatureId");
  assert.ok(simple>=0&&advanced>simple&&override>advanced&&selected>override,body);
});

test('simple editors clearly lock while advanced styling is active',()=>{
  assert.match(app,/Advanced styling active/);
  assert.match(app,/The simple colour control cannot edit a data-driven style/);
  assert.match(app,/Switch to single symbol/);
  assert.match(app,/Override this feature/);
  assert.match(app,/Use layer style/);
  assert.match(dataTools,/styleMode\|\|'simple'/);
  assert.match(ui,/styleBadge/);
  assert.match(ui,/data-style-simple/);
  assert.match(ui,/data-style-advanced/);
});
