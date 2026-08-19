from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]

def path(rel): return ROOT / rel
def read(rel): return path(rel).read_text(encoding='utf-8')
def write(rel,text): path(rel).write_text(text,encoding='utf-8')

def replace_once(text, old, new, label):
    count=text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old,new,1)

def sub_once(text, pattern, repl, label, flags=0):
    out,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return out

# Registry: every tool gets a declarative preview policy; expensive/live tools override it.
rel='docs/assets/gis-processing-registry.js'
registry=read(rel)
registry=replace_once(
    registry,
    "const units=()=>p('units','Units','select',{default:'meters',options:[{value:'meters',label:'metres'},{value:'kilometers',label:'kilometres'},{value:'miles',label:'miles'}]});\n"
    "const layerTool=(value)=>Object.freeze({resultKind:'layer',mutationPolicy:'new-layer',failurePolicy:'per-feature',stylePolicy:'inherit',schemaPolicy:'preserve',...value,inputs:Object.freeze(value.inputs||[source()]),parameters:Object.freeze(value.parameters||[])});\n"
    "const selectTool=(value)=>Object.freeze({resultKind:'selection',mutationPolicy:'selection',failurePolicy:'atomic',stylePolicy:'none',schemaPolicy:'none',...value,inputs:Object.freeze(value.inputs||[source()]),parameters:Object.freeze(value.parameters||[])});",
    "const units=()=>p('units','Units','select',{default:'meters',options:[{value:'meters',label:'metres'},{value:'kilometers',label:'kilometres'},{value:'miles',label:'miles'}]});\n"
    "const previewPolicy=(value={})=>Object.freeze({enabled:value.enabled!==false,mode:value.mode||'manual',debounceMs:Number.isFinite(value.debounceMs)?value.debounceMs:250,maxAutoFeatures:Number.isFinite(value.maxAutoFeatures)?value.maxAutoFeatures:2500,expensive:!!value.expensive,metrics:Object.freeze([...(value.metrics||['features','vertices'])])});\n"
    "const layerTool=(value)=>Object.freeze({resultKind:'layer',mutationPolicy:'new-layer',failurePolicy:'per-feature',stylePolicy:'inherit',schemaPolicy:'preserve',...value,previewPolicy:previewPolicy(value.previewPolicy),inputs:Object.freeze(value.inputs||[source()]),parameters:Object.freeze(value.parameters||[])});\n"
    "const selectTool=(value)=>Object.freeze({resultKind:'selection',mutationPolicy:'selection',failurePolicy:'atomic',stylePolicy:'none',schemaPolicy:'none',...value,previewPolicy:previewPolicy(value.previewPolicy),inputs:Object.freeze(value.inputs||[source()]),parameters:Object.freeze(value.parameters||[])});",
    'registry preview policy helpers'
)

def patch_tool_policy(text, tool_id, policy):
    pattern=rf"  layerTool\(\{{id:'{re.escape(tool_id)}'[^\n]*\}}\),"
    match=re.search(pattern,text)
    if not match:
        raise RuntimeError(f"registry {tool_id}: tool line not found")
    line=match.group(0)
    if "mutationPolicy:'new-or-modify',parameters:" not in line:
        raise RuntimeError(f"registry {tool_id}: mutation/parameters anchor not found")
    replacement=line.replace(
        "mutationPolicy:'new-or-modify',parameters:",
        f"mutationPolicy:'new-or-modify',previewPolicy:{policy},parameters:",
        1
    )
    return text[:match.start()]+replacement+text[match.end():]

registry=patch_tool_policy(registry,'snap',"{mode:'manual',expensive:true,metrics:['vertices-before','vertices-after','vertices-moved']}")
registry=patch_tool_policy(registry,'simplify',"{mode:'live',debounceMs:250,maxAutoFeatures:2500,metrics:['vertices-before','vertices-after','vertices-removed']}")
registry=patch_tool_policy(registry,'densify',"{mode:'live',debounceMs:250,maxAutoFeatures:2500,metrics:['vertices-before','vertices-after','vertices-added']}")
write(rel,registry)

