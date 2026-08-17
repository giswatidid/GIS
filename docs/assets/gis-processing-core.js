(function(global){
'use strict';

const VERSION='1.56.1';
const DEFAULT_SCOPES=Object.freeze(['all','filtered','selected']);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const registry=()=>global.EditPolygonGISProcessingRegistry;
const family=type=>/Point$/i.test(type||'')?'point':/LineString$/i.test(type||'')?'line':/Polygon$/i.test(type||'')?'polygon':'other';
const normaliseScope=(value,allowed=DEFAULT_SCOPES)=>allowed.includes(value)?value:(allowed[0]||'all');
function inputDefinitions(tool){return Array.isArray(tool?.inputs)&&tool.inputs.length?tool.inputs:[{id:'source',label:'Input layer',required:true,families:['point','line','polygon'],scopes:DEFAULT_SCOPES}];}
function normaliseParameter(definition,raw){
  if(raw==null||raw==='')raw=definition.default??'';
  if(definition.type==='number'||definition.type==='integer')return raw===''?'':Number(raw);
  if(definition.type==='boolean')return raw===true||raw==='true'||raw===1||raw==='1';
  if(definition.type==='fields')return Array.isArray(raw)?raw.map(String).filter(Boolean):String(raw||'').split(',').map(value=>value.trim()).filter(Boolean);
  return raw==null?'':raw;
}
function normaliseRequest(value={},defaults={}){
  const tool=registry()?.getTool(value.toolId||defaults.toolId||'buffer');
  const inputs={};
  for(const definition of inputDefinitions(tool)){
    const given=value.inputs?.[definition.id]||defaults.inputs?.[definition.id]||{};
    const allowed=definition.scopes||DEFAULT_SCOPES;
    inputs[definition.id]={layerId:String(given.layerId||''),scope:normaliseScope(given.scope||'all',allowed)};
  }
  const parameters={};for(const definition of tool?.parameters||[])parameters[definition.id]=normaliseParameter(definition,value.parameters?.[definition.id]);
  const policy=tool?.mutationPolicy||'new-layer';
  let mode=String(value.output?.mode||defaults.output?.mode||'new-layer');
  if(policy==='selection')mode='selection';else if(policy==='new-layer')mode='new-layer';else if(!['new-layer','modify-source'].includes(mode))mode='new-layer';
  return {version:2,toolId:tool?.id||String(value.toolId||''),inputs,parameters,output:{mode,name:String(value.output?.name||defaults.output?.name||'').trim()}};
}
function scopeFeatures(layer,scope='all',selectionIds=[]){
  const selected=new Set(selectionIds||[]);return (layer?.features||[]).filter(feature=>scope==='selected'?selected.has(feature.id):scope==='filtered'?!feature.filtered:true);
}
function scopeCount(layer,scope='all',selectionIds=[]){return scopeFeatures(layer,scope,selectionIds).length;}
function geometryFamilies(layer,scope='all',selectionIds=[]){return [...new Set(scopeFeatures(layer,scope,selectionIds).map(feature=>family(feature.geometryType||feature.geometry?.type)).filter(value=>value!=='other'))];}
function fieldsForLayer(layer){const found=new Set();for(const feature of layer?.features||[])for(const key of Object.keys(feature.properties||{}))found.add(key);return [...found].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
function defaultOutputName(tool,source){return `${source?.name||'Layer'} — ${tool?.title||'processing result'}`;}
function validateParameter(definition,value,{inputLayers={}}={}){
  if(definition.required&&(value==null||value===''||(Array.isArray(value)&&!value.length)))return `${definition.label} is required.`;
  if(value==null||value===''||(Array.isArray(value)&&!value.length))return '';
  if(definition.type==='number'||definition.type==='integer'){
    const number=Number(value);if(!Number.isFinite(number))return `${definition.label} must be a number.`;
    if(definition.type==='integer'&&!Number.isInteger(number))return `${definition.label} must be a whole number.`;
    if(definition.nonZero&&number===0)return `${definition.label} must not be zero.`;
    if(Number.isFinite(definition.min)&&number<definition.min)return `${definition.label} must be at least ${definition.min}.`;
    if(Number.isFinite(definition.max)&&number>definition.max)return `${definition.label} must be at most ${definition.max}.`;
  }
  if(definition.type==='select'&&definition.options?.length&&!definition.options.some(option=>option.value===value))return `${definition.label} has an unsupported value.`;
  if(definition.type==='field'||definition.type==='fields'){
    const layer=inputLayers[definition.input||'source'];if(layer){const fields=new Set(fieldsForLayer(layer)),values=definition.type==='fields'?(Array.isArray(value)?value:[]):[value];for(const field of values)if(field&&!fields.has(field))return `${definition.label} references a field that does not exist.`;}
  }
  return '';
}
function preflight(requestValue,{layers=[],selectionIds=[]}={}){
  const request=normaliseRequest(requestValue),tool=registry()?.getTool(request.toolId),errors=[],warnings=[],inputLayers={},inputFeatures={},inputFamilies={},counts={};
  if(!tool)errors.push('Choose a processing tool.');
  for(const definition of inputDefinitions(tool)){
    const config=request.inputs[definition.id],layer=layers.find(item=>item.id===config?.layerId)||null;inputLayers[definition.id]=layer;
    if(!layer){if(definition.required!==false)errors.push(`Choose ${String(definition.label||definition.id).toLowerCase()}.`);continue;}
    const scoped=scopeFeatures(layer,config.scope,selectionIds),allowed=definition.families||['point','line','polygon'],features=scoped.filter(feature=>allowed.includes(family(feature.geometryType||feature.geometry?.type))),excluded=scoped.filter(feature=>!allowed.includes(family(feature.geometryType||feature.geometry?.type))),families=[...new Set(features.map(feature=>family(feature.geometryType||feature.geometry?.type)).filter(value=>value!=='other'))];inputFeatures[definition.id]=features;inputFamilies[definition.id]=families;counts[definition.id]=features.length;
    if(!scoped.length)errors.push(config.scope==='selected'?`No features from ${layer.name||definition.label} are selected.`:config.scope==='filtered'?`The active filter on ${layer.name||definition.label} contains no features.`:`${layer.name||definition.label} contains no features.`);
    else if(!features.length){const wanted=allowed.join(' or ');errors.push(`${layer.name||definition.label} contains no ${wanted} geometry in the chosen scope for ${definition.label||definition.id}.`);}
    if(excluded.length){const excludedFamilies=[...new Set(excluded.map(feature=>family(feature.geometryType||feature.geometry?.type)))],scopeWord=config.scope==='selected'?'selected ':config.scope==='filtered'?'filtered ':'';warnings.push(`${definition.label||definition.id}: ${features.length.toLocaleString()} compatible ${scopeWord}feature${features.length===1?'':'s'} will be processed; ${excluded.length.toLocaleString()} ${excludedFamilies.join('/')} feature${excluded.length===1?'':'s'} will be ignored.`);}
    if(config.scope==='filtered'&&scoped.length<scopeCount(layer,'all',selectionIds))warnings.push(`Only ${scoped.length.toLocaleString()} filtered feature${scoped.length===1?'':'s'} from ${layer.name} are in scope.`);
    if(config.scope==='selected'&&scoped.length)warnings.push(`Only ${scoped.length.toLocaleString()} selected feature${scoped.length===1?'':'s'} from ${layer.name} are in scope.`);
  }
  const ids=Object.values(inputLayers).filter(Boolean).map(layer=>layer.id),sameLayerInputs=ids.length!==new Set(ids).size;
  if(sameLayerInputs&&tool?.id==='count-points-in-polygon')warnings.push('The same mixed layer is being used for polygons and points. Each input role uses only its compatible geometry.');
  else if(sameLayerInputs&&tool?.execution==='overlay')errors.push('Polygon overlay operations require two different layers. Choose a different layer for the second input.');
  if(sameLayerInputs&&['nearest-feature','distance-to-nearest'].includes(tool?.id))warnings.push('The same layer is being searched for nearest features. Each input feature is excluded from matching itself.');
  for(const definition of tool?.parameters||[]){const error=validateParameter(definition,request.parameters[definition.id],{inputLayers});if(error)errors.push(error);}
  const source=inputLayers.source||Object.values(inputLayers).find(Boolean)||null;
  if(!request.output.name&&tool?.resultKind==='layer'&&request.output.mode==='new-layer'&&source)request.output.name=defaultOutputName(tool,source);
  if(tool?.mutationPolicy==='new-or-modify'&&request.output.mode==='modify-source'&&source?.features?.some(feature=>feature.locked))warnings.push('Locked features in the processed scope will be replaced if the operation succeeds.');
  if(tool?.engine==='geos')warnings.push('This operation uses the browser-local GEOS topology engine. Metric operations are projected to a suitable local CRS before processing.');
  return {valid:errors.length===0,errors,warnings,request,tool,inputs:inputLayers,inputFeatures,inputFamilies,source,overlay:inputLayers.overlay||null,counts:{source:counts.source||0,overlay:counts.overlay||0,...counts}};
}
function resultSummary({sourceCount=0,outputCount=0,failures=[]}={}){return {input:sourceCount,processed:Math.max(0,sourceCount-(failures?.length||0)),output:outputCount,failed:failures?.length||0,partial:!!failures?.length};}
function failure(feature,index,error,stage='processing'){return {index,featureId:feature?.id??null,featureName:feature?.properties?.name||null,stage,message:error?.message||String(error)};}
function createProvenance(preflightValue,{processingCrs='EPSG:4326',engine='browser',worker=true,result=null}={}){
  const value=preflightValue||{},request=value.request||{},tool=value.tool||{},inputs={};
  for(const [id,layer] of Object.entries(value.inputs||{}))if(layer)inputs[id]={layerId:layer.id,layerName:layer.name,scope:request.inputs?.[id]?.scope||'all',count:value.counts?.[id]||0};
  return {version:2,tool:tool.id||request.toolId,toolTitle:tool.title||request.toolId,createdAt:new Date().toISOString(),inputs,parameters:clone(request.parameters||{}),output:clone(request.output||{}),processingCrs,crsPolicy:tool.crsPolicy||'canonical',engine,worker:!!worker,result:result?clone(result):null};
}
function bboxOfGeometry(geometry){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;const walk=value=>{if(!Array.isArray(value))return;if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))){const x=Number(value[0]),y=Number(value[1]);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);return;}for(const child of value)walk(child);};if(geometry?.type==='GeometryCollection')for(const child of geometry.geometries||[])walk(child.coordinates);else walk(geometry?.coordinates);return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;}
function combinedBounds(features=[]){let out=null;for(const feature of features){const b=bboxOfGeometry(feature?.geometry);if(!b)continue;out=out?[Math.min(out[0],b[0]),Math.min(out[1],b[1]),Math.max(out[2],b[2]),Math.max(out[3],b[3])]:b.slice();}return out;}
function resolveProcessingCrs(tool,allFeatures,crsApi){if(tool?.crsPolicy!=='projected-metric')return 'EPSG:4326';const b=combinedBounds(allFeatures);if(!b||!crsApi?.utmForLonLat)return'EPSG:3857';const lon=(b[0]+b[2])/2,lat=(b[1]+b[3])/2;if((b[2]-b[0])>18||(b[3]-b[1])>16)return'EPSG:3857';return crsApi.utmForLonLat(lon,lat,'WGS84');}

global.EditPolygonGISProcessingCore=Object.freeze({version:VERSION,SCOPES:DEFAULT_SCOPES,clone,family,inputDefinitions,normaliseScope,normaliseRequest,scopeFeatures,scopeCount,geometryFamilies,fieldsForLayer,defaultOutputName,validateParameter,preflight,resultSummary,failure,createProvenance,bboxOfGeometry,combinedBounds,resolveProcessingCrs});
})(typeof window!=='undefined'?window:globalThis);
