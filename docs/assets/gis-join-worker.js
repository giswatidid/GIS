'use strict';

const GEOS_ESM_URL='https://cdn.jsdelivr.net/npm/geos-wasm@3.1.1/build/package/geos.esm.js';
let modulesReady=false,geosPromise=null;
function ensureModules(needsTurf=false,needsGeos=false){
  if(!self.EditPolygonGISJoinCore)importScripts('gis-join-core.js');
  if(!self.EditPolygonGISSpatialCore)importScripts('gis-spatial-core.js');
  if(needsTurf&&!self.turf)importScripts('https://unpkg.com/@turf/turf@7.2.0/turf.min.js');
  if(needsGeos&&!self.EditPolygonGeosAdapter)importScripts('gis-geos-adapter.js');
  if(needsGeos&&!self.EditPolygonGISProcessingEngine)importScripts('gis-processing-engine.js');
  if(!self.EditPolygonGISJoinCore||!self.EditPolygonGISSpatialCore)throw new Error('Join/spatial engine could not be loaded.');
  if(needsTurf&&!self.turf)throw new Error('Geometry engine could not be loaded.');
  if(needsGeos&&(!self.EditPolygonGeosAdapter||!self.EditPolygonGISProcessingEngine))throw new Error('Shared GEOS processing engine could not be loaded.');
  modulesReady=true;
}
function ensureGeos(){if(!geosPromise)geosPromise=import(GEOS_ESM_URL).then(mod=>{if(typeof mod?.default!=='function')throw new Error('GEOS-WASM did not expose its browser initializer.');return mod.default();}).then(geos=>{self.EditPolygonGeosAdapter.assertGeos(geos);return geos;}).catch(error=>{geosPromise=null;throw error;});return geosPromise;}
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const feature=value=>({type:'Feature',id:value.id,properties:clone(value.properties||{}),geometry:clone(value.geometry||null)});
const collection=features=>({type:'FeatureCollection',features:(features||[]).filter(Boolean)});
const propertiesOf=record=>record?.properties||{};
function geometryUsable(record){
  const geometry=record?.geometry;if(!geometry||!geometry.type)return false;
  try{return typeof self.turf?.booleanValid==='function'?self.turf.booleanValid(feature(record)):!!self.EditPolygonGISSpatialCore.bboxOfGeometry(geometry);}catch(_){return false;}
}
function geometryTypes(records){return [...new Set((records||[]).map(record=>record?.geometry?.type).filter(Boolean))];}

async function dissolveFeatures(records){
  ensureModules(false,true);
  const polygons=(records||[]).map(feature).filter(item=>['Polygon','MultiPolygon'].includes(item.geometry?.type));
  if(!polygons.length)return clone((records||[]).find(record=>record.geometry)?.geometry||null);
  const geos=await ensureGeos();
  return clone(self.EditPolygonGISProcessingEngine.dissolveGeometry(polygons.map(item=>item.geometry),geos));
}

function runAttribute(task,progress){
  ensureModules(false);progress('Indexing source keys',10,0,task.sourceRecords?.length||0);
  const result=self.EditPolygonGISJoinCore.executeAttributeJoin(task.targetRecords||[],task.sourceRecords||[],task.config||{});
  progress('Creating joined records',90,result.rows.length,result.rows.length);
  return {kind:'attribute',...result};
}

async function runSummary(task,progress){
  const needsDissolve=task.config?.geometryMode==='dissolve';ensureModules(false,needsDissolve);
  let geos=null;
  if(needsDissolve){
    geos=await ensureGeos();
    const spatial=(task.records||[]).filter(record=>record.geometry);
    const nonPolygon=spatial.filter(record=>!['Polygon','MultiPolygon'].includes(record.geometry?.type));
    const invalid=spatial.filter(record=>{try{return !self.EditPolygonGeosAdapter.validity(geos,record.geometry).valid;}catch(_){return true;}});
    if(!spatial.length)throw new Error('Dissolved summaries require polygon geometry. Choose a non-spatial table output instead.');
    if(nonPolygon.length)throw new Error('Dissolved summaries can only use polygon or multipolygon records.');
    if(invalid.length)throw new Error(`${invalid.length} polygon record${invalid.length===1?' is':'s are'} invalid. Repair the geometry before dissolving a summary.`);
  }
  progress('Grouping records',12,0,task.records?.length||0);
  const result=self.EditPolygonGISJoinCore.executeGroupSummary(task.records||[],task.config||{});
  if(needsDissolve){
    for(let index=0;index<result.rows.length;index++){
      const row=result.rows[index];
      row.geometry=await dissolveFeatures(row.sourceRecords||[]);
      delete row.sourceRecords;
      progress('Dissolving group geometry',15+Math.round((index+1)/Math.max(1,result.rows.length)*75),index+1,result.rows.length);
    }
  }else for(const row of result.rows)delete row.sourceRecords;
  progress('Creating summary',95,result.rows.length,result.rows.length);
  return {kind:'summary',...result};
}

