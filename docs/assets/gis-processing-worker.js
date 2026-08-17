'use strict';
const KEY='20260817-v1561-mixed-geometry-hotfix';
importScripts(
  `gis-processing-registry.js?v=${KEY}`,
  `gis-processing-core.js?v=${KEY}`,
  `gis-spatial-core.js?v=${KEY}`,
  `gis-schema-core.js?v=${KEY}`,
  `gis-crs-core.js?v=${KEY}`,
  `gis-geometry-health-core.js?v=${KEY}`,
  `gis-geos-adapter.js?v=${KEY}`,
  `gis-processing-engine.js?v=${KEY}`
);
const GEOS_ESM_URL='https://cdn.jsdelivr.net/npm/geos-wasm@3.1.1/build/package/geos.esm.js';
let geosPromise=null,turfReady=false;
function ensureTurf(){if(!turfReady){importScripts('https://unpkg.com/@turf/turf@7.2.0/turf.min.js');turfReady=!!self.turf;}if(!self.turf)throw new Error('Turf geometry helpers could not be loaded.');return self.turf;}
function ensureGeos(){if(!geosPromise)geosPromise=import(GEOS_ESM_URL).then(mod=>{if(typeof mod?.default!=='function')throw new Error('GEOS-WASM did not expose its browser initializer.');return mod.default();}).then(geos=>{self.EditPolygonGeosAdapter.assertGeos(geos);return geos;}).catch(error=>{geosPromise=null;throw error;});return geosPromise;}
function geosNeeded(tool){return tool?.engine==='geos'||tool?.engine==='geometry-health'||['nearest-feature','distance-to-nearest','select-invalid'].includes(tool?.id);}
function turfNeeded(tool){return tool?.engine==='turf'||['select-by-location','count-points-in-polygon','join-by-location','spatial-summary'].includes(tool?.id);}
self.onmessage=async event=>{const {id,task}=event.data||{};try{const tool=self.EditPolygonGISProcessingRegistry.getTool(task?.toolId),turf=turfNeeded(tool)?ensureTurf():self.turf||null,geos=geosNeeded(tool)?await ensureGeos():null;const result=await self.EditPolygonGISProcessingEngine.execute({...task,tool},{turf,geos,crs:self.EditPolygonCRS,onProgress:update=>self.postMessage({id,type:'progress',...update})});self.postMessage({id,type:'result',result});}catch(error){self.postMessage({id,type:'error',message:error?.message||String(error),stack:error?.stack||''});}};
