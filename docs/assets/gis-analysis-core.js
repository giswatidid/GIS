(function(global){
'use strict';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
const fmt=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:3});
function compare(value,op,target,target2){
  if(op==='empty')return value==null||value==='';
  if(op==='notempty')return value!=null&&value!=='';
  const aText=String(value??''),bText=String(target??'');
  if(op==='contains')return aText.toLowerCase().includes(bText.toLowerCase());
  if(op==='notcontains')return !aText.toLowerCase().includes(bText.toLowerCase());
  if(op==='starts')return aText.toLowerCase().startsWith(bText.toLowerCase());
  if(op==='ends')return aText.toLowerCase().endsWith(bText.toLowerCase());
  if(op==='eq')return aText===bText;
  if(op==='neq')return aText!==bText;
  if(op==='in')return String(target??'').split(',').map(v=>v.trim()).includes(aText);
  const a=number(value),b=number(target),c=number(target2);
  if(a==null||b==null)return false;
  if(op==='gt')return a>b;
  if(op==='gte')return a>=b;
  if(op==='lt')return a<b;
  if(op==='lte')return a<=b;
  if(op==='between')return c!=null&&a>=Math.min(b,c)&&a<=Math.max(b,c);
  return false;
}
function selectByAttribute(features,rule){
  if(!rule?.field)return [];
  return (features||[]).filter(feature=>compare(feature.properties?.[rule.field],rule.op||'eq',rule.value,rule.value2)).map(feature=>feature.id);
}
function median(sorted){const n=sorted.length;if(!n)return null;const i=Math.floor(n/2);return n%2?sorted[i]:(sorted[i-1]+sorted[i])/2;}
function percentile(sorted,p){if(!sorted.length)return null;const idx=(sorted.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);}
function statistics(features,field){
  const rows=features||[],values=rows.map(f=>f.properties?.[field]);
  const populated=values.filter(v=>v!==null&&v!==undefined&&v!=='');
  const nums=populated.map(number).filter(v=>v!=null).sort((a,b)=>a-b);
  const counts=new Map();for(const value of populated){const key=String(value);counts.set(key,(counts.get(key)||0)+1);}
  const unique=[...counts.entries()].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value,undefined,{numeric:true}));
  const result={field,total:rows.length,populated:populated.length,missing:rows.length-populated.length,uniqueCount:counts.size,numericCount:nums.length,nonNumericCount:populated.length-nums.length,topValues:unique.slice(0,20)};
  if(nums.length){
    const sum=nums.reduce((s,v)=>s+v,0),mean=sum/nums.length;
    const variance=nums.reduce((s,v)=>s+(v-mean)*(v-mean),0)/nums.length;
    Object.assign(result,{min:nums[0],max:nums[nums.length-1],sum,mean,median:median(nums),stddev:Math.sqrt(variance),q1:percentile(nums,.25),q3:percentile(nums,.75)});
  }
  return result;
}
function bboxOfGeometry(geometry){
  if(!geometry)return null;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const walk=value=>{if(!Array.isArray(value))return;if(value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]))){const x=Number(value[0]),y=Number(value[1]);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;return;}for(const child of value)walk(child);};
  if(geometry.type==='GeometryCollection')for(const item of geometry.geometries||[])walk(item.coordinates);else walk(geometry.coordinates);
  return Number.isFinite(minX)?[minX,minY,maxX,maxY]:null;
}
function intersectsBbox(a,b){return !!(a&&b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]);}
function buildSpatialIndex(features,{cellCount}={}){
  const entries=[];let bounds=null;
  for(const feature of features||[]){const bbox=feature.bbox||bboxOfGeometry(feature.geometry);if(!bbox)continue;entries.push({id:feature.id,bbox});bounds=bounds?[Math.min(bounds[0],bbox[0]),Math.min(bounds[1],bbox[1]),Math.max(bounds[2],bbox[2]),Math.max(bounds[3],bbox[3])]:bbox.slice();}
  if(!bounds)return {version:1,bounds:null,cols:1,rows:1,cells:{},entries:[]};
  const count=Math.max(1,entries.length),side=Math.max(1,Math.min(64,Math.round(cellCount||Math.sqrt(count/6)||1))),cols=side,rows=side;
  const width=Math.max(1e-12,bounds[2]-bounds[0]),height=Math.max(1e-12,bounds[3]-bounds[1]),cells={};
  const cellX=x=>Math.max(0,Math.min(cols-1,Math.floor((x-bounds[0])/width*cols)));
  const cellY=y=>Math.max(0,Math.min(rows-1,Math.floor((y-bounds[1])/height*rows)));
  entries.forEach((entry,index)=>{const x0=cellX(entry.bbox[0]),x1=cellX(entry.bbox[2]),y0=cellY(entry.bbox[1]),y1=cellY(entry.bbox[3]);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=`${x}:${y}`;(cells[key]||(cells[key]=[])).push(index);}});
  return {version:1,bounds,cols,rows,cells,entries};
}
function querySpatialIndex(index,bbox){
  if(!index?.bounds||!bbox||!intersectsBbox(index.bounds,bbox))return [];
  const {bounds,cols,rows,cells,entries}=index,width=Math.max(1e-12,bounds[2]-bounds[0]),height=Math.max(1e-12,bounds[3]-bounds[1]);
  const cellX=x=>Math.max(0,Math.min(cols-1,Math.floor((x-bounds[0])/width*cols)));
  const cellY=y=>Math.max(0,Math.min(rows-1,Math.floor((y-bounds[1])/height*rows)));
  const x0=cellX(bbox[0]),x1=cellX(bbox[2]),y0=cellY(bbox[1]),y1=cellY(bbox[3]),seen=new Set(),out=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const i of cells[`${x}:${y}`]||[]){if(seen.has(i))continue;seen.add(i);const entry=entries[i];if(intersectsBbox(entry.bbox,bbox))out.push(entry.id);}
  return out;
}

