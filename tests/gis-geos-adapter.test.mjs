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
    Module:{_malloc:()=>next++,_free:ptr=>strings.delete(ptr),stringToUTF8:(value,ptr)=>strings.set(ptr,String(value)),UTF8ToString:ptr=>strings.get(ptr)||''},
    GEOSGeoJSONReader_create:()=>1,GEOSGeoJSONReader_destroy:()=>null,
    GEOSGeoJSONReader_readGeometry:(_reader,ptr)=>allocGeometry(JSON.parse(strings.get(ptr))),
    GEOSGeoJSONWriter_create:()=>2,GEOSGeoJSONWriter_destroy:()=>null,
    GEOSGeoJSONWriter_writeGeometry:(_writer,geom)=>allocString(JSON.stringify(geometries.get(geom))),
    GEOSGeom_destroy:ptr=>geometries.delete(ptr),GEOSFree:ptr=>strings.delete(ptr),
    GEOSisValidReason:geom=>allocString(geometries.get(geom)?.type==='GeometryCollection'?'Valid Geometry':invalidReason),
    GEOSMakeValid:()=>allocGeometry(makeValidGeometry),
    __strings:strings,__geometries:geometries
  };
  return api;
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
