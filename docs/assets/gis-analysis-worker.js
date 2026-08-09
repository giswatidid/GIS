'use strict';
let turfReady=false;
function ensureTurf(){
  if(turfReady&&self.turf)return;
  if(!self.turf)importScripts('https://unpkg.com/@turf/turf@7.2.0/turf.min.js');
  if(!self.turf)throw new Error('The geometry engine could not be loaded in the worker.');
  turfReady=true;
}
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const fc=features=>({type:'FeatureCollection',features:(features||[]).filter(Boolean)});
function polygonal(feature){return feature&&['Polygon','MultiPolygon'].includes(feature.geometry?.type);}
function unionFeatures(features,onProgress){
  const polygons=(features||[]).filter(polygonal);if(!polygons.length)return [];
  let current=polygons[0];for(let i=1;i<polygons.length;i++){try{current=self.turf.union(fc([current,polygons[i]]))||current;}catch(_){ }if(i%5===0)onProgress(i,polygons.length);}
  onProgress(polygons.length,polygons.length);return current?[current]:[];
}
function polygonBoundary(mask){
  const geometry=mask?.geometry,lines=[];if(!geometry)return null;
  if(geometry.type==='Polygon')lines.push(...(geometry.coordinates||[]));
  else if(geometry.type==='MultiPolygon')for(const polygon of geometry.coordinates||[])lines.push(...polygon);
  if(!lines.length)return null;
  return lines.length===1?self.turf.lineString(lines[0]):self.turf.multiLineString(lines);
}
function clipFeature(feature,mask,boundary){
  const type=feature?.geometry?.type,properties=clone(feature?.properties||{});if(!type)return [];
  if(type==='Polygon'||type==='MultiPolygon'){
    const result=self.turf.intersect(fc([feature,mask]));if(result){result.properties=properties;return [result];}return [];
  }
  if(type==='Point')return self.turf.booleanPointInPolygon(feature,mask)?[{...clone(feature),properties}]:[];
  if(type==='MultiPoint'){
    const coordinates=(feature.geometry.coordinates||[]).filter(coord=>self.turf.booleanPointInPolygon(self.turf.point(coord),mask));
    return coordinates.length?[{type:'Feature',properties,geometry:{type:'MultiPoint',coordinates}}]:[];
  }
  if(type==='LineString'||type==='MultiLineString'){
    const inputs=type==='LineString'?[feature]:(feature.geometry.coordinates||[]).map(coordinates=>self.turf.lineString(coordinates,properties)),inside=[];
    for(const line of inputs){
      let parts=[];try{parts=boundary?(self.turf.lineSplit(line,boundary).features||[]):[];}catch(_){ }
      if(!parts.length)parts=[line];
      for(const part of parts){
        try{
          const length=self.turf.length(part,{units:'kilometers'}),probe=length>0?self.turf.along(part,length/2,{units:'kilometers'}):self.turf.pointOnFeature(part);
          if(self.turf.booleanPointInPolygon(probe,mask))inside.push(part.geometry.coordinates);
        }catch(_){ }
      }
    }
    if(!inside.length)return [];
    return [{type:'Feature',properties,geometry:inside.length===1?{type:'LineString',coordinates:inside[0]}:{type:'MultiLineString',coordinates:inside}}];
  }
  return [];
}
function run(task,onProgress){
  ensureTurf();const operation=task.operation,source=task.features||[],params=task.params||{};
  if(operation==='buffer'){
    const distance=Number(params.distance);if(!Number.isFinite(distance)||distance===0)throw new Error('Enter a non-zero buffer distance.');
    const out=[];source.forEach((feature,index)=>{const result=self.turf.buffer(feature,distance,{units:params.units||'kilometers',steps:Math.max(8,Number(params.steps)||16)});if(result){result.properties={...(feature.properties||{})};out.push(result);}if(index%10===0)onProgress(index+1,source.length);});onProgress(source.length,source.length);return out;
  }
  if(operation==='dissolve'||operation==='union')return unionFeatures(source,onProgress);
  if(operation==='clip'||operation==='intersection'){
    const masks=(task.overlayFeatures||[]).filter(polygonal);if(!masks.length)throw new Error('Choose a polygon overlay layer.');
    const unionMask=unionFeatures(masks,()=>{})[0];if(!unionMask)throw new Error('The overlay layer did not contain usable polygons.');
    const boundary=polygonBoundary(unionMask),out=[];
    source.forEach((feature,index)=>{try{out.push(...clipFeature(feature,unionMask,boundary));}catch(_){ }if(index%10===0)onProgress(index+1,source.length);});
    onProgress(source.length,source.length);return out;
  }
  throw new Error(`Unsupported worker operation: ${operation}`);
}
self.onmessage=event=>{
  const {id,task}=event.data||{};
  try{const features=run(task,(done,total)=>self.postMessage({id,type:'progress',done,total}));self.postMessage({id,type:'result',features});}
  catch(error){self.postMessage({id,type:'error',message:error?.message||String(error)});}
};
