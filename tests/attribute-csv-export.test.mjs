import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

function exportFunctionSource(){
  const match=appSource.match(/function exportLayerRecords\(fileId,\{scope='all',format='geojson',featureIds=null\}=\{\}\)\{([\s\S]*?)\n\s*\}\n\n\s*const previousSaveSelection=/);
  assert.ok(match,'exportLayerRecords function was not found');
  return `function exportLayerRecords(fileId,{scope='all',format='geojson',featureIds=null}={}){${match[1]}\n}`;
}

function runExport(format){
  let download=null;
  const file={
    id:'joined',name:'Joined result',
    gisSchema:{fields:[{name:'district'},{name:'lga'}]},
    features:[
      {id:'a',properties:{district:'North Tropical Coast',lga:'Cairns Region'},geometry:{type:'Point',coordinates:[145.7,-16.9]}},
      {id:'b',properties:{district:'North Tropical Coast',lga:'Douglas Shire'},geometry:{type:'Point',coordinates:[145.4,-16.3]}}
    ]
  };
  const context=vm.createContext({
    console,Error,String,Array,Set,JSON,Object,
    gisEditableFile:()=>file,
    ensureSchema:()=>{},
    recordsForScope:()=>file.features,
    downloadText:(name,text,mime)=>{download={name,text,mime};},
    clone:value=>JSON.parse(JSON.stringify(value)),
    featJSON:feature=>feature,
    getDisplayGeometry:feature=>feature.geometry,
    geomToWKT:geometry=>`POINT (${geometry.coordinates[0]} ${geometry.coordinates[1]})`
  });
  vm.runInContext(`${exportFunctionSource()};globalThis.__result=exportLayerRecords('joined',{scope:'all',format:${JSON.stringify(format)}});`,context);
  return {download,result:context.__result};
}

test('attribute-only CSV contains schema fields but no geometry WKT column',()=>{
  const {download,result}=runExport('csv-attributes');
  assert.equal(result.count,2);
  assert.equal(result.format,'csv-attributes');
  assert.match(download.name,/\.csv$/);
  assert.equal(download.mime,'text/csv;charset=utf-8');
  const text=download.text.replace(/^\uFEFF/,'');
  const lines=text.trim().split(/\r?\n/);
  assert.equal(lines[0],'"district","lga"');
  assert.match(lines[1],/North Tropical Coast/);
  assert.match(lines[1],/Cairns Region/);
  assert.doesNotMatch(text,/geometry_wkt/);
  assert.doesNotMatch(text,/POINT \(/);
});

test('CSV + WKT remains available as the spatial CSV option',()=>{
  const {download}=runExport('csv');
  const text=download.text.replace(/^\uFEFF/,'');
  assert.match(text.split(/\r?\n/)[0],/geometry_wkt/);
  assert.match(text,/POINT \(145\.7 -16\.9\)/);
});
