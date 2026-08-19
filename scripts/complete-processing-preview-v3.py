from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
OLD_KEY='20260819-v1561-point-line-validation-v5'
NEW_KEY='20260820-v1561-processing-preview-v6'

def read(rel): return (ROOT/rel).read_text(encoding='utf-8')
def write(rel,text): (ROOT/rel).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1: raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old,new,1)
def sub_once(text,pattern,repl,label,flags=0):
    out,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count!=1: raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return out

# ---------------------------------------------------------------------------
# Registry: separate *what* a preview displays (geometry/selection/data) from
# *when* it refreshes (manual/live). Simplify and Densify also declare a
# logarithmic metric slider while retaining exact numeric input.
# ---------------------------------------------------------------------------
rel='docs/assets/gis-processing-registry.js'
registry=read(rel)
registry=replace_once(
    registry,
    "const previewPolicy=(value={})=>Object.freeze({enabled:value.enabled!==false,mode:value.mode||'manual',debounceMs:Number.isFinite(value.debounceMs)?value.debounceMs:250,maxAutoFeatures:Number.isFinite(value.maxAutoFeatures)?value.maxAutoFeatures:2500,expensive:!!value.expensive,metrics:Object.freeze([...(value.metrics||['features','vertices'])])});",
    "const previewPolicy=(value={},kind='geometry')=>Object.freeze({enabled:value.enabled!==false,kind:value.kind||kind,mode:value.mode||'manual',debounceMs:Number.isFinite(value.debounceMs)?value.debounceMs:300,maxAutoFeatures:Number.isFinite(value.maxAutoFeatures)?value.maxAutoFeatures:2500,expensive:!!value.expensive,metrics:Object.freeze([...(value.metrics||['features','vertices'])])});",
    'registry semantic preview policy'
)
registry=replace_once(registry,"previewPolicy:previewPolicy(value.previewPolicy),inputs:","previewPolicy:previewPolicy(value.previewPolicy,'geometry'),inputs:",'registry layer preview kind')
registry=replace_once(registry,"previewPolicy:previewPolicy(value.previewPolicy),inputs:","previewPolicy:previewPolicy(value.previewPolicy,'selection'),inputs:",'registry selection preview kind')

def patch_data_policy(text,tool_id):
    pattern=rf"  layerTool\(\{{id:'{re.escape(tool_id)}'[^\n]*\}}\),?"
    match=re.search(pattern,text)
    if not match: raise RuntimeError(f'registry data policy: {tool_id} line missing')
    line=match.group(0)
    if 'previewPolicy:' in line: return text
    policy="previewPolicy:{kind:'data',mode:'manual',metrics:['features','attributes']}"
    if ',parameters:' in line: replacement=line.replace(',parameters:',','+policy+',parameters:',1)
    else:
        suffix='}),' if line.endswith('}),') else '})'
        replacement=line[:-len(suffix)]+','+policy+suffix
    return text[:match.start()]+replacement+text[match.end():]

for tool_id in ['nearest-feature','distance-to-nearest','count-points-in-polygon','join-by-location','spatial-summary']:
    registry=patch_data_policy(registry,tool_id)

registry=replace_once(
    registry,
    "p('tolerance','Tolerance (metres)','number',{required:true,default:1,min:0,nonZero:true,step:.1})",
    "p('tolerance','Tolerance (metres)','number',{required:true,default:1,min:0,nonZero:true,step:.1,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}})",
    'simplify logarithmic slider metadata'
)
registry=replace_once(
    registry,
    "p('maxSegmentLength','Maximum segment length (metres)','number',{required:true,default:100,min:0,nonZero:true,step:1})",
    "p('maxSegmentLength','Maximum segment length (metres)','number',{required:true,default:100,min:0,nonZero:true,step:1,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}})",
    'densify logarithmic slider metadata'
)
write(rel,registry)

# ---------------------------------------------------------------------------
# UI helpers: logarithmic sliders, semantic preview modes, richer comparison
# metrics, data tables and explicit stale/refresh state.
# ---------------------------------------------------------------------------
rel='docs/assets/gis-processing.js'
ui=read(rel)
ui=replace_once(
    ui,
    "previewing:false,previewProgress:null,previewResult:null,previewSerial:0,\n  previewTimer:null,livePreview:true\n};",
    "previewing:false,previewProgress:null,previewResult:null,previewSerial:0,\n  previewTimer:null,livePreview:true,previewActivated:false,previewStale:false\n};",
    'ui preview activation state'
)
slider_helpers=r"""
function sliderPosition(value,meta={}){
  const min=Math.max(1e-9,Number(meta.min)||1),max=Math.max(min*1.000001,Number(meta.max)||100000),number=Math.max(min,Math.min(max,Number(value)||min));
  return Math.round(1000*Math.log(number/min)/Math.log(max/min));
}
function sliderValue(position,meta={}){
  const min=Math.max(1e-9,Number(meta.min)||1),max=Math.max(min*1.000001,Number(meta.max)||100000),fraction=Math.max(0,Math.min(1000,Number(position)||0))/1000,raw=min*Math.pow(max/min,fraction);
  return raw<10?Number(raw.toFixed(2)):raw<100?Number(raw.toFixed(1)):Math.round(raw);
}
function previewKind(tool=registry()?.getTool(state.toolId)){
  return tool?.previewPolicy?.kind||(tool?.resultKind==='selection'?'selection':'geometry');
}
function previewActionLabel(tool=registry()?.getTool(state.toolId)){
  if(state.previewStale)return 'Refresh preview';
  if(tool?.resultKind==='selection')return 'Preview matches';
  return previewKind(tool)==='data'?'Preview data':'Preview on map';
}
"""
ui=replace_once(ui,"function currentPreviewPolicy(){",slider_helpers+"function currentPreviewPolicy(){",'ui slider/semantic helpers')
ui=replace_once(ui,"if(!state.livePreview||policy.mode!=='live'||busy())return;","if(!state.previewActivated||!state.livePreview||policy.mode!=='live'||busy())return;",'live preview requires activation')

