import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

function functionSource(source,name){
  const marker=`function ${name}(`;
  const start=source.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  const brace=source.indexOf('{',start);let depth=0,inString=null,escape=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(inString){
      if(escape)escape=false;
      else if(ch==='\\')escape=true;
      else if(ch===inString)inString=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){inString=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

function plain(value){return JSON.parse(JSON.stringify(value));}

function contextWithConversion(){
  let nextId=0;
  const context={
    JSON,Math,Number,Array,Object,
    clone:value=>JSON.parse(JSON.stringify(value)),
    uid:prefix=>`${prefix}-${++nextId}`,
    closeRing:ring=>{if(ring.length&&JSON.stringify(ring[0])!==JSON.stringify(ring[ring.length-1]))ring.push(JSON.parse(JSON.stringify(ring[0])));return ring;}
  };
  context.globalThis=context;
  vm.createContext(context);
  for(const name of ['canonicalEditableFeatureStyle','featureFromMeasure']){
    vm.runInContext(`${functionSource(app,name)};this.${name}=${name};`,context);
  }
  return context;
}

test('point-marker conversion uses the same canonical GIS Point symbol as Draw point',()=>{
  const ctx=contextWithConversion();
  const feature=ctx.featureFromMeasure({type:'point',label:'Marker',coordinates:[[153,-27]],style:{color:'#123456',size:18}});
  assert.deepEqual(plain(feature.style),{
    color:'#123456',fillColor:'#123456',weight:2,fillOpacity:0.9,radius:6
  });
  assert.equal(feature.properties.drawKind,'point');
  assert.equal(feature.properties.annotation,false);
  assert.equal(feature.annotationStyle,undefined);

  const pointDrawBlock=app.slice(app.indexOf('addDrawnGeometry=function(geometry'),app.indexOf('const v146BaseDAddPoint'));
  assert.match(pointDrawBlock,/style:canonicalEditableFeatureStyle\(geometry,color\)/);
});

test('measurement conversion uses geometry-family feature defaults instead of polygon-like styling for every type',()=>{
  const ctx=contextWithConversion();
  const distance=ctx.featureFromMeasure({type:'distance',label:'Distance',coordinates:[[1,2],[3,4]],style:{color:'#abcdef'}});
  const area=ctx.featureFromMeasure({type:'area',label:'Area',coordinates:[[0,0],[1,0],[1,1]],style:{color:'#abcdef'}});
  assert.deepEqual(plain(distance.style),{color:'#abcdef',fillColor:'#abcdef',weight:3,fillOpacity:0,radius:5});
  assert.deepEqual(plain(area.style),{color:'#abcdef',fillColor:'#abcdef',weight:2,fillOpacity:0.18,radius:5});
});

test('text annotation conversion keeps annotation typography while point-marker conversion becomes a normal GIS point',()=>{
  const ctx=contextWithConversion();
  const text=ctx.featureFromMeasure({type:'annotation',label:'Note',coordinates:[[150,-25]],style:{color:'#654321',size:16,bold:true}});
  assert.equal(text.properties.annotation,true);
  assert.deepEqual(plain(text.annotationStyle),{color:'#654321',size:16,bold:true});
  assert.deepEqual(plain(text.style),{color:'#654321',fillColor:'#654321',weight:2,fillOpacity:0.9,radius:6});
});