# Core: deterministic snapshot fingerprint. Output name/mode are intentionally omitted.
rel='docs/assets/gis-processing-core.js'
core=read(rel)
fingerprint_code=r"""
function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    const out={};
    for(const key of Object.keys(value).sort())out[key]=stableValue(value[key]);
    return out;
  }
  return value;
}
function previewFingerprint(task={}){
  const snapshot={
    toolId:task.toolId||'',
    inputs:task.inputs||{},
    inputSchemas:task.inputSchemas||{},
    inputLayerIds:task.inputLayerIds||{},
    parameters:task.parameters||{},
    currentSelectionIds:task.currentSelectionIds||[],
    processingCrs:task.processingCrs||'EPSG:4326'
  };
  const text=JSON.stringify(stableValue(snapshot));
  let hash=2166136261;
  for(let index=0;index<text.length;index++){
    hash^=text.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return `p2-${(hash>>>0).toString(16).padStart(8,'0')}-${text.length.toString(36)}`;
}

"""
core=replace_once(core,"\nglobal.EditPolygonGISProcessingCore=Object.freeze({", "\n"+fingerprint_code+"global.EditPolygonGISProcessingCore=Object.freeze({",'core fingerprint insertion')
core=replace_once(core,"combinedBounds,resolveProcessingCrs});","combinedBounds,resolveProcessingCrs,stableValue,previewFingerprint});",'core fingerprint export')
write(rel,core)

# App bridge: calculate authoritative fingerprint and commit a prepared result only when still current.
rel='docs/assets/editpolygon-app.js'
app=read(rel)
if app.count('function commitProcessingResult(') != 1:
    raise RuntimeError(f"app commitProcessingResult count was {app.count('function commitProcessingResult(')}")
bridge_insert=r"""  function processingRequestFingerprint(request={}){
    const preflight=previewProcessingRequest(request);
    if(!preflight.valid)throw Error(preflight.errors[0]||'The processing request is invalid.');
    return processingCore().previewFingerprint(processingTask(preflight));
  }
  async function commitPreparedProcessingResult(request={},preparedResult=null,fingerprint='',onProgress=()=>{}){
    const preflight=previewProcessingRequest(request);
    if(!preflight.valid)throw Error(preflight.errors[0]||'The processing request is invalid.');
    const currentFingerprint=processingCore().previewFingerprint(processingTask(preflight));
    if(!fingerprint||fingerprint!==currentFingerprint)return {reused:false,reason:'stale-preview'};
    if(!preparedResult||typeof preparedResult!=='object')return {reused:false,reason:'missing-preview-result'};
    const prepared=processingClone(preparedResult),worker=prepared._previewWorker!==false;
    delete prepared._previewWorker;
    onProgress({stage:'Validating preview',done:preflight.counts.source,total:preflight.counts.source,percent:96});
    const committed=commitProcessingResult(preflight,prepared,{worker,prepared:true});
    onProgress({stage:'Committing preview result',done:preflight.counts.source,total:preflight.counts.source,percent:100});
    return {...committed,reused:true,previewFingerprint:currentFingerprint};
  }
"""
app=sub_once(
    app,
    r"(  function commitProcessingResult\(preflight,result,options\)\{[^\n]+\}\n)(  function cancelProcessing\(\))",
    lambda m:m.group(1)+bridge_insert+m.group(2),
    'app prepared commit insertion'
)
app=replace_once(
    app,
    "Object.assign(window.EditPolygonGIS,{processingVersion:PROCESSING_VERSION,getProcessingCatalog:processingCatalog,previewProcessingRequest,runProcessingRequest,cancelProcessing,zoomLayer:zoomProcessingLayer});",
    "Object.assign(window.EditPolygonGIS,{processingVersion:PROCESSING_VERSION,getProcessingCatalog:processingCatalog,previewProcessingRequest,runProcessingRequest,cancelProcessing,zoomLayer:zoomProcessingLayer,commitPreparedProcessingResult,getProcessingPreviewFingerprint:processingRequestFingerprint});",
    'app public processing API'
)
app=replace_once(
    app,
    "window.__editPolygonGISProcessing={version:PROCESSING_VERSION,previewProcessingRequest,runProcessingRequest,cancelProcessing};",
    "window.__editPolygonGISProcessing={version:PROCESSING_VERSION,previewProcessingRequest,runProcessingRequest,cancelProcessing,commitPreparedProcessingResult,getProcessingPreviewFingerprint:processingRequestFingerprint};",
    'app internal processing API'
)
write(rel,app)

