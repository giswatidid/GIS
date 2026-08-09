(function(global){
'use strict';

const VERSION='1.53.0';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const FIELD_TYPES=['text','integer','decimal','boolean','date','datetime'];
const TYPE_LABELS={text:'Text',integer:'Integer',decimal:'Decimal',boolean:'Boolean',date:'Date',datetime:'Datetime'};
const cleanName=value=>String(value??'').trim().replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').replace(/^([0-9])/,'_$1').slice(0,80)||'field';
const isNull=value=>value===null||value===undefined;
const populated=value=>!isNull(value)&&value!=='';
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
const schemaFields=schema=>Array.isArray(schema?.fields)?schema.fields:[];
const schemaField=(schema,name)=>schemaFields(schema).find(field=>field.name===name)||null;
const fieldType=(schema,name)=>schemaField(schema,name)?.type||'text';
const defaultForType=type=>type==='integer'||type==='decimal'?0:type==='boolean'?false:type==='date'||type==='datetime'?null:'';

function normaliseField(field={}){
  const type=FIELD_TYPES.includes(field.type)?field.type:'text';
  const name=cleanName(field.name||field.alias||'field');
  return {
    name,
    alias:String(field.alias||name),
    type,
    nullable:field.nullable!==false,
    required:!!field.required,
    readOnly:!!field.readOnly,
    defaultValue:field.defaultValue===undefined?(field.nullable!==false?null:defaultForType(type)):clone(field.defaultValue),
    description:String(field.description||'')
  };
}

function inferType(values=[]){
  const actual=(values||[]).filter(populated);
  if(!actual.length)return 'text';
  if(actual.every(value=>typeof value==='boolean'||/^(true|false)$/i.test(String(value))))return 'boolean';
  const strings=actual.map(value=>String(value).trim());
  if(strings.some(value=>/^[-+]?0\d+$/.test(value)))return 'text';
  if(actual.every(value=>Number.isInteger(Number(value))&&String(value).trim()!==''))return 'integer';
  if(actual.every(value=>Number.isFinite(Number(value))&&String(value).trim()!==''))return 'decimal';
  if(strings.every(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))))return 'date';
  if(strings.every(value=>/T|\s\d{1,2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value))))return 'datetime';
  return 'text';
}

function inferSchema(records=[]){
  const names=[];const seen=new Set();
  for(const record of records||[])for(const name of Object.keys(record?.properties||record||{}))if(!seen.has(name)){seen.add(name);names.push(name);}
  return {version:1,fields:names.map(name=>normaliseField({name,type:inferType((records||[]).map(record=>(record?.properties||record||{})[name])),nullable:true}))};
}

function compatibleKeyTypes(targetType,sourceType,targetValues=[],sourceValues=[]){
  if(targetType===sourceType)return {compatible:true,mode:targetType};
  const numeric=new Set(['integer','decimal']);
  if(numeric.has(targetType)&&numeric.has(sourceType)){
    const decimalValues=(targetType==='decimal'?targetValues:sourceValues).filter(populated).map(Number);
    const whole=decimalValues.every(Number.isInteger);
    return whole?{compatible:true,mode:'number',warning:'Integer and decimal keys will be compared numerically.'}:{compatible:false,reason:'Decimal key values include fractions and cannot be matched safely to integer keys.'};
  }
  return {compatible:false,reason:`${TYPE_LABELS[targetType]||targetType} and ${TYPE_LABELS[sourceType]||sourceType} keys are different types.`};
}

function normaliseText(value,options={}){
  let text=String(value??'');
  if(options.trim!==false)text=text.trim();
  if(options.collapseWhitespace)text=text.replace(/\s+/g,' ');
  if(options.ignoreCase)text=text.toLocaleLowerCase();
  return text;
}

