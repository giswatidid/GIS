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

const crs={transformGeometry:g=>JSON.parse(JSON.stringify(g)),utmForLonLat:()=> 'EPSG:32756'};
const point=coordinates=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[...coordinates]}});

function planarRhumbTurf(){
  let alongCalls=0;
  const turf={
    point,
    lineString:coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}),
    length:()=>{throw new Error('geodesic length fallback should not run when rhumb functions are available');},
    along:()=>{alongCalls++;throw new Error('great-circle along() must not be used for points-along-line');},
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
  return {turf,getAlongCalls:()=>alongCalls};
}

function line(id,coordinates,properties={}){
  return {id,type:'Feature',properties,geometry:{type:'LineString',coordinates}};
}

function assertCoordinatesClose(actual,expected,epsilon=1e-12){
  assert.equal(actual.length,expected.length,'coordinate count');
  for(let i=0;i<expected.length;i++){
    assert.equal(actual[i].length,expected[i].length,`ordinate count at coordinate ${i}`);
    for(let j=0;j<expected[i].length;j++){
      assert.ok(Math.abs(Number(actual[i][j])-Number(expected[i][j]))<=epsilon,`coordinate ${i}, ordinate ${j}: expected ${expected[i][j]}, got ${actual[i][j]}`);
    }
  }
}

const tool={id:'points-along-line',engine:'turf',crsPolicy:'geodesic',resultKind:'layer'};

test('points along a drawn straight segment follow rhumb geometry instead of Turf great-circle along()',async()=>{
  const window=load(),{turf,getAlongCalls}=planarRhumbTurf();
  const source=[line('high-latitude',[[0,70],[10,70]],{name:'straight'})];
  const result=await window.EditPolygonGISProcessingEngine.execute({tool,inputs:{source},parameters:{interval:2,units:'kilometers',includeEnds:true},processingCrs:'EPSG:4326'},{turf,crs});
  assert.equal(getAlongCalls(),0);
  assertCoordinatesClose(JSON.parse(JSON.stringify(result.features.map(feature=>feature.geometry.coordinates))),[[0,70],[2,70],[4,70],[6,70],[8,70],[10,70]]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(feature=>feature.properties.distance_m))),[0,2000,4000,6000,8000,10000]);
});

test('points along a multi-segment line advance through segments without rescanning the line',async()=>{
  const window=load(),{turf}=planarRhumbTurf();
  const source=[line('corner',[[0,0],[5,0],[5,5]])];
  const result=await window.EditPolygonGISProcessingEngine.execute({tool,inputs:{source},parameters:{interval:2.5,units:'kilometers',includeEnds:true},processingCrs:'EPSG:4326'},{turf,crs});
  assertCoordinatesClose(JSON.parse(JSON.stringify(result.features.map(feature=>feature.geometry.coordinates))),[[0,0],[2.5,0],[5,0],[5,2.5],[5,5]]);
});

test('large points-along-line output stays on the linear rhumb sampler path',async()=>{
  const window=load(),{turf,getAlongCalls}=planarRhumbTurf();
  const source=[line('large',[[0,0],[50,0]])];
  const result=await window.EditPolygonGISProcessingEngine.execute({tool,inputs:{source},parameters:{interval:0.01,units:'kilometers',includeEnds:true},processingCrs:'EPSG:4326'},{turf,crs});
  assert.equal(result.features.length,5001);
  assert.equal(getAlongCalls(),0);
  assertCoordinatesClose([JSON.parse(JSON.stringify(result.features[0].geometry.coordinates))],[[0,0]]);
  assertCoordinatesClose([JSON.parse(JSON.stringify(result.features.at(-1).geometry.coordinates))],[[50,0]]);
});