new_parameter_control=r"""function parameterControl(definition,value){
  const help=definition.help?`<small>${esc(definition.help)}</small>`:'',inputLayer=layerById(state.request.inputs?.[definition.input||'source']?.layerId),availableFields=fields(inputLayer);
  if(definition.type==='select')return `<label>${esc(definition.label)}<select data-processing-param="${esc(definition.id)}">${(definition.options||[]).map(option=>`<option value="${esc(option.value)}" ${option.value===value?'selected':''}>${esc(option.label)}</option>`).join('')}</select>${help}</label>`;
  if(definition.type==='boolean')return `<label class="gis-processing-check"><input data-processing-param="${esc(definition.id)}" type="checkbox" ${value?'checked':''}><span>${esc(definition.label)}</span>${help}</label>`;
  if(definition.type==='field')return `<label>${esc(definition.label)}<select data-processing-param="${esc(definition.id)}">${definition.allowBlank?`<option value="">${esc(definition.blankLabel||'None')}</option>`:''}${availableFields.map(field=>`<option value="${esc(field)}" ${field===value?'selected':''}>${esc(field)}</option>`).join('')}</select>${help}</label>`;
  if(definition.type==='fields'){
    const values=new Set(Array.isArray(value)?value:[]),selected=availableFields.filter(field=>values.has(field));
    return `<fieldset class="gis-processing-field-picker" data-processing-fields="${esc(definition.id)}"><legend>${esc(definition.label)}</legend><div class="gis-processing-field-picker-head"><span data-processing-field-count>${selected.length.toLocaleString()} of ${availableFields.length.toLocaleString()} selected</span><div><button type="button" data-processing-fields-action="all">Select all</button><button type="button" data-processing-fields-action="none">Clear</button></div></div><div class="gis-processing-field-options">${availableFields.length?availableFields.map(field=>`<label class="gis-processing-field-option"><input type="checkbox" data-processing-field-param="${esc(definition.id)}" value="${esc(field)}" ${values.has(field)?'checked':''}><span>${esc(field)}</span></label>`).join(''):'<p class="gis-processing-field-empty">No fields are available in this layer.</p>'}</div><small>${definition.allowBlank?'No fields selected means no attributes will be copied.':'Choose one or more fields.'}</small>${help}</fieldset>`;
  }
  const type=definition.type==='integer'||definition.type==='number'?'number':'text',numeric=`<input data-processing-param="${esc(definition.id)}" type="${type}" value="${esc(value??'')}" ${Number.isFinite(definition.step)?`step="${definition.step}"`:''} ${Number.isFinite(definition.min)?`min="${definition.min}"`:''} ${Number.isFinite(definition.max)?`max="${definition.max}"`:''}>`;
  if((definition.type==='integer'||definition.type==='number')&&definition.slider){
    const labels=(definition.slider.labels||[]).map(label=>`<span>${esc(label)}</span>`).join('');
    return `<label>${esc(definition.label)}<div class="gis-processing-number-slider">${numeric}<input class="gis-processing-slider" type="range" data-processing-slider="${esc(definition.id)}" min="0" max="1000" step="1" value="${sliderPosition(value,definition.slider)}" aria-label="${esc(definition.label)} slider"><div class="gis-processing-slider-labels">${labels}</div></div>${help}</label>`;
  }
  return `<label>${esc(definition.label)}${numeric}${help}</label>`;
}
"""
ui=sub_once(ui,r"function parameterControl\(definition,value\)\{[\s\S]*?\n?function outputControls",new_parameter_control+"function outputControls",'ui slider parameter control')