function normaliseKey(value,type,options={}){
  if(isNull(value)||value==='')return null;
  if(type==='text')return `t:${normaliseText(value,options)}`;
  if(type==='integer'||type==='decimal'){
    const n=Number(value);return Number.isFinite(n)?`n:${n}`:null;
  }
  if(type==='boolean'){
    if(value===true||String(value).toLowerCase()==='true'||value===1||value==='1')return 'b:1';
    if(value===false||String(value).toLowerCase()==='false'||value===0||value==='0')return 'b:0';
    return null;
  }
  if(type==='date'){
    const text=String(value).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(text)?`d:${text}`:null;
  }
  if(type==='datetime'){
    const time=Date.parse(value);return Number.isFinite(time)?`dt:${time}`:null;
  }
  return `t:${normaliseText(value,options)}`;
}

function indexKeys(records,keyField,type,options={}){
  const index=new Map(),nullRecords=[],invalidRecords=[];
  (records||[]).forEach((record,rowIndex)=>{
    const properties=record?.properties||record||{};
    const raw=properties[keyField];
    if(isNull(raw)||raw===''){nullRecords.push(record);return;}
    const key=normaliseKey(raw,type,options);
    if(key==null){invalidRecords.push({record,rowIndex,value:raw});return;}
    const list=index.get(key)||[];list.push(record);index.set(key,list);
  });
  const duplicateKeys=[...index.entries()].filter(([,recordsForKey])=>recordsForKey.length>1).map(([key,rows])=>({key,count:rows.length}));
  return {index,nullRecords,invalidRecords,duplicateKeys,uniqueKeys:index.size};
}

function relationCardinality(targetIndex,sourceIndex){
  let targetDuplicateKeys=0,sourceDuplicateKeys=0,matchedKeys=0,manyToManyKeys=0,oneToManyKeys=0,manyToOneKeys=0;
  for(const [key,targetRows] of targetIndex.index){
    if(targetRows.length>1)targetDuplicateKeys++;
    const sourceRows=sourceIndex.index.get(key);if(!sourceRows)continue;
    matchedKeys++;
    if(sourceRows.length>1)sourceDuplicateKeys++;
    if(targetRows.length>1&&sourceRows.length>1)manyToManyKeys++;
    else if(sourceRows.length>1)oneToManyKeys++;
    else if(targetRows.length>1)manyToOneKeys++;
  }
  const relation=manyToManyKeys?'many-to-many':oneToManyKeys?'one-to-many':manyToOneKeys?'many-to-one':'one-to-one';
  return {relation,targetDuplicateKeys,sourceDuplicateKeys,matchedKeys,manyToManyKeys,oneToManyKeys,manyToOneKeys};
}

function normaliseFieldMap(targetSchema,sourceSchema,fieldMap=[],prefix='source_'){
  const targetNames=new Set(schemaFields(targetSchema).map(field=>field.name.toLocaleLowerCase()));
  const used=new Set([...targetNames]);
  const sourceByName=new Map(schemaFields(sourceSchema).map(field=>[field.name,field]));
  const requested=(fieldMap||[]).filter(item=>item&&item.include!==false&&sourceByName.has(item.source));
  return requested.map(item=>{
    const sourceField=sourceByName.get(item.source);
    let output=cleanName(item.output||sourceField.name);
    if(used.has(output.toLocaleLowerCase()))output=cleanName(`${prefix||'source_'}${output}`);
    let candidate=output,suffix=2;while(used.has(candidate.toLocaleLowerCase()))candidate=cleanName(`${output}_${suffix++}`);
    used.add(candidate.toLocaleLowerCase());
    return {source:sourceField.name,output:candidate,sourceField:clone(sourceField),conflict:candidate!==cleanName(item.output||sourceField.name)};
  });
}

function joinedSchema(targetSchema,sourceSchema,mapping,{joinType='left'}={}){
  const fields=schemaFields(targetSchema).map(normaliseField);
  for(const item of mapping||[]){
    const source=normaliseField(item.sourceField||schemaField(sourceSchema,item.source)||{name:item.source,type:'text'});
    fields.push({...source,name:item.output,alias:item.output===source.name?source.alias:`${source.alias||source.name}`,nullable:joinType==='left'?true:source.nullable,required:false,readOnly:false});
  }
  return {version:1,fields};
}

