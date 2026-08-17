import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-geos-adapter.js',import.meta.url),'utf8');
function load(){const context={console,TextEncoder,module:{exports:{}},exports:{}};context.self=context;context.globalThis=context;const ctx=vm.createContext(context);vm.runInContext(source,ctx,{filename:'gis-geos-adapter.js'});return ctx.EditPolygonGeosAdapter;}
function fakeGeos({invalidReason='Self-intersection[1 1]',makeValidGeometry={type:'GeometryCollection',geometries:[{type:'Polygon',coordinates:[[[0,0],[2,0],[1,1],[0,0]]]},{type:'LineString',coordinates:[[0,0],[1,1]]}]}}={}){
  let next=10;const strings=new Map(),geometries=new Map();
  const allocString=value=>{const ptr=next++;strings.set(ptr,String(value));return ptr;};
  const allocGeometry=value=>{const ptr=next++;geometries.set(ptr,JSON.parse(JSON.stringify(value)));return ptr;};
  const api={
    Module:{_malloc:()=>next++,_free:ptr=>strings.delete(ptr),stringToUTF8:(value,ptr)=>strings.set(ptr,String(value)),UTF8ToString:ptr=>strings.get(ptr)||'',HEAPF64:new Float64Array(128),getValue:(ptr,type)=>{api.__getValueCalls++;if(type!=='double')throw new Error('unexpected type');return api.Module.HEAPF64[ptr>>3];}},
    GEOSGeoJSONReader_create:()=>1,GEOSGeoJSONReader_destroy:()=>null,
    GEOSGeoJSONReader_readGeometry:(_reader,ptr)=>allocGeometry(JSON.parse(strings.get(ptr))),
    GEOSGeoJSONWriter_create:()=>2,GEOSGeoJSONWriter_destroy:()=>null,
    GEOSGeoJSONWriter_writeGeometry:(_writer,geom)=>allocString(JSON.stringify(geometries.get(geom))),
    GEOSGeom_destroy:ptr=>geometries.delete(ptr),GEOSFree:ptr=>strings.delete(ptr),
    GEOSisValidReason:geom=>allocString(geometries.get(geom)?.type==='GeometryCollection'?'Valid Geometry':invalidReason),
    GEOSMakeValid:geom=>allocGeometry(geometries.get(geom)),
    GEOSIntersection:(a,b)=>allocGeometry(geometries.get(a)),
    GEOSDifference:(a,b)=>allocGeometry(geometries.get(a)),
    GEOSSymDifference:(a,b)=>allocGeometry(geometries.get(a)),
    GEOSUnion:(a,b)=>allocGeometry(geometries.get(a)),
    GEOSUnaryUnion:a=>allocGeometry(geometries.get(a)),
    GEOSTopologyPreserveSimplify:(a,t)=>allocGeometry(geometries.get(a)),
    GEOSDensify:(a,t)=>allocGeometry(geometries.get(a)),
    GEOSSnap:(a,b,t)=>allocGeometry(geometries.get(a)),
    GEOSDistance:(a,b,ptr)=>{api.Module.HEAPF64[ptr>>3]=12.5;return 1;},
    __strings:strings,__geometries:geometries,__getValueCalls:0
  };
  const originalMakeValid=api.GEOSMakeValid;api.GEOSMakeValid=geom=>allocGeometry(makeValidGeometry||geometries.get(geom));return api;
}

test('GEOS adapter exposes the pinned robust engine version',()=>{
  const adapter=load();
  assert.equal(adapter.GEOS_WASM_VERSION,'3.1.1');
});

test('GEOS validity converts GeoJSON safely and returns the diagnostic reason',()=>{
  const adapter=load(),geos=fakeGeos();
  const result=adapter.validity(geos,{type:'Polygon',coordinates:[[[0,0],[2,2],[0,2],[2,0],[0,0]]]});
  assert.equal(result.valid,false);
  assert.equal(result.reason,'Self-intersection[1 1]');
  assert.deepEqual(Array.from(adapter.locationFromReason(result.reason)),[1,1]);
  assert.equal(geos.__geometries.size,0,'GEOS geometry pointers should be destroyed');
});

test('GEOS MakeValid keeps polygonal output and reports discarded lower-dimensional pieces',()=>{
  const adapter=load(),geos=fakeGeos();
  const result=adapter.makeValid(geos,{type:'Polygon',coordinates:[[[0,0],[2,2],[0,2],[2,0],[0,0]]]});
  assert.equal(result.geometry.type,'Polygon');
  assert.equal(result.discardedLowerDimensionalParts,1);
  assert.equal(result.polygonPartCount,1);
  assert.equal(result.engine.name,'GEOS MakeValid');
  assert.equal(result.validAfter,true);
  assert.equal(geos.__geometries.size,0,'all GEOS geometry pointers should be destroyed');
});


test('GEOS adapter routes robust overlay and maintenance operations through the low-level API',()=>{
  const adapter=load(),geos=fakeGeos(),a={type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,0]]]},b={type:'Polygon',coordinates:[[[1,0],[3,0],[3,2],[1,0]]]};
  for(const result of [adapter.intersection(geos,a,b),adapter.difference(geos,a,b),adapter.symDifference(geos,a,b),adapter.union(geos,a,b),adapter.simplify(geos,a,1),adapter.densify(geos,a,1),adapter.snap(geos,a,b,1)])assert.equal(result.type,'Polygon');
  assert.equal(adapter.unaryUnion(geos,[a,b]).type,'GeometryCollection');
  assert.equal(geos.__geometries.size,0,'temporary GEOS pointers should be destroyed');
});

test('GEOS adapter reads metric distance through the supported Emscripten double accessor',()=>{
  const adapter=load(),geos=fakeGeos(),a={type:'Point',coordinates:[0,0]},b={type:'Point',coordinates:[1,1]};
  assert.equal(adapter.distance(geos,a,b),12.5);
  assert.equal(geos.__getValueCalls,1);
  assert.equal(geos.__geometries.size,0);
});

test('GEOS adapter retains a typed-memory fallback for builds without Module.getValue',()=>{
  const adapter=load(),geos=fakeGeos(),a={type:'Point',coordinates:[0,0]},b={type:'Point',coordinates:[1,1]};
  delete geos.Module.getValue;
  assert.equal(adapter.distance(geos,a,b),12.5);
  assert.equal(geos.__geometries.size,0);
});
