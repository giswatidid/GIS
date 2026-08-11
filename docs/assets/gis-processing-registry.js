(function(global){
'use strict';

const VERSION='1.56.0.1';
const categories=Object.freeze([
  Object.freeze({id:'geometry',title:'Vector geometry',description:'Create derived geometry from one input layer.'}),
  Object.freeze({id:'overlay',title:'Overlay',description:'Compare or trim one layer using polygon geometry from another layer.'}),
  Object.freeze({id:'aggregation',title:'Aggregation',description:'Combine multiple source features into a derived result.'})
]);

const tools=Object.freeze([
  Object.freeze({
    id:'buffer',title:'Buffer',category:'geometry',keywords:['distance','corridor','zone','radius'],
    description:'Create polygon buffers around every input feature.',sourceFamilies:['point','line','polygon'],outputGeometry:'Polygon',execution:'per-feature',crsPolicy:'geodesic',stylePolicy:'derived',
    parameters:Object.freeze([
      Object.freeze({id:'distance',label:'Distance',type:'number',required:true,default:1,nonZero:true,min:0,step:.1}),
      Object.freeze({id:'units',label:'Units',type:'select',default:'kilometers',options:Object.freeze([{value:'meters',label:'metres'},{value:'kilometers',label:'kilometres'},{value:'miles',label:'miles'}])}),
      Object.freeze({id:'steps',label:'Curve detail',type:'integer',default:16,min:8,max:64,step:1,advanced:true,help:'Segments per quarter circle. Higher values create smoother buffers.'})
    ])
  }),
  Object.freeze({
    id:'centroid',title:'Centroids',category:'geometry',keywords:['centre','center','point','middle'],
    description:'Create one centroid point for each input feature.',sourceFamilies:['point','line','polygon'],outputGeometry:'Point',execution:'per-feature',crsPolicy:'canonical',stylePolicy:'derived',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'point-on-feature',title:'Point on surface',category:'geometry',keywords:['inside','representative','point','surface'],
    description:'Create a representative point guaranteed to lie on each input feature where possible.',sourceFamilies:['point','line','polygon'],outputGeometry:'Point',execution:'per-feature',crsPolicy:'canonical',stylePolicy:'derived',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'convex-hull',title:'Convex hull',category:'geometry',keywords:['hull','envelope','extent','boundary'],
    description:'Create the smallest convex polygon enclosing all input coordinates.',sourceFamilies:['point','line','polygon'],outputGeometry:'Polygon',execution:'aggregate',crsPolicy:'canonical',stylePolicy:'derived',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'bbox',title:'Bounding rectangle',category:'geometry',keywords:['bbox','bounding box','extent','rectangle'],
    description:'Create one rectangular polygon covering the full input extent.',sourceFamilies:['point','line','polygon'],outputGeometry:'Polygon',execution:'aggregate',crsPolicy:'canonical',stylePolicy:'derived',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'clip',title:'Clip',category:'overlay',keywords:['trim','mask','inside','crop'],
    description:'Keep the portions of the source features inside the polygon overlay layer.',sourceFamilies:['point','line','polygon'],overlayFamilies:['polygon'],outputGeometry:'Same as input',execution:'overlay',crsPolicy:'canonical',stylePolicy:'inherit',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'intersection',title:'Intersection',category:'overlay',keywords:['overlap','intersect','common','overlay'],
    description:'Create source geometry where it overlaps the polygon overlay. v1.56.0.1 retains source attributes; full two-layer attribute overlay is planned for v1.56.1.',sourceFamilies:['point','line','polygon'],overlayFamilies:['polygon'],outputGeometry:'Same as input',execution:'overlay',crsPolicy:'canonical',stylePolicy:'inherit',parameters:Object.freeze([])
  }),
  Object.freeze({
    id:'dissolve',title:'Dissolve',category:'aggregation',keywords:['merge','combine','boundaries','internal boundaries'],
    description:'Merge polygon features and remove internal boundaries to create one polygon or multipolygon result.',sourceFamilies:['polygon'],outputGeometry:'Polygon',execution:'aggregate',crsPolicy:'canonical',stylePolicy:'derived',parameters:Object.freeze([])
  })
]);

const byId=new Map(tools.map(tool=>[tool.id,tool]));
const categoryById=new Map(categories.map(category=>[category.id,category]));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function getTool(id){const tool=byId.get(String(id||''));return tool?clone(tool):null;}
function getCategory(id){const category=categoryById.get(String(id||''));return category?clone(category):null;}
function getTools(){return clone(tools);}
function getCategories(){return clone(categories);}
function search(query=''){
  const terms=String(query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return getTools();
  return tools.filter(tool=>{const category=categoryById.get(tool.category);const haystack=[tool.title,tool.description,category?.title,...(tool.keywords||[])].join(' ').toLocaleLowerCase();return terms.every(term=>haystack.includes(term));}).map(clone);
}
function requiresOverlay(toolOrId){const tool=typeof toolOrId==='string'?byId.get(toolOrId):toolOrId;return !!tool?.overlayFamilies?.length;}

const api={version:VERSION,getTool,getCategory,getTools,getCategories,search,requiresOverlay};
global.EditPolygonGISProcessingRegistry=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
