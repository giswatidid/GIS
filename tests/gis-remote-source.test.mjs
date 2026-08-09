import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/gis-remote-source.js',import.meta.url),'utf8');
const context={console,URL,URLSearchParams,JSON,Math,Date,Error};
context.window=context;
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'gis-remote-source.js'});
const remote=context.EditPolygonRemoteSource;

function response(body,{status=200,contentType='application/json',statusText='OK'}={}){
  const text=typeof body==='string'?body:JSON.stringify(body);
  return {
    ok:status>=200&&status<300,
    status,
    statusText,
    headers:{get:name=>String(name).toLowerCase()==='content-type'?contentType:''},
    text:async()=>text
  };
}

function mockFetch(routes){
  return async (input,init={})=>{
    const url=String(input);
    const method=String(init.method||'GET').toUpperCase();
    const body=init.body instanceof URLSearchParams?init.body.toString():String(init.body||'');
    const route=routes.find(entry=>{
      const urlMatches=typeof entry.match==='string'?url===entry.match:entry.match.test(url);
      const methodMatches=!entry.method||String(entry.method).toUpperCase()===method;
      const bodyMatches=!entry.requestBody||(typeof entry.requestBody==='string'?body===entry.requestBody:entry.requestBody.test(body));
      return urlMatches&&methodMatches&&bodyMatches;
    });
    if(!route)throw new Error(`Unexpected request: ${method} ${url}${body?` body=${body}`:''}`);
    return response(route.body,route.options);
  };
}

test('classifies common ArcGIS and GeoJSON links',()=>{
  assert.equal(remote.classify('https://example.com/ArcGIS/rest/services').type,'arcgis-directory');
  assert.equal(remote.classify('https://example.com/ArcGIS/rest/services/Test/FeatureServer').type,'arcgis-service');
  assert.equal(remote.classify('https://example.com/ArcGIS/rest/services/Test/FeatureServer/2').type,'arcgis-layer');
  assert.equal(remote.classify('https://example.com/ArcGIS/rest/services/Test/FeatureServer/2/query?where=1%3D1').type,'arcgis-query');
  assert.equal(remote.classify('https://www.arcgis.com/home/item.html?id=0123456789abcdef0123456789abcdef').type,'arcgis-item');
  assert.equal(remote.classify('https://example.com/data.geojson').type,'geojson');
});

test('builds a safe GeoJSON query while preserving user filters',()=>{
  const built=remote.buildQueryUrl('https://example.com/Test/FeatureServer/0/query?where=status%3D%27OPEN%27&outFields=name,status&f=html');
  const url=new URL(built);
  assert.equal(url.pathname,'/Test/FeatureServer/0/query');
  assert.equal(url.searchParams.get('where'),"status='OPEN'");
  assert.equal(url.searchParams.get('outFields'),'name,status');
  assert.equal(url.searchParams.get('returnGeometry'),'true');
  assert.equal(url.searchParams.get('outSR'),'4326');
  assert.equal(url.searchParams.get('f'),'geojson');
});

test('discovers services and folders from an ArcGIS directory link',async()=>{
  const fetchFn=mockFetch([
    {match:'https://services.example.com/abc/ArcGIS/rest/services?f=json',body:{
      services:[
        {name:'VwEnergexOutages',type:'FeatureServer'},
        {name:'ReferenceMap',type:'MapServer'},
        {name:'Unsupported',type:'GeometryServer'}
      ],
      folders:['Emergency']
    }}
  ]);
  const result=await remote.discover('https://services.example.com/abc/ArcGIS/rest/services',{fetchFn});
  assert.equal(result.kind,'choose-service');
  assert.equal(result.services.length,2);
  assert.equal(result.services[0].url,'https://services.example.com/abc/ArcGIS/rest/services/VwEnergexOutages/FeatureServer');
  assert.equal(result.folders[0].url,'https://services.example.com/abc/ArcGIS/rest/services/Emergency');
});

test('discovers layers from a FeatureServer and resolves the selected layer',async()=>{
  const fetchFn=mockFetch([
    {match:'https://services.example.com/Test/FeatureServer?f=json',body:{mapName:'Outages',layers:[{id:0,name:'Current outages',geometryType:'esriGeometryPoint'},{id:1,name:'Affected areas',geometryType:'esriGeometryPolygon'}]}},
    {match:'https://services.example.com/Test/FeatureServer/0?f=json',body:{name:'Current outages',geometryType:'esriGeometryPoint',capabilities:'Query',extent:{spatialReference:{latestWkid:7844}}}},
    {match:'https://services.example.com/Test/FeatureServer/0/query',method:'POST',requestBody:/where=1%3D1&returnCountOnly=true&f=json/,body:{count:37}}
  ]);
  const service=await remote.discover('https://services.example.com/Test/FeatureServer',{fetchFn});
  assert.equal(service.kind,'choose-layer');
  assert.equal(service.layers.length,2);
  const layer=await remote.discover(service.layers[0].url,{fetchFn});
  assert.equal(layer.kind,'ready');
  assert.equal(layer.name,'Current outages');
  assert.equal(layer.featureCount,37);
  assert.equal(layer.sourceCrs,'EPSG:7844');
  assert.equal(layer.geometryLabel,'Points');
});

test('resolves an ArcGIS item page to its underlying public service',async()=>{
  const itemId='0123456789abcdef0123456789abcdef';
  const fetchFn=mockFetch([
    {match:`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`,body:{id:itemId,title:'Public outages',type:'Feature Service',url:'https://services.example.com/Outages/FeatureServer'}},
    {match:'https://services.example.com/Outages/FeatureServer?f=json',body:{mapName:'Public outages',layers:[{id:0,name:'Outages',geometryType:'esriGeometryPoint'}]}},
    {match:'https://services.example.com/Outages/FeatureServer/0?f=json',body:{name:'Outages',geometryType:'esriGeometryPoint',extent:{spatialReference:{wkid:4326}}}},
    {match:'https://services.example.com/Outages/FeatureServer/0/query',method:'POST',requestBody:/where=1%3D1&returnCountOnly=true&f=json/,body:{count:12}}
  ]);
  const result=await remote.discover(`https://www.arcgis.com/home/item.html?id=${itemId}`,{fetchFn});
  assert.equal(result.kind,'ready');
  assert.equal(result.name,'Outages');
  assert.equal(result.featureCount,12);
  assert.equal(result.item.title,'Public outages');
});

test('recognises direct GeoJSON and retains the downloaded data for import',async()=>{
  const data={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'A'},geometry:{type:'Point',coordinates:[153,-27]}}]};
  const result=await remote.discover('https://example.com/live.geojson',{fetchFn:mockFetch([{match:'https://example.com/live.geojson',body:data}])});
  assert.equal(result.kind,'ready');
  assert.equal(result.sourceType,'geojson');
  assert.equal(result.featureCount,1);
  assert.equal(result.cachedData.features[0].properties.name,'A');
});

test('turns an HTML response into an actionable message rather than a JSON parser error',async()=>{
  const fetchFn=mockFetch([{match:'https://services.example.com/bad/ArcGIS/rest/services?f=json',body:'<!doctype html><html><body>Not found</body></html>',options:{status:404,contentType:'text/html',statusText:'Not Found'}}]);
  await assert.rejects(
    remote.discover('https://services.example.com/bad/ArcGIS/rest/services',{fetchFn}),
    error=>error.code==='html-response'&&/opened a webpage rather than spatial data/i.test(error.message)&&!/unexpected token/i.test(error.message)
  );
});
