import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

function functionSource(name){
  const marker=`function ${name}(`;
  const start=app.indexOf(marker);
  assert.ok(start>=0,`${name} must exist`);
  const brace=app.indexOf('{',start);
  let depth=0;
  for(let i=brace;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}'){
      depth--;
      if(depth===0)return app.slice(start,i+1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const EARTH_RADIUS=6371008.8;
function mercatorProject([lng,lat],zoom=3){
  const size=256*2**zoom;
  const clamped=Math.max(-85.05112878,Math.min(85.05112878,lat));
  const rad=clamped*Math.PI/180;
  return {
    x:(lng+180)/360*size,
    y:(1-Math.log(Math.tan(Math.PI/4+rad/2))/Math.PI)/2*size
  };
}
function mercatorUnproject({x,y},zoom=3){
  const size=256*2**zoom;
  const lng=x/size*360-180;
  const n=Math.PI-2*Math.PI*y/size;
  const lat=180/Math.PI*Math.atan(Math.sinh(n));
  return {lng,lat};
}
function haversine(a,b){
  const lat1=Number(a.lat),lat2=Number(b.lat),lng1=Number(a.lng),lng2=Number(b.lng);
  const dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLng/2)**2;
  return 2*EARTH_RADIUS*Math.asin(Math.min(1,Math.sqrt(h)));
}
function makeContext(center,zoom=3,{canonicalInverse=false,behavior='screen'}={}){
  const toLonLat=value=>Array.isArray(value)?{lat:Number(value[0]),lng:Number(value[1])}:{lat:Number(value.lat),lng:Number(value.lng)};
  const context={
    result:null,
    PARAMETRIC_CRS84:'urn:ogc:def:crs:OGC::CRS84',
    clone:value=>structuredClone(value),
    polygonMoveBehavior:()=> behavior,
    getDrawSegments:()=>72,
    MAP_ADAPTER:{
      point:(x,y)=>typeof x==='object'?{x:Number(x.x),y:Number(x.y)}:{x:Number(x),y:Number(y)},
      latLng:coord=>({lng:Number(coord[0]),lat:Number(coord[1])})
    },
    MAP_RUNTIME:{
      getCenter:()=>[center[0],center[1]],
      getZoom:()=>zoom,
      latLngToPixel:value=>{
        const ll=toLonLat(value),p=mercatorProject([ll.lng,ll.lat],zoom);
        return {x:p.x,y:p.y,distanceTo(other){return Math.hypot(this.x-other.x,this.y-other.y);}};
      },
      pixelToLatLng:point=>{const ll=mercatorUnproject(point,zoom);if(canonicalInverse)ll.lng=((ll.lng+180)%360+360)%360-180;return ll;},
      distanceLatLng:(a,b)=>haversine(toLonLat(a),toLonLat(b))
    },
    coordToPoint:coord=>{
      const p=mercatorProject(coord,zoom);
      return {x:p.x,y:p.y,distanceTo(other){return Math.hypot(this.x-other.x,this.y-other.y);}};
    },
    pointToCoord:point=>{const ll=mercatorUnproject(point,zoom);if(canonicalInverse)ll.lng=((ll.lng+180)%360+360)%360-180;return [ll.lng,ll.lat];},
    closeRingCopy:ring=>{const out=ring.map(coord=>[...coord]);if(out.length){const first=out[0],last=out.at(-1);if(first[0]!==last[0]||first[1]!==last[1])out.push([...first]);}return out;},
    pointDistance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
    materialiseCirclePolygon:()=>{throw new Error('screen display unexpectedly fell back to geographic materialisation');}
  };
  vm.createContext(context);
  const sources=[
    'unwrapLongitudeNear','continuousClosedRing','normaliseParametricCircle','circleDisplayCenterLatLng',
    'circleMetresForScreenRadius','circleScreenRadiusPixels','circleScreenRing',
    'materialiseCircleDisplayPolygon'
  ].map(functionSource).join('\n');
  vm.runInContext(sources,context);
  return context;
}

function verifyPreviewCommitParity(center,pixelRadius,zoom=3,options={}){
  const context=makeContext(center,zoom,options);
  const centerPixel=mercatorProject(center,zoom);
  const edgeLL=mercatorUnproject({x:centerPixel.x+pixelRadius,y:centerPixel.y},zoom);
  context.center=center;
  context.edge=[edgeLL.lng,edgeLL.lat];
  context.pixelRadius=pixelRadius;
  vm.runInContext(`
    const preview=circleScreenRing(center,pixelRadius,72);
    const radiusMetres=circleMetresForScreenRadius(center,pixelRadius);
    const display=materialiseCircleDisplayPolygon({type:'CircleByCenterPoint',center,radiusMetres,fallbackSegments:72},72,'screen');
    result={preview,display:display.coordinates[0],radiusMetres};
  `,context);
  const preview=Array.from(context.result.preview,coord=>Array.from(coord));
  const display=Array.from(context.result.display,coord=>Array.from(coord));
  assert.equal(preview.length,display.length);
  let maxPixelDelta=0;
  const pixels=[];
  for(let i=0;i<preview.length;i++){
    const a=mercatorProject(preview[i],zoom),b=mercatorProject(display[i],zoom);
    maxPixelDelta=Math.max(maxPixelDelta,Math.hypot(a.x-b.x,a.y-b.y));
    pixels.push(b);
  }
  assert.ok(maxPixelDelta<0.001,`committed circle moved ${maxPixelDelta.toFixed(6)} px from the live preview`);
  const xs=pixels.map(p=>p.x),ys=pixels.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  assert.ok(Math.abs((minX+maxX)/2-centerPixel.x)<0.001,'displayed circle must remain horizontally centred');
  assert.ok(Math.abs((minY+maxY)/2-centerPixel.y)<0.001,'displayed circle must remain vertically centred');
  assert.ok(Math.abs((maxX-minX)-2*pixelRadius)<0.001,'displayed circle width must match the drawn diameter');
  assert.ok(Math.abs((maxY-minY)-2*pixelRadius)<0.001,'displayed circle height must match the drawn diameter');
  assert.ok(context.result.radiusMetres>0);
}

test('screen-mode true circle final render exactly matches the live draw preview over Australia',()=>{
  verifyPreviewCommitParity([134,-25],160,3);
});

test('screen-mode true circle remains centred and circular at southern mid-latitudes',()=>{
  verifyPreviewCommitParity([74,-48],140,3);
});

test('screen-mode true circle stays continuous when inverse map coordinates canonicalise at the dateline',()=>{
  verifyPreviewCommitParity([179,-20],90,3,{canonicalInverse:true});
});

test('screen-mode true circle remains continuous in a repeated world copy when inverse coordinates canonicalise',()=>{
  verifyPreviewCommitParity([539,-20],90,3,{canonicalInverse:true});
});

test('map rendering uses display materialisation while export keeps the canonical geographic fallback path',()=>{
  const rendererStart=app.indexOf('function buildRuntimeCachedLayer');
  const rendererEnd=app.indexOf('function cachedLayerPresent',rendererStart);
  assert.ok(rendererStart>=0&&rendererEnd>rendererStart);
  assert.match(app.slice(rendererStart,rendererEnd),/const raw=mapFeatureJSON\(feature\)/);
  assert.match(functionSource('mapFeatureJSON'),/materialiseCircleDisplayPolygon/);
  const exportStart=app.indexOf('function materialiseFeatureForFormat');
  const exportEnd=app.indexOf('function materialiseFeatureCollectionForFormat',exportStart);
  assert.ok(exportStart>=0&&exportEnd>exportStart);
  assert.match(app.slice(exportStart,exportEnd),/materialiseCirclePolygon/);
});
