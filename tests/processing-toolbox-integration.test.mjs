import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const dataTools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../docs/assets/gis-processing-worker.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/gis-processing.css',import.meta.url),'utf8');
const KEY='20260821-v1561-local-import-v10';

test('Processing Toolbox modules load in dependency order and the retired worker is gone',()=>{
  const order=['gis-spatial-core.js','gis-processing-registry.js','gis-processing-core.js','gis-processing-engine.js','editpolygon-app.js','gis-processing.js','gis-data-tools.js'].map(name=>html.indexOf(name));
  assert.ok(order.every(index=>index>=0),order);for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1],order);
  assert.match(html,new RegExp(`gis-processing\\.css\\?v=${KEY}`));
  assert.doesNotMatch(html,/gis-analysis-worker\.js/);
  assert.equal(fs.existsSync(new URL('../docs/assets/gis-analysis-worker.js',import.meta.url)),false);
});

test('application bridge exposes generic layer, in-place and selection commits behind one cancellable lifecycle',()=>{
  assert.match(app,/processingVersion:PROCESSING_VERSION,getProcessingCatalog:processingCatalog,previewProcessingRequest,runProcessingRequest,cancelProcessing,zoomLayer:zoomProcessingLayer/);
  const bridgeStart=app.indexOf('/* v1.56.1 — Processing Toolbox application bridge.');
  const bridgeEnd=app.indexOf('/* v1.56.1 — runtime authority boundary.');
  const bridge=app.slice(bridgeStart,bridgeEnd);
  assert.ok(bridgeStart>=0&&bridgeEnd>bridgeStart);
  assert.match(bridge,/function processingSelectionIds\(\)[\s\S]*?EditPolygonGIS\?\.getSelection/);
  assert.match(bridge,/const inputs=\{\},inputSchemas=\{\},inputLayerIds=\{\},allFeatures=\[\]/);
  assert.match(bridge,/inputSchemas\[definition\.id\]=processingClone\(file\.gisSchema\|\|null\)/);
  assert.match(bridge,/inputLayerIds\[definition\.id\]=file\.id/);
  assert.match(bridge,/preflight\.inputFeatures\?\.\[definition\.id\]/);
  assert.match(bridge,/const processedIds=new Set\(\(preflight\.inputFeatures\?\.source\|\|\[\]\)\.map/);
  assert.doesNotMatch(bridge,/\bselectedIds\(\)/);
  assert.match(bridge,/new Worker\(`assets\/gis-processing-worker\.js\?v=\$\{PROCESSING_KEY\}`\)/);
  assert.match(bridge,/function createProcessingLayer/);
  assert.match(bridge,/function modifyProcessingSource/);
  assert.match(bridge,/function applyProcessingSelection/);
  assert.match(bridge,/function commitProcessingResult/);
  assert.match(bridge,/sourceFormat:'processing'/);
  assert.match(bridge,/gisProcessingHistory/);
  assert.equal((bridge.match(/function createProcessingLayer[\s\S]*?pushHistory\(\)/g)||[]).length,1);
  assert.equal((bridge.match(/function modifyProcessingSource[\s\S]*?pushHistory\(\)/g)||[]).length,1);
  const scope=bridge.match(/function processingScopedFeatures\([\s\S]*?\}/)?.[0]||'';
  assert.match(scope,/scope==='filtered'\?!feature\._gisFiltered:true/);
  assert.doesNotMatch(scope,/feature\.visible|visible!==false/);
});

test('processing UI provides search, generic inputs/scopes/parameters, mutation policy, progress, results and cancellation',()=>{
  for(const token of ['Find a tool','Layer visibility does not change processing membership.','Ready to run','Run and create layer','Run and modify layer','Processing completed','Zoom to result','Run again','Processing cancelled. No project data was changed.'])assert.ok(ui.includes(token),token);
  assert.match(ui,/data-processing-input/);assert.match(ui,/data-processing-scope/);assert.match(ui,/data-processing-param/);
  assert.match(dataTools,/data-tab="process">Processing</);assert.match(dataTools,/id="gisProcessingHost"/);assert.match(dataTools,/openProcessing/);
  assert.match(css,/@media\(max-width:560px\)/);assert.match(css,/min-height:44px/);
});

test('processing worker delegates execution to shared processing, spatial and GEOS engines',()=>{
  assert.match(worker,/gis-processing-registry\.js\?v=\$\{KEY\}/);
  assert.match(worker,/gis-processing-core\.js\?v=\$\{KEY\}/);
  assert.match(worker,/gis-spatial-core\.js\?v=\$\{KEY\}/);
  assert.match(worker,/gis-geos-adapter\.js\?v=\$\{KEY\}/);
  assert.match(worker,/gis-processing-engine\.js\?v=\$\{KEY\}/);
  assert.match(worker,/EditPolygonGISProcessingEngine\.execute/);
  assert.match(worker,/type:'progress'/);assert.match(worker,/type:'result'/);assert.match(worker,/type:'error'/);
});

test('Simple Editor delegates serious GIS processing to the Toolbox and keeps only direct shape editing',()=>{
  const simpleGeometry=html.slice(html.indexOf('id="geometryActionSelect"'),html.indexOf('id="runGeometryBtn"'));
  for(const token of ['value="clip">','value="erase">','value="repair">','value="simplify">','value="merge">','value="cut">','value="intersect">'])assert.doesNotMatch(simpleGeometry,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const name of ['runClip','runEraseMultiple','runRepair','runSimplify','mergePicked','cutSelectedFromActive','runIntersect','repairGeometryObject','simplifyGeometryKilometres'])assert.doesNotMatch(app,new RegExp(`function\\s+${name}\\s*\\(`));
  assert.doesNotMatch(app,/data-a="repairfeat"|data-a="simplifyfeat"/);
  assert.match(html,/value="splitLine">Split active/);assert.match(html,/value="offset">Offset \/ inset active/);assert.match(html,/value="smooth">Smooth active/);
  assert.match(app,/panelProcessing/);assert.match(app,/Process selected/);assert.match(app,/openProcessing\?\.\(r\.file\.id,'','selected'\)/);
  assert.match(dataTools,/openProcessing:\(id,toolId='',scope=''\)/);assert.match(ui,/sourceScope=''/);
});
