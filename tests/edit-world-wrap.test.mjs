import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

function functionSource(source,name){
  const marker=`function ${name}(`;
  const start=source.lastIndexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  let brace=source.indexOf('{',start),depth=0,inString=null,escape=false;
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

test('generic edit branch helper keeps repeated-world pointer coordinates beside stored geometry',()=>{
  const context={Math,Number,Array,JSON,clone:value=>JSON.parse(JSON.stringify(value))};
  context.globalThis=context;
  vm.createContext(context);
  for(const name of ['unwrapLongitudeNear','unwrapCoordNear'])vm.runInContext(`${functionSource(app,name)};this.${name}=${name};`,context);
  assert.deepEqual(plain(context.unwrapCoordNear([873,-27],[153,-27])),[153,-27]);
  assert.deepEqual(plain(context.unwrapCoordNear([-567,-27],[153,-27])),[153,-27]);
  assert.deepEqual(plain(context.unwrapCoordNear([541,-20],[179,-20])),[181,-20]);
  assert.deepEqual(plain(context.unwrapCoordNear([-541,-20],[-179,-20])),[-181,-20]);
});

test('red vertex drag writes the replacement coordinate on the original vertex longitude branch',()=>{
  const source=functionSource(app,'applyVertexDragPosition');
  assert.match(source,/const editCoord=unwrapCoordNear\(snapped\.coord,drag\.originalCoord\|\|snapped\.coord\)/);
  assert.match(source,/restoreMoveOnlyGeometry\(drag\.feature,drag\.baseGeometry,drag\.path,editCoord\)/);
  assert.match(source,/applyLinkedMoveOnly\(drag\.linked,drag\.linkedBaseGeometries,editCoord\)/);
  assert.match(source,/return \{\.\.\.snapped,coord:editCoord,latlng:editLatLng\}/);
});

test('edge drag keeps both endpoints on their own stored longitude branches',()=>{
  const source=functionSource(app,'applyEdgeDragPosition');
  assert.match(source,/coordA=unwrapCoordNear\(\[aLL\.lng,aLL\.lat\],drag\.originalCoordA\|\|drag\.lastCoordA\)/);
  assert.match(source,/coordB=unwrapCoordNear\(\[bLL\.lng,bLL\.lat\],drag\.originalCoordB\|\|drag\.lastCoordB\)/);
  const down=functionSource(app,'edgeDown');
  assert.match(down,/originalCoordA:clone\(a\)/);
  assert.match(down,/originalCoordB:clone\(b\)/);
});

test('whole-feature screen movement preserves the stored branch but still crosses the dateline continuously',()=>{
  const context={Math,Number,Array,JSON};
  context.globalThis=context;
  context.MAP_ADAPTER={point:(x,y)=>({x,y})};
  context.MAP_RUNTIME={
    latLngToPixel:()=>({x:100,y:100}),
    pixelToLatLng:()=>({lng:873,lat:-26})
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource(app,'unwrapLongitudeNear')};this.unwrapLongitudeNear=unwrapLongitudeNear;`,context);
  vm.runInContext(`${functionSource(app,'transformCoordByScreenDelta')};this.transformCoordByScreenDelta=transformCoordByScreenDelta;`,context);
  assert.deepEqual(plain(context.transformCoordByScreenDelta([153,-27],10,0)),[153,-26]);
  context.MAP_RUNTIME.pixelToLatLng=()=>({lng:541,lat:-20});
  assert.deepEqual(plain(context.transformCoordByScreenDelta([179,-20],10,0)),[181,-20]);
});

test('geographic centre movement removes repeated-world offset before metre-space calculations',()=>{
  const source=functionSource(app,'transformGeometryByAreaPreservingDrag');
  assert.match(source,/const startLng=unwrapLongitudeNear\(startLL\.lng,origin0\[0\]\)/);
  assert.match(source,/const endLng=unwrapLongitudeNear\(endLL\.lng,startLng\)/);
  assert.match(source,/clickX=\(startLng-origin0\[0\]\)/);
  assert.match(source,/origin1Lng=endLng-/);
});

test('DOM draggable overlays and true-circle centre editing preserve their pre-drag longitude branch',()=>{
  const overlay=adapter.slice(adapter.indexOf('function createDomOverlayController'),adapter.indexOf('function createOpenLayersRuntime'));
  assert.match(overlay,/next\[0\]=wrapLongitudeNear\(next\[0\],coordinate\[0\]\);coordinate=next/);
  const circleBlock=app.slice(app.indexOf('function buildCircleEditHandles(){'),app.indexOf('function startCircleEditMode(){'));
  assert.match(circleBlock,/centerCoord=unwrapCoordNear\(\[ll\.lng,Math\.max\(-90,Math\.min\(90,ll\.lat\)\)\],drag\?\.base\?\.center\|\|f\.parametricGeometry\.center\)/);
});
