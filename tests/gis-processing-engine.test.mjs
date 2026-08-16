import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const files=['gis-processing-registry.js','gis-processing-core.js','gis-schema-core.js','gis-spatial-core.js','gis-processing-engine.js'];
const sources=Object.fromEntries(files.map(name=>[name,fs.readFileSync(new URL(`../docs/assets/${name}`,import.meta.url),'utf8')]));
function load(){
 const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,Error,Intl,RegExp,Boolean});
 for(const name of files.slice(0,-1))vm.runInContext(sources[name],context,{filename:name});
 window.EditPolygonGeosAdapter={
  geometryEmpty:g=>!g,
  unaryUnion:(_geos,geoms)=>geoms.length?(geoms.every(g=>g.type==='Polygon')?{type:'MultiPolygon',coordinates:geoms.map(g=>g.coordinates)}:geoms[0]):null,
  difference:(_geos,a,_b)=>a,intersection:(_geos,a,_b)=>a,symDifference:(_geos,a,_b)=>a,union:(_geos,a,_b)=>a,
  simplify:(_geos,g)=>g,densify:(_geos,g)=>g,snap:(_geos,g)=>g,distance:(_geos,a,b)=>Math.abs((a.coordinates?.[0]||0)-(b.coordinates?.[0]||0)),
  validity:()=>({valid:true,reason:'Valid Geometry'}),makeValidGeometry:(_geos,g)=>g
 };
 vm.runInContext(sources['gis-processing-engine.js'],context,{filename:'gis-processing-engine.js'});
 return window;
}
const pt=(id,x=0,properties={})=>({id,type:'Feature',properties,geometry:{type:'Point',coordinates:[x,0]}});
const poly=(id,properties={})=>({id,type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}});
const crs={transformGeometry:g=>JSON.parse(JSON.stringify(g)),utmForLonLat:()=> 'EPSG:32756'};
const turf={
 buffer:f=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}),centroid:f=>pt(f.id,.5),pointOnFeature:f=>pt(f.id,.5),
 lineString:coords=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}),length:()=>1,along:(_l,d)=>pt('along',d),
 bbox:()=>[0,0,1,1],bboxPolygon:()=>poly('bbox'),point:c=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:c}}),
 coordEach:(f,cb)=>{const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(Number(v[0]))&&Number.isFinite(Number(v[1]))){cb(v);return;}v.forEach(walk);};walk(f.geometry?.coordinates);},convex:()=>poly('hull'),booleanIntersects:()=>true,booleanContains:()=>true,booleanWithin:()=>true,booleanTouches:()=>false,booleanOverlap:()=>true,booleanDisjoint:()=>false,
 pointOnFeature:f=>f.geometry.type==='Point'?f:pt('rep',0),distance:(a,b)=>Math.abs(a.geometry.coordinates[0]-b.geometry.coordinates[0])
};

test('engine performs pure conversion tools without creating separate implementations in the application',async()=>{const w=load(),engine=w.EditPolygonGISProcessingEngine;const source=[{id:'m',type:'Feature',properties:{name:'M'},geometry:{type:'MultiPoint',coordinates:[[0,0],[1,1]]}}];const result=await engine.execute({toolId:'multipart-to-singlepart',inputs:{source},parameters:{},processingCrs:'EPSG:4326'},{crs});assert.equal(result.features.length,2);assert.deepEqual(JSON.parse(JSON.stringify(result.features.map(f=>f.properties.part_index))),[1,2]);});

test('typed select-by-attribute uses schema inference rather than a text-only comparator',async()=>{const w=load(),engine=w.EditPolygonGISProcessingEngine,source=[pt('a',0,{value:2}),pt('b',1,{value:10})];const result=await engine.execute({toolId:'select-by-attribute',inputs:{source},parameters:{field:'value',operator:'gt',value:'5',selectionMode:'replace'},currentSelectionIds:[],processingCrs:'EPSG:4326'},{crs});assert.deepEqual(JSON.parse(JSON.stringify(result.selectionIds)),['b']);});

