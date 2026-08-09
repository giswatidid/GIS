from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None

with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    executable=chromium_path()
    if executable:options['executable_path']=executable
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1000,'height':700})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(r'''<!doctype html><html><body><div id="map"></div><script>
    function classes(){const s=new Set();return {contains:v=>s.has(v),add:(...v)=>v.forEach(x=>s.add(x)),remove:(...v)=>v.forEach(x=>s.delete(x))};}
    class FakeMap{
      constructor(){this.zoom=5;this.center={lat:-27,lng:153};this.handlers={};this.layers=new Set();this.container={classList:classes(),appendChild(){},getBoundingClientRect(){return{left:0,top:0}}};this.dragEnabled=true;this.doubleEnabled=true;this.dragging={_draggable:{_moving:false,_moved:false,_lastTarget:null,_onUp:()=>{}},enable:()=>this.dragEnabled=true,disable:()=>this.dragEnabled=false,enabled:()=>this.dragEnabled};this.doubleClickZoom={enable:()=>this.doubleEnabled=true,disable:()=>this.doubleEnabled=false,enabled:()=>this.doubleEnabled};}
      getContainer(){return this.container} getSize(){return{x:1000,y:700}} getZoom(){return this.zoom} getCenter(){return this.center}
      setView(ll,z){this.center={lat:ll[0],lng:ll[1]};this.zoom=z} fitBounds(b,o){this.fit={b,o}}
      getBounds(){return{getWest:()=>150,getSouth:()=>-30,getEast:()=>156,getNorth:()=>-24,pad:()=>this.getBounds()}}
      latLngToContainerPoint(ll){return{x:ll[1]*2,y:ll[0]*-2}} containerPointToLatLng(p){return{lng:(p[0]??p.x)/2,lat:(p[1]??p.y)/-2}}
      latLngToLayerPoint(ll){return{x:ll[1]*3,y:ll[0]*-3}} layerPointToLatLng(p){return{lng:(p[0]??p.x)/3,lat:(p[1]??p.y)/-3}} containerPointToLayerPoint(p){return{x:p[0]??p.x,y:p[1]??p.y}}
      project(ll,z){return{x:ll.lng*z,y:ll.lat*z}} distance(){return 123} invalidateSize(){this.resized=true} panInside(ll){this.panned=ll}
      on(t,h){(this.handlers[t]??=[]).push(h)} off(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(x=>x!==h)} fire(t,e){(this.handlers[t]||[]).forEach(h=>h(e))}
      addLayer(x){this.layers.add(x);x._map=this;return this} removeLayer(x){this.layers.delete(x);return this} hasLayer(x){return this.layers.has(x)} eachLayer(fn){this.layers.forEach(fn)}
    }
    function group(){const children=[];return{children,addLayer(x){children.push(x);return this},clearLayers(){children.length=0},eachLayer(fn){children.forEach(fn)},addTo(map){map.addLayer(this);return this}}}
    function child(feature){return{feature,_containsPoint:()=>true,setLatLngs(v){this.latlngs=v;return this},redraw(){this.redraws=(this.redraws||0)+1},on(){},getLatLng(){return this.latlng||{lat:-27,lng:153}},setLatLng(v){this.latlng=v}}}
    function geoJSON(data,opts={}){const g=group(),items=data?.type==='FeatureCollection'?data.features:[data];for(const f of items){let c=f?.geometry?.type==='Point'&&opts.pointToLayer?opts.pointToLayer(f,{lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0]}):child(f);c.feature=f;g.addLayer(c)}g.setStyle=v=>g.style=v;return g}
    function circleMarker(ll,opts={}){const c=child({geometry:{type:'Point'}});c.latlng=ll;c.options=opts;return c}
    function marker(ll,opts={}){const c=child({geometry:{type:'Point'}});c.latlng={lat:ll[0],lng:ll[1]};c.options=opts;return c}
    const tileLayer=(url,opts={})=>({url,options:opts,addTo(map){map.addLayer(this);return this},setOpacity(v){this.opacity=v},setZIndex(v){this.z=v}});tileLayer.wms=(url,opts)=>tileLayer(url,opts);
    window.__native=new FakeMap();
    window.L={map:()=>window.__native,canvas:o=>({options:o}),latLng:(lat,lng)=>({lat,lng}),layerGroup:group,geoJSON,circleMarker,marker,divIcon:o=>o,tileLayer,imageOverlay:(url,bounds,opts={})=>({url,bounds,options:opts,addTo(map){map.addLayer(this);return this},setOpacity(v){this.opacity=v},setZIndex(v){this.z=v}}),DomEvent:{stop:()=>{}}};
    </script></body></html>''')
    page.add_script_tag(path=str(ROOT/'docs/assets/editpolygon-map-adapter.js'))
    result=page.evaluate('''()=>{
      const runtime=EditPolygonMapAdapter.createLeafletRuntime({map:__native,L});
      let evt=null;runtime.on('click',e=>evt=e);__native.fire('click',{latlng:{lat:-27,lng:153},containerPoint:{x:306,y:54},originalEvent:{ctrlKey:true}});
      runtime.setView([151,-33],8);runtime.setPanEnabled(false);const panDisabled=!runtime.isPanEnabled();runtime.setPanEnabled(true);
      const editable=runtime.createEditableVectorLayer({features:[{id:'p1',geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]},style:{color:'#123456'},label:{text:'P1',coordinate:[153,-27]}}]});runtime.addDisplayLayer(editable);
      const ids=runtime.editableFeatureIdsAtPixel({x:20,y:20},{hitTolerance:8});
      const live=runtime.updateEditableFeatureGeometry(editable,'p1',{type:'Polygon',coordinates:[[[153,-27],[155,-27],[155,-28],[153,-27]]]});
      const wms=runtime.createWmsLayer({url:'https://example.test/wms',layers:'demo',opacity:.6,zIndex:25});runtime.addDisplayLayer(wms);
      const reference=runtime.createGeoJsonLayer({data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[153,-27]}}]},style:{color:'#d22f27'}});runtime.addDisplayLayer(reference);
      const raster=runtime.createStaticImageLayer({url:'data:image/png;base64,AA==',bounds:[[-28,152],[-26,154]],opacity:.7});runtime.addDisplayLayer(raster);runtime.setDisplayLayerOpacity(raster,.5);
      return {engine:runtime.engine,version:runtime.version,center:runtime.getCenter(),zoom:runtime.getZoom(),pixel:runtime.lonLatToPixel([153,-27]),event:{lonLat:evt.lonLat,pixel:[evt.pixel.x,evt.pixel.y],ctrl:evt.originalEvent.ctrlKey},panDisabled,editable:editable.__editpolygonEditable,featureCount:editable.__editpolygonFeatureCount,hitIds:ids,live,wmsLayers:wms.options.layers,refKind:reference.__editpolygonReferenceKind,rasterKind:raster.__editpolygonReferenceKind,rasterOpacity:raster.opacity,layerCount:__native.layers.size};
    }''')
    assert result['engine']=='leaflet',result
    assert result['version']=='1.55.4.5',result
    assert result['center']==[151,-33],result
    assert result['zoom']==8,result
    assert result['pixel']['x']==306 and result['pixel']['y']==54,result
    assert result['event']['lonLat']==[153,-27],result
    assert result['event']['pixel']==[306,54],result
    assert result['event']['ctrl'] is True,result
    assert result['panDisabled'] is True,result
    assert result['editable'] is True and result['featureCount']==1,result
    assert result['hitIds']==['p1'],result
    assert result['live'] is True,result
    assert result['wmsLayers']=='demo',result
    assert result['refKind']=='geojson' and result['rasterKind']=='image',result
    assert result['rasterOpacity']==0.5,result
    assert result['layerCount']==4,result
    assert not errors,errors
    browser.close()
print('Map adapter browser smoke test passed.')
