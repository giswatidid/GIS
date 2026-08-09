(function(global){
'use strict';

const VERSION='1.54.2';
const STATUS_RANK={ready:0,safe:1,review:2,manual:3};
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const finiteCoord=c=>Array.isArray(c)&&Number.isFinite(Number(c[0]))&&Number.isFinite(Number(c[1]));
const coord=c=>[Number(c[0]),Number(c[1])];
const sameCoord=(a,b,eps=1e-12)=>finiteCoord(a)&&finiteCoord(b)&&Math.abs(Number(a[0])-Number(b[0]))<=eps&&Math.abs(Number(a[1])-Number(b[1]))<=eps;
const coordKey=c=>finiteCoord(c)?`${Number(c[0]).toPrecision(14)},${Number(c[1]).toPrecision(14)}`:'';
const supportedType=t=>['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(t);
const polygonType=t=>t==='Polygon'||t==='MultiPolygon';
const lineType=t=>t==='LineString'||t==='MultiLineString';
const pointType=t=>t==='Point'||t==='MultiPoint';
const featureName=(f,i)=>String(f?.properties?.name??f?.properties?.Name??f?.properties?.NAME??f?.name??`Feature ${i+1}`);
const issueId=(featureId,code,path,index)=>`${String(featureId??'feature')}::${code}::${path||''}::${index}`;
function ringArea(ring){
  const pts=(ring||[]).filter(finiteCoord);if(pts.length<3)return 0;let area=0;
  const n=pts.length;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];area+=Number(a[0])*Number(b[1])-Number(b[0])*Number(a[1]);}
  return area/2;
}
function orientation(a,b,c){const v=(Number(b[1])-Number(a[1]))*(Number(c[0])-Number(b[0]))-(Number(b[0])-Number(a[0]))*(Number(c[1])-Number(b[1]));if(Math.abs(v)<1e-12)return 0;return v>0?1:2;}
function onSegment(a,b,c){return Math.min(Number(a[0]),Number(c[0]))-1e-12<=Number(b[0])&&Number(b[0])<=Math.max(Number(a[0]),Number(c[0]))+1e-12&&Math.min(Number(a[1]),Number(c[1]))-1e-12<=Number(b[1])&&Number(b[1])<=Math.max(Number(a[1]),Number(c[1]))+1e-12;}
function segmentsIntersect(p1,q1,p2,q2){
  if(![p1,q1,p2,q2].every(finiteCoord))return false;const o1=orientation(p1,q1,p2),o2=orientation(p1,q1,q2),o3=orientation(p2,q2,p1),o4=orientation(p2,q2,q1);
  if(o1!==o2&&o3!==o4)return true;if(o1===0&&onSegment(p1,p2,q1))return true;if(o2===0&&onSegment(p1,q2,q1))return true;if(o3===0&&onSegment(p2,p1,q2))return true;if(o4===0&&onSegment(p2,q1,q2))return true;return false;
}
function segmentIntersectionPoint(a,b,c,d){
  const x1=Number(a[0]),y1=Number(a[1]),x2=Number(b[0]),y2=Number(b[1]),x3=Number(c[0]),y3=Number(c[1]),x4=Number(d[0]),y4=Number(d[1]);
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-15)return [(x1+x2+x3+x4)/4,(y1+y2+y3+y4)/4];
  return [((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den,((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den];
}
function selfIntersections(sequence,{closed=false,limit=30,maxSegments=1800}={}){
  const raw=(sequence||[]).filter(finiteCoord),pts=[];for(const point of raw)if(!pts.length||!sameCoord(pts[pts.length-1],point))pts.push(point);if(pts.length<4)return {hits:[],skipped:false};const path=closed&&!sameCoord(pts[0],pts[pts.length-1])?pts.concat([pts[0]]):pts;const n=path.length-1;
  if(n>maxSegments)return {hits:[],skipped:true,segments:n};const hits=[];
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    if(Math.abs(i-j)<=1)continue;if(closed&&i===0&&j===n-1)continue;
    if(segmentsIntersect(path[i],path[i+1],path[j],path[j+1])){hits.push({segments:[i,j],location:segmentIntersectionPoint(path[i],path[i+1],path[j],path[j+1])});if(hits.length>=limit)return {hits,skipped:false,truncated:true};}
  }
  return {hits,skipped:false};
}
function pointInRing(point,ring){
  if(!finiteCoord(point))return false;const pts=(ring||[]).filter(finiteCoord);if(pts.length<3)return false;let inside=false;const x=Number(point[0]),y=Number(point[1]);
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=Number(pts[i][0]),yi=Number(pts[i][1]),xj=Number(pts[j][0]),yj=Number(pts[j][1]);
    if(onSegment(pts[j],point,pts[i])&&orientation(pts[j],point,pts[i])===0)return true;
    const cross=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi||Number.EPSILON)+xi);if(cross)inside=!inside;
  }return inside;
}
function ringsIntersect(a,b){
  const ra=(a||[]).filter(finiteCoord),rb=(b||[]).filter(finiteCoord);if(ra.length<2||rb.length<2)return null;
  const aa=sameCoord(ra[0],ra[ra.length-1])?ra:ra.concat([ra[0]]),bb=sameCoord(rb[0],rb[rb.length-1])?rb:rb.concat([rb[0]]);
  for(let i=0;i<aa.length-1;i++)for(let j=0;j<bb.length-1;j++)if(segmentsIntersect(aa[i],aa[i+1],bb[j],bb[j+1]))return {segments:[i,j],location:segmentIntersectionPoint(aa[i],aa[i+1],bb[j],bb[j+1])};
  return null;
}
function pointOnRingBoundary(point,ring){
  if(!finiteCoord(point))return false;const pts=(ring||[]).filter(finiteCoord);if(pts.length<2)return false;const closed=sameCoord(pts[0],pts[pts.length-1])?pts:pts.concat([pts[0]]);
  for(let i=0;i<closed.length-1;i++)if(orientation(closed[i],point,closed[i+1])===0&&onSegment(closed[i],point,closed[i+1]))return true;return false;
}
function pointStrictlyInRing(point,ring){return finiteCoord(point)&&!pointOnRingBoundary(point,ring)&&pointInRing(point,ring);}
function properRingsIntersect(a,b){
  const ra=(a||[]).filter(finiteCoord),rb=(b||[]).filter(finiteCoord);if(ra.length<2||rb.length<2)return null;
  const aa=sameCoord(ra[0],ra[ra.length-1])?ra:ra.concat([ra[0]]),bb=sameCoord(rb[0],rb[rb.length-1])?rb:rb.concat([rb[0]]);
  for(let i=0;i<aa.length-1;i++)for(let j=0;j<bb.length-1;j++){
    const o1=orientation(aa[i],aa[i+1],bb[j]),o2=orientation(aa[i],aa[i+1],bb[j+1]),o3=orientation(bb[j],bb[j+1],aa[i]),o4=orientation(bb[j],bb[j+1],aa[i+1]);
    if(o1&&o2&&o3&&o4&&o1!==o2&&o3!==o4)return {segments:[i,j],location:segmentIntersectionPoint(aa[i],aa[i+1],bb[j],bb[j+1])};
  }return null;
}
function bboxOfGeometry(geometry){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;const walk=value=>{if(finiteCoord(value)){const x=Number(value[0]),y=Number(value[1]);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);return;}if(Array.isArray(value))value.forEach(walk);};if(geometry?.type==='GeometryCollection')(geometry.geometries||[]).forEach(g=>walk(g?.coordinates));else walk(geometry?.coordinates);return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;}
function geometryVertexCount(geometry){let count=0;const walk=value=>{if(finiteCoord(value)){count++;return;}if(Array.isArray(value))value.forEach(walk);};if(geometry?.type==='GeometryCollection')(geometry.geometries||[]).forEach(g=>walk(g?.coordinates));else walk(geometry?.coordinates);return count;}
function exactGeometryKey(geometry){
  if(!geometry||!supportedType(geometry.type))return '';const round=v=>Math.round(Number(v)*1e10)/1e10;const walk=v=>finiteCoord(v)?[round(v[0]),round(v[1])]:Array.isArray(v)?v.map(walk):v;return JSON.stringify({type:geometry.type,coordinates:walk(geometry.coordinates)});
}
function issueDefinition(code){
  const defs={
    EMPTY_GEOMETRY:['Feature has no shape','This record does not contain usable geometry.','manual'],
    UNSUPPORTED_GEOMETRY:['Geometry type is not supported','Geometry Health currently checks point, line and polygon geometry.','manual'],
    INVALID_COORDINATE:['Coordinate cannot be read','One or more coordinates are missing or are not numeric.','manual'],
    COORDINATE_RANGE:['Coordinates may use the wrong CRS','Coordinates fall outside longitude/latitude limits expected by the editor’s internal map geometry.','manual'],
    EMPTY_MULTIPOINT:['MultiPoint has no points','This multipart point feature is empty.','manual'],
    DUPLICATE_MULTIPOINT:['Repeated point','The same point occurs more than once in this MultiPoint. Removing exact repeats does not change its location.','safe'],
    TOO_FEW_LINE_VERTICES:['Line has too few points','A line needs at least two distinct points.','manual'],
    EMPTY_LINE_PART:['Line part is empty','One part of this MultiLineString does not contain a usable line.','manual'],
    CONSECUTIVE_DUPLICATES:['Repeated point','Two or more neighbouring vertices are identical. Removing exact repeats does not change the shape.','safe'],
    LINE_SELF_INTERSECTION:['Line crosses itself','The line crosses itself. This is valid GIS geometry, but it violates the optional layer rule you selected.','manual'],
    DANGLING_LINE_ENDPOINT:['Line endpoint is not connected','This endpoint does not meet another line endpoint in the checked layer.','manual'],
    EMPTY_POLYGON:['Polygon has no boundary','This polygon does not contain an outer boundary.','manual'],
    BAD_RING:['Boundary cannot be read','A polygon boundary is not stored as a valid coordinate sequence.','manual'],
    UNCLOSED_RING:['Outline is not closed','The first and last points of this polygon boundary are different. Closing it changes the geometry and should be reviewed.','review'],
    REDUNDANT_CLOSURE:['Repeated closing point','The closing coordinate is repeated more than once. Extra copies can be removed without changing the shape.','safe'],
    TOO_FEW_UNIQUE_VERTICES:['Boundary has too few distinct points','A polygon ring needs at least three distinct points.','manual'],
    ZERO_AREA_RING:['Shape has collapsed','This boundary has zero or near-zero area. Removing it may remove part of the feature.','review'],
    WINDING:['Boundary direction can be normalised','The ring direction differs from the GeoJSON convention. Reversing coordinate order does not change the shape.','safe'],
    DUPLICATE_RING:['Repeated boundary','The same polygon boundary appears more than once. Removing one may change hole/part semantics, so review it first.','review'],
    SELF_INTERSECTION:['Boundary crosses itself','Part of this polygon outline crosses another part of the same outline. Some GIS operations may fail or return unexpected results.','review'],
    SELF_INTERSECTION_SKIPPED:['Detailed crossing check was limited','This ring is very large, so the built-in segment scan was limited. Run the advanced repair preview before relying on the result.','manual'],
    HOLE_OUTSIDE_SHELL:['Hole is outside its polygon','A hole is not contained by the polygon outer boundary.','review'],
    HOLE_TOUCHES_SHELL:['Hole crosses the outer boundary','A hole boundary intersects the polygon outer boundary.','review'],
    HOLES_INTERSECT:['Holes overlap or cross','Two holes in this polygon intersect or overlap.','review'],
    NESTED_HOLE:['One hole is inside another hole','Nested holes create ambiguous polygon topology and need review.','review'],
    MULTIPOLYGON_PARTS_OVERLAP:['Parts of this feature overlap','Two polygon parts in the same MultiPolygon overlap or contain one another.','review'],
    DUPLICATE_FEATURE:['Possible duplicate feature','Another feature has exactly the same geometry. Duplicates are a data decision and are never removed automatically.','manual'],
    POLYGON_OVERLAP:['Polygons overlap','Two polygon features overlap under the optional layer rule. Overlap can be legitimate in many datasets, so this is review-only.','manual']
  };return defs[code]||[code,'Geometry issue detected.','manual'];
}
function makeIssue(ctx,code,options={}){
  const [title,summary,defaultRisk]=issueDefinition(code),risk=options.risk||defaultRisk,path=options.path||'',idx=ctx.nextIssue++;
  return {id:issueId(ctx.featureId,code,path,idx),featureId:ctx.featureId,featureIndex:ctx.featureIndex,featureName:ctx.featureName,geometryType:ctx.geometryType||'',code,title,summary,detail:options.detail||summary,technical:options.technical||'',risk,status:risk,path,geometryPath:options.geometryPath||null,location:options.location||null,repair:options.repair||null,rule:options.rule||'standard'};
}
function validateCoordRange(c){return finiteCoord(c)&&(Number(c[0])<-180||Number(c[0])>180||Number(c[1])<-90||Number(c[1])>90);}
function validateSequence(ctx,coords,path,{closed=false,line=false,geometryPath=null}={}){
  const issues=[];const raw=Array.isArray(coords)?coords:[];const valid=raw.filter(finiteCoord);const bad=raw.length-valid.length;
  if(bad)issues.push(makeIssue(ctx,'INVALID_COORDINATE',{path,geometryPath,detail:`${bad} coordinate${bad===1?' is':'s are'} not numeric.`,technical:'Coordinate tuples must contain finite X and Y values.'}));
  const range=valid.filter(validateCoordRange).length;if(range)issues.push(makeIssue(ctx,'COORDINATE_RANGE',{path,geometryPath,detail:`${range} coordinate${range===1?' is':'s are'} outside the editor's internal WGS 84 range.`,location:valid.find(validateCoordRange)||null}));
  let dupes=0;for(let i=1;i<valid.length;i++)if(sameCoord(valid[i-1],valid[i]))dupes++;
  if(dupes)issues.push(makeIssue(ctx,'CONSECUTIVE_DUPLICATES',{path,geometryPath,detail:`${dupes} neighbouring duplicate ${dupes===1?'vertex':'vertices'} found.`,repair:{action:'remove_consecutive_duplicates',risk:'safe'}}));
  if(line){const distinct=new Set(valid.map(coordKey)).size;if(distinct<2)issues.push(makeIssue(ctx,'TOO_FEW_LINE_VERTICES',{path,geometryPath,detail:`This line contains ${distinct} distinct point${distinct===1?'':'s'}.`}));return issues;}
  if(closed){
    if(valid.length&& !sameCoord(valid[0],valid[valid.length-1]))issues.push(makeIssue(ctx,'UNCLOSED_RING',{path,geometryPath,location:valid[valid.length-1]||valid[0]||null,repair:{action:'close_ring',risk:'review'}}));
    let redundant=0;if(valid.length>2&&sameCoord(valid[0],valid[valid.length-1])){for(let i=valid.length-2;i>0&&sameCoord(valid[i],valid[0]);i--)redundant++;}
    if(redundant)issues.push(makeIssue(ctx,'REDUNDANT_CLOSURE',{path,geometryPath,detail:`The closing coordinate is repeated ${redundant+1} times.`,repair:{action:'normalise_closure',risk:'safe'}}));
    const body=valid.length>1&&sameCoord(valid[0],valid[valid.length-1])?valid.slice(0,-1):valid;const unique=new Set(body.map(coordKey));
    if(unique.size<3)issues.push(makeIssue(ctx,'TOO_FEW_UNIQUE_VERTICES',{path,geometryPath,detail:`This boundary contains ${unique.size} distinct point${unique.size===1?'':'s'}.`}));
  }
  return issues;
}
function validatePolygonPart(ctx,poly,pi){
  const issues=[];const polyPath=ctx.geometryType==='MultiPolygon'?`Polygon part ${pi+1}`:'Polygon';
  if(!Array.isArray(poly)||!poly.length){issues.push(makeIssue(ctx,'EMPTY_POLYGON',{path:polyPath,geometryPath:{polygonIndex:pi}}));return issues;}
  const shell=Array.isArray(poly[0])?poly[0]:[];const ringKeys=new Map();
  poly.forEach((ring,ri)=>{
    const role=ri===0?'Outer boundary':`Hole ${ri}`,path=`${polyPath} · ${role}`,gp={polygonIndex:pi,ringIndex:ri};
    if(!Array.isArray(ring)){issues.push(makeIssue(ctx,'BAD_RING',{path,geometryPath:gp}));return;}
    issues.push(...validateSequence(ctx,ring,path,{closed:true,geometryPath:gp}));
    const valid=ring.filter(finiteCoord);const body=valid.length>1&&sameCoord(valid[0],valid[valid.length-1])?valid.slice(0,-1):valid;
    if(body.length>=3){
      const self=selfIntersections(valid,{closed:true});
      if(self.skipped)issues.push(makeIssue(ctx,'SELF_INTERSECTION_SKIPPED',{path,geometryPath:gp,detail:`Detailed crossing scan was limited at ${self.segments.toLocaleString()} segments.`}));
      else if(self.hits.length){const first=self.hits[0];issues.push(makeIssue(ctx,'SELF_INTERSECTION',{path,geometryPath:{...gp,segments:first.segments},location:first.location,detail:`${self.hits.length}${self.truncated?'+':''} crossing${self.hits.length===1?'':'s'} detected in this boundary.`,technical:`Intersecting segment indexes include ${first.segments.join(' and ')}.`,repair:{action:'make_valid',risk:'review'}}));}
      if(!self.hits?.length){const area=ringArea(valid);if(Math.abs(area)<1e-14)issues.push(makeIssue(ctx,'ZERO_AREA_RING',{path,geometryPath:gp,location:body[0]||null,repair:{action:ri===0?'drop_collapsed_polygon':'drop_collapsed_hole',risk:'review'}}));else if((ri===0&&area<0)||(ri>0&&area>0))issues.push(makeIssue(ctx,'WINDING',{path,geometryPath:gp,repair:{action:'normalise_winding',risk:'safe'}}));}
    }
    const key=body.map(coordKey).filter(Boolean).sort().join(';');if(key&&ringKeys.has(key))issues.push(makeIssue(ctx,'DUPLICATE_RING',{path,geometryPath:gp,detail:`This boundary duplicates ${ringKeys.get(key)}.`,repair:{action:'drop_duplicate_ring',risk:'review'}}));else if(key)ringKeys.set(key,role);
    if(ri>0&&valid.length&&shell.length>=3){
      if(!pointInRing(valid[0],shell))issues.push(makeIssue(ctx,'HOLE_OUTSIDE_SHELL',{path,geometryPath:gp,location:valid[0],repair:{action:'drop_invalid_hole',risk:'review'}}));
      const cross=ringsIntersect(shell,valid);if(cross)issues.push(makeIssue(ctx,'HOLE_TOUCHES_SHELL',{path,geometryPath:{...gp,segments:cross.segments},location:cross.location,repair:{action:'drop_invalid_hole',risk:'review'}}));
    }
  });
  for(let a=1;a<poly.length;a++)for(let b=a+1;b<poly.length;b++){
    const ra=poly[a],rb=poly[b];if(!Array.isArray(ra)||!Array.isArray(rb))continue;const cross=ringsIntersect(ra,rb);const path=`${polyPath} · Holes ${a} and ${b}`;
    if(cross)issues.push(makeIssue(ctx,'HOLES_INTERSECT',{path,geometryPath:{polygonIndex:pi,ringIndex:a,otherRingIndex:b,segments:cross.segments},location:cross.location,repair:{action:'drop_invalid_hole',risk:'review'}}));
    else if(finiteCoord(ra[0])&&pointInRing(ra[0],rb)||finiteCoord(rb[0])&&pointInRing(rb[0],ra))issues.push(makeIssue(ctx,'NESTED_HOLE',{path,geometryPath:{polygonIndex:pi,ringIndex:a,otherRingIndex:b},location:ra[0]||rb[0]||null,repair:{action:'make_valid',risk:'review'}}));
  }
  return issues;
}
function polygonPartsOverlap(a,b){
  const sa=Array.isArray(a?.[0])?a[0]:[],sb=Array.isArray(b?.[0])?b[0]:[];if(sa.length<3||sb.length<3)return null;
  if(exactGeometryKey({type:'Polygon',coordinates:a})===exactGeometryKey({type:'Polygon',coordinates:b}))return {location:sa.find(finiteCoord)||null,duplicate:true};
  const cross=properRingsIntersect(sa,sb);if(cross)return cross;
  const mids=ring=>{const pts=(ring||[]).filter(finiteCoord),closed=sameCoord(pts[0],pts[pts.length-1])?pts:pts.concat(pts.length?[pts[0]]:[]),out=[];for(let i=0;i<closed.length-1;i++)out.push([(Number(closed[i][0])+Number(closed[i+1][0]))/2,(Number(closed[i][1])+Number(closed[i+1][1]))/2]);return out;};
  const pa=sa.find(p=>pointStrictlyInRing(p,sb))||mids(sa).find(p=>pointStrictlyInRing(p,sb)),pb=sb.find(p=>pointStrictlyInRing(p,sa))||mids(sb).find(p=>pointStrictlyInRing(p,sa));if(pa)return {location:pa,contained:true};if(pb)return {location:pb,contained:true};return null;
}
function validateFeature(feature,index,options={}){
  const featureId=feature?.id??feature?.properties?.__editpolygon_id??`feature-${index+1}`,name=featureName(feature,index),geometry=feature?.geometry,ctx={featureId,featureIndex:index,featureName:name,geometryType:geometry?.type||'',nextIssue:0},issues=[];
  const raw=Array.isArray(feature?.properties?.__validatorRawIssues)?feature.properties.__validatorRawIssues:[];raw.forEach(item=>issues.push(makeIssue(ctx,item.code||'INVALID_COORDINATE',{path:item.path||'',detail:item.message||'Source geometry issue detected.',risk:item.severity==='warning'?'review':'manual'})));
  if(!geometry){issues.push(makeIssue(ctx,'EMPTY_GEOMETRY'));return featureResult(feature,index,issues);}
  if(!supportedType(geometry.type)){issues.push(makeIssue(ctx,'UNSUPPORTED_GEOMETRY',{detail:`${geometry.type} is not supported by Geometry Health 1.54.`}));return featureResult(feature,index,issues);}
  if(geometry.type==='Point'){
    if(!finiteCoord(geometry.coordinates))issues.push(makeIssue(ctx,'INVALID_COORDINATE',{path:'Point'}));else if(validateCoordRange(geometry.coordinates))issues.push(makeIssue(ctx,'COORDINATE_RANGE',{path:'Point',location:coord(geometry.coordinates)}));
  }else if(geometry.type==='MultiPoint'){
    const pts=Array.isArray(geometry.coordinates)?geometry.coordinates:[];if(!pts.length)issues.push(makeIssue(ctx,'EMPTY_MULTIPOINT'));
    const seen=new Set();let bad=0,range=0,dupes=0;for(const p of pts){if(!finiteCoord(p)){bad++;continue;}if(validateCoordRange(p))range++;const key=coordKey(p);if(seen.has(key))dupes++;else seen.add(key);}
    if(bad)issues.push(makeIssue(ctx,'INVALID_COORDINATE',{path:'MultiPoint',detail:`${bad} point${bad===1?' is':'s are'} not numeric.`}));if(range)issues.push(makeIssue(ctx,'COORDINATE_RANGE',{path:'MultiPoint',detail:`${range} point${range===1?' is':'s are'} outside longitude/latitude range.`}));if(dupes)issues.push(makeIssue(ctx,'DUPLICATE_MULTIPOINT',{path:'MultiPoint',detail:`${dupes} exact duplicate point${dupes===1?'':'s'} found.`,repair:{action:'dedupe_multipoint',risk:'safe'}}));
  }else if(geometry.type==='LineString')issues.push(...validateSequence(ctx,geometry.coordinates,'Line',{line:true,geometryPath:{lineIndex:0}}));
  else if(geometry.type==='MultiLineString'){
    const parts=Array.isArray(geometry.coordinates)?geometry.coordinates:[];if(!parts.length)issues.push(makeIssue(ctx,'EMPTY_LINE_PART',{path:'MultiLineString'}));parts.forEach((line,li)=>{if(!Array.isArray(line)||!line.length)issues.push(makeIssue(ctx,'EMPTY_LINE_PART',{path:`Line part ${li+1}`,geometryPath:{lineIndex:li}}));else issues.push(...validateSequence(ctx,line,`Line part ${li+1}`,{line:true,geometryPath:{lineIndex:li}}));});
  }else if(geometry.type==='Polygon')issues.push(...validatePolygonPart(ctx,geometry.coordinates,0));
  else if(geometry.type==='MultiPolygon'){
    const polys=Array.isArray(geometry.coordinates)?geometry.coordinates:[];if(!polys.length)issues.push(makeIssue(ctx,'EMPTY_POLYGON',{path:'MultiPolygon'}));polys.forEach((poly,pi)=>issues.push(...validatePolygonPart(ctx,poly,pi)));
    for(let a=0;a<polys.length;a++)for(let b=a+1;b<polys.length;b++){const overlap=polygonPartsOverlap(polys[a],polys[b]);if(overlap)issues.push(makeIssue(ctx,'MULTIPOLYGON_PARTS_OVERLAP',{path:`Polygon parts ${a+1} and ${b+1}`,geometryPath:{polygonIndex:a,otherPolygonIndex:b},location:overlap.location||null,repair:{action:'make_valid',risk:'review'}}));}
  }
  if(options.rules?.lineSelfIntersections&&lineType(geometry.type)){
    const parts=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates||[];parts.forEach((line,li)=>{const self=selfIntersections(line,{closed:false});if(self.hits.length)issues.push(makeIssue(ctx,'LINE_SELF_INTERSECTION',{path:geometry.type==='LineString'?'Line':`Line part ${li+1}`,geometryPath:{lineIndex:li,segments:self.hits[0].segments},location:self.hits[0].location,rule:'lineSelfIntersections'}));});
  }
  return featureResult(feature,index,issues);
}
function featureResult(feature,index,issues){let status='ready';for(const issue of issues)if(STATUS_RANK[issue.risk]>STATUS_RANK[status])status=issue.risk;return {featureId:feature?.id??`feature-${index+1}`,featureIndex:index,featureName:featureName(feature,index),geometryType:feature?.geometry?.type||'',status,issueCount:issues.length,issues};}
function appendCollectionRules(fc,featureResults,options){
  const issues=[];const byId=new Map(featureResults.map(r=>[String(r.featureId),r]));const addIssue=(feature,index,code,extra={})=>{const id=feature?.id??`feature-${index+1}`,ctx={featureId:id,featureIndex:index,featureName:featureName(feature,index),geometryType:feature?.geometry?.type||'',nextIssue:(byId.get(String(id))?.issues.length||0)+issues.length};const issue=makeIssue(ctx,code,extra);issues.push(issue);const result=byId.get(String(id));if(result){result.issues.push(issue);result.issueCount++;if(STATUS_RANK[issue.risk]>STATUS_RANK[result.status])result.status=issue.risk;}};
  if(options.rules?.duplicateFeatures){const seen=new Map();(fc.features||[]).forEach((f,i)=>{const key=exactGeometryKey(f.geometry);if(!key)return;if(seen.has(key)){const other=seen.get(key);addIssue(f,i,'DUPLICATE_FEATURE',{path:featureName(f,i),detail:`This feature has exactly the same geometry as ${featureName(other.feature,other.index)}.`,rule:'duplicateFeatures'});}else seen.set(key,{feature:f,index:i});});}
  if(options.rules?.danglingEndpoints){
    const endpoints=[];(fc.features||[]).forEach((f,i)=>{const g=f.geometry;if(!lineType(g?.type))return;const parts=g.type==='LineString'?[g.coordinates]:g.coordinates||[];parts.forEach((line,li)=>{const valid=(line||[]).filter(finiteCoord);if(valid.length>=2){endpoints.push({feature:f,index:i,lineIndex:li,kind:'start',point:valid[0]});endpoints.push({feature:f,index:i,lineIndex:li,kind:'end',point:valid[valid.length-1]});}});});
    const counts=new Map();endpoints.forEach(e=>counts.set(coordKey(e.point),(counts.get(coordKey(e.point))||0)+1));endpoints.forEach(e=>{if((counts.get(coordKey(e.point))||0)<2)addIssue(e.feature,e.index,'DANGLING_LINE_ENDPOINT',{path:`Line part ${e.lineIndex+1} · ${e.kind}`,location:e.point,geometryPath:{lineIndex:e.lineIndex,endpoint:e.kind},rule:'danglingEndpoints'});});
  }
  return issues;
}
function summarise(featureResults){const counts={checked:featureResults.length,ready:0,safe:0,review:0,manual:0,issues:0};featureResults.forEach(r=>{counts[r.status]=(counts[r.status]||0)+1;counts.issues+=r.issueCount;});return counts;}
function collectionStats(fc){const types={Point:0,MultiPoint:0,LineString:0,MultiLineString:0,Polygon:0,MultiPolygon:0,Other:0};let vertices=0;for(const f of fc.features||[]){const t=f?.geometry?.type;types[t]!==undefined?types[t]++:types.Other++;vertices+=geometryVertexCount(f?.geometry);}return {features:(fc.features||[]).length,vertices,types};}
function validateCollection(collection,options={}){
  const fc={type:'FeatureCollection',features:Array.isArray(collection?.features)?collection.features:[]};const featureResults=fc.features.map((f,i)=>validateFeature(f,i,options));const extra=appendCollectionRules(fc,featureResults,options);const issues=featureResults.flatMap(r=>r.issues);return {version:VERSION,engine:{name:'EditPolygon Geometry Health',version:VERSION,mode:'deterministic browser validation'},counts:summarise(featureResults),stats:collectionStats(fc),featureResults,issues,rules:clone(options.rules||{}),extraIssueCount:extra.length};
}
function removeConsecutive(coords){const out=[];for(const c of coords||[]){if(!finiteCoord(c)){out.push(c);continue;}const p=coord(c);if(!out.length||!finiteCoord(out[out.length-1])||!sameCoord(out[out.length-1],p))out.push(p);}return out;}
function normaliseClosedRing(ring,{windingRole}={}){
  let out=removeConsecutive(ring).filter(finiteCoord);if(!out.length)return out;
  while(out.length>2&&sameCoord(out[out.length-1],out[0])&&sameCoord(out[out.length-2],out[0]))out.splice(out.length-2,1);
  const closed=sameCoord(out[0],out[out.length-1]);if(closed)out[out.length-1]=coord(out[0]);
  if(windingRole&&out.length>=3){const a=ringArea(out),reverse=(windingRole==='shell'&&a<0)||(windingRole==='hole'&&a>0);if(reverse){const body=closed?out.slice(0,-1):out.slice();body.reverse();out=body;if(closed&&out.length)out.push(coord(out[0]));}}
  return out;
}
function safeRepairGeometry(geometry){
  if(!geometry||!supportedType(geometry.type))return {geometry:clone(geometry),changes:[]};const changes=[];let g=clone(geometry);
  const cleanLine=line=>{const before=JSON.stringify(line),after=removeConsecutive(line);if(JSON.stringify(after)!==before)changes.push('Removed repeated neighbouring vertices');return after;};
  if(g.type==='MultiPoint'){
    const seen=new Set(),out=[];for(const p of g.coordinates||[]){if(!finiteCoord(p)){out.push(p);continue;}const key=coordKey(p);if(seen.has(key)){changes.push('Removed an exact duplicate point');continue;}seen.add(key);out.push(coord(p));}g.coordinates=out;
  }else if(g.type==='LineString')g.coordinates=cleanLine(g.coordinates);
  else if(g.type==='MultiLineString')g.coordinates=(g.coordinates||[]).map(cleanLine);
  else if(g.type==='Polygon')g.coordinates=(g.coordinates||[]).map((ring,ri)=>{const before=JSON.stringify(ring),after=normaliseClosedRing(ring,{windingRole:ri===0?'shell':'hole'});if(JSON.stringify(after)!==before)changes.push(ri===0?'Normalised outer-boundary vertices and direction':'Normalised hole vertices and direction');return after;});
  else if(g.type==='MultiPolygon')g.coordinates=(g.coordinates||[]).map(poly=>(poly||[]).map((ring,ri)=>{const before=JSON.stringify(ring),after=normaliseClosedRing(ring,{windingRole:ri===0?'shell':'hole'});if(JSON.stringify(after)!==before)changes.push(ri===0?'Normalised outer-boundary vertices and direction':'Normalised hole vertices and direction');return after;}));
  return {geometry:g,changes:[...new Set(changes)]};
}
function safeRepairCollection(collection){
  const fc={type:'FeatureCollection',features:clone(collection?.features||[])},changeLog=[];fc.features=fc.features.map((feature,index)=>{const repaired=safeRepairGeometry(feature.geometry);if(repaired.changes.length)changeLog.push({featureId:feature.id??`feature-${index+1}`,featureName:featureName(feature,index),risk:'safe',changes:repaired.changes});return {...feature,geometry:repaired.geometry};});return {collection:fc,changeLog};
}
function geometryMetrics(geometry){
  const bbox=bboxOfGeometry(geometry);return {type:geometry?.type||null,vertices:geometryVertexCount(geometry),bbox};
}
const api={VERSION,version:VERSION,STATUS_RANK,clone,finiteCoord,sameCoord,coordKey,supportedType,pointType,lineType,polygonType,ringArea,selfIntersections,pointInRing,ringsIntersect,properRingsIntersect,pointStrictlyInRing,bboxOfGeometry,geometryVertexCount,exactGeometryKey,issueDefinition,validateFeature,validateCollection,safeRepairGeometry,safeRepairCollection,geometryMetrics};
global.EditPolygonGeometryHealthCore=Object.freeze(api);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
