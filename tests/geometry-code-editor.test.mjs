import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const health=fs.readFileSync(new URL('../docs/assets/gis-geometry-health-core.js',import.meta.url),'utf8');

function vertexCount(g){
  let n=0;
  const walk=value=>{
    if(Array.isArray(value)&&value.length>=2&&!Array.isArray(value[0])&&!Array.isArray(value[1])){n++;return;}
    if(Array.isArray(value))value.forEach(walk);
  };
  walk(g?.coordinates);
  return n;
}

function loadEditor(){
  const start=app.indexOf('/* v125: geometry-code editor integrated inside the core app closure. */');
  const end=app.indexOf('\nshowAutosaveRecoveryIfAvailable();',start);
  assert.ok(start>=0&&end>start,'geometry-code editor block must remain discoverable');
  const block=app.slice(start,end);
  const sandbox={
    console,
    JSON,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    Intl,
    clone:value=>JSON.parse(JSON.stringify(value)),
    esc:value=>String(value??''),
    coordKey:c=>Array.isArray(c)&&c.length>=2?`${Number(c[0]).toPrecision(12)},${Number(c[1]).toPrecision(12)}`:'',
    coordSame:(a,b)=>Array.isArray(a)&&Array.isArray(b)&&Number(a[0])===Number(b[0])&&Number(a[1])===Number(b[1]),
    vertexCount,
    metrics:()=>({area:null,perim:null,bbox:null}),
    areaLabel:()=>'',
    lenLabel:()=>'',
    setStatus:()=>{},
    renderSelected:()=>{},
    validateCollectionGeometry:()=>({issues:[],summary:{}}),
    repairCollectionGeometry:()=>({features:[]}),
    wktToGeo:()=>{throw new Error('WKT is not part of these generic geometry tests');},
    requestAnimationFrame:()=>0,
    setTimeout:()=>0,
    clearTimeout:()=>{},
    setInterval:()=>0,
    clearInterval:()=>{},
    MutationObserver:class{observe(){} disconnect(){}},
    Event:class{constructor(type,init={}){this.type=type;Object.assign(this,init);}},
    document:{readyState:'loading',body:null,getElementById:()=>null,addEventListener:()=>{}},
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.window.addEventListener=()=>{};
  vm.createContext(sandbox);
  vm.runInContext(health,sandbox,{filename:'gis-geometry-health-core.js'});
  vm.runInContext(block,sandbox,{filename:'geometry-code-editor.js'});
  return sandbox.__geometryCodeEditorV124;
}

const api=loadEditor();

function analyse(geometry,expectedType=geometry.type){
  return api.analyze(JSON.stringify(geometry),expectedType);
}

function plain(value){return JSON.parse(JSON.stringify(value));}

test('geometry-code editor advertises all six standard editable GeoJSON vector types',()=>{
  assert.deepEqual(plain(api.supportedTypes),['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon']);
  for(const type of api.supportedTypes)assert.equal(api.isEditableType(type),true,type);
  assert.equal(api.isEditableType('GeometryCollection'),false);
  assert.equal(api.isEditableType('Circle'),false);
});

test('Point and MultiPoint geometry can be analysed and safely normalised',()=>{
  const point=analyse({type:'Point',coordinates:[153.025,-27.47]});
  assert.equal(point.valid,true);
  assert.deepEqual(plain(point.proposal),{type:'Point',coordinates:[153.025,-27.47]});

  const multi=analyse({type:'MultiPoint',coordinates:[[153,-27],[153,-27],[154,-28]]});
  assert.equal(multi.valid,true);
  assert.deepEqual(plain(multi.proposal),{type:'MultiPoint',coordinates:[[153,-27],[154,-28]]});
  assert.ok(multi.changes.some(change=>/duplicate point/i.test(change.message)));
});

test('LineString and MultiLineString geometry can be analysed and safely normalised',()=>{
  const line=analyse({type:'LineString',coordinates:[[153,-27],[153.5,-27.5],[154,-28]]});
  assert.equal(line.valid,true);
  assert.equal(line.proposal.type,'LineString');

  const multi=analyse({type:'MultiLineString',coordinates:[[[153,-27],[154,-28]],[[150,-25],[151,-26]]]});
  assert.equal(multi.valid,true);
  assert.equal(multi.proposal.type,'MultiLineString');
  assert.equal(multi.proposal.coordinates.length,2);
});

test('Polygon and MultiPolygon behaviour remains supported',()=>{
  const polygon=analyse({type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]});
  assert.equal(polygon.valid,true);
  assert.equal(polygon.proposal.type,'Polygon');

  const multi=analyse({type:'MultiPolygon',coordinates:[[[[153,-27],[154,-27],[154,-28],[153,-27]]],[[[150,-25],[151,-25],[151,-26],[150,-25]]]]});
  assert.equal(multi.valid,true);
  assert.equal(multi.proposal.type,'MultiPolygon');
});

