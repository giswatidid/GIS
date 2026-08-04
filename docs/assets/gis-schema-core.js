(function(global){
'use strict';

const VERSION='1.52.0';
const FIELD_TYPES=Object.freeze(['text','integer','decimal','boolean','date','datetime']);
const TYPE_LABELS=Object.freeze({text:'Text',integer:'Integer',decimal:'Decimal',boolean:'Boolean',date:'Date',datetime:'Date & time'});
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const isNull=value=>value===null||value===undefined;
const isBlank=value=>isNull(value)||value==='';
const safeName=value=>String(value??'').trim();
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
const dateTime=/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function validDateString(value,datetime=false){
  const text=String(value??'').trim();
  if(!(datetime?dateTime:dateOnly).test(text))return false;
  const parsed=new Date(datetime?text:`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime());
}
function hasLeadingZero(text){return /^[-+]?0\d+/.test(text)&&!/^[-+]?0(?:\.\d+)?$/.test(text);}
function inferType(values){
  const populated=(values||[]).filter(value=>!isBlank(value));
  if(!populated.length)return 'text';
  if(populated.every(value=>typeof value==='boolean'))return 'boolean';
  if(populated.every(value=>typeof value==='number'&&Number.isFinite(value)))return populated.every(Number.isInteger)?'integer':'decimal';
  if(populated.every(value=>typeof value==='string')){
    const strings=populated.map(value=>value.trim());
    if(strings.every(value=>validDateString(value,false)))return 'date';
    if(strings.every(value=>validDateString(value,true)))return 'datetime';
    const bool=/^(true|false|yes|no)$/i;if(strings.every(value=>bool.test(value)))return 'boolean';
    const nums=strings.map(value=>Number(value));
    if(nums.every(Number.isFinite)&&strings.every(value=>!hasLeadingZero(value))){return nums.every(Number.isInteger)?'integer':'decimal';}
  }
  return 'text';
}
function defaultForType(type){return type==='boolean'?false:type==='integer'||type==='decimal'?0:type==='text'?'':null;}
function toDateValue(value,datetime){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return datetime?value.toISOString():value.toISOString().slice(0,10);
  const text=String(value??'').trim();
  if(!text)return null;
  if(!validDateString(text,datetime))return null;
  if(datetime){const normalized=text.includes(' ')?text.replace(' ','T'):text;const date=new Date(normalized);return date.toISOString();}
  return text.slice(0,10);
}
function coerce(value,type,options={}){
  type=FIELD_TYPES.includes(type)?type:'text';
  const nullable=options.nullable!==false;
  if(isNull(value))return nullable?{ok:true,value:null}:{ok:false,value:null,error:'Value is required.'};
  if(typeof value==='string'&&value===''&&type!=='text')return nullable?{ok:true,value:null}:{ok:false,value:null,error:'Value is required.'};
  if(type==='text')return {ok:true,value:String(value)};
  if(type==='integer'){
    if(typeof value==='string'&&!value.trim())return nullable?{ok:true,value:null}:{ok:false,value:null,error:'Value is required.'};
    const number=Number(value);return Number.isFinite(number)&&Number.isInteger(number)?{ok:true,value:number}:{ok:false,value:null,error:'Expected a whole number.'};
  }
  if(type==='decimal'){
    if(typeof value==='string'&&!value.trim())return nullable?{ok:true,value:null}:{ok:false,value:null,error:'Value is required.'};
    const number=Number(value);return Number.isFinite(number)?{ok:true,value:number}:{ok:false,value:null,error:'Expected a number.'};
  }
  if(type==='boolean'){
    if(typeof value==='boolean')return {ok:true,value};
    if(value===1||value==='1')return {ok:true,value:true};if(value===0||value==='0')return {ok:true,value:false};
    const text=String(value).trim().toLowerCase();
    if(['true','yes','y'].includes(text))return {ok:true,value:true};if(['false','no','n'].includes(text))return {ok:true,value:false};
    return {ok:false,value:null,error:'Expected true or false.'};
  }
  const date=toDateValue(value,type==='datetime');
  return date!==null?{ok:true,value:date}:{ok:false,value:null,error:type==='datetime'?'Expected a valid date and time.':'Expected a valid date.'};
}
function normaliseField(raw,index=0){
  const type=FIELD_TYPES.includes(raw?.type)?raw.type:'text';
  const name=safeName(raw?.name)||`field_${index+1}`;
  const required=!!raw?.required;
  const nullable=required?false:raw?.nullable!==false;
  const suppliedDefault=raw&&Object.prototype.hasOwnProperty.call(raw,'defaultValue')?raw.defaultValue:defaultForType(type);
  const defaultResult=coerce(suppliedDefault,type,{nullable});
  return {name,alias:safeName(raw?.alias)||name,type,description:String(raw?.description??''),nullable,required,readOnly:!!raw?.readOnly,defaultValue:defaultResult.ok?defaultResult.value:(nullable?null:defaultForType(type)),system:!!raw?.system};
}
function inferSchema(features,existing=null){
  const order=[],values=new Map();
  for(const field of existing?.fields||[]){if(!values.has(field.name)){values.set(field.name,[]);order.push(field.name);}}
  for(const feature of features||[]){for(const [name,value] of Object.entries(feature?.properties||{})){if(!values.has(name)){values.set(name,[]);order.push(name);}values.get(name).push(value);}}
  if(!values.has('name')){values.set('name',(features||[]).map(feature=>feature?.name??''));order.unshift('name');}
  const previous=new Map((existing?.fields||[]).map(field=>[field.name,field]));
  const fields=order.map((name,index)=>{
    const prior=previous.get(name);if(prior)return normaliseField(prior,index);
    return normaliseField({name,alias:name,type:inferType(values.get(name)),nullable:true,required:false,readOnly:false,defaultValue:null,system:name==='name'},index);
  });
  if(!fields.some(field=>field.name==='name'))fields.unshift(normaliseField({name:'name',type:'text',system:true},0));
  const nameField=fields.find(field=>field.name==='name');nameField.type='text';nameField.system=true;nameField.nullable=false;nameField.required=true;
  return {version:1,fields,updatedAt:existing?.updatedAt||new Date().toISOString()};
}
function ensureLayerSchema(layer){
  if(!layer)return null;
  const schema=inferSchema(layer.features||[],layer.gisSchema||null);
  const known=new Set(schema.fields.map(field=>field.name));
  for(const feature of layer.features||[]){feature.properties=feature.properties||{};if(!('name' in feature.properties))feature.properties.name=feature.name||'Feature';for(const field of schema.fields){if(!(field.name in feature.properties))feature.properties[field.name]=clone(field.defaultValue);}}
  layer.gisSchema=schema;
  layer.gisSavedFilters=Array.isArray(layer.gisSavedFilters)?layer.gisSavedFilters.map(normaliseSavedFilter).filter(Boolean):[];
  if(layer.gisFilter)layer.gisFilter=normaliseFilter(layer.gisFilter,schema);
  return schema;
}
function fieldMap(schema){return new Map((schema?.fields||[]).map(field=>[field.name,field]));}
function getField(schema,name){return fieldMap(schema).get(name)||normaliseField({name,type:'text'});}
function validateValue(value,field){return coerce(value,field?.type||'text',{nullable:field?.nullable!==false&&!field?.required});}
function previewConversion(features,fieldName,nextField){
  const field=normaliseField(nextField);let populated=0,convertible=0,invalid=0,nulls=0;const examples=[];
  for(const feature of features||[]){const value=feature?.properties?.[fieldName];if(isNull(value)||value===''){nulls++;if(field.nullable&&!field.required)convertible++;else{invalid++;if(examples.length<5)examples.push({value,error:'Value is required.'});}continue;}populated++;const result=validateValue(value,field);if(result.ok)convertible++;else{invalid++;if(examples.length<5)examples.push({value,error:result.error});}}
  return {total:(features||[]).length,populated,nulls,convertible,invalid,examples,field};
}
function updateReferences(layer,from,to){
  const replaceRule=rule=>{if(!rule)return rule;if(Array.isArray(rule.conditions))rule.conditions.forEach(condition=>{if(condition.field===from)condition.field=to;});else if(rule.field===from)rule.field=to;return rule;};
  replaceRule(layer.gisFilter);for(const saved of layer.gisSavedFilters||[])replaceRule(saved.filter);
  if(layer.gisLabels?.field===from)layer.gisLabels.field=to;
  if(layer.gisStyle?.field===from)layer.gisStyle.field=to;
  if(layer.gisDisplayField===from)layer.gisDisplayField=to;
}
function normaliseCondition(condition,schema){
  const field=safeName(condition?.field),definition=getField(schema,field);
  return {field,op:String(condition?.op||'eq'),value:condition?.value??'',value2:condition?.value2??'',type:definition.type};
}
function normaliseFilter(filter,schema){
  if(!filter)return null;
  const conditions=Array.isArray(filter.conditions)?filter.conditions:[filter];
  const clean=conditions.map(condition=>normaliseCondition(condition,schema)).filter(condition=>condition.field);
  if(!clean.length)return null;
  return {version:1,logic:String(filter.logic).toLowerCase()==='or'?'or':'and',conditions:clean};
}
function normaliseSavedFilter(saved){
  if(!saved)return null;const name=safeName(saved.name);if(!name)return null;
  return {id:safeName(saved.id)||`filter_${Math.random().toString(36).slice(2,9)}`,name,filter:clone(saved.filter||null),createdAt:saved.createdAt||new Date().toISOString()};
}
function comparable(value,type){
  if(isNull(value)||value==='')return null;
  if(type==='integer'||type==='decimal'){const number=Number(value);return Number.isFinite(number)?number:null;}
  if(type==='boolean'){const result=coerce(value,'boolean');return result.ok?Number(result.value):null;}
  if(type==='date'||type==='datetime'){const result=coerce(value,type);return result.ok?Date.parse(result.value):null;}
  return String(value).toLocaleLowerCase();
}
function listValues(value){return String(value??'').split(',').map(item=>item.trim()).filter(Boolean);}
function compare(value,condition,field){
  const op=condition?.op||'eq',type=field?.type||condition?.type||'text';
  const empty=isNull(value)||value==='';if(op==='empty')return empty;if(op==='notempty')return !empty;if(empty)return false;
  if(type==='text'){
    const left=String(value),right=String(condition.value??''),a=left.toLocaleLowerCase(),b=right.toLocaleLowerCase();
    if(op==='contains')return a.includes(b);if(op==='notcontains')return !a.includes(b);if(op==='starts')return a.startsWith(b);if(op==='ends')return a.endsWith(b);
    if(op==='in')return listValues(condition.value).some(item=>a===item.toLocaleLowerCase());if(op==='eq')return a===b;if(op==='neq')return a!==b;
  }
  if(op==='in')return listValues(condition.value).some(item=>{const target=comparable(item,type),left=comparable(value,type);return left!==null&&target!==null&&left===target;});
  const left=comparable(value,type),right=comparable(condition.value,type),right2=comparable(condition.value2,type);
  if(left===null||right===null)return false;
  if(op==='eq')return left===right;if(op==='neq')return left!==right;if(op==='gt')return left>right;if(op==='gte')return left>=right;if(op==='lt')return left<right;if(op==='lte')return left<=right;
  if(op==='between')return right2!==null&&left>=Math.min(right,right2)&&left<=Math.max(right,right2);
  return false;
}
function matchesFilter(feature,filter,schema){
  const normal=normaliseFilter(filter,schema);if(!normal)return true;const fields=fieldMap(schema);
  const results=normal.conditions.map(condition=>compare(feature?.properties?.[condition.field],condition,fields.get(condition.field)));
  return normal.logic==='or'?results.some(Boolean):results.every(Boolean);
}
function filterIds(features,filter,schema){return (features||[]).filter(feature=>matchesFilter(feature,filter,schema)).map(feature=>feature.id);}
function compareValues(a,b,field){
  const left=comparable(a,field?.type||'text'),right=comparable(b,field?.type||'text');
  if(left===null&&right===null)return 0;if(left===null)return 1;if(right===null)return -1;
  return typeof left==='string'?left.localeCompare(right,undefined,{numeric:false,sensitivity:'base'}):left-right;
}
function sortRows(rows,sorts,schema){
  const fields=fieldMap(schema),rules=(sorts||[]).filter(rule=>rule?.field);
  if(!rules.length)return [...(rows||[])];
  return [...(rows||[])].sort((a,b)=>{for(const rule of rules){const av=a.properties?.[rule.field],bv=b.properties?.[rule.field],aNull=isNull(av)||av==='',bNull=isNull(bv)||bv==='';if(aNull!==bNull)return aNull?1:-1;const result=compareValues(av,bv,fields.get(rule.field));if(result)return result*(rule.dir<0?-1:1);}return 0;});
}
function displayValue(value,field){
  if(isNull(value))return '';
  if(field?.type==='boolean')return value?'true':'false';
  if(field?.type==='datetime'){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():String(value);}
  return String(value);
}

// Small, deterministic expression evaluator. It deliberately supports a compact
// GIS calculator language rather than evaluating arbitrary JavaScript.
function tokenize(source){
  const input=String(source??''),tokens=[];let i=0;
  while(i<input.length){const c=input[i];if(/\s/.test(c)){i++;continue;}
    if(c==='['){let j=i+1;while(j<input.length&&input[j]!==']')j++;if(j>=input.length)throw Error('Unclosed field reference.');tokens.push({type:'field',value:input.slice(i+1,j)});i=j+1;continue;}
    if(c==='"'||c==="'"){const quote=c;let text='',j=i+1;for(;j<input.length;j++){const ch=input[j];if(ch==='\\'){j++;const next=input[j];text+=next==='n'?'\n':next==='t'?'\t':next??'';continue;}if(ch===quote)break;text+=ch;}if(j>=input.length)throw Error('Unclosed string literal.');tokens.push({type:'literal',value:text});i=j+1;continue;}
    const number=input.slice(i).match(/^\d+(?:\.\d+)?(?:e[-+]?\d+)?/i);if(number){tokens.push({type:'literal',value:Number(number[0])});i+=number[0].length;continue;}
    const identifier=input.slice(i).match(/^(?:\$index|[A-Za-z_][A-Za-z0-9_]*)/);if(identifier){tokens.push({type:'identifier',value:identifier[0]});i+=identifier[0].length;continue;}
    const op=['===','!==','>=','<=','==','!=','&&','||','+','-','*','/','%','>','<','!','(',')',','].find(value=>input.startsWith(value,i));if(op){tokens.push({type:op==='('||op===')'||op===','?'punct':'operator',value:op});i+=op.length;continue;}
    throw Error(`Unexpected character “${c}”.`);
  }
  tokens.push({type:'eof',value:''});return tokens;
}
function evaluate(expression,properties={},index=0){
  const tokens=tokenize(expression);let position=0;const peek=()=>tokens[position],take=()=>tokens[position++];const accept=value=>peek().value===value?(take(),true):false;const expect=value=>{if(!accept(value))throw Error(`Expected “${value}”.`);};
  function primary(){const token=take();if(token.type==='literal')return token.value;if(token.type==='field')return properties?.[token.value]??null;if(token.type==='identifier'){
      const name=token.value.toLowerCase();if(name==='$index')return index+1;if(name==='true')return true;if(name==='false')return false;if(name==='null')return null;
      if(accept('(')){const args=[];if(!accept(')')){do{args.push(logicalOr());}while(accept(','));expect(')');}return call(name,args);}throw Error(`Unknown identifier “${token.value}”.`);
    }if(token.value==='('){const value=logicalOr();expect(')');return value;}throw Error('Expected a value.');}
  function unary(){if(peek().type==='operator'&&accept('!'))return !unary();if(peek().type==='operator'&&accept('-')){const value=Number(unary());return Number.isFinite(value)?-value:null;}if(peek().type==='operator'&&accept('+')){const value=Number(unary());return Number.isFinite(value)?value:null;}return primary();}
  function multiply(){let value=unary();while(['*','/','%'].includes(peek().value)){const op=take().value,right=unary(),a=Number(value),b=Number(right);value=!Number.isFinite(a)||!Number.isFinite(b)?null:op==='*'?a*b:op==='/'?(b===0?null:a/b):(b===0?null:a%b);}return value;}
  function add(){let value=multiply();while(['+','-'].includes(peek().value)){const op=take().value,right=multiply();if(op==='+'&&(typeof value==='string'||typeof right==='string'))value=String(value??'')+String(right??'');else{const a=Number(value),b=Number(right);value=!Number.isFinite(a)||!Number.isFinite(b)?null:op==='+'?a+b:a-b;}}return value;}
  function comparison(){let value=add();while(['>','>=','<','<=','==','===','!=','!=='].includes(peek().value)){const op=take().value,right=add();value=op==='>'?value>right:op==='>='?value>=right:op==='<'?value<right:op==='<='?value<=right:op==='!='||op==='!=='?value!==right:value===right;}return value;}
  function logicalAnd(){let value=comparison();while(accept('&&'))value=Boolean(value)&&Boolean(comparison());return value;}
  function logicalOr(){let value=logicalAnd();while(accept('||')){const right=logicalAnd();value=String(value??'')+String(right??'');}return value;}
  function call(name,args){
    const string=value=>String(value??'');const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
    if(name==='if')return args[0]?args[1]:args[2];if(name==='coalesce')return args.find(value=>!isNull(value)&&value!=='')??null;if(name==='concat')return args.map(string).join('');
    if(name==='upper')return string(args[0]).toUpperCase();if(name==='lower')return string(args[0]).toLowerCase();if(name==='trim')return string(args[0]).trim();if(name==='length')return string(args[0]).length;
    if(name==='replace')return string(args[0]).split(string(args[1])).join(string(args[2]));if(name==='substr'||name==='substring')return string(args[0]).substring(Number(args[1])||0,args.length>2?(Number(args[1])||0)+(Number(args[2])||0):undefined);
    if(name==='round'){const n=number(args[0]),digits=Math.max(0,Math.min(12,Number(args[1])||0));return n===null?null:Number(n.toFixed(digits));}if(name==='abs'){const n=number(args[0]);return n===null?null:Math.abs(n);}if(name==='floor'){const n=number(args[0]);return n===null?null:Math.floor(n);}if(name==='ceil'){const n=number(args[0]);return n===null?null:Math.ceil(n);}if(name==='min'||name==='max'){const nums=args.map(number).filter(value=>value!==null);return nums.length?Math[name](...nums):null;}
    if(name==='date'){const value=toDateValue(args[0],false);return value;}if(name==='datetime'){return toDateValue(args[0],true);}if(name==='now')return new Date().toISOString();
    if(['year','month','day'].includes(name)){const date=new Date(args[0]);if(!Number.isFinite(date.getTime()))return null;return name==='year'?date.getUTCFullYear():name==='month'?date.getUTCMonth()+1:date.getUTCDate();}
    throw Error(`Unknown function “${name}”.`);
  }
  const result=logicalOr();if(peek().type!=='eof')throw Error(`Unexpected token “${peek().value}”.`);return result;
}
function calculatePreview(features,expression,field,limit=5){
  const rows=[];let invalid=0;for(let i=0;i<(features||[]).length;i++){let raw,result;try{raw=evaluate(expression,features[i].properties||{},i);result=validateValue(raw,field);}catch(error){result={ok:false,value:null,error:error.message};raw=null;}if(!result.ok)invalid++;if(rows.length<limit)rows.push({featureId:features[i].id,raw,value:result.value,ok:result.ok,error:result.error||''});}return {rows,invalid,total:(features||[]).length};
}

global.EditPolygonGISSchemaCore=Object.freeze({VERSION,FIELD_TYPES,TYPE_LABELS,clone,isNull,isBlank,inferType,coerce,normaliseField,inferSchema,ensureLayerSchema,fieldMap,getField,validateValue,previewConversion,updateReferences,normaliseFilter,normaliseSavedFilter,compare,matchesFilter,filterIds,compareValues,sortRows,displayValue,evaluate,calculatePreview,defaultForType});
})(typeof window!=='undefined'?window:globalThis);
