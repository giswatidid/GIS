import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../docs/assets/',import.meta.url);
function harness(){
  const messages=[];
  const context={console,setTimeout,clearTimeout,TextEncoder,postMessage:message=>messages.push(message)};
  context.self=context;context.globalThis=context;
  context.importScripts=(...urls)=>{for(const url of urls){if(/^https?:/.test(url))throw new Error('Network import was not expected in this standard-check test.');const name=url.split('?')[0];const source=fs.readFileSync(new URL(name,root),'utf8');vm.runInContext(source,ctx,{filename:name});}};
  const ctx=vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('gis-geometry-health-worker.js',root),'utf8'),ctx,{filename:'gis-geometry-health-worker.js'});
  return {ctx,messages};
}
const input={type:'FeatureCollection',features:[
  {type:'Feature',id:'line',properties:{name:'Line'},geometry:{type:'LineString',coordinates:[[1,1],[1,1],[2,2]]}},
  {type:'Feature',id:'open',properties:{name:'Open line'},geometry:{type:'LineString',coordinates:[[2,2],[3,3]]}}
]};

test('worker validates ordinary open lines and returns progress plus structured result',async()=>{
  const {ctx,messages}=harness();
  await ctx.self.onmessage({data:{id:'validate',action:'validate',collection:input,options:{rules:{},robustEngine:false}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.ok(result);
  assert.equal(result.counts.checked,2);
  assert.equal(result.counts.safe,1);
  assert.equal(result.counts.ready,1);
  assert.ok(messages.some(message=>message.type==='progress'));
});

test('worker safe repair revalidates output without deleting records',async()=>{
  const {ctx,messages}=harness();
  await ctx.self.onmessage({data:{id:'repair',action:'repairSafe',collection:input,options:{rules:{},robustEngine:false}}});
  const result=messages.find(message=>message.type==='result')?.result;
  assert.ok(result);
  assert.equal(result.collection.features.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.collection.features[0].geometry.coordinates)),[[1,1],[2,2]]);
  assert.equal(result.report.counts.ready,2);
  assert.equal(result.changeLog.length,1);
});

function robustGeosMock(){
  let next=20;const strings=new Map(),geometries=new Map();const putString=value=>{const ptr=next++;strings.set(ptr,String(value));return ptr;};const putGeometry=value=>{const ptr=next++;geometries.set(ptr,JSON.parse(JSON.stringify(value)));return ptr;};
  const validGeometry={type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]};
  return {Module:{_malloc:()=>next++,_free:ptr=>strings.delete(ptr),stringToUTF8:(value,ptr)=>strings.set(ptr,String(value)),UTF8ToString:ptr=>strings.get(ptr)||''},GEOSGeoJSONReader_create:()=>1,GEOSGeoJSONReader_destroy:()=>null,GEOSGeoJSONReader_readGeometry:(_r,ptr)=>putGeometry(JSON.parse(strings.get(ptr))),GEOSGeoJSONWriter_create:()=>2,GEOSGeoJSONWriter_destroy:()=>null,GEOSGeoJSONWriter_writeGeometry:(_w,geom)=>putString(JSON.stringify(geometries.get(geom))),GEOSGeom_destroy:ptr=>geometries.delete(ptr),GEOSFree:ptr=>strings.delete(ptr),GEOSisValidReason:geom=>{const g=geometries.get(geom);return putString(JSON.stringify(g)===JSON.stringify(validGeometry)?'Valid Geometry':'Self-intersection[1 1]');},GEOSMakeValid:()=>putGeometry(validGeometry)};
}