// Query a longitude-periodic spatial index for map display. Web maps repeat the
// world horizontally, while project geometry deliberately keeps continuous
// longitudes so edits can move through adjacent world copies. A viewport at
// 850°E is therefore visually equivalent to one at 130°E. Query only the
// shifted viewport copies that can intersect the index bounds and de-duplicate
// feature ids. This preserves viewport culling without making features vanish
// after repeated world pans.
function querySpatialIndexWrapped(index,bbox,{period=360,maxCopies=64}={}){
  if(!index?.bounds||!bbox)return [];
  const view=bbox.map(Number),bounds=index.bounds.map(Number),p=Number(period);
  if(view.some(v=>!Number.isFinite(v))||bounds.some(v=>!Number.isFinite(v))||!Number.isFinite(p)||p<=0)return querySpatialIndex(index,bbox);
  if(view[3]<bounds[1]||view[1]>bounds[3])return [];
  const west=Math.min(view[0],view[2]),east=Math.max(view[0],view[2]),width=east-west;
  // If the padded viewport spans an entire world, longitude culling has no
  // value. Keep the latitude window but query the index's full x range once.
  if(width>=p-1e-9)return querySpatialIndex(index,[bounds[0],view[1],bounds[2],view[3]]);
  const first=Math.ceil((bounds[0]-east)/p),last=Math.floor((bounds[2]-west)/p);
  if(last<first)return [];
  if(last-first+1>Math.max(1,Number(maxCopies)||64))return querySpatialIndex(index,[bounds[0],view[1],bounds[2],view[3]]);
  const seen=new Set(),out=[];
  for(let k=first;k<=last;k++){
    const shifted=[west+k*p,view[1],east+k*p,view[3]];
    for(const id of querySpatialIndex(index,shifted))if(!seen.has(id)){seen.add(id);out.push(id);}
  }
  return out;
}
function applySelectionMode(current,matches,mode='replace'){
  const before=new Set(current||[]),found=new Set(matches||[]);
  if(mode==='add'){for(const id of found)before.add(id);}
  else if(mode==='remove'){for(const id of found)before.delete(id);}
  else if(mode==='intersect'){for(const id of [...before])if(!found.has(id))before.delete(id);}
  else return [...found];
  return [...before];
}
function expressionPreview(expression,features,calculate,limit=5){
  return (features||[]).slice(0,limit).map((feature,index)=>({id:feature.id,value:calculate(expression,feature.properties||{},index)}));
}
const api={version:'1.48.1',clone,fmt,compare,selectByAttribute,statistics,bboxOfGeometry,intersectsBbox,buildSpatialIndex,querySpatialIndex,querySpatialIndexWrapped,applySelectionMode,expressionPreview};
global.EditPolygonGISAnalysisCore=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