function previewAttributeJoin(targetRecords,sourceRecords,config={}){
  const targetSchema=config.targetSchema||inferSchema(targetRecords),sourceSchema=config.sourceSchema||inferSchema(sourceRecords);
  const targetType=fieldType(targetSchema,config.targetKey),sourceType=fieldType(sourceSchema,config.sourceKey);
  const compatibility=compatibleKeyTypes(targetType,sourceType,(targetRecords||[]).map(row=>row.properties?.[config.targetKey]),(sourceRecords||[]).map(row=>row.properties?.[config.sourceKey]));
  const errors=[],warnings=[];
  if(!(targetRecords||[]).length)errors.push('No target records are available in this scope.');
  if(!(sourceRecords||[]).length)errors.push('No source records are available in this scope.');
  if(!config.targetKey||!schemaField(targetSchema,config.targetKey))errors.push('Choose a valid target key field.');
  if(!config.sourceKey||!schemaField(sourceSchema,config.sourceKey))errors.push('Choose a valid source key field.');
  if(!compatibility.compatible)errors.push(compatibility.reason);
  if(compatibility.warning)warnings.push(compatibility.warning);
  const options=config.textOptions||{};
  const targetIndex=indexKeys(targetRecords,config.targetKey,targetType,options),sourceIndex=indexKeys(sourceRecords,config.sourceKey,sourceType,options);
  const cardinality=relationCardinality(targetIndex,sourceIndex);
  let matchedTargets=0,unmatchedTargets=0,multipleTargets=0,expectedOutput=0;
  for(const target of targetRecords||[]){
    const key=normaliseKey(target.properties?.[config.targetKey],targetType,options),matches=key==null?[]:(sourceIndex.index.get(key)||[]);
    if(matches.length){matchedTargets++;if(matches.length>1)multipleTargets++;expectedOutput+=config.duplicateHandling==='expand'?matches.length:1;}else{unmatchedTargets++;if((config.joinType||'left')==='left')expectedOutput++;}
  }
  if(multipleTargets&&(!config.duplicateHandling||config.duplicateHandling==='block'))errors.push(`${multipleTargets} target record${multipleTargets===1?' has':'s have'} multiple source matches. Choose expansion or explicitly use the first match.`);
  if(multipleTargets&&config.duplicateHandling==='first')warnings.push(`${multipleTargets} target record${multipleTargets===1?' will':'s will'} use the first source record in its current order.`);
  if(multipleTargets&&config.duplicateHandling==='expand')warnings.push(`The output will duplicate target records for multiple source matches (${expectedOutput.toLocaleString()} expected records).`);
  if(targetIndex.nullRecords.length)warnings.push(`${targetIndex.nullRecords.length} target record${targetIndex.nullRecords.length===1?' has':'s have'} a NULL or empty key and cannot match.`);
  if(sourceIndex.nullRecords.length)warnings.push(`${sourceIndex.nullRecords.length} source record${sourceIndex.nullRecords.length===1?' has':'s have'} a NULL or empty key and will not match.`);
  if(targetIndex.invalidRecords.length||sourceIndex.invalidRecords.length)warnings.push('Some key values are invalid for their typed field and will not match.');
  const mapping=normaliseFieldMap(targetSchema,sourceSchema,config.fieldMap,config.prefix);
  if(!mapping.length)errors.push('Choose at least one source field to copy.');
  return {version:1,valid:!errors.length,errors,warnings,targetCount:(targetRecords||[]).length,sourceCount:(sourceRecords||[]).length,matchedTargets,unmatchedTargets,multipleTargets,expectedOutput,targetNullKeys:targetIndex.nullRecords.length,sourceNullKeys:sourceIndex.nullRecords.length,targetInvalidKeys:targetIndex.invalidRecords.length,sourceInvalidKeys:sourceIndex.invalidRecords.length,targetDuplicateKeys:targetIndex.duplicateKeys.length,sourceDuplicateKeys:sourceIndex.duplicateKeys.length,cardinality,mapping,schema:joinedSchema(targetSchema,sourceSchema,mapping,{joinType:config.joinType||'left'}),sample:buildAttributeJoinRows(targetRecords,sourceIndex,{...config,targetType,mapping},10).map(item=>item.properties)};
}

