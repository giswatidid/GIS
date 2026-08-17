import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,Error,Intl});vm.runInContext(registrySource,context);vm.runInContext(coreSource,context);return {registry:window.EditPolygonGISProcessingRegistry,core:window.EditPolygonGISProcessingCore};}
const feature=(id,type='Polygon',extra={})=>({id,name:id,geometryType:type,filtered:false,visible:true,properties:{name:id,group:id==='a'?'north':'south'},geometry:type==='Point'?{type:'Point',coordinates:[153,-27]}:{type,coordinates:[]},...extra});
const polygonLayer={id:'poly',name:'Polygons',features:[feature('a','Polygon',{visible:false}),feature('b','Polygon',{filtered:true}),feature('c','Polygon')]};
const pointLayer={id:'points',name:'Points',features:[feature('p','Point')]};

test('processing scopes are explicit and presentation visibility never changes membership',()=>{
  const {core}=load();
  assert.equal(core.scopeCount(polygonLayer,'all',[]),3);
  assert.equal(core.scopeCount(polygonLayer,'filtered',[]),2);
  assert.equal(core.scopeCount(polygonLayer,'selected',['a','p']),1);
  assert.equal(core.scopeFeatures(polygonLayer,'all',[])[0].visible,false);
});

test('generic preflight validates multiple inputs, geometry, fields, scopes and parameters',()=>{
  const {core}=load(),layers=[polygonLayer,pointLayer];
  const buffer=core.preflight({toolId:'buffer',inputs:{source:{layerId:'poly',scope:'all'}},parameters:{distance:0,units:'kilometers'}},{layers,selectionIds:[]});
  assert.equal(buffer.valid,false);assert.match(buffer.errors.join(' '),/must not be zero/);
  const dissolvePoints=core.preflight({toolId:'dissolve',inputs:{source:{layerId:'points',scope:'all'}}},{layers,selectionIds:[]});
  assert.equal(dissolvePoints.valid,false);assert.match(dissolvePoints.errors.join(' '),/contains no polygon geometry/);
  const differenceMissing=core.preflight({toolId:'difference',inputs:{source:{layerId:'poly',scope:'all'},overlay:{layerId:'',scope:'all'}}},{layers,selectionIds:[]});
  assert.equal(differenceMissing.valid,false);assert.match(differenceMissing.errors.join(' '),/erase layer/i);
  const badField=core.preflight({toolId:'dissolve',inputs:{source:{layerId:'poly',scope:'all'}},parameters:{field:'missing'}},{layers,selectionIds:[]});
  assert.equal(badField.valid,false);assert.match(badField.errors.join(' '),/field that does not exist/);
  const selected=core.preflight({toolId:'centroid',inputs:{source:{layerId:'poly',scope:'selected'}}},{layers,selectionIds:['a']});
  assert.equal(selected.valid,true);assert.equal(selected.counts.source,1);assert.match(selected.warnings.join(' '),/Only 1 selected feature/);
});


test('geometry-constrained inputs use compatible features inside mixed-geometry layers',()=>{
  const {core}=load();
  const mixed={id:'mixed',name:'Mixed features',features:[
    feature('poly-a','Polygon'),feature('poly-b','Polygon'),
    feature('point-a','Point'),feature('point-b','Point')
  ]};
  const pf=core.preflight({toolId:'count-points-in-polygon',inputs:{source:{layerId:'mixed',scope:'all'},overlay:{layerId:'mixed',scope:'all'}},parameters:{countField:'point_count'}},{layers:[mixed],selectionIds:[]});
  assert.equal(pf.valid,true);
  assert.equal(pf.counts.source,2);
  assert.equal(pf.counts.overlay,2);
  assert.deepEqual(Array.from(pf.inputFeatures.source,feature=>feature.id),['poly-a','poly-b']);
  assert.deepEqual(Array.from(pf.inputFeatures.overlay,feature=>feature.id),['point-a','point-b']);
  assert.match(pf.warnings.join(' '),/compatible.*ignored/i);
  assert.match(pf.warnings.join(' '),/same mixed layer/i);
});


