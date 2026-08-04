import fs from 'node:fs';
const req=['docs/index.html','docs/assets/editpolygon-app.js','docs/assets/gis-core.js','docs/assets/gis-remote-source.js','docs/assets/gis-workspace.js','docs/assets/gis-data-core.js','docs/assets/gis-data-tools.js','docs/assets/gis-data-tools.css','docs/assets/gis-crs-core.js','docs/assets/gis-analysis-core.js','docs/assets/gis-analysis-worker.js','docs/assets/gis-style-core.js','docs/assets/editpolygon-mobile.css','docs/assets/editpolygon-mobile.js','docs/crs-reprojection-guide/index.html'];
for(const p of req){if(!fs.existsSync(p))throw new Error('Missing '+p);}
const html=fs.readFileSync('docs/index.html','utf8');for(const n of ['gis-data-core.js','gis-crs-core.js','gis-remote-source.js','gis-analysis-core.js','gis-style-core.js','gis-data-tools.js','gis-data-tools.css','editpolygon-mobile.css','editpolygon-mobile.js'])if(!html.includes(n))throw new Error('index missing '+n);
if(fs.existsSync('public'))throw new Error('Repository must use docs/, not public/.');
console.log('Repository integration checks passed.');