function buildAttributeJoinRows(targetRecords,sourceIndex,config={},limit=Infinity){
  const out=[],type=config.targetType||'text',options=config.textOptions||{},mapping=config.mapping||[],joinType=config.joinType||'left',duplicateHandling=config.duplicateHandling||'block';
  for(const target of targetRecords||[]){
    const key=normaliseKey(target.properties?.[config.targetKey],type,options),matches=key==null?[]:(sourceIndex.index.get(key)||[]);
    if(!matches.length){
      if(joinType==='left'){
        const properties={...(target.properties||{})};for(const map of mapping)properties[map.output]=null;
        out.push({targetId:target.id,sourceId:null,geometry:clone(target.geometry),properties});
      }
    }else{
      const chosen=duplicateHandling==='expand'?matches:[matches[0]];
      for(const source of chosen){const properties={...(target.properties||{})};for(const map of mapping)properties[map.output]=clone(source.properties?.[map.source]??null);out.push({targetId:target.id,sourceId:source.id||null,geometry:clone(target.geometry),properties});}
    }
    if(out.length>=limit)break;
  }
  return out.slice(0,limit);
}

function executeAttributeJoin(targetRecords,sourceRecords,config={}){
  const preview=previewAttributeJoin(targetRecords,sourceRecords,config);if(!preview.valid)throw new Error(preview.errors.join(' '));
  const targetType=fieldType(config.targetSchema||inferSchema(targetRecords),config.targetKey),sourceType=fieldType(config.sourceSchema||inferSchema(sourceRecords),config.sourceKey);
  const sourceIndex=indexKeys(sourceRecords,config.sourceKey,sourceType,config.textOptions||{});
  const rows=buildAttributeJoinRows(targetRecords,sourceIndex,{...config,targetType,mapping:preview.mapping});
  return {rows,schema:preview.schema,diagnostics:preview};
}

function valueKey(value,type){
  if(isNull(value))return '∅';
  if(type==='datetime'){const t=Date.parse(value);return Number.isFinite(t)?`dt:${t}`:`t:${value}`;}
  if(type==='date')return `d:${String(value).slice(0,10)}`;
  if(type==='boolean')return value===true||String(value).toLowerCase()==='true'?'b:1':'b:0';
  if(type==='integer'||type==='decimal')return `n:${Number(value)}`;
  return `t:${String(value)}`;
}
function compareValues(a,b,type){
  if(isNull(a)&&isNull(b))return 0;if(isNull(a))return 1;if(isNull(b))return -1;
  if(type==='integer'||type==='decimal')return Number(a)-Number(b);
  if(type==='date'||type==='datetime')return Date.parse(a)-Date.parse(b);
  if(type==='boolean')return Number(!!a)-Number(!!b);
  return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
}
function median(values){if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;}

