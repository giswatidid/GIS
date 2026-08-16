import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../docs/assets/gis-spatial-core.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Error});vm.runInContext(source,context);return window.EditPolygonGISSpatialCore;}
const point=(id,x,y,properties={})=>({id,type:'Feature',properties,geometry:{type:'Point',coordinates:[x,y]}});
const polygon=(id,minX,minY,maxX,maxY)=>({id,type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]]}});
function bbox(g){let xs=[],ys=[];const walk=v=>{if(Array.isArray(v)&&v.length>=2&&typeof v[0]==='number'){xs.push(v[0]);ys.push(v[1]);}else if(Array.isArray(v))v.forEach(walk)};walk(g.coordinates);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
const turf={
 booleanIntersects:(a,b)=>{const A=bbox(a.geometry),B=bbox(b.geometry);return A[0]<=B[2]&&A[2]>=B[0]&&A[1]<=B[3]&&A[3]>=B[1];},
 booleanWithin:(a,b)=>{const A=bbox(a.geometry),B=bbox(b.geometry);return A[0]>=B[0]&&A[2]<=B[2]&&A[1]>=B[1]&&A[3]<=B[3];},
 booleanContains:(a,b)=>turf.booleanWithin(b,a),booleanTouches:()=>false,booleanOverlap:(a,b)=>turf.booleanIntersects(a,b),booleanDisjoint:(a,b)=>!turf.booleanIntersects(a,b),
 pointOnFeature:f=>f.geometry.type==='Point'?f:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[(bbox(f.geometry)[0]+bbox(f.geometry)[2])/2,(bbox(f.geometry)[1]+bbox(f.geometry)[3])/2]}},
 centroid:f=>turf.pointOnFeature(f),distance:(a,b)=>Math.hypot(a.geometry.coordinates[0]-b.geometry.coordinates[0],a.geometry.coordinates[1]-b.geometry.coordinates[1])
};

test('spatial index returns only bbox candidates',()=>{const api=load(),records=[point('a',0,0),point('b',10,10),polygon('c',2,2,4,4)],index=api.buildSpatialIndex(records);assert.deepEqual(JSON.parse(JSON.stringify(api.querySpatialIndex(index,[-1,-1,3,3]).sort())),['a','c']);});
test('shared relationship and matching engine applies exact predicates after indexing',()=>{const api=load(),target=polygon('target',0,0,5,5),sources=[point('in',1,1),point('out',9,9)];assert.deepEqual(JSON.parse(JSON.stringify(api.matchingFeatures(turf,target,sources,'contains').map(x=>x.id))),['in']);});
test('nearest feature accepts one authoritative distance function',()=>{const api=load(),target=point('t',0,0),sources=[point('far',10,0),point('near',2,0)];const result=api.nearestFeature(turf,target,sources,{distanceFn:(a,b)=>Math.abs(b.geometry.coordinates[0]-a.geometry.coordinates[0])*100});assert.equal(result.feature.id,'near');assert.equal(result.distance,200);});
test('shared aggregation and collision-safe property combination support joins and spatial summaries',()=>{const api=load();assert.equal(api.aggregate([1,2,3],'sum'),6);assert.equal(api.aggregate([1,2,3],'mean'),2);const combined=api.combineProperties({properties:{name:'a'}},{properties:{name:'b',value:4}});assert.deepEqual(JSON.parse(JSON.stringify(combined)),{name:'a',overlay_name:'b',value:4});});