# Refine the visual overlay by geometry family while keeping selection distinct.
ui=sub_once(
    ui,
    r"function previewStyle\(kind='layer'\)\{[\s\S]*?\n\}",
    r"""function previewStyle(kind='layer',geometryType=''){
  if(kind==='selection')return {color:'#d97706',weight:4,opacity:1,dashArray:'5,4',fillColor:'#d97706',fillOpacity:.12,radius:8};
  if(/Point$/.test(geometryType))return {color:'#7c3aed',weight:3,opacity:1,dashArray:'4,3',fillColor:'#7c3aed',fillOpacity:.05,radius:8};
  if(/LineString$/.test(geometryType))return {color:'#7c3aed',weight:4,opacity:.98,dashArray:'8,5',fillOpacity:0,radius:7};
  return {color:'#7c3aed',weight:3,opacity:.98,dashArray:'8,5',fillColor:'#7c3aed',fillOpacity:.08,radius:7};
}""",
    'ui preview style by geometry'
)
ui=replace_once(ui,"style:previewStyle(kind)","style:previewStyle(kind,feature.geometry?.type)",'preview overlay geometry style call')

# Replace the basic moved-count helper with metric comparison helpers.
comparison=r"""function coordinateDistanceM(a,b){
  if(!Array.isArray(a)||!Array.isArray(b))return 0;
  try{if(global.turf?.distance)return (Number(global.turf.distance(a,b,{units:'kilometers'}))||0)*1000;}catch(_){}
  const rad=Math.PI/180,lat1=Number(a[1])*rad,lat2=Number(b[1])*rad,dlat=(Number(b[1])-Number(a[1]))*rad,dlon=(Number(b[0])-Number(a[0]))*rad,h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function geometryLines(geometry,out=[]){
  if(!geometry)return out;
  if(geometry.type==='LineString')out.push(geometry.coordinates||[]);
  else if(geometry.type==='MultiLineString'||geometry.type==='Polygon')out.push(...(geometry.coordinates||[]));
  else if(geometry.type==='MultiPolygon')for(const polygon of geometry.coordinates||[])out.push(...(polygon||[]));
  else if(geometry.type==='GeometryCollection')for(const child of geometry.geometries||[])geometryLines(child,out);
  return out;
}
function longestSegmentM(features=[]){
  let longest=0;
  for(const feature of features||[])for(const line of geometryLines(feature?.geometry,[]))for(let index=1;index<(line?.length||0);index++)longest=Math.max(longest,coordinateDistanceM(line[index-1],line[index]));
  return longest;
}
function snapComparison(before=[],after=[]){
  const byId=new Map((after||[]).map((feature,index)=>[feature?.id??`#${index}`,feature]));
  let verticesMoved=0,maxDisplacementM=0,featuresUnchanged=0,featuresChanged=0;
  (before||[]).forEach((source,index)=>{
    const output=byId.get(source?.id??`#${index}`)||after?.[index];if(!output)return;
    if(JSON.stringify(source?.geometry||null)===JSON.stringify(output?.geometry||null)){featuresUnchanged++;return;}
    featuresChanged++;
    const a=geometryVertexPositions(source?.geometry,[]),b=geometryVertexPositions(output?.geometry,[]);
    for(let i=0;i<Math.min(a.length,b.length);i++){const distance=coordinateDistanceM(a[i],b[i]);if(distance>.001){verticesMoved++;maxDisplacementM=Math.max(maxDisplacementM,distance);}}
  });
  return {verticesMoved,maxDisplacementM,featuresUnchanged,featuresChanged};
}
function previewComparisonMetrics(task,result,features){
  const source=task.inputs?.source||[],before=previewMetrics(source),after=previewMetrics(features),metrics={...after,inputVertices:before.vertices,outputVertices:after.vertices};
  if(task.toolId==='simplify'){
    metrics.verticesRemoved=Math.max(0,before.vertices-after.vertices);metrics.reductionPct=before.vertices?metrics.verticesRemoved/before.vertices*100:0;
  }else if(task.toolId==='densify'){
    metrics.verticesAdded=Math.max(0,after.vertices-before.vertices);metrics.longestSegmentBeforeM=longestSegmentM(source);metrics.longestSegmentAfterM=longestSegmentM(features);
  }else if(task.toolId==='snap')Object.assign(metrics,snapComparison(source,features));
  return metrics;
}
function previewDataResult(task,features=[]){
  const sourceFields=new Set();for(const feature of task.inputs?.source||[])for(const key of Object.keys(feature?.properties||{}))sourceFields.add(key);
  const all=[];const seen=new Set();for(const feature of features||[])for(const key of Object.keys(feature?.properties||{}))if(!seen.has(key)){seen.add(key);all.push(key);}
  all.sort((a,b)=>sourceFields.has(a)===sourceFields.has(b)?a.localeCompare(b):sourceFields.has(a)?1:-1);
  const fields=all.slice(0,8),rows=(features||[]).slice(0,8).map(feature=>fields.map(field=>feature?.properties?.[field]??''));
  return {fields,rows,totalRows:features.length,totalFields:all.length,truncated:features.length>8||all.length>8};
}
"""
ui=sub_once(ui,r"function movedVertexCount\(before=\[\],after=\[\]\)\{[\s\S]*?function previewComparisonMetrics\(task,result,features\)\{[\s\S]*?\n\}\n(?=function previewFeaturesFromResult)",comparison,'ui rich comparison metrics')

