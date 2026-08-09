import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const core=require('../docs/assets/gis-join-core.js');

const schema=fields=>({version:1,fields:fields.map(([name,type])=>({name,alias:name,type,nullable:true,required:false,readOnly:false}))});
const row=(id,properties,geometry=null)=>({id,properties,geometry});

test('attribute joins preserve leading-zero text identifiers and null keys never match',()=>{
  const target=[row('t1',{code:'0012',name:'Alpha'}),row('t2',{code:null,name:'Missing'})];
  const source=[row('s1',{lookup:'0012',status:'Active'}),row('s2',{lookup:null,status:'Wrong'})];
  const config={targetSchema:schema([['code','text'],['name','text']]),sourceSchema:schema([['lookup','text'],['status','text']]),targetKey:'code',sourceKey:'lookup',joinType:'left',duplicateHandling:'block',fieldMap:[{source:'status',include:true}],textOptions:{trim:false}};
  const preview=core.previewAttributeJoin(target,source,config);
  assert.equal(preview.valid,true);
  assert.equal(preview.matchedTargets,1);
  assert.equal(preview.unmatchedTargets,1);
  assert.equal(preview.targetNullKeys,1);
  const result=core.executeAttributeJoin(target,source,config);
  assert.deepEqual(result.rows.map(item=>item.properties.status),['Active',null]);
  assert.equal(result.rows[0].properties.code,'0012');
});

test('text matching options are explicit and do not rewrite stored values',()=>{
  const target=[row('t',{key:'  North   Zone '})],source=[row('s',{key:'north zone',value:7})];
  const base={targetSchema:schema([['key','text']]),sourceSchema:schema([['key','text'],['value','integer']]),targetKey:'key',sourceKey:'key',joinType:'inner',duplicateHandling:'block',fieldMap:[{source:'value',include:true}]};
  assert.equal(core.previewAttributeJoin(target,source,{...base,textOptions:{trim:false}}).matchedTargets,0);
  const preview=core.previewAttributeJoin(target,source,{...base,textOptions:{trim:true,ignoreCase:true,collapseWhitespace:true}});
  assert.equal(preview.matchedTargets,1);
  const result=core.executeAttributeJoin(target,source,{...base,textOptions:{trim:true,ignoreCase:true,collapseWhitespace:true}});
  assert.equal(result.rows[0].properties.key,'  North   Zone ');
});

test('typed key compatibility permits whole-number integer/decimal joins but blocks fractions',()=>{
  assert.equal(core.compatibleKeyTypes('integer','decimal',[1],[1,2]).compatible,true);
  assert.equal(core.compatibleKeyTypes('integer','decimal',[1],[1.5]).compatible,false);
  assert.equal(core.compatibleKeyTypes('text','integer',['1'],[1]).compatible,false);
});

test('duplicate matches are blocked until the user chooses first or expansion',()=>{
  const target=[row('t1',{id:1})],source=[row('s1',{id:1,v:'a'}),row('s2',{id:1,v:'b'})];
  const base={targetSchema:schema([['id','integer']]),sourceSchema:schema([['id','integer'],['v','text']]),targetKey:'id',sourceKey:'id',joinType:'left',fieldMap:[{source:'v',include:true}]};
  const blocked=core.previewAttributeJoin(target,source,{...base,duplicateHandling:'block'});
  assert.equal(blocked.valid,false);
  assert.equal(blocked.multipleTargets,1);
  const first=core.previewAttributeJoin(target,source,{...base,duplicateHandling:'first'});
  assert.equal(first.valid,true);
  assert.match(first.warnings.join(' '),/first source record/i);
  const expanded=core.executeAttributeJoin(target,source,{...base,duplicateHandling:'expand'});
  assert.equal(expanded.rows.length,2);
  assert.deepEqual(expanded.rows.map(item=>item.properties.v),['a','b']);
});

test('left and inner joins produce predictable counts and resolve field conflicts',()=>{
  const target=[row('a',{id:1,status:'target'}),row('b',{id:2,status:'target'})];
  const source=[row('s',{id:1,status:'source'})];
  const base={targetSchema:schema([['id','integer'],['status','text']]),sourceSchema:schema([['id','integer'],['status','text']]),targetKey:'id',sourceKey:'id',duplicateHandling:'block',prefix:'lookup_',fieldMap:[{source:'status',output:'status',include:true}]};
  const left=core.executeAttributeJoin(target,source,{...base,joinType:'left'});
  assert.equal(left.rows.length,2);
  assert.equal(left.rows[0].properties.lookup_status,'source');
  assert.equal(left.rows[1].properties.lookup_status,null);
  const inner=core.executeAttributeJoin(target,source,{...base,joinType:'inner'});
  assert.equal(inner.rows.length,1);
  assert.equal(inner.schema.fields.find(field=>field.name==='lookup_status').nullable,true);
});

test('grouped summaries support multiple group fields, typed calculations and stable output names',()=>{
  const records=[
    row('1',{region:'North',active:true,value:10,label:'A'}),
    row('2',{region:'North',active:true,value:20,label:'B'}),
    row('3',{region:'North',active:false,value:null,label:'A'}),
    row('4',{region:'South',active:true,value:5,label:'C'})
  ];
  const sourceSchema=schema([['region','text'],['active','boolean'],['value','integer'],['label','text']]);
  const result=core.executeGroupSummary(records,{schema:sourceSchema,groupFields:['region','active'],aggregations:[
    {field:'__records__',operation:'count',output:'count'},
    {field:'value',operation:'sum',output:'region'},
    {field:'value',operation:'average',output:'average_value'},
    {field:'label',operation:'count_distinct',output:'distinct_labels'}
  ]});
  assert.equal(result.rows.length,3);
  const northActive=result.rows.find(item=>item.properties.region==='North'&&item.properties.active===true);
  assert.equal(northActive.properties.count,2);
  assert.equal(northActive.properties.region_2,30);
  assert.equal(northActive.properties.average_value,15);
  assert.equal(northActive.properties.distinct_labels,2);
  assert.equal(result.schema.fields.find(field=>field.name==='count').type,'integer');
  assert.equal(result.schema.fields.find(field=>field.name==='average_value').type,'decimal');
});

test('summary validation rejects operations that do not match the field type',()=>{
  assert.throws(()=>core.executeGroupSummary([row('1',{group:'A',text:'x'})],{schema:schema([['group','text'],['text','text']]),groupFields:['group'],aggregations:[{field:'text',operation:'sum',output:'bad'}]}),/not valid for text/);
});

test('CSV lookup parsing handles quoting, BOMs, tabs and duplicate headings',()=>{
  const parsed=core.parseCsv('\uFEFFid,id,name\n001,7,"Alpha, North"\n');
  assert.deepEqual(parsed.schema.fields.map(field=>field.name),['id','id_2','name']);
  assert.equal(parsed.rows[0].id,'001');
  assert.equal(parsed.rows[0].name,'Alpha, North');
  assert.equal(parsed.schema.fields.find(field=>field.name==='id').type,'text');
  const tsv=core.parseCsv('code\tvalue\nA\t2\n',{delimiter:'\t'});
  assert.equal(tsv.rows[0].value,'2');
  assert.equal(tsv.schema.fields.find(field=>field.name==='value').type,'integer');
});
