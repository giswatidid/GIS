(function(global){
  'use strict';

  const VERSION='1.55.4.4';

  function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
  function htmlEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');}
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
    const lng=c[0],lat=Math.max(-85.05112878,Math.min(85.05112878,c[1]));
    const sin=Math.sin(lat*Math.PI/180);
    return point((lng+180)/360*scale,(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale);
  }


  function createDomOverlayController(spec={}){
    const container=spec.container,lonLatToPixel=spec.lonLatToPixel,pixelToLonLat=spec.pixelToLonLat,onMap=spec.onMap,setPanEnabled=spec.setPanEnabled,isPanEnabled=spec.isPanEnabled;
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
    const unsubs=[];
    if(typeof onMap==='function'){['move','moveend','zoomstart','zoomend','viewreset','resize'].forEach(type=>{try{const off=onMap(type,update);if(typeof off==='function')unsubs.push(off);}catch(_){ }});}
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
        moveHandler=ev=>{if(!dragging)return;const rect=container.getBoundingClientRect?.()||{left:0,top:0};const px=point((ev.clientX??0)-rect.left,(ev.clientY??0)-rect.top);coordinate=lonLat(pixelToLonLat(px));update();try{spec.onDrag?.(eventPayload(ev));}catch(_){ }};
        upHandler=ev=>finishDrag(ev,ev.type==='pointercancel');
        global.addEventListener?.('pointermove',moveHandler,true);global.addEventListener?.('pointerup',upHandler,true);global.addEventListener?.('pointercancel',upHandler,true);
      });
    }
    function getElement(){return element;}
    function remove(){if(removed)return;removed=true;finishDrag({type:'remove'},true);for(const off of unsubs.splice(0))try{off();}catch(_){ }try{element.remove();}catch(_){try{element.parentNode?.removeChild?.(element);}catch(__){ }} }
    const api=Object.freeze({__editpolygonDomOverlay:true,setCoordinate,getCoordinate,getElement,remove,destroy:remove,update,isDragging:()=>dragging});
    update();return api;
  }

  function createLeafletRuntime(options={}){
    const L=options.L||global.L;
    if(!L||typeof L.map!=='function')throw new Error('Leaflet is required for the Leaflet map adapter.');
    const target=options.target||'map',center=lonLat(options.center||[0,20]),zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const nativeMap=options.map||L.map(target,{center:[center[1],center[0]],zoom,doubleClickZoom:options.doubleClickZoom!==false,preferCanvas:options.preferCanvas!==false,renderer:options.renderer||L.canvas({padding:0.5}),...(options.mapOptions||{})});
    const editableRenderer=options.editableRenderer||L.canvas({padding:0.5,tolerance:8});
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
    function geoJsonLatLngs(coords){if(!Array.isArray(coords))return coords;if(coords.length>=2&&Number.isFinite(Number(coords[0]))&&Number.isFinite(Number(coords[1])))return L.latLng(Number(coords[1]),Number(coords[0]));return coords.map(geoJsonLatLngs);}
    function updateEditableFeatureGeometry(layer,featureId,geometry){
      if(!layer||!featureId||!geometry)return false;let updated=false;
      const visit=node=>{
        if(!node)return;
        if(node.featureId===featureId){
          try{
            if(geometry.type==='Point'&&typeof node.setLatLng==='function'){const c=geometry.coordinates;node.setLatLng([Number(c[1]),Number(c[0])]);updated=true;}
            else if(typeof node.setLatLngs==='function'){node.setLatLngs(geoJsonLatLngs(geometry.coordinates));node.redraw?.();updated=true;}
          }catch(_){ }
        }
        if(typeof node.eachLayer==='function')try{node.eachLayer(visit);}catch(_){ }
      };
      visit(layer);return updated;
    }
    function addDisplayLayer(layer){if(!layer)return layer;try{if(typeof layer.addTo==='function')layer.addTo(nativeMap);else nativeMap.addLayer?.(layer);}catch(_){ }return layer;}
    function removeDisplayLayer(layer){if(!layer)return layer;try{nativeMap.removeLayer?.(layer);}catch(_){ }return layer;}
    function hasDisplayLayer(layer){try{return !!(layer&&nativeMap.hasLayer?.(layer));}catch(_){return false;}}
    function ensureDisplayPane(name,spec={}){
      const key=String(name||'').trim();if(!key||typeof nativeMap.getPane!=='function')return null;
      let pane=nativeMap.getPane(key);if(!pane&&typeof nativeMap.createPane==='function')pane=nativeMap.createPane(key);if(!pane)return null;
      if(spec.className&&pane.classList?.add)pane.classList.add(String(spec.className));
      if(spec.zIndex!=null&&pane.style)pane.style.zIndex=String(spec.zIndex);
      if(spec.pointerEvents!=null&&pane.style)pane.style.pointerEvents=String(spec.pointerEvents);
      return pane;
    }
    function createEmptyLayerGroup(){const group=L.layerGroup();group.__editpolygonEngine='leaflet';return group;}
    function createTileLayer(spec={}){
      const options={
        opacity:spec.opacity??1,attribution:spec.attribution||'',minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,
        tms:spec.tms===true,crossOrigin:true,tileSize:spec.tileSize||256
      };
      // Do not pass undefined optional values into Leaflet. L.setOptions() copies
      // them over class defaults; in particular `subdomains: undefined` erases
      // TileLayer's built-in `abc` value and breaks URLs containing `{s}`.
      if(Array.isArray(spec.subdomains)&&spec.subdomains.length)options.subdomains=spec.subdomains;
      else if(typeof spec.subdomains==='string'&&spec.subdomains)options.subdomains=spec.subdomains;
      if(spec.pane)options.pane=spec.pane;
      if(spec.zIndex!=null)options.zIndex=finite(spec.zIndex,0);
      const layer=L.tileLayer(String(spec.url||spec.urlTemplate||''),options);
      layer.__editpolygonEngine='leaflet';return layer;
    }
    function createWmsLayer(spec={}){
      const layer=L.tileLayer.wms(String(spec.url||''),{
        opacity:spec.opacity??1,attribution:spec.attribution||'',minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,
        layers:spec.layers||spec.wmsLayers||'',styles:spec.styles||spec.wmsStyles||'',
        format:spec.format||spec.wmsFormat||'image/png',version:spec.version||spec.wmsVersion||'1.3.0',
        transparent:spec.transparent!==false,crossOrigin:true,pane:spec.pane||undefined,zIndex:spec.zIndex!=null?finite(spec.zIndex,0):undefined
      });
      layer.__editpolygonEngine='leaflet';return layer;
    }
    function createGeoJsonLayer(spec={}){
      const descriptor={...(spec.style||{}),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};
      const layer=L.geoJSON(spec.data||{type:'FeatureCollection',features:[]},{pane:spec.pane||undefined,interactive:spec.interactive===true,style:()=>({...descriptor,pane:spec.pane||descriptor.pane}),pointToLayer:(feature,ll)=>L.circleMarker(ll,{...descriptor,pane:spec.pane||descriptor.pane,radius:descriptor.radius,interactive:spec.interactive===true})});
      layer.__editpolygonEngine='leaflet';layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='geojson';return layer;
    }
    function createStaticImageLayer(spec={}){
      const b=Array.isArray(spec.bounds)&&spec.bounds.length===2?spec.bounds:null;
      if(!b)throw new Error('Static image layer requires [[south, west], [north, east]] bounds.');
      const layer=L.imageOverlay(String(spec.url||spec.dataUrl||''),b,{pane:spec.pane||undefined,opacity:spec.opacity??1,interactive:spec.interactive===true,crossOrigin:spec.crossOrigin??false});
      layer.__editpolygonEngine='leaflet';layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='image';return layer;
    }
    function setDisplayLayerOpacity(layer,value){try{layer?.setOpacity?.(Math.max(0,Math.min(1,finite(value,1))));return true;}catch(_){return false;}}
    function setDisplayLayerVisible(layer,visible){try{if(visible){if(!hasDisplayLayer(layer))addDisplayLayer(layer);}else if(hasDisplayLayer(layer))removeDisplayLayer(layer);return true;}catch(_){return false;}}
    function setDisplayLayerZIndex(layer,value){try{layer?.setZIndex?.(finite(value,0));return true;}catch(_){return false;}}
    function setGeoJsonLayerStyle(layer,spec={}){const descriptor={...(spec.style||spec),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};try{layer?.setStyle?.(descriptor);return true;}catch(_){return false;}}
    function leafletStyleDescriptor(style={}){return {color:style.color||'#1664d6',fillColor:style.fillColor||style.color||'#1664d6',opacity:style.opacity??1,fillOpacity:style.fillOpacity??.18,weight:style.weight??2,dashArray:style.dashArray||null};}
    function editableLabelIcon(text){return L.divIcon({className:'gis-feature-label',html:`<span>${htmlEscape(text)}</span>`,iconSize:null});}
    function editableAnnotationIcon(annotation={}){
      const style=annotation.style||{},color=style.color||'#1664d6',size=Math.max(6,finite(style.size,14)),font=String(style.font||'Arial'),weight=style.bold?'700':'400',italic=style.italic?'italic':'normal';
      return L.divIcon({className:'annotation-label',html:`<div class="measure-label-inner" style="color:${htmlEscape(color)};font-size:${size}px;font-family:${htmlEscape(font)};font-weight:${weight};font-style:${italic};">${htmlEscape(annotation.text||'')}</div>`,iconSize:null});
    }
    function createEditableVectorLayer(spec={}){
      const group=L.layerGroup(),geometryFeatures=new Map();group.__editpolygonEngine='leaflet';group.__editpolygonEditable=true;group.__editpolygonFeatureCount=(spec.features||[]).length;group.__editpolygonGeometryFeatures=geometryFeatures;
      for(const item of spec.features||[]){
        if(!item?.geometry)continue;
        try{
          const descriptor={...leafletStyleDescriptor(item.style||{}),radius:Math.max(1,Number(item.style?.radius??5))};
          const raw={type:'Feature',properties:{__editpolygonId:item.id,__editpolygonKind:'geometry'},geometry:item.geometry};
          const geo=L.geoJSON(raw,{renderer:editableRenderer,interactive:false,smoothFactor:spec.smoothFactor??1.2,style:()=>descriptor,pointToLayer:(feature,ll)=>L.circleMarker(ll,{renderer:editableRenderer,radius:descriptor.radius,color:descriptor.color,fillColor:descriptor.fillColor,fillOpacity:descriptor.fillOpacity,opacity:descriptor.opacity,weight:descriptor.weight,dashArray:descriptor.dashArray,interactive:false})});
          geo.eachLayer?.(child=>{child.featureId=item.id;child.__editpolygonId=item.id;child.__editpolygonKind='geometry';child.__editpolygonEditable=true;if(!geometryFeatures.has(item.id))geometryFeatures.set(item.id,child);});group.addLayer(geo);
        }catch(_){ }
        if(item.label?.coordinate&&item.label?.text!=null)try{const c=lonLat(item.label.coordinate),marker=L.marker([c[1],c[0]],{interactive:false,icon:editableLabelIcon(item.label.text)});marker.__editpolygonKind='label';group.addLayer(marker);}catch(_){ }
        if(item.annotation?.coordinate&&item.annotation?.text)try{const c=lonLat(item.annotation.coordinate),marker=L.marker([c[1],c[0]],{interactive:false,icon:editableAnnotationIcon(item.annotation)});marker.__editpolygonKind='annotation';group.addLayer(marker);}catch(_){ }
      }
      return group;
    }
    function editableFeatureIdsAtPixel(pixelValue,options={}){
      const p=point(pixelValue),layerPoint=typeof nativeMap.containerPointToLayerPoint==='function'?nativeMap.containerPointToLayerPoint([p.x,p.y]):null;if(!layerPoint)return [];
      const ids=[],seen=new Set(),tolerance=Math.max(0,finite(options.hitTolerance,8));
      function visit(node){if(!node)return;if(node.__editpolygonKind==='geometry'&&node.__editpolygonId!=null){let hit=false;try{if(typeof node._containsPoint==='function')hit=!!node._containsPoint(layerPoint);}catch(_){ }if(!hit&&typeof node.getLatLng==='function'){try{const q=nativeMap.latLngToLayerPoint(node.getLatLng());hit=Math.hypot(q.x-layerPoint.x,q.y-layerPoint.y)<=tolerance;}catch(_){ }}if(hit&&!seen.has(String(node.__editpolygonId))){seen.add(String(node.__editpolygonId));ids.push(String(node.__editpolygonId));}}if(typeof node.eachLayer==='function')try{node.eachLayer(visit);}catch(_){ }}
      try{nativeMap.eachLayer?.(layer=>{if(layer?.__editpolygonEditable)visit(layer);});}catch(_){ }
      return ids;
    }
    function createVectorOverlayLayer(spec={}){const group=L.layerGroup();group.__editpolygonEngine='leaflet';group.__editpolygonOverlay=true;if(spec.autoAdd!==false)group.addTo(nativeMap);return group;}
    function clearVectorOverlayLayer(layer){try{layer?.clearLayers?.();return true;}catch(_){return false;}}
    function setVectorOverlayFeatures(layer,items=[]){
      if(!layer)return false;clearVectorOverlayLayer(layer);
      for(const item of items||[]){if(!item?.geometry)continue;const st=item.style||{};try{const geo=L.geoJSON({type:'Feature',properties:item.properties||{},geometry:item.geometry},{interactive:item.interactive===true,style:()=>st,pointToLayer:(feature,ll)=>L.circleMarker(ll,{radius:Math.max(1,Number(st.radius??6)),color:st.color||'#1664d6',fillColor:st.fillColor||st.color||'#1664d6',fillOpacity:st.fillOpacity??.9,opacity:st.opacity??1,weight:st.weight??2,dashArray:st.dashArray||null,interactive:item.interactive===true})});geo.eachLayer(child=>{child.__editpolygonOverlayId=item.id||null;if(item.onClick)child.on?.('click',event=>item.onClick({id:item.id,item,originalEvent:event?.originalEvent||null,latLng:event?.latlng||null}));});layer.addLayer(geo);}catch(_){ }}return true;
    }
    function createDomOverlay(spec={}){return createDomOverlayController({...spec,container:getContainer(),lonLatToPixel,pixelToLonLat,onMap:(type,fn)=>on(type,fn),setPanEnabled,isPanEnabled});}
    return Object.freeze({version:VERSION,engine:'leaflet',requestedEngine:'leaflet',getNativeMap:()=>nativeMap,getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,fitExtent,fitLatLngBounds,panInside,getExtent,lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,distance,distanceLatLng,setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,resize,on,off,stopNativeEvent,nativePanLooksActive,recoverNativePan,addDisplayLayer,removeDisplayLayer,hasDisplayLayer,ensureDisplayPane,createEmptyLayerGroup,createTileLayer,createWmsLayer,createGeoJsonLayer,createStaticImageLayer,setDisplayLayerOpacity,setDisplayLayerVisible,setDisplayLayerZIndex,setGeoJsonLayerStyle,createEditableVectorLayer,createVectorOverlayLayer,clearVectorOverlayLayer,setVectorOverlayFeatures,createDomOverlay,updateEditableFeatureGeometry,editableFeatureIdsAtPixel});
  }

  function createOpenLayersRuntime(options={}){
    const ol=options.ol||global.ol;
    if(!ol||typeof ol.Map!=='function'||!ol.proj?.fromLonLat||!ol.proj?.toLonLat)throw new Error('OpenLayers failed to load. Reload without ?mapEngine=openlayers to use Leaflet.');
    const target=typeof options.target==='string'?global.document?.getElementById(options.target):options.target;
    if(!target)throw new Error('Map target was not found.');
    const center=lonLat(options.center||[0,20]),zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const view=new ol.View({center:ol.proj.fromLonLat(center),zoom,minZoom:0,maxZoom:22,constrainResolution:false});
    // The browser-global OpenLayers build does not expose control.defaults() in
    // the same shape as ESM. Build the small control set we actually need
    // explicitly: Leaflet parity requires +/- zoom and visible attribution.
    const defaultControls=[];
    try{if(typeof ol.control?.Zoom==='function')defaultControls.push(new ol.control.Zoom());}catch(_){ }
    try{if(typeof ol.control?.Attribution==='function')defaultControls.push(new ol.control.Attribution({collapsible:true}));}catch(_){ }
    const nativeMap=new ol.Map({target,layers:[],view,controls:options.controls??defaultControls});
    if(options.doubleClickZoom===false){
      const dbl=(nativeMap.getInteractions?.().getArray?.()||[]).find(i=>i?.constructor?.name==='DoubleClickZoom');
      dbl?.setActive?.(false);
    }

    // Engine-neutral handles and labels live in one DOM pane above OpenLayers.
    // OpenLayers intentionally has no synchronised Leaflet compatibility map.
    const domOverlayPane=global.document.createElement('div');
    domOverlayPane.className='editpolygon-openlayers-dom-overlays';
    domOverlayPane.dataset.mapDomOverlays='openlayers';
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

    const records=[];let zooming=false,lastZoom=getZoom();
    function normalizeOlEvent(type,event){let pixel=event?.pixel?point(event.pixel):null,coord=event?.coordinate?projectedToContinuousLonLat(event.coordinate):null;if(!pixel&&event?.originalEvent)try{pixel=point(nativeMap.getEventPixel(event.originalEvent));}catch(_){ }if(!coord&&pixel)try{const c=nativeMap.getCoordinateFromPixel([pixel.x,pixel.y]);if(c)coord=projectedToContinuousLonLat(c);}catch(_){ }const ll=coord?{lat:coord[1],lng:coord[0]}:null;return {type,lonLat:coord||null,latLng:ll,pixel,originalEvent:event?.originalEvent||event||null,nativeEvent:event||null};}
    function bindOne(type,handler,native){
      let targetObj=nativeMap,eventType=type,wrapped;
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
    // OpenLayers uses per-layer z-index rather than named DOM panes.  Expose the
    // same contract so application code never needs a native-map escape hatch.
    function ensureDisplayPane(){return null;}
    function createEmptyLayerGroup(){return new ol.layer.Group({layers:[]});}
    function normalizeTileUrl(url,tms=false){let out=String(url||'').replace(/\{s\}/g,'{a-c}').replace(/\{r\}/g,'');if(tms)out=out.replace(/\{y\}/g,'{-y}');return out;}
    function createTileLayer(spec={}){const source=new ol.source.XYZ({url:normalizeTileUrl(spec.url||spec.urlTemplate,spec.tms),attributions:spec.attribution||undefined,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,tileSize:spec.tileSize||256,crossOrigin:'anonymous'});const layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??0});layer.__editpolygonEngine='openlayers';return layer;}
    function createWmsLayer(spec={}){const source=new ol.source.TileWMS({url:spec.url,params:{LAYERS:spec.layers||spec.wmsLayers||'',STYLES:spec.styles||spec.wmsStyles||'',FORMAT:spec.format||spec.wmsFormat||'image/png',VERSION:spec.version||spec.wmsVersion||'1.3.0',TRANSPARENT:spec.transparent!==false},attributions:spec.attribution||undefined,crossOrigin:'anonymous'});const layer=new ol.layer.Tile({source,opacity:spec.opacity??1,visible:spec.visible!==false,minZoom:spec.minZoom??0,maxZoom:spec.maxZoom??22,zIndex:spec.zIndex??20});layer.__editpolygonEngine='openlayers';return layer;}
    function parseDash(value){if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);if(!value)return undefined;const out=String(value).split(/[ ,]+/).map(Number).filter(Number.isFinite);return out.length?out:undefined;}
    function olStyle(style={},labelText=null){const color=style.color||'#1664d6',fillColor=style.fillColor||color,opacity=style.opacity??1,fillOpacity=style.fillOpacity??.18,weight=style.weight??2,radius=Math.max(1,Number(style.radius??5));const text=labelText==null?undefined:new ol.style.Text({text:String(labelText),font:'600 11px Arial, sans-serif',fill:new ol.style.Fill({color:'#1f2937'}),stroke:new ol.style.Stroke({color:'rgba(255,255,255,.95)',width:3}),overflow:true});return new ol.style.Style({stroke:new ol.style.Stroke({color,width:weight,lineDash:parseDash(style.dashArray)}),fill:new ol.style.Fill({color:fillColor}),image:new ol.style.Circle({radius,stroke:new ol.style.Stroke({color,width:weight}),fill:new ol.style.Fill({color:fillColor})}),text});}
    function withAlphaColor(color,alpha){if(alpha==null||alpha>=1)return color;if(/^#([0-9a-f]{6})$/i.test(color)){const m=color.slice(1),r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16);return `rgba(${r},${g},${b},${alpha})`;}return color;}
    function styleFromDescriptor(desc={},labelText=null){const s={...desc,fillColor:withAlphaColor(desc.fillColor||desc.color||'#1664d6',desc.fillOpacity??.18),color:withAlphaColor(desc.color||'#1664d6',desc.opacity??1)};return olStyle(s,labelText);}
    function createGeoJsonLayer(spec={}){
      const format=new ol.format.GeoJSON(),source=new ol.source.Vector(),features=[];
      const raw=spec.data||{type:'FeatureCollection',features:[]};
      const list=raw.type==='FeatureCollection'?(raw.features||[]):raw.type==='Feature'?[raw]:raw.type&&raw.coordinates?[{type:'Feature',properties:{},geometry:raw}]:[];
      for(const item of list){if(!item?.geometry)continue;try{features.push(format.readFeature(item,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));}catch(_){ }}
      source.addFeatures(features);
      const descriptor={...(spec.style||{}),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};
      const layer=new ol.layer.Vector({source,style:styleFromDescriptor(descriptor),zIndex:spec.zIndex??40,visible:spec.visible!==false,opacity:spec.opacity??1,declutter:false,renderBuffer:spec.renderBuffer??100,updateWhileAnimating:false,updateWhileInteracting:false});
      layer.__editpolygonEngine='openlayers';layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='geojson';layer.__editpolygonFeatureCount=features.length;return layer;
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
      layer.__editpolygonEngine='openlayers';layer.__editpolygonReference=true;layer.__editpolygonReferenceKind='image';layer.__editpolygonImageExtent=imageExtent;return layer;
    }
    function setDisplayLayerOpacity(layer,value){try{layer?.setOpacity?.(Math.max(0,Math.min(1,finite(value,1))));nativeMap.render?.();return true;}catch(_){return false;}}
    function setDisplayLayerVisible(layer,visible){try{layer?.setVisible?.(!!visible);nativeMap.render?.();return true;}catch(_){return false;}}
    function setDisplayLayerZIndex(layer,value){try{layer?.setZIndex?.(finite(value,0));nativeMap.render?.();return true;}catch(_){return false;}}
    function setGeoJsonLayerStyle(layer,spec={}){
      if(!layer?.__editpolygonReference||layer.__editpolygonReferenceKind!=='geojson')return false;
      const descriptor={...(spec.style||spec),radius:Math.max(1,Number(spec.pointRadius??spec.style?.radius??5))};
      try{layer.setStyle?.(styleFromDescriptor(descriptor));layer.getSource?.()?.changed?.();nativeMap.render?.();return true;}catch(_){return false;}
    }
    function createEditableVectorLayer(spec={}){
      const format=new ol.format.GeoJSON(),source=new ol.source.Vector(),olFeatures=[],geometryFeatures=new Map();
      for(const item of spec.features||[]){
        if(!item?.geometry)continue;
        try{const f=format.readFeature({type:'Feature',geometry:item.geometry,properties:{__editpolygonId:item.id,__editpolygonKind:'geometry'}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});f.setId?.(item.id);f.setStyle(styleFromDescriptor(item.style||{}));geometryFeatures.set(item.id,f);olFeatures.push(f);}catch(_){ }
        if(item.label?.coordinate&&item.label?.text!=null){try{const lf=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat(item.label.coordinate)),__editpolygonId:item.id,__editpolygonKind:'label'});lf.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.label.text));olFeatures.push(lf);}catch(_){ }}
        if(item.annotation?.coordinate&&item.annotation?.text){try{const af=new ol.Feature({geometry:new ol.geom.Point(ol.proj.fromLonLat(item.annotation.coordinate)),__editpolygonId:item.id,__editpolygonKind:'annotation'});af.setStyle(styleFromDescriptor({color:'transparent',fillColor:'transparent',weight:0,radius:0},item.annotation.text));olFeatures.push(af);}catch(_){ }}
      }
      source.addFeatures(olFeatures);const layer=new ol.layer.Vector({source,declutter:true,zIndex:spec.zIndex??100,visible:spec.visible!==false,opacity:spec.opacity??1});layer.__editpolygonEngine='openlayers';layer.__editpolygonEditable=true;layer.__editpolygonFeatureCount=(spec.features||[]).length;layer.__editpolygonGeometryFeatures=geometryFeatures;return layer;
    }
    function updateEditableFeatureGeometry(layer,featureId,geometry){
      if(!layer||!featureId||!geometry)return false;
      const feature=layer.__editpolygonGeometryFeatures?.get?.(featureId)||layer.getSource?.()?.getFeatureById?.(featureId);
      if(!feature||typeof feature.setGeometry!=='function')return false;
      try{const format=new ol.format.GeoJSON(),next=format.readGeometry(geometry,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});feature.setGeometry(next);layer.getSource?.()?.changed?.();nativeMap.render?.();return true;}catch(_){return false;}
    }
    function editableFeatureIdsAtPixel(pixelValue,options={}){
      if(typeof nativeMap.forEachFeatureAtPixel!=='function')return [];
      const p=point(pixelValue),ids=[];
      const seen=new Set(),hitTolerance=Math.max(0,finite(options.hitTolerance,8));
      try{
        nativeMap.forEachFeatureAtPixel([p.x,p.y],(feature,layer)=>{
          if(!layer?.__editpolygonEditable)return;
          const kind=feature?.get?.('__editpolygonKind')||feature?.values_?.__editpolygonKind||feature?.__editpolygonKind;
          if(kind&&kind!=='geometry')return;
          const id=feature?.getId?.()||feature?.get?.('__editpolygonId')||feature?.values_?.__editpolygonId||feature?.__editpolygonId;
          if(id!=null&&!seen.has(String(id))){seen.add(String(id));ids.push(String(id));}
        },{hitTolerance,layerFilter:layer=>!!layer?.__editpolygonEditable});
      }catch(_){ }
      return ids;
    }
    function createVectorOverlayLayer(spec={}){const source=new ol.source.Vector();const layer=new ol.layer.Vector({source,zIndex:spec.zIndex??900,visible:spec.visible!==false,opacity:spec.opacity??1,declutter:spec.declutter===true});layer.__editpolygonEngine='openlayers';layer.__editpolygonOverlay=true;layer.__editpolygonOverlayCallbacks=new Map();if(spec.interactive===true&&typeof nativeMap.forEachFeatureAtPixel==='function'){nativeMap.on('click',event=>{try{nativeMap.forEachFeatureAtPixel(event.pixel,(feature,hitLayer)=>{if(hitLayer&&hitLayer!==layer)return;const id=feature?.__editpolygonOverlayId;const cb=id!=null?layer.__editpolygonOverlayCallbacks.get(id):null;if(cb){cb({id,feature,layer,originalEvent:event?.originalEvent||event});return true;}},{layerFilter:hit=>hit===layer});}catch(_){ }});}if(spec.autoAdd!==false)addDisplayLayer(layer);return layer;}
    function clearVectorOverlayLayer(layer){try{layer?.getSource?.()?.clear?.();return true;}catch(_){return false;}}
    function setVectorOverlayFeatures(layer,items=[]){
      const source=layer?.getSource?.();if(!source)return false;try{source.clear?.();}catch(_){ }const format=new ol.format.GeoJSON(),features=[];
      layer.__editpolygonOverlayCallbacks?.clear?.();
      for(const item of items||[]){if(!item?.geometry)continue;try{const feature=format.readFeature({type:'Feature',geometry:item.geometry,properties:{...(item.properties||{}),__editpolygonOverlayId:item.id||null}},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'});feature.setId?.(item.id||undefined);feature.__editpolygonOverlayId=item.id||null;feature.setStyle?.(styleFromDescriptor(item.style||{}));if(item.id!=null&&typeof item.onClick==='function')layer.__editpolygonOverlayCallbacks?.set?.(item.id,item.onClick);features.push(feature);}catch(_){ }}
      source.addFeatures?.(features);source.changed?.();nativeMap.render?.();return true;
    }
    function createDomOverlay(spec={}){return createDomOverlayController({...spec,container:domOverlayPane,lonLatToPixel,pixelToLonLat,onMap:(type,fn)=>on(type,fn),setPanEnabled,isPanEnabled});}

    return Object.freeze({version:VERSION,engine:'openlayers',requestedEngine:'openlayers',nativeVersion:String(ol.VERSION||'10.9.0'),getNativeMap:()=>nativeMap,getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,fitExtent,fitLatLngBounds,panInside,getExtent,lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,distance,distanceLatLng,setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,resize,on,off,stopNativeEvent,nativePanLooksActive,recoverNativePan,addDisplayLayer,removeDisplayLayer,hasDisplayLayer,ensureDisplayPane,createEmptyLayerGroup,createTileLayer,createWmsLayer,createGeoJsonLayer,createStaticImageLayer,setDisplayLayerOpacity,setDisplayLayerVisible,setDisplayLayerZIndex,setGeoJsonLayerStyle,createEditableVectorLayer,createVectorOverlayLayer,clearVectorOverlayLayer,setVectorOverlayFeatures,createDomOverlay,updateEditableFeatureGeometry,editableFeatureIdsAtPixel});
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

  global.EditPolygonMapAdapter=Object.freeze({version:VERSION,point,lonLat,latLng,bbox,bboxIntersects,wrapLongitudeNear,haversine,mercatorWorldPixel,requestedEngine,createRuntime,createLeafletRuntime,createOpenLayersRuntime});
})(typeof window!=='undefined'?window:globalThis);
