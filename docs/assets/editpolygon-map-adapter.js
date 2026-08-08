(function(global){
  'use strict';

  const VERSION='1.55.0';

  function finite(value,fallback=0){
    const n=Number(value);
    return Number.isFinite(n)?n:fallback;
  }

  function point(x,y){
    if(Array.isArray(x)){y=x[1];x=x[0];}
    else if(x&&typeof x==='object'&&y==null){y=x.y;x=x.x;}
    const p={x:finite(x),y:finite(y)};
    p.distanceTo=function(other){
      const q=point(other);
      return Math.hypot(p.x-q.x,p.y-q.y);
    };
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

  function latLng(value){
    const c=lonLat(value);
    return {lat:c[1],lng:c[0]};
  }

  function bbox(value){
    if(!Array.isArray(value)||value.length<4)return null;
    const out=value.slice(0,4).map(Number);
    return out.every(Number.isFinite)?out:null;
  }

  function bboxIntersects(a,b){
    const aa=bbox(a),bb=bbox(b);
    if(!aa||!bb)return false;
    return !(aa[2]<bb[0]||aa[0]>bb[2]||aa[3]<bb[1]||aa[1]>bb[3]);
  }

  function createLeafletRuntime(options={}){
    const L=options.L||global.L;
    if(!L||typeof L.map!=='function')throw new Error('Leaflet is required for the v1.55.0 Leaflet map adapter.');
    const target=options.target||'map';
    const center=lonLat(options.center||[0,20]);
    const zoom=Number.isFinite(Number(options.zoom))?Number(options.zoom):3;
    const nativeMap=options.map||L.map(target,{
      center:[center[1],center[0]],
      zoom,
      doubleClickZoom:options.doubleClickZoom!==false,
      preferCanvas:options.preferCanvas!==false,
      renderer:options.renderer||L.canvas({padding:0.5}),
      ...(options.mapOptions||{})
    });

    const listenerRecords=[];

    function getContainer(){return nativeMap.getContainer();}
    function getSize(){const s=nativeMap.getSize();return point(s.x,s.y);}
    function getZoom(){return nativeMap.getZoom();}
    function getCenter(){const c=nativeMap.getCenter();return [c.lng,c.lat];}
    function getView(){return {center:getCenter(),zoom:getZoom()};}

    function setView(centerLonLat,nextZoom,viewOptions){
      const c=lonLat(centerLonLat);
      nativeMap.setView([c[1],c[0]],nextZoom,viewOptions||{});
    }
    // Transitional convenience for legacy call-sites. The public contract is
    // longitude/latitude, but v1.55.0 keeps this bridge while the renderer is Leaflet.
    function setViewLatLng(centerLatLng,nextZoom,viewOptions){
      let c;
      if(Array.isArray(centerLatLng))c=[finite(centerLatLng[1]),finite(centerLatLng[0])];
      else c=lonLat(centerLatLng);
      setView(c,nextZoom,viewOptions);
    }

    function fitExtent(extent,fitOptions={}){
      const b=bbox(extent);
      if(!b)return false;
      nativeMap.fitBounds([[b[1],b[0]],[b[3],b[2]]],fitOptions||{});
      return true;
    }
    function fitLatLngBounds(boundsLike,fitOptions={}){
      nativeMap.fitBounds(boundsLike,fitOptions||{});
      return true;
    }
    function panInside(coord,panOptions={}){
      const c=lonLat(coord);
      if(typeof nativeMap.panInside==='function')nativeMap.panInside([c[1],c[0]],panOptions||{});
      else nativeMap.panTo([c[1],c[0]],panOptions||{});
      return true;
    }
    function getExtent(padRatio=0){
      let b=nativeMap.getBounds();
      if(padRatio&&b&&typeof b.pad==='function')b=b.pad(padRatio);
      return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
    }

    function lonLatToPixel(coord){
      const c=lonLat(coord),p=nativeMap.latLngToContainerPoint([c[1],c[0]]);
      return point(p.x,p.y);
    }
    function latLngToPixel(value){
      const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;
      return lonLatToPixel(lonLat(ll));
    }
    function pixelToLonLat(value){
      const p=point(value),ll=nativeMap.containerPointToLatLng([p.x,p.y]);
      return [ll.lng,ll.lat];
    }
    function pixelToLatLng(value){
      const c=pixelToLonLat(value);
      return {lat:c[1],lng:c[0]};
    }

    function lonLatToLayerPixel(coord){
      const c=lonLat(coord),p=nativeMap.latLngToLayerPoint([c[1],c[0]]);
      return point(p.x,p.y);
    }
    function latLngToLayerPixel(value){
      const ll=Array.isArray(value)?{lat:finite(value[0]),lng:finite(value[1])}:value;
      return lonLatToLayerPixel(lonLat(ll));
    }
    function layerPixelToLonLat(value){
      const p=point(value),ll=nativeMap.layerPointToLatLng([p.x,p.y]);
      return [ll.lng,ll.lat];
    }
    function layerPixelToLatLng(value){
      const c=layerPixelToLonLat(value);
      return {lat:c[1],lng:c[0]};
    }
    function projectLonLat(coord,atZoom=getZoom()){
      const c=lonLat(coord),p=nativeMap.project(L.latLng(c[1],c[0]),atZoom);
      return point(p.x,p.y);
    }

    function distance(a,b){
      const aa=lonLat(a),bb=lonLat(b);
      return nativeMap.distance([aa[1],aa[0]],[bb[1],bb[0]]);
    }
    function distanceLatLng(a,b){
      return nativeMap.distance(a,b);
    }

    function setPanEnabled(enabled){
      if(!nativeMap.dragging)return;
      if(enabled)nativeMap.dragging.enable();
      else nativeMap.dragging.disable();
    }
    function isPanEnabled(){return !!nativeMap.dragging?.enabled?.();}
    function setDoubleClickZoomEnabled(enabled){
      if(!nativeMap.doubleClickZoom)return;
      if(enabled)nativeMap.doubleClickZoom.enable();
      else nativeMap.doubleClickZoom.disable();
    }
    function isDoubleClickZoomEnabled(){return !!nativeMap.doubleClickZoom?.enabled?.();}
    function resize(options={pan:false,animate:false}){nativeMap.invalidateSize(options);}

    function normalizeEvent(type,event){
      const ll=event?.latlng?{lat:event.latlng.lat,lng:event.latlng.lng}:null;
      let eventPixel=event?.containerPoint?point(event.containerPoint.x,event.containerPoint.y):null;
      if(!eventPixel&&ll)eventPixel=latLngToPixel(ll);
      return {
        type,
        lonLat:ll?[ll.lng,ll.lat]:null,
        latLng:ll,
        pixel:eventPixel,
        originalEvent:event?.originalEvent||null,
        nativeEvent:event||null
      };
    }

    function on(types,handler,{native=false}={}){
      String(types||'').split(/\s+/).filter(Boolean).forEach(type=>{
        const wrapped=native?handler:(event=>handler(normalizeEvent(type,event)));
        nativeMap.on(type,wrapped);
        listenerRecords.push({type,handler,wrapped,native});
      });
      return ()=>off(types,handler);
    }
    function off(types,handler){
      const wanted=new Set(String(types||'').split(/\s+/).filter(Boolean));
      for(let i=listenerRecords.length-1;i>=0;i--){
        const rec=listenerRecords[i];
        if((!wanted.size||wanted.has(rec.type))&&(!handler||handler===rec.handler)){
          nativeMap.off(rec.type,rec.wrapped);
          listenerRecords.splice(i,1);
        }
      }
    }

    function stopNativeEvent(event){
      const e=event?.nativeEvent||event;
      try{if(e)L.DomEvent.stop(e);}catch(_){
        try{event?.originalEvent?.preventDefault?.();event?.originalEvent?.stopPropagation?.();}catch(__){}
      }
    }

    // Leaflet-only recovery is intentionally contained here. The rest of the
    // editor asks whether a native pan looks stuck and requests recovery; it no
    // longer reaches into Leaflet's private Draggable fields directly.
    function nativePanLooksActive(){
      const d=nativeMap?.dragging?._draggable;
      const c=getContainer();
      return !!(
        d&&(d._moving||d._moved||d._lastTarget)||
        global.document?.body?.classList?.contains('leaflet-dragging')||
        global.document?.documentElement?.classList?.contains('leaflet-dragging')||
        (c&&(c.classList.contains('leaflet-drag-target')||c.classList.contains('leaflet-dragging')))
      );
    }
    function recoverNativePan(event){
      const d=nativeMap?.dragging?._draggable;
      try{if(d&&typeof d._onUp==='function')d._onUp(event||{});}catch(_){ }
      try{
        if(d){
          d._moving=false;d._moved=false;d._lastTarget=null;d._newPos=null;d._startPos=null;d._startPoint=null;
        }
      }catch(_){ }
      try{
        global.document?.body?.classList?.remove('leaflet-dragging');
        global.document?.documentElement?.classList?.remove('leaflet-dragging');
        const c=getContainer();
        c?.classList?.remove('leaflet-drag-target','leaflet-dragging');
      }catch(_){ }
      try{if(isPanEnabled()){setPanEnabled(false);setPanEnabled(true);}}catch(_){ }
    }

    return Object.freeze({
      version:VERSION,
      engine:'leaflet',
      getNativeMap:()=>nativeMap,
      getContainer,getSize,getZoom,getCenter,getView,setView,setViewLatLng,
      fitExtent,fitLatLngBounds,panInside,getExtent,
      lonLatToPixel,latLngToPixel,pixelToLonLat,pixelToLatLng,
      lonLatToLayerPixel,latLngToLayerPixel,layerPixelToLonLat,layerPixelToLatLng,projectLonLat,
      distance,distanceLatLng,
      setPanEnabled,isPanEnabled,setDoubleClickZoomEnabled,isDoubleClickZoomEnabled,
      resize,on,off,stopNativeEvent,nativePanLooksActive,recoverNativePan
    });
  }

  global.EditPolygonMapAdapter=Object.freeze({
    version:VERSION,
    point,lonLat,latLng,bbox,bboxIntersects,
    createLeafletRuntime
  });
})(typeof window!=='undefined'?window:globalThis);
