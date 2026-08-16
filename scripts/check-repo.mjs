import fs from 'node:fs';

const req=[
  'docs/index.html','docs/assets/editpolygon-project-format.js','docs/assets/editpolygon-map-adapter.js','docs/assets/editpolygon-openlayers.css','docs/assets/editpolygon-app.js','docs/assets/gis-core.js','docs/assets/gis-remote-source.js','docs/assets/gis-workspace.js',
  'docs/assets/gis-data-core.js','docs/assets/gis-schema-core.js','docs/assets/gis-data-tools.js','docs/assets/gis-data-tools.css','docs/assets/gis-crs-core.js','docs/assets/gis-analysis-core.js','docs/assets/gis-spatial-core.js','docs/assets/gis-processing-registry.js','docs/assets/gis-processing-core.js','docs/assets/gis-processing-engine.js','docs/assets/gis-processing-worker.js','docs/assets/gis-processing.js','docs/assets/gis-processing.css','docs/assets/gis-join-core.js','docs/assets/gis-join-worker.js','docs/assets/gis-style-core.js','docs/assets/gis-geometry-health-core.js','docs/assets/gis-geos-adapter.js','docs/assets/gis-geometry-health-worker.js','docs/assets/gis-geometry-health.js','docs/assets/gis-geometry-health.css','docs/assets/editpolygon-mobile.css','docs/assets/editpolygon-mobile.js','docs/crs-reprojection-guide/index.html',
  'ARCHITECTURE.md','CHANGELOG.md','QUALITY_BASELINE.md','RELEASE_MANIFEST.md'
];
for(const p of req)if(!fs.existsSync(p))throw new Error('Missing '+p);
const html=fs.readFileSync('docs/index.html','utf8');
for(const name of ['editpolygon-project-format.js','editpolygon-map-adapter.js','editpolygon-openlayers.css','gis-data-core.js','gis-schema-core.js','gis-crs-core.js','gis-remote-source.js','gis-analysis-core.js','gis-spatial-core.js','gis-processing-registry.js','gis-processing-core.js','gis-processing-engine.js','gis-processing.js','gis-processing.css','gis-join-core.js','gis-style-core.js','gis-geometry-health-core.js','gis-geometry-health.js','gis-geometry-health.css','gis-data-tools.js','gis-data-tools.css','editpolygon-mobile.css','editpolygon-mobile.js'])if(!html.includes(name))throw new Error('index missing '+name);
if(html.indexOf('jszip.min.js')>html.indexOf('editpolygon-project-format.js'))throw new Error('JSZip must load before the project-format module.');
if(html.indexOf('editpolygon-project-format.js')>html.indexOf('editpolygon-app.js'))throw new Error('Project-format module must load before the application.');
if(html.indexOf('editpolygon-map-adapter.js')>html.indexOf('editpolygon-app.js'))throw new Error('Map adapter must load before the application.');
if(!html.includes('cdn.jsdelivr.net/npm/ol@v10.9.0/dist/ol.js'))throw new Error('OpenLayers runtime is not wired into the page.');
if(/unpkg\.com\/leaf/i.test(html))throw new Error('Retired map-runtime dependency is still wired into the page.');
if(html.indexOf('gis-processing-registry.js')>html.indexOf('editpolygon-app.js')||html.indexOf('gis-processing-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Processing registry/core must load before the application.');
if(html.indexOf('gis-processing.js')<html.indexOf('editpolygon-app.js')||html.indexOf('gis-processing.js')>html.indexOf('gis-data-tools.js'))throw new Error('Processing UI must load after the application and before data tools.');
if(fs.existsSync('docs/assets/gis-analysis-worker.js'))throw new Error('Retired analysis processing worker is still packaged.');
if(html.indexOf('gis-join-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Join core must load before the application.');
if(html.indexOf('gis-geometry-health-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Geometry Health core must load before the application.');
if(html.indexOf('gis-geometry-health.js')<html.indexOf('editpolygon-app.js'))throw new Error('Geometry Health UI must load after the application.');

const app=fs.readFileSync('docs/assets/editpolygon-app.js','utf8');
const adapter=fs.readFileSync('docs/assets/editpolygon-map-adapter.js','utf8');
for(const token of ['createRuntime','createEditableVectorLayer','editableFeatureIdsAtPixel','updateEditableFeatureGeometry','createTileLayer','createWmsLayer','createGeoJsonLayer','createStaticImageLayer','createDomOverlay','setDisplayLayerOpacity','setDisplayLayerVisible','setDisplayLayerZIndex','lonLatToPixel','pixelToLonLat','fitExtent','setPanEnabled','setDoubleClickZoomEnabled'])if(!adapter.includes(token))throw new Error('Map adapter missing '+token);
for(const forbidden of ['requestedEngine','fallbackReason','create'+'Lea'+'fletRuntime','createOpenLayersRuntime','getNativeMap','nativePanLooksActive','recoverNativePan','ensureDisplayPane','prefersPersistentEditableVectorSource','supportsFocusedEditableOverlay','__editpolygonEngine'])if(adapter.includes(forbidden))throw new Error('Retired runtime contract remains: '+forbidden);
for(const token of ['MAP_RUNTIME','window.EditPolygonMap=MAP_RUNTIME','buildRuntimeCachedLayer','MAP_RUNTIME.createEditableVectorLayer','EDITPOLYGON_RUNTIME_AUTHORITY'])if(!app.includes(token))throw new Error('Application missing runtime integration '+token);
if(app.includes('buildOpenLayersCachedLayer'))throw new Error('Old OpenLayers-specific cached renderer returned.');
if(/\bol\.[A-Za-z_$]/.test(app))throw new Error('Application bypasses the map adapter with direct OpenLayers calls.');
if(/\bL\.[A-Za-z_$]/.test(app))throw new Error('Retired native-map calls remain in the application.');
for(const token of ['window.syncReferenceMapLayers=syncReferenceMapLayers','MAP_RUNTIME.createGeoJsonLayer','MAP_RUNTIME.createStaticImageLayer','referenceLayerZIndex'])if(!app.includes(token))throw new Error('Application missing reference integration '+token);
for(const token of ['parityBridge','getLegacyMap','syncLegacy'])if(app.includes(token)||adapter.includes(token))throw new Error('Obsolete compatibility token remains: '+token);
for(const token of ['previewAttributeJoin','executeAttributeJoin','previewGroupSummary','executeGroupSummary','previewSpatialJoin','executeSpatialJoin'])if(!app.includes(token))throw new Error('Application missing '+token);
for(const token of ['getGeometryHealthLayer','createGeometryHealthLayer','focusGeometryHealthIssue','previewGeometryHealthProposal'])if(!app.includes(token))throw new Error('Application missing Geometry Health bridge '+token);
const health=fs.readFileSync('docs/assets/gis-geometry-health.js','utf8');
for(const token of ['Check & fix geometry','Safe to fix','Needs review','Manual review','Create repaired layer','GEOS verified','Repair engine:'])if(!health.includes(token))throw new Error('Geometry Health UI missing '+token);
const healthWorker=fs.readFileSync('docs/assets/gis-geometry-health-worker.js','utf8');
for(const token of ['gis-geos-adapter.js','geos-wasm@3.1.1','GEOS-WASM','robustEngine','makeValidPolygonFeature'])if(!healthWorker.includes(token))throw new Error('Geometry Health worker missing robust engine integration '+token);
const processingRegistry=fs.readFileSync('docs/assets/gis-processing-registry.js','utf8');
const processingCore=fs.readFileSync('docs/assets/gis-processing-core.js','utf8');
const processingUi=fs.readFileSync('docs/assets/gis-processing.js','utf8');
const processingWorker=fs.readFileSync('docs/assets/gis-processing-worker.js','utf8');
const processingEngine=fs.readFileSync('docs/assets/gis-processing-engine.js','utf8');
const spatialCore=fs.readFileSync('docs/assets/gis-spatial-core.js','utf8');
for(const token of ['buffer','union','intersection','difference','symmetric-difference','clip','dissolve','multipart-to-singlepart','select-by-attribute','select-by-location','nearest-feature','join-by-location','fix-geometries','snap','simplify','densify'])if(!processingRegistry.includes(`id:'${token}'`))throw new Error('Processing registry missing '+token);
for(const token of ['normaliseRequest','preflight','createProvenance','resolveProcessingCrs'])if(!processingCore.includes(token))throw new Error('Processing core missing '+token);
for(const token of ['Run and create layer','Run and modify layer','Layer visibility does not change processing membership.'])if(!processingUi.includes(token))throw new Error('Processing UI missing '+token);
for(const token of ['EditPolygonGISProcessingEngine.execute','gis-processing-engine.js','gis-spatial-core.js','gis-geos-adapter.js'])if(!processingWorker.includes(token))throw new Error('Processing worker missing shared engine integration '+token);
for(const token of ['dissolveGeometry','geosOverlay','executeSpatial','applySelectionMode'])if(!processingEngine.includes(token))throw new Error('Processing engine missing '+token);
for(const token of ['buildSpatialIndex','relation','nearestFeature','aggregate'])if(!spatialCore.includes(token))throw new Error('Spatial core missing '+token);
const tools=fs.readFileSync('docs/assets/gis-data-tools.js','utf8');
if(!tools.includes('Join & summarize'))throw new Error('Join and summarize interface is missing.');
if(fs.existsSync('public'))throw new Error('Repository must use docs/, not public/.');
if(!fs.existsSync('.gitignore'))throw new Error('Repository housekeeping is missing .gitignore.');
console.log('Repository integration checks passed.');
