(function(global){
'use strict';

const VERSION='1.56.1';
const PREVIEW_RENDER_LIMIT=5000;
const registry=()=>global.EditPolygonGISProcessingRegistry;
const core=()=>global.EditPolygonGISProcessingCore;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const assetKey=(()=>{
  try{
    const src=global.document?.currentScript?.src||'';
    if(src)return new URL(src,global.location?.href||'http://localhost/').searchParams.get('v')||'20260820-v1561-processing-preview-v6';
  }catch(_){}
  return '20260820-v1561-processing-preview-v6';
})();

const state={
  host:null,api:null,status:null,onOpenOutput:null,
  sourceLayerId:'',sourceScope:'',toolId:'buffer',query:'',
  request:null,preflight:null,running:false,progress:null,result:null,
  previewing:false,previewProgress:null,previewResult:null,previewSerial:0,
  previewTimer:null,livePreview:true,previewActivated:false,previewStale:false
};

const previewRuntime={
  worker:null,job:null,jobSeq:0,token:0,overlay:null,last:null
};

function layers(){return (state.api?.getEditableLayers?.()||[]).filter(layer=>!layer.tableOnly);}
function selectionIds(api=state.api){const ids=api?.getSelection?.().ids;return Array.isArray(ids)?ids:[];}
function layerById(id){return layers().find(layer=>layer.id===id)||null;}
function fields(layer){const found=new Set();for(const feature of layer?.features||[])for(const key of Object.keys(feature.properties||{}))found.add(key);return [...found].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
function scopedForLabel(layer,scope){const selected=new Set(selectionIds()),features=layer?.features||[];return scope==='selected'?features.filter(feature=>selected.has(feature.id)):scope==='filtered'?features.filter(feature=>!feature.filtered):features;}
function scopeLabel(layer,scope,definition=null){const scoped=scopedForLabel(layer,scope),allowed=definition?.families||['point','line','polygon'],compatible=scoped.filter(feature=>allowed.includes(core().family(feature.geometryType||feature.geometry?.type))),label=scope==='all'?'All features':scope==='filtered'?'Filtered features':'Selected features';return compatible.length===scoped.length?`${label} (${compatible.length.toLocaleString()})`:`${label} (${compatible.length.toLocaleString()} compatible of ${scoped.length.toLocaleString()})`;}
function compatibleLayers(definition){return layers().filter(layer=>{const allowed=definition.families||['point','line','polygon'],features=layer.features||[];return !features.length||features.some(feature=>allowed.includes(core().family(feature.geometryType||feature.geometry?.type)));});}
function inputLayerOptions(tool,definition,sourceLayerId=''){const available=compatibleLayers(definition);return tool?.execution==='overlay'&&definition.id!=='source'?available.filter(layer=>layer.id!==sourceLayerId):available;}
function defaultRequest(sourceLayerId=state.sourceLayerId,toolId=state.toolId,sourceScope=state.sourceScope){const tool=registry()?.getTool(toolId),available=layers(),inputs={};for(const definition of tool?.inputs||[]){let layer=null;if(definition.id==='source')layer=available.find(item=>item.id===sourceLayerId)||compatibleLayers(definition)[0]||available[0];else{const options=inputLayerOptions(tool,definition,inputs.source?.layerId);layer=options[0]||null;}const allowed=definition.scopes||['all','filtered','selected'],scope=definition.id==='source'&&allowed.includes(sourceScope)?sourceScope:'all';inputs[definition.id]={layerId:layer?.id||'',scope};}const source=layerById(inputs.source?.layerId);return core().normaliseRequest({toolId,inputs,parameters:{},output:{mode:'new-layer',name:core().defaultOutputName(tool,source)}});}
function ensureRequest(){const available=layers();if(!state.sourceLayerId||!available.some(layer=>layer.id===state.sourceLayerId))state.sourceLayerId=available[0]?.id||'';if(!state.request)state.request=defaultRequest();state.request.toolId=state.toolId;}
function preflight(){ensureRequest();try{state.preflight=state.api?.previewProcessingRequest?.(clone(state.request))||core().preflight(state.request,{layers:layers(),selectionIds:selectionIds()});}catch(error){state.preflight={valid:false,errors:[error.message],warnings:[],request:clone(state.request),tool:registry()?.getTool(state.toolId),counts:{source:0,overlay:0}};}if(state.preflight?.request)state.request=clone(state.preflight.request);return state.preflight;}
function busy(){return state.running||state.previewing;}


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
function currentPreviewPolicy(){
  return registry()?.getTool(state.toolId)?.previewPolicy||{enabled:true,mode:'manual',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['features','vertices']};
}
function clearPreviewTimer(){
  if(state.previewTimer){global.clearTimeout?.(state.previewTimer);state.previewTimer=null;}
}
function scheduleAutoPreview(){
  clearPreviewTimer();
  const policy=currentPreviewPolicy();
  if(!state.previewActivated||!state.livePreview||policy.mode!=='live'||busy())return;
  const pf=preflight(),count=Number(pf?.counts?.source||0),limit=Number(policy.maxAutoFeatures||2500);
  if(!pf?.valid||count>limit)return;
  state.previewTimer=global.setTimeout?.(()=>{
    state.previewTimer=null;
    runPreview({automatic:true});
  },Math.max(100,Number(policy.debounceMs)||250));
}

/* Read-only Processing preview bridge.
   The authoritative application bridge remains the only code that commits
   processing results. Preview clones canonical project features, executes the
   same worker/engine, and renders only into an isolated map overlay. */
function projectFiles(){
  const payload=global.compactProjectState?.();
  if(!Array.isArray(payload?.files))throw new Error('A read-only project snapshot is unavailable for Processing preview.');
  return payload.files;
}
function projectFile(id){return projectFiles().find(file=>file.id===id)||null;}
function displayGeometry(feature){return feature?.geometry||feature?.renderedGeometry||feature?.sourceGeometry||null;}
function scopedProjectFeatures(file,scope='all',selectedIds=[]){
  const selected=new Set(selectedIds||[]);
  return (file?.features||[]).filter(feature=>scope==='selected'?selected.has(feature.id):scope==='filtered'?!feature._gisFiltered:true);
}
function taskFeature(feature){
  const geometry=displayGeometry(feature);
  if(!geometry)return null;
  return {
    type:'Feature',
    id:feature.id,
    properties:{...(clone(feature.properties||{})),name:feature.name},
    geometry:clone(geometry)
  };
}
function buildPreviewTask(pf,api=global.EditPolygonGIS){
  if(!pf?.valid)throw new Error(pf?.errors?.[0]||'The processing request is invalid.');
  const selected=selectionIds(api),inputs={},inputSchemas={},inputLayerIds={},allFeatures=[];
  for(const definition of pf.tool?.inputs||[]){
    const layer=pf.inputs?.[definition.id],file=layer?projectFile(layer.id):null;
    if(!file)throw new Error(`${definition.label||definition.id} not found.`);
    const compatibleIds=new Set((pf.inputFeatures?.[definition.id]||[]).map(feature=>feature.id));
    const scoped=scopedProjectFeatures(file,pf.request.inputs?.[definition.id]?.scope||'all',selected);
    const features=scoped.filter(feature=>compatibleIds.has(feature.id)).map(taskFeature).filter(Boolean);
    inputs[definition.id]=features;
    inputSchemas[definition.id]=clone(file.gisSchema||layer.schema||null);
    inputLayerIds[definition.id]=file.id;
    allFeatures.push(...features);
  }
  return {
    toolId:pf.tool.id,
    inputs,inputSchemas,inputLayerIds,
    parameters:clone(pf.request.parameters||{}),
    output:clone(pf.request.output||{}),
    currentSelectionIds:selected,
    processingCrs:core().resolveProcessingCrs(pf.tool,allFeatures,global.EditPolygonCRS)
  };
}
function previewCancelError(message='Processing preview cancelled. Project data was not changed.'){
  const error=new Error(message);error.processingPreviewCancelled=true;return error;
}
function terminatePreviewWorker(message='Processing preview cancelled. Project data was not changed.'){
  const worker=previewRuntime.worker,job=previewRuntime.job;
  previewRuntime.worker=null;previewRuntime.job=null;
  try{worker?.terminate?.();}catch(_){}
  if(job){try{job.reject(previewCancelError(message));}catch(_){}}
}
function previewWorker(task,onProgress=()=>{},token){
  if(typeof global.Worker==='undefined'){
    const engine=global.EditPolygonGISProcessingEngine;
    if(!engine)throw new Error('The processing engine is unavailable.');
    return Promise.resolve(engine.execute(task,{turf:global.turf,crs:global.EditPolygonCRS,onProgress})).then(result=>({result,worker:false,token}));
  }
  terminatePreviewWorker();
  const worker=new global.Worker(`assets/gis-processing-worker.js?v=${assetKey}`);
  previewRuntime.worker=worker;
  const id=++previewRuntime.jobSeq;
  return new Promise((resolve,reject)=>{
    previewRuntime.job={id,reject,token};
    worker.onmessage=event=>{
      const message=event.data||{};
      if(message.id!==id)return;
      if(message.type==='progress'){
        try{onProgress({stage:message.stage||'Previewing',done:message.done||0,total:message.total||0,percent:Math.max(0,Math.min(96,Math.round((Number(message.percent)||0)*.96)))});}catch(_){}
        return;
      }
      try{worker.terminate();}catch(_){}
      if(previewRuntime.worker===worker)previewRuntime.worker=null;
      if(previewRuntime.job?.id===id)previewRuntime.job=null;
      if(message.type==='error'){reject(new Error(message.message||'Processing preview failed.'));return;}
      resolve({result:message.result||{kind:'layer',features:[],failures:[]},worker:true,token});
    };
    worker.onerror=event=>{
      try{worker.terminate();}catch(_){}
      if(previewRuntime.worker===worker)previewRuntime.worker=null;
      if(previewRuntime.job?.id===id)previewRuntime.job=null;
      reject(new Error(event.message||'The processing preview worker failed.'));
    };
    worker.postMessage({id,task});
  });
}
function ensurePreviewOverlay(){
  const map=global.EditPolygonMap;
  if(!map?.createVectorOverlayLayer)return null;
  if(!previewRuntime.overlay)previewRuntime.overlay=map.createVectorOverlayLayer({zIndex:1580});
  return previewRuntime.overlay;
}
function clearPreviewOverlay(){
  try{if(previewRuntime.overlay)global.EditPolygonMap?.clearVectorOverlayLayer?.(previewRuntime.overlay);}catch(_){}
}
function previewStyle(kind='layer',geometryType=''){
  if(kind==='selection')return {color:'#d97706',weight:4,opacity:1,dashArray:'5,4',fillColor:'#d97706',fillOpacity:.12,radius:8};
  if(/Point$/.test(geometryType))return {color:'#7c3aed',weight:3,opacity:1,dashArray:'4,3',fillColor:'#7c3aed',fillOpacity:.05,radius:8};
  if(/LineString$/.test(geometryType))return {color:'#7c3aed',weight:4,opacity:.98,dashArray:'8,5',fillOpacity:0,radius:7};
  return {color:'#7c3aed',weight:3,opacity:.98,dashArray:'8,5',fillColor:'#7c3aed',fillOpacity:.08,radius:7};
}
function geometryVertexCount(geometry){
  if(!geometry)return 0;
  if(geometry.type==='Point')return 1;
  if(geometry.type==='MultiPoint'||geometry.type==='LineString')return geometry.coordinates?.length||0;
  if(geometry.type==='MultiLineString')return (geometry.coordinates||[]).reduce((sum,line)=>sum+(line?.length||0),0);
  if(geometry.type==='Polygon')return (geometry.coordinates||[]).reduce((sum,ring)=>sum+Math.max(0,(ring?.length||0)-1),0);
  if(geometry.type==='MultiPolygon')return (geometry.coordinates||[]).reduce((sum,poly)=>sum+(poly||[]).reduce((inner,ring)=>inner+Math.max(0,(ring?.length||0)-1),0),0);
  if(geometry.type==='GeometryCollection')return (geometry.geometries||[]).reduce((sum,item)=>sum+geometryVertexCount(item),0);
  return 0;
}
function previewMetrics(features=[]){
  let vertices=0,polygonAreaM2=0,lineLengthM=0,polygonCount=0,lineCount=0,pointCount=0;
  const turf=global.turf;
  for(const item of features||[]){
    const geometry=item?.geometry;if(!geometry)continue;
    vertices+=geometryVertexCount(geometry);
    const type=geometry.type||'';
    try{
      if(/Polygon$/.test(type)){polygonCount++;if(turf?.area)polygonAreaM2+=Number(turf.area({type:'Feature',properties:{},geometry}))||0;}
      else if(/LineString$/.test(type)){lineCount++;if(turf?.length)lineLengthM+=(Number(turf.length({type:'Feature',properties:{},geometry},{units:'kilometers'}))||0)*1000;}
      else if(/Point$/.test(type))pointCount++;
    }catch(_){}
  }
  let bounds=null;
  try{if(features.length&&turf?.bbox)bounds=turf.bbox({type:'FeatureCollection',features:features.map(item=>({type:'Feature',properties:{},geometry:item.geometry}))});}catch(_){}
  return {features:features.length,vertices,polygonCount,lineCount,pointCount,polygonAreaM2,lineLengthM,bounds};
}

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
function coordinateDistanceM(a,b){
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
function previewFeaturesFromResult(task,result){
  if(result?.kind==='selection'){
    const wanted=new Set(result.selectionIds||[]);
    return (task.inputs?.source||[]).filter(feature=>wanted.has(feature.id));
  }
  return Array.isArray(result?.features)?result.features.filter(feature=>feature?.geometry):[];
}
function renderPreviewOverlay(task,result){
  clearPreviewOverlay();
  const features=previewFeaturesFromResult(task,result),kind=result?.kind==='selection'?'selection':'layer',overlay=ensurePreviewOverlay();
  const rendered=features.slice(0,PREVIEW_RENDER_LIMIT);
  if(overlay&&rendered.length){
    global.EditPolygonMap?.setVectorOverlayFeatures?.(overlay,rendered.map((feature,index)=>({
      id:`processing-preview-${index}`,
      geometry:clone(feature.geometry),
      style:previewStyle(kind,feature.geometry?.type)
    })));
  }
  return {features,renderedCount:rendered.length,truncated:features.length>rendered.length};
}
async function isolatedPreview(api,request={},onProgress=()=>{}){
  if(!api?.previewProcessingRequest)throw new Error('The Processing preview bridge is unavailable.');
  const pf=api.previewProcessingRequest(clone(request));
  if(!pf?.valid)throw new Error(pf?.errors?.[0]||'The processing request is invalid.');
  terminatePreviewWorker();
  clearPreviewOverlay();
  const token=++previewRuntime.token,task=buildPreviewTask(pf,api),fingerprint=typeof api.getProcessingPreviewFingerprint==='function'?api.getProcessingPreviewFingerprint(clone(request)):core().previewFingerprint(task),started=(global.performance?.now?.()??Date.now());
  onProgress({stage:'Preparing preview',done:0,total:task.inputs.source?.length||0,percent:0});
  const execution=await previewWorker(task,onProgress,token);
  if(token!==previewRuntime.token)throw previewCancelError('A newer Processing preview replaced this result.');
  onProgress({stage:'Rendering preview',done:pf.counts?.source||0,total:pf.counts?.source||0,percent:98});
  const kind=previewKind(pf.tool),previewFeatures=previewFeaturesFromResult(task,execution.result),rendered=kind==='data'?{features:previewFeatures,renderedCount:0,truncated:false}:renderPreviewOverlay(task,execution.result);
  if(token!==previewRuntime.token){clearPreviewOverlay();throw previewCancelError('A newer Processing preview replaced this result.');}
  const elapsedMs=Math.max(0,Math.round((global.performance?.now?.()??Date.now())-started));
  const metrics=previewComparisonMetrics(task,execution.result,rendered.features);
  const summary=clone(execution.result?.summary||{input:pf.counts?.source||0,processed:pf.counts?.source||0,output:rendered.features.length,failed:execution.result?.failures?.length||0,partial:!!execution.result?.failures?.length});
  const preview={
    kind:'preview',
    resultKind:execution.result?.kind||pf.tool.resultKind||'layer',
    toolId:pf.tool.id,
    previewKind:kind,
    dataPreview:kind==='data'?previewDataResult(task,rendered.features):null,
    fingerprint,
    preparedResult:{...clone(execution.result),_previewWorker:execution.worker},
    summary,
    failures:clone(execution.result?.failures||[]),
    selectionIds:execution.result?.kind==='selection'?clone(execution.result.selectionIds||[]):undefined,
    metrics,
    renderedCount:rendered.renderedCount,
    truncated:rendered.truncated,
    renderLimit:PREVIEW_RENDER_LIMIT,
    processingCrs:execution.result?.processingCrs||task.processingCrs||'EPSG:4326',
    mapCrs:'EPSG:4326',
    engine:execution.result?.engine||pf.tool.engine||'browser',
    worker:execution.worker,
    elapsedMs,
    temporary:true
  };
  previewRuntime.last=clone({...preview,preparedResult:undefined});
  onProgress({stage:'Preview ready',done:summary.input||0,total:summary.input||0,percent:100});
  return preview;
}
function clearProcessingPreview(){
  ++previewRuntime.token;
  terminatePreviewWorker();
  clearPreviewOverlay();
  previewRuntime.last=null;
  return true;
}
function cancelProcessingPreview(){
  ++previewRuntime.token;
  terminatePreviewWorker();
  clearPreviewOverlay();
  previewRuntime.last=null;
  return true;
}
function installPreviewBridge(api){
  if(!api||typeof api!=='object')return api;
  if(typeof api.runProcessingPreview!=='function')api.runProcessingPreview=(request,onProgress)=>isolatedPreview(api,request,onProgress);
  if(typeof api.cancelProcessingPreview!=='function')api.cancelProcessingPreview=cancelProcessingPreview;
  if(typeof api.clearProcessingPreview!=='function')api.clearProcessingPreview=clearProcessingPreview;
  if(typeof api.getProcessingPreviewState!=='function')api.getProcessingPreviewState=()=>clone(previewRuntime.last);
  return api;
}
installPreviewBridge(global.EditPolygonGIS);

/* Toolbox UI. */
function toolButtons(){const tools=registry()?.search(state.query)||[],categories=registry()?.getCategories()||[];if(!tools.length)return '<p class="gis-processing-empty">No processing tools match this search.</p>';return categories.map(category=>{const items=tools.filter(tool=>tool.category===category.id);if(!items.length)return'';return `<section class="gis-processing-tool-group"><h4>${esc(category.title)}</h4>${items.map(tool=>`<button type="button" class="gis-processing-tool ${tool.id===state.toolId?'active':''}" data-processing-tool="${esc(tool.id)}" ${busy()?'disabled':''}><strong>${esc(tool.title)}</strong><span>${esc(tool.description)}</span></button>`).join('')}</section>`;}).join('');}
function scopeOptions(layer,current,allowed=['all','filtered','selected'],definition=null){return allowed.map(scope=>`<option value="${scope}" ${scope===current?'selected':''}>${esc(scopeLabel(layer,scope,definition))}</option>`).join('');}
function inputControls(tool){return (tool.inputs||[]).map(definition=>{const chosen=layerById(state.request.inputs?.[definition.id]?.layerId),sourceId=state.request.inputs?.source?.layerId||'',available=inputLayerOptions(tool,definition,sourceId),scope=state.request.inputs?.[definition.id]?.scope||'all';return `<label>${esc(definition.label||definition.id)}<select data-processing-input="${esc(definition.id)}"><option value="">Choose layer</option>${available.map(layer=>`<option value="${esc(layer.id)}" ${layer.id===chosen?.id?'selected':''}>${esc(layer.name)}</option>`).join('')}</select></label><label>${esc(definition.label||definition.id)} scope<select data-processing-scope="${esc(definition.id)}">${scopeOptions(chosen,scope,definition.scopes||['all','filtered','selected'],definition)}</select>${definition.id==='source'?'<small>Layer visibility does not change processing membership.</small>':''}</label>`;}).join('');}
function parameterControl(definition,value){
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
function outputControls(tool){if(tool.resultKind==='selection')return '<div class="gis-processing-output-note"><strong>Result</strong><span>This tool changes the current selection and does not create a layer.</span></div>';const canModify=tool.mutationPolicy==='new-or-modify',mode=state.request.output.mode||'new-layer';return `${canModify?`<label>Output behaviour<select id="gisProcessingOutputMode"><option value="new-layer" ${mode==='new-layer'?'selected':''}>Create new layer</option><option value="modify-source" ${mode==='modify-source'?'selected':''}>Modify input layer</option></select><small>Modifying the input is one undoable project operation.</small></label>`:''}${mode==='new-layer'?`<label class="gis-processing-output-name">Output layer name<input id="gisProcessingOutputName" value="${esc(state.request.output.name||'')}"></label>`:'<div class="gis-processing-output-note"><strong>Output</strong><span>The processed features replace the input layer only after the complete result validates.</span></div>'}`;}
function preflightHtml(pf){const parts=[];for(const definition of pf?.tool?.inputs||[]){const count=Number(pf?.counts?.[definition.id]||0);parts.push(`${count.toLocaleString()} ${esc(definition.id)} feature${count===1?'':'s'}`);}return `<section class="gis-processing-preflight ${pf?.valid?'valid':'invalid'}"><header><strong>${pf?.valid?'Ready to run':'Needs attention'}</strong><span>${parts.join(' · ')}</span></header>${(pf?.errors||[]).map(message=>`<p class="error">${esc(message)}</p>`).join('')}${(pf?.warnings||[]).map(message=>`<p class="warning">${esc(message)}</p>`).join('')}${pf?.valid&&!pf?.warnings?.length?'<p class="ok">Inputs and parameters are valid. Project changes are committed only after a complete result returns.</p>':''}</section>`;}
function activeProgress(){return state.running?state.progress:state.previewing?state.previewProgress:null;}
function progressHtml(){const update=activeProgress();if(!update)return'';const prefix=state.previewing?'Preview':'Processing';return `<section class="gis-processing-progress" aria-live="polite"><div><i style="width:${Math.max(0,Math.min(100,Number(update.percent)||0))}%"></i></div><strong>${esc(update.stage||`${prefix}…`)}</strong><span>${update.total?`${Number(update.done||0).toLocaleString()} of ${Number(update.total).toLocaleString()}`:state.previewing?'Computing a temporary result locally':'Working locally in this browser'}</span></section>`;}
function fmtMetric(value,unit=''){const number=Number(value)||0;if(!number)return `0${unit?` ${unit}`:''}`;const abs=Math.abs(number);const digits=abs>=1000?0:abs>=100?1:abs>=10?2:3;return `${number.toLocaleString(undefined,{maximumFractionDigits:digits})}${unit?` ${unit}`:''}`;}
function previewDataHtml(preview){
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
function resultHtml(){const result=state.result;if(!result)return'';const summary=result.summary||{},failed=Number(summary.failed||0),selection=result.kind==='selection'||result.output?.kind==='selection',modified=result.output?.modified===true;const title=selection?'Selection updated':modified?'Input layer updated':failed?'Processing completed with warnings':'Processing completed',name=selection?`${Number(summary.output||0).toLocaleString()} selected`:result.output?.name||'Output layer';return `<section class="gis-processing-result ${failed?'partial':'success'}"><header><div><strong>${title}</strong><span>${esc(name)}</span></div><b>${Number(summary.output||0).toLocaleString()} ${selection?'selected':'output'}</b></header><div class="gis-processing-result-grid"><div><span>Input</span><strong>${Number(summary.input||0).toLocaleString()}</strong></div><div><span>Processed</span><strong>${Number(summary.processed||0).toLocaleString()}</strong></div><div><span>${selection?'Selected':'Output'}</span><strong>${Number(summary.output||0).toLocaleString()}</strong></div><div><span>Failed</span><strong>${failed.toLocaleString()}</strong></div><div><span>Elapsed</span><strong>${Number(result.elapsedMs||0).toLocaleString()} ms</strong></div></div>${failed?`<details><summary>Show ${failed} failure${failed===1?'':'s'}</summary><div class="gis-processing-failures">${(result.failures||[]).slice(0,50).map(item=>`<p><strong>${esc(item.featureName||item.featureId||`Feature ${Number(item.index)+1}`)}</strong><span>${esc(item.message)}</span></p>`).join('')}</div></details>`:''}<div class="gis-button-row">${!selection&&result.output?.id?'<button type="button" data-processing-action="open-output">Open layer</button><button type="button" data-processing-action="zoom-output">Zoom to result</button>':''}<button type="button" data-processing-action="run-again">Run again</button></div></section>`;}
function supportsPreview(){return currentPreviewPolicy().enabled!==false&&typeof state.api?.runProcessingPreview==='function';}

function livePreviewControls(pf,tool){
  const policy=tool?.previewPolicy||currentPreviewPolicy();
  if(policy.mode!=='live')return '';
  const count=Number(pf?.counts?.source||0),limit=Number(policy.maxAutoFeatures||2500),paused=count>limit;
  return `<div class="gis-processing-live-preview"><label class="gis-processing-check"><input type="checkbox" data-processing-live-preview="1" ${state.livePreview?'checked':''}><span>Live preview</span></label><small>${paused?`Live preview is paused above ${limit.toLocaleString()} input features; use ${tool.resultKind==='selection'?'Preview matches':'Preview result'} manually.`:`Changes preview automatically after ${Number(policy.debounceMs||250).toLocaleString()} ms.`}</small></div>`;
}

function parameterView(pf){const tool=pf.tool||registry()?.getTool(state.toolId);if(!tool)return '<section class="gis-processing-config"><p>Choose a processing tool.</p></section>';const params=(tool.parameters||[]).filter(item=>!item.advanced).map(def=>parameterControl(def,state.request.parameters[def.id])).join(''),advanced=(tool.parameters||[]).filter(item=>item.advanced).map(def=>parameterControl(def,state.request.parameters[def.id])).join(''),runLabel=tool.resultKind==='selection'?'Run selection':state.request.output.mode==='modify-source'?'Run and modify layer':'Run and create layer',previewLabel=previewActionLabel(tool);return `<section class="gis-processing-config"><div class="gis-processing-heading"><div><span>${esc(registry()?.getCategory(tool.category)?.title||'Processing')}</span><h2>${esc(tool.title)}</h2><p>${esc(tool.description)}</p></div><strong>${esc(tool.outputGeometry||tool.resultKind||'Result')}</strong></div><fieldset class="gis-processing-parameter-lock" ${busy()?'disabled':''}><div class="gis-processing-form">${inputControls(tool)}${params}${outputControls(tool)}</div>${advanced?`<details class="gis-processing-advanced"><summary>Advanced parameters</summary><div class="gis-processing-form">${advanced}</div></details>`:''}</fieldset>${livePreviewControls(pf,tool)}<div id="gisProcessingPreflight">${preflightHtml(pf)}</div>${progressHtml()}${previewHtml()}${resultHtml()}<div class="gis-processing-actions">${supportsPreview()?`<button type="button" data-processing-action="preview" ${busy()||!pf.valid?'disabled':''}>${state.previewing?'Previewing…':previewLabel}</button>`:''}<button type="button" class="primary" data-processing-action="run" ${busy()||!pf.valid?'disabled':''}>${state.running?'Processing…':runLabel}</button><button type="button" data-processing-action="cancel" ${busy()?'':'disabled'}>Cancel</button></div></section>`;}
function render(){if(!state.host)return;ensureRequest();const pf=(state.result||state.previewResult)&&state.preflight?state.preflight:preflight();state.host.innerHTML=`<div class="gis-processing-layout"><aside class="gis-processing-browser"><label>Find a tool<input id="gisProcessingSearch" type="search" placeholder="Search buffer, dissolve, spatial join…" value="${esc(state.query)}"></label><div class="gis-processing-tools">${toolButtons()}</div></aside>${parameterView(pf)}</div>`;}
function refreshPreflight(){if(!state.host)return;const pf=preflight(),target=state.host.querySelector('#gisProcessingPreflight');if(target)target.innerHTML=preflightHtml(pf);const run=state.host.querySelector('[data-processing-action="run"]'),preview=state.host.querySelector('[data-processing-action="preview"]');if(run)run.disabled=busy()||!pf.valid;if(preview){preview.disabled=busy()||!pf.valid;preview.textContent=state.previewing?'Previewing…':previewActionLabel(pf.tool);}}
function clearPreviewState({cancel=true,renderNow=false,preserveActivation=false}={}){clearPreviewTimer();state.previewSerial++;if(cancel&&state.previewing)state.api?.cancelProcessingPreview?.();else state.api?.clearProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;state.previewStale=false;if(!preserveActivation)state.previewActivated=false;if(renderNow)render();}
function invalidateResult(){const activated=state.previewActivated||state.previewing||!!state.previewResult;state.result=null;state.progress=null;clearPreviewState({cancel:true,preserveActivation:activated});state.previewActivated=activated;state.previewStale=activated;if(state.host){for(const node of state.host.querySelectorAll('.gis-processing-preview,.gis-processing-result,.gis-processing-progress'))node.remove();}}
function changeTool(id){if(busy())return;clearPreviewState({cancel:true});const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.previewActivated=false;state.previewStale=false;state.request=defaultRequest(sourceId,id,sourceScope);state.result=null;state.progress=null;render();}
function fieldPickerCount(picker){const boxes=[...picker.querySelectorAll('[data-processing-field-param]')],selected=boxes.filter(box=>box.checked),counter=picker.querySelector('[data-processing-field-count]');if(counter)counter.textContent=`${selected.length.toLocaleString()} of ${boxes.length.toLocaleString()} selected`;return selected.map(box=>box.value);}
function fieldPickerAction(button){if(busy()||!state.request)return;const picker=button.closest('[data-processing-fields]');if(!picker)return;const paramId=picker.dataset.processingFields,selectAll=button.dataset.processingFieldsAction==='all',boxes=[...picker.querySelectorAll(`[data-processing-field-param="${paramId}"]`)];for(const box of boxes)box.checked=selectAll;state.request.parameters[paramId]=fieldPickerCount(picker);invalidateResult();refreshPreflight();scheduleAutoPreview();}
function readControl(target){
  if(busy()||!state.request)return;
  if(target.dataset.processingLivePreview!==undefined){
    state.livePreview=!!target.checked;
    if(state.livePreview)scheduleAutoPreview();else clearPreviewTimer();
    return;
  }
  if(target.dataset.processingSlider!==undefined){
    const paramId=target.dataset.processingSlider,definition=registry().getTool(state.toolId)?.parameters?.find(item=>item.id===paramId),value=sliderValue(target.value,definition?.slider||{});
    state.request.parameters[paramId]=value;const number=state.host?.querySelector(`[data-processing-param="${paramId}"]`);if(number)number.value=String(value);invalidateResult();refreshPreflight();scheduleAutoPreview();return;
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
    if(definition?.slider){const slider=state.host?.querySelector(`[data-processing-slider="${definition.id}"]`);if(slider)slider.value=String(sliderPosition(value,definition.slider));}
    invalidateResult();refreshPreflight();scheduleAutoPreview();
  }
}
function updateProgressDom(update,prefix='Processing'){const node=state.host?.querySelector('.gis-processing-progress');if(!node)return;node.querySelector('i')?.style.setProperty('width',`${Math.max(0,Math.min(100,Number(update.percent)||0))}%`);const strong=node.querySelector('strong');if(strong)strong.textContent=update.stage||`${prefix}…`;const span=node.querySelector('span');if(span&&update.total)span.textContent=`${Number(update.done||0).toLocaleString()} of ${Number(update.total).toLocaleString()}`;}
async function runPreview({automatic=false}={}){
  clearPreviewTimer();
  if(busy()||!supportsPreview())return;
  const pf=preflight();
  if(!pf.valid){render();return;}
  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);
  state.previewActivated=true;state.previewStale=false;
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
    state.previewing=false;state.previewProgress=null;state.previewResult=result;state.previewActivated=true;state.previewStale=false;
    state.status?.(`${automatic?'Live p':'P'}review ready: ${Number(result.summary?.output||0).toLocaleString()} ${result.resultKind==='selection'?'match':'output feature'}${Number(result.summary?.output||0)===1?'':'s'}. Nothing was changed.`,'ok');
    render();
  }catch(error){
    if(serial!==state.previewSerial||error?.processingPreviewCancelled)return;
    state.previewing=false;state.previewProgress=null;state.previewResult=null;state.status?.(error.message,'error');render();
  }
}
async function run(){
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
function cancel(){clearPreviewTimer();if(state.previewing){state.previewSerial++;state.api?.cancelProcessingPreview?.();state.previewing=false;state.previewProgress=null;state.previewResult=null;state.previewActivated=false;state.previewStale=false;state.status?.('Processing preview cancelled. Project data was not changed.','error');render();return true;}if(state.running){state.api?.cancelProcessing?.();state.running=false;state.progress=null;state.status?.('Processing cancelled. No project data was changed.','error');render();return true;}return false;}
function click(event){const fieldsAction=event.target.closest('[data-processing-fields-action]');if(fieldsAction){fieldPickerAction(fieldsAction);return;}const tool=event.target.closest('[data-processing-tool]');if(tool){changeTool(tool.dataset.processingTool);return;}const action=event.target.closest('[data-processing-action]')?.dataset.processingAction;if(action==='preview')runPreview();else if(action==='clear-preview')clearPreviewState({cancel:false,renderNow:true});else if(action==='run')run();else if(action==='cancel')cancel();else if(action==='open-output'&&state.result?.output)state.onOpenOutput?.(state.result.output);else if(action==='zoom-output'&&state.result?.output)state.api?.zoomLayer?.(state.result.output.id);else if(action==='run-again'){state.result=null;state.progress=null;render();}}
function input(event){const target=event.target;if(target.id==='gisProcessingSearch'){state.query=target.value;const list=state.host.querySelector('.gis-processing-tools');if(list)list.innerHTML=toolButtons();return;}if(target.tagName!=='SELECT'||target.multiple||target.type==='checkbox'||target.id==='gisProcessingOutputName')readControl(target);}
function change(event){readControl(event.target);}
function bind(host){if(host._editPolygonProcessingBound)return;host._editPolygonProcessingBound=true;host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);}
function mount(host,{layerId='',toolId='',sourceScope='',api=null,status=null,onOpenOutput=null}={}){state.host=host;state.api=installPreviewBridge(api||global.EditPolygonGIS);state.status=status;state.onOpenOutput=onOpenOutput;const requested=toolId&&registry()?.getTool(toolId)?toolId:'',requestedScope=['all','filtered','selected'].includes(sourceScope)?sourceScope:'';if(!state.request||state.sourceLayerId!==layerId||requested||requestedScope){clearPreviewState({cancel:true});state.sourceLayerId=layerId;state.sourceScope=requestedScope;state.toolId=requested||'buffer';state.query='';state.request=null;state.preflight=null;state.result=null;state.progress=null;}bind(host);render();state.sourceScope='';return true;}
function isRunning(){return busy();}
function cancelIfRunning(){return cancel();}
function reset(){if(busy())cancel();clearPreviewState({cancel:true});state.request=null;state.preflight=null;state.result=null;state.progress=null;}

function externalStateChanged(){
  if(!state.previewTimer&&!state.previewing&&!state.previewResult)return;
  clearPreviewState({cancel:true});
  if(state.host?.isConnected)render();
}
global.addEventListener?.('editpolygon:gis-changed',externalStateChanged);
global.addEventListener?.('editpolygon:gis-selection-changed',externalStateChanged);

global.__editPolygonGISProcessingPreview=Object.freeze({
  version:VERSION,
  buildTask:(pf,api=global.EditPolygonGIS)=>buildPreviewTask(pf,api),
  metrics:previewMetrics,
  comparisonMetrics:previewComparisonMetrics,
  dataResult:previewDataResult,
  sliderPosition,sliderValue,
  clear:clearProcessingPreview,
  cancel:cancelProcessingPreview,
  renderLimit:PREVIEW_RENDER_LIMIT
});
global.EditPolygonGISProcessingUI=Object.freeze({version:VERSION,mount,isRunning,cancelIfRunning,reset});
})(typeof window!=='undefined'?window:globalThis);
