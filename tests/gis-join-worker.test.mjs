import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const joinSource=fs.readFileSync(new URL('../docs/assets/gis-join-core.js',import.meta.url),'utf8');
const spatialSource=fs.readFileSync(new URL('../docs/assets/gis-spatial-core.js',import.meta.url),'utf8');
const workerSource=fs.readFileSync(new URL('../docs/assets/gis-join-worker.js',import.meta.url),'utf8');

function bbox(geometry){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const walk=value=>{if(!Array.isArray(value))return;if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))){const [x,y]=value;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);return;}value.forEach(walk);};
  walk(geometry?.coordinates);return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;
}
function pointInRing(point,ring){
  const [x,y]=point;let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const hit=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi);if(hit)inside=!inside;
  }
  return inside;
}
function pointInPolygon(point,geometry){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(poly=>pointInRing(point,poly[0])&&!poly.slice(1).some(hole=>pointInRing(point,hole)));
}
function pointFeature(value){return {type:'Feature',properties:{},geometry:{type:'Point',coordinates:value}};}
function representative(feature){if(feature.geometry.type==='Point')return feature;const b=bbox(feature.geometry);return pointFeature([(b[0]+b[2])/2,(b[1]+b[3])/2]);}
function haversine(a,b){const toRad=x=>x*Math.PI/180,R=6371,[lon1,lat1]=a.geometry.coordinates,[lon2,lat2]=b.geometry.coordinates,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1),p=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(p),Math.sqrt(1-p));}
function context(){
  const messages=[];
  const self={postMessage:message=>messages.push(message)};
  self.turf={
    booleanValid:feature=>!!feature?.geometry,
    booleanPointInPolygon:(point,polygon)=>pointInPolygon(point.geometry.coordinates,polygon.geometry),
    booleanIntersects:(a,b)=>{const x=bbox(a.geometry),y=bbox(b.geometry);return !!(x&&y&&x[0]<=y[2]&&x[2]>=y[0]&&x[1]<=y[3]&&x[3]>=y[1]);},
    booleanWithin:(a,b)=>{const ba=bbox(a.geometry),bb=bbox(b.geometry);return !!(ba&&bb&&ba[0]>=bb[0]&&ba[1]>=bb[1]&&ba[2]<=bb[2]&&ba[3]<=bb[3]);},
    booleanContains:(a,b)=>self.turf.booleanWithin(b,a),
    booleanTouches:()=>false,
    booleanOverlap:(a,b)=>self.turf.booleanIntersects(a,b),
    pointOnFeature:representative,centroid:representative,distance:haversine,
    union:collection=>collection.features[0]
  };
  const sandbox={self,globalThis:self,console,Map,Set,Date,Math,JSON,Number,String,Array,Object,Error,RegExp,Intl,structuredClone,importScripts:()=>{}};
  vm.createContext(sandbox);
  vm.runInContext(spatialSource,sandbox,{filename:'gis-spatial-core.js'});
  vm.runInContext(joinSource,sandbox,{filename:'gis-join-core.js'});
  vm.runInContext(workerSource,sandbox,{filename:'gis-join-worker.js'});
  return {self,messages};
}
const schema=fields=>({version:1,fields:fields.map(([name,type])=>({name,alias:name,type,nullable:true}))});

