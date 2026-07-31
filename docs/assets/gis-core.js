(function(global){
  'use strict';

  const VERSION='1.0.0';
  const SOURCE_TYPES=new Set(['xyz','tms','wms','tilejson','geojson-url']);
  const LAYER_ROLES=new Set(['basemap','reference']);

  function clone(value){
    return value==null?value:JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix='gis'){
    const random=(global.crypto&&typeof global.crypto.randomUUID==='function')
      ? global.crypto.randomUUID().replace(/-/g,'').slice(0,12)
      : Math.random().toString(36).slice(2,14);
    return `${prefix}_${random}`;
  }

  function finite(value,fallback){
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }

  function clamp(value,min,max,fallback=min){
    return Math.min(max,Math.max(min,finite(value,fallback)));
  }

  function createDefaultState(){
    return {
      version:1,
      workspace:'simple',
      activeBasemap:'builtin:osm',
      sources:[],
      layers:[],
      groups:[],
      assignments:{},
      panel:{tab:'layers',open:true},
      privacy:{remoteRequestsAcknowledged:false}
    };
  }

  function normalizeSource(raw){
    const source=raw&&typeof raw==='object'?clone(raw):{};
    const type=SOURCE_TYPES.has(source.type)?source.type:'xyz';
    return {
      id:String(source.id||makeId('source')),
      type,
      name:String(source.name||'Untitled source').trim()||'Untitled source',
      url:String(source.url||source.urlTemplate||'').trim(),
      attribution:String(source.attribution||''),
      minZoom:Math.round(clamp(source.minZoom,0,30,0)),
      maxZoom:Math.round(clamp(source.maxZoom,1,30,22)),
      tileSize:Math.round(clamp(source.tileSize,64,1024,256)),
      subdomains:Array.isArray(source.subdomains)?source.subdomains.map(String):String(source.subdomains||'').split(',').map(s=>s.trim()).filter(Boolean),
      wmsLayers:String(source.wmsLayers||source.layers||''),
      wmsStyles:String(source.wmsStyles||source.styles||''),
      wmsFormat:String(source.wmsFormat||source.format||'image/png'),
      wmsVersion:String(source.wmsVersion||source.version||'1.3.0'),
      transparent:source.transparent!==false,
      bounds:Array.isArray(source.bounds)&&source.bounds.length===4?source.bounds.map(Number):null,
      metadata:source.metadata&&typeof source.metadata==='object'?clone(source.metadata):{},
      createdAt:source.createdAt||new Date().toISOString()
    };
  }

  function normalizeLayer(raw,index=0){
    const layer=raw&&typeof raw==='object'?clone(raw):{};
    return {
      id:String(layer.id||makeId('layer')),
      sourceId:String(layer.sourceId||''),
      name:String(layer.name||'Untitled layer').trim()||'Untitled layer',
      role:LAYER_ROLES.has(layer.role)?layer.role:'reference',
      visible:layer.visible!==false,
      opacity:clamp(layer.opacity,0,1,1),
      minZoom:layer.minZoom==null?null:Math.round(clamp(layer.minZoom,0,30,0)),
      maxZoom:layer.maxZoom==null?null:Math.round(clamp(layer.maxZoom,0,30,30)),
      order:Number.isFinite(Number(layer.order))?Number(layer.order):index,
      groupId:layer.groupId?String(layer.groupId):null,
      locked:!!layer.locked,
      createdAt:layer.createdAt||new Date().toISOString()
    };
  }

  function normalizeGroup(raw,index=0){
    const group=raw&&typeof raw==='object'?clone(raw):{};
    return {
      id:String(group.id||makeId('group')),
      name:String(group.name||`Group ${index+1}`).trim()||`Group ${index+1}`,
      collapsed:!!group.collapsed,
      order:Number.isFinite(Number(group.order))?Number(group.order):index
    };
  }

  function normaliseState(raw){
    const base=createDefaultState();
    const state=raw&&typeof raw==='object'?clone(raw):{};
    const sources=(Array.isArray(state.sources)?state.sources:[]).map(normalizeSource);
    const sourceIds=new Set(sources.map(s=>s.id));
    const layers=(Array.isArray(state.layers)?state.layers:[])
      .map(normalizeLayer)
      .filter(layer=>sourceIds.has(layer.sourceId));
    const groups=(Array.isArray(state.groups)?state.groups:[]).map(normalizeGroup);
    const groupIds=new Set(groups.map(g=>g.id));
    for(const layer of layers){if(layer.groupId&&!groupIds.has(layer.groupId))layer.groupId=null;}
    const assignments={};
    if(state.assignments&&typeof state.assignments==='object'){
      for(const [key,value] of Object.entries(state.assignments)){
        if(value==null||groupIds.has(String(value)))assignments[String(key)]=value==null?null:String(value);
      }
    }
    return {
      ...base,
      version:1,
      workspace:state.workspace==='advanced'?'advanced':'simple',
      activeBasemap:typeof state.activeBasemap==='string'?state.activeBasemap:base.activeBasemap,
      sources,
      layers,
      groups,
      assignments,
      panel:{
        tab:['layers','add','basemaps','project'].includes(state.panel?.tab)?state.panel.tab:'layers',
        open:state.panel?.open!==false
      },
      privacy:{remoteRequestsAcknowledged:!!state.privacy?.remoteRequestsAcknowledged}
    };
  }

  function validateTileTemplate(url){
    const value=String(url||'').trim();
    if(!value)return {ok:false,message:'Enter a tile URL.'};
    try{new URL(value.replace('{s}','a').replace('{z}','0').replace('{x}','0').replace('{y}','0').replace('{r}',''));}
    catch(_){return {ok:false,message:'Enter a valid http or https URL.'};}
    const missing=['{z}','{x}','{y}'].filter(token=>!value.includes(token));
    if(missing.length)return {ok:false,message:`Tile URL is missing ${missing.join(', ')}.`};
    return {ok:true,message:''};
  }

  function validateWms(source){
    const url=String(source?.url||'').trim();
    const layers=String(source?.wmsLayers||'').trim();
    if(!url)return {ok:false,message:'Enter the WMS service URL.'};
    try{new URL(url);}catch(_){return {ok:false,message:'Enter a valid WMS URL.'};}
    if(!layers)return {ok:false,message:'Enter at least one WMS layer name.'};
    return {ok:true,message:''};
  }

  function inferRemoteSource(url){
    const value=String(url||'').trim();
    if(!value)return 'unknown';
    if(/\/FeatureServer\/\d+\/?(?:\?.*)?$/i.test(value))return 'arcgis-feature';
    if(/(?:tilejson|\.json)(?:\?.*)?$/i.test(value))return 'tilejson';
    if(/[?&](?:service=)?wms(?:&|$)/i.test(value)||/\/wms\/?(?:\?.*)?$/i.test(value))return 'wms';
    if(value.includes('{z}')&&value.includes('{x}')&&value.includes('{y}'))return 'xyz';
    if(/\.(?:geojson|json)(?:\?.*)?$/i.test(value))return 'geojson';
    return 'unknown';
  }

  function tileJsonToSource(tileJson,options={}){
    if(!tileJson||typeof tileJson!=='object')throw new Error('TileJSON response is not an object.');
    const tiles=Array.isArray(tileJson.tiles)?tileJson.tiles.filter(Boolean):[];
    if(!tiles.length)throw new Error('TileJSON does not contain a tiles array.');
    const validation=validateTileTemplate(tiles[0]);
    if(!validation.ok)throw new Error(validation.message);
    return normalizeSource({
      id:options.id||makeId('source'),
      type:'xyz',
      name:options.name||tileJson.name||'TileJSON source',
      url:tiles[0],
      attribution:options.attribution||tileJson.attribution||'',
      minZoom:tileJson.minzoom??0,
      maxZoom:tileJson.maxzoom??22,
      bounds:Array.isArray(tileJson.bounds)?tileJson.bounds:null,
      metadata:{tileJsonUrl:options.tileJsonUrl||'',tileJson:clone(tileJson)}
    });
  }

  function serializeState(state){
    return clone(normaliseState(state));
  }

  function networkPolicy(source){
    const type=source?.type||'';
    return ['xyz','tms','wms','tilejson','geojson-url'].includes(type)
      ? {scope:'remote',label:'Direct request to provider',detail:'The browser contacts this provider directly. Imported project geometry is not sent.'}
      : {scope:'local',label:'Local browser data',detail:'This data remains in the browser.'};
  }

  global.EditPolygonGISCore={
    VERSION,
    createDefaultState,
    normaliseState,
    normalizeSource,
    normalizeLayer,
    normalizeGroup,
    validateTileTemplate,
    validateWms,
    inferRemoteSource,
    tileJsonToSource,
    networkPolicy,
    serializeState,
    makeId,
    clone,
    clamp
  };
})(typeof window!=='undefined'?window:globalThis);
