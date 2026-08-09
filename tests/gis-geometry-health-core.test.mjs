import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const health=require('../docs/assets/gis-geometry-health-core.js');
const feature=(id,geometry,properties={})=>({type:'Feature',id,properties:{name:id,...properties},geometry});
const fc=(...features)=>({type:'FeatureCollection',features});
const square=(x=0,y=0,size=10)=>({type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]});

test('v1.54 recognises ordinary point, open line and polygon geometry as ready',()=>{
  const report=health.validateCollection(fc(
    feature('point',{type:'Point',coordinates:[153,-27]}),
    feature('line',{type:'LineString',coordinates:[[153,-27],[153.1,-27.1]]}),
    feature('polygon',square(0,0,5))
  ));
  assert.equal(report.version,'1.54.2');
  assert.deepEqual(report.counts,{checked:3,ready:3,safe:0,review:0,manual:0,issues:0});
  assert.equal(report.featureResults.find(x=>x.featureId==='line').status,'ready');
});

test('exact neighbouring duplicate vertices are a safe shape-preserving cleanup',()=>{
  const input=fc(feature('line',{type:'LineString',coordinates:[[1,1],[1,1],[2,2],[3,3]]}));
  const before=health.validateCollection(input);
  assert.equal(before.featureResults[0].status,'safe');
  assert.equal(before.issues[0].code,'CONSECUTIVE_DUPLICATES');
  const repaired=health.safeRepairCollection(input);
  assert.deepEqual(repaired.collection.features[0].geometry.coordinates,[[1,1],[2,2],[3,3]]);
  assert.equal(health.validateCollection(repaired.collection).counts.ready,1);
});

test('a duplicate neighbouring polygon vertex is not misclassified as a self-intersection',()=>{
  const geometry={type:'Polygon',coordinates:[[[0,0],[4,0],[4,0],[4,4],[0,4],[0,0]]]};
  const report=health.validateCollection(fc(feature('duplicate-vertex-polygon',geometry)));
  assert.equal(report.featureResults[0].status,'safe');
  assert.ok(report.issues.some(issue=>issue.code==='CONSECUTIVE_DUPLICATES'));
  assert.equal(report.issues.some(issue=>issue.code==='SELF_INTERSECTION'),false);
});

test('unclosed polygon boundaries require review and are never closed by safe repair',()=>{
  const ring=[[0,0],[5,0],[5,5],[0,5]];
  const input=fc(feature('poly',{type:'Polygon',coordinates:[ring]}));
  const report=health.validateCollection(input);
  assert.equal(report.featureResults[0].status,'review');
  assert.ok(report.issues.some(issue=>issue.code==='UNCLOSED_RING'&&issue.repair?.risk==='review'));
  const repaired=health.safeRepairCollection(input).collection.features[0].geometry.coordinates[0];
  assert.notDeepEqual(repaired[0],repaired[repaired.length-1]);
});

test('self-intersecting polygon gets a located review issue and make-valid proposal',()=>{
  const bowtie={type:'Polygon',coordinates:[[[0,0],[4,4],[0,4],[4,0],[0,0]]]};
  const report=health.validateCollection(fc(feature('bowtie',bowtie)));
  const issue=report.issues.find(x=>x.code==='SELF_INTERSECTION');
  assert.ok(issue);
  assert.equal(issue.risk,'review');
  assert.equal(issue.repair.action,'make_valid');
  assert.equal(issue.location.length,2);
  assert.match(issue.title,/crosses itself/i);
  assert.equal(report.issues.some(x=>x.code==='ZERO_AREA_RING'),false,'A bow-tie can have zero signed shoelace area without being a collapsed ring.');
});

test('hole outside shell is explained as reviewable geometry rather than silently removed',()=>{
  const geometry={type:'Polygon',coordinates:[
    [[0,0],[10,0],[10,10],[0,10],[0,0]],
    [[20,20],[21,20],[21,21],[20,21],[20,20]]
  ]};
  const report=health.validateCollection(fc(feature('holes',geometry)));
  const issue=report.issues.find(x=>x.code==='HOLE_OUTSIDE_SHELL');
  assert.ok(issue);
  assert.equal(issue.risk,'review');
  assert.equal(issue.repair.action,'drop_invalid_hole');
});

test('exact duplicate features are optional manual-review findings and safe repair never deletes them',()=>{
  const input=fc(feature('a',square()),feature('b',square()));
  assert.equal(health.validateCollection(input).issues.some(x=>x.code==='DUPLICATE_FEATURE'),false);
  const report=health.validateCollection(input,{rules:{duplicateFeatures:true}});
  const duplicate=report.issues.find(x=>x.code==='DUPLICATE_FEATURE');
  assert.ok(duplicate);
  assert.equal(duplicate.risk,'manual');
  assert.equal(duplicate.repair,null);
  assert.equal(health.safeRepairCollection(input).collection.features.length,2);
});

test('feature summary categories are exclusive and use the most serious issue',()=>{
  const geometry={type:'Polygon',coordinates:[[[0,0],[4,4],[4,4],[0,4],[4,0],[0,0]]]};
  const report=health.validateCollection(fc(feature('mixed',geometry)));
  assert.ok(report.issues.some(x=>x.risk==='safe'));
  assert.ok(report.issues.some(x=>x.risk==='review'));
  assert.equal(report.counts.checked,1);
  assert.equal(report.counts.review,1);
  assert.equal(report.counts.safe,0);
});

test('MultiPoint duplicate cleanup is safe and deterministic',()=>{
  const input=fc(feature('points',{type:'MultiPoint',coordinates:[[1,1],[2,2],[1,1]]}));
  assert.equal(health.validateCollection(input).featureResults[0].status,'safe');
  const result=health.safeRepairCollection(input);
  assert.deepEqual(result.collection.features[0].geometry.coordinates,[[1,1],[2,2]]);
});

test('coordinates outside WGS84 storage range are a CRS/manual-review problem',()=>{
  const report=health.validateCollection(fc(feature('projected',{type:'Point',coordinates:[500000,6960000]})));
  const issue=report.issues.find(x=>x.code==='COORDINATE_RANGE');
  assert.ok(issue);
  assert.equal(issue.risk,'manual');
  assert.match(issue.title,/CRS/i);
});

test('touching MultiPolygon parts are not called overlaps, while interior overlap is',()=>{
  const touching={type:'MultiPolygon',coordinates:[square(0,0,10).coordinates,square(10,0,10).coordinates]};
  const overlapping={type:'MultiPolygon',coordinates:[square(0,0,10).coordinates,square(5,0,10).coordinates]};
  assert.equal(health.validateCollection(fc(feature('touch',touching))).issues.some(x=>x.code==='MULTIPOLYGON_PARTS_OVERLAP'),false);
  assert.equal(health.validateCollection(fc(feature('overlap',overlapping))).issues.some(x=>x.code==='MULTIPOLYGON_PARTS_OVERLAP'),true);
});

test('optional line rules do not redefine ordinary line validity',()=>{
  const line=feature('line',{type:'LineString',coordinates:[[0,0],[2,2],[0,2],[2,0]]});
  assert.equal(health.validateCollection(fc(line)).counts.ready,1);
  const report=health.validateCollection(fc(line),{rules:{lineSelfIntersections:true,danglingEndpoints:true}});
  assert.ok(report.issues.some(x=>x.code==='LINE_SELF_INTERSECTION'&&x.risk==='manual'));
  assert.ok(report.issues.some(x=>x.code==='DANGLING_LINE_ENDPOINT'&&x.risk==='manual'));
});
