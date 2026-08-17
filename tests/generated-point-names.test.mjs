import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
const engineSource=fs.readFileSync(new URL('../docs/assets/gis-processing-engine.js',import.meta.url),'utf8');

function load(){
  const window={};
  const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,Error,Intl,RegExp,Boolean});
  vm.runInContext(coreSource,context,{filename:'gis-processing-core.js'});
  vm.runInContext(engineSource,context,{filename:'gis-processing-engine.js'});
  return window;
}

const crs={transformGeometry:g=>JSON.parse(JSON.stringify(g))};
const point=coordinates=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[...coordinates]}});
const line=(id,coordinates,properties={})=>({id,type:'Feature',properties,geometry:{type:'LineString',coordinates}});

function planarRhumbTurf(){
  return {
    point,
    lineString:coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}),
    length:()=>{throw new Error('geodesic fallback should not run');},
    along:()=>{throw new Error('great-circle along() should not run');},
    rhumbDistance:(from,to)=>Math.hypot(to.geometry.coordinates[0]-from.geometry.coordinates[0],to.geometry.coordinates[1]-from.geometry.coordinates[1]),
    rhumbBearing:(from,to)=>{
      const dx=to.geometry.coordinates[0]-from.geometry.coordinates[0],dy=to.geometry.coordinates[1]-from.geometry.coordinates[1];
      return Math.atan2(dx,dy)*180/Math.PI;
    },
    rhumbDestination:(origin,distance,bearing)=>{
      const radians=bearing*Math.PI/180,[x,y]=origin.geometry.coordinates;
      return point([x+Math.sin(radians)*distance,y+Math.cos(radians)*distance]);
    }
  };
}

test('line to points gives each vertex a useful generated name and preserves the source name',async()=>{
  const window=load();
  const source=[line('line-1',[[0,0],[1,0],[1,1]],{name:'Line 1',kind:'test'})];
  const result=await window.EditPolygonGISProcessingEngine.execute({
    tool:{id:'line-to-points',engine:'pure',resultKind:'layer'},
    inputs:{source},parameters:{},processingCrs:'EPSG:4326'
  },{crs});
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.name))),[
    'Line 1 — vertex 1','Line 1 — vertex 2','Line 1 — vertex 3'
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.source_name))),['Line 1','Line 1','Line 1']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.vertex_index))),[1,2,3]);
  assert.ok(result.features.every(feature=>feature.properties.kind==='test'));
});

test('points along line names generated points by distance while preserving the source name',async()=>{
  const window=load(),turf=planarRhumbTurf();
  const source=[line('line-1',[[0,0],[5,0]],{name:'Line 1',kind:'test'})];
  const result=await window.EditPolygonGISProcessingEngine.execute({
    tool:{id:'points-along-line',engine:'turf',crsPolicy:'geodesic',resultKind:'layer'},
    inputs:{source},parameters:{interval:2,units:'kilometers',includeEnds:true},processingCrs:'EPSG:4326'
  },{turf,crs});
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.name))),[
    'Line 1 — 0 m','Line 1 — 2000 m','Line 1 — 4000 m','Line 1 — 5000 m'
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.source_name))),['Line 1','Line 1','Line 1','Line 1']);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.distance_m))),[0,2000,4000,5000]);
  assert.ok(result.features.every(feature=>feature.properties.kind==='test'));
});