test('Feature, FeatureCollection and GeometryCollection inputs reduce to the selected geometry family',()=>{
  const feature=api.analyze(JSON.stringify({type:'Feature',properties:{name:'a'},geometry:{type:'Point',coordinates:[153,-27]}}),'Point');
  assert.equal(feature.valid,true);
  assert.equal(feature.proposal.type,'Point');

  const fc=api.analyze(JSON.stringify({type:'FeatureCollection',features:[
    {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[153,-27],[154,-28]]}},
    {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[150,-25],[151,-26]]}},
    {type:'Feature',properties:{},geometry:{type:'Point',coordinates:[152,-26]}}
  ]}),'LineString');
  assert.equal(fc.valid,true);
  assert.equal(fc.proposal.type,'MultiLineString');
  assert.equal(fc.proposal.coordinates.length,2);

  const gc=api.analyze(JSON.stringify({type:'GeometryCollection',geometries:[
    {type:'MultiPoint',coordinates:[[153,-27],[154,-28]]},
    {type:'Point',coordinates:[155,-29]},
    {type:'LineString',coordinates:[[150,-25],[151,-26]]}
  ]}),'Point');
  assert.equal(gc.valid,true);
  assert.equal(gc.proposal.type,'MultiPoint');
  assert.equal(gc.proposal.coordinates.length,3);
});

test('raw coordinate arrays are interpreted using the selected feature family',()=>{
  const point=api.analyze('[153, -27]','Point');
  assert.equal(point.valid,true);
  assert.equal(point.proposal.type,'Point');

  const line=api.analyze('[[153,-27],[154,-28]]','LineString');
  assert.equal(line.valid,true);
  assert.equal(line.proposal.type,'LineString');

  const polygon=api.analyze('[[153,-27],[154,-27],[154,-28],[153,-27]]','Polygon');
  assert.equal(polygon.valid,true);
  assert.equal(polygon.proposal.type,'Polygon');
});

test('geometry-code editor rejects cross-family replacement and structurally invalid point/line geometry',()=>{
  const wrong=api.analyze(JSON.stringify({type:'Point',coordinates:[153,-27]}),'LineString');
  assert.equal(wrong.valid,false);
  assert.ok(wrong.issues.some(issue=>issue.code==='GEOMETRY_FAMILY_MISMATCH'||issue.code==='NO_EDITABLE_GEOMETRY'));

  const shortLine=analyse({type:'LineString',coordinates:[[153,-27]]});
  assert.equal(shortLine.valid,false);
  assert.ok(shortLine.issues.some(issue=>issue.severity==='error'));

  const badPoint=analyse({type:'Point',coordinates:[500,-27]});
  assert.equal(badPoint.valid,false);
  assert.ok(badPoint.issues.some(issue=>issue.code==='COORDINATE_RANGE'));
});

test('numeric coordinate strings become canonical two-dimensional numbers',()=>{
  const result=analyse({type:'LineString',coordinates:[['153','-27',10],['154','-28',20]]});
  assert.equal(result.valid,true);
  assert.deepEqual(plain(result.proposal.coordinates),[[153,-27],[154,-28]]);
  assert.ok(result.changes.some(change=>/numeric coordinate strings/i.test(change.message)));
  assert.ok(result.changes.some(change=>/extra coordinate values/i.test(change.message)));
});

test('generic Inspector host and apply path remain wired to the authoritative lexical renderer and canonical history APIs',()=>{
  assert.match(app,/data-gce-section="code"/);
  assert.match(app,/const previousRenderSelected=renderSelected;/);
  assert.match(app,/renderSelected=geometryCodeRenderSelected;\s*window\.renderSelected=geometryCodeRenderSelected;/);
  assert.match(app,/if\(r&&editableGeometry\(geom\)\)createSection\(r\);/);
  assert.match(app,/ensureNow:ensureGeometryCodeSection/);
  assert.match(app,/pushHistory\(\[current\.feature\.id\]\);\s*addEdit\(current\.feature,'manual'/);
  assert.match(app,/source:'geometry-code'/);
  assert.doesNotMatch(app,/Only Polygon and MultiPolygon geometry can replace a polygon/);
});
