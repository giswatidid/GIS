'use strict';
let ready=false;
function ensureProcessingRuntime(){
  if(ready&&self.turf&&self.EditPolygonGISProcessingCore)return;
  if(!self.turf)importScripts('https://unpkg.com/@turf/turf@7.2.0/turf.min.js');
  if(!self.EditPolygonGISProcessingRegistry)importScripts('gis-processing-registry.js?v=20260812-v15602-processing-tool-list-ui');
  if(!self.EditPolygonGISProcessingCore)importScripts('gis-processing-core.js?v=20260812-v15602-processing-tool-list-ui');
  if(!self.turf||!self.EditPolygonGISProcessingCore)throw Error('The browser processing engine could not be loaded.');
  ready=true;
}
self.onmessage=event=>{
  const {id,task}=event.data||{};
  try{
    ensureProcessingRuntime();
    const result=self.EditPolygonGISProcessingCore.executeWithTurf(task,{turf:self.turf,onProgress:update=>self.postMessage({id,type:'progress',...update})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',message:error?.message||String(error)});}
};