# Data-result previews compute the same layer result but do not paint a duplicate
# geometry overlay; instead they expose a compact result-attribute table.
ui=replace_once(
    ui,
    "const rendered=renderPreviewOverlay(task,execution.result);",
    "const kind=previewKind(pf.tool),previewFeatures=previewFeaturesFromResult(task,execution.result),rendered=kind==='data'?{features:previewFeatures,renderedCount:0,truncated:false}:renderPreviewOverlay(task,execution.result);",
    'semantic data preview rendering'
)
ui=replace_once(
    ui,
    "    toolId:pf.tool.id,\n    fingerprint,",
    "    toolId:pf.tool.id,\n    previewKind:kind,\n    dataPreview:kind==='data'?previewDataResult(task,rendered.features):null,\n    fingerprint,",
    'semantic preview result metadata'
)

new_preview_html=r"""function previewDataHtml(preview){
  const data=preview?.dataPreview;if(!data?.fields?.length)return '';
  return `<div class="gis-processing-data-preview"><div><table><thead><tr>${data.fields.map(field=>`<th>${esc(field)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><small>Showing ${Math.min(data.rows.length,data.totalRows).toLocaleString()} of ${Number(data.totalRows||0).toLocaleString()} result rows${data.totalFields>data.fields.length?` · ${data.fields.length.toLocaleString()} of ${Number(data.totalFields).toLocaleString()} fields`:''}.</small></div>`;
}
function previewHtml(){
  const preview=state.previewResult;if(!preview)return '';
  const s=preview.summary||{},m=preview.metrics||{},selection=preview.resultKind==='selection',dataMode=preview.previewKind==='data',detail=[];
  if(Number.isFinite(m.inputVertices)&&Number.isFinite(m.outputVertices)&&m.inputVertices!==m.outputVertices)detail.push(`${Number(m.inputVertices).toLocaleString()} → ${Number(m.outputVertices).toLocaleString()} vertices`);else if(m.vertices)detail.push(`${Number(m.vertices).toLocaleString()} vertices`);
  if(Number.isFinite(m.verticesRemoved))detail.push(`${Number(m.verticesRemoved).toLocaleString()} ${Number(m.verticesRemoved)===1?'vertex':'vertices'} removed${Number.isFinite(m.reductionPct)?` (${fmtMetric(m.reductionPct,'%')})`:''}`);
  if(Number.isFinite(m.verticesAdded))detail.push(`${Number(m.verticesAdded).toLocaleString()} ${Number(m.verticesAdded)===1?'vertex':'vertices'} added`);
  if(Number.isFinite(m.longestSegmentBeforeM)&&Number.isFinite(m.longestSegmentAfterM))detail.push(`longest segment ${fmtMetric(m.longestSegmentBeforeM>=1000?m.longestSegmentBeforeM/1000:m.longestSegmentBeforeM,m.longestSegmentBeforeM>=1000?'km':'m')} → ${fmtMetric(m.longestSegmentAfterM>=1000?m.longestSegmentAfterM/1000:m.longestSegmentAfterM,m.longestSegmentAfterM>=1000?'km':'m')}`);
  if(m.verticesMoved!=null)detail.push(`${Number(m.verticesMoved).toLocaleString()} ${Number(m.verticesMoved)===1?'vertex':'vertices'} moved`);
  if(Number.isFinite(m.maxDisplacementM))detail.push(`maximum displacement ${fmtMetric(m.maxDisplacementM>=1000?m.maxDisplacementM/1000:m.maxDisplacementM,m.maxDisplacementM>=1000?'km':'m')}`);
  if(Number.isFinite(m.featuresUnchanged))detail.push(`${Number(m.featuresUnchanged).toLocaleString()} features unchanged`);
  if(m.polygonAreaM2)detail.push(m.polygonAreaM2>=1e6?`${fmtMetric(m.polygonAreaM2/1e6,'km²')} total area`:m.polygonAreaM2>=1e4?`${fmtMetric(m.polygonAreaM2/1e4,'ha')} total area`:`${fmtMetric(m.polygonAreaM2,'m²')} total area`);
  if(m.lineLengthM)detail.push(m.lineLengthM>=1000?`${fmtMetric(m.lineLengthM/1000,'km')} total length`:`${fmtMetric(m.lineLengthM,'m')} total length`);
  const warning=preview.truncated?`<p class="warning">The map shows the first ${Number(preview.renderedCount).toLocaleString()} of ${Number(m.features||s.output||0).toLocaleString()} preview features to keep the editor responsive. Applying the tool still processes the complete result.</p>`:'';
  const description=selection?'Selection matches are highlighted without changing the current selection.':dataMode?'Prospective result attributes are shown below without changing project data.':'Dashed geometry is temporary and is drawn over the original for comparison.';
  return `<section class="gis-processing-result gis-processing-preview"><header><div><strong>Temporary preview</strong><span>${description}</span></div><b>${Number(s.output||0).toLocaleString()} ${selection?'matches':'output'}</b></header><div class="gis-processing-result-grid"><div><span>Input</span><strong>${Number(s.input||0).toLocaleString()}</strong></div><div><span>${selection?'Matches':'Output'}</span><strong>${Number(s.output||0).toLocaleString()}</strong></div><div><span>Failed</span><strong>${Number(s.failed||0).toLocaleString()}</strong></div><div><span>Elapsed</span><strong>${Number(preview.elapsedMs||0).toLocaleString()} ms</strong></div><div><span>Processing CRS</span><strong>${esc(preview.processingCrs||'EPSG:4326')}</strong></div></div>${detail.length?`<p class="ok">${detail.map(esc).join(' · ')}</p>`:''}${previewDataHtml(preview)}${warning}<p class="ok">Nothing has been committed. Run can use this exact result while its fingerprint remains current.</p><div class="gis-button-row"><button type="button" data-processing-action="clear-preview">Clear preview</button></div></section>`;
}
"""
ui=sub_once(ui,r"function previewHtml\(\)\{[\s\S]*?\n?function resultHtml",new_preview_html+"function resultHtml",'ui rich preview panel')