# UI preview state/policies/live preview/reuse/specialised metrics.
rel='docs/assets/gis-processing.js'
ui=read(rel)
ui=replace_once(
    ui,
    "previewing:false,previewProgress:null,previewResult:null,previewSerial:0\n};",
    "previewing:false,previewProgress:null,previewResult:null,previewSerial:0,\n  previewTimer:null,livePreview:true\n};",
    'ui preview timer state'
)
policy_helpers=r"""
function currentPreviewPolicy(){
  return registry()?.getTool(state.toolId)?.previewPolicy||{enabled:true,mode:'manual',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['features','vertices']};
}
function clearPreviewTimer(){
  if(state.previewTimer){global.clearTimeout?.(state.previewTimer);state.previewTimer=null;}
}
function scheduleAutoPreview(){
  clearPreviewTimer();
  const policy=currentPreviewPolicy();
  if(!state.livePreview||policy.mode!=='live'||busy())return;
  const pf=preflight(),count=Number(pf?.counts?.source||0),limit=Number(policy.maxAutoFeatures||2500);
  if(!pf?.valid||count>limit)return;
  state.previewTimer=global.setTimeout?.(()=>{
    state.previewTimer=null;
    runPreview({automatic:true});
  },Math.max(100,Number(policy.debounceMs)||250));
}
"""
ui=replace_once(ui,"function busy(){return state.running||state.previewing;}\n","function busy(){return state.running||state.previewing;}\n"+policy_helpers,'ui live policy helpers')

comparison_helpers=r"""
function geometryVertexPositions(geometry,out=[]){
  if(!geometry)return out;
  const point=value=>Array.isArray(value)&&value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]));
  const addLine=line=>{for(const coordinate of line||[])if(point(coordinate))out.push([Number(coordinate[0]),Number(coordinate[1])]);};
  const addRing=ring=>{const end=Math.max(0,(ring?.length||0)-1);for(let index=0;index<end;index++){const coordinate=ring[index];if(point(coordinate))out.push([Number(coordinate[0]),Number(coordinate[1])]);}};
  if(geometry.type==='Point'){if(point(geometry.coordinates))out.push([Number(geometry.coordinates[0]),Number(geometry.coordinates[1])]);}
  else if(geometry.type==='MultiPoint'||geometry.type==='LineString')addLine(geometry.coordinates);
  else if(geometry.type==='MultiLineString')for(const line of geometry.coordinates||[])addLine(line);
  else if(geometry.type==='Polygon')for(const ring of geometry.coordinates||[])addRing(ring);
  else if(geometry.type==='MultiPolygon')for(const polygon of geometry.coordinates||[])for(const ring of polygon||[])addRing(ring);
  else if(geometry.type==='GeometryCollection')for(const child of geometry.geometries||[])geometryVertexPositions(child,out);
  return out;
}
function previewVertexPositions(features=[]){const out=[];for(const feature of features||[])geometryVertexPositions(feature?.geometry,out);return out;}
function movedVertexCount(before=[],after=[]){
  const source=previewVertexPositions(before),output=previewVertexPositions(after);
  if(source.length!==output.length)return null;
  let moved=0;
  for(let index=0;index<source.length;index++)if(Math.abs(source[index][0]-output[index][0])+Math.abs(source[index][1]-output[index][1])>1e-12)moved++;
  return moved;
}
function previewComparisonMetrics(task,result,features){
  const before=previewMetrics(task.inputs?.source||[]),after=previewMetrics(features),metrics={...after,inputVertices:before.vertices,outputVertices:after.vertices};
  if(task.toolId==='simplify'){
    metrics.verticesRemoved=Math.max(0,before.vertices-after.vertices);
    metrics.reductionPct=before.vertices?metrics.verticesRemoved/before.vertices*100:0;
  }else if(task.toolId==='densify')metrics.verticesAdded=Math.max(0,after.vertices-before.vertices);
  else if(task.toolId==='snap')metrics.verticesMoved=movedVertexCount(task.inputs?.source||[],features);
  return metrics;
}
"""
ui=replace_once(ui,"\nfunction previewFeaturesFromResult(task,result){","\n"+comparison_helpers+"function previewFeaturesFromResult(task,result){",'ui comparison metrics')

ui=replace_once(
    ui,
    "const token=++previewRuntime.token,task=buildPreviewTask(pf,api),started=(global.performance?.now?.()??Date.now());",
    "const token=++previewRuntime.token,task=buildPreviewTask(pf,api),fingerprint=typeof api.getProcessingPreviewFingerprint==='function'?api.getProcessingPreviewFingerprint(clone(request)):core().previewFingerprint(task),started=(global.performance?.now?.()??Date.now());",
    'ui preview fingerprint'
)
ui=replace_once(ui,"const metrics=previewMetrics(rendered.features);","const metrics=previewComparisonMetrics(task,execution.result,rendered.features);",'ui specialised metrics')
ui=replace_once(
    ui,
    "    toolId:pf.tool.id,\n    summary,",
    "    toolId:pf.tool.id,\n    fingerprint,\n    preparedResult:{...clone(execution.result),_previewWorker:execution.worker},\n    summary,",
    'ui prepared result'
)
ui=replace_once(
    ui,
    "  previewRuntime.last=clone(preview);",
    "  previewRuntime.last=clone({...preview,preparedResult:undefined});",
    'ui public preview state sanitisation'
)

