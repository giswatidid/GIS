import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../docs/assets/gis-processing-registry.js',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../docs/assets/gis-processing-core.js',import.meta.url),'utf8');
function load(){
  const window={};const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date});
  vm.runInContext(registrySource,context,{filename:'gis-processing-registry.js'});
  vm.runInContext(coreSource,context,{filename:'gis-processing-core.js'});
  return window.EditPolygonGISProcessingCore;
}
const base=()=>({
  toolId:'simplify',
  inputs:{source:[{type:'Feature',id:'a',properties:{name:'A',value:1},geometry:{type:'LineString',coordinates:[[0,0],[1,1],[2,2]]}}]},
  inputSchemas:{source:{fields:[{name:'value',type:'number'}]}},
  inputLayerIds:{source:'layer-a'},
  parameters:{tolerance:1},
  output:{mode:'new-layer',name:'Any name'},
  currentSelectionIds:['a'],
  processingCrs:'EPSG:32756'
});

test('preview fingerprint is deterministic and ignores commit-only output settings',()=>{
  const core=load(),a=base(),b=base();
  b.output={mode:'modify-source',name:'Different name'};
  assert.equal(core.previewFingerprint(a),core.previewFingerprint(b));
  assert.equal(core.previewFingerprint(a),core.previewFingerprint(JSON.parse(JSON.stringify(a))));
});

test('preview fingerprint changes for data, schema, parameters, selection and CRS',()=>{
  const core=load(),a=base(),fingerprint=core.previewFingerprint(a);
  for(const mutate of [
    value=>{value.inputs.source[0].geometry.coordinates[1]=[1.1,1];},
    value=>{value.inputs.source[0].properties.value=2;},
    value=>{value.inputSchemas.source.fields[0].type='text';},
    value=>{value.parameters.tolerance=2;},
    value=>{value.currentSelectionIds=[];},
    value=>{value.processingCrs='EPSG:3857';}
  ]){
    const changed=base();mutate(changed);
    assert.notEqual(core.previewFingerprint(changed),fingerprint);
  }
});