# Stale state: once a user has explicitly previewed a live tool, parameter edits
# auto-refresh; manual/large jobs retain an explicit Refresh preview affordance.
ui=replace_once(
    ui,
    "function clearPreviewState({cancel=true,renderNow=false}={}){clearPreviewTimer();state.previewSerial++;if(cancel&&state.previewing)state.api?.cancelProcessingPreview?.();else state.api?.clearProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;if(renderNow)render();}",
    "function clearPreviewState({cancel=true,renderNow=false,preserveActivation=false}={}){clearPreviewTimer();state.previewSerial++;if(cancel&&state.previewing)state.api?.cancelProcessingPreview?.();else state.api?.clearProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;state.previewStale=false;if(!preserveActivation)state.previewActivated=false;if(renderNow)render();}",
    'ui preview state reset'
)
ui=sub_once(
    ui,
    r"function invalidateResult\(\)\{[^\n]*\}\n(?=function changeTool)",
    "function invalidateResult(){const activated=state.previewActivated||state.previewing||!!state.previewResult;state.result=null;state.progress=null;clearPreviewState({cancel:true,preserveActivation:activated});state.previewActivated=activated;state.previewStale=activated;if(state.host){for(const node of state.host.querySelectorAll('.gis-processing-preview,.gis-processing-result,.gis-processing-progress'))node.remove();}}\n",
    'ui stale invalidation'
)
ui=sub_once(
    ui,
    r"function changeTool\(id\)\{[^\n]*\}\n(?=function fieldPickerCount)",
    "function changeTool(id){if(busy())return;clearPreviewState({cancel:true});const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.previewActivated=false;state.previewStale=false;state.request=defaultRequest(sourceId,id,sourceScope);state.result=null;state.progress=null;render();}\n",
    'ui tool-change preview reset'
)

# Slider events update the exact numeric parameter and then use the same normal
# invalidation/live-preview path as typed values.
ui=replace_once(
    ui,
    "  if(target.dataset.processingFieldParam){",
    "  if(target.dataset.processingSlider!==undefined){\n    const paramId=target.dataset.processingSlider,definition=registry().getTool(state.toolId)?.parameters?.find(item=>item.id===paramId),value=sliderValue(target.value,definition?.slider||{});\n    state.request.parameters[paramId]=value;const number=state.host?.querySelector(`[data-processing-param=\"${paramId}\"]`);if(number)number.value=String(value);invalidateResult();refreshPreflight();scheduleAutoPreview();return;\n  }\n  if(target.dataset.processingFieldParam){",
    'ui slider event handling'
)
ui=replace_once(
    ui,
    "    state.request.parameters[target.dataset.processingParam]=value;\n    invalidateResult();refreshPreflight();scheduleAutoPreview();",
    "    state.request.parameters[target.dataset.processingParam]=value;\n    if(definition?.slider){const slider=state.host?.querySelector(`[data-processing-slider=\"${definition.id}\"]`);if(slider)slider.value=String(sliderPosition(value,definition.slider));}\n    invalidateResult();refreshPreflight();scheduleAutoPreview();",
    'ui typed-number slider sync'
)

# A completed preview activates live updates; merely opening the tool does not.
ui=replace_once(ui,"  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);","  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);\n  state.previewActivated=true;state.previewStale=false;",'ui preview activation')
ui=replace_once(ui,"    state.previewing=false;state.previewProgress=null;state.previewResult=result;","    state.previewing=false;state.previewProgress=null;state.previewResult=result;state.previewActivated=true;state.previewStale=false;",'ui preview completion state')