live_controls=r"""
function livePreviewControls(pf,tool){
  const policy=tool?.previewPolicy||currentPreviewPolicy();
  if(policy.mode!=='live')return '';
  const count=Number(pf?.counts?.source||0),limit=Number(policy.maxAutoFeatures||2500),paused=count>limit;
  return `<div class="gis-processing-live-preview"><label class="gis-processing-check"><input type="checkbox" data-processing-live-preview="1" ${state.livePreview?'checked':''}><span>Live preview</span></label><small>${paused?`Live preview is paused above ${limit.toLocaleString()} input features; use ${tool.resultKind==='selection'?'Preview matches':'Preview result'} manually.`:`Changes preview automatically after ${Number(policy.debounceMs||250).toLocaleString()} ms.`}</small></div>`;
}
"""
ui=replace_once(ui,"function supportsPreview(){return typeof state.api?.runProcessingPreview==='function';}","function supportsPreview(){return currentPreviewPolicy().enabled!==false&&typeof state.api?.runProcessingPreview==='function';}\n"+live_controls,'ui preview policy support')
ui=replace_once(
    ui,
    "</fieldset><div id=\"gisProcessingPreflight\">",
    "</fieldset>${livePreviewControls(pf,tool)}<div id=\"gisProcessingPreflight\">",
    'ui live controls render'
)
ui=replace_once(
    ui,
    "function clearPreviewState({cancel=true,renderNow=false}={}){state.previewSerial++;if(cancel&&state.previewing)state.api?.cancelProcessingPreview?.();else state.api?.clearProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;if(renderNow)render();}",
    "function clearPreviewState({cancel=true,renderNow=false}={}){clearPreviewTimer();state.previewSerial++;if(cancel&&state.previewing)state.api?.cancelProcessingPreview?.();else state.api?.clearProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;if(renderNow)render();}",
    'ui clear preview timer'
)
ui=replace_once(
    ui,
    "function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();}",
    "function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();scheduleAutoPreview();}",
    'ui live preview on tool change'
)
ui=replace_once(
    ui,
    "function fieldPickerAction(button){if(busy()||!state.request)return;const picker=button.closest('[data-processing-fields]');if(!picker)return;const paramId=picker.dataset.processingFields,selectAll=button.dataset.processingFieldsAction==='all',boxes=[...picker.querySelectorAll(`[data-processing-field-param=\"${paramId}\"]`)];for(const box of boxes)box.checked=selectAll;state.request.parameters[paramId]=fieldPickerCount(picker);invalidateResult();refreshPreflight();}",
    "function fieldPickerAction(button){if(busy()||!state.request)return;const picker=button.closest('[data-processing-fields]');if(!picker)return;const paramId=picker.dataset.processingFields,selectAll=button.dataset.processingFieldsAction==='all',boxes=[...picker.querySelectorAll(`[data-processing-field-param=\"${paramId}\"]`)];for(const box of boxes)box.checked=selectAll;state.request.parameters[paramId]=fieldPickerCount(picker);invalidateResult();refreshPreflight();scheduleAutoPreview();}",
    'ui field picker live preview'
)

new_read_control=r"""function readControl(target){
  if(busy()||!state.request)return;
  if(target.dataset.processingLivePreview!==undefined){
    state.livePreview=!!target.checked;
    if(state.livePreview)scheduleAutoPreview();else clearPreviewTimer();
    return;
  }
  if(target.dataset.processingFieldParam){
    const picker=target.closest('[data-processing-fields]'),paramId=target.dataset.processingFieldParam;
    if(picker&&paramId){state.request.parameters[paramId]=fieldPickerCount(picker);invalidateResult();refreshPreflight();scheduleAutoPreview();}
    return;
  }
  if(target.dataset.processingInput){
    const id=target.dataset.processingInput;
    state.request.inputs[id].layerId=target.value;
    if(id==='source'){
      state.sourceLayerId=target.value;
      if(registry()?.getTool(state.toolId)?.execution==='overlay'&&state.request.inputs.overlay?.layerId===target.value)state.request.inputs.overlay.layerId='';
    }
    invalidateResult();render();scheduleAutoPreview();return;
  }
  if(target.dataset.processingScope){
    state.request.inputs[target.dataset.processingScope].scope=target.value;
    invalidateResult();render();scheduleAutoPreview();return;
  }
  if(target.id==='gisProcessingOutputMode'){
    state.request.output.mode=target.value;
    state.result=null;state.progress=null;render();return;
  }
  if(target.id==='gisProcessingOutputName'){
    state.request.output.name=target.value;
    state.result=null;state.progress=null;refreshPreflight();return;
  }
  if(target.dataset.processingParam){
    const definition=registry().getTool(state.toolId)?.parameters?.find(item=>item.id===target.dataset.processingParam);
    let value=target.value;
    if(definition?.type==='number'||definition?.type==='integer')value=Number(value);
    else if(definition?.type==='boolean')value=!!target.checked;
    state.request.parameters[target.dataset.processingParam]=value;
    invalidateResult();refreshPreflight();scheduleAutoPreview();
  }
}
"""
ui=sub_once(ui,r"function readControl\(target\)\{[^\n]*\}\n(?=function updateProgressDom)",new_read_control,'ui control handling')

