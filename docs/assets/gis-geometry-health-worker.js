'use strict';
importScripts('gis-geometry-health-core.js?v=20260807-geometry-health-1541','gis-geos-adapter.js?v=20260807-geometry-health-1541');
const core=self.EditPolygonGeometryHealthCore;
const geosAdapter=self.EditPolygonGeosAdapter;
const GEOS_ESM_URL='https://cdn.jsdelivr.net/npm/geos-wasm@3.1.1/build/package/geos.esm.js';
let turfReady=false,geosPromise=null;
function ensureTurf(){if(turfReady&&self.turf)return self.turf;importScripts('https://unpkg.com/@turf/turf@7.2.0/turf.min.js');if(!self.turf)throw new Error('The fallback geometry engine could not be loaded.');turfReady=true;return self.turf;}
async function ensureGeos(){
  if(self.__editPolygonGeosMock)return self.__editPolygonGeosMock;
  if(!geosPromise)geosPromise=import(GEOS_ESM_URL).then(mod=>{if(typeof mod?.default!=='function')throw new Error('GEOS-WASM did not expose its browser initializer.');return mod.default();}).then(geos=>{geosAdapter.assertGeos(geos);return geos;}).catch(error=>{geosPromise=null;throw error;});
  return geosPromise;
}
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const fc=features=>({type:'FeatureCollection',features:(features||[]).filter(Boolean)});
function postProgress(id,completed,total,message){postMessage({id,type:'progress',completed,total,message});}
function ringClosed(ring){const pts=(ring||[]).filter(core.finiteCoord).map(c=>[Number(c[0]),Number(c[1])]);if(pts.length&&!core.sameCoord(pts[0],pts[pts.length-1]))pts.push([...pts[0]]);return pts;}
function preparePolygonGeometry(geometry){
  if(!geometry)return geometry;
  if(geometry.type==='Polygon')return {type:'Polygon',coordinates:(geometry.coordinates||[]).map(ringClosed).filter(r=>r.length>=4)};
  if(geometry.type==='MultiPolygon')return {type:'MultiPolygon',coordinates:(geometry.coordinates||[]).map(poly=>(poly||[]).map(ringClosed).filter(r=>r.length>=4)).filter(poly=>poly.length)};
  return clone(geometry);
}
function planarLineLength(coords){let total=0;for(let i=1;i<(coords||[]).length;i++){const a=coords[i-1],b=coords[i];if(!core.finiteCoord(a)||!core.finiteCoord(b))continue;total+=Math.hypot(Number(b[0])-Number(a[0]),Number(b[1])-Number(a[1]));}return total;}
function planarPolygonArea(poly){if(!Array.isArray(poly)||!poly.length)return 0;let area=Math.abs(core.ringArea(poly[0]||[]));for(let i=1;i<poly.length;i++)area-=Math.abs(core.ringArea(poly[i]||[]));return Math.max(0,area);}
function featureMetric(feature){
  if(!feature?.geometry)return {type:null,vertices:0,area:0,length:0,bbox:null,units:'coordinate'};const g=feature.geometry;let area=0,length=0;
  if(g.type==='Polygon')area=planarPolygonArea(g.coordinates);else if(g.type==='MultiPolygon')area=(g.coordinates||[]).reduce((sum,p)=>sum+planarPolygonArea(p),0);
  else if(g.type==='LineString')length=planarLineLength(g.coordinates);else if(g.type==='MultiLineString')length=(g.coordinates||[]).reduce((sum,line)=>sum+planarLineLength(line),0);
  return {type:g.type,vertices:core.geometryVertexCount(g),area,length,bbox:core.bboxOfGeometry(g),units:'coordinate'};
}
function percentChange(before,after,key){const a=Number(before?.[key]||0),b=Number(after?.[key]||0);if(!Number.isFinite(a)||!Number.isFinite(b))return null;if(Math.abs(a)<1e-12)return Math.abs(b)<1e-12?0:null;return ((b-a)/Math.abs(a))*100;}
function pathRemoveRing(geometry,gp){
  const g=clone(geometry);const pi=Number(gp?.polygonIndex||0),ri=Number(gp?.ringIndex);
  if(!Number.isInteger(ri))throw new Error('The selected issue does not identify a polygon ring.');
  if(g.type==='Polygon'){if(ri===0)throw new Error('Removing the outer boundary would remove the polygon.');g.coordinates.splice(ri,1);return g;}
  if(g.type==='MultiPolygon'){const poly=g.coordinates?.[pi];if(!poly)throw new Error('Polygon part not found.');if(ri===0)throw new Error('Removing the outer boundary would remove this polygon part.');poly.splice(ri,1);return g;}
  throw new Error('This repair applies only to polygon geometry.');
}
function pathCloseRing(geometry,gp){
  const g=clone(geometry);const pi=Number(gp?.polygonIndex||0),ri=Number(gp?.ringIndex||0);let ring;
  if(g.type==='Polygon')ring=g.coordinates?.[ri];else if(g.type==='MultiPolygon')ring=g.coordinates?.[pi]?.[ri];else throw new Error('This repair applies only to polygon geometry.');
  if(!Array.isArray(ring)||!ring.length)throw new Error('Boundary not found.');const valid=ring.filter(core.finiteCoord).map(c=>[Number(c[0]),Number(c[1])]);if(valid.length<3)throw new Error('Boundary has too few valid points to close.');if(!core.sameCoord(valid[0],valid[valid.length-1]))valid.push([...valid[0]]);
  if(g.type==='Polygon')g.coordinates[ri]=valid;else g.coordinates[pi][ri]=valid;return g;
}
function pathDropPolygonPart(geometry,gp){
  if(geometry?.type!=='MultiPolygon')return null;const g=clone(geometry),pi=Number(gp?.polygonIndex||0);g.coordinates.splice(pi,1);if(!g.coordinates.length)return null;if(g.coordinates.length===1)return {type:'Polygon',coordinates:g.coordinates[0]};return g;
}
function ringKey(ring){const body=(ring||[]).filter(core.finiteCoord);const seq=body.length>1&&core.sameCoord(body[0],body[body.length-1])?body.slice(0,-1):body;return seq.map(core.coordKey).filter(Boolean).sort().join(';');}
function dropDuplicateRing(geometry,gp){
  const g=clone(geometry),pi=Number(gp?.polygonIndex||0),ri=Number(gp?.ringIndex||0);const poly=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates?.[pi]:null;if(!Array.isArray(poly)||!poly[ri])throw new Error('Boundary not found.');const key=ringKey(poly[ri]);const other=poly.findIndex((r,i)=>i!==ri&&ringKey(r)===key);if(other<0)throw new Error('A matching duplicate boundary was not found.');poly.splice(ri,1);return g;
}
function turfMakeValid(feature){
  const turf=ensureTurf(),prepared={...clone(feature),geometry:preparePolygonGeometry(feature.geometry)},parts=[];if(!core.polygonType(prepared.geometry?.type))throw new Error('Make-valid applies only to polygon geometry.');
  const inputs=prepared.geometry.type==='Polygon'?[prepared]:prepared.geometry.coordinates.map((coordinates,index)=>({type:'Feature',properties:{...(prepared.properties||{}),__part:index},geometry:{type:'Polygon',coordinates}}));
  for(const input of inputs){const cleaned=turf.cleanCoords(input,{mutate:false});const kink=turf.kinks(cleaned);if(kink?.features?.length){const unk=turf.unkinkPolygon(cleaned);for(const f of unk.features||[])if(f.geometry?.type==='Polygon')parts.push(f.geometry.coordinates);}else if(cleaned.geometry?.type==='Polygon')parts.push(cleaned.geometry.coordinates);}
  if(!parts.length)throw new Error('Fallback make-valid did not produce polygon geometry.');let outGeom=parts.length===1?{type:'Polygon',coordinates:parts[0]}:{type:'MultiPolygon',coordinates:parts};
  try{if(parts.length>1){const merged=turf.union(fc(parts.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates}}))));if(merged?.geometry&&core.polygonType(merged.geometry.type))outGeom=merged.geometry;}}catch(_){ }
  return {feature:{...clone(feature),geometry:outGeom},engine:{name:'Turf fallback',library:'@turf/turf',version:'7.2.0',fallback:true},warnings:['GEOS-WASM was unavailable, so this preview used the less comprehensive Turf fallback engine. Review the result carefully.']};
}
async function makeValidPolygonFeature(feature){
  const prepared={...clone(feature),geometry:preparePolygonGeometry(feature.geometry)};if(!core.polygonType(prepared.geometry?.type))throw new Error('Make-valid applies only to polygon geometry.');
  try{
    const geos=await ensureGeos(),result=geosAdapter.makeValid(geos,prepared.geometry);const warnings=[];
    if(result.discardedLowerDimensionalParts)warnings.push(`${result.discardedLowerDimensionalParts} lower-dimensional component${result.discardedLowerDimensionalParts===1?' was':'s were'} not kept in the polygon output.`);
    if(result.discardedOtherParts)warnings.push(`${result.discardedOtherParts} unsupported MakeValid component${result.discardedOtherParts===1?' was':'s were'} not kept in the polygon output.`);
    return {feature:result.geometry?{...clone(feature),geometry:result.geometry}:null,removed:!result.geometry,engine:{...result.engine,fallback:false},warnings,reasonBefore:result.reasonBefore,reasonAfter:result.reasonAfter,rawOutputType:result.rawGeometry?.type||null};
  }catch(geosError){
    try{const fallback=turfMakeValid(prepared);fallback.warnings.unshift(`GEOS-WASM could not complete this repair: ${geosError?.message||geosError}`);return fallback;}
    catch(turfError){throw new Error(`Automatic make-valid failed. GEOS-WASM: ${geosError?.message||geosError}. Fallback: ${turfError?.message||turfError}.`);}
  }
}
function structuralIssuePreventsGeos(result){const blocking=new Set(['EMPTY_GEOMETRY','UNSUPPORTED_GEOMETRY','INVALID_COORDINATE','EMPTY_POLYGON','BAD_RING','UNCLOSED_RING','TOO_FEW_UNIQUE_VERTICES']);return (result?.issues||[]).some(issue=>blocking.has(issue.code));}
function recomputeReportCounts(report){report.issues=report.featureResults.flatMap(result=>result.issues);report.counts={checked:report.featureResults.length,ready:0,safe:0,review:0,manual:0,issues:0};for(const r of report.featureResults){let status='ready';for(const issue of r.issues||[])if(core.STATUS_RANK[issue.risk]>core.STATUS_RANK[status])status=issue.risk;r.status=status;r.issueCount=(r.issues||[]).length;report.counts[status]++;report.counts.issues+=r.issueCount;}return report;}
function robustIssue(feature,result,reason){
  const location=geosAdapter.locationFromReason(reason);return {id:`${result.featureId}::GEOS_INVALID_POLYGON::robust`,featureId:result.featureId,featureIndex:result.featureIndex,featureName:result.featureName,geometryType:result.geometryType,code:'GEOS_INVALID_POLYGON',title:'Geometry is invalid',summary:'The robust geometry engine found a topology problem that can affect GIS analysis.',detail:`GEOS reports: ${reason}`,technical:'Verified with GEOS isValidReason through geos-wasm 3.1.1.',risk:'review',status:'review',path:'Robust topology check',geometryPath:null,location,repair:{action:'make_valid',risk:'review'},rule:'standard'};
}
async function augmentRobustPolygonValidity(collection,report,options,id){
  if(options.robustEngine===false){report.engine.robust={name:'GEOS-WASM',version:geosAdapter.GEOS_WASM_VERSION,status:'disabled'};return report;}
  const entries=(collection.features||[]).map((feature,index)=>({feature,index,result:report.featureResults[index]})).filter(entry=>core.polygonType(entry.feature?.geometry?.type));
  if(!entries.length){report.engine.robust={name:'GEOS-WASM',version:geosAdapter.GEOS_WASM_VERSION,status:'not-needed',checked:0};return report;}
  postProgress(id,0,entries.length,'Loading robust polygon topology checks…');let geos;
  try{geos=await ensureGeos();}catch(error){report.engine.robust={name:'GEOS-WASM',version:geosAdapter.GEOS_WASM_VERSION,status:'unavailable',checked:0,error:error?.message||String(error)};report.warnings=[...(report.warnings||[]),'Robust GEOS polygon validation could not load. Deterministic structural checks still completed; consequential MakeValid previews will retry the engine and clearly identify any fallback.'];return report;}
  let checked=0,skipped=0,errors=0;
  for(let i=0;i<entries.length;i++){
    const {feature,result}=entries[i];postProgress(id,i,entries.length,'Verifying polygon topology with GEOS…');
    if(structuralIssuePreventsGeos(result)){result.robustValidity={status:'skipped',reason:'Resolve structural coordinate/ring issues before GEOS topology validation.'};skipped++;continue;}
    try{
      const validity=geosAdapter.validity(geos,feature.geometry);result.robustValidity={status:validity.valid?'valid':'invalid',reason:validity.reason,engine:'GEOS-WASM 3.1.1'};checked++;
      if(!validity.valid){const already=(result.issues||[]).some(issue=>issue.repair?.action==='make_valid'||issue.code==='GEOS_INVALID_POLYGON');if(!already)result.issues.push(robustIssue(feature,result,validity.reason));else for(const issue of result.issues||[])if(issue.repair?.action==='make_valid'&&!issue.robustReason)issue.robustReason=validity.reason;}
    }catch(error){result.robustValidity={status:'error',reason:error?.message||String(error)};errors++;}
  }
  postProgress(id,entries.length,entries.length,'Robust polygon topology checks complete.');report.engine.robust={name:'GEOS-WASM',version:geosAdapter.GEOS_WASM_VERSION,status:errors?'partial':'ready',checked,skipped,errors};return recomputeReportCounts(report);
}
async function previewReviewRepair(feature,issue,options={}){
  if(!feature?.geometry)throw new Error('Feature geometry is missing.');const action=issue?.repair?.action;if(!action)throw new Error('This issue does not have an automatic repair.');
  const safe=core.safeRepairGeometry(feature.geometry),working={...clone(feature),geometry:safe.geometry};let repairedFeature=working,removed=false,description='',engine={name:'EditPolygon deterministic repair',version:core.VERSION,fallback:false},warnings=[];
  if(action==='close_ring'){repairedFeature.geometry=pathCloseRing(working.geometry,issue.geometryPath);description='Closed the selected polygon boundary.';}
  else if(action==='drop_invalid_hole'||action==='drop_collapsed_hole'){repairedFeature.geometry=pathRemoveRing(working.geometry,issue.geometryPath);description='Removed the selected invalid hole.';}
  else if(action==='drop_duplicate_ring'){repairedFeature.geometry=dropDuplicateRing(working.geometry,issue.geometryPath);description='Removed one repeated polygon boundary.';}
  else if(action==='drop_collapsed_polygon'){const g=pathDropPolygonPart(working.geometry,issue.geometryPath);if(!g){removed=true;repairedFeature=null;description='Removed the collapsed polygon feature.';}else{repairedFeature.geometry=g;description='Removed the collapsed polygon part.';}}
  else if(action==='make_valid'){
    const made=await makeValidPolygonFeature(working);repairedFeature=made.feature;removed=!!made.removed||!made.feature;engine=made.engine;warnings=[...(made.warnings||[])];description=removed?'The robust make-valid result contains no polygonal area, so accepting this proposal would remove the feature.':'Rebuilt the polygon with a topology make-valid operation.';
    if(made.reasonBefore)warnings.push(`Before repair: ${made.reasonBefore}`);if(made.reasonAfter)warnings.push(`After repair: ${made.reasonAfter}`);
  }else throw new Error(`Repair action ${action} is not available.`);
  const before=featureMetric(feature),after=repairedFeature?featureMetric(repairedFeature):{type:null,vertices:0,area:0,length:0,bbox:null,units:'coordinate'};const proposalCollection=fc(repairedFeature?[repairedFeature]:[]),report=core.validateCollection(proposalCollection,{rules:options.rules||{}});
  if(repairedFeature&&core.polygonType(repairedFeature.geometry?.type)&&action==='make_valid'&&!engine.fallback){try{const geos=await ensureGeos(),validity=geosAdapter.validity(geos,repairedFeature.geometry);if(!validity.valid)warnings.push(`GEOS still reports this polygon as invalid: ${validity.reason}`);}catch(_){ }}
  const areaChange=percentChange(before,after,'area'),lengthChange=percentChange(before,after,'length');let consequence='low';if(removed||before.type!==after.type||Math.abs(areaChange||0)>2||Math.abs(lengthChange||0)>2||warnings.some(w=>/not kept|no polygonal/i.test(w)))consequence='high';else if(Math.abs(areaChange||0)>.1||Math.abs(lengthChange||0)>.1||before.vertices!==after.vertices)consequence='medium';
  return {featureId:feature.id,issueId:issue.id,action,description,removed,feature:repairedFeature,before,after,areaChangePercent:areaChange,lengthChangePercent:lengthChange,consequence,remainingIssues:report.issues,remainingCounts:report.counts,safeChanges:safe.changes,engine,warnings,metricNote:'Area and length percentages are relative coordinate-space comparisons used only to flag material changes.'};
}
function appendPolygonOverlapRules(collection,report,options,id,onProgress){
  if(!options.rules?.polygonOverlaps)return report;const turf=ensureTurf(),polygons=(collection.features||[]).map((f,index)=>({f,index})).filter(x=>core.polygonType(x.f?.geometry?.type));let checks=0;const total=Math.max(1,polygons.length*(polygons.length-1)/2);const byId=new Map(report.featureResults.map(r=>[String(r.featureId),r]));
  for(let i=0;i<polygons.length;i++)for(let j=i+1;j<polygons.length;j++){
    checks++;if(checks%20===0)onProgress?.(checks,total,'Checking polygon overlaps…');const a=polygons[i],b=polygons[j];let intersects=false,location=null;
    try{const ba=turf.bbox(a.f),bb=turf.bbox(b.f);if(ba[0]>bb[2]||ba[2]<bb[0]||ba[1]>bb[3]||ba[3]<bb[1])continue;const inter=turf.intersect(fc([a.f,b.f]));if(inter&&turf.area(inter)>1e-6){intersects=true;location=turf.centroid(inter).geometry.coordinates;}}catch(_){ }
    if(!intersects)continue;const target=b,featureId=target.f.id??`feature-${target.index+1}`,result=byId.get(String(featureId));if(!result)continue;const issue={id:`${featureId}::POLYGON_OVERLAP::${a.index}::${j}`,featureId,featureIndex:target.index,featureName:target.f.properties?.name||`Feature ${target.index+1}`,geometryType:target.f.geometry?.type||'',code:'POLYGON_OVERLAP',title:'Polygons overlap',summary:'Two polygon features overlap under the optional layer rule. Overlap can be legitimate in many datasets, so this is review-only.',detail:`Overlaps ${a.f.properties?.name||`Feature ${a.index+1}`}.`,technical:'Optional topology rule evaluated using polygon intersection area.',risk:'manual',status:'manual',path:`With ${a.f.properties?.name||`Feature ${a.index+1}`}`,geometryPath:null,location,repair:null,rule:'polygonOverlaps'};result.issues.push(issue);
  }
  return recomputeReportCounts(report);
}
async function validate(collection,options,id){
  const total=Math.max(1,collection.features?.length||1);postProgress(id,0,total,'Checking geometry…');let report=core.validateCollection(collection,options);postProgress(id,total,total,'Standard geometry checks complete.');report=await augmentRobustPolygonValidity(collection,report,options,id);report=appendPolygonOverlapRules(collection,report,options,id,(c,t,m)=>postProgress(id,c,t,m));return report;
}
async function repairSafe(collection,options,id){postProgress(id,0,2,'Applying safe geometry cleanup…');const result=core.safeRepairCollection(collection);postProgress(id,1,2,'Rechecking repaired geometry…');const report=await validate(result.collection,options,id);postProgress(id,2,2,'Safe repair preview ready.');return {...result,report};}
self.onmessage=async event=>{
  const {id,action,collection,feature,issue,options={}}=event.data||{};
  try{
    let result;if(action==='validate')result=await validate(collection||fc([]),options,id);else if(action==='repairSafe')result=await repairSafe(collection||fc([]),options,id);else if(action==='previewReview')result=await previewReviewRepair(feature,issue,options);else throw new Error('Unknown Geometry Health worker action.');
    postMessage({id,type:'result',result});
  }catch(error){postMessage({id,type:'error',error:error?.message||String(error),stack:error?.stack||''});}
};