# Label the button according to semantic/stale state and refresh it even when a
# numeric input is being edited without a full panel rerender.
ui=replace_once(
    ui,
    "previewLabel=tool.resultKind==='selection'?'Preview matches':'Preview result';",
    "previewLabel=previewActionLabel(tool);",
    'ui semantic preview button label'
)
ui=sub_once(
    ui,
    r"function refreshPreflight\(\)\{[^\n]*\}\n(?=function clearPreviewState)",
    "function refreshPreflight(){if(!state.host)return;const pf=preflight(),target=state.host.querySelector('#gisProcessingPreflight');if(target)target.innerHTML=preflightHtml(pf);const run=state.host.querySelector('[data-processing-action=\"run\"]'),preview=state.host.querySelector('[data-processing-action=\"preview\"]');if(run)run.disabled=busy()||!pf.valid;if(preview){preview.disabled=busy()||!pf.valid;preview.textContent=state.previewing?'Previewing…':previewActionLabel(pf.tool);}}\n",
    'ui refresh preview action label'
)

# Cancel/clear must also end the live-preview session.
ui=sub_once(
    ui,
    r"function cancel\(\)\{[^\n]*\}\n(?=function click)",
    "function cancel(){clearPreviewTimer();if(state.previewing){state.previewSerial++;state.api?.cancelProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;state.previewActivated=false;state.previewStale=false;state.status?.('Processing preview cancelled. Project data was not changed.','error');render();return true;}if(state.running){state.api?.cancelProcessing?.();state.running=false;state.progress=null;state.status?.('Processing cancelled. No project data was changed.','error');render();return true;}return false;}\n",
    'ui cancel live preview state'
)

# Export rich helpers for deterministic unit coverage.
ui=replace_once(ui,"  comparisonMetrics:previewComparisonMetrics,\n","  comparisonMetrics:previewComparisonMetrics,\n  dataResult:previewDataResult,\n  sliderPosition,sliderValue,\n",'ui preview test helper exports')
write(rel,ui)

# ---------------------------------------------------------------------------
# Styling for sliders, stale/manual comparisons and data-result tables.
# ---------------------------------------------------------------------------
rel='docs/assets/gis-processing.css'
css=read(rel)
addition="""
/* v1.56.1 interactive Processing previews */
.gis-processing-number-slider{display:grid;gap:5px}.gis-processing-slider{padding:0!important;accent-color:#1664d6}.gis-processing-slider-labels{display:flex;justify-content:space-between;gap:4px;font-size:8px;font-weight:400;color:var(--muted)}.gis-processing-slider-labels span{white-space:nowrap}.gis-processing-live-preview{margin-top:10px;border:1px solid var(--line);background:var(--soft);padding:8px 10px;display:grid;gap:3px}.gis-processing-live-preview .gis-processing-check{display:flex;align-items:center;gap:7px}.gis-processing-live-preview small{font-size:9px;color:var(--muted)}.gis-processing-preview{border-left-color:#7c3aed}.gis-processing-data-preview{display:grid;gap:5px;margin-top:10px}.gis-processing-data-preview>div{max-height:230px;overflow:auto;border:1px solid var(--line)}.gis-processing-data-preview table{border-collapse:collapse;width:100%;font-size:10px}.gis-processing-data-preview th,.gis-processing-data-preview td{padding:6px 7px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.gis-processing-data-preview th{position:sticky;top:0;background:var(--soft);font-weight:700}.gis-processing-data-preview small{font-size:9px;color:var(--muted)}
@media(max-width:560px){.gis-processing-slider-labels span:nth-child(even){display:none}.gis-processing-data-preview>div{max-height:190px}}
"""
if '/* v1.56.1 interactive Processing previews */' not in css: css+=addition
write(rel,css)

# ---------------------------------------------------------------------------
# Cache key: preview changes span the UI, app commit bridge and worker-loaded
# engine contract, so every deployment assertion must move together.
# ---------------------------------------------------------------------------
cache_paths=[
    'docs/index.html','docs/assets/editpolygon-app.js','docs/assets/gis-processing.js','docs/assets/gis-processing-worker.js',
    'scripts/audit-runtime.mjs','tests/release-cache.test.mjs','tests/gis-crs-integration.test.mjs','tests/gis-remote-source-integration.test.mjs',
    'tests/typed-fields-integration.test.mjs','tests/render-performance.test.mjs','tests/processing-toolbox-integration.test.mjs'
]
for rel in cache_paths:
    text=read(rel)
    if OLD_KEY in text: write(rel,text.replace(OLD_KEY,NEW_KEY))

# Architecture/release notes now describe the complete preview contract.
rel='ARCHITECTURE.md'; architecture=read(rel)
anchor='- `docs/assets/gis-processing.js` owns the searchable desktop/mobile Toolbox UI, dynamic input/parameter forms, output choices, progress/cancel state and result presentation.'
if anchor in architecture and 'fingerprint-verified' not in architecture:
    architecture=architecture.replace(anchor,anchor+' It also owns non-destructive geometry, selection and data-result previews; Simplify/Densify can live-refresh after explicit preview activation, while expensive jobs use manual refresh. A fingerprint-verified prepared result may be handed back to the existing application commit bridge so the geometry that was previewed is exactly what is committed.',1)