test('spatial worker joins points to containing polygons and summarizes all matches',async()=>{
  const {self,messages}=context();
  await self.onmessage({data:{id:'job',task:{operation:'spatialJoin',targetRecords:[
    {id:'p1',geometry:{type:'Point',coordinates:[1,1]},properties:{name:'Inside'}},
    {id:'p2',geometry:{type:'Point',coordinates:[8,8]},properties:{name:'Outside'}}
  ],sourceRecords:[
    {id:'poly',geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]]]},properties:{region:'North',capacity:10}}
  ],config:{predicate:'point-in-polygon',matchMode:'summarize',keepUnmatched:true,targetSchema:schema([['name','text']]),sourceSchema:schema([['region','text'],['capacity','integer']]),fieldMap:[{source:'region',output:'region',include:true}],aggregations:[{field:'__records__',operation:'count',output:'match_count'}]}}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.ok(result);assert.equal(result.rows.length,2);
  assert.equal(result.rows[0].properties.region,'North');assert.equal(result.rows[0].properties.match_count,1);
  assert.equal(result.rows[1].properties.region,null);assert.equal(result.rows[1].properties.match_count,0);
  assert.equal(result.diagnostics.matchedTargets,1);assert.equal(result.diagnostics.unmatchedTargets,1);
});
test('spatial worker finds nearest point, reports geodesic distance and honours a limit',async()=>{
  const {self,messages}=context();
  await self.onmessage({data:{id:'near',task:{operation:'spatialJoin',targetRecords:[{id:'a',geometry:{type:'Point',coordinates:[153,-27]},properties:{name:'A'}}],sourceRecords:[
    {id:'near',geometry:{type:'Point',coordinates:[153.01,-27]},properties:{site:'Near'}},
    {id:'far',geometry:{type:'Point',coordinates:[154,-27]},properties:{site:'Far'}}
  ],config:{predicate:'nearest',matchMode:'first',keepUnmatched:true,includeDistance:true,maxDistanceKm:5,targetSchema:schema([['name','text']]),sourceSchema:schema([['site','text']]),fieldMap:[{source:'site',output:'nearest_site',include:true}],aggregations:[]}}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].properties.nearest_site,'Near');
  assert.ok(result.rows[0].properties.join_distance_km>0);assert.ok(result.rows[0].properties.join_distance_km<5);
  assert.match(result.diagnostics.distanceMethod,/geodesic/);
});

test('spatial worker reports invalid geometry instead of silently treating it as a match',async()=>{
  const {self,messages}=context();
  await self.onmessage({data:{id:'bad',task:{operation:'spatialJoin',targetRecords:[{id:'bad',geometry:null,properties:{}}],sourceRecords:[{id:'point',geometry:{type:'Point',coordinates:[0,0]},properties:{}}],config:{predicate:'nearest',targetSchema:schema([]),sourceSchema:schema([]),fieldMap:[],aggregations:[]}}}});
  const error=messages.find(message=>message.type==='error');assert.ok(error);assert.match(error.message,/No target records have usable geometry/);
});

test('spatial worker can expand multiple intersections and omit unmatched targets',async()=>{
  const {self,messages}=context();
  await self.onmessage({data:{id:'expand',task:{operation:'spatialJoin',targetRecords:[
    {id:'target1',geometry:{type:'Polygon',coordinates:[[[0,0],[5,0],[5,5],[0,5],[0,0]]]},properties:{asset:'A'}},
    {id:'target2',geometry:{type:'Polygon',coordinates:[[[20,20],[21,20],[21,21],[20,21],[20,20]]]},properties:{asset:'B'}}
  ],sourceRecords:[
    {id:'s1',geometry:{type:'Polygon',coordinates:[[[1,1],[2,1],[2,2],[1,2],[1,1]]]},properties:{zone:'One'}},
    {id:'s2',geometry:{type:'Polygon',coordinates:[[[3,3],[4,3],[4,4],[3,4],[3,3]]]},properties:{zone:'Two'}}
  ],config:{predicate:'intersects',matchMode:'expand',keepUnmatched:false,targetSchema:schema([['asset','text']]),sourceSchema:schema([['zone','text']]),fieldMap:[{source:'zone',output:'zone',include:true}],aggregations:[]}}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.ok(result);assert.equal(result.rows.length,2);
  assert.equal(JSON.stringify(result.rows.map(row=>row.properties.zone)),JSON.stringify(['One','Two']));
  assert.equal(result.diagnostics.multipleTargets,1);
  assert.equal(result.diagnostics.unmatchedTargets,1);
  assert.match(result.diagnostics.warnings.join(' '),/expands/);
});

test('spatial worker summarizes numeric values from all intersecting source features',async()=>{
  const {self,messages}=context();
  await self.onmessage({data:{id:'sum',task:{operation:'spatialJoin',targetRecords:[
    {id:'target',geometry:{type:'Polygon',coordinates:[[[0,0],[5,0],[5,5],[0,5],[0,0]]]},properties:{name:'Area'}}
  ],sourceRecords:[
    {id:'s1',geometry:{type:'Point',coordinates:[1,1]},properties:{value:4}},
    {id:'s2',geometry:{type:'Point',coordinates:[2,2]},properties:{value:6}}
  ],config:{predicate:'intersects',matchMode:'summarize',keepUnmatched:true,targetSchema:schema([['name','text']]),sourceSchema:schema([['value','integer']]),fieldMap:[],aggregations:[{field:'__records__',operation:'count',output:'point_count'},{field:'value',operation:'sum',output:'value_sum'}]}}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.ok(result);assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].properties.point_count,2);
  assert.equal(result.rows[0].properties.value_sum,10);
  assert.equal(result.schema.fields.find(field=>field.name==='point_count').type,'integer');
});
