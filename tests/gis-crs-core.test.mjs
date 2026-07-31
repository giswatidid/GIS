import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../docs/assets/gis-crs-core.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(code,context);const crs=context.window.EditPolygonCRS;
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} not within ${t} of ${b}`);

test('normalises common CRS identifiers and detects WKT authority codes',()=>{
  assert.equal(crs.normalise('urn:ogc:def:crs:EPSG::28356'),'EPSG:28356');
  assert.equal(crs.normalise('CRS:84'),'EPSG:4326');
  assert.equal(crs.detectWktCrs('PROJCS["GDA94 / MGA zone 56",AUTHORITY["EPSG","28356"]]'),'EPSG:28356');
});

test('Web Mercator round trip preserves Brisbane coordinates',()=>{
  const source=[153.025,-27.47];const projected=crs.transformCoordinate(source,'EPSG:4326','EPSG:3857');
  assert.ok(projected[0]>17000000&&projected[1]<-3000000);
  const back=crs.transformCoordinate(projected,'EPSG:3857','EPSG:4326');close(back[0],source[0]);close(back[1],source[1]);
});

test('MGA zone 56 uses 500000 m easting on the central meridian and round trips',()=>{
  const source=[153,-27];const projected=crs.transformCoordinate(source,'EPSG:4326','EPSG:7856');
  close(projected[0],500000,.01);assert.ok(projected[1]>7000000&&projected[1]<7100000);
  const back=crs.transformCoordinate(projected,'EPSG:7856','EPSG:4326');close(back[0],source[0],1e-7);close(back[1],source[1],1e-7);
});

test('geometry reprojection preserves nesting and non-spatial ordinates',()=>{
  const g={type:'LineString',coordinates:[[153,-27,4],[153.1,-27.1,5]]};
  const out=crs.transformGeometry(g,'EPSG:4326','EPSG:7856');
  assert.equal(out.coordinates.length,2);assert.equal(out.coordinates[0][2],4);
  const back=crs.transformGeometry(out,'EPSG:7856','EPSG:4326');close(back.coordinates[1][0],153.1,1e-7);close(back.coordinates[1][1],-27.1,1e-7);
});

test('suggests an appropriate southern UTM/MGA zone',()=>{
  assert.equal(crs.utmForLonLat(153,-27,'GDA2020'),'EPSG:7856');
  assert.equal(crs.utmForLonLat(153,-27,'GDA94'),'EPSG:28356');
  assert.equal(crs.utmForLonLat(153,-27,'WGS84'),'EPSG:32756');
});

test('projected GeoJSON with an explicit CRS is prepared in WGS84',()=>{
  const source={type:'FeatureCollection',crs:{type:'name',properties:{name:'EPSG:3857'}},features:[{type:'Feature',properties:{name:'Brisbane'},geometry:{type:'Point',coordinates:crs.transformCoordinate([153.025,-27.47],'EPSG:4326','EPSG:3857')}}]};
  const prepared=crs.prepareGeoJSON(source);
  assert.equal(prepared.sourceCrs,'EPSG:3857');assert.equal(prepared.storageCrs,'EPSG:4326');assert.equal(prepared.transformed,true);
  close(prepared.collection.features[0].geometry.coordinates[0],153.025,1e-6);close(prepared.collection.features[0].geometry.coordinates[1],-27.47,1e-6);
});

test('creates CRS WKT and geometry WKT for exports',()=>{
  assert.match(crs.wktDefinition('EPSG:7856'),/Transverse_Mercator/);
  assert.match(crs.wktDefinition('EPSG:7856'),/AUTHORITY\["EPSG","7856"\]/);
  assert.equal(crs.geometryToWkt({type:'Point',coordinates:[153,-27]}),'POINT (153 -27)');
  assert.match(crs.geometryToWkt({type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]}),/^POLYGON/);
});
