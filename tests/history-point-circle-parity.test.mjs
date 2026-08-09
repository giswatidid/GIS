import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');

function functionSource(name){
  const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} missing`);
  const open=app.indexOf('{',start);let depth=0;
  for(let i=open;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}'&&--depth===0)return app.slice(start,i+1);
  }
  throw new Error(`${name} unterminated`);
}

test('standalone Point models are healed to canonical CRS84 longitude',()=>{
  const helper=functionSource('canonicaliseStandalonePointGeometryInPlace');
  assert.match(helper,/geometry\.type==='Point'/);
  assert.match(helper,/geometry\.coordinates\[0\]=wrapLng\(Number\(geometry\.coordinates\[0\]\)\)/);
  const ensure=functionSource('ensureFeatureModel');
  assert.match(ensure,/canonicaliseStandalonePointGeometryInPlace\(f\.geometry\)/);
  assert.match(ensure,/canonicaliseStandalonePointGeometryInPlace\(f\.sourceGeometry\)/);
  assert.match(ensure,/canonicaliseStandalonePointGeometryInPlace\(f\.renderedGeometry\)/);
});

test('point creation and point editing never persist a repeated-world longitude',()=>{
  assert.match(app,/const coordinate=\[wrapLng\(Number\(latlng\.lng\)\),Number\(latlng\.lat\)/);
  assert.match(app,/coordinate\[0\]=wrapLng\(Number\(coordinate\[0\]\)\);return addDrawnGeometry\(\{type:'Point'/);
  assert.match(app,/function canonicalPointGeometry\(geometry\)[\s\S]*wrapLng\(Number\(out\.coordinates\[0\]\)\)/);
});

test('true circle keeps a canonical model centre while display materialisation uses the active world copy',()=>{
  const normalise=functionSource('normaliseParametricCircle');
  assert.match(normalise,/center\[0\]=unwrapLongitudeNear\(center\[0\],0\)/);
  const display=functionSource('materialiseCircleDisplayPolygon');
  assert.match(display,/displayCenter=circleDisplayCenterLatLng\(c\)/);
  assert.match(display,/circleScreenRing\(\[displayCenter\.lng,displayCenter\.lat\],pixelRadius,n\)/);
});

test('history restore invalidates spatial and vector caches after installing restored state',()=>{
  const helper=functionSource('invalidateHistoryRestoreCaches');
  assert.match(helper,/invalidateSpatialIndex/);
  assert.match(helper,/invalidateRenderCache/);
  const featureRestore=functionSource('restoreFeatureHistoryEntry');
  assert.ok(featureRestore.indexOf('file.features[index]=saved')<featureRestore.indexOf('invalidateHistoryRestoreCaches(restoredFileIds)'));
  const fullRestore=functionSource('restore');
  assert.ok(fullRestore.indexOf('project.files=d.files||[]')<fullRestore.indexOf('invalidateHistoryRestoreCaches()'));
  assert.ok(fullRestore.indexOf('invalidateHistoryRestoreCaches()')<fullRestore.indexOf('renderAll()'));
});

test('OSM can display beyond its native tile pyramid without requesting unsupported z20+ source tiles',()=>{
  assert.match(app,/tile\.openstreetmap\.org[\s\S]{0,180}maxZoom:22,maxNativeZoom:19/);
});

test('feature zoom caps point/degenerate extents below extreme basemap zooms',()=>{
  const zoom=functionSource('zoomFeature');
  assert.match(zoom,/maxZoom:17/);
  const selected=functionSource('zoomSelected');
  assert.match(selected,/maxZoom:17/);
});
