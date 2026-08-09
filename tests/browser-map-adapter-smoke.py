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
    page.set_content('''<!doctype html><html><body><div id="map"></div><script>
    function classes(){const s=new Set();return {contains:v=>s.has(v),add:(...v)=>v.forEach(x=>s.add(x)),remove:(...v)=>v.forEach(x=>s.delete(x))};}
    class FakeMap{
      constructor(){this.zoom=5;this.center={lat:-27,lng:153};this.handlers={};this.container={classList:classes()};this.dragEnabled=true;this.doubleEnabled=true;this.dragging={_draggable:{_moving:false,_moved:false,_lastTarget:null,_onUp:()=>{}},enable:()=>this.dragEnabled=true,disable:()=>this.dragEnabled=false,enabled:()=>this.dragEnabled};this.doubleClickZoom={enable:()=>this.doubleEnabled=true,disable:()=>this.doubleEnabled=false,enabled:()=>this.doubleEnabled};}
      getContainer(){return this.container} getSize(){return{x:1000,y:700}} getZoom(){return this.zoom} getCenter(){return this.center}
      setView(ll,z){this.center={lat:ll[0],lng:ll[1]};this.zoom=z} fitBounds(b,o){this.fit={b,o}}
      getBounds(){return{getWest:()=>150,getSouth:()=>-30,getEast:()=>156,getNorth:()=>-24,pad:()=>this.getBounds()}}
      latLngToContainerPoint(ll){return{x:ll[1]*2,y:ll[0]*-2}} containerPointToLatLng(p){return{lng:(p[0]??p.x)/2,lat:(p[1]??p.y)/-2}}
      latLngToLayerPoint(ll){return{x:ll[1]*3,y:ll[0]*-3}} layerPointToLatLng(p){return{lng:(p[0]??p.x)/3,lat:(p[1]??p.y)/-3}}
      project(ll,z){return{x:ll.lng*z,y:ll.lat*z}} distance(){return 123} invalidateSize(){this.resized=true} panInside(ll){this.panned=ll}
      on(t,h){(this.handlers[t]??=[]).push(h)} off(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(x=>x!==h)} fire(t,e){(this.handlers[t]||[]).forEach(h=>h(e))}
    }
    window.__native=new FakeMap();
    window.L={map:()=>window.__native,canvas:()=>({}),latLng:(lat,lng)=>({lat,lng}),DomEvent:{stop:()=>{}}};
    </script></body></html>''')
    page.add_script_tag(path=str(ROOT/'docs/assets/editpolygon-map-adapter.js'))
    result=page.evaluate('''()=>{
      const runtime=EditPolygonMapAdapter.createLeafletRuntime({map:__native,L});
      let evt=null;runtime.on('click',e=>evt=e);__native.fire('click',{latlng:{lat:-27,lng:153},containerPoint:{x:306,y:54},originalEvent:{ctrlKey:true}});
      runtime.setView([151,-33],8);runtime.setPanEnabled(false);const panDisabled=!runtime.isPanEnabled();runtime.setPanEnabled(true);
      return {engine:runtime.engine,center:runtime.getCenter(),zoom:runtime.getZoom(),pixel:runtime.lonLatToPixel([153,-27]),event:{lonLat:evt.lonLat,pixel:[evt.pixel.x,evt.pixel.y],ctrl:evt.originalEvent.ctrlKey},panDisabled};
    }''')
    assert result['engine']=='leaflet',result
    assert result['center']==[151,-33],result
    assert result['zoom']==8,result
    assert result['pixel']['x']==306 and result['pixel']['y']==54,result
    assert result['event']['lonLat']==[153,-27],result
    assert result['event']['pixel']==[306,54],result
    assert result['event']['ctrl'] is True,result
    assert result['panDisabled'] is True,result
    assert not errors,errors
    browser.close()
print('Map adapter browser smoke test passed.')