write(rel,architecture)
rel='RELEASE_MANIFEST.md'; manifest=read(rel)
anchor='- `docs/assets/gis-processing.js` / `gis-processing.css` — responsive Toolbox UI.'
if anchor in manifest and 'non-destructive previews' not in manifest:
    manifest=manifest.replace(anchor,anchor+' Includes non-destructive previews, logarithmic Simplify/Densify controls, specialised metrics, data-result preview tables and fingerprint-safe preview reuse.',1)
write(rel,manifest)

# ---------------------------------------------------------------------------
# Regression coverage for semantic policies, sliders, stale/live activation,
# data preview presentation and rich maintenance metrics.
# ---------------------------------------------------------------------------
write('tests/processing-preview-interactive.test.mjs',r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
function registry(){const window={};const context=vm.createContext({window,globalThis:window,Object,Map,JSON,String,Array,Number,Math});vm.runInContext(registrySource,context);return window.EditPolygonGISProcessingRegistry;}

test('preview catalogue distinguishes geometry, selection and data result previews',()=>{
  const r=registry();
  assert.equal(r.getTool('buffer').previewPolicy.kind,'geometry');
  assert.equal(r.getTool('select-by-location').previewPolicy.kind,'selection');
  for(const id of ['nearest-feature','distance-to-nearest','count-points-in-polygon','join-by-location','spatial-summary'])assert.equal(r.getTool(id).previewPolicy.kind,'data');
});

test('Simplify and Densify declare live logarithmic metre sliders while Snap stays manual',()=>{
  const r=registry(),simplify=r.getTool('simplify'),densify=r.getTool('densify'),snap=r.getTool('snap');
  assert.equal(simplify.previewPolicy.mode,'live');assert.equal(densify.previewPolicy.mode,'live');assert.equal(snap.previewPolicy.mode,'manual');
  assert.equal(simplify.parameters.find(p=>p.id==='tolerance').slider.scale,'log');
  assert.equal(densify.parameters.find(p=>p.id==='maxSegmentLength').slider.scale,'log');
  assert.equal(simplify.parameters.find(p=>p.id==='tolerance').slider.max,100000);
});

test('Processing UI source contains explicit activation, stale refresh, data tables and rich maintenance metrics',()=>{
  const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
  for(const token of ['previewActivated','previewStale','Refresh preview','Preview data','data-processing-slider','previewDataResult','maxDisplacementM','featuresUnchanged','longestSegmentBeforeM','longestSegmentAfterM'])assert.ok(ui.includes(token),token);
  assert.match(ui,/!state\.previewActivated\|\|!state\.livePreview/);
});
""")

write('tests/browser-processing-preview-interactive-smoke.py',r'''from pathlib import Path
import os,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];JS=ROOT/'docs/assets/gis-processing.js'
def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():return configured
    for c in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        f=shutil.which(c)
        if f:return f
    return None
with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']};exe=chromium_path()
    if exe:options['executable_path']=exe
    browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1150,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content("""<!doctype html><html><body><div id=host></div><div id=status></div><script>
    const input={id:'source',label:'Input layer',families:['line'],scopes:['all']};
    const tools=[
      {id:'simplify',title:'Simplify',category:'maintenance',description:'Simplify',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'live',debounceMs:80,maxAutoFeatures:1000,metrics:[]},inputs:[input],parameters:[{id:'tolerance',label:'Tolerance (metres)',type:'number',default:1,required:true,min:0,nonZero:true,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}}]},
      {id:'snap',title:'Snap',category:'maintenance',description:'Snap',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'manual',debounceMs:300,maxAutoFeatures:1000,expensive:true,metrics:[]},inputs:[input,{id:'overlay',label:'Reference layer',families:['line'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance',type:'number',default:1,required:true,min:0,nonZero:true}]},
      {id:'distance-to-nearest',title:'Distance to nearest',category:'spatial',description:'Distance',resultKind:'layer',mutationPolicy:'new-layer',previewPolicy:{enabled:true,kind:'data',mode:'manual',debounceMs:300,maxAutoFeatures:1000,metrics:[]},inputs:[input,{id:'overlay',label:'Candidate layer',families:['line'],scopes:['all']}],parameters:[{id:'distanceField',label:'Distance field',type:'text',default:'nearest_distance_m'}]}
    ];
    window.EditPolygonGISProcessingRegistry={getTool:id=>tools.find(t=>t.id===id)||null,search:()=>tools,getCategories:()=>[{id:'maintenance',title:'Geometry maintenance'},{id:'spatial',title:'Spatial analysis'}],getCategory:id=>({title:id==='spatial'?'Spatial analysis':'Geometry maintenance'})};
    const layers=[{id:'source',name:'Source',features:[{id:'a',geometryType:'LineString',properties:{name:'A'},filtered:false}]},{id:'ref',name:'Reference',features:[{id:'r',geometryType:'LineString',properties:{name:'R'},filtered:false}]}];
    function normaliseRequest(v){const tool=EditPolygonGISProcessingRegistry.getTool(v.toolId||'simplify'),inputs={};for(const d of tool.inputs)inputs[d.id]={layerId:v.inputs?.[d.id]?.layerId||(d.id==='source'?'source':'ref'),scope:'all'};const parameters={};for(const d of tool.parameters||[])parameters[d.id]=v.parameters?.[d.id]??d.default??'';return{toolId:tool.id,inputs,parameters,output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}}}
    function preflight(v){const request=normaliseRequest(v),tool=EditPolygonGISProcessingRegistry.getTool(request.toolId),inputLayers={},features={},counts={};for(const d of tool.inputs){const layer=layers.find(l=>l.id===request.inputs[d.id].layerId);inputLayers[d.id]=layer;features[d.id]=layer.features;counts[d.id]=layer.features.length}return{valid:true,errors:[],warnings:[],request,tool,inputs:inputLayers,inputFeatures:features,counts:{source:counts.source||0,overlay:counts.overlay||0},source:inputLayers.source}}
    window.EditPolygonGISProcessingCore={family:()=> 'line',normaliseRequest,defaultOutputName:()=> 'Result',preflight,resolveProcessingCrs:()=> 'EPSG:32756',previewFingerprint:()=> 'fp'};
    window.__previewCalls=0;
    window.EditPolygonGIS={getEditableLayers:()=>layers,getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,clearProcessingPreview:()=>true,cancelProcessingPreview:()=>true,cancelProcessing:()=>true,
      runProcessingPreview:async(r,onProgress)=>{window.__previewCalls++;onProgress({stage:'Preview',done:1,total:1,percent:100});const data=r.toolId==='distance-to-nearest';return{kind:'preview',resultKind:'layer',previewKind:data?'data':'geometry',summary:{input:1,processed:1,output:1,failed:0},metrics:data?{features:1,vertices:2}:{features:1,inputVertices:5,outputVertices:3,verticesRemoved:2,reductionPct:40,maxDisplacementM:r.toolId==='snap'?42:undefined,featuresUnchanged:r.toolId==='snap'?0:undefined},dataPreview:data?{fields:['nearest_distance_m'],rows:[[123.4]],totalRows:1,totalFields:1,truncated:false}:null,renderedCount:data?0:1,truncated:false,processingCrs:'EPSG:32756',elapsedMs:3,temporary:true,fingerprint:'fp',preparedResult:{kind:'layer',features:[],summary:{input:1,output:1,failed:0}}}},
      commitPreparedProcessingResult:async()=>({reused:false}),runProcessingRequest:async()=>({kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]})};
    </script></body></html>""")
    page.add_script_tag(path=str(JS));page.evaluate("EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',toolId:'simplify',api:EditPolygonGIS,status:m=>document.getElementById('status').textContent=m})")
    assert page.locator('[data-processing-slider="tolerance"]').count()==1
    page.locator('[data-processing-param="tolerance"]').fill('2');page.locator('[data-processing-param="tolerance"]').dispatch_event('input');page.wait_for_timeout(140)
    assert page.evaluate('window.__previewCalls')==0,'live preview must require explicit activation'
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview');before=page.evaluate('window.__previewCalls')
    page.locator('[data-processing-slider="tolerance"]').fill('800');page.locator('[data-processing-slider="tolerance"]').dispatch_event('input');page.wait_for_timeout(160);page.wait_for_selector('.gis-processing-preview')
    assert page.evaluate('window.__previewCalls')>before
    assert float(page.locator('[data-processing-param="tolerance"]').input_value())>1
    assert 'vertices removed' in page.locator('.gis-processing-preview').inner_text().lower()

    page.locator('[data-processing-tool="snap"]').click();page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-param="tolerance"]').fill('5');page.locator('[data-processing-param="tolerance"]').dispatch_event('input');page.wait_for_timeout(40)
    assert page.locator('[data-processing-action="preview"]').inner_text()=='Refresh preview'

    page.locator('[data-processing-tool="distance-to-nearest"]').click();assert page.locator('[data-processing-action="preview"]').inner_text()=='Preview data'
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-data-preview')
    text=page.locator('.gis-processing-data-preview').inner_text();assert 'nearest_distance_m' in text and '123.4' in text
    assert not errors,errors
    browser.close()
print('Processing interactive preview browser smoke test passed.')
''')

# Package the new browser test into both the focused and full gates.
rel='package.json'; package=json.loads(read(rel)); extra='python tests/browser-processing-preview-interactive-smoke.py'
for key in ['test:browser-smoke','test:browser-processing-preview']:
    value=package['scripts'][key]
    if extra not in value: package['scripts'][key]=value+' && '+extra
write(rel,json.dumps(package,indent=2,ensure_ascii=False)+'\n')

# Final assertions for this enhancement layer.
registry=read('docs/assets/gis-processing-registry.js');ui=read('docs/assets/gis-processing.js')
for token in ["kind:'data'","slider:{scale:'log'","previewActivated","previewStale","Preview data","Refresh preview","previewDataResult","maxDisplacementM","featuresUnchanged","longestSegmentBeforeM"]:
    if token not in registry+ui: raise RuntimeError(f'interactive preview completion token missing: {token}')
print('Interactive Processing preview enhancement applied.')