function aggregate(values,operation,type){
  const populatedValues=(values||[]).filter(populated);
  if(operation==='count')return (values||[]).length;
  if(operation==='count_non_null')return populatedValues.length;
  if(operation==='count_distinct')return new Set(populatedValues.map(value=>valueKey(value,type))).size;
  if(operation==='first')return populatedValues.length?clone(populatedValues[0]):null;
  if(operation==='last')return populatedValues.length?clone(populatedValues[populatedValues.length-1]):null;
  if(operation==='concat_distinct')return [...new Map(populatedValues.map(value=>[String(value),value])).values()].map(String).join(', ');
  if(operation==='min'||operation==='max'){
    if(!populatedValues.length)return null;const sorted=populatedValues.slice().sort((a,b)=>compareValues(a,b,type));return clone(operation==='min'?sorted[0]:sorted[sorted.length-1]);
  }
  const numbers=populatedValues.map(finite).filter(value=>value!==null);
  if(operation==='sum')return numbers.length?numbers.reduce((sum,value)=>sum+value,0):null;
  if(operation==='average')return numbers.length?numbers.reduce((sum,value)=>sum+value,0)/numbers.length:null;
  if(operation==='median')return median(numbers);
  return null;
}
function aggregationOutputType(operation,sourceType){
  if(operation==='count'||operation==='count_non_null'||operation==='count_distinct')return 'integer';
  if(operation==='average'||operation==='median'||operation==='sum')return 'decimal';
  if(operation==='concat_distinct')return 'text';
  return sourceType||'text';
}
function aggregationOperationsForType(type){
  const common=['count_non_null','count_distinct','first','last','min','max'];
  return type==='integer'||type==='decimal'?['sum','average','median',...common]:[...common,'concat_distinct'];
}
function normaliseAggregations(sourceSchema,groupFields,items=[]){
  const used=new Set((groupFields||[]).map(name=>String(name).toLocaleLowerCase())),out=[];
  for(const raw of items||[]){
    if(!raw||!raw.operation)continue;
    const field=raw.field||'__records__',source=field==='__records__'?{name:'__records__',type:'integer'}:schemaField(sourceSchema,field);
    if(!source)throw new Error(`Summary field “${field}” does not exist.`);
    const allowed=field==='__records__'?['count']:aggregationOperationsForType(source.type);
    if(!allowed.includes(raw.operation))throw new Error(`${raw.operation} is not valid for ${source.type} field “${field}”.`);
    let base=cleanName(raw.output||`${field}_${raw.operation}`),output=base,suffix=2;
    while(used.has(output.toLocaleLowerCase()))output=cleanName(`${base}_${suffix++}`);
    used.add(output.toLocaleLowerCase());
    out.push({...clone(raw),field,operation:raw.operation,output,requestedOutput:String(raw.output||''),sourceType:source.type});
  }
  return out;
}
function summarySchema(sourceSchema,groupFields,aggregations){
  const fields=[];
  for(const name of groupFields||[]){const source=schemaField(sourceSchema,name)||{name,type:'text'};fields.push({...normaliseField(source),required:false,readOnly:false});}
  for(const item of aggregations||[]){fields.push(normaliseField({name:item.output,alias:item.output,type:aggregationOutputType(item.operation,item.sourceType||fieldType(sourceSchema,item.field)),nullable:true,description:`${item.operation} of ${item.field}`}));}
  return {version:1,fields};
}
function executeGroupSummary(records,config={}){
  const schema=config.schema||inferSchema(records),groupFields=[...new Set((config.groupFields||[]).filter(name=>schemaField(schema,name)))],aggregations=normaliseAggregations(schema,groupFields,config.aggregations||[]);
  if(!(records||[]).length)throw new Error('No records are available in this scope.');
  if(!groupFields.length)throw new Error('Choose at least one group field.');if(!aggregations.length)throw new Error('Add at least one summary calculation.');
  const groups=new Map();
  for(const record of records||[]){const parts=groupFields.map(name=>valueKey(record.properties?.[name],fieldType(schema,name))),key=JSON.stringify(parts);let group=groups.get(key);if(!group){group={records:[],values:Object.fromEntries(groupFields.map(name=>[name,clone(record.properties?.[name]??null)]))};groups.set(key,group);}group.records.push(record);}
  const rows=[];
  for(const group of groups.values()){
    const properties={...group.values};
    for(const item of aggregations){const sourceType=item.field==='__records__'?'integer':fieldType(schema,item.field),values=item.field==='__records__'?group.records.map(()=>1):group.records.map(record=>record.properties?.[item.field]);properties[item.output]=aggregate(values,item.operation,sourceType);}
    rows.push({properties,recordIds:group.records.map(record=>record.id),geometry:config.geometryMode==='first'?clone(group.records.find(record=>record.geometry)?.geometry||null):null,sourceRecords:group.records});
  }
  rows.sort((a,b)=>{for(const name of groupFields){const result=compareValues(a.properties[name],b.properties[name],fieldType(schema,name));if(result)return result;}return 0;});
  const outputSchema=summarySchema(schema,groupFields,aggregations);
  return {rows,schema:outputSchema,diagnostics:{inputCount:(records||[]).length,groupCount:rows.length,groupFields,aggregations:clone(aggregations),aggregationCount:aggregations.length,sample:rows.slice(0,10).map(row=>row.properties)}};
}
function previewGroupSummary(records,config={}){try{const result=executeGroupSummary(records,config);return {valid:true,errors:[],...result.diagnostics,schema:result.schema,sample:result.diagnostics.sample};}catch(error){return {valid:false,errors:[error.message],inputCount:(records||[]).length,groupCount:0,sample:[]};}}

