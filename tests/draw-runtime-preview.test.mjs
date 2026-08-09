import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
function functionSource(name){
  const marker=`function ${name}(`,start=app.lastIndexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  let brace=app.indexOf('{',start),depth=0,inString=null,escape=false;
  for(let i=brace;i<app.length;i++){
    const ch=app[i];
    if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===inString)inString=null;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){inString=ch;continue;}
    if(ch==='{')depth++; else if(ch==='}'&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

test('draw runtime preview mirrors polygon vertices, live cursor, linework and fill through the map adapter',()=>{
  const context={
    D:{active:true,kind:'polygon',points:[[179,-20],[181,-20]],cursor:[182,-21]},
    drawPreviewRing:()=>null,
    drawPreviewGeometry:()=>({type:'Polygon',coordinates:[[[179,-20],[181,-20],[182,-21],[179,-20]]]})
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('drawRuntimePreviewItems')};this.fn=drawRuntimePreviewItems;`,context);
  const items=JSON.parse(JSON.stringify(context.fn()));
  assert.ok(items.some(item=>item.id==='draw-fill'&&item.geometry.type==='Polygon'));
  assert.deepEqual(items.find(item=>item.id==='draw-line').geometry.coordinates,[[179,-20],[181,-20]]);
  assert.deepEqual(items.find(item=>item.id==='draw-guide').geometry.coordinates,[[181,-20],[182,-21]]);
  assert.equal(items.filter(item=>item.id.startsWith('draw-point-')).length,2);
  assert.deepEqual(items.find(item=>item.id==='draw-cursor').geometry.coordinates,[182,-21]);
});

test('shape drawing sends the complete live ring through a native transient vector overlay',()=>{
  const ring=[[179,-20],[181,-20],[181,-22],[179,-22],[179,-20]];
  const context={D:{active:true,kind:'circle',points:[[179,-21]],cursor:[181,-21]},drawPreviewRing:()=>ring,drawPreviewGeometry:()=>null};
  vm.createContext(context);
  vm.runInContext(`${functionSource('drawRuntimePreviewItems')};this.fn=drawRuntimePreviewItems;`,context);
  const items=JSON.parse(JSON.stringify(context.fn()));
  const shape=items.find(item=>item.id==='draw-shape');
  assert.ok(shape);
  assert.equal(shape.geometry.type,'Polygon');
  assert.deepEqual(shape.geometry.coordinates[0],ring);
});

test('runtime preview layer is engine-neutral and clears when drawing stops',()=>{
  assert.match(functionSource('ensureDrawRuntimePreviewLayer'),/MAP_RUNTIME\.createVectorOverlayLayer/);
  assert.match(functionSource('renderDrawRuntimePreview'),/MAP_RUNTIME\.setVectorOverlayFeatures/);
  assert.match(functionSource('renderDrawRuntimePreview'),/MAP_RUNTIME\.clearVectorOverlayLayer/);
  const block=[functionSource('ensureDrawRuntimePreviewLayer'),functionSource('drawRuntimePreviewItems'),functionSource('renderDrawRuntimePreview')].join('\n');
  assert.doesNotMatch(block,/MAP_RUNTIME\.engine|\b(?:L|ol)\./);
});

test('draw preview layer state is initialized before startup can enter renderOverlay',()=>{
  const matches=[...app.matchAll(/\blet DRAW_RUNTIME_PREVIEW_LAYER\s*=\s*null\s*;/g)];
  assert.equal(matches.length,1,'preview layer state must have one authoritative binding');
  const stateIndex=matches[0].index;
  const drawStateIndex=app.indexOf("const D={active:false,points:[],cursor:null,kind:'polygon'};");
  const overlayIndex=app.indexOf('function renderOverlay(){');
  const startupIndex=app.indexOf('initResizers();renderAll();setDirty(false);updateUndo();');
  assert.ok(drawStateIndex>=0&&stateIndex>drawStateIndex,'preview layer state should live beside drawing state');
  assert.ok(stateIndex<overlayIndex,'preview layer state must be initialized before renderOverlay is reachable');
  assert.ok(stateIndex<startupIndex,'preview layer state must be initialized before the first startup renderAll');
});
