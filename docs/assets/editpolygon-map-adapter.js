(function(global){
  'use strict';

  const VERSION='1.55.1';

  function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
  function point(x,y){
    if(Array.isArray(x)){y=x[1];x=x[0];}
    else if(x&&typeof x==='object'&&y==null){y=x.y;x=x.x;}
    const p={x:finite(x),y:finite(y)};
    p.distanceTo=function(other){const q=point(other);return Math.hypot(p.x-q.x,p.y-q.y);};
    return p;
  }
  function lonLat(value){
    if(Array.isArray(value))return [finite(value[0]),finite(value[1])];
    if(value&&typeof value==='object'){
      if(Number.isFinite(Number(value.lng))&&Number.isFinite(Number(value.lat)))return [Number(value.lng),Number(value.lat)];
      if(Number.isFinite(Number(value.lon))&&Number.isFinite(Number(value.lat)))return [Number(value.lon),Number(value.lat)];
    }
    return [0,0];
  }
  function latLng(value){const c=lonLat(value);return {lat:c[1],lng:c[0]};}
  function bbox(value){if(!Array.isArray(value)||value.length<4)return null;const out=value.slice(0,4).map(Number);return out.every(Number.isFinite)?out:null;}
  function bboxIntersects(a,b){const aa=bbox(a),bb=bbox(b);if(!aa||!bb)return false;return !(aa[2]<bb[0]||aa[0]>bb[2]||aa[3]<bb[1]||aa[1]>bb[3]);}
  function haversine(a,b){
    const aa=lonLat(a),bb=lonLat(b),R=6371008.8,d2r=Math.PI/180;
    const p1=aa[1]*d2r,p2=bb[1]*d2r,dp=(bb[1]-aa[1])*d2r,dl=(bb[0]-aa[0])*d2r;
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function requestedEngine(search){
    let raw='';
    try{raw=new URLSearchParams(search==null?global.location?.search||'':search).get('mapEngine')||'';}catch(_){ }
    raw=String(raw).trim().toLowerCase();
    return raw==='openlayers'||raw==='ol'?'openlayers':'leaflet';
  }
  function normalisePadding(padding){
    if(!Array.isArray(padding))return undefined;
    if(padding.length===4)return padding.map(v=>finite(v));
    if(padding.length===2)return [finite(padding[1]),finite(padding[0]),finite(padding[1]),finite(padding[0])];
    return undefined;
  }
  function mercatorWorldPixel(coord,zoom){
    const c=lonLat(coord),z=Math.max(0,finite(zoom)),scale=256*Math.pow(2,z);
    const lng=Math.max(-180,Math.min(180,c[0])),lat=Math.max(-85.05112878,Math.min(85.05112878,c[1]));
    const sin=Math.sin(lat*Math.PI/180);
    return point((lng+180)/360*scale,(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale);
  }

  function createLeafletRuntime(options={}){
    const L=options.L||global.L;
    if(!L||typeof L.map!=='function')throw new Error('Leaflet is required for the Leaflet map adapter.');
    const target=options.target||'map',center=lonLat(options.center||[0,20]),zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const nativeMap=options.map||L.map(target,{center:[center[1],center[0]],zoom,doubleClickZoom:options.doubleClickZoom!==false,preferCanvas:options.preferCanvas!==false,renderer:options.renderer||L.canvas({padding:0.5}),...(options.mapOptions||{})});
    const listenerRecords=[];
    function getContainer(){return nativeMap.getContainer();}
    function getSize(){const s=nativeMap.getSize();return point(s.x,s.y);}
    function getZoom(){return nativeMap.getZoom();}
    function getCenter(){const c=nativeMap.getCenter();return [c.lng,c.lat];}
    function getView(){return {center:getCenter(),zoom:getZoom()};}
    function setView(centerLonLat,nextZoom,viewOptions){const c=lonLat(centerLonLat);nativeMap.setView([c[1],c[0]],nextZoom,viewOptions||{});}
    function setViewLatLng(centerLatLng,nextZoom,viewOptions){let c;if(Array.isArray(centerLatLng))c=[finite(centerLatLng[1]),finite(centerLatLng[0])];else c=lonLat(centerLatLng);setView(c,nextZoom,viewOptions);}
    function fitExtent(extent,fitOptions={}){const b=bbox(extent);if(!b)return false;nativeMap.fitBounds([[b[1],b[0]],[b[3],b[2]]],fitOptions||{});return true;}
    function fitLatLngBounds(boundsLike,fitOptions={}){nativeMap.fitBounds(boundsLike,fitOptions||{});return true;}
    function panInside(coord,panOptions={}){const c=lonLat(coord);if(typeof nativeMap.panInside==='function')nativeMap.panInside([c[1],c[0]],panOptions||{});else nativeMap.panTo([c[1],c[0]],panOptions||{});return true;}
    function getExtent(padRatio=0){let b=nativeMap.getBounds();if(padRatio&&b&&typeof b.pad==='function')b=b.pad(padRatio);return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}
    function lonLatToPixel(coord){const c=lonLat(coord),p=nativeMap.latLngToContainerPoint([c[1],c[0]]);return point(p.x,p.y);}
    function latLngToPixel(value){const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;return lonLatToPixel(lonLat(ll));}
    function pixelToLonLat(value){const p=point(value),ll=nativeMap.containerPointToLatLng([p.x,p.y]);return [ll.lng,ll.lat];}
    function pixelToLatLng(value){const c=pixelToLonLat(value);return {lat:c[1],lng:c[0]};}
    function lonLatToLayerPixel(coord){const c=lonLat(coord),p=nativeMap.latLngToLayerPoint([c[1],c[0]]);return point(p.x,p.y);}
    function latLngToLayerPixel(value){const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;return lonLatToLayerPixel(lonLat(ll));}
    function layerPixelToLonLat(value){const p=point(value),ll=nativeMap.layerPointToLatLng([p.x,p.y]);return [ll.lng,ll.lat];}
    function layerPixelToLatLng(value){const c=layerPixelToLonLat(value);return {lat:c[1],lng:c[0]};}
    function projectLonLat(coord,atZoom=getZoom()){const c=lonLat(coord),p=nativeMap.project(L.latLng(c[1],c[0]),atZoom);return point(p.x,p.y);}
    function distance(a,b){const aa=lonLat(a),bb=lonLat(b);return nativeMap.distance([aa[1],aa[0]],[bb[1],bb[0]]);}
    function distanceLatLng(a,b){return nativeMap.distance(a,b);}
    function setPanEnabled(enabled){if(!nativeMap.dragging)return;if(enabled)nativeMap.dragging.enable();else nativeMap.dragging.disable();}
    function isPanEnabled(){return !!nativeMap.dragging?.enabled?.();}
    function setDoubleClickZoomEnabled(enabled){if(!nativeMap.doubleClickZoom)return;if(enabled)nativeMap.doubleClickZoom.enable();else nativeMap.doubleClickZoom.disable();}
    function isDoubleClickZoomEnabled(){return !!nativeMap.doubleClickZoom?.enabled?.();}
    function resize(options={pan:false,animate:false}){nativeMap.invalidateSize(options);}
    function normalizeEvent(type,event){const ll=event?.latlng?{lat:event.latlng.lat,lng:event.latlng.lng}:null;let eventPixel=event?.containerPoint?point(event.containerPoint.x,event.containerPoint.y):null;if(!eventPixel&&ll)eventPixel=latLngToPixel(ll);return {type,lonLat:ll?[ll.lng,ll.lat]:null,latLng:ll,pixel:eventPixel,originalEvent:event?.originalEvent||null,nativeEvent:event||null};}
    function on(types,handler,{native=false}={}){String(types||'').split(/\s+/).filter(Boolean).forEach(type=>{const wrapped=native?handler:(event=>handler(normalizeEvent(type,event)));nativeMap.on(type,wrapped);listenerRecords.push({type,handler,wrapped,native});});return ()=>off(types,handler);}
    function off(types,handler){const wanted=new Set(String(types||'').split(/\s+/).filter(Boolean));for(let i=listenerRecords.length-1;i>=0;i--){const rec=listenerRecords[i];if((!wanted.size||wanted.has(rec.type))&&(!handler||handler===rec.handler)){nativeMap.off(rec.type,rec.wrapped);listenerRecords.splice(i,1);}}}
    function stopNativeEvent(event){const e=event?.nativeEvent||event;try{if(e)L.DomEvent.stop(e);}catch(_){try{event?.originalEvent?.preventDefault?.();event?.originalEvent?.stopPropagation?.();}catch(__){}}}
    function nativePanLooksActive(){const d=nativeMap?.dragging?._draggable,c=getContainer();return !!(d&&(d._moving||d._moved||d._lastTarget)||global.document?.body?.classList?.contains('leaflet-dragging')||global.document?.documentElement?.classList?.contains('leaflet-dragging')||(c&&(c.classList.contains('leaflet-drag-target')||c.classList.contains('leaflet-dragging'))));}
    function recoverNativePan(event){const d=nativeMap?.dragging?._draggable;try{if(d&&typeof d._onUp==='function')d._onUp(event||{});}catch(_){ }try{if(d){d._moving=false;d._moved=false;d._lastTarget=null;d._newPos=null;d._startPos=null;d._startPoint=null;}}catch(_){ }try{global.document?.body?.classList?.remove('leaflet-dragging');global.document?.documentElement?.classList?.remove('leaflet-dragging');const c=getContainer();c?.classList?.remove('leaflet-drag-target','leaflet-dragging');}catch(_){ }try{if(isPanEnabled()){setPanEnabled(false);setPanEnabled(true);}}catch(_){ }}
    return Object.freeze({version:VERSION,engine:'leaflet',requestedEngine:'leaflet',getNativeMap:()=>nativeMap,getLegacyMap:()=>nativeMap,getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,fitExtent,fitLatLngBounds,panInside,getExtent,lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,distance,distanceLatLng,setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,resize,on,off,stopNativeEvent,nativePanLooksActive,recoverNativePan});
  }

  function createOpenLayersRuntime(options={}){
    const ol=options.ol||global.ol,L=options.L||global.L;
    if(!ol||typeof ol.Map!=='function'||!ol.proj?.fromLonLat||!ol.proj?.toLonLat)throw new Error('OpenLayers failed to load. Reload without ?mapEngine=openlayers to use Leaflet.');
    if(!L||typeof L.map!=='function')throw new Error('Leaflet compatibility renderer is required during the v1.55.1 parity build.');
    const target=typeof options.target==='string'?global.document?.getElementById(options.target):options.target;
    if(!target)throw new Error('Map target was not found.');
    const center=lonLat(options.center||[0,20]),zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const view=new ol.View({center:ol.proj.fromLonLat(center),zoom,minZoom:0,maxZoom:22,constrainResolution:false});
    const nativeMap=new ol.Map({target,layers:[],view,controls:ol.control?.defaults?ol.control.defaults({rotate:false}):undefined,interactions:ol.interaction?.defaults?ol.interaction.defaults({doubleClickZoom:options.doubleClickZoom!==false}):undefined});

    const compatTarget=global.document.createElement('div');
    compatTarget.className='editpolygon-leaflet-compat';
    compatTarget.dataset.mapCompat='leaflet';
    Object.assign(compatTarget.style,{position:'absolute',inset:'0',zIndex:'20',background:'transparent',pointerEvents:'none'});
    target.appendChild(compatTarget);
    const legacyMap=L.map(compatTarget,{center:[center[1],center[0]],zoom,zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,preferCanvas:true,renderer:L.canvas({padding:.5}),zoomSnap:0,zoomDelta:.25,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false});

    let syncRaf=0;
    function syncLegacy(){
      if(syncRaf)return;
      syncRaf=(global.requestAnimationFrame||((fn)=>setTimeout(fn,0)))(()=>{
        syncRaf=0;
        try{const c=getCenter(),z=getZoom();legacyMap.setView([c[1],c[0]],z,{animate:false,reset:true});legacyMap.invalidateSize({pan:false,animate:false});}catch(_){ }
      });
    }
    view.on('change:center',syncLegacy);view.on('change:resolution',syncLegacy);nativeMap.on('moveend',syncLegacy);

    function getContainer(){return target;}
    function getSize(){const s=nativeMap.getSize?.()||[target.clientWidth||0,target.clientHeight||0];return point(s[0],s[1]);}
    function getZoom(){return finite(view.getZoom(),0);}
    function getCenter(){const c=view.getCenter();return c?ol.proj.toLonLat(c):[0,0];}
    function getView(){return {center:getCenter(),zoom:getZoom()};}
    function setView(centerLonLat,nextZoom,viewOptions={}){const c=lonLat(centerLonLat),projected=ol.proj.fromLonLat(c);if(viewOptions.animate&&typeof view.animate==='function')view.animate({center:projected,zoom:nextZoom,duration:finite(viewOptions.duration,250)});else{view.setCenter(projected);if(Number.isFinite(Number(nextZoom)))view.setZoom(Number(nextZoom));}syncLegacy();}
    function setViewLatLng(centerLatLng,nextZoom,viewOptions){let c;if(Array.isArray(centerLatLng))c=[finite(centerLatLng[1]),finite(centerLatLng[0])];else c=lonLat(centerLatLng);setView(c,nextZoom,viewOptions);}
    function fitExtent(extent,fitOptions={}){const b=bbox(extent);if(!b)return false;const projected=ol.proj.transformExtent?ol.proj.transformExtent(b,'EPSG:4326','EPSG:3857'):[ol.proj.fromLonLat([b[0],b[1]])[0],ol.proj.fromLonLat([b[0],b[1]])[1],ol.proj.fromLonLat([b[2],b[3]])[0],ol.proj.fromLonLat([b[2],b[3]])[1]];view.fit(projected,{size:nativeMap.getSize?.(),padding:normalisePadding(fitOptions.padding),maxZoom:Number.isFinite(Number(fitOptions.maxZoom))?Number(fitOptions.maxZoom):undefined,duration:fitOptions.animate===false?0:finite(fitOptions.duration,0)});syncLegacy();return true;}
    function fitLatLngBounds(boundsLike,fitOptions={}){try{if(Array.isArray(boundsLike)&&Array.isArray(boundsLike[0])){const a=boundsLike[0],b=boundsLike[1];return fitExtent([a[1],a[0],b[1],b[0]],fitOptions);}}catch(_){ }return false;}
    function panInside(coord,panOptions={}){const c=lonLat(coord),projected=ol.proj.fromLonLat(c),size=nativeMap.getSize?.();let inside=false;try{inside=ol.extent?.containsCoordinate?.(view.calculateExtent(size),projected)||false;}catch(_){ }if(!inside)setView(c,getZoom(),{animate:panOptions.animate!==false,duration:200});return true;}
    function getExtent(padRatio=0){const size=nativeMap.getSize?.(),e=view.calculateExtent(size);let out=ol.proj.transformExtent?ol.proj.transformExtent(e,'EPSG:3857','EPSG:4326'):[...e];if(padRatio){const dx=(out[2]-out[0])*padRatio,dy=(out[3]-out[1])*padRatio;out=[out[0]-dx,out[1]-dy,out[2]+dx,out[3]+dy];}return out;}
    function lonLatToPixel(coord){const p=nativeMap.getPixelFromCoordinate(ol.proj.fromLonLat(lonLat(coord)));return point(p||[0,0]);}
    function latLngToPixel(value){const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;return lonLatToPixel(lonLat(ll));}
    function pixelToLonLat(value){const p=point(value),c=nativeMap.getCoordinateFromPixel([p.x,p.y]);return c?ol.proj.toLonLat(c):[0,0];}
    function pixelToLatLng(value){const c=pixelToLonLat(value);return {lat:c[1],lng:c[0]};}
    function lonLatToLayerPixel(coord){return lonLatToPixel(coord);}
    function latLngToLayerPixel(value){return latLngToPixel(value);}
    function layerPixelToLonLat(value){return pixelToLonLat(value);}
    function layerPixelToLatLng(value){return pixelToLatLng(value);}
    function projectLonLat(coord,atZoom=getZoom()){return mercatorWorldPixel(coord,atZoom);}
    function distance(a,b){return haversine(a,b);}
    function distanceLatLng(a,b){return haversine(lonLat(a),lonLat(b));}
    const interactions=()=>nativeMap.getInteractions?.().getArray?.()||[];
    const findInteraction=name=>interactions().find(i=>i?.constructor?.name===name||i instanceof (ol.interaction?.[name]||Function));
    function setPanEnabled(enabled){findInteraction('DragPan')?.setActive?.(!!enabled);}
    function isPanEnabled(){const i=findInteraction('DragPan');return i?.getActive?!!i.getActive():true;}
    function setDoubleClickZoomEnabled(enabled){findInteraction('DoubleClickZoom')?.setActive?.(!!enabled);}
    function isDoubleClickZoomEnabled(){const i=findInteraction('DoubleClickZoom');return i?.getActive?!!i.getActive():true;}
    function resize(){nativeMap.updateSize?.();legacyMap.invalidateSize({pan:false,animate:false});}

    const records=[];let zooming=false,lastZoom=getZoom();
    function normalizeOlEvent(type,event){let pixel=event?.pixel?point(event.pixel):null,coord=event?.coordinate?ol.proj.toLonLat(event.coordinate):null;if(!pixel&&event?.originalEvent)try{pixel=point(nativeMap.getEventPixel(event.originalEvent));}catch(_){ }if(!coord&&pixel)try{const c=nativeMap.getCoordinateFromPixel([pixel.x,pixel.y]);if(c)coord=ol.proj.toLonLat(c);}catch(_){ }const ll=coord?{lat:coord[1],lng:coord[0]}:null;return {type,lonLat:coord||null,latLng:ll,pixel,originalEvent:event?.originalEvent||event||null,nativeEvent:event||null};}
    function bindOne(type,handler,native){
      let targetObj=nativeMap,eventType=type,wrapped;
      if(type==='mousemove'){eventType='pointermove';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else if(type==='mouseout'||type==='contextmenu'){
        targetObj=nativeMap.getViewport?.()||target;eventType=type;wrapped=e=>{if(type==='contextmenu')e.preventDefault?.();handler(native?e:normalizeOlEvent(type,{originalEvent:e,pixel:nativeMap.getEventPixel?.(e),coordinate:nativeMap.getCoordinateFromPixel?.(nativeMap.getEventPixel?.(e))}));};targetObj.addEventListener(eventType,wrapped);records.push({targetObj,eventType,handler,wrapped,dom:true});return;
      }else if(type==='resize'){
        const ro=global.ResizeObserver?new global.ResizeObserver(()=>{resize();handler(native?{type}:normalizeOlEvent(type,{type}));}):null;if(ro){ro.observe(target);records.push({handler,ro,type});}return;
      }else if(type==='move'){targetObj=view;eventType='change:center';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else if(type==='zoomstart'){targetObj=view;eventType='change:resolution';wrapped=e=>{if(!zooming){zooming=true;handler(native?e:normalizeOlEvent(type,e));}};}
      else if(type==='zoomend'){eventType='moveend';wrapped=e=>{const z=getZoom();if(zooming||z!==lastZoom){zooming=false;lastZoom=z;handler(native?e:normalizeOlEvent(type,e));}};}
      else if(type==='viewreset'){eventType='moveend';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));
      targetObj.on(eventType,wrapped);records.push({targetObj,eventType,handler,wrapped,dom:false,type});
    }
    function on(types,handler,{native=false}={}){String(types||'').split(/\s+/).filter(Boolean).forEach(type=>bindOne(type,handler,native));return ()=>off(types,handler);}
    function off(types,handler){const wanted=new Set(String(types||'').split(/\s+/).filter(Boolean));for(let i=records.length-1;i>=0;i--){const r=records[i];if((!wanted.size||wanted.has(r.type)||wanted.has(r.eventType))&&(!handler||handler===r.handler)){if(r.ro)r.ro.disconnect();else if(r.dom)r.targetObj.removeEventListener(r.eventType,r.wrapped);else r.targetObj.un?.(r.eventType,r.wrapped);records.splice(i,1);}}}
    function stopNativeEvent(event){const e=event?.originalEvent||event?.nativeEvent||event;try{e?.preventDefault?.();e?.stopPropagation?.();}catch(_){ }}
    function nativePanLooksActive(){return false;}
    function recoverNativePan(){ }

    function addDisplayLayer(layer){if(layer&&nativeMap.getLayers&&!nativeMap.getLayers().getArray().includes(layer))nativeMap.addLayer(layer);return layer;}
    function removeDisplayLayer(layer){if(layer)try{nativeMap.removeLayer(layer);}catch(_){ }return layer;}
    function hasDisplayLayer(layer){return !!layer&&!!nativeMap.getLayers?.().getArray?.().includes(layer);}
    function createEmptyLayerGroup(){return new ol.layer.Group({layers:[]});}
    function normalizeTileUrl(url,tms=false){let out=String(url||'').replace(/\{s\}/g,'{a-c}').replace(/\{r\}/g,'');if(tms)out=out.replace(/\{y\}/g,'{-y}');return out;}
    function createTileLayer(spec={}){const source=new ol.source.XYZ({url:normalizeTileUrl(spec.url||spec.urlTemplate,spec.tms),attributions:spec.attribution||undefined,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,tileSize:spec.tileSize||256,crossOrigin:'anonymous'});const layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??0});layer.__editpolygonEngine='openlayers';return layer;}
    function createWmsLayer(spec={}){const source=new ol.source.TileWMS({url:spec.url,params:{LAYERS:spec.layers||spec.wmsLayers||'',STYLES:spec.styles||spec.wmsStyles||'',FORMAT:spec.format||spec.wmsFormat||'image/png',VERSION:spec.version||spec.wmsVersion||'1.3.0',TRANSPARENT:spec.transparent!==false},attributions:spec.attribution||undefined,crossOrigin:'anonymous'});const layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??20});layer.__editpolygonEngine='openlayers';return layer;}
    function parseDash(value){if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);if(!value)return undefined;const out=String(value).split(/[ ,]+/).map(Number).filter(Number.isFinite);return out.length?out:undefined;}
    function olStyle(style={},labelText=null){const color=style.color||'#1664d6',fillColor=style.fillColor||color,opacity=style.opacity??1,fillOpacity=style.fillOpacity??.18,weight=style.weight??2,radius=Math.max(1,Number(style.radius??5));const text=labelText==null?undefined:new ol.style.Text({text:String(labelText),font:'600 11px Arial, sans-serif',fill:new ol.style.Fill({color:'#1f2937'}),stroke:new ol.style.Stroke({color:'rgba(255,255,255,.95)',width:3}),overflow:true});return new ol.style.Style({stroke:new ol.style.Stroke({color,width:weight,lineDash:parseDash(style.dashArray)}),fill:new ol.style.Fill({color:fillColor}),image:new ol.style.Circle({radius,stroke:new ol.style.Stroke({color,width:weight}),fill:new ol.style.Fill({color:fillColor})}),text});}
    function withAlphaColor(color,alpha){if(alpha==null||alpha>=1)return color;if(/^#([0-9a-f]{6})$/i.test(color)){const m=color.slice(1),r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16);return `rgba(${r},${g},${b},${alpha})`;}return color;}
    function styleFromDescriptor(desc={},labelText=null){const s={...desc,fillColor:withAlphaColor(desc.fillColor||desc.color||'#1664d6',desc.fillOpacity??.18),color:withAlphaColor(desc.color||'#1664d6',desc.opacity??1)};return olStyle(s,labelText);}
    function createEditableVectorLayer(spec={}){
      const format=new ol.format.GeoJSON(),source=new ol.source.Vector(),olFeatures=[];
      for(const item of spec.features||[]){
        if(!item?.geometry)continue;
        try{const f=format.readFeature({type:'Feature',geometry:item.geometry,properties:{__editpolygonId:item.id,__editpolygonKind:'geometry'}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});f.setStyle(styleFromDescriptor(item.style||{}));olFeatures.push(f);}catch(_){ }
        if(item.label?.coordinate&&item.label?.text!=null){try{const lf=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat(item.label.coordinate)),__editpolygonId:item.id,__editpolygonKind:'label'});lf.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.label.text));olFeatures.push(lf);}catch(_){ }}
        if(item.annotation?.coordinate&&item.annotation?.text){try{const af=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat(item.annotation.coordinate)),__editpolygonId:item.id,__editpolygonKind:'annotation'});af.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.annotation.text));olFeatures.push(af);}catch(_){ }}
      }
      source.addFeatures(olFeatures);const layer=new ol.layer.Vector({source,declutter:true,zIndex:spec.zIndex??100,visible:spec.visible!==false,opacity:spec.opacity??1});layer.__editpolygonEngine='openlayers';layer.__editpolygonFeatureCount=(spec.features||[]).length;return layer;
    }

    syncLegacy();
    return Object.freeze({version:VERSION,engine:'openlayers',requestedEngine:'openlayers',nativeVersion:String(ol.VERSION||'10.9.0'),parityBridge:'leaflet-overlays',getNativeMap:()=>nativeMap,getLegacyMap:()=>legacyMap,getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,fitExtent,fitLatLngBounds,panInside,getExtent,lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,distance,distanceLatLng,setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,resize,on,off,stopNativeEvent,nativePanLooksActive,recoverNativePan,addDisplayLayer,removeDisplayLayer,hasDisplayLayer,createEmptyLayerGroup,createTileLayer,createWmsLayer,createEditableVectorLayer,syncLegacy});
  }

  function createRuntime(options={}){
    const engine=options.engine||requestedEngine(options.search);
    if(engine!=='openlayers')return createLeafletRuntime(options);
    try{return createOpenLayersRuntime(options);}catch(error){
      console.warn('OpenLayers parity runtime could not start; using Leaflet fallback.',error);
      const fallback=createLeafletRuntime(options);
      return Object.freeze({...fallback,requestedEngine:'openlayers',fallbackReason:String(error?.message||error||'OpenLayers unavailable')});
    }
  }

  global.EditPolygonMapAdapter=Object.freeze({version:VERSION,point,lonLat,latLng,bbox,bboxIntersects,haversine,mercatorWorldPixel,requestedEngine,createRuntime,createLeafletRuntime,createOpenLayersRuntime});
})(typeof window!=='undefined'?window:globalThis);