test('typed selection honours the authoritative layer schema when raw values are strings',async()=>{const w=load(),engine=w.EditPolygonGISProcessingEngine,source=[pt('a',0,{value:'2'}),pt('b',1,{value:'10'})],schema={version:1,fields:[{name:'value',type:'integer',nullable:true}]};const result=await engine.execute({toolId:'select-by-attribute',inputs:{source},inputSchemas:{source:schema},parameters:{field:'value',operator:'gt',value:'5',selectionMode:'replace'},currentSelectionIds:[],processingCrs:'EPSG:4326'},{crs});assert.deepEqual(JSON.parse(JSON.stringify(result.selectionIds)),['b']);});

test('selection and maintenance tools return the generic result contract',async()=>{const w=load(),engine=w.EditPolygonGISProcessingEngine,source=[pt('a'),pt('b')];const inverse=await engine.execute({toolId:'invert-selection',inputs:{source},parameters:{},currentSelectionIds:['a','other-layer-id'],processingCrs:'EPSG:4326'},{crs});assert.equal(inverse.kind,'selection');assert.deepEqual(JSON.parse(JSON.stringify(inverse.selectionIds)),['other-layer-id','b']);const dedupe=await engine.execute({toolId:'remove-duplicate-features',inputs:{source:[pt('a',0),pt('b',0),pt('c',1)]},parameters:{},processingCrs:'EPSG:4326'},{crs});assert.equal(dedupe.kind,'layer');assert.equal(dedupe.features.length,2);});

test('overlay and dissolve route through the shared GEOS adapter',async()=>{const w=load(),engine=w.EditPolygonGISProcessingEngine,source=[poly('a',{group:'x'}),poly('b',{group:'x'})],overlay=[poly('mask')];const difference=await engine.execute({toolId:'difference',inputs:{source,overlay},parameters:{},processingCrs:'EPSG:32756'},{geos:{},crs});assert.equal(difference.features.length,2);assert.equal(difference.processingCrs,'EPSG:32756');const dissolved=await engine.execute({toolId:'dissolve',inputs:{source},parameters:{field:'group'},processingCrs:'EPSG:4326'},{geos:{},crs});assert.equal(dissolved.features.length,1);assert.equal(dissolved.features[0].properties.group,'x');assert.equal(dissolved.features[0].properties.source_count,2);});