new_run_preview=r"""async function runPreview({automatic=false}={}){
  clearPreviewTimer();
  if(busy()||!supportsPreview())return;
  const pf=preflight();
  if(!pf.valid){render();return;}
  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);
  if(automatic&&count>Number(policy.maxAutoFeatures||2500))return;
  const serial=++state.previewSerial;
  state.previewing=true;
  state.previewProgress={stage:'Preparing preview',percent:0,done:0,total:pf.counts.source};
  state.previewResult=null;state.result=null;state.progress=null;render();
  try{
    const result=await state.api.runProcessingPreview(clone(state.request),update=>{
      if(serial!==state.previewSerial)return;
      state.previewProgress=update;updateProgressDom(update,'Previewing');
    });
    if(serial!==state.previewSerial)return;
    state.previewing=false;state.previewProgress=null;state.previewResult=result;
    state.status?.(`${automatic?'Live p':'P'}review ready: ${Number(result.summary?.output||0).toLocaleString()} ${result.resultKind==='selection'?'match':'output feature'}${Number(result.summary?.output||0)===1?'':'s'}. Nothing was changed.`,'ok');
    render();
  }catch(error){
    if(serial!==state.previewSerial||error?.processingPreviewCancelled)return;
    state.previewing=false;state.previewProgress=null;state.previewResult=null;state.status?.(error.message,'error');render();
  }
}
"""
ui=sub_once(ui,r"async function runPreview\(\)\{[^\n]*\}\n(?=async function run\()",new_run_preview,'ui run preview')

new_run=r"""async function run(){
  if(busy())return;
  const pf=preflight();
  if(!pf.valid){render();return;}
  const prepared=state.previewResult?.fingerprint&&state.previewResult?.preparedResult?clone(state.previewResult):null;
  clearPreviewState({cancel:false});
  state.running=true;state.progress={stage:'Preparing input',percent:0,done:0,total:pf.counts.source};state.result=null;render();
  const started=global.performance?.now?.()??Date.now();
  try{
    let result=null;
    if(prepared&&typeof state.api.commitPreparedProcessingResult==='function'){
      const reused=await state.api.commitPreparedProcessingResult(clone(state.request),clone(prepared.preparedResult),prepared.fingerprint,update=>{
        state.progress=update;updateProgressDom(update,'Processing');
      });
      if(reused?.reused)result=reused;
    }
    if(!result)result=await state.api.runProcessingRequest(clone(state.request),update=>{
      state.progress=update;updateProgressDom(update,'Processing');
    });
    state.running=false;
    state.progress={stage:'Complete',percent:100,done:result.summary?.input||0,total:result.summary?.input||0};
    state.result={...result,elapsedMs:Math.max(0,Math.round((global.performance?.now?.()??Date.now())-started))};
    const what=result.kind==='selection'?`${result.summary?.output||0} feature${result.summary?.output===1?'':'s'} selected`:result.output?.modified?`Updated ${result.output.name}`:`Created ${result.output?.name}`;
    state.status?.(`${what}.${result.reused?' Used the verified preview result.':''}`,result.summary?.failed?'error':'ok');
    render();
  }catch(error){
    state.running=false;state.progress=null;state.status?.(error.message,'error');render();
  }
}
"""
ui=sub_once(ui,r"async function run\(\)\{[^\n]*\}\n(?=function cancel\()",new_run,'ui prepared run reuse')

ui=replace_once(
    ui,
    "function externalStateChanged(){\n  if(!state.previewing&&!state.previewResult)return;\n  clearPreviewState({cancel:true});\n  if(state.host?.isConnected)render();\n}",
    "function externalStateChanged(){\n  if(!state.previewTimer&&!state.previewing&&!state.previewResult)return;\n  clearPreviewState({cancel:true});\n  if(state.host?.isConnected)render();\n}",
    'ui external invalidation'
)
ui=replace_once(
    ui,
    "  metrics:previewMetrics,\n",
    "  metrics:previewMetrics,\n  comparisonMetrics:previewComparisonMetrics,\n",
    'ui preview debug metrics export'
)
write(rel,ui)

