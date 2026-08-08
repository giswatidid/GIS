import fs from 'node:fs';
const req=[
  'docs/index.html','docs/assets/editpolygon-map-adapter.js','docs/assets/editpolygon-app.js','docs/assets/gis-core.js','docs/assets/gis-remote-source.js','docs/assets/gis-workspace.js',
  'docs/assets/gis-data-core.js','docs/assets/gis-schema-core.js','docs/assets/gis-data-tools.js','docs/assets/gis-data-tools.css',
  'docs/assets/gis-crs-core.js','docs/assets/gis-analysis-core.js','docs/assets/gis-analysis-worker.js','docs/assets/gis-join-core.js','docs/assets/gis-join-worker.js',
  'docs/assets/gis-style-core.js','docs/assets/gis-geometry-health-core.js','docs/assets/gis-geos-adapter.js','docs/assets/gis-geometry-health-worker.js','docs/assets/gis-geometry-health.js','docs/assets/gis-geometry-health.css','docs/assets/editpolygon-mobile.css','docs/assets/editpolygon-mobile.js','docs/crs-reprojection-guide/index.html'
];
for(const path of req)if(!fs.existsSync(path))throw new Error('Missing '+path);
const html=fs.readFileSync('docs/index.html','utf8');
for(const name of ['editpolygon-map-adapter.js','gis-data-core.js','gis-schema-core.js','gis-crs-core.js','gis-remote-source.js','gis-analysis-core.js','gis-join-core.js','gis-style-core.js','gis-geometry-health-core.js','gis-geometry-health.js','gis-geometry-health.css','gis-data-tools.js','gis-data-tools.css','editpolygon-mobile.css','editpolygon-mobile.js'])if(!html.includes(name))throw new Error('index missing '+name);
if(html.indexOf('editpolygon-map-adapter.js')>html.indexOf('editpolygon-app.js'))throw new Error('Map adapter must load before the application.');
if(html.indexOf('leaflet@1.9.4/dist/leaflet.js')>html.indexOf('editpolygon-map-adapter.js'))throw new Error('Leaflet must load before the v1.55.0 Leaflet adapter.');
if(html.indexOf('gis-join-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Join core must load before the application.');
if(html.indexOf('gis-geometry-health-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Geometry Health core must load before the application.');
if(html.indexOf('gis-geometry-health.js')<html.indexOf('editpolygon-app.js'))throw new Error('Geometry Health UI must load after the application.');
const app=fs.readFileSync('docs/assets/editpolygon-app.js','utf8');
const mapAdapter=fs.readFileSync('docs/assets/editpolygon-map-adapter.js','utf8');
for(const token of ['createLeafletRuntime','lonLatToPixel','pixelToLonLat','fitExtent','setPanEnabled','setDoubleClickZoomEnabled','nativePanLooksActive','recoverNativePan'])if(!mapAdapter.includes(token))throw new Error('Map adapter missing '+token);
for(const token of ['MAP_RUNTIME','window.EditPolygonMap=MAP_RUNTIME','createLeafletRuntime'])if(!app.includes(token))throw new Error('Application missing map abstraction '+token);
for(const token of ['previewAttributeJoin','executeAttributeJoin','previewGroupSummary','executeGroupSummary','previewSpatialJoin','executeSpatialJoin'])if(!app.includes(token))throw new Error('Application missing '+token);
for(const token of ['getGeometryHealthLayer','createGeometryHealthLayer','focusGeometryHealthIssue','previewGeometryHealthProposal'])if(!app.includes(token))throw new Error('Application missing Geometry Health bridge '+token);
const health=fs.readFileSync('docs/assets/gis-geometry-health.js','utf8');
for(const token of ['Check & fix geometry','Safe to fix','Needs review','Manual review','Create repaired layer','GEOS verified','Repair engine:'])if(!health.includes(token))throw new Error('Geometry Health UI missing '+token);

const healthWorker=fs.readFileSync('docs/assets/gis-geometry-health-worker.js','utf8');
for(const token of ['gis-geos-adapter.js','geos-wasm@3.1.1','GEOS-WASM','robustEngine','makeValidPolygonFeature'])if(!healthWorker.includes(token))throw new Error('Geometry Health worker missing robust engine integration '+token);

const tools=fs.readFileSync('docs/assets/gis-data-tools.js','utf8');
if(!tools.includes('Join & summarize'))throw new Error('Join and summarize interface is missing.');
if(fs.existsSync('public'))throw new Error('Repository must use docs/, not public/.');
console.log('Repository integration checks passed.');