test('every v1.56.1 catalogue tool has an executable engine path',async()=>{
  const w=load(),engine=w.EditPolygonGISProcessingEngine,registry=w.EditPolygonGISProcessingRegistry;
  const line=(id,properties={})=>({id,type:'Feature',properties,geometry:{type:'LineString',coordinates:[[0,0],[1,0],[1,1]]}});
  const mp={id:'mp',type:'Feature',properties:{group:'g'},geometry:{type:'MultiPoint',coordinates:[[0,0],[1,1]]}};
  const p1=poly('p1',{group:'g',value:4,name:'one'}),p2=poly('p2',{group:'g',value:6,name:'two'}),mask=poly('mask',{zone:'z',value:2}),q1=pt('q1',0,{value:2,name:'low'}),q2=pt('q2',1,{value:10,name:'high'}),l1=line('l1',{group:'g'});
  const duplicateA=pt('dup-a',5,{value:1}),duplicateB=pt('dup-b',5,{value:2});
  const cases={
    'buffer':{inputs:{source:[q1]},parameters:{distance:1,units:'meters',steps:16}},
    'centroid':{inputs:{source:[p1]},parameters:{}},
    'point-on-surface':{inputs:{source:[p1]},parameters:{}},
    'convex-hull':{inputs:{source:[q1,q2]},parameters:{}},
    'bounding-geometry':{inputs:{source:[p1,p2]},parameters:{mode:'extent'}},
    'points-along-line':{inputs:{source:[l1]},parameters:{interval:500,units:'meters',includeEnds:true}},
    'union':{inputs:{source:[p1],overlay:[mask]},parameters:{}},
    'intersection':{inputs:{source:[p1],overlay:[mask]},parameters:{}},
    'difference':{inputs:{source:[p1],overlay:[mask]},parameters:{}},
    'symmetric-difference':{inputs:{source:[p1],overlay:[mask]},parameters:{}},
    'clip':{inputs:{source:[p1],overlay:[mask]},parameters:{}},
    'dissolve':{inputs:{source:[p1,p2]},parameters:{field:'group'}},
    'singlepart-to-multipart':{inputs:{source:[q1,q2]},parameters:{field:''}},
    'multipart-to-singlepart':{inputs:{source:[mp]},parameters:{}},
    'polygon-to-line':{inputs:{source:[p1]},parameters:{}},
    'line-to-points':{inputs:{source:[l1]},parameters:{}},
    'select-by-attribute':{inputs:{source:[q1,q2]},inputSchemas:{source:{version:1,fields:[{name:'value',type:'integer',nullable:true}]}},parameters:{field:'value',operator:'gt',value:'5',selectionMode:'replace'},currentSelectionIds:[]},
    'select-by-location':{inputs:{source:[q1],overlay:[mask]},parameters:{relation:'intersects',selectionMode:'replace'},currentSelectionIds:[]},
    'invert-selection':{inputs:{source:[q1,q2]},parameters:{},currentSelectionIds:['q1']},
    'select-duplicates':{inputs:{source:[duplicateA,duplicateB]},parameters:{selectionMode:'replace'},currentSelectionIds:[]},
    'select-invalid':{inputs:{source:[p1]},parameters:{selectionMode:'replace'},currentSelectionIds:[]},
    'nearest-feature':{inputs:{source:[q1],overlay:[q2]},parameters:{fields:['name']}},
    'distance-to-nearest':{inputs:{source:[q1],overlay:[q2]},parameters:{distanceField:'distance_m'}},
    'count-points-in-polygon':{inputs:{source:[p1],overlay:[q1,q2]},parameters:{countField:'point_count'}},
    'join-by-location':{inputs:{source:[q1],overlay:[q2]},parameters:{relation:'intersects',fields:['name'],matchMode:'first'}},
    'spatial-summary':{inputs:{source:[p1],overlay:[q1,q2]},parameters:{relation:'contains',field:'value',operation:'sum',outputField:'total'}},
    'fix-geometries':{inputs:{source:[p1]},parameters:{}},
    'remove-duplicate-vertices':{inputs:{source:[{...l1,geometry:{type:'LineString',coordinates:[[0,0],[0,0],[1,0]]}}]},parameters:{}},
    'remove-duplicate-features':{inputs:{source:[duplicateA,duplicateB,q2]},parameters:{}},
    'snap':{inputs:{source:[p1],overlay:[mask]},parameters:{tolerance:1}},
    'simplify':{inputs:{source:[l1]},parameters:{tolerance:1}},
    'densify':{inputs:{source:[l1]},parameters:{maxSegmentLength:100}}
  };
  const seen=[];
  for(const tool of registry.getTools()){
    const spec=cases[tool.id];assert.ok(spec,`missing execution fixture for ${tool.id}`);
    const result=await engine.execute({toolId:tool.id,...spec,processingCrs:tool.crsPolicy==='projected-metric'?'EPSG:32756':'EPSG:4326'},{turf,geos:{},crs});
    assert.equal(result.kind,tool.resultKind,`${tool.id} result kind`);
    if(result.kind==='layer')assert.ok(Array.isArray(result.features),`${tool.id} should return features`);else assert.ok(Array.isArray(result.selectionIds),`${tool.id} should return selection ids`);
    seen.push(tool.id);
  }
  assert.equal(seen.length,32);
});