function spatialOutputSchema(targetSchema,sourceSchema,fieldMap=[],aggregations=[],options={}){
  const fields=schemaFields(targetSchema).map(normaliseField),used=new Set(fields.map(field=>field.name.toLocaleLowerCase()));
  for(const item of normaliseFieldMap({fields},sourceSchema,fieldMap,options.prefix||'source_')){fields.push({...normaliseField(item.sourceField),name:item.output,alias:item.output,nullable:true,required:false,readOnly:false});used.add(item.output.toLocaleLowerCase());}
  for(const item of aggregations||[]){let output=cleanName(item.output),base=output,suffix=2;while(used.has(output.toLocaleLowerCase()))output=cleanName(`${base}_${suffix++}`);used.add(output.toLocaleLowerCase());const sourceType=item.field==='__records__'?'integer':fieldType(sourceSchema,item.field);fields.push(normaliseField({name:output,alias:output,type:aggregationOutputType(item.operation,sourceType),nullable:true}));item._resolvedOutput=output;}
  if(options.includeDistance){let output=cleanName(options.distanceField||'join_distance_km'),base=output,suffix=2;while(used.has(output.toLocaleLowerCase()))output=cleanName(`${base}_${suffix++}`);fields.push(normaliseField({name:output,alias:output,type:'decimal',nullable:true,description:'Geodesic representative-point distance'}));options._resolvedDistanceField=output;}
  return {version:1,fields};
}

function parseCsv(text,{delimiter}={}){
  const source=String(text??'').replace(/^\uFEFF/,''),sep=delimiter||((source.split('\n')[0]||'').split('\t').length>(source.split('\n')[0]||'').split(',').length?'\t':',');
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){if(char==='"'&&source[i+1]==='"'){value+='"';i++;}else if(char==='"')quoted=false;else value+=char;}
    else if(char==='"')quoted=true;else if(char===sep){row.push(value);value='';}else if(char==='\n'){row.push(value.replace(/\r$/,''));rows.push(row);row=[];value='';}else value+=char;
  }
  if(value||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}
  const used=new Set();
  const header=(rows.shift()||[]).map((name,index)=>{const base=cleanName(name||`field_${index+1}`);let next=base,suffix=2;while(used.has(next.toLocaleLowerCase()))next=cleanName(`${base}_${suffix++}`);used.add(next.toLocaleLowerCase());return next;});
  const objects=rows.filter(row=>row.some(value=>String(value).trim()!=='')).map(values=>Object.fromEntries(header.map((name,index)=>[name,values[index]??''])));
  const schema=inferSchema(objects);return {rows:objects,schema,delimiter:sep};
}

const api={VERSION,version:VERSION,FIELD_TYPES,TYPE_LABELS,clone,cleanName,normaliseField,inferType,inferSchema,schemaFields,schemaField,fieldType,compatibleKeyTypes,normaliseText,normaliseKey,indexKeys,relationCardinality,normaliseFieldMap,joinedSchema,previewAttributeJoin,executeAttributeJoin,aggregate,aggregationOutputType,aggregationOperationsForType,normaliseAggregations,summarySchema,previewGroupSummary,executeGroupSummary,spatialOutputSchema,parseCsv};

global.EditPolygonGISJoinCore=Object.freeze(api);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
