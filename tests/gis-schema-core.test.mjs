import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../docs/assets/gis-schema-core.js',import.meta.url),'utf8');
const context={globalThis:{},console,Date,Math,JSON,Number,String,Boolean,Array,Object,Map,Set,RegExp,Intl};
context.window=context.globalThis;vm.createContext(context);vm.runInContext(code,context);
const S=context.globalThis.EditPolygonGISSchemaCore;
const plain=value=>JSON.parse(JSON.stringify(value));

test('conservatively infers typed fields from imported values',()=>{
  const features=[
    {properties:{name:'A',count:'10',ratio:'1.25',active:'true',day:'2026-08-01',stamp:'2026-08-01T10:30:00Z',code:'0012'}},
    {properties:{name:'B',count:'20',ratio:'2.50',active:'false',day:'2026-08-02',stamp:'2026-08-02T11:00:00Z',code:'0042'}}
  ];
  const schema=S.inferSchema(features);const types=Object.fromEntries(schema.fields.map(field=>[field.name,field.type]));
  assert.deepEqual(plain(types),{name:'text',count:'integer',ratio:'decimal',active:'boolean',day:'date',stamp:'datetime',code:'text'});
});

test('existing schema fields survive even when every feature is missing the property',()=>{
  const layer={features:[{name:'One',properties:{name:'One'}}],gisSchema:{version:1,fields:[{name:'name',type:'text',system:true},{name:'planned',type:'integer',nullable:true,defaultValue:null}]}};
  const schema=S.ensureLayerSchema(layer);
  assert.equal(schema.fields.find(field=>field.name==='planned').type,'integer');
  assert.equal(layer.features[0].properties.planned,null);
});

test('typed coercion rejects incompatible values and preserves nullability',()=>{
  assert.deepEqual(plain(S.coerce('12','integer',{nullable:false})),{ok:true,value:12});
  assert.equal(S.coerce('12.5','integer',{nullable:false}).ok,false);
  assert.deepEqual(plain(S.coerce('yes','boolean')), {ok:true,value:true});
  assert.equal(S.coerce('', 'date',{nullable:true}).value,null);
  assert.equal(S.coerce('', 'date',{nullable:false}).ok,false);
  assert.equal(S.coerce('2026-08-01T21:30:00+10:00','datetime',{nullable:false}).value,'2026-08-01T11:30:00.000Z');
  assert.equal(S.normaliseField({name:'optional_count',type:'integer',nullable:true,defaultValue:null}).defaultValue,null);
});

test('conversion preview reports incompatible rows before schema changes',()=>{
  const features=[{properties:{value:'12'}},{properties:{value:'bad'}},{properties:{value:null}}];
  const preview=S.previewConversion(features,'value',{name:'value',type:'integer',nullable:true});
  assert.equal(preview.total,3);assert.equal(preview.invalid,1);assert.equal(preview.convertible,2);assert.equal(preview.examples[0].value,'bad');
});

test('compound typed filters support AND, OR, ranges, dates and booleans',()=>{
  const features=[
    {id:'a',properties:{count:10,day:'2026-08-01',active:true,name:'Alpha'}},
    {id:'b',properties:{count:20,day:'2026-08-03',active:false,name:'Beta'}},
    {id:'c',properties:{count:30,day:'2026-08-05',active:true,name:'Gamma'}}
  ];
  const schema=S.inferSchema(features);
  const andFilter={logic:'and',conditions:[{field:'count',op:'between',value:10,value2:25},{field:'active',op:'eq',value:'true'}]};
  assert.deepEqual([...S.filterIds(features,andFilter,schema)],['a']);
  const orFilter={logic:'or',conditions:[{field:'day',op:'gt',value:'2026-08-04'},{field:'name',op:'starts',value:'Bet'}]};
  assert.deepEqual([...S.filterIds(features,orFilter,schema)],['b','c']);
});

test('multi-column typed sorting is stable and keeps null values last',()=>{
  const rows=[
    {id:'a',properties:{group:'B',value:1}},
    {id:'b',properties:{group:'A',value:2}},
    {id:'c',properties:{group:'A',value:1}},
    {id:'d',properties:{group:null,value:9}}
  ];
  const schema=S.inferSchema(rows);
  const sorted=S.sortRows(rows,[{field:'group',dir:1},{field:'value',dir:-1}],schema);
  assert.deepEqual(plain(sorted.map(row=>row.id)),['b','c','a','d']);
});

test('calculator evaluates deterministic expressions and type-validates previews',()=>{
  const props={name:' Alpha ',count:12,day:'2026-08-03'};
  assert.equal(S.evaluate('upper(trim([name])) || "-" || round([count] / 5, 1)',props,0),'ALPHA-2.4');
  assert.equal(S.evaluate('if([count] >= 10, year([day]), 0)',props,0),2026);
  const preview=S.calculatePreview([{id:'a',properties:props}], '[count] / 2',{name:'out',type:'integer',nullable:false},5);
  assert.equal(preview.invalid,0);assert.equal(preview.rows[0].value,6);
  const invalid=S.calculatePreview([{id:'a',properties:props}], '"not a number"',{name:'out',type:'decimal',nullable:false},5);
  assert.equal(invalid.invalid,1);
});