# Add source-level regression tests for the new contracts.
write('tests/processing-preview-policy.test.mjs',r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function load(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array,Number});vm.runInContext(source,context,{filename:'gis-processing-registry.js'});return window.EditPolygonGISProcessingRegistry;}

test('preview policies are declarative with manual defaults and specialised maintenance policies',()=>{
  const api=load();
  assert.equal(api.getTool('buffer').previewPolicy.mode,'manual');
  assert.equal(api.getTool('select-by-location').previewPolicy.mode,'manual');
  const snap=api.getTool('snap').previewPolicy;
  assert.equal(snap.mode,'manual');assert.equal(snap.expensive,true);
  assert.deepEqual(snap.metrics,['vertices-before','vertices-after','vertices-moved']);
  const simplify=api.getTool('simplify').previewPolicy;
  assert.equal(simplify.mode,'live');assert.equal(simplify.debounceMs,250);assert.equal(simplify.maxAutoFeatures,2500);
  assert.deepEqual(simplify.metrics,['vertices-before','vertices-after','vertices-removed']);
  const densify=api.getTool('densify').previewPolicy;
  assert.equal(densify.mode,'live');assert.deepEqual(densify.metrics,['vertices-before','vertices-after','vertices-added']);
});
""")

write('tests/processing-preview-fingerprint.test.mjs',r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
function load(){
  const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date});
  vm.runInContext(registrySource,context,{filename:'gis-processing-registry.js'});
  vm.runInContext(coreSource,context,{filename:'gis-processing-core.js'});
  return window.EditPolygonGISProcessingCore;
}
const base=()=>({
  toolId:'simplify',
  inputs:{source:[{type:'Feature',id:'a',properties:{name:'A',value:1},geometry:{type:'LineString',coordinates:[[0,0],[1,1],[2,2]]}}]},
  inputSchemas:{source:{fields:[{name:'value',type:'number'}]}},
  inputLayerIds:{source:'layer-a'},
  parameters:{tolerance:1},
  output:{mode:'new-layer',name:'Any name'},
  currentSelectionIds:['a'],
  processingCrs:'EPSG:32756'
});

test('preview fingerprint is deterministic and ignores commit-only output settings',()=>{
  const core=load(),a=base(),b=base();
  b.output={mode:'modify-source',name:'Different name'};
  assert.equal(core.previewFingerprint(a),core.previewFingerprint(b));
  assert.equal(core.previewFingerprint(a),core.previewFingerprint(JSON.parse(JSON.stringify(a))));
});

test('preview fingerprint changes for data, schema, parameters, selection and CRS',()=>{
  const core=load(),a=base(),fingerprint=core.previewFingerprint(a);
  for(const mutate of [
    value=>{value.inputs.source[0].geometry.coordinates[1]=[1.1,1];},
    value=>{value.inputs.source[0].properties.value=2;},
    value=>{value.inputSchemas.source.fields[0].type='text';},
    value=>{value.parameters.tolerance=2;},
    value=>{value.currentSelectionIds=[];},
    value=>{value.processingCrs='EPSG:3857';}
  ]){
    const changed=base();mutate(changed);
    assert.notEqual(core.previewFingerprint(changed),fingerprint);
  }
});
""")

