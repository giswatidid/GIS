(function(global){
'use strict';

const VERSION='1.56.0.1';
const SCOPES=Object.freeze(['all','filtered','selected']);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const registry=()=>global.EditPolygonGISProcessingRegistry;
const fc=features=>({type:'FeatureCollection',features:(features||[]).filter(Boolean)});
function family(type=''){if(/Point$/i.test(type))return'point';if(/LineString$/i.test(type))return'line';if(/Polygon$/i.test(type))return'polygon';return'other';}
function normaliseScope(value){return SCOPES.includes(value)?value:'all';}
function normaliseRequest(value={},defaults={}){
  const tool=registry()?.getTool(value.toolId||defaults.toolId||'buffer');
  const sourceLayerId=value.inputs?.source?.layerId||defaults.sourceLayerId||'';
  const sourceScope=normaliseScope(value.inputs?.source?.scope||defaults.sourceScope||'all');
  const overlayLayerId=value.inputs?.overlay?.layerId||defaults.overlayLayerId||'';
  const overlayScope=normaliseScope(value.inputs?.overlay?.scope||defaults.overlayScope||'all');
  const parameters={};
  for(const definition of tool?.parameters||[]){let raw=value.parameters?.[definition.id];if(raw==null||raw==='')raw=definition.default;if(definition.type==='number'||definition.type==='integer')raw=Number(raw);parameters[definition.id]=raw;}
  const name=String(value.output?.name||defaults.outputName||'').trim();
  return {version:1,toolId:tool?.id||String(value.toolId||''),inputs:{source:{layerId:sourceLayerId,scope:sourceScope},overlay:{layerId:overlayLayerId,scope:overlayScope}},parameters,output:{mode:'new-layer',name}};
}
function scopeFeatures(layer,scope='all',selectionIds=[]){
  const selected=new Set(selectionIds||[]),normal=normaliseScope(scope);
  return (layer?.features||[]).filter(feature=>normal==='selected'?selected.has(feature.id):normal==='filtered'?!feature.filtered:true);
}
function scopeCount(layer,scope='all',selectionIds=[]){return scopeFeatures(layer,scope,selectionIds).length;}
function geometryFamilies(layer,scope='all',selectionIds=[]){return [...new Set(scopeFeatures(layer,scope,selectionIds).map(feature=>family(feature.geometryType||feature.geometry?.type)).filter(item=>item!=='other'))];}
function defaultOutputName(tool,source){return `${source?.name||'Layer'} — ${tool?.title||'processing result'}`;}
function validateParameter(definition,value){
  if(definition.required&&(value==null||value===''))return `${definition.label} is required.`;
  if(definition.type==='number'||definition.type==='integer'){
    const number=Number(value);if(!Number.isFinite(number))return `${definition.label} must be a number.`;
    if(definition.type==='integer'&&!Number.isInteger(number))return `${definition.label} must be a whole number.`;
    if(definition.nonZero&&number===0)return `${definition.label} must not be zero.`;
    if(Number.isFinite(definition.min)&&number<definition.min)return `${definition.label} must be at least ${definition.min}.`;
    if(Number.isFinite(definition.max)&&number>definition.max)return `${definition.label} must be at most ${definition.max}.`;
  }
  if(definition.type==='select'&&definition.options?.length&&!definition.options.some(option=>option.value===value))return `${definition.label} has an unsupported value.`;
  return '';
}
function preflight(requestValue,{layers=[],selectionIds=[]}={}){
  const request=normaliseRequest(requestValue),tool=registry()?.getTool(request.toolId),errors=[],warnings=[];
  if(!tool)errors.push('Choose a processing tool.');
  const source=layers.find(layer=>layer.id===request.inputs.source.layerId)||null;
  if(!source)errors.push('Choose an input layer.');
  const sourceFeatures=source?scopeFeatures(source,request.inputs.source.scope,selectionIds):[];
  const sourceFamilies=source?geometryFamilies(source,request.inputs.source.scope,selectionIds):[];
  if(source&&!sourceFeatures.length)errors.push(request.inputs.source.scope==='selected'?'No features from this layer are selected.':request.inputs.source.scope==='filtered'?'The active filter contains no features.':'The input layer contains no features.');
  if(tool&&sourceFeatures.length){const unsupported=sourceFamilies.filter(item=>!tool.sourceFamilies.includes(item));if(unsupported.length)errors.push(`${tool.title} does not support ${unsupported.join(', ')} input geometry.`);}
  let overlay=null,overlayFeatures=[],overlayFamilies=[];
  if(tool?.overlayFamilies?.length){
    overlay=layers.find(layer=>layer.id===request.inputs.overlay.layerId)||null;
    if(!overlay)errors.push('Choose an overlay layer.');
    else if(source&&overlay.id===source.id)warnings.push('The source and overlay are the same layer. This is allowed, but verify that this is intended.');
    if(overlay){overlayFeatures=scopeFeatures(overlay,request.inputs.overlay.scope,selectionIds);overlayFamilies=geometryFamilies(overlay,request.inputs.overlay.scope,selectionIds);if(!overlayFeatures.length)errors.push(request.inputs.overlay.scope==='selected'?'No overlay features are selected.':request.inputs.overlay.scope==='filtered'?'The overlay filter contains no features.':'The overlay layer contains no features.');const unsupported=overlayFamilies.filter(item=>!tool.overlayFamilies.includes(item));if(unsupported.length)errors.push(`${tool.title} requires polygon overlay geometry.`);}
  }
  for(const definition of tool?.parameters||[]){const error=validateParameter(definition,request.parameters[definition.id]);if(error)errors.push(error);}
  if(request.inputs.source.scope==='filtered'&&source&&scopeCount(source,'filtered',selectionIds)<scopeCount(source,'all',selectionIds))warnings.push(`Only the ${sourceFeatures.length.toLocaleString()} feature${sourceFeatures.length===1?'':'s'} passing the current filter will be processed.`);
  if(request.inputs.source.scope==='selected'&&sourceFeatures.length)warnings.push(`Only ${sourceFeatures.length.toLocaleString()} selected feature${sourceFeatures.length===1?'':'s'} from the input layer will be processed.`);
  if(tool?.crsPolicy==='canonical'&&sourceFamilies.includes('polygon')&&sourceFeatures.length>5000)warnings.push('This is a large topology job. v1.56.0.1 uses the browser geometry engine in canonical WGS 84 coordinates; robust GEOS-backed projected overlay arrives in v1.56.1.');
  if(tool?.id==='intersection')warnings.push('v1.56.0.1 Intersection retains source attributes only. Overlay attribute combination is planned for v1.56.1.');
  if(tool?.id==='dissolve')warnings.push('v1.56.0.1 Dissolve combines all scoped polygons into one geometry. Dissolve by attribute is planned for v1.56.1.');
  if(!request.output.name&&tool&&source)request.output.name=defaultOutputName(tool,source);
  return {valid:errors.length===0,errors,warnings,request,tool,source,overlay,counts:{source:sourceFeatures.length,overlay:overlayFeatures.length},geometryFamilies:{source:sourceFamilies,overlay:overlayFamilies}};
}
function createProvenance(preflightValue,{processingCrs='EPSG:4326',engine='Turf.js 7.2.0',worker=true,result=null}={}){
  const value=preflightValue||{},request=value.request||{},source=value.source||{},overlay=value.overlay||null,tool=value.tool||{};
  return {version:1,tool:tool.id||request.toolId,toolTitle:tool.title||request.toolId,toolVersion:1,createdAt:new Date().toISOString(),sourceLayers:[source.id,...(overlay?.id?[overlay.id]:[])],sourceLayerId:source.id||request.inputs?.source?.layerId||null,sourceLayerName:source.name||null,sourceScope:request.inputs?.source?.scope||'all',overlayLayerId:overlay?.id||null,overlayLayerName:overlay?.name||null,overlayScope:overlay?request.inputs?.overlay?.scope||'all':null,parameters:clone(request.parameters||{}),processingCrs,crsPolicy:tool.crsPolicy||'canonical',engine,worker:!!worker,inputCounts:clone(value.counts||{}),result:result?clone(result):null};
}
function resultSummary({sourceCount=0,outputCount=0,failures=[]}={}){return {input:sourceCount,processed:Math.max(0,sourceCount-(failures?.length||0)),output:outputCount,failed:failures?.length||0,partial:!!failures?.length};}
function failure(feature,index,error,stage='processing'){return {index,featureId:feature?.id??null,featureName:feature?.properties?.name||null,stage,message:error?.message||String(error)};}
function sourceTagged(feature,source){if(feature&&source?.id!=null)feature.id=source.id;return feature;}
function unionPolygons(turf,features,onProgress=()=>{},options={}){
  const polygons=(features||[]).filter(feature=>['Polygon','MultiPolygon'].includes(feature?.geometry?.type));
  if(!polygons.length)return {feature:null,failures:[]};
  let current=clone(polygons[0]),failures=[];
  for(let index=1;index<polygons.length;index++){
    try{const next=turf.union(fc([current,polygons[index]]));if(!next)throw Error('The polygon union returned no geometry.');current=next;}
    catch(error){const item=failure(polygons[index],index,error,'union');if(options.strict)throw Error(`Could not combine overlay polygon ${index+1}: ${item.message}`);failures.push(item);}
    if(index%5===0||index===polygons.length-1)onProgress({stage:options.stage||'Combining polygons',done:index+1,total:polygons.length});
  }
  return {feature:current,failures};
}
function polygonBoundary(turf,mask){const geometry=mask?.geometry,lines=[];if(!geometry)return null;if(geometry.type==='Polygon')lines.push(...(geometry.coordinates||[]));else if(geometry.type==='MultiPolygon')for(const polygon of geometry.coordinates||[])lines.push(...polygon);if(!lines.length)return null;return lines.length===1?turf.lineString(lines[0]):turf.multiLineString(lines);}
function clipFeature(turf,feature,mask,boundary){
  const type=feature?.geometry?.type,properties=clone(feature?.properties||{});if(!type)return [];
  if(type==='Polygon'||type==='MultiPolygon'){const result=turf.intersect(fc([feature,mask]));if(result){result.properties=properties;return [sourceTagged(result,feature)];}return [];}
  if(type==='Point')return turf.booleanPointInPolygon(feature,mask)?[sourceTagged({...clone(feature),properties},feature)]:[];
  if(type==='MultiPoint'){const coordinates=(feature.geometry.coordinates||[]).filter(coord=>turf.booleanPointInPolygon(turf.point(coord),mask));return coordinates.length?[sourceTagged({type:'Feature',properties,geometry:{type:'MultiPoint',coordinates}},feature)]:[];}
  if(type==='LineString'||type==='MultiLineString'){
    const inputs=type==='LineString'?[feature]:(feature.geometry.coordinates||[]).map(coordinates=>turf.lineString(coordinates,properties)),inside=[];
    for(const line of inputs){let parts=[];if(boundary)parts=turf.lineSplit(line,boundary).features||[];if(!parts.length)parts=[line];for(const part of parts){const length=turf.length(part,{units:'kilometers'}),probe=length>0?turf.along(part,length/2,{units:'kilometers'}):turf.pointOnFeature(part);if(turf.booleanPointInPolygon(probe,mask))inside.push(part.geometry.coordinates);}}
    return inside.length?[sourceTagged({type:'Feature',properties,geometry:inside.length===1?{type:'LineString',coordinates:inside[0]}:{type:'MultiLineString',coordinates:inside}},feature)]:[];
  }
  return [];
}

function executeWithTurf(task,{turf,onProgress=()=>{}}={}){
  if(!turf)throw Error('The processing geometry engine is unavailable.');
  const operation=task?.toolId||task?.operation,source=task?.features||[],overlay=task?.overlayFeatures||[],params=task?.parameters||task?.params||{},failures=[],out=[];
  const progress=(stage,done,total)=>onProgress({stage,done,total,percent:total?Math.round(done*100/total):0});
  if(operation==='buffer'||operation==='centroid'||operation==='point-on-feature'){
    if(operation==='buffer'){const distance=Number(params.distance);if(!Number.isFinite(distance)||distance===0)throw Error('Enter a non-zero buffer distance.');}
    source.forEach((feature,index)=>{try{let result;if(operation==='buffer')result=turf.buffer(feature,Number(params.distance),{units:params.units||'kilometers',steps:Math.max(8,Math.min(64,Number(params.steps)||16))});else if(operation==='centroid')result=turf.centroid(feature);else result=turf.pointOnFeature(feature);if(!result?.geometry)throw Error(`${operation==='buffer'?'Buffer':operation==='centroid'?'Centroid':'Point on surface'} returned no geometry.`);result.properties=clone(feature.properties||{});out.push(sourceTagged(result,feature));}catch(error){failures.push(failure(feature,index,error));}if(index%10===0||index===source.length-1)progress(operation==='buffer'?'Creating buffers':operation==='centroid'?'Creating centroids':'Creating points on surface',index+1,source.length);});
  }else if(operation==='convex-hull'){
    const points=[];source.forEach((feature,index)=>{try{turf.coordEach(feature,coordinate=>points.push(turf.point(coordinate)));}catch(error){const item=failure(feature,index,error,'collecting coordinates');throw Error(`Could not read ${item.featureName||item.featureId||`feature ${index+1}`}: ${item.message}`);}if(index%25===0||index===source.length-1)progress('Collecting coordinates',index+1,source.length);});const hull=turf.convex(fc(points));if(!hull?.geometry)throw Error('Convex hull could not be created from the scoped input.');hull.properties={processing_source_count:source.length};out.push(hull);
  }else if(operation==='bbox'){
    progress('Calculating bounds',0,source.length);const box=turf.bboxPolygon(turf.bbox(fc(source)));if(!box?.geometry)throw Error('Bounding rectangle could not be created from the scoped input.');box.properties={processing_source_count:source.length};out.push(box);progress('Calculating bounds',source.length,source.length);
  }else if(operation==='dissolve'){
    const combined=unionPolygons(turf,source,update=>onProgress(update),{stage:'Dissolving polygons',strict:true});if(!combined.feature?.geometry)throw Error('Dissolve could not create an output geometry.');combined.feature.properties={processing_source_count:source.length};out.push(combined.feature);
  }else if(operation==='clip'||operation==='intersection'){
    progress('Preparing overlay',0,overlay.length);const combined=unionPolygons(turf,overlay,()=>{},{strict:true,stage:'Preparing overlay'});const mask=combined.feature;if(!mask?.geometry)throw Error('The overlay layer did not contain usable polygons.');const boundary=polygonBoundary(turf,mask);progress('Preparing overlay',overlay.length,overlay.length);
    source.forEach((feature,index)=>{try{out.push(...clipFeature(turf,feature,mask,boundary));}catch(error){failures.push(failure(feature,index,error));}if(index%10===0||index===source.length-1)progress(operation==='clip'?'Clipping features':'Intersecting features',index+1,source.length);});
  }else throw Error(`Unsupported processing tool: ${operation}`);
  return {features:out,failures,summary:resultSummary({sourceCount:source.length,outputCount:out.length,failures})};
}


const api={version:VERSION,SCOPES,clone,family,normaliseScope,normaliseRequest,scopeFeatures,scopeCount,geometryFamilies,defaultOutputName,preflight,createProvenance,resultSummary,executeWithTurf};
global.EditPolygonGISProcessingCore=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
