import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPreviewRuntime(){
  const project={files:[{
    id:'source',name:'Source',gisSchema:{fields:[{name:'kind',type:'text'}]},
    features:[
      {id:'a',name:'A',properties:{kind:'keep'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]},_gisFiltered:false},
      {id:'b',name:'B',properties:{kind:'drop'},geometry:{type:'Polygon',coordinates:[[[2,0],[3,0],[3,1],[2,1],[2,0]]]},_gisFiltered:true}
    ]
  }]};
  const layers=[{id:'source',name:'Source',features:[
    {id:'a',geometryType:'Polygon',properties:{kind:'keep'},filtered:false},
    {id:'b',geometryType:'Polygon',properties:{kind:'drop'},filtered:true}
  ]}];
  const selection={ids:['a']};
  const mapState={sets:[],clears:0};
  globalThis.window=undefined;
  globalThis.document=undefined;
  globalThis.compactProjectState=()=>({files:project.files});
  globalThis.EditPolygonMap={
    createVectorOverlayLayer:()=>({id:'preview'}),
    clearVectorOverlayLayer:()=>{mapState.clears++;},
    setVectorOverlayFeatures:(_layer,features)=>{mapState.sets.push(structuredClone(features));}
  };
  globalThis.EditPolygonCRS={};
  globalThis.EditPolygonGISProcessingCore={
    resolveProcessingCrs:()=> 'EPSG:32756',
    family:type=>/Polygon$/.test(type)?'polygon':'other',
    previewFingerprint:()=> 'test-fingerprint'
  };
  globalThis.EditPolygonGISProcessingRegistry={};
  let setSelectionCalls=0;
  const makePreflight=(request,kind='layer')=>{
    const scope=request.inputs?.source?.scope||'all';
    const selectedSet=new Set(selection.ids);
    let scoped=layers[0].features.filter(f=>scope==='selected'?selectedSet.has(f.id):scope==='filtered'?!f.filtered:true);
    return {
      valid:true,errors:[],warnings:[],request:{
        toolId:request.toolId,inputs:{source:{layerId:'source',scope}},
        parameters:request.parameters||{},output:request.output||{mode:'new-layer',name:'Result'}
      },
      tool:{id:request.toolId,inputs:[{id:'source',label:'Input layer'}],resultKind:kind,engine:'pure'},
      inputs:{source:layers[0]},inputFeatures:{source:scoped},counts:{source:scoped.length},source:layers[0]
    };
  };
  globalThis.EditPolygonGIS={
    getEditableLayers:()=>layers,
    getSelection:()=>selection,
    previewProcessingRequest:request=>makePreflight(request,request.toolId==='select-test'?'selection':'layer'),
    setSelection:()=>{setSelectionCalls++;throw new Error('Preview must not mutate selection');}
  };
  globalThis.EditPolygonGISProcessingEngine={
    execute:async task=>{
      if(task.toolId==='select-test')return {kind:'selection',selectionIds:['a'],summary:{input:task.inputs.source.length,processed:task.inputs.source.length,output:1,failed:0},failures:[],processingCrs:task.processingCrs,engine:'pure'};
      return {kind:'layer',features:task.inputs.source.map(f=>structuredClone(f)),summary:{input:task.inputs.source.length,processed:task.inputs.source.length,output:task.inputs.source.length,failed:0},failures:[],processingCrs:task.processingCrs,engine:'pure'};
    }
  };
  delete globalThis.EditPolygonGISProcessingUI;
  delete globalThis.__editPolygonGISProcessingPreview;
  const code=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
  vm.runInThisContext(code,{filename:'gis-processing.js'});
  return {project,layers,selection,mapState,api:globalThis.EditPolygonGIS,getSetSelectionCalls:()=>setSelectionCalls,makePreflight};
}

test('preview task clones exact filtered scope and preserves canonical ids/schema',()=>{
  const {api,makePreflight}=loadPreviewRuntime();
  const pf=makePreflight({toolId:'buffer',inputs:{source:{layerId:'source',scope:'filtered'}},parameters:{distance:1},output:{mode:'new-layer',name:'Buffer'}});
  const task=globalThis.__editPolygonGISProcessingPreview.buildTask(pf,api);
  assert.equal(task.inputs.source.length,1);
  assert.equal(task.inputs.source[0].id,'a');
  assert.equal(task.inputs.source[0].properties.name,'A');
  assert.deepEqual(task.inputSchemas.source,{fields:[{name:'kind',type:'text'}]});
  assert.equal(task.processingCrs,'EPSG:32756');
});

test('layer preview renders an isolated overlay and never mutates project data',async()=>{
  const {api,project,mapState,getSetSelectionCalls}=loadPreviewRuntime();
  const before=JSON.stringify(project);
  const result=await api.runProcessingPreview({toolId:'buffer',inputs:{source:{layerId:'source',scope:'all'}},parameters:{distance:1},output:{mode:'new-layer',name:'Buffer'}});
  assert.equal(result.temporary,true);
  assert.equal(result.resultKind,'layer');
  assert.equal(result.summary.output,2);
  assert.equal(result.processingCrs,'EPSG:32756');
  assert.equal(result.mapCrs,'EPSG:4326');
  assert.equal(mapState.sets.length,1);
  assert.equal(mapState.sets[0].length,2);
  assert.equal(getSetSelectionCalls(),0);
  assert.equal(JSON.stringify(project),before);
});

test('selection preview highlights matches without applying selection',async()=>{
  const {api,project,mapState,getSetSelectionCalls}=loadPreviewRuntime();
  const before=JSON.stringify(project);
  const result=await api.runProcessingPreview({toolId:'select-test',inputs:{source:{layerId:'source',scope:'all'}},parameters:{},output:{mode:'selection',name:''}});
  assert.equal(result.resultKind,'selection');
  assert.deepEqual(result.selectionIds,['a']);
  assert.equal(mapState.sets.at(-1).length,1);
  assert.equal(getSetSelectionCalls(),0);
  assert.equal(JSON.stringify(project),before);
});

test('clearing preview removes only the temporary overlay',async()=>{
  const {api,mapState}=loadPreviewRuntime();
  await api.runProcessingPreview({toolId:'buffer',inputs:{source:{layerId:'source',scope:'all'}},parameters:{},output:{mode:'new-layer',name:'Buffer'}});
  const clears=mapState.clears;
  assert.equal(api.clearProcessingPreview(),true);
  assert.ok(mapState.clears>clears);
  assert.equal(api.getProcessingPreviewState(),null);
});