function bboxFor(record){return self.EditPolygonGISSpatialCore.bboxOfGeometry(record?.geometry);}
function exactRelation(target,source,predicate){return self.EditPolygonGISSpatialCore.relation(self.turf,target,source,predicate);}
function aggregateMatches(matches,aggregations,sourceSchema){
  const core=self.EditPolygonGISJoinCore,properties={};
  for(const item of aggregations||[]){
    const output=item._resolvedOutput||item.output,sourceType=item.field==='__records__'?'integer':core.fieldType(sourceSchema,item.field),values=item.field==='__records__'?matches.map(()=>1):matches.map(match=>propertiesOf(match.record)[item.field]);properties[output]=core.aggregate(values,item.operation,sourceType);
  }
  return properties;
}
function runSpatial(task,progress){
  ensureModules(true);
  const core=self.EditPolygonGISJoinCore,analysis=self.EditPolygonGISSpatialCore,allTargets=task.targetRecords||[],allSources=task.sourceRecords||[],config=clone(task.config||{}),predicate=config.predicate||'intersects';
  if(!allTargets.length)throw new Error('No target records are available in this scope.');if(!allSources.length)throw new Error('No source records are available in this scope.');
  const invalidTargets=allTargets.filter(record=>!geometryUsable(record)),invalidSources=allSources.filter(record=>!geometryUsable(record));
  const targets=allTargets.filter(record=>geometryUsable(record)),sources=allSources.filter(record=>geometryUsable(record));
  if(!targets.length)throw new Error('No target records have usable geometry.');if(!sources.length)throw new Error('No source records have usable geometry.');
  const targetTypes=geometryTypes(targets),sourceTypes=geometryTypes(sources),warnings=[];
  if(predicate==='point-in-polygon'){
    if(!targetTypes.some(type=>type==='Point'))throw new Error('Point-in-polygon requires point target features.');
    if(!sourceTypes.some(type=>type==='Polygon'||type==='MultiPolygon'))throw new Error('Point-in-polygon requires polygon source features.');
    if(targetTypes.some(type=>type!=='Point'))warnings.push('Non-point target records will be skipped for this point-in-polygon operation.');
    if(sourceTypes.some(type=>!['Polygon','MultiPolygon'].includes(type)))warnings.push('Non-polygon source records will be skipped for this point-in-polygon operation.');
  }
  if(predicate==='nearest'&&(targetTypes.some(type=>type!=='Point')||sourceTypes.some(type=>type!=='Point')))warnings.push('Nearest distances for lines and polygons use representative points, not boundary-to-boundary distance.');
  if(config.matchMode==='first'&&predicate!=='nearest')warnings.push('When several source features match, the first source record in the indexed order will be used.');
  if(invalidTargets.length)warnings.push(`${invalidTargets.length} target record${invalidTargets.length===1?' was':'s were'} skipped because geometry was missing or invalid.`);
  if(invalidSources.length)warnings.push(`${invalidSources.length} source record${invalidSources.length===1?' was':'s were'} skipped because geometry was missing or invalid.`);
  const eligibleSources=predicate==='point-in-polygon'?sources.filter(record=>['Polygon','MultiPolygon'].includes(record.geometry?.type)):sources;
  const eligibleTargets=predicate==='point-in-polygon'?targets.filter(record=>record.geometry?.type==='Point'):targets;
  if(!eligibleTargets.length||!eligibleSources.length)throw new Error('No geometry remains after applying the selected spatial relationship.');
  const sourceEntries=eligibleSources.map(record=>({id:record.id,geometry:record.geometry,bbox:bboxFor(record)})).filter(entry=>entry.bbox);
  const index=analysis.buildSpatialIndex(sourceEntries),sourceById=new Map(eligibleSources.map(record=>[record.id,record]));
  const fieldMap=core.normaliseFieldMap(config.targetSchema,config.sourceSchema,config.fieldMap,config.prefix||'source_');
  const aggregations=(config.aggregations||[]).map(item=>({...item}));
  const schemaOptions={prefix:config.prefix||'source_',includeDistance:predicate==='nearest'&&config.includeDistance!==false,distanceField:config.distanceField||'join_distance_km'};
  const schema=core.spatialOutputSchema(config.targetSchema,config.sourceSchema,fieldMap,aggregations,schemaOptions);
  const rows=[];let matchedTargets=0,unmatchedTargets=0,multipleTargets=0,totalMatches=0,skippedTargets=0;
  eligibleTargets.forEach((target,targetIndex)=>{
    if(!target.geometry){skippedTargets++;return;}
    let matches=[];
    if(predicate==='nearest'){
      const nearest=analysis.nearestFeature(self.turf,target,eligibleSources,{index});
      if(nearest)matches=[{record:nearest.feature,distance:nearest.distance/1000}];
      if(matches.length&&Number(config.maxDistanceKm)>0&&matches[0].distance>Number(config.maxDistanceKm))matches=[];
    }else{
      const bbox=bboxFor(target),ids=bbox?analysis.querySpatialIndex(index,bbox):[],candidates=ids.map(id=>sourceById.get(id)).filter(Boolean);
      for(const source of candidates)if(exactRelation(target,source,predicate))matches.push({record:source,distance:null});
    }
    if(matches.length){matchedTargets++;totalMatches+=matches.length;if(matches.length>1)multipleTargets++;}else unmatchedTargets++;
    const base=clone(propertiesOf(target));
    if(config.matchMode==='expand'){
      if(matches.length)for(const match of matches){const properties={...base};for(const item of fieldMap)properties[item.output]=clone(propertiesOf(match.record)[item.source]??null);if(schemaOptions._resolvedDistanceField)properties[schemaOptions._resolvedDistanceField]=match.distance;rows.push({targetId:target.id,sourceId:match.record.id,geometry:clone(target.geometry),properties});}
      else if(config.keepUnmatched!==false){const properties={...base};for(const item of fieldMap)properties[item.output]=null;if(schemaOptions._resolvedDistanceField)properties[schemaOptions._resolvedDistanceField]=null;rows.push({targetId:target.id,sourceId:null,geometry:clone(target.geometry),properties});}
    }else if(config.matchMode==='summarize'){
      const properties={...base};const first=matches[0]?.record||null;for(const item of fieldMap)properties[item.output]=first?clone(propertiesOf(first)[item.source]??null):null;Object.assign(properties,aggregateMatches(matches,aggregations,config.sourceSchema));if(schemaOptions._resolvedDistanceField)properties[schemaOptions._resolvedDistanceField]=matches[0]?.distance??null;if(matches.length||config.keepUnmatched!==false)rows.push({targetId:target.id,sourceId:first?.id||null,geometry:clone(target.geometry),properties});
    }else{
      const match=matches[0],properties={...base};for(const item of fieldMap)properties[item.output]=match?clone(propertiesOf(match.record)[item.source]??null):null;if(schemaOptions._resolvedDistanceField)properties[schemaOptions._resolvedDistanceField]=match?.distance??null;if(match||config.keepUnmatched!==false)rows.push({targetId:target.id,sourceId:match?.record?.id||null,geometry:clone(target.geometry),properties});
    }
    if(targetIndex%10===0||targetIndex===eligibleTargets.length-1)progress('Testing spatial relationships',10+Math.round((targetIndex+1)/eligibleTargets.length*82),targetIndex+1,eligibleTargets.length);
  });
  if(multipleTargets&&config.matchMode==='expand')warnings.push(`The output expands ${multipleTargets} target record${multipleTargets===1?'':'s'} with multiple matches.`);
  return {kind:'spatial',rows,schema,diagnostics:{valid:true,errors:[],warnings,targetCount:allTargets.length,sourceCount:allSources.length,eligibleTargetCount:eligibleTargets.length,eligibleSourceCount:eligibleSources.length,matchedTargets,unmatchedTargets:unmatchedTargets+(allTargets.length-eligibleTargets.length),multipleTargets,totalMatches,skippedTargets:skippedTargets+invalidTargets.length+(targets.length-eligibleTargets.length),skippedSources:invalidSources.length+(sources.length-eligibleSources.length),expectedOutput:rows.length,predicate,matchMode:config.matchMode||'summarize',targetGeometryTypes:targetTypes,sourceGeometryTypes:sourceTypes,distanceMethod:predicate==='nearest'?'geodesic representative-point distance':null,sample:rows.slice(0,10).map(row=>row.properties)}};
}

async function run(task,progress){
  if(task.operation==='attributeJoin')return runAttribute(task,progress);
  if(task.operation==='groupSummary')return await runSummary(task,progress);
  if(task.operation==='spatialJoin')return runSpatial(task,progress);
  throw new Error(`Unsupported join operation: ${task.operation}`);
}

self.onmessage=async event=>{
  const {id,task}=event.data||{};
  try{
    const result=await run(task,(stage,percent,done,total)=>self.postMessage({id,type:'progress',stage,percent,done,total}));
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error?.message||String(error),stack:error?.stack||''});}
};