write('tests/processing-preview-reuse.test.mjs',r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');

test('authoritative bridge owns prepared preview commits behind fingerprint validation',()=>{
  const bridgeStart=app.indexOf('/* v1.56.1 — Processing Toolbox application bridge.');
  const bridgeEnd=app.indexOf('/* v1.56.1 — runtime authority boundary.');
  const bridge=app.slice(bridgeStart,bridgeEnd);
  assert.ok(bridgeStart>=0&&bridgeEnd>bridgeStart);
  assert.match(bridge,/function processingRequestFingerprint/);
  assert.match(bridge,/function commitPreparedProcessingResult/);
  assert.match(bridge,/fingerprint!==currentFingerprint/);
  assert.match(bridge,/commitProcessingResult\(preflight,prepared,\{worker,prepared:true\}\)/);
  const prepared=bridge.match(/async function commitPreparedProcessingResult[\s\S]*?(?=\n  function cancelProcessing)/)?.[0]||'';
  assert.doesNotMatch(prepared,/createProcessingLayer\(/);
  assert.doesNotMatch(prepared,/modifyProcessingSource\(/);
  assert.match(bridge,/getProcessingPreviewFingerprint:processingRequestFingerprint/);
});

test('Processing UI supports live preview and verified prepared-result reuse with stale fallback',()=>{
  assert.match(ui,/function scheduleAutoPreview/);
  assert.match(ui,/data-processing-live-preview/);
  assert.match(ui,/maxAutoFeatures/);
  assert.match(ui,/preparedResult/);
  assert.match(ui,/commitPreparedProcessingResult/);
  assert.match(ui,/if\(!result\)result=await state\.api\.runProcessingRequest/);
  assert.match(ui,/verticesRemoved/);
  assert.match(ui,/verticesAdded/);
  assert.match(ui,/verticesMoved/);
});
""")

# Add an independent browser regression for reuse, stale fallback, and live preview.
write('tests/browser-processing-preview-reuse-smoke.py',r'''from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'docs/assets/gis-processing.js'

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None

with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    executable=chromium_path()
    if executable:options['executable_path']=executable
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1100,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content("""<!doctype html><html><body><div id="host"></div><div id="status"></div><script>
    const manual={enabled:true,mode:'manual',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['features','vertices']};
    const tools=[
      {id:'buffer',title:'Buffer',category:'geometry',description:'Buffer',resultKind:'layer',mutationPolicy:'new-layer',previewPolicy:manual,inputs:[{id:'source',label:'Input layer',families:['polygon'],scopes:['all']}],parameters:[{id:'distance',label:'Distance',type:'number',default:1,required:true,min:0,nonZero:true}]},
      {id:'simplify',title:'Simplify',category:'maintenance',description:'Simplify',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,mode:'live',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['vertices-before','vertices-after','vertices-removed']},inputs:[{id:'source',label:'Input layer',families:['polygon'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance',type:'number',default:1,required:true,min:0,nonZero:true}]}
    ];
    window.EditPolygonGISProcessingRegistry={
      getTool:id=>tools.find(t=>t.id===id)||null,
      search:q=>tools.filter(t=>!q||t.title.toLowerCase().includes(q.toLowerCase())),
      getCategories:()=>[{id:'geometry',title:'Vector geometry'},{id:'maintenance',title:'Geometry maintenance'}],
      getCategory:id=>({geometry:{title:'Vector geometry'},maintenance:{title:'Geometry maintenance'}}[id])
    };
    const fam=t=>/Polygon$/i.test(t||'')?'polygon':'other';
    function normaliseRequest(v){
      const tool=EditPolygonGISProcessingRegistry.getTool(v.toolId||'buffer'),inputs={source:{layerId:v.inputs?.source?.layerId||'source',scope:'all'}},parameters={};
      for(const d of tool.parameters||[])parameters[d.id]=v.parameters?.[d.id]??d.default??'';
      return {toolId:tool.id,inputs,parameters,output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}};
    }
    function preflight(v){
      const request=normaliseRequest(v),tool=EditPolygonGISProcessingRegistry.getTool(request.toolId),layer=window.__layers[0],features=layer.features,errors=[];
      for(const d of tool.parameters||[])if(d.required&&(!Number(request.parameters[d.id])||Number(request.parameters[d.id])<0))errors.push(d.label+' is required.');
      return {valid:!errors.length,errors,warnings:[],request,tool,inputs:{source:layer},inputFeatures:{source:features},counts:{source:features.length,overlay:0},source:layer};
    }
    window.EditPolygonGISProcessingCore={family:fam,normaliseRequest,defaultOutputName:(t,s)=>(s?.name||'Layer')+' — '+t.title,preflight,resolveProcessingCrs:()=> 'EPSG:4326',previewFingerprint:()=> 'unused'};
    window.__layers=[{id:'source',name:'Source',features:[{id:'a',geometryType:'Polygon',properties:{name:'A'}}]}];
    window.__previewCalls=0;window.__runCalls=0;window.__preparedCalls=0;window.__mutations=0;
    window.EditPolygonGIS={
      getEditableLayers:()=>window.__layers,getSelection:()=>({ids:[]}),previewProcessingRequest:r=>preflight(r),
      runProcessingPreview:async(r,onProgress)=>{
        window.__previewCalls++;onProgress({stage:'Preview',done:1,total:1,percent:100});
        const value=Number(r.parameters.distance??r.parameters.tolerance??1),fp=r.toolId+':'+value;
        return {kind:'preview',resultKind:'layer',summary:{input:1,processed:1,output:1,failed:0},metrics:{features:1,inputVertices:4,outputVertices:r.toolId==='simplify'?3:4,verticesRemoved:r.toolId==='simplify'?1:0,reductionPct:r.toolId==='simplify'?25:0},renderedCount:1,truncated:false,processingCrs:'EPSG:4326',elapsedMs:5,temporary:true,fingerprint:fp,preparedResult:{kind:'layer',features:[{type:'Feature',id:'a',properties:{name:'A'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}],summary:{input:1,processed:1,output:1,failed:0}}};
      },
      clearProcessingPreview:()=>true,cancelProcessingPreview:()=>true,cancelProcessing:()=>true,
      commitPreparedProcessingResult:async(r,prepared,fingerprint,onProgress)=>{
        window.__preparedCalls++;
        const value=Number(r.parameters.distance??r.parameters.tolerance??1),current=r.toolId+':'+value;
        if(fingerprint!==current)return {reused:false,reason:'stale-preview'};
        window.__mutations++;onProgress({stage:'Commit preview',done:1,total:1,percent:100});
        return {kind:'layer',reused:true,output:{id:'out',name:r.output.name||'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]};
      },
      runProcessingRequest:async r=>{window.__runCalls++;window.__mutations++;return {kind:'layer',output:{id:'out2',name:r.output.name||'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]};}
    };
    </script></body></html>""")
    page.add_script_tag(path=str(JS))
    page.evaluate("""EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',api:EditPolygonGIS,status:(m,t)=>document.getElementById('status').textContent=m})""")

    # A manual preview is committed exactly once without recomputation.
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_selector('.gis-processing-result:not(.gis-processing-preview)')
    assert page.evaluate('window.__preparedCalls')==1
    assert page.evaluate('window.__runCalls')==0
    assert page.evaluate('window.__mutations')==1
    assert 'verified preview result' in page.locator('#status').inner_text().lower()

    # Once a parameter changes the preview becomes stale/cleared, so Run recomputes normally.
    page.locator('[data-processing-action="run-again"]').click()
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-param="distance"]').fill('2')
    page.locator('[data-processing-param="distance"]').dispatch_event('change')
    assert page.locator('.gis-processing-preview').count()==0
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_timeout(30)
    assert page.evaluate('window.__runCalls')==1
    assert page.evaluate('window.__mutations')==2

    # Simplify opts into debounced live preview and reports comparison metrics.
    page.locator('[data-processing-tool="simplify"]').click()
    before=page.evaluate('window.__previewCalls')
    page.locator('[data-processing-param="tolerance"]').fill('3')
    page.wait_for_timeout(400)
    assert page.evaluate('window.__previewCalls')>before
    page.wait_for_selector('.gis-processing-preview')
    assert '1 vertices removed' in page.locator('.gis-processing-preview').inner_text().lower()
    assert page.locator('[data-processing-live-preview]').is_checked()
    assert not errors,errors
    browser.close()
print('Processing preview reuse/live browser smoke test passed.')
''')

# Ensure the new browser smoke test is part of the full gate.
rel='package.json'
package=json.loads(read(rel))
smoke=package['scripts']['test:browser-smoke']
extra='python tests/browser-processing-preview-reuse-smoke.py'
if extra not in smoke:
    anchor='python tests/browser-processing-preview-smoke.py'
    if anchor not in smoke: raise RuntimeError('package browser preview smoke anchor missing')
    smoke=smoke.replace(anchor,anchor+' && '+extra)
    package['scripts']['test:browser-smoke']=smoke
package['scripts']['test:browser-processing-preview']='python tests/browser-processing-preview-smoke.py && '+extra
write(rel,json.dumps(package,indent=2,ensure_ascii=False)+'\n')

# Final assertions: these must be present in the working tree before CI is allowed to commit.
registry=read('docs/assets/gis-processing-registry.js')
core=read('docs/assets/gis-processing-core.js')
app=read('docs/assets/editpolygon-app.js')
ui=read('docs/assets/gis-processing.js')
for label,text,tokens in [
  ('registry',registry,['previewPolicy','maxAutoFeatures',"'simplify'","'densify'","'snap'"]),
  ('core',core,['previewFingerprint','stableValue']),
  ('app',app,['commitPreparedProcessingResult','getProcessingPreviewFingerprint','stale-preview']),
  ('ui',ui,['scheduleAutoPreview','data-processing-live-preview','preparedResult','commitPreparedProcessingResult','verticesRemoved','verticesAdded','verticesMoved'])
]:
    missing=[token for token in tokens if token not in text]
    if missing: raise RuntimeError(f"{label}: missing required completion tokens {missing}")

print('Processing preview completion patch applied with all architectural assertions satisfied.')