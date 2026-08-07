(function(global){
'use strict';
const VERSION='1.54.0';
const GEOS_WASM_VERSION='3.1.1';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function assertGeos(geos){
  const required=['GEOSGeoJSONReader_create','GEOSGeoJSONReader_readGeometry','GEOSGeoJSONReader_destroy','GEOSGeoJSONWriter_create','GEOSGeoJSONWriter_writeGeometry','GEOSGeoJSONWriter_destroy','GEOSGeom_destroy','GEOSFree','GEOSisValidReason','GEOSMakeValid'];
  if(!geos?.Module)throw new Error('GEOS-WASM did not expose its Emscripten module.');
  for(const name of required)if(typeof geos[name]!=='function')throw new Error(`GEOS-WASM is missing ${name}.`);
  if(typeof geos.Module._malloc!=='function'||typeof geos.Module._free!=='function'||typeof geos.Module.stringToUTF8!=='function'||typeof geos.Module.UTF8ToString!=='function')throw new Error('GEOS-WASM string memory helpers are unavailable.');
}
function utf8Size(text){return new TextEncoder().encode(String(text)).length+1;}
function allocString(geos,text){const value=String(text);const size=utf8Size(value);const ptr=geos.Module._malloc(size);if(!ptr)throw new Error('GEOS-WASM could not allocate input memory.');geos.Module.stringToUTF8(value,ptr,size);return ptr;}
function readGeometry(geos,geometry){
  assertGeos(geos);let reader=0,input=0,geom=0;
  try{reader=geos.GEOSGeoJSONReader_create();if(!reader)throw new Error('GEOS could not create a GeoJSON reader.');input=allocString(geos,JSON.stringify(geometry));geom=geos.GEOSGeoJSONReader_readGeometry(reader,input);if(!geom)throw new Error('GEOS could not read this GeoJSON geometry.');return geom;}
  finally{if(input)geos.Module._free(input);if(reader)geos.GEOSGeoJSONReader_destroy(reader);}
}
function writeGeometry(geos,geom){
  if(!geom)throw new Error('GEOS returned an empty geometry pointer.');let writer=0,textPtr=0;
  try{writer=geos.GEOSGeoJSONWriter_create();if(!writer)throw new Error('GEOS could not create a GeoJSON writer.');textPtr=geos.GEOSGeoJSONWriter_writeGeometry(writer,geom,-1);if(!textPtr)throw new Error('GEOS could not write the repaired geometry.');return JSON.parse(geos.Module.UTF8ToString(textPtr));}
  finally{if(textPtr)geos.GEOSFree(textPtr);if(writer)geos.GEOSGeoJSONWriter_destroy(writer);}
}
function validity(geos,geometry){
  let geom=0,reasonPtr=0;
  try{geom=readGeometry(geos,geometry);reasonPtr=geos.GEOSisValidReason(geom);if(!reasonPtr)throw new Error('GEOS could not evaluate geometry validity.');const reason=geos.Module.UTF8ToString(reasonPtr)||'Unknown GEOS validity result';const valid=/^valid geometry$/i.test(reason.trim());return {valid,reason};}
  finally{if(reasonPtr)geos.GEOSFree(reasonPtr);if(geom)geos.GEOSGeom_destroy(geom);}
}
function collectPolygonParts(geometry,parts,stats){
  if(!geometry)return;
  if(geometry.type==='Polygon'){parts.push(clone(geometry.coordinates));return;}
  if(geometry.type==='MultiPolygon'){for(const coordinates of geometry.coordinates||[])parts.push(clone(coordinates));return;}
  if(geometry.type==='GeometryCollection'){for(const child of geometry.geometries||[])collectPolygonParts(child,parts,stats);return;}
  if(geometry.type==='LineString'||geometry.type==='MultiLineString')stats.lineParts++;
  else if(geometry.type==='Point'||geometry.type==='MultiPoint')stats.pointParts++;
  else stats.otherParts++;
}
function polygonalResult(raw){
  const parts=[],stats={lineParts:0,pointParts:0,otherParts:0};collectPolygonParts(raw,parts,stats);
  const geometry=parts.length===1?{type:'Polygon',coordinates:parts[0]}:parts.length>1?{type:'MultiPolygon',coordinates:parts}:null;
  return {geometry,discardedLowerDimensionalParts:stats.lineParts+stats.pointParts,discardedOtherParts:stats.otherParts,polygonPartCount:parts.length};
}
function makeValid(geos,geometry){
  let inputGeom=0,repairedGeom=0,reasonBeforePtr=0,reasonAfterPtr=0;
  try{
    inputGeom=readGeometry(geos,geometry);
    reasonBeforePtr=geos.GEOSisValidReason(inputGeom);
    const reasonBefore=reasonBeforePtr?geos.Module.UTF8ToString(reasonBeforePtr):'Unknown';
    repairedGeom=geos.GEOSMakeValid(inputGeom);
    if(!repairedGeom)throw new Error('GEOS MakeValid could not produce a result.');
    const rawGeometry=writeGeometry(geos,repairedGeom);
    reasonAfterPtr=geos.GEOSisValidReason(repairedGeom);
    const reasonAfter=reasonAfterPtr?geos.Module.UTF8ToString(reasonAfterPtr):'Unknown';
    const polygonal=polygonalResult(rawGeometry);
    return {...polygonal,rawGeometry,reasonBefore,reasonAfter,validAfter:/^valid geometry$/i.test(String(reasonAfter).trim()),engine:{name:'GEOS MakeValid',library:'geos-wasm',version:GEOS_WASM_VERSION}};
  }finally{
    if(reasonBeforePtr)geos.GEOSFree(reasonBeforePtr);
    if(reasonAfterPtr)geos.GEOSFree(reasonAfterPtr);
    if(repairedGeom)geos.GEOSGeom_destroy(repairedGeom);
    if(inputGeom)geos.GEOSGeom_destroy(inputGeom);
  }
}
function locationFromReason(reason){
  const text=String(reason||'');const match=text.match(/\[\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\]/i);if(!match)return null;const x=Number(match[1]),y=Number(match[2]);return Number.isFinite(x)&&Number.isFinite(y)?[x,y]:null;
}
const api=Object.freeze({VERSION,GEOS_WASM_VERSION,assertGeos,validity,makeValid,polygonalResult,locationFromReason});
global.EditPolygonGeosAdapter=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