test('same-layer nearest preflight explains self-exclusion instead of silently producing self matches',()=>{
  const {core}=load();
  const pf=core.preflight({toolId:'distance-to-nearest',inputs:{source:{layerId:'poly',scope:'all'},overlay:{layerId:'poly',scope:'all'}},parameters:{distanceField:'distance_m'}},{layers:[polygonLayer],selectionIds:[]});
  assert.equal(pf.valid,true);
  assert.match(pf.warnings.join(' '),/excluded from matching itself/i);
});
test('requests support layer, in-place and selection result policies without per-tool UI contracts',()=>{
  const {core}=load();
  const normal=core.normaliseRequest({toolId:'buffer',inputs:{source:{layerId:'poly',scope:'filtered'}},parameters:{distance:'5',units:'meters'},output:{mode:'modify-source'}});
  assert.equal(normal.version,2);assert.equal(normal.parameters.distance,5);assert.equal(normal.output.mode,'new-layer');
  const maintenance=core.normaliseRequest({toolId:'simplify',inputs:{source:{layerId:'poly'}},parameters:{tolerance:10},output:{mode:'modify-source'}});
  assert.equal(maintenance.output.mode,'modify-source');
  const selection=core.normaliseRequest({toolId:'invert-selection',inputs:{source:{layerId:'poly'}},output:{mode:'new-layer'}});
  assert.equal(selection.output.mode,'selection');
});

test('provenance records generic inputs, output policy and actual processing engine/CRS',()=>{
  const {core}=load();
  const pf=core.preflight({toolId:'difference',inputs:{source:{layerId:'poly',scope:'filtered'},overlay:{layerId:'poly',scope:'selected'}},output:{name:'Difference'}},{layers:[polygonLayer],selectionIds:['a']});
  assert.equal(pf.valid,true);
  const provenance=core.createProvenance(pf,{processingCrs:'EPSG:32756',engine:'geos',worker:true,result:{summary:{output:2}}});
  assert.equal(provenance.version,2);assert.equal(provenance.tool,'difference');
  assert.equal(provenance.inputs.source.layerId,'poly');assert.equal(provenance.inputs.source.scope,'filtered');
  assert.equal(provenance.inputs.overlay.scope,'selected');assert.equal(provenance.processingCrs,'EPSG:32756');assert.equal(provenance.engine,'geos');
  assert.equal(provenance.result.summary.output,2);
});

test('metric processing CRS resolves locally where possible and broad/global jobs use the fallback',()=>{
  const {core,registry}=load(),tool=registry.getTool('simplify');
  const crs={utmForLonLat:(lon,lat)=>`UTM:${Math.round(lon)}:${Math.round(lat)}`};
  assert.equal(core.resolveProcessingCrs(tool,[{geometry:{type:'Point',coordinates:[153,-27]}}],crs),'UTM:153:-27');
  assert.equal(core.resolveProcessingCrs(tool,[{geometry:{type:'LineString',coordinates:[[130,-20],[160,-20]]}}],crs),'EPSG:3857');
  assert.equal(core.resolveProcessingCrs(registry.getTool('buffer'),[{geometry:{type:'Point',coordinates:[153,-27]}}],crs),'EPSG:4326');
});

test('summary and failure contracts remain explicit for partial per-feature jobs',()=>{
  const {core}=load(),failures=[core.failure({id:'bad',properties:{name:'Bad'}},1,Error('broken'),'simplify')];
  assert.deepEqual(JSON.parse(JSON.stringify(core.resultSummary({sourceCount:3,outputCount:2,failures}))),{input:3,processed:2,output:2,failed:1,partial:true});
  assert.equal(failures[0].featureId,'bad');assert.equal(failures[0].stage,'simplify');assert.match(failures[0].message,/broken/);
});
