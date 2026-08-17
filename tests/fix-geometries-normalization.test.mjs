import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
const healthSource=fs.readFileSync(new URL('../docs/assets/gis-geometry-health-core.js',import.meta.url),'utf8');
const engineSource=fs.readFileSync(new URL('../docs/assets/gis-processing-engine.js',import.meta.url),'utf8');

function load(){
  const window={};
  const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,Error,Intl,RegExp,Boolean});
  vm.runInContext(coreSource,context,{filename:'gis-processing-core.js'});
  vm.runInContext(healthSource,context,{filename:'gis-geometry-health-core.js'});
  vm.runInContext(engineSource,context,{filename:'gis-processing-engine.js'});
  return window;
}

const crs={transformGeometry:g=>JSON.parse(JSON.stringify(g))};

test('Fix geometries normalises winding after GEOS MakeValid',async()=>{
  const window=load();
  const source=[{
    id:'bow-tie',type:'Feature',properties:{name:'Bow tie'},
    geometry:{type:'Polygon',coordinates:[[[0,0],[2,2],[0,2],[2,0],[0,0]]]}
  }];
  const makeValidResult={type:'MultiPolygon',coordinates:[
    [[[0,0],[0,2],[1,1],[0,0]]],
    [[[2,0],[1,1],[2,2],[2,0]]]
  ]};
  window.EditPolygonGeosAdapter={
    geometryEmpty:()=>false,
    validity:()=>({valid:false}),
    makeValidGeometry:()=>JSON.parse(JSON.stringify(makeValidResult))
  };

  const result=await window.EditPolygonGISProcessingEngine.execute({
    tool:{id:'fix-geometries',engine:'geometry-health',resultKind:'layer',crsPolicy:'canonical'},
    inputs:{source},parameters:{},processingCrs:'EPSG:4326'
  },{geos:{},crs});

  assert.equal(result.summary.failed,0);
  assert.equal(result.features.length,1);
  assert.equal(result.features[0].geometry.type,'MultiPolygon');
  for(const polygon of result.features[0].geometry.coordinates){
    assert.ok(window.EditPolygonGeometryHealthCore.ringArea(polygon[0])>0,'outer rings should use GeoJSON winding');
  }
  const health=window.EditPolygonGeometryHealthCore.validateFeature(result.features[0],0,{});
  assert.equal(health.status,'ready');
  assert.equal(health.issueCount,0);
});
