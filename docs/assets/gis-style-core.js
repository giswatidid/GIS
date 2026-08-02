(function(global){
'use strict';

const TYPES=new Set(['single','categorized','graduated','continuous']);
const TARGETS=new Set(['color','radius','weight']);
const METHODS=new Set(['equalInterval','quantile','manual']);
const HEX=/^#[0-9a-f]{6}$/i;
const DEFAULT_SYMBOL=Object.freeze({
  color:'#1664d6',
  fillColor:'#1664d6',
  weight:2,
  fillOpacity:0.35,
  opacity:1,
  radius:5
});
const DEFAULT_NULL_SYMBOL=Object.freeze({
  color:'#8b95a5',
  fillColor:'#b6bec9',
  weight:1.5,
  fillOpacity:0.5,
  opacity:0.85,
  radius:5
});
const PALETTES=Object.freeze({
  Blues:['#eff3ff','#08519c'],
  Greens:['#edf8e9','#006d2c'],
  Heat:['#ffffcc','#fd8d3c','#800026'],
  Viridis:['#440154','#21918c','#fde725'],
  'Blue–red':['#2166ac','#f7f7f7','#b2182b'],
  Purple:['#f2f0f7','#54278f']
});

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
const finite=value=>Number.isFinite(Number(value));
const numberOr=(value,fallback)=>finite(value)?Number(value):fallback;
const validColor=value=>typeof value==='string'&&HEX.test(value.trim());
const colorOr=(value,fallback)=>validColor(value)?value.toLowerCase():fallback;
const categoryKey=value=>value==null?'null:':`${typeof value}:${String(value)}`;

function geometryFamily(types){
  const set=new Set((types||[]).map(String));
  if([...set].every(type=>type==='Point'||type==='MultiPoint'))return 'point';
  if([...set].every(type=>type==='LineString'||type==='MultiLineString'))return 'line';
  if([...set].every(type=>type==='Polygon'||type==='MultiPolygon'))return 'polygon';
  return 'mixed';
}

function rgb(hex){
  const value=parseInt(hex.slice(1),16);
  return [(value>>16)&255,(value>>8)&255,value&255];
}
function hex(values){return `#${values.map(value=>Math.round(clamp(value,0,255)).toString(16).padStart(2,'0')).join('')}`;}
function interpolateColor(a,b,t){
  const left=rgb(colorOr(a,'#000000')),right=rgb(colorOr(b,'#ffffff'));
  return hex(left.map((value,index)=>value+(right[index]-value)*clamp(t,0,1)));
}
function colorAtRamp(ramp,t){
  const colors=(Array.isArray(ramp)?ramp:[]).filter(validColor);
  if(!colors.length)return '#1664d6';
  if(colors.length===1)return colors[0].toLowerCase();
  const scaled=clamp(t,0,1)*(colors.length-1),index=Math.min(colors.length-2,Math.floor(scaled));
  return interpolateColor(colors[index],colors[index+1],scaled-index);
}
function colorsForCount(ramp,count){
  count=Math.max(1,Math.round(count)||1);
  return Array.from({length:count},(_,index)=>colorAtRamp(ramp,count===1?0.5:index/(count-1)));
}
function fmt(value){
  const number=Number(value);
  if(!Number.isFinite(number))return String(value??'');
  return number.toLocaleString(undefined,{maximumFractionDigits:6});
}
function isMissing(value){return value==null||value==='';}
function numericValues(features,field){
  return (features||[]).map(feature=>feature?.properties?.[field]).filter(value=>!isMissing(value)).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
}
function fieldSummary(features,field){
  const values=[],numbers=[],categories=new Map();let missing=0,invalidNumeric=0;
  for(const feature of features||[]){
    const value=feature?.properties?.[field];
    if(isMissing(value)){missing++;continue;}
    values.push(value);
    categories.set(categoryKey(value),{value,count:(categories.get(categoryKey(value))?.count||0)+1});
    const number=Number(value);
    if(Number.isFinite(number))numbers.push(number);else invalidNumeric++;
  }
  numbers.sort((a,b)=>a-b);
  const sum=numbers.reduce((total,value)=>total+value,0);
  return {
    count:(features||[]).length,
    nonNull:values.length,
    missing,
    invalidNumeric,
    numericCount:numbers.length,
    min:numbers.length?numbers[0]:null,
    max:numbers.length?numbers[numbers.length-1]:null,
    mean:numbers.length?sum/numbers.length:null,
    uniqueCount:categories.size,
    categories:[...categories.values()].sort((a,b)=>b.count-a.count||String(a.value).localeCompare(String(b.value),undefined,{numeric:true}))
  };
}
function quantile(sorted,p){
  if(!sorted.length)return null;
  if(sorted.length===1)return sorted[0];
  const position=(sorted.length-1)*clamp(p,0,1),lower=Math.floor(position),upper=Math.ceil(position);
  if(lower===upper)return sorted[lower];
  return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}
function uniqueSorted(values){return [...new Set(values.filter(Number.isFinite).map(Number))].sort((a,b)=>a-b);}
function classBoundaries(values,method,classCount,manualBreaks){
  const sorted=uniqueSorted(values.length?values:[]);
  if(!sorted.length)return [];
  const min=values[0],max=values[values.length-1];
  if(min===max)return [max];
  classCount=Math.max(2,Math.min(9,Math.round(classCount)||5));
  let boundaries=[];
  if(method==='quantile'){
    boundaries=Array.from({length:classCount},(_,index)=>quantile(values,(index+1)/classCount));
  }else if(method==='manual'){
    boundaries=uniqueSorted((manualBreaks||[]).map(Number)).filter(value=>value>=min&&value<=max);
    if(!boundaries.length)throw new Error('Enter at least one numeric manual class boundary.');
  }else{
    boundaries=Array.from({length:classCount},(_,index)=>min+(max-min)*(index+1)/classCount);
  }
  boundaries=uniqueSorted(boundaries);
  if(boundaries.at(-1)<max)boundaries.push(max);
  boundaries[boundaries.length-1]=max;
  return boundaries;
}
function buildClasses(values,method,classCount,manualBreaks,ramp,target,outputRange){
  if(!values.length)return [];
  const boundaries=classBoundaries(values,method,classCount,manualBreaks);
  const min=values[0],colors=colorsForCount(ramp,boundaries.length),range=normaliseOutputRange(outputRange,target);
  const counts=Array(boundaries.length).fill(0);
  for(const value of values){
    const index=boundaries.findIndex(boundary=>value<=boundary);
    counts[index<0?boundaries.length-1:index]++;
  }
  let lower=min;
  return boundaries.map((upper,index)=>{
    const entry={min:lower,max:upper,label:lower===upper?fmt(lower):`${fmt(lower)} – ${fmt(upper)}`,count:counts[index]};
    if(target==='color')entry.color=colors[index];
    else entry.value=range[0]+(range[1]-range[0])*(boundaries.length===1?0.5:index/(boundaries.length-1));
    lower=upper;
    return entry;
  });
}
function normaliseOutputRange(range,target){
  const fallback=target==='radius'?[4,18]:[1,8];
  if(!Array.isArray(range)||range.length<2)return fallback;
  let min=numberOr(range[0],fallback[0]),max=numberOr(range[1],fallback[1]);
  if(max<min)[min,max]=[max,min];
  return target==='radius'?[clamp(min,1,80),clamp(max,1,80)]:[clamp(min,0,30),clamp(max,0,30)];
}
function normaliseSymbol(symbol,fallback=DEFAULT_SYMBOL){
  const source=symbol&&typeof symbol==='object'?symbol:{};
  return {
    color:colorOr(source.color,fallback.color),
    fillColor:colorOr(source.fillColor,source.color&&validColor(source.color)?source.color:fallback.fillColor),
    weight:clamp(numberOr(source.weight,fallback.weight),0,30),
    fillOpacity:clamp(numberOr(source.fillOpacity,fallback.fillOpacity),0,1),
    opacity:clamp(numberOr(source.opacity,fallback.opacity),0,1),
    radius:clamp(numberOr(source.radius,fallback.radius),1,80)
  };
}
function canonicalType(style){return TYPES.has(style?.type)?style.type:TYPES.has(style?.mode)?style.mode:'single';}
function normaliseStyle(input){
  const source=input&&typeof input==='object'?clone(input):{};
  const type=canonicalType(source),target=TARGETS.has(source.target)?source.target:'color';
  const symbol=normaliseSymbol(source.symbol||source,DEFAULT_SYMBOL);
  const nullSymbol=normaliseSymbol(source.nullSymbol,DEFAULT_NULL_SYMBOL);
  const output={version:1,type,target,symbol,nullSymbol};
  if(type!=='single')output.field=String(source.field||'');
  if(type==='categorized'){
    output.nullCount=Math.max(0,Math.round(numberOr(source.nullCount,0)));
    output.categories=(Array.isArray(source.categories)?source.categories:[]).slice(0,100).map((entry,index)=>({
      value:entry?.value,
      label:String(entry?.label??entry?.value??'(null)'),
      color:colorOr(entry?.color,colorAtRamp(source.colorRamp||PALETTES.Viridis,index/Math.max(1,(source.categories?.length||1)-1))),
      count:Math.max(0,Math.round(numberOr(entry?.count,0)))
    }));
    output.colorRamp=normaliseRamp(source.colorRamp||PALETTES.Viridis);
    output.otherSymbol=normaliseSymbol(source.otherSymbol,DEFAULT_NULL_SYMBOL);
  }else if(type==='graduated'){
    const legacyClasses=Array.isArray(source.classes)?source.classes:Array.isArray(source.breaks)?source.breaks:[];
    output.nullCount=Math.max(0,Math.round(numberOr(source.nullCount,0)));
    output.method=METHODS.has(source.method)?source.method:'equalInterval';
    output.classCount=Math.max(1,Math.min(9,Math.round(numberOr(source.classCount,legacyClasses.length||5))||5));
    output.colorRamp=normaliseRamp(source.colorRamp||[source.startColor||'#eff3ff',source.endColor||'#08519c']);
    output.outputRange=normaliseOutputRange(source.outputRange,target);
    output.manualBreaks=Array.isArray(source.manualBreaks)?source.manualBreaks.map(Number).filter(Number.isFinite):[];
    output.classes=legacyClasses.map((entry,index)=>{
      const item={
        min:numberOr(entry?.min,0),
        max:numberOr(entry?.max,0),
        label:String(entry?.label??`${fmt(entry?.min)} – ${fmt(entry?.max)}`),
        count:Math.max(0,Math.round(numberOr(entry?.count,0)))
      };
      if(target==='color')item.color=colorOr(entry?.color,colorAtRamp(output.colorRamp,index/Math.max(1,legacyClasses.length-1)));
      else item.value=numberOr(entry?.value,output.outputRange[0]);
      return item;
    });
  }else if(type==='continuous'){
    output.nullCount=Math.max(0,Math.round(numberOr(source.nullCount,0)));
    output.colorRamp=normaliseRamp(source.colorRamp||[source.startColor||'#eff3ff',source.endColor||'#08519c']);
    output.outputRange=normaliseOutputRange(source.outputRange,target);
    const range=source.valueRange&&typeof source.valueRange==='object'?source.valueRange:{};
    output.valueRange={min:numberOr(range.min,0),max:numberOr(range.max,1)};
  }
  return output;
}
function normaliseRamp(ramp){
  const colors=(Array.isArray(ramp)?ramp:[]).filter(validColor).map(color=>color.toLowerCase());
  return colors.length>=2?colors:['#eff3ff','#08519c'];
}
function buildStyle(config,features){
  const type=TYPES.has(config?.type)?config.type:'single';
  const target=TARGETS.has(config?.target)?config.target:'color';
  const field=String(config?.field||'');
  const symbol=normaliseSymbol(config?.symbol,DEFAULT_SYMBOL);
  const nullSymbol=normaliseSymbol(config?.nullSymbol,DEFAULT_NULL_SYMBOL);
  const colorRamp=normaliseRamp(config?.colorRamp||PALETTES.Blues);
  const base={version:1,type,target,symbol,nullSymbol};
  if(type==='single')return base;
  if(!field)throw new Error('Choose an attribute field for the data-driven style.');
  base.field=field;
  if(type==='categorized'){
    const summary=fieldSummary(features,field),categories=summary.categories.slice(0,50),colors=colorsForCount(colorRamp,categories.length);
    return {...base,colorRamp,nullCount:summary.missing,categories:categories.map((entry,index)=>({value:entry.value,label:String(entry.value),count:entry.count,color:colors[index]})),otherSymbol:normaliseSymbol(config?.otherSymbol,DEFAULT_NULL_SYMBOL)};
  }
  const summary=fieldSummary(features,field),values=numericValues(features,field);
  if(!values.length)throw new Error(`“${field}” does not contain numeric values.`);
  const nullCount=summary.missing+summary.invalidNumeric;
  if(type==='continuous'){
    return {...base,colorRamp,nullCount,outputRange:normaliseOutputRange(config?.outputRange,target),valueRange:{min:values[0],max:values.at(-1)}};
  }
  const method=METHODS.has(config?.method)?config.method:'equalInterval',classCount=Math.max(2,Math.min(9,Math.round(config?.classCount)||5));
  const manualBreaks=Array.isArray(config?.manualBreaks)?config.manualBreaks.map(Number).filter(Number.isFinite):[];
  const outputRange=normaliseOutputRange(config?.outputRange,target);
  return {...base,method,classCount,colorRamp,nullCount,outputRange,manualBreaks,classes:buildClasses(values,method,classCount,manualBreaks,colorRamp,target,outputRange)};
}
function validateStyle(input){
  const errors=[];
  if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,errors:['Style code must contain one JSON object.'],style:null};
  const style=normaliseStyle(input);
  if(!TYPES.has(style.type))errors.push('type must be single, categorized, graduated, or continuous.');
  if(style.type!=='single'&&!style.field)errors.push('field is required for a data-driven style.');
  if(!TARGETS.has(style.target))errors.push('target must be color, radius, or weight.');
  for(const [name,value] of Object.entries(style.symbol||{})){
    if((name==='color'||name==='fillColor')&&!validColor(value))errors.push(`symbol.${name} must be a six-digit hex colour.`);
    if(!['color','fillColor'].includes(name)&&!finite(value))errors.push(`symbol.${name} must be numeric.`);
  }
  if(style.type==='categorized'&&!style.categories.length)errors.push('categories must contain at least one category.');
  if(style.type==='graduated'){
    if(!METHODS.has(style.method))errors.push('method must be equalInterval, quantile, or manual.');
    if(!style.classes.length)errors.push('classes must contain at least one class.');
    style.classes.forEach((entry,index)=>{
      if(!finite(entry.min)||!finite(entry.max)||Number(entry.max)<Number(entry.min))errors.push(`classes[${index}] has an invalid min/max range.`);
      if(style.target==='color'&&!validColor(entry.color))errors.push(`classes[${index}].color must be a six-digit hex colour.`);
      if(style.target!=='color'&&!finite(entry.value))errors.push(`classes[${index}].value must be numeric.`);
    });
  }
  if(style.type==='continuous'){
    if(!finite(style.valueRange?.min)||!finite(style.valueRange?.max)||Number(style.valueRange.max)<Number(style.valueRange.min))errors.push('valueRange must contain numeric min and max values.');
    if(style.target==='color'&&style.colorRamp.length<2)errors.push('colorRamp must contain at least two colours.');
  }
  return {valid:errors.length===0,errors,style};
}
function syntaxPosition(message,text){
  const match=String(message||'').match(/position\s+(\d+)/i);
  if(!match)return null;
  const position=Math.max(0,Number(match[1])),before=String(text).slice(0,position),lines=before.split('\n');
  return {position,line:lines.length,column:lines.at(-1).length+1};
}
function parseStyleCode(text){
  try{
    const input=JSON.parse(String(text||'')),result=validateStyle(input);
    return {...result,syntax:null};
  }catch(error){
    const syntax=syntaxPosition(error.message,text);
    return {valid:false,style:null,syntax,errors:[syntax?`JSON error on line ${syntax.line}, column ${syntax.column}: ${error.message}`:`Invalid JSON: ${error.message}`]};
  }
}
function setTarget(style,target,value){
  const next={...style};
  if(target==='color'){
    const color=colorOr(value,style.fillColor||style.color||'#1664d6');
    next.color=color;next.fillColor=color;
  }else if(target==='radius')next.radius=clamp(numberOr(value,next.radius||5),1,80);
  else if(target==='weight')next.weight=clamp(numberOr(value,next.weight||2),0,30);
  return next;
}
function compileStyle(input){
  const result=validateStyle(input);
  if(!result.valid)throw new Error(result.errors.join(' '));
  const style=result.style;
  const categoryMap=style.type==='categorized'?new Map(style.categories.map(entry=>[categoryKey(entry.value),entry])):null;
  return function(properties,geometryType,baseStyle){
    const base={...normaliseSymbol(baseStyle,style.symbol),...style.symbol};
    if(style.type==='single')return base;
    const raw=properties?.[style.field];
    if(isMissing(raw))return {...base,...style.nullSymbol};
    if(style.type==='categorized'){
      const entry=categoryMap.get(categoryKey(raw));
      return entry?setTarget(base,'color',entry.color):{...base,...style.otherSymbol};
    }
    const value=Number(raw);
    if(!Number.isFinite(value))return {...base,...style.nullSymbol};
    if(style.type==='continuous'){
      const min=Number(style.valueRange.min),max=Number(style.valueRange.max),t=max===min?0.5:(value-min)/(max-min);
      const output=style.target==='color'?colorAtRamp(style.colorRamp,t):style.outputRange[0]+(style.outputRange[1]-style.outputRange[0])*clamp(t,0,1);
      return setTarget(base,style.target,output);
    }
    const entry=style.classes.find((item,index)=>value>=Number(item.min)&&(index===style.classes.length-1?value<=Number(item.max):value<=Number(item.max)));
    if(!entry)return {...base,...style.nullSymbol};
    return setTarget(base,style.target,style.target==='color'?entry.color:entry.value);
  };
}
function legendModel(input){
  const style=normaliseStyle(input);
  const title=style.type==='single'?'All features':style.field;
  if(style.type==='single')return {title,type:'items',target:'color',entries:[{label:'All features',color:style.symbol.fillColor}]};
  if(style.type==='continuous')return {title,type:'continuous',target:style.target,min:style.valueRange.min,max:style.valueRange.max,colorRamp:style.colorRamp,outputRange:style.outputRange,nullCount:style.nullCount||0,nullSymbol:style.nullSymbol};
  if(style.type==='categorized')return {title,type:'items',target:'color',entries:style.categories.map(entry=>({label:entry.label,count:entry.count,color:entry.color})),nullCount:style.nullCount||0,nullSymbol:style.nullSymbol};
  return {title,type:'items',target:style.target,entries:style.classes.map(entry=>({label:entry.label,count:entry.count,color:entry.color,value:entry.value})),nullCount:style.nullCount||0,nullSymbol:style.nullSymbol};
}
function simpleConfig(input){
  const style=normaliseStyle(input),ramp=style.colorRamp||PALETTES.Blues;
  return {
    type:style.type,
    field:style.field||'',
    target:style.target||'color',
    method:style.method||'equalInterval',
    classCount:style.classCount||Math.max(2,style.classes?.length||5),
    manualBreaks:(style.manualBreaks?.length?style.manualBreaks:(style.classes||[]).map(entry=>entry.max)).join(', '),
    startColor:ramp[0]||'#eff3ff',
    endColor:ramp.at(-1)||'#08519c',
    outputMin:style.outputRange?.[0]??(style.target==='radius'?4:1),
    outputMax:style.outputRange?.[1]??(style.target==='radius'?18:8),
    symbol:style.symbol,
    nullSymbol:style.nullSymbol
  };
}
function stringifyStyle(input){return JSON.stringify(normaliseStyle(input),null,2);}

const api={
  TYPES:[...TYPES],TARGETS:[...TARGETS],METHODS:[...METHODS],PALETTES,DEFAULT_SYMBOL,DEFAULT_NULL_SYMBOL,
  geometryFamily,validColor,interpolateColor,colorAtRamp,colorsForCount,fieldSummary,numericValues,
  buildStyle,normaliseStyle,validateStyle,parseStyleCode,compileStyle,legendModel,simpleConfig,stringifyStyle,fmt,clone
};
global.EditPolygonGISStyleCore=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
