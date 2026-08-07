import fs from 'node:fs';
const req=[
  'docs/index.html','docs/assets/editpolygon-app.js','docs/assets/gis-core.js','docs/assets/gis-remote-source.js','docs/assets/gis-workspace.js',
  'docs/assets/gis-data-core.js','docs/assets/gis-schema-core.js','docs/assets/gis-data-tools.js','docs/assets/gis-data-tools.css',
  'docs/assets/gis-crs-core.js','docs/assets/gis-analysis-core.js','docs/assets/gis-analysis-worker.js','docs/assets/gis-join-core.js','docs/assets/gis-join-worker.js',
  'docs/assets/gis-style-core.js','docs/assets/editpolygon-mobile.css','docs/assets/editpolygon-mobile.js','docs/crs-reprojection-guide/index.html'
];
for(const path of req)if(!fs.existsSync(path))throw new Error('Missing '+path);
const html=fs.readFileSync('docs/index.html','utf8');
for(const name of ['gis-data-core.js','gis-schema-core.js','gis-crs-core.js','gis-remote-source.js','gis-analysis-core.js','gis-join-core.js','gis-style-core.js','gis-data-tools.js','gis-data-tools.css','editpolygon-mobile.css','editpolygon-mobile.js'])if(!html.includes(name))throw new Error('index missing '+name);
if(html.indexOf('gis-join-core.js')>html.indexOf('editpolygon-app.js'))throw new Error('Join core must load before the application.');
const app=fs.readFileSync('docs/assets/editpolygon-app.js','utf8');
for(const token of ['previewAttributeJoin','executeAttributeJoin','previewGroupSummary','executeGroupSummary','previewSpatialJoin','executeSpatialJoin'])if(!app.includes(token))throw new Error('Application missing '+token);
const tools=fs.readFileSync('docs/assets/gis-data-tools.js','utf8');
if(!tools.includes('Join & summarize'))throw new Error('Join and summarize interface is missing.');
if(fs.existsSync('public'))throw new Error('Repository must use docs/, not public/.');
console.log('Repository integration checks passed.');
