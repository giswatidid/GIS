import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

function outputFactorySource(){
  const match=app.match(/function gisCreateOutputFile\([^\n]+/);
  assert.ok(match,'gisCreateOutputFile declaration was not found.');
  return match[0];
}

test('processing output layers are complete Layers-panel records and open expanded',()=>{
  const context={
    project:{files:[],selectedFileId:null,selectedFeatureId:null},
    sidebarState:{collapsedFiles:new Set(['unrelated'])},
    uid:()=> 'output-file',
    flattenSupportedFeatures:features=>features,
    featureName:(feature,fallback)=>feature?.properties?.name||fallback,
    normalize:(feature,name)=>({id:'output-feature',name,properties:{...(feature.properties||{}),name},geometry:feature.geometry,visible:true}),
    applyColor:(feature,color)=>{feature.style={color,fillColor:color};},
    renderAll:()=>{
      for(const file of context.project.files)String(file.sourceFormat).toUpperCase();
      context.rendered=true;
    },
    setDirty:value=>{context.dirty=value;},
    logOperation:()=>{},
    gisEditableSnapshot:id=>context.project.files.find(file=>file.id===id),
    Error,
  };
  vm.createContext(context);
  vm.runInContext(`${outputFactorySource()}
this.createOutput=gisCreateOutputFile;`,context);
  const output=context.createOutput('Centroids',[{type:'Feature',properties:{name:'Area A'},geometry:{type:'Point',coordinates:[153,-27]}}],'#7c3aed',{operation:'centroid'});
  assert.equal(output.sourceFormat,'analysis');
  assert.equal(output.features.length,1);
  assert.equal(output.features[0].geometry.type,'Point');
  assert.equal(context.project.selectedFileId,'output-file');
  assert.equal(context.project.selectedFeatureId,'output-feature');
  assert.equal(context.sidebarState.collapsedFiles.has('output-file'),false);
  assert.equal(context.rendered,true);
});

test('centroid outputs and legacy processing layers retain list-safe metadata',()=>{
  assert.match(app,/turf\.centroid\(f,\{properties:\{\.\.\.\(f\.properties\|\|\{\}\),source_feature_id:/);
  assert.match(app,/source_feature_name:/);
  assert.match(app,/processing_operation:'centroid'/);
  assert.match(app,/file\.sourceFormat=file\.sourceFormat\|\|\(file\.gisProcessing\?'analysis':'geojson'\)/);
  assert.match(app,/String\(file\.sourceFormat\|\|'project'\)\.toUpperCase\(\)/);
});
