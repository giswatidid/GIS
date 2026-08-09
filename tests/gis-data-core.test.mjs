import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync('docs/assets/gis-data-core.js','utf8');const context={globalThis:{},console};context.window=context.globalThis;vm.createContext(context);vm.runInContext(code,context);const C=context.globalThis.EditPolygonGISDataCore;
const features=[{id:'a',properties:{name:'Alpha',type:'A',value:10}},{id:'b',properties:{name:'Beta',type:'B',value:20}},{id:'c',properties:{name:'Gamma',type:'A',value:null}}];
test('field schema is inferred',()=>{const f=C.fields(features);assert.equal(f.find(x=>x.name==='value').type,'mixed');});
test('text and numeric filtering works',()=>{assert.deepEqual([...C.filter(features,{field:'type',op:'eq',value:'A'})],['a','c']);assert.deepEqual([...C.filter(features,{field:'value',op:'gt',value:15})],['b']);});
test('unique values count categories',()=>{assert.deepEqual(JSON.parse(JSON.stringify(C.uniqueValues(features,'type'))),[{value:'A',count:2},{value:'B',count:1}]);});
test('numeric stats and breaks are valid',()=>{const s=C.numericStats(features,'value');assert.equal(s.mean,15);const b=C.classifyBreaks(features,'value',5);assert.equal(b.length,5);assert.equal(b[0].min,10);assert.equal(b.at(-1).max,20);});
test('field calculator supports references arithmetic concatenation and index',()=>{assert.equal(C.calculate('[value] * 2',features[0].properties,0),20);assert.equal(C.calculate('[name] || "!"',features[0].properties,0),'Alpha!');assert.equal(C.calculate('$index',{},4),5);});
