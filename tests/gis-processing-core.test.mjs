import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,Error});vm.runInContext(registrySource,context);vm.runInContext(coreSource,context);return {registry:window.EditPolygonGISProcessingRegistry,core:window.EditPolygonGISProcessingCore};}
const feature=(id,type='Polygon',extra={})=>({id,name:id,geometryType:type,filtered:false,visible:true,properties:{name:id},...extra});
const polygonLayer={id:'poly',name:'Polygons',features:[feature('a','Polygon',{visible:false}),feature('b','Polygon',{filtered:true}),feature('c','Polygon')]};
const pointLayer={id:'points',name:'Points',features:[feature('p','Point')]};

test('processing scopes are explicit and visual hiding never changes processing membership',()=>{
  const {core}=load();
  assert.equal(core.scopeCount(polygonLayer,'all',[]),3);
  assert.equal(core.scopeCount(polygonLayer,'filtered',[]),2);
  assert.equal(core.scopeCount(polygonLayer,'selected',['a','p']),1);
  assert.equal(core.scopeFeatures(polygonLayer,'all',[])[0].id,'a');
  assert.equal(core.scopeFeatures(polygonLayer,'selected',['a'],[])[0]?.visible,false);
});

test('preflight validates geometry, overlay requirements, scopes and parameters before execution',()=>{
  const {core}=load();
  const layers=[polygonLayer,pointLayer];
  const buffer=core.preflight({toolId:'buffer',inputs:{source:{layerId:'poly',scope:'all'}},parameters:{distance:0,units:'kilometers'}},{layers,selectionIds:[]});
  assert.equal(buffer.valid,false);assert.match(buffer.errors.join(' '),/must not be zero/);
  const dissolvePoints=core.preflight({toolId:'dissolve',inputs:{source:{layerId:'points',scope:'all'}}},{layers,selectionIds:[]});
  assert.equal(dissolvePoints.valid,false);assert.match(dissolvePoints.errors.join(' '),/does not support point/);
  const clipMissing=core.preflight({toolId:'clip',inputs:{source:{layerId:'points',scope:'all'},overlay:{layerId:'',scope:'all'}}},{layers,selectionIds:[]});
  assert.equal(clipMissing.valid,false);assert.match(clipMissing.errors.join(' '),/overlay layer/i);
  const selected=core.preflight({toolId:'centroid',inputs:{source:{layerId:'poly',scope:'selected'}}},{layers,selectionIds:['a']});
  assert.equal(selected.valid,true);assert.equal(selected.counts.source,1);assert.match(selected.warnings.join(' '),/Only 1 selected feature/);
});

test('requests, output naming and provenance form a stable machine-readable contract',()=>{
  const {core,registry}=load();
  const request=core.normaliseRequest({toolId:'buffer',inputs:{source:{layerId:'poly',scope:'filtered'}},parameters:{distance:'5',units:'meters'}});
  assert.equal(request.version,1);assert.equal(request.parameters.distance,5);assert.equal(request.output.mode,'new-layer');
  assert.equal(core.defaultOutputName(registry.getTool('buffer'),polygonLayer),'Polygons — Buffer');
  const pf=core.preflight({...request,output:{mode:'new-layer',name:'Five metre buffer'}},{layers:[polygonLayer],selectionIds:[]});
  const provenance=core.createProvenance(pf,{processingCrs:'EPSG:4326',worker:true,result:{summary:{output:2}}});
  assert.equal(provenance.tool,'buffer');assert.equal(provenance.sourceLayerId,'poly');assert.equal(provenance.sourceScope,'filtered');assert.equal(provenance.processingCrs,'EPSG:4326');assert.equal(provenance.worker,true);assert.equal(provenance.result.summary.output,2);
});

test('per-feature execution reports failures instead of silently dropping them',()=>{
  const {core}=load();
  const turf={
    buffer(value){if(value.properties?.bad)throw Error('bad geometry');return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[]}};}
  };
  const task={toolId:'buffer',parameters:{distance:1,units:'kilometers',steps:16},features:[
    {id:'ok',type:'Feature',properties:{name:'OK'},geometry:{type:'Point',coordinates:[0,0]}},
    {id:'bad',type:'Feature',properties:{name:'Bad',bad:true},geometry:{type:'Point',coordinates:[1,1]}}
  ]};
  const progress=[];const result=core.executeWithTurf(task,{turf,onProgress:update=>progress.push(update)});
  assert.equal(result.features.length,1);assert.equal(result.failures.length,1);assert.equal(result.failures[0].featureId,'bad');assert.match(result.failures[0].message,/bad geometry/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.summary)),{input:2,processed:1,output:1,failed:1,partial:true});
  assert.ok(progress.length>=1);
});

test('source identity survives per-feature processing without becoming an output attribute',()=>{
  const {core}=load();
  const turf={centroid:()=>({type:'Feature',properties:{temporary:true},geometry:{type:'Point',coordinates:[0,0]}})};
  const result=core.executeWithTurf({toolId:'centroid',features:[{id:'source-7',type:'Feature',properties:{name:'Area 7',code:'A7'},geometry:{type:'Polygon',coordinates:[]}}]},{turf});
  assert.equal(result.features[0].id,'source-7');
  assert.deepEqual(JSON.parse(JSON.stringify(result.features[0].properties)),{name:'Area 7',code:'A7'});
});

test('aggregate processing fails atomically instead of returning an incomplete dissolve',()=>{
  const {core}=load();let calls=0;
  const turf={union(){calls++;if(calls===1)throw Error('topology failure');return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[]}};}};
  const features=[1,2].map(n=>({id:`p${n}`,type:'Feature',properties:{name:`P${n}`},geometry:{type:'Polygon',coordinates:[]}}));
  assert.throws(()=>core.executeWithTurf({toolId:'dissolve',features},{turf}),/Could not combine overlay polygon 2: topology failure/);
});

test('all eight v1.56.0.3 tools execute through the shared Turf contract',()=>{
  const {core}=load();
  const polygon=(id,x=0)=>({id,type:'Feature',properties:{name:id},geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}});
  const turf={
    buffer:f=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:f.geometry.coordinates}}),
    centroid:()=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[.5,.5]}}),
    pointOnFeature:()=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[.5,.5]}}),
    point:coordinates=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates}}),
    coordEach(f,fn){const walk=v=>Array.isArray(v?.[0])?v.forEach(walk):fn(v);walk(f.geometry.coordinates);},
    convex:()=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,1],[0,0]]]}}),
    bbox:()=>[0,0,2,1],
    bboxPolygon:bounds=>polygon('bbox',bounds[0]),
    union:collection=>({type:'Feature',properties:{},geometry:collection.features[0].geometry}),
    intersect:collection=>({type:'Feature',properties:{},geometry:collection.features[0].geometry}),
    lineString:coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}),
    multiLineString:coordinates=>({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates}}),
    booleanPointInPolygon:()=>true,lineSplit:line=>({features:[line]}),length:()=>1,along:()=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:[.5,.5]}})
  };
  const source=[polygon('a',0),polygon('b',1)],overlay=[polygon('mask',0)];
  const expectations={buffer:2,centroid:2,'point-on-feature':2,'convex-hull':1,bbox:1,clip:2,intersection:2,dissolve:1};
  for(const [toolId,count] of Object.entries(expectations)){
    const result=core.executeWithTurf({toolId,features:source,overlayFeatures:overlay,parameters:{distance:1,units:'kilometers',steps:16}},{turf});
    assert.equal(result.features.length,count,toolId);assert.equal(result.failures.length,0,toolId);
  }
});
