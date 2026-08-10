(function(global){
  'use strict';

  const VERSION='1.55.7.1';

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
  function wrapLongitudeNear(value,reference){
    const lon=finite(value),ref=finite(reference,lon);
    return lon+Math.round((ref-lon)/360)*360;
  }
  function canonicalLongitude(value){return wrapLongitudeNear(value,0);}
  function canonicalCoordinatePath(coords){
    const out=[];
    for(const raw of coords||[]){
      if(!Array.isArray(raw)||raw.length<2)continue;
      const coordinate=raw.slice();
      coordinate[0]=out.length?wrapLongitudeNear(coordinate[0],out[out.length-1][0]):canonicalLongitude(coordinate[0]);
      out.push(coordinate);
    }
    return out;
  }
  function geometryToCanonicalWorld(geometry){
    if(!geometry||typeof geometry!=='object')return geometry;
    const g={...geometry};
    if(geometry.type==='Point'){
      const coordinate=Array.isArray(geometry.coordinates)?geometry.coordinates.slice():geometry.coordinates;
      if(Array.isArray(coordinate)&&coordinate.length>=2)coordinate[0]=canonicalLongitude(coordinate[0]);
      g.coordinates=coordinate;
    }else if(geometry.type==='MultiPoint'){
      g.coordinates=(geometry.coordinates||[]).map(raw=>{const coordinate=Array.isArray(raw)?raw.slice():raw;if(Array.isArray(coordinate)&&coordinate.length>=2)coordinate[0]=canonicalLongitude(coordinate[0]);return coordinate;});
    }else if(geometry.type==='LineString'){
      g.coordinates=canonicalCoordinatePath(geometry.coordinates);
    }else if(geometry.type==='MultiLineString'){
      g.coordinates=(geometry.coordinates||[]).map(canonicalCoordinatePath);
    }else if(geometry.type==='Polygon'){
      g.coordinates=(geometry.coordinates||[]).map(canonicalCoordinatePath);
    }else if(geometry.type==='MultiPolygon'){
      g.coordinates=(geometry.coordinates||[]).map(polygon=>(polygon||[]).map(canonicalCoordinatePath));
    }else if(geometry.type==='GeometryCollection'){
      g.geometries=(geometry.geometries||[]).map(geometryToCanonicalWorld);
    }
    return g;
  }
  function geometryFingerprint(geometry){
    // Content-derived geometry identity used by the application renderer to
    // verify that a cached/native editable feature still represents the
    // authoritative project geometry.  This deliberately does not depend on
    // mutable revision counters, which can legitimately repeat after undo.
    let h1=2166136261>>>0,h2=0x9e3779b9>>>0,count=0;
    const mixCode=code=>{h1^=code&255;h1=Math.imul(h1,16777619)>>>0;h2=(Math.imul(h2^code,2246822519)+3266489917)>>>0;};
    const mixString=value=>{const text=String(value);for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);mixCode(code&255);mixCode(code>>>8);}};
    const visit=value=>{
      if(Array.isArray(value)){mixCode(91);for(const item of value)visit(item);mixCode(93);return;}
      if(value&&typeof value==='object'){mixCode(123);for(const key of Object.keys(value).sort()){mixString(key);visit(value[key]);}mixCode(125);return;}
      if(typeof value==='number'){count++;mixString(Number.isFinite(value)?String(value):'NaN');mixCode(44);return;}
      mixString(value==null?'null':value);mixCode(59);
    };
    visit(geometry);
    return `${geometry?.type||'none'}:${count}:${h1.toString(16)}:${h2.toString(16)}`;
  }

  function haversine(a,b){
    const aa=lonLat(a),bb=lonLat(b),R=6371008.8,d2r=Math.PI/180;
    const p1=aa[1]*d2r,p2=bb[1]*d2r,dp=(bb[1]-aa[1])*d2r,dl=(bb[0]-aa[0])*d2r;
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function normalisePadding(padding){
    if(!Array.isArray(padding))return undefined;
    if(padding.length===4)return padding.map(v=>finite(v));
    if(padding.length===2)return [finite(padding[1]),finite(padding[0]),finite(padding[1]),finite(padding[0])];
    return undefined;
  }
  function mercatorWorldPixel(coord,zoom){
    const c=lonLat(coord),z=Math.max(0,finite(zoom)),scale=256*Math.pow(2,z);
    const lng=c[0],lat=Math.max(-85.05112878,Math.min(85.05112878,c[1]));
    const sin=Math.sin(lat*Math.PI/180);
    return point((lng+180)/360*scale,(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale);
  }


  function createDomOverlayController(spec={}){
    const container=spec.container,lonLatToPixel=spec.lonLatToPixel,pixelToLonLat=spec.pixelToLonLat,setPanEnabled=spec.setPanEnabled,isPanEnabled=spec.isPanEnabled;
    if(!container||typeof lonLatToPixel!=='function'||typeof pixelToLonLat!=='function')throw new Error('DOM overlay requires a map container and coordinate converters.');
    const element=spec.element||global.document?.createElement?.('div');
    if(!element)throw new Error('DOM overlay element could not be created.');
    if(spec.className)element.className=spec.className;
    if(spec.html!=null)element.innerHTML=String(spec.html);
    if(spec.title)element.title=String(spec.title);
    element.dataset.editpolygonMapOverlay='1';
    Object.assign(element.style,{position:'absolute',zIndex:String(spec.zIndex??3000),pointerEvents:spec.interactive===false?'none':'auto',touchAction:spec.draggable?'none':'auto',userSelect:'none',willChange:'transform'});
    if(!element.parentNode)container.appendChild(element);
    let coordinate=lonLat(spec.coordinate||[0,0]),removed=false,dragging=false,panWasEnabled=true;
    const anchor=Array.isArray(spec.anchor)?[finite(spec.anchor[0]),finite(spec.anchor[1])]:[0,0];
    function update(){if(removed)return;const p=lonLatToPixel(coordinate);element.style.transform=`translate(${p.x-anchor[0]}px, ${p.y-anchor[1]}px)`;}
    function setCoordinate(next){coordinate=lonLat(next);update();return api;}
    function getCoordinate(){return coordinate.slice();}
    function eventPayload(originalEvent){const c=getCoordinate();return {target:api,lonLat:c,latLng:{lng:c[0],lat:c[1]},originalEvent};}
    let moveHandler=null,upHandler=null;
    function finishDrag(event,cancelled=false){
      if(!dragging)return;dragging=false;
      try{global.removeEventListener?.('pointermove',moveHandler,true);global.removeEventListener?.('pointerup',upHandler,true);global.removeEventListener?.('pointercancel',upHandler,true);}catch(_){ }
      try{if(typeof setPanEnabled==='function')setPanEnabled(panWasEnabled);}catch(_){ }
      try{spec.onDragEnd?.({...eventPayload(event),cancelled});}catch(_){ }
    }
    if(spec.draggable){
      element.addEventListener?.('pointerdown',event=>{
        if(event.button!=null&&event.button!==0)return;
        try{event.preventDefault();event.stopPropagation();element.setPointerCapture?.(event.pointerId);}catch(_){ }
        dragging=true;panWasEnabled=typeof isPanEnabled==='function'?!!isPanEnabled():true;
        try{if(typeof setPanEnabled==='function')setPanEnabled(false);}catch(_){ }
        try{spec.onDragStart?.(eventPayload(event));}catch(_){ }
        moveHandler=ev=>{if(!dragging)return;const rect=container.getBoundingClientRect?.()||{left:0,top:0};const px=point((ev.clientX??0)-rect.left,(ev.clientY??0)-rect.top);const next=lonLat(pixelToLonLat(px));next[0]=wrapLongitudeNear(next[0],coordinate[0]);coordinate=next;update();try{spec.onDrag?.(eventPayload(ev));}catch(_){ }};
        upHandler=ev=>finishDrag(ev,ev.type==='pointercancel');
        global.addEventListener?.('pointermove',moveHandler,true);global.addEventListener?.('pointerup',upHandler,true);global.addEventListener?.('pointercancel',upHandler,true);
      });
    }
    function getElement(){return element;}
    function remove(){if(removed)return;removed=true;finishDrag({type:'remove'},true);try{element.remove();}catch(_){try{element.parentNode?.removeChild?.(element);}catch(__){ }}try{spec.onRemove?.(api);}catch(_){ }}
    const api=Object.freeze({__editpolygonDomOverlay:true,setCoordinate,getCoordinate,getElement,remove,destroy:remove,update,isDragging:()=>dragging});
    update();return api;
  }

  function createRuntime(options={}){
    const ol=options.ol||global.ol;
    if(!ol||typeof ol.Map!=='function'||!ol.proj?.fromLonLat||!ol.proj?.toLonLat)throw new Error('OpenLayers failed to load.');
    const target=typeof options.target==='string'?global.document?.getElementById(options.target):options.target;
    if(!target)throw new Error('Map target was not found.');
    const center=lonLat(options.center||[0,20]),zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const view=new ol.View({center:ol.proj.fromLonLat(center),zoom,minZoom:0,maxZoom:22,constrainResolution:false});
    // The browser-global OpenLayers build does not expose control.defaults() in
    // the same shape as ESM. Build the small control set we actually need
    // explicitly: retain +/- zoom controls and visible attribution.
    const defaultControls=[];
    try{if(typeof ol.control?.Zoom==='function')defaultControls.push(new ol.control.Zoom());}catch(_){ }
    try{if(typeof ol.control?.Attribution==='function')defaultControls.push(new ol.control.Attribution({collapsible:true}));}catch(_){ }
    const nativeMap=new ol.Map({target,layers:[],view,controls:options.controls??defaultControls});
    const geoJsonFormat=new ol.format.GeoJSON();
    if(options.doubleClickZoom===false){
      const dbl=(nativeMap.getInteractions?.().getArray?.()||[]).find(i=>i?.constructor?.name==='DoubleClickZoom');
      dbl?.setActive?.(false);
    }

    // Editor handles and labels share one DOM pane above the OpenLayers canvas.
    // Position updates are batched by the runtime rather than subscribing every
    // overlay independently to the same map events.
    const domOverlayPane=global.document.createElement('div');
    domOverlayPane.className='editpolygon-dom-overlays';
    domOverlayPane.dataset.mapDomOverlays='1';
    Object.assign(domOverlayPane.style,{position:'absolute',inset:'0',zIndex:'40',background:'transparent',pointerEvents:'none',overflow:'hidden'});
    target.appendChild(domOverlayPane);

    function getContainer(){return target;}
    function getSize(){const s=nativeMap.getSize?.()||[target.clientWidth||0,target.clientHeight||0];return point(s[0],s[1]);}
    function getZoom(){return finite(view.getZoom(),0);}
    // OpenLayers' public toLonLat() deliberately wraps longitude into the
    // canonical -180..180 range. That is useful for labels, but it loses the
    // horizontal world copy represented by an EPSG:3857 coordinate. Drawing,
    // handles and viewport culling need the inverse transform to retain that
    // continuous longitude branch. Recover it from the projected world width,
    // then unwrap the canonical longitude to the projected x coordinate.
    const projectedOriginX=(()=>{try{return finite(ol.proj.fromLonLat([0,0])?.[0],0);}catch(_){return 0;}})();
    const projectedHalfWorld=(()=>{try{const x=Number(ol.proj.fromLonLat([180,0])?.[0]);return Number.isFinite(x)&&Math.abs(x-projectedOriginX)>1?Math.abs(x-projectedOriginX):20037508.342789244;}catch(_){return 20037508.342789244;}})();
    function projectedToContinuousLonLat(coordinate){
      if(!Array.isArray(coordinate)||coordinate.length<2)return [0,0];
      let ll;try{ll=lonLat(ol.proj.toLonLat(coordinate));}catch(_){return [0,0];}
      const x=Number(coordinate[0]),reference=Number.isFinite(x)?((x-projectedOriginX)/projectedHalfWorld)*180:ll[0];
      ll[0]=wrapLongitudeNear(ll[0],reference);
      return ll;
    }
    function getCenter(){const c=view.getCenter();return c?projectedToContinuousLonLat(c):[0,0];}
    function getView(){return {center:getCenter(),zoom:getZoom()};}
    function setView(centerLonLat,nextZoom,viewOptions={}){const c=lonLat(centerLonLat),projected=ol.proj.fromLonLat(c);if(viewOptions.animate&&typeof view.animate==='function')view.animate({center:projected,zoom:nextZoom,duration:finite(viewOptions.duration,250)});else{view.setCenter(projected);if(Number.isFinite(Number(nextZoom)))view.setZoom(Number(nextZoom));}}
    function setViewLatLng(centerLatLng,nextZoom,viewOptions){let c;if(Array.isArray(centerLatLng))c=[finite(centerLatLng[1]),finite(centerLatLng[0])];else c=lonLat(centerLatLng);setView(c,nextZoom,viewOptions);}
    function fitExtent(extent,fitOptions={}){const b=bbox(extent);if(!b)return false;const projected=ol.proj.transformExtent?ol.proj.transformExtent(b,'EPSG:4326','EPSG:3857'):[ol.proj.fromLonLat([b[0],b[1]])[0],ol.proj.fromLonLat([b[0],b[1]])[1],ol.proj.fromLonLat([b[2],b[3]])[0],ol.proj.fromLonLat([b[2],b[3]])[1]];view.fit(projected,{size:nativeMap.getSize?.(),padding:normalisePadding(fitOptions.padding),maxZoom:Number.isFinite(Number(fitOptions.maxZoom))?Number(fitOptions.maxZoom):undefined,duration:fitOptions.animate===false?0:finite(fitOptions.duration,0)});return true;}
    function fitLatLngBounds(boundsLike,fitOptions={}){try{if(Array.isArray(boundsLike)&&Array.isArray(boundsLike[0])){const a=boundsLike[0],b=boundsLike[1];return fitExtent([a[1],a[0],b[1],b[0]],fitOptions);}}catch(_){ }return false;}
    function panInside(coord,panOptions={}){const c=lonLat(coord),projected=ol.proj.fromLonLat(c),size=nativeMap.getSize?.();let inside=false;try{inside=ol.extent?.containsCoordinate?.(view.calculateExtent(size),projected)||false;}catch(_){ }if(!inside)setView(c,getZoom(),{animate:panOptions.animate!==false,duration:200});return true;}
    function getExtent(padRatio=0){const size=nativeMap.getSize?.(),e=view.calculateExtent(size);const sw=projectedToContinuousLonLat([e[0],e[1]]),ne=projectedToContinuousLonLat([e[2],e[3]]);let out=[sw[0],sw[1],ne[0],ne[1]];if(padRatio){const dx=(out[2]-out[0])*padRatio,dy=(out[3]-out[1])*padRatio;out=[out[0]-dx,out[1]-dy,out[2]+dx,out[3]+dy];}return out;}
    function lonLatToPixel(coord){const c=lonLat(coord),center=getCenter(),display=[wrapLongitudeNear(c[0],center[0]),c[1]],p=nativeMap.getPixelFromCoordinate(ol.proj.fromLonLat(display));return point(p||[0,0]);}
    function latLngToPixel(value){const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;return lonLatToPixel(lonLat(ll));}
    function pixelToLonLat(value){const p=point(value),c=nativeMap.getCoordinateFromPixel([p.x,p.y]);return c?projectedToContinuousLonLat(c):[0,0];}
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
    function resize(){nativeMap.updateSize?.();}

    const records=[],zoomStartSubscribers=new Set(),zoomEndSubscribers=new Set();let zooming=false,lastZoom=getZoom();
    function normalizeOlEvent(type,event){let pixel=event?.pixel?point(event.pixel):null,coord=event?.coordinate?projectedToContinuousLonLat(event.coordinate):null;if(!pixel&&event?.originalEvent)try{pixel=point(nativeMap.getEventPixel(event.originalEvent));}catch(_){ }if(!coord&&pixel)try{const c=nativeMap.getCoordinateFromPixel([pixel.x,pixel.y]);if(c)coord=projectedToContinuousLonLat(c);}catch(_){ }const ll=coord?{lat:coord[1],lng:coord[0]}:null;return {type,lonLat:coord||null,latLng:ll,pixel,originalEvent:event?.originalEvent||event||null,nativeEvent:event||null};}
    function emitSubscribers(subscribers,type,event){for(const record of [...subscribers])record.handler(record.native?event:normalizeOlEvent(type,event));}
    view.on('change:resolution',event=>{if(zooming)return;zooming=true;emitSubscribers(zoomStartSubscribers,'zoomstart',event);});
    nativeMap.on('moveend',event=>{const z=getZoom();if(!zooming&&z===lastZoom)return;zooming=false;lastZoom=z;emitSubscribers(zoomEndSubscribers,'zoomend',event);});
    function bindOne(type,handler,native){
      let targetObj=nativeMap,eventType=type,wrapped;
      if(type==='zoomstart'||type==='zoomend'){
        const subscribers=type==='zoomstart'?zoomStartSubscribers:zoomEndSubscribers,record={handler,native:!!native,type,special:type};
        subscribers.add(record);records.push(record);return;
      }
      if(type==='click'){
        // OpenLayers owns click delivery directly. DOM edit/measurement handles
        // stop propagation themselves, so there is no second map/event surface.
        wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));
        nativeMap.on(eventType,wrapped);
        records.push({targetObj:nativeMap,eventType,handler,wrapped,dom:false,type});
        return;
      }
      if(type==='mousemove'){eventType='pointermove';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else if(type==='mouseout'||type==='contextmenu'){
        targetObj=nativeMap.getViewport?.()||target;eventType=type;wrapped=e=>{if(type==='contextmenu')e.preventDefault?.();handler(native?e:normalizeOlEvent(type,{originalEvent:e,pixel:nativeMap.getEventPixel?.(e),coordinate:nativeMap.getCoordinateFromPixel?.(nativeMap.getEventPixel?.(e))}));};targetObj.addEventListener(eventType,wrapped);records.push({targetObj,eventType,handler,wrapped,dom:true,type});return;
      }else if(type==='resize'){
        const ro=global.ResizeObserver?new global.ResizeObserver(()=>{resize();handler(native?{type}:normalizeOlEvent(type,{type}));}):null;if(ro){ro.observe(target);records.push({handler,ro,type});}return;
      }else if(type==='move'){targetObj=view;eventType='change:center';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else if(type==='viewreset'){eventType='moveend';wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));}
      else wrapped=native?handler:(e=>handler(normalizeOlEvent(type,e)));
      targetObj.on(eventType,wrapped);records.push({targetObj,eventType,handler,wrapped,dom:false,type});
    }
    function on(types,handler,{native=false}={}){String(types||'').split(/\s+/).filter(Boolean).forEach(type=>bindOne(type,handler,native));return ()=>off(types,handler);}
    function off(types,handler){const wanted=new Set(String(types||'').split(/\s+/).filter(Boolean));for(let i=records.length-1;i>=0;i--){const r=records[i];if((!wanted.size||wanted.has(r.type)||wanted.has(r.eventType))&&(!handler||handler===r.handler)){if(r.special)(r.special==='zoomstart'?zoomStartSubscribers:zoomEndSubscribers).delete(r);else if(r.ro)r.ro.disconnect();else if(r.dom)r.targetObj.removeEventListener(r.eventType,r.wrapped);else r.targetObj.un?.(r.eventType,r.wrapped);records.splice(i,1);}}}
    function stopNativeEvent(event){const e=event?.originalEvent||event?.nativeEvent||event;try{e?.preventDefault?.();e?.stopPropagation?.();}catch(_){ }}
    function addDisplayLayer(layer){if(layer&&nativeMap.getLayers&&!nativeMap.getLayers().getArray().includes(layer))nativeMap.addLayer(layer);return layer;}
    function removeDisplayLayer(layer){if(layer)try{nativeMap.removeLayer(layer);}catch(_){ }return layer;}
    function hasDisplayLayer(layer){return !!layer&&!!nativeMap.getLayers?.().getArray?.().includes(layer);}
    function createEmptyLayerGroup(){return new ol.layer.Group({layers:[]});}
    function normalizeTileUrl(url,tms=false){let out=String(url||'').replace(/\{s\}/g,'{a-c}').replace(/\{r\}/g,'');if(tms)out=out.replace(/\{y\}/g,'{-y}');return out;}
    function createTileLayer(spec={}){const sourceMaxZoom=Number.isFinite(Number(spec.maxNativeZoom))?Number(spec.maxNativeZoom):(spec.maxZoom??22);const source=new ol.source.XYZ({url:normalizeTileUrl(spec.url||spec.urlTemplate,spec.tms),attributions:spec.attribution||undefined,minZoom:spec.minZoom??0,maxZoom:sourceMaxZoom,tileSize:spec.tileSize||256,crossOrigin:'anonymous'});const layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??0});layer.__editpolygonMaxNativeZoom=sourceMaxZoom;return layer;}
    function createWmsLayer(spec={}){
      const url=String(spec.url||''),geoserver=spec.serverType==='geoserver'||(!spec.serverType&&/\/geoserver(?:\/|$)/i.test(url));
      const params={LAYERS:spec.layers||spec.wmsLayers||'',STYLES:spec.styles||spec.wmsStyles||'',FORMAT:spec.format||spec.wmsFormat||'image/png',VERSION:spec.version||spec.wmsVersion||'1.3.0',TRANSPARENT:spec.transparent!==false};
      if(spec.tiled===true||geoserver)params.TILED=true;
      const sourceOptions={url,params,attributions:spec.attribution||undefined,transition:spec.transition??0};
      if(spec.crossOrigin!=null)sourceOptions.crossOrigin=spec.crossOrigin;
      if(spec.serverType)sourceOptions.serverType=spec.serverType;else if(geoserver)sourceOptions.serverType='geoserver';
      const source=new ol.source.TileWMS(sourceOptions),layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??20});
      layer.__editpolygonWmsCrossOrigin=sourceOptions.crossOrigin??null;layer.__editpolygonWmsServerType=sourceOptions.serverType||null;return layer;
    }
    function parseDash(value){if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);if(!value)return undefined;const out=String(value).split(/[ ,]+/).map(Number).filter(Number.isFinite);return out.length?out:undefined;}
    function olStyle(style={},labelText=null){const color=style.color||'#1664d6',fillColor=style.fillColor||color,opacity=style.opacity??1,fillOpacity=style.fillOpacity??.18,weight=style.weight??2,radius=Math.max(1,Number(style.radius??5));const text=labelText==null?undefined:new ol.style.Text({text:String(labelText),font:'600 11px Arial, sans-serif',fill:new ol.style.Fill({color:'#1f2937'}),stroke:new ol.style.Stroke({color:'rgba(255,255,255,.95)',width:3}),overflow:true});return new ol.style.Style({stroke:new ol.style.Stroke({color,width:weight,lineDash:parseDash(style.dashArray)}),fill:new ol.style.Fill({color:fillColor}),image:new ol.style.Circle({radius,stroke:new ol.style.Stroke({color,width:weight}),fill:new ol.style.Fill({color:fillColor})}),text});}
    function withAlphaColor(color,alpha){if(alpha==null||alpha>=1)return color;if(/^#([0-9a-f]{6})$/i.test(color)){const m=color.slice(1),r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16);return `rgba(${r},${g},${b},${alpha})`;}return color;}
    function styleFromDescriptor(desc={},labelText=null){const s={...desc,fillColor:withAlphaColor(desc.fillColor||desc.color||'#1664d6',desc.fillOpacity??.18),color:withAlphaColor(desc.color||'#1664d6',desc.opacity??1)};return olStyle(s,labelText);}
    function createGeoJsonLayer(spec={}){
      const format=geoJsonFormat,source=new ol.source.Vector(),features=[];
      const raw=spec.data||{type:'FeatureCollection',features:[]};
      const list=raw.type==='FeatureCollection'?(raw.features||[]):raw.type==='Feature'?[raw]:raw.type&&raw.coordinates?[{type:'Feature',properties:{},geometry:raw}]:[];
      for(const item of list){if(!item?.geometry)continue;try{features.push(format.readFeature(item,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));}catch(_){ }}
      source.addFeatures(features);
      const descriptor={...(spec.style||{}),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};
      const layer=new ol.layer.Vector({source,style:styleFromDescriptor(descriptor),zIndex:spec.zIndex??40,visible:spec.visible!==false,opacity:spec.opacity??1,declutter:false,renderBuffer:spec.renderBuffer??100,updateWhileAnimating:false,updateWhileInteracting:false});
      layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='geojson';layer.__editpolygonFeatureCount=features.length;return layer;
    }
    function staticImageExtent(boundsLike){
      if(!Array.isArray(boundsLike))return null;
      let west,south,east,north;
      if(boundsLike.length===2&&Array.isArray(boundsLike[0])&&Array.isArray(boundsLike[1])){south=Number(boundsLike[0][0]);west=Number(boundsLike[0][1]);north=Number(boundsLike[1][0]);east=Number(boundsLike[1][1]);}
      else if(boundsLike.length>=4){west=Number(boundsLike[0]);south=Number(boundsLike[1]);east=Number(boundsLike[2]);north=Number(boundsLike[3]);}
      if(![west,south,east,north].every(Number.isFinite))return null;
      return ol.proj.transformExtent?ol.proj.transformExtent([west,south,east,north],'EPSG:4326','EPSG:3857'):[...ol.proj.fromLonLat([west,south]),...ol.proj.fromLonLat([east,north])];
    }
    function createStaticImageLayer(spec={}){
      const imageExtent=staticImageExtent(spec.bounds||spec.extent);
      if(!imageExtent)throw new Error('Static image layer requires geographic bounds.');
      if(!ol.source?.ImageStatic||!ol.layer?.Image)throw new Error('OpenLayers ImageStatic support is unavailable.');
      const source=new ol.source.ImageStatic({url:String(spec.url||spec.dataUrl||''),imageExtent,projection:'EPSG:3857',crossOrigin:spec.crossOrigin??undefined,interpolate:spec.interpolate!==false});
      const layer=new ol.layer.Image({source,opacity:spec.opacity??1,visible:spec.visible!==false,zIndex:spec.zIndex??40});
      layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='image';layer.__editpolygonImageExtent=imageExtent;return layer;
    }
    function setDisplayLayerOpacity(layer,value){try{layer?.setOpacity?.(Math.max(0,Math.min(1,finite(value,1))));return true;}catch(_){return false;}}
    function setDisplayLayerVisible(layer,visible){
      try{
        if(!layer)return false;
        const show=!!visible;
        layer.setVisible?.(show);
        // Visibility owns map membership.
        // This is especially important for GIS service layers, which are created
        // off-map and first become displayable through this method.
        if(show){
          if(!hasDisplayLayer(layer))addDisplayLayer(layer);
        }else if(hasDisplayLayer(layer))removeDisplayLayer(layer);
        return true;
      }catch(_){return false;}
    }
    function setDisplayLayerZIndex(layer,value){try{layer?.setZIndex?.(finite(value,0));return true;}catch(_){return false;}}
    function setGeoJsonLayerStyle(layer,spec={}){
      if(!layer?.__editpolygonReference||layer.__editpolygonReferenceKind!=='geojson')return false;
      const descriptor={...(spec.style||spec),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};
      try{layer.setStyle?.(styleFromDescriptor(descriptor));return true;}catch(_){return false;}
    }
    function createEditableVectorLayer(spec={}){
      const format=geoJsonFormat,source=new ol.source.Vector({wrapX:true,useSpatialIndex:true}),olFeatures=[],geometryFeatures=new Map(),geometrySignatures=new Map(),geometryStyles=new Map(),styleCache=new Map();
      let hasDeclutterContent=false;
      const sharedStyle=descriptor=>{const key=JSON.stringify(descriptor||{});let style=styleCache.get(key);if(!style){style=styleFromDescriptor(descriptor||{});styleCache.set(key,style);}return style;};
      for(const item of spec.features||[]){
        if(!item?.geometry)continue;
        try{const f=format.readFeature({type:'Feature',geometry:geometryToCanonicalWorld(item.geometry),properties:{__editpolygonId:item.id,__editpolygonKind:'geometry'}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});f.setId?.(item.id);const featureStyle=sharedStyle(item.style||{});f.setStyle(featureStyle);geometryFeatures.set(item.id,f);geometryStyles.set(item.id,featureStyle);geometrySignatures.set(item.id,geometryFingerprint(item.geometry));olFeatures.push(f);}catch(_){ }
        if(item.label?.coordinate&&item.label?.text!=null){hasDeclutterContent=true;try{const lf=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([canonicalLongitude(item.label.coordinate[0]),item.label.coordinate[1]])),__editpolygonId:item.id,__editpolygonKind:'label'});lf.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.label.text));olFeatures.push(lf);}catch(_){ }}
        if(item.annotation?.coordinate&&item.annotation?.text){hasDeclutterContent=true;try{const af=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat([canonicalLongitude(item.annotation.coordinate[0]),item.annotation.coordinate[1]])),__editpolygonId:item.id,__editpolygonKind:'annotation'});af.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.annotation.text));olFeatures.push(af);}catch(_){ }}
      }
      source.addFeatures(olFeatures);
      const wantsImage=spec.renderMode==='image'||spec.interactionOptimized===true;
      const canImage=wantsImage&&typeof ol.layer?.VectorImage==='function';
      const common={source,declutter:hasDeclutterContent,zIndex:spec.zIndex??100,visible:spec.visible!==false,opacity:spec.opacity??1,renderBuffer:spec.renderBuffer??(hasDeclutterContent?64:32)};
      const layer=canImage
        ?new ol.layer.VectorImage({...common,imageRatio:spec.imageRatio??1.2,renderOrder:null})
        :new ol.layer.Vector({...common,updateWhileAnimating:false,updateWhileInteracting:false,renderOrder:null});
      layer.__editpolygonEditable=true;layer.__editpolygonLayerKey=spec.layerKey??null;layer.__editpolygonFeatureCount=(spec.features||[]).length;layer.__editpolygonGeometryFeatures=geometryFeatures;layer.__editpolygonGeometryStyles=geometryStyles;layer.__editpolygonGeometrySignatures=geometrySignatures;layer.__editpolygonStyleCacheSize=styleCache.size;layer.__editpolygonDeclutter=hasDeclutterContent;layer.__editpolygonRenderMode=canImage?'vector-image':'vector';layer.__editpolygonSuppressedFeatures=new Set();return layer;
    }
    const suppressedEditableStyle=new ol.style.Style({});
    function setEditableFeatureSuppressed(layer,featureId,suppressed){
      if(!layer||featureId==null)return false;
      const feature=layer.__editpolygonGeometryFeatures?.get?.(featureId)||layer.getSource?.()?.getFeatureById?.(featureId);
      if(!feature||typeof feature.setStyle!=='function')return false;
      const hidden=!!suppressed,registry=layer.__editpolygonSuppressedFeatures||(layer.__editpolygonSuppressedFeatures=new Set());
      if(hidden===registry.has(featureId))return true;
      feature.setStyle(hidden?suppressedEditableStyle:(layer.__editpolygonGeometryStyles?.get?.(featureId)||undefined));
      if(hidden)registry.add(featureId);else registry.delete(featureId);
      return true;
    }
    function updateEditableFeatureGeometry(layer,featureId,geometry){
      if(!layer||!featureId||!geometry)return false;
      const feature=layer.__editpolygonGeometryFeatures?.get?.(featureId)||layer.getSource?.()?.getFeatureById?.(featureId);
      if(!feature||typeof feature.setGeometry!=='function')return false;
      try{const next=geoJsonFormat.readGeometry(geometryToCanonicalWorld(geometry),{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});feature.setGeometry(next);layer.__editpolygonGeometrySignatures?.set?.(featureId,geometryFingerprint(geometry));return true;}catch(_){return false;}
    }
    function editableLayerMatchesGeometry(layer,featureId,geometry){return !!layer&&layer.__editpolygonGeometrySignatures?.get?.(featureId)===geometryFingerprint(geometry);}
    function clearEditableVectorLayers(layerKey=null){let removed=0;try{for(const layer of [...(nativeMap.getLayers?.().getArray?.()||[])]){if(layer?.__editpolygonEditable&&(layerKey==null||layer.__editpolygonLayerKey===layerKey)){nativeMap.removeLayer(layer);removed++;}}}catch(_){ }return removed;}
    function editableFeatureIdsAtPixel(pixelValue,options={}){
      if(typeof nativeMap.forEachFeatureAtPixel!=='function')return [];
      const p=point(pixelValue),ids=[];
      const seen=new Set(),hitTolerance=Math.max(0,finite(options.hitTolerance,8));
      try{
        nativeMap.forEachFeatureAtPixel([p.x,p.y],(feature,layer)=>{
          if(!layer?.__editpolygonEditable)return;
          const kind=feature?.get?.('__editpolygonKind')||feature?.__editpolygonKind;
          if(kind&&kind!=='geometry')return;
          const id=feature?.getId?.()||feature?.get?.('__editpolygonId')||feature?.__editpolygonId;
          if(id!=null&&!seen.has(String(id))){seen.add(String(id));ids.push(String(id));}
        },{hitTolerance,layerFilter:layer=>!!layer?.__editpolygonEditable});
      }catch(_){ }
      return ids;
    }
    function createVectorOverlayLayer(spec={}){const source=new ol.source.Vector();const layer=new ol.layer.Vector({source,zIndex:spec.zIndex??900,visible:spec.visible!==false,opacity:spec.opacity??1,declutter:spec.declutter===true});layer.__editpolygonOverlay=true;layer.__editpolygonOverlayCallbacks=new Map();if(spec.interactive===true&&typeof nativeMap.forEachFeatureAtPixel==='function'){nativeMap.on('click',event=>{try{nativeMap.forEachFeatureAtPixel(event.pixel,(feature,hitLayer)=>{if(hitLayer&&hitLayer!==layer)return;const id=feature?.__editpolygonOverlayId;const cb=id!=null?layer.__editpolygonOverlayCallbacks.get(id):null;if(cb){cb({id,feature,layer,originalEvent:event?.originalEvent||event});return true;}},{layerFilter:hit=>hit===layer});}catch(_){ }});}if(spec.autoAdd!==false)addDisplayLayer(layer);return layer;}
    function clearVectorOverlayLayer(layer){try{layer?.getSource?.()?.clear?.();return true;}catch(_){return false;}}
    function setVectorOverlayFeatures(layer,items=[]){
      const source=layer?.getSource?.();if(!source)return false;try{source.clear?.(true);}catch(_){ }const format=geoJsonFormat,features=[];
      layer.__editpolygonOverlayCallbacks?.clear?.();
      for(const item of items||[]){if(!item?.geometry)continue;try{const feature=format.readFeature({type:'Feature',geometry:geometryToCanonicalWorld(item.geometry),properties:{...(item.properties||{}),__editpolygonOverlayId:item.id||null}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});feature.setId?.(item.id||undefined);feature.__editpolygonOverlayId=item.id||null;feature.setStyle?.(styleFromDescriptor(item.style||{}));if(item.id!=null&&typeof item.onClick==='function')layer.__editpolygonOverlayCallbacks?.set?.(item.id,item.onClick);features.push(feature);}catch(_){ }}
      source.addFeatures?.(features);return true;
    }
    const domOverlays=new Set();
    let domOverlayRefreshPending=false;
    function refreshDomOverlays(){
      domOverlayRefreshPending=false;
      for(const overlay of [...domOverlays])try{overlay.update();}catch(_){ }
    }
    function scheduleDomOverlayRefresh(){
      if(domOverlayRefreshPending)return;
      domOverlayRefreshPending=true;
      const raf=typeof global.requestAnimationFrame==='function'?global.requestAnimationFrame.bind(global):null;
      if(raf)raf(refreshDomOverlays);else refreshDomOverlays();
    }
    on('move zoomstart',scheduleDomOverlayRefresh);
    on('moveend zoomend viewreset resize',refreshDomOverlays);
    function createDomOverlay(spec={}){
      let controller=null;
      controller=createDomOverlayController({...spec,container:domOverlayPane,lonLatToPixel,pixelToLonLat,setPanEnabled,isPanEnabled,onRemove:()=>domOverlays.delete(controller)});
      domOverlays.add(controller);
      return controller;
    }

    return Object.freeze({version:VERSION,engine:'openlayers',nativeVersion:String(ol.VERSION||'10.9.0'),getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,fitExtent,fitLatLngBounds,panInside,getExtent,lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,distance,distanceLatLng,setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,resize,on,off,stopNativeEvent,addDisplayLayer,removeDisplayLayer,hasDisplayLayer,createEmptyLayerGroup,createTileLayer,createWmsLayer,createGeoJsonLayer,createStaticImageLayer,setDisplayLayerOpacity,setDisplayLayerVisible,setDisplayLayerZIndex,setGeoJsonLayerStyle,createEditableVectorLayer,createVectorOverlayLayer,clearVectorOverlayLayer,setVectorOverlayFeatures,createDomOverlay,updateEditableFeatureGeometry,editableLayerMatchesGeometry,clearEditableVectorLayers,editableFeatureIdsAtPixel,setEditableFeatureSuppressed});
  }

  global.EditPolygonMapAdapter=Object.freeze({version:VERSION,point,lonLat,latLng,bbox,bboxIntersects,wrapLongitudeNear,canonicalLongitude,geometryToCanonicalWorld,geometryFingerprint,haversine,mercatorWorldPixel,createRuntime});

})(typeof window!=='undefined'?window:globalThis);
