(function(global){
'use strict';

const VERSION='1.56.0.1';
const registry=()=>global.EditPolygonGISProcessingRegistry;
const core=()=>global.EditPolygonGISProcessingCore;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state={host:null,api:null,status:null,onOpenOutput:null,sourceLayerId:'',toolId:'buffer',query:'',request:null,preflight:null,running:false,progress:null,result:null,bound:false};

function layers(){return state.api?.getEditableLayers?.()||[];}
function selectionIds(){return state.api?.getSelection?.().ids||[];}
function layerById(id){return layers().find(layer=>layer.id===id)||null;}
function scopeLabel(layer,scope){
  const selected=new Set(selectionIds()),features=layer?.features||[];
  const count=scope==='selected'?features.filter(feature=>selected.has(feature.id)).length:scope==='filtered'?features.filter(feature=>!feature.filtered).length:features.length;
  return `${scope==='all'?'All features':scope==='filtered'?'Filtered features':'Selected features'} (${count.toLocaleString()})`;
}
function defaultRequest(sourceLayerId=state.sourceLayerId,toolId=state.toolId){
  const tool=registry()?.getTool(toolId),source=layerById(sourceLayerId),overlay=layers().find(layer=>layer.id!==sourceLayerId&&!layer.tableOnly&&layer.features?.some(feature=>/Polygon$/.test(feature.geometryType||'')));
  return core().normaliseRequest({toolId,inputs:{source:{layerId:sourceLayerId,scope:'all'},overlay:{layerId:overlay?.id||'',scope:'all'}},parameters:{},output:{name:core().defaultOutputName(tool,source)}});
}
function ensureRequest(){
  const available=layers().filter(layer=>!layer.tableOnly);
  if(!state.sourceLayerId||!available.some(layer=>layer.id===state.sourceLayerId))state.sourceLayerId=available[0]?.id||'';
  if(!state.request)state.request=defaultRequest();
  state.request.toolId=state.toolId;
  state.request.inputs.source.layerId=state.request.inputs.source.layerId||state.sourceLayerId;
}
function preflight(){
  ensureRequest();
  try{state.preflight=state.api?.previewProcessingRequest?.(clone(state.request))||core().preflight(state.request,{layers:layers(),selectionIds:selectionIds()});}
  catch(error){state.preflight={valid:false,errors:[error.message],warnings:[],request:clone(state.request),tool:registry()?.getTool(state.toolId),counts:{source:0,overlay:0}};}
  if(state.preflight?.request)state.request=clone(state.preflight.request);
  return state.preflight;
}
function toolButtons(){
  const tools=registry()?.search(state.query)||[],categories=registry()?.getCategories()||[];
  if(!tools.length)return '<p class="gis-processing-empty">No processing tools match this search.</p>';
  return categories.map(category=>{const items=tools.filter(tool=>tool.category===category.id);if(!items.length)return'';return `<section class="gis-processing-tool-group"><h4>${esc(category.title)}</h4>${items.map(tool=>`<button type="button" class="gis-processing-tool ${tool.id===state.toolId?'active':''}" data-processing-tool="${esc(tool.id)}" ${state.running?'disabled':''}><strong>${esc(tool.title)}</strong><span>${esc(tool.description)}</span></button>`).join('')}</section>`;}).join('');
}
function scopeOptions(layer,current){return ['all','filtered','selected'].map(scope=>`<option value="${scope}" ${scope===current?'selected':''}>${esc(scopeLabel(layer,scope))}</option>`).join('');}
function parameterControl(definition,value){
  const help=definition.help?`<small>${esc(definition.help)}</small>`:'';
  if(definition.type==='select')return `<label>${esc(definition.label)}<select data-processing-param="${esc(definition.id)}">${(definition.options||[]).map(option=>`<option value="${esc(option.value)}" ${option.value===value?'selected':''}>${esc(option.label)}</option>`).join('')}</select>${help}</label>`;
  const type=definition.type==='integer'||definition.type==='number'?'number':'text';return `<label>${esc(definition.label)}<input data-processing-param="${esc(definition.id)}" type="${type}" value="${esc(value??'')}" ${Number.isFinite(definition.step)?`step="${definition.step}"`:''} ${Number.isFinite(definition.min)?`min="${definition.min}"`:''} ${Number.isFinite(definition.max)?`max="${definition.max}"`:''}>${help}</label>`;
}
function parameterView(value){
  const pf=value||preflight(),tool=pf.tool||registry()?.getTool(state.toolId),source=layerById(state.request.inputs.source.layerId),available=layers().filter(layer=>!layer.tableOnly),overlayNeeded=registry()?.requiresOverlay(tool);
  if(!tool)return '<section class="gis-processing-config"><p>Choose a processing tool.</p></section>';
  const overlay=layerById(state.request.inputs.overlay.layerId);
  const params=(tool.parameters||[]).filter(item=>!item.advanced).map(definition=>parameterControl(definition,state.request.parameters[definition.id])).join('');
  const advanced=(tool.parameters||[]).filter(item=>item.advanced).map(definition=>parameterControl(definition,state.request.parameters[definition.id])).join('');
  return `<section class="gis-processing-config">
    <div class="gis-processing-heading"><div><span>${esc(registry()?.getCategory(tool.category)?.title||'Processing')}</span><h2>${esc(tool.title)}</h2><p>${esc(tool.description)}</p></div><strong>${esc(tool.outputGeometry||'Derived geometry')}</strong></div>
    <fieldset class="gis-processing-parameter-lock" ${state.running?'disabled':''}>
    <div class="gis-processing-form">
      <label>Input layer<select id="gisProcessingSource">${available.map(layer=>`<option value="${esc(layer.id)}" ${layer.id===state.request.inputs.source.layerId?'selected':''}>${esc(layer.name)}</option>`).join('')}</select></label>
      <label>Input scope<select id="gisProcessingSourceScope">${scopeOptions(source,state.request.inputs.source.scope)}</select><small>Layer visibility does not change processing membership.</small></label>
      ${overlayNeeded?`<label>Overlay layer<select id="gisProcessingOverlay"><option value="">Choose polygon overlay</option>${available.map(layer=>`<option value="${esc(layer.id)}" ${layer.id===state.request.inputs.overlay.layerId?'selected':''}>${esc(layer.name)}</option>`).join('')}</select></label><label>Overlay scope<select id="gisProcessingOverlayScope">${scopeOptions(overlay,state.request.inputs.overlay.scope)}</select></label>`:''}
      ${params}
      <label class="gis-processing-output-name">Output layer name<input id="gisProcessingOutputName" value="${esc(state.request.output.name||'')}"></label>
    </div>
    ${advanced?`<details class="gis-processing-advanced"><summary>Advanced parameters</summary><div class="gis-processing-form">${advanced}</div></details>`:''}
    </fieldset>
    <div id="gisProcessingPreflight">${preflightHtml(pf)}</div>
    ${progressHtml()}
    ${resultHtml()}
    <div class="gis-processing-actions"><button type="button" class="primary" data-processing-action="run" ${state.running||!pf.valid?'disabled':''}>${state.running?'Processing…':'Run and create layer'}</button><button type="button" data-processing-action="cancel" ${state.running?'':'disabled'}>Cancel</button></div>
  </section>`;
}
function preflightHtml(pf){
  const sourceCount=Number(pf?.counts?.source||0),overlayCount=Number(pf?.counts?.overlay||0),requires=registry()?.requiresOverlay(pf?.tool);
  return `<section class="gis-processing-preflight ${pf?.valid?'valid':'invalid'}"><header><strong>${pf?.valid?'Ready to run':'Needs attention'}</strong><span>${sourceCount.toLocaleString()} source feature${sourceCount===1?'':'s'}${requires?` · ${overlayCount.toLocaleString()} overlay feature${overlayCount===1?'':'s'}`:''}</span></header>${(pf?.errors||[]).map(message=>`<p class="error">${esc(message)}</p>`).join('')}${(pf?.warnings||[]).map(message=>`<p class="warning">${esc(message)}</p>`).join('')}${pf?.valid&&!pf?.warnings?.length?'<p class="ok">The inputs and parameters are valid. The source project will not change unless a complete output is created.</p>':''}</section>`;
}
function progressHtml(){if(!state.running&&!state.progress)return'';const update=state.progress||{stage:'Preparing…',percent:0,done:0,total:0};return `<section class="gis-processing-progress" aria-live="polite"><div><i style="width:${Math.max(0,Math.min(100,Number(update.percent)||0))}%"></i></div><strong>${esc(update.stage||'Processing…')}</strong><span>${update.total?`${Number(update.done||0).toLocaleString()} of ${Number(update.total).toLocaleString()}`:'Working locally in this browser'}</span></section>`;}
function resultHtml(){
  const result=state.result;if(!result)return'';const summary=result.summary||{},output=result.output||{},failed=Number(summary.failed||0);
  return `<section class="gis-processing-result ${failed?'partial':'success'}"><header><div><strong>${failed?'Processing completed with warnings':'Processing completed'}</strong><span>${esc(output.name||'Output layer')}</span></div><b>${Number(summary.output||output.features?.length||0).toLocaleString()} output</b></header><div class="gis-processing-result-grid"><div><span>Input</span><strong>${Number(summary.input||0).toLocaleString()}</strong></div><div><span>Processed</span><strong>${Number(summary.processed||0).toLocaleString()}</strong></div><div><span>Output</span><strong>${Number(summary.output||0).toLocaleString()}</strong></div><div><span>Failed</span><strong>${failed.toLocaleString()}</strong></div><div><span>Elapsed</span><strong>${Number(result.elapsedMs||0).toLocaleString()} ms</strong></div></div>${failed?`<details><summary>Show ${failed} failure${failed===1?'':'s'}</summary><div class="gis-processing-failures">${(result.failures||[]).slice(0,50).map(item=>`<p><strong>${esc(item.featureName||item.featureId||`Feature ${Number(item.index)+1}`)}</strong><span>${esc(item.message)}</span></p>`).join('')}${failed>50?`<p>${failed-50} more failure(s) are recorded in the output provenance.</p>`:''}</div></details>`:''}<div class="gis-button-row"><button type="button" data-processing-action="open-output">Open layer</button><button type="button" data-processing-action="zoom-output">Zoom to result</button><button type="button" data-processing-action="run-again">Run again</button></div></section>`;
}
function render(){if(!state.host)return;ensureRequest();const pf=preflight();state.host.innerHTML=`<div class="gis-processing-layout"><aside class="gis-processing-browser"><label>Find a tool<input id="gisProcessingSearch" type="search" placeholder="Search buffer, clip, hull…" value="${esc(state.query)}"></label><div class="gis-processing-tools">${toolButtons()}</div></aside>${parameterView(pf)}</div>`;}
function refreshPreflight(){if(!state.host)return;const pf=preflight(),target=state.host.querySelector('#gisProcessingPreflight');if(target)target.innerHTML=preflightHtml(pf);const run=state.host.querySelector('[data-processing-action="run"]');if(run)run.disabled=state.running||!pf.valid;}
function changeTool(id){if(state.running)return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId;state.toolId=id;state.request=defaultRequest(sourceId,id);state.result=null;render();}
function readControl(target){
  if(state.running)return;
  if(target.id==='gisProcessingSource'){const previous=layerById(state.request.inputs.source.layerId),next=layerById(target.value),oldDefault=core().defaultOutputName(registry().getTool(state.toolId),previous);state.request.inputs.source.layerId=target.value;state.sourceLayerId=target.value;if(!state.request.output.name||state.request.output.name===oldDefault)state.request.output.name=core().defaultOutputName(registry().getTool(state.toolId),next);render();return;}
  if(target.id==='gisProcessingSourceScope'){state.request.inputs.source.scope=target.value;render();return;}
  if(target.id==='gisProcessingOverlay'){state.request.inputs.overlay.layerId=target.value;render();return;}
  if(target.id==='gisProcessingOverlayScope'){state.request.inputs.overlay.scope=target.value;render();return;}
  if(target.id==='gisProcessingOutputName'){state.request.output.name=target.value;refreshPreflight();return;}
  if(target.dataset.processingParam){const definition=registry().getTool(state.toolId)?.parameters?.find(item=>item.id===target.dataset.processingParam);state.request.parameters[target.dataset.processingParam]=definition?.type==='number'||definition?.type==='integer'?Number(target.value):target.value;refreshPreflight();}
}
async function run(){
  if(state.running)return;const pf=preflight();if(!pf.valid){render();return;}
  state.running=true;state.progress={stage:'Preparing input',percent:0,done:0,total:pf.counts.source};state.result=null;render();const started=performance.now();
  try{
    const result=await state.api.runProcessingRequest(clone(state.request),update=>{state.progress=update;const progress=state.host?.querySelector('.gis-processing-progress');if(progress){const bar=progress.querySelector('i');if(bar)bar.style.width=`${Math.max(0,Math.min(100,Number(update.percent)||0))}%`;const strong=progress.querySelector('strong');if(strong)strong.textContent=update.stage||'Processing…';const span=progress.querySelector('span');if(span)span.textContent=update.total?`${Number(update.done||0).toLocaleString()} of ${Number(update.total).toLocaleString()}`:'Working locally in this browser';}});
    state.running=false;state.progress={stage:'Complete',percent:100,done:result.summary?.input||0,total:result.summary?.input||0};state.result={...result,elapsedMs:Math.max(0,Math.round(performance.now()-started))};state.status?.(`Created ${result.output.name} with ${Number(result.summary?.output||0).toLocaleString()} feature${result.summary?.output===1?'':'s'}${result.summary?.failed?`; ${result.summary.failed} source feature${result.summary.failed===1?'':'s'} failed and were reported.`:'.'}`,result.summary?.failed?'error':'ok');render();
  }catch(error){state.running=false;state.progress=null;state.status?.(error.message,'error');render();}
}
function cancel(){if(!state.running)return false;state.api?.cancelProcessing?.();state.running=false;state.progress=null;state.status?.('Processing cancelled. No project data was changed.','error');render();return true;}
function click(event){const tool=event.target.closest('[data-processing-tool]');if(tool){changeTool(tool.dataset.processingTool);return;}const action=event.target.closest('[data-processing-action]')?.dataset.processingAction;if(action==='run')run();else if(action==='cancel')cancel();else if(action==='open-output'&&state.result?.output){state.onOpenOutput?.(state.result.output);}else if(action==='zoom-output'&&state.result?.output){state.api?.zoomLayer?.(state.result.output.id);}else if(action==='run-again'){state.result=null;state.progress=null;render();}}
function input(event){const target=event.target;if(target.id==='gisProcessingSearch'){state.query=target.value;const list=state.host.querySelector('.gis-processing-tools');if(list)list.innerHTML=toolButtons();return;}readControl(target);}
function change(event){readControl(event.target);}
function bind(host){if(host._editPolygonProcessingBound)return;host._editPolygonProcessingBound=true;host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);}
function mount(host,{layerId='',api=null,status=null,onOpenOutput=null}={}){
  state.host=host;state.api=api||global.EditPolygonGIS;state.status=status;state.onOpenOutput=onOpenOutput;
  if(!state.request||state.sourceLayerId!==layerId){state.sourceLayerId=layerId;state.toolId='buffer';state.query='';state.request=null;state.preflight=null;state.result=null;state.progress=null;}
  bind(host);render();return true;
}
function isRunning(){return state.running;}
function cancelIfRunning(){return cancel();}
function reset(){if(state.running)cancel();state.request=null;state.preflight=null;state.result=null;state.progress=null;}

global.EditPolygonGISProcessingUI=Object.freeze({version:VERSION,mount,isRunning,cancelIfRunning,reset});
})(typeof window!=='undefined'?window:globalThis);
