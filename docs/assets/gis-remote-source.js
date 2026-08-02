(function(global){
  'use strict';

  const VERSION='1.45.3';
  const ARCGIS_SERVICE=/\/(FeatureServer|MapServer)(?:\/(\d+))?(?:\/query)?\/?$/i;
  const ITEM_ID=/^[0-9a-f]{32}$/i;

  class RemoteSourceError extends Error{
    constructor(code,message,details={}){
      super(message);
      this.name='RemoteSourceError';
      this.code=code||'remote-source-error';
      this.details=details&&typeof details==='object'?details:{};
    }
  }

  function cleanText(value){return String(value??'').trim();}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

  function extractUrl(input){
    const value=cleanText(input);
    if(!value)return '';
    const match=value.match(/https?:\/\/[^\s<>"']+/i);
    return (match?match[0]:value).replace(/[),.;]+$/,'');
  }

  function parseUrl(input){
    const value=extractUrl(input);
    if(!value)throw new RemoteSourceError('missing-url','Paste a web data link first.');
    let url;
    try{url=new URL(value);}catch(_){throw new RemoteSourceError('invalid-url','Enter a complete http or https web address.');}
    if(!/^https?:$/i.test(url.protocol))throw new RemoteSourceError('invalid-url','Only http and https web addresses are supported.');
    return url;
  }

  function itemIdFromUrl(url){
    const direct=url.searchParams.get('id');
    if(direct&&ITEM_ID.test(direct))return direct;
    const match=url.pathname.match(/\/sharing\/rest\/content\/items\/([0-9a-f]{32})(?:\/|$)/i);
    return match?.[1]||'';
  }

  function classify(input){
    let url;
    try{url=parseUrl(input);}catch(_){return {type:'invalid',url:extractUrl(input)};}
    const pathname=url.pathname.replace(/\/+$/,'');
    const itemId=itemIdFromUrl(url);
    if(itemId)return {type:'arcgis-item',url:url.href,itemId};
    const layerQuery=pathname.match(/\/(FeatureServer|MapServer)\/(\d+)\/query$/i);
    if(layerQuery)return {type:'arcgis-query',url:url.href,serviceType:layerQuery[1],layerId:Number(layerQuery[2])};
    const layer=pathname.match(/\/(FeatureServer|MapServer)\/(\d+)$/i);
    if(layer)return {type:'arcgis-layer',url:url.href,serviceType:layer[1],layerId:Number(layer[2])};
    const service=pathname.match(/\/(FeatureServer|MapServer)$/i);
    if(service)return {type:'arcgis-service',url:url.href,serviceType:service[1]};
    if(/\/rest\/services(?:\/.*)?$/i.test(pathname))return {type:'arcgis-directory',url:url.href};
    if(/\.(?:geojson|json)(?:$|\?)/i.test(url.href))return {type:'geojson',url:url.href};
    return {type:'unknown',url:url.href};
  }

  function setFormat(input,format='json'){
    const url=parseUrl(input);
    url.searchParams.set('f',format);
    return url.href;
  }

  function withoutQuery(input){
    const url=parseUrl(input);
    url.search='';
    url.hash='';
    return url.href.replace(/\/$/,'');
  }

  function arcgisLayerBase(input){
    const url=parseUrl(input);
    url.hash='';
    url.pathname=url.pathname.replace(/\/query\/?$/i,'').replace(/\/$/,'');
    url.search='';
    return url.href.replace(/\/$/,'');
  }

  function arcgisServiceBase(input){
    return arcgisLayerBase(input).replace(/\/(\d+)$/,'');
  }

  function arcgisRoot(input){
    const url=parseUrl(input);
    const match=url.pathname.match(/^(.*?\/rest\/services)(?:\/.*)?$/i);
    if(!match)return '';
    return `${url.origin}${match[1]}`.replace(/\/$/,'');
  }

  function portalRoot(input){
    const url=parseUrl(input);
    const sharingIndex=url.pathname.toLowerCase().indexOf('/sharing/rest/');
    if(sharingIndex>=0)return `${url.origin}${url.pathname.slice(0,sharingIndex)}`.replace(/\/$/,'');
    const homeIndex=url.pathname.toLowerCase().indexOf('/home/');
    if(homeIndex>=0)return `${url.origin}${url.pathname.slice(0,homeIndex)}`.replace(/\/$/,'');
    return url.origin;
  }

  function contentType(response){return String(response?.headers?.get?.('content-type')||'').toLowerCase();}

  function arcgisErrorMessage(payload,fallback='The ArcGIS server could not complete the request.'){
    const error=payload?.error;
    if(!error)return fallback;
    const details=Array.isArray(error.details)?error.details.filter(Boolean):[];
    return [error.message,...details].filter(Boolean).join(' — ')||fallback;
  }

  async function fetchJson(input,{fetchFn=global.fetch,allowHtml=false}={}){
    if(typeof fetchFn!=='function')throw new RemoteSourceError('network-unavailable','This browser cannot make the remote request.');
    const url=extractUrl(input);
    let response;
    try{response=await fetchFn(url,{credentials:'omit',referrerPolicy:'no-referrer'});}catch(error){
      throw new RemoteSourceError('network-failed','The address could not be reached. Check the link, your connection, and whether the provider permits browser access.',{url,cause:error?.message||String(error)});
    }
    let text='';
    try{text=await response.text();}catch(error){throw new RemoteSourceError('read-failed','The provider responded, but EditPolygon could not read the response.',{url,cause:error?.message||String(error)});}
    const trimmed=text.trim();
    let payload=null;
    if(trimmed){
      try{payload=JSON.parse(trimmed);}catch(error){
        const looksHtml=/^\s*<!doctype\s+html|^\s*<html\b|^\s*</i.test(trimmed)||contentType(response).includes('text/html');
        if(looksHtml&&!allowHtml){
          throw new RemoteSourceError('html-response','This address opened a webpage rather than spatial data. EditPolygon can usually resolve ArcGIS links automatically; check that the link was copied completely and try Find data again.',{url,status:response.status,contentType:contentType(response)});
        }
        throw new RemoteSourceError('invalid-json','The address did not return valid GeoJSON or ArcGIS JSON.',{url,status:response.status,cause:error?.message||String(error)});
      }
    }
    if(!response.ok){
      const message=payload?.error
        ?arcgisErrorMessage(payload)
        :`The remote server returned ${response.status}${response.statusText?` ${response.statusText}`:''}.`;
      throw new RemoteSourceError('http-error',message,{url,status:response.status,payload});
    }
    if(payload?.error)throw new RemoteSourceError('arcgis-error',arcgisErrorMessage(payload),{url,status:response.status,payload});
    return payload;
  }


  function signedRingArea(ring){
    let area=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=(Number(ring[j]?.[0])||0)*(Number(ring[i]?.[1])||0)-(Number(ring[i]?.[0])||0)*(Number(ring[j]?.[1])||0);
    return area/2;
  }

  function normaliseRing(input){
    const ring=(Array.isArray(input)?input:[]).filter(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1]))).map(point=>[Number(point[0]),Number(point[1]),...point.slice(2)]);
    if(ring.length<3)return [];
    const first=ring[0],last=ring[ring.length-1];
    if(first[0]!==last[0]||first[1]!==last[1])ring.push(first.slice());
    return ring.length>=4?ring:[];
  }

  function pointInRing(point,ring){
    const x=Number(point?.[0]),y=Number(point?.[1]);
    if(!Number.isFinite(x)||!Number.isFinite(y))return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      const intersects=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi);
      if(intersects)inside=!inside;
    }
    return inside;
  }

  function orientRing(ring,counterClockwise){
    const ccw=signedRingArea(ring)>0;
    return ccw===counterClockwise?ring:ring.slice().reverse();
  }

  function esriPolygonCoordinates(rings){
    const entries=(Array.isArray(rings)?rings:[]).map(normaliseRing).filter(Boolean).filter(ring=>ring.length>=4).map((ring,index)=>({ring,index,area:Math.abs(signedRingArea(ring)),parent:-1,depth:0}));
    entries.sort((a,b)=>b.area-a.area||a.index-b.index);
    for(let i=0;i<entries.length;i++){
      const child=entries[i];
      let parentIndex=-1,parentArea=Infinity;
      const sample=child.ring[0];
      for(let j=0;j<i;j++){
        const candidate=entries[j];
        if(candidate.area<parentArea&&pointInRing(sample,candidate.ring)){parentIndex=j;parentArea=candidate.area;}
      }
      child.parent=parentIndex;
      child.depth=parentIndex>=0?entries[parentIndex].depth+1:0;
    }
    const polygons=[];
    const polygonForEntry=new Map();
    entries.forEach((entry,index)=>{
      if(entry.depth%2===0){
        const polygon=[orientRing(entry.ring,true)];
        polygons.push(polygon);
        polygonForEntry.set(index,polygon);
      }
    });
    entries.forEach((entry,index)=>{
      if(entry.depth%2===0)return;
      let ancestor=entry.parent;
      while(ancestor>=0&&entries[ancestor].depth%2!==0)ancestor=entries[ancestor].parent;
      const polygon=polygonForEntry.get(ancestor);
      if(polygon)polygon.push(orientRing(entry.ring,false));
    });
    return polygons;
  }

  function esriGeometryToGeoJSON(geometry,geometryType=''){
    if(!geometry||typeof geometry!=='object')return null;
    const type=cleanText(geometryType).toLowerCase();
    if(Number.isFinite(Number(geometry.x))&&Number.isFinite(Number(geometry.y)))return {type:'Point',coordinates:[Number(geometry.x),Number(geometry.y),...(geometry.z==null?[]:[Number(geometry.z)])]};
    if(Array.isArray(geometry.points))return {type:'MultiPoint',coordinates:geometry.points.map(point=>point.map(Number))};
    if(Array.isArray(geometry.paths)){const paths=geometry.paths.map(path=>path.map(point=>point.map(Number))).filter(path=>path.length);return paths.length===1?{type:'LineString',coordinates:paths[0]}:{type:'MultiLineString',coordinates:paths};}
    if(Array.isArray(geometry.rings)){const polygons=esriPolygonCoordinates(geometry.rings);if(!polygons.length)return null;return polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons};}
    if(['esrigeometryenvelope','envelope'].includes(type)||['xmin','ymin','xmax','ymax'].every(key=>Number.isFinite(Number(geometry[key])))){
      const x1=Number(geometry.xmin),y1=Number(geometry.ymin),x2=Number(geometry.xmax),y2=Number(geometry.ymax);
      return {type:'Polygon',coordinates:[[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]]};
    }
    return null;
  }

  function esriJsonToGeoJSON(payload,metadata={}){
    if(payload?.type==='FeatureCollection'&&Array.isArray(payload.features))return clone(payload);
    const geometryType=payload?.geometryType||metadata?.geometryType||'';
    const objectIdField=payload?.objectIdFieldName||metadata?.objectIdField||metadata?.objectIdFieldName||metadata?.uniqueIdField?.name||'';
    const features=(Array.isArray(payload?.features)?payload.features:[]).map((feature,index)=>{
      const properties={...(feature?.attributes||feature?.properties||{})};
      const geometry=feature?.geometry?.type?clone(feature.geometry):esriGeometryToGeoJSON(feature?.geometry,geometryType);
      const id=objectIdField&&properties[objectIdField]!=null?properties[objectIdField]:(feature?.id??index+1);
      return {type:'Feature',id,properties,geometry};
    }).filter(feature=>feature.geometry);
    return {type:'FeatureCollection',features};
  }

  function geometryLabel(value){
    const text=cleanText(value).replace(/^esriGeometry/i,'');
    const labels={point:'Points',multipoint:'Multipoints',polyline:'Lines',polygon:'Polygons',envelope:'Envelopes'};
    return labels[text.toLowerCase()]||text||'Spatial features';
  }

  function serviceUrlFromDirectory(directoryUrl,service){
    const root=arcgisRoot(directoryUrl);
    const rawName=cleanText(service?.name);
    const type=cleanText(service?.type);
    if(!root||!rawName||!type)return '';
    const name=rawName.split('/').map(part=>encodeURIComponent(part)).join('/');
    return `${root}/${name}/${encodeURIComponent(type)}`;
  }

  function folderUrlFromDirectory(directoryUrl,folder){
    const root=arcgisRoot(directoryUrl);
    if(!root||!folder)return '';
    return `${root}/${String(folder).split('/').map(part=>encodeURIComponent(part)).join('/')}`;
  }

  function sourceNameFromUrl(input){
    try{
      const url=parseUrl(input);
      const parts=url.pathname.split('/').filter(Boolean);
      const serviceIndex=parts.findIndex(part=>/^(FeatureServer|MapServer)$/i.test(part));
      if(serviceIndex>0)return decodeURIComponent(parts[serviceIndex-1]);
      return decodeURIComponent(parts.at(-1)||url.hostname);
    }catch(_){return 'Remote data';}
  }

  async function queryCount(layerUrl,fetchFn,where='1=1'){
    const base=arcgisLayerBase(layerUrl);
    const params=new URLSearchParams({where,returnCountOnly:'true',f:'json'});
    try{
      const data=await fetchJson(`${base}/query?${params}`,{fetchFn});
      return Number.isFinite(Number(data?.count))?Number(data.count):null;
    }catch(_){return null;}
  }

  function readyLayer(layer,extra={}){
    return {
      kind:'ready',
      sourceType:'arcgis-layer',
      name:layer.name||sourceNameFromUrl(layer.url),
      title:layer.name||sourceNameFromUrl(layer.url),
      url:layer.url,
      importUrl:layer.queryUrl||layer.url,
      layerUrl:layer.url,
      serviceUrl:layer.serviceUrl||arcgisServiceBase(layer.url),
      serviceType:layer.serviceType||(/\/MapServer\//i.test(layer.url)?'MapServer':'FeatureServer'),
      layerId:layer.layerId,
      geometryType:layer.geometryType||'',
      geometryLabel:geometryLabel(layer.geometryType),
      featureCount:layer.featureCount??null,
      description:layer.description||'',
      sourceCrs:layer.sourceCrs||'',
      capabilities:layer.capabilities||'',
      ...extra
    };
  }

  async function discoverLayer(input,{fetchFn=global.fetch,queryUrl='',context={}}={}){
    const layerUrl=arcgisLayerBase(input);
    const type=/\/MapServer\//i.test(layerUrl)?'MapServer':'FeatureServer';
    const idMatch=layerUrl.match(/\/(\d+)$/);
    const metadata=await fetchJson(setFormat(layerUrl,'json'),{fetchFn});
    if(!metadata||typeof metadata!=='object')throw new RemoteSourceError('invalid-layer','The ArcGIS layer did not return usable metadata.',{url:layerUrl});
    if(metadata.type==='Table'||!metadata.geometryType){
      throw new RemoteSourceError('non-spatial-layer','This ArcGIS resource is a table and does not contain map geometry.',{url:layerUrl,name:metadata.name||''});
    }
    const where=queryUrl?new URL(queryUrl).searchParams.get('where')||'1=1':'1=1';
    const featureCount=await queryCount(layerUrl,fetchFn,where);
    const sr=metadata.extent?.spatialReference||metadata.sourceSpatialReference||{};
    const wkid=sr.latestWkid||sr.wkid||'';
    return readyLayer({
      name:metadata.name||sourceNameFromUrl(layerUrl),
      url:layerUrl,
      queryUrl:queryUrl||'',
      serviceUrl:arcgisServiceBase(layerUrl),
      serviceType:type,
      layerId:idMatch?Number(idMatch[1]):null,
      geometryType:metadata.geometryType,
      featureCount,
      description:metadata.description||metadata.displayField||'',
      sourceCrs:wkid?`EPSG:${wkid}`:'',
      capabilities:metadata.capabilities||''
    },context);
  }

  async function discoverService(input,{fetchFn=global.fetch,context={}}={}){
    const serviceUrl=withoutQuery(input);
    const metadata=await fetchJson(setFormat(serviceUrl,'json'),{fetchFn});
    const serviceType=/\/MapServer$/i.test(new URL(serviceUrl).pathname)?'MapServer':'FeatureServer';
    const rawLayers=Array.isArray(metadata?.layers)?metadata.layers:[];
    const layers=rawLayers.map(layer=>({
      kind:'layer',
      id:String(layer.id),
      layerId:Number(layer.id),
      name:layer.name||`Layer ${layer.id}`,
      url:`${serviceUrl}/${layer.id}`,
      serviceUrl,
      serviceType,
      geometryType:layer.geometryType||'',
      geometryLabel:geometryLabel(layer.geometryType),
      featureCount:null
    }));
    if(!layers.length)throw new RemoteSourceError('empty-service','This ArcGIS service does not expose any spatial feature layers.',{url:serviceUrl,name:metadata?.serviceDescription||sourceNameFromUrl(serviceUrl)});
    if(layers.length===1)return discoverLayer(layers[0].url,{fetchFn,context:{...context,serviceName:metadata?.mapName||sourceNameFromUrl(serviceUrl)}});
    return {
      kind:'choose-layer',
      sourceType:'arcgis-service',
      title:metadata?.mapName||metadata?.serviceDescription||sourceNameFromUrl(serviceUrl),
      name:metadata?.mapName||sourceNameFromUrl(serviceUrl),
      url:serviceUrl,
      serviceUrl,
      serviceType,
      layers,
      context
    };
  }

  async function discoverDirectory(input,{fetchFn=global.fetch,context={}}={}){
    const directoryUrl=withoutQuery(input);
    const metadata=await fetchJson(setFormat(directoryUrl,'json'),{fetchFn});
    const services=(Array.isArray(metadata?.services)?metadata.services:[])
      .filter(service=>/^(FeatureServer|MapServer)$/i.test(String(service?.type||'')))
      .map(service=>({
        kind:'service',
        name:String(service.name||'').split('/').pop()||'ArcGIS service',
        fullName:service.name||'',
        serviceType:service.type,
        url:serviceUrlFromDirectory(directoryUrl,service)
      }))
      .filter(service=>service.url);
    const folders=(Array.isArray(metadata?.folders)?metadata.folders:[]).map(folder=>({kind:'directory',name:String(folder),url:folderUrlFromDirectory(directoryUrl,folder)}));
    if(!services.length&&!folders.length)throw new RemoteSourceError('empty-directory','No public FeatureServer or MapServer services were found at this ArcGIS directory.',{url:directoryUrl});
    return {
      kind:'choose-service',
      sourceType:'arcgis-directory',
      title:'ArcGIS services directory',
      name:sourceNameFromUrl(directoryUrl),
      url:directoryUrl,
      services,
      folders,
      context
    };
  }

  async function discoverItem(input,{fetchFn=global.fetch}={}){
    const url=parseUrl(input);
    const itemId=itemIdFromUrl(url);
    if(!itemId)throw new RemoteSourceError('invalid-item','The ArcGIS item ID could not be read from this link.');
    const root=portalRoot(url.href);
    const itemUrl=`${root}/sharing/rest/content/items/${itemId}?f=json`;
    const item=await fetchJson(itemUrl,{fetchFn});
    if(item?.url){
      const result=await discover(item.url,{fetchFn,context:{itemId,itemTitle:item.title||'',itemType:item.type||'',itemPage:url.href}});
      return {...result,item:{id:itemId,title:item.title||'',type:item.type||'',pageUrl:url.href,serviceUrl:item.url}};
    }
    const dataUrl=`${root}/sharing/rest/content/items/${itemId}/data?f=json`;
    const data=await fetchJson(dataUrl,{fetchFn});
    if(data?.url){
      const result=await discover(data.url,{fetchFn,context:{itemId,itemTitle:item.title||'',itemType:item.type||'',itemPage:url.href}});
      return {...result,item:{id:itemId,title:item.title||'',type:item.type||'',pageUrl:url.href,serviceUrl:data.url}};
    }
    if(data?.featureCollection?.layers?.length){
      throw new RemoteSourceError('embedded-feature-collection','This ArcGIS item stores an embedded feature collection rather than a public service URL. Direct service-backed ArcGIS items are supported; embedded item conversion will be added separately.',{itemId,itemType:item?.type||'',itemTitle:item?.title||''});
    }
    throw new RemoteSourceError('unsupported-item','This ArcGIS item does not point to a public spatial service that EditPolygon can import.',{itemId,itemType:item?.type||'',itemTitle:item?.title||''});
  }

  function geoJsonSummary(data,url){
    const type=data?.type;
    const features=type==='FeatureCollection'&&Array.isArray(data.features)?data.features:type==='Feature'?[data]:[];
    if(!features.length&&type!=='FeatureCollection')throw new RemoteSourceError('unsupported-json','The address returned JSON, but it is not GeoJSON or a recognised ArcGIS service.',{url});
    let geometryType='';
    for(const feature of features){if(feature?.geometry?.type){geometryType=feature.geometry.type;break;}}
    return {
      kind:'ready',
      sourceType:'geojson',
      name:sourceNameFromUrl(url).replace(/\.(geojson|json)$/i,'')||'Remote GeoJSON',
      title:'GeoJSON data',
      url,
      importUrl:url,
      geometryType,
      geometryLabel:geometryType||'GeoJSON features',
      featureCount:features.length,
      cachedData:data
    };
  }

  async function discoverUnknown(input,{fetchFn=global.fetch,context={}}={}){
    const url=extractUrl(input);
    const data=await fetchJson(url,{fetchFn});
    if(data?.type==='FeatureCollection'||data?.type==='Feature')return {...geoJsonSummary(data,url),context};
    if(Array.isArray(data?.services)||Array.isArray(data?.folders))return discoverDirectory(url,{fetchFn,context});
    if(Array.isArray(data?.layers)){
      const classified=classify(url);
      if(classified.type==='arcgis-service')return discoverService(url,{fetchFn,context});
    }
    if(data?.geometryType&&data?.fields)return discoverLayer(url,{fetchFn,context});
    throw new RemoteSourceError('unsupported-json','The address returned JSON, but EditPolygon could not identify a supported spatial dataset.',{url});
  }

  async function discover(input,{fetchFn=global.fetch,context={}}={}){
    const info=classify(input);
    if(info.type==='invalid')parseUrl(input);
    if(info.type==='arcgis-item')return discoverItem(info.url,{fetchFn});
    if(info.type==='arcgis-directory')return discoverDirectory(info.url,{fetchFn,context});
    if(info.type==='arcgis-service')return discoverService(info.url,{fetchFn,context});
    if(info.type==='arcgis-layer')return discoverLayer(info.url,{fetchFn,context});
    if(info.type==='arcgis-query')return discoverLayer(arcgisLayerBase(info.url),{fetchFn,queryUrl:info.url,context});
    if(info.type==='geojson'){
      const data=await fetchJson(info.url,{fetchFn});
      return {...geoJsonSummary(data,info.url),context};
    }
    return discoverUnknown(info.url,{fetchFn,context});
  }

  function queryOptions(input){
    const info=classify(input);
    const url=parseUrl(input);
    const isQuery=info.type==='arcgis-query';
    const source=isQuery?url.searchParams:new URLSearchParams();
    const where=source.get('where')||'1=1';
    const outFields=source.get('outFields')||'*';
    const params=new URLSearchParams();
    const preserve=['objectIds','geometry','geometryType','inSR','spatialRel','time','distance','units','orderByFields','groupByFieldsForStatistics','outStatistics','having','gdbVersion','historicMoment','sqlFormat'];
    for(const key of preserve){if(source.has(key))params.set(key,source.get(key));}
    params.set('where',where);
    params.set('outFields',outFields);
    params.set('returnGeometry',source.get('returnGeometry')||'true');
    params.set('outSR','4326');
    params.set('f','geojson');
    return {layerUrl:arcgisLayerBase(input),where,outFields,params,originalQuery:isQuery?url.href:''};
  }

  function buildQueryUrl(input,overrides={}){
    const options=queryOptions(input);
    for(const [key,value] of Object.entries(overrides||{})){
      if(value==null||value==='')options.params.delete(key);
      else options.params.set(key,String(value));
    }
    return `${options.layerUrl}/query?${options.params}`;
  }

  function friendlyError(error){
    if(error instanceof RemoteSourceError)return error;
    const message=error?.message||String(error||'Unknown error');
    if(/Unexpected token\s*['"]?</i.test(message)||/not valid JSON/i.test(message)){
      return new RemoteSourceError('invalid-json','This address returned a webpage or another unsupported response instead of spatial data. Paste the ArcGIS directory, service, layer, item, or GeoJSON link and use Find data.');
    }
    return new RemoteSourceError('remote-source-error',message);
  }

  global.EditPolygonRemoteSource=Object.freeze({
    VERSION,
    RemoteSourceError,
    extractUrl,
    classify,
    setFormat,
    withoutQuery,
    arcgisLayerBase,
    arcgisServiceBase,
    queryOptions,
    buildQueryUrl,
    fetchJson,
    discover,
    discoverDirectory,
    discoverService,
    discoverLayer,
    discoverItem,
    friendlyError,
    geometryLabel,
    esriGeometryToGeoJSON,
    esriJsonToGeoJSON,
    clone
  });
})(typeof window!=='undefined'?window:globalThis);