test('worker augments polygon diagnostics and make-valid previews with GEOS when available',async()=>{
  const {ctx,messages}=harness();ctx.self.__editPolygonGeosMock=robustGeosMock();
  const bowtie={type:'Feature',id:'bow',properties:{name:'Bow tie'},geometry:{type:'Polygon',coordinates:[[[0,0],[2,2],[0,2],[2,0],[0,0]]]}};
  await ctx.self.onmessage({data:{id:'robust',action:'validate',collection:{type:'FeatureCollection',features:[bowtie]},options:{rules:{},robustEngine:true}}});
  const report=messages.find(message=>message.id==='robust'&&message.type==='result')?.result;
  assert.ok(report);
  assert.equal(report.engine.robust.status,'ready');
  assert.equal(report.engine.robust.checked,1);
  assert.equal(report.featureResults[0].robustValidity.status,'invalid');
  const issue=report.issues.find(item=>item.repair?.action==='make_valid');
  assert.ok(issue);
  messages.length=0;
  await ctx.self.onmessage({data:{id:'preview',action:'previewReview',feature:bowtie,issue,options:{rules:{},robustEngine:true}}});
  const preview=messages.find(message=>message.id==='preview'&&message.type==='result')?.result;
  assert.ok(preview);
  assert.equal(preview.engine.name,'GEOS MakeValid');
  assert.equal(preview.engine.fallback,false);
  assert.equal(preview.feature.geometry.type,'Polygon');
  assert.equal(preview.remainingIssues.length,0);
  assert.equal(preview.metricsComparable,false);
  assert.equal(preview.areaChangePercent,null);
  assert.equal(preview.lengthChangePercent,null);
});


function robustGeosClockwiseMock(){
  let next=200;const strings=new Map(),geometries=new Map();const putString=value=>{const ptr=next++;strings.set(ptr,String(value));return ptr;};const putGeometry=value=>{const ptr=next++;geometries.set(ptr,JSON.parse(JSON.stringify(value)));return ptr;};
  const clockwise={type:'Polygon',coordinates:[[[0,0],[0,2],[2,2],[2,0],[0,0]]]};
  return {Module:{_malloc:()=>next++,_free:ptr=>strings.delete(ptr),stringToUTF8:(value,ptr)=>strings.set(ptr,String(value)),UTF8ToString:ptr=>strings.get(ptr)||''},GEOSGeoJSONReader_create:()=>1,GEOSGeoJSONReader_destroy:()=>null,GEOSGeoJSONReader_readGeometry:(_r,ptr)=>putGeometry(JSON.parse(strings.get(ptr))),GEOSGeoJSONWriter_create:()=>2,GEOSGeoJSONWriter_destroy:()=>null,GEOSGeoJSONWriter_writeGeometry:(_w,geom)=>putString(JSON.stringify(geometries.get(geom))),GEOSGeom_destroy:ptr=>geometries.delete(ptr),GEOSFree:ptr=>strings.delete(ptr),GEOSisValidReason:()=>putString('Valid Geometry'),GEOSMakeValid:()=>putGeometry(clockwise)};
}

test('make-valid preview folds harmless ring-direction cleanup into the proposal',async()=>{
  const {ctx,messages}=harness();ctx.self.__editPolygonGeosMock=robustGeosClockwiseMock();
  const bowtie={type:'Feature',id:'bow-winding',properties:{name:'Bow winding'},geometry:{type:'Polygon',coordinates:[[[0,0],[2,2],[0,2],[2,0],[0,0]]]}};
  const initial=ctx.self.EditPolygonGeometryHealthCore.validateCollection({type:'FeatureCollection',features:[bowtie]},{rules:{}});
  const issue=initial.issues.find(item=>item.repair?.action==='make_valid');
  assert.ok(issue);
  await ctx.self.onmessage({data:{id:'preview-winding',action:'previewReview',feature:bowtie,issue,options:{rules:{},robustEngine:true}}});
  const preview=messages.find(message=>message.id==='preview-winding'&&message.type==='result')?.result;
  assert.ok(preview);
  assert.equal(preview.remainingIssues.length,0);
  assert.ok(preview.safeChanges.some(change=>/direction/i.test(change)),preview.safeChanges);
});
