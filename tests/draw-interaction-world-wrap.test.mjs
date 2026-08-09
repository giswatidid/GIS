import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');

function functionSource(name){
  const marker=`function ${name}(`;
  const start=app.lastIndexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  let brace=app.indexOf('{',start),depth=0,inString=null,escape=false;
  for(let i=brace;i<app.length;i++){
    const ch=app[i];
    if(inString){
      if(escape)escape=false;
      else if(ch==='\\')escape=true;
      else if(ch===inString)inString=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){inString=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

function evalHelpers(names){
  const context={Math,Number,Array,JSON,clone:value=>JSON.parse(JSON.stringify(value))};
  context.globalThis=context;
  vm.createContext(context);
  for(const name of names)vm.runInContext(`${functionSource(name)};this.${name}=${name};`,context);
  return context;
}

test('draw longitude helpers preserve the short branch across the International Date Line',()=>{
  const c=evalHelpers(['unwrapLongitudeNear','unwrapDrawCoordNear','unwrapDrawPath']);
  assert.equal(c.unwrapLongitudeNear(-170,170),190);
  assert.equal(c.unwrapLongitudeNear(170,-170),-190);
  assert.deepEqual(JSON.parse(JSON.stringify(c.unwrapDrawCoordNear([-170,-20],[170,-20]))),[190,-20]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.unwrapDrawPath([[170,-20],[-170,-21],[-160,-22]]))),[[170,-20],[190,-21],[200,-22]]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.unwrapDrawPath([[-170,-20],[170,-21],[160,-22]]))),[[-170,-20],[-190,-21],[-200,-22]]);
});



test('authoritative constrained draw coordinate keeps live line and polygon clicks in the visible world copy',()=>{
  const context={Math,Number,Array,JSON,clone:value=>JSON.parse(JSON.stringify(value))};
  context.globalThis=context;
  context.D={kind:'line',points:[[170,-20]]};
  context.SNAP={last:null};
  context.snappedLatLng=()=>({coord:[-170,-21],target:null});
  context.MAP_ADAPTER={latLng:c=>({lat:c[1],lng:c[0]})};
  context.angleSnapCoord=(a,b)=>b;
  vm.createContext(context);
  for(const name of ['unwrapLongitudeNear','unwrapDrawCoordNear','constrainedDrawCoord'])vm.runInContext(`${functionSource(name)};this.${name}=${name};`,context);
  let out=context.constrainedDrawCoord({lng:-170,lat:-21},{});
  assert.deepEqual(JSON.parse(JSON.stringify(out.coord)),[190,-21]);
  assert.equal(out.latlng.lng,190);

  context.D={kind:'polygon',points:[]};
  context.snappedLatLng=()=>({coord:[-170,-21],target:null});
  out=context.constrainedDrawCoord({lng:550,lat:-21},{});
  assert.deepEqual(JSON.parse(JSON.stringify(out.coord)),[550,-21]);
});
test('authoritative draw constraint owns LineString world-wrap and cannot be replaced by the legacy line block',()=>{
  const source=functionSource('constrainedDrawCoord');
  assert.match(source,/continuousKinds=new Set\(\['polygon','hole','split','buffer','line'\]\)/);
  assert.match(source,/unwrapDrawCoordNear\(c,branchReference\)/);
  assert.match(source,/unwrapDrawCoordNear\(c,previous\)/);
  assert.equal((app.match(/function\s+constrainedDrawCoord\s*\(/g)||[]).length,1);
  assert.equal((app.match(/(?<![\w$.])constrainedDrawCoord\s*=\s*function\b/g)||[]).length,0);
  assert.equal(app.includes('v116BaseConstrainedDrawCoord'),false);
});

test('draw overlay cannot become click-through from stale Shift-pan or zoom lifecycle state',()=>{
  const start=functionSource('DStart');
  const zoom=functionSource('hideOverlayForZoom');
  const zoomEnd=functionSource('showOverlayAfterZoom');
  assert.match(start,/classList\.remove\('shift-pan','zooming'\)/);
  assert.match(zoom,/if\(D\.active\)[\s\S]*classList\.remove\('zooming'\)[\s\S]*scheduleOverlayRender\(\)[\s\S]*return/);
  assert.match(zoomEnd,/classList\.remove\('zooming'\)[\s\S]*renderOverlay\(\)/);
  assert.doesNotMatch(app,/e\.key==='Shift'\)updateShiftPanState/);
  assert.match(css,/#editOverlay\.drawing\.zooming\{opacity:1;pointer-events:auto\}/);
});

test('LineString drawing no longer owns a late coordinate conversion implementation',()=>{
  const lineBlock=app.slice(app.indexOf('// ---------- Drawing ----------'),app.indexOf('// v117',app.indexOf('// ---------- Drawing ----------'))>0?app.indexOf('// v117',app.indexOf('// ---------- Drawing ----------')):app.indexOf('// v118',app.indexOf('// ---------- Drawing ----------')));
  assert.doesNotMatch(lineBlock,/constrainedDrawCoord\s*=\s*function/);
  assert.match(lineBlock,/drawPreviewGeometry=function\(\)[\s\S]*D\.kind==='line'/);
});
