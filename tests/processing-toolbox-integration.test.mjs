import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const dataTools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../docs/assets/gis-processing-worker.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-processing.css',import.meta.url),'utf8');

const KEY='20260812-v15603-processing-tool-list-ui';
test('Processing Toolbox modules load in dependency order and the retired worker is gone',()=>{
  const order=['gis-processing-registry.js','gis-processing-core.js','editpolygon-app.js','gis-processing.js','gis-data-tools.js'].map(name=>html.indexOf(name));
  assert.ok(order.every(index=>index>=0),order);for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1],order);
  assert.match(html,new RegExp(`gis-processing\\.css\\?v=${KEY}`));
  assert.doesNotMatch(html,/gis-analysis-worker\.js/);
  assert.equal(fs.existsSync(new URL('../docs/assets/gis-analysis-worker.js',import.meta.url)),false);
});

test('application bridge exposes one declarative cancellable processing lifecycle',()=>{
  assert.match(app,/processingVersion:PROCESSING_VERSION,getProcessingCatalog:processingCatalog,previewProcessingRequest,runProcessingRequest,cancelProcessing,zoomLayer:zoomProcessingLayer/);
  const bridgeStart=app.indexOf('/* v1.56.0.3 — Processing Toolbox application bridge.');
  const bridgeEnd=app.indexOf('/* v1.56.0.3 — runtime authority boundary.');
  const bridge=app.slice(bridgeStart,bridgeEnd);
  assert.ok(bridgeStart>=0&&bridgeEnd>bridgeStart,'processing bridge markers should exist in source order');
  assert.match(bridge,/function processingSelectionIds\(\)\{[\s\S]*?EditPolygonGIS\?\.getSelection\?\.\(\)\.ids/);
  assert.match(bridge,/selectionIds:processingSelectionIds\(\)/);
  assert.doesNotMatch(bridge,/\bselectedIds\(\)/,'processing bridge must not depend on the private selection helper from an earlier lexical scope');
  assert.match(app,new RegExp(`new Worker\\('assets/gis-processing-worker\\.js\\?v=${KEY}'\\)`));
  assert.doesNotMatch(app,/function\s+gisProcess\s*\(/);
  assert.doesNotMatch(app,/function\s+processAsync\s*\(/);
  const scope=app.match(/function processingScopedFeatures\([\s\S]*?\n  \}/)?.[0]||'';
  assert.match(scope,/scope==='filtered'\?!feature\._gisFiltered:true/);
  assert.doesNotMatch(scope,/feature\.visible|visible!==false/);
  const output=app.match(/function createProcessingOutput\([\s\S]*?\n  \}/)?.[0]||'';
  assert.equal((output.match(/pushHistory\(\)/g)||[]).length,1);
  assert.ok(output.indexOf('pushHistory()')<output.indexOf('project.files.push(file)'));
  assert.match(output,/sourceFormat:'processing'/);
  assert.match(output,/gisProcessingCrs:'EPSG:4326'/);
  assert.match(output,/gisProcessing:provenance/);
  assert.match(output,/gisStyle:inheritStyle\?processingClone\(source\.gisStyle/);
  assert.match(app,/model\.style=canonicalEditableFeatureStyle\(model\.geometry,color\)/,'derived processing geometry gets geometry-family-correct defaults');
  assert.match(app,/styleOverride=processingClone\(sourceFeature\.styleOverride/);
  assert.match(app,/produced no output geometry\. The project was not changed/);
});

test('processing UI provides discovery, scopes, preflight, progress, result and cancellation on desktop/mobile',()=>{
  for(const token of ['Find a tool','Input scope','Layer visibility does not change processing membership.','Ready to run','Run and create layer','Processing completed','Zoom to result','Run again','Processing cancelled. No project data was changed.'])assert.ok(ui.includes(token),token);
  assert.match(dataTools,/data-tab="process">Processing</);
  assert.match(dataTools,/id="gisProcessingHost"/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/min-height:44px/);
});

test('processing worker delegates geometry execution to the shared core with versioned local imports',()=>{
  assert.match(worker,new RegExp(`gis-processing-registry\\.js\\?v=${KEY}`));
  assert.match(worker,new RegExp(`gis-processing-core\\.js\\?v=${KEY}`));
  assert.match(worker,/EditPolygonGISProcessingCore\.executeWithTurf/);
  assert.match(worker,/type:'progress'/);assert.match(worker,/type:'result'/);assert.match(worker,/type:'error'/);
});
