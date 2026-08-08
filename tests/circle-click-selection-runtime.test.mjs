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

function pointInPolygon(point,polygon){
  const [x,y]=point.geometry.coordinates;
  const ring=polygon.geometry.coordinates[0];
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const crosses=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi);
    if(crosses)inside=!inside;
  }
  return inside;
}

function runCircleHit({engine='openlayers',latlng={lng:0,lat:0},canonicalHit=false}={}){
  const context={
    result:null,
    feature:{id:'circle-1',parametricGeometry:{type:'CircleByCenterPoint'}},
    file:{id:'layer-1'},
    latlng,
    pixel:{x:100,y:100},
    isParametricCircleFeature:f=>f?.parametricGeometry?.type==='CircleByCenterPoint',
    MAP_RUNTIME:{engine},
    featJSON:()=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]}}),
    turf:{point:coordinates=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates}}),booleanPointInPolygon:pointInPolygon},
    polygonBoundaryHitPixel:()=>false,
    MAP_ADAPTER:{point:p=>p},
    mapHitTolerancePx:()=>8,
    circleContainsLatLng:()=>canonicalHit
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('parametricCircleHitAtMapPoint')}\nresult=parametricCircleHitAtMapPoint(feature,file,latlng,pixel);`,context);
  return context.result;
}

test('OpenLayers true-circle click follows the rendered materialised polygon, not the legacy circle-math result',()=>{
  // Deliberately make the old canonical/screen circle test fail. The click is
  // inside the exact polygon supplied to OpenLayers, so selection must still hit.
  assert.equal(runCircleHit({engine:'openlayers',latlng:{lng:0,lat:0},canonicalHit:false}),true);
  assert.equal(runCircleHit({engine:'openlayers',latlng:{lng:3,lat:3},canonicalHit:true}),false);
});

test('Leaflet true-circle click keeps the canonical circle containment path',()=>{
  assert.equal(runCircleHit({engine:'leaflet',canonicalHit:true}),true);
  assert.equal(runCircleHit({engine:'leaflet',canonicalHit:false}),false);
});

test('ordinary click candidate loop no longer has a separate true-circle screen-space shortcut',()=>{
  const start=app.indexOf('function featuresAtLatLng');
  const end=app.indexOf('function mapSelectionHooks',start);
  const block=app.slice(start,end);
  assert.match(block,/featureHitAtMapPoint\(row\.feature,row\.file,latlng,hitPixel\)/);
  assert.doesNotMatch(block,/trueCircleHitAtPixel/);
});

test('ordinary OpenLayers click still returns a true circle when native rendered-feature hit detection returns no ids',()=>{
  const circle={id:'circle-1',parametricGeometry:{type:'CircleByCenterPoint'}};
  const file={id:'layer-1'};
  const context={
    result:null,
    circle,file,
    renderOrderRows:()=>[{file,feature:circle,fileIndex:0,featureIndex:0}],
    MAP_ADAPTER:{point:p=>({x:Number(p.x),y:Number(p.y)})},
    MAP_RUNTIME:{
      engine:'openlayers',
      latLngToPixel:()=>({x:100,y:100}),
      editableFeatureIdsAtPixel:()=>[],
      pixelToLatLng:p=>({lng:(Number(p.x)-100)/10,lat:(100-Number(p.y))/10})
    },
    project:{files:[file]},
    fileOfFeature:()=>({file,feature:circle,index:0}),
    isFeatureSleeping:()=>false,
    mapHitTolerancePx:()=>8,
    featureBBox:()=>[-1,-1,1,1],
    isParametricCircleFeature:f=>f===circle,
    featJSON:()=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]}}),
    turf:{point:coordinates=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates}}),booleanPointInPolygon:pointInPolygon},
    polygonBoundaryHitPixel:()=>false,
    circleContainsLatLng:()=>false,
    getDisplayGeometry:()=>({type:'CircleByCenterPoint'}),
    distPx:()=>999,
    coordToPt:()=>({x:0,y:0}),
    lineCoordinatesHitPixel:()=>false
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('parametricCircleHitAtMapPoint')}\n${functionSource('featureHitAtMapPoint')}\n${functionSource('featuresAtLatLng')}\nresult=featuresAtLatLng({lng:0,lat:0},{x:100,y:100}).map(row=>row.feature.id);`,context);
  assert.deepEqual(Array.from(context.result),['circle-1']);
});
