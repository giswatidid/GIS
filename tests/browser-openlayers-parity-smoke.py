from pathlib import Path
import os, shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None

FAKE_OL=r'''
class Obs{constructor(){this.h={}}on(t,f){(this.h[t]??=[]).push(f)}un(t,f){this.h[t]=(this.h[t]||[]).filter(x=>x!==f)}fire(t,e={}){(this.h[t]||[]).forEach(f=>f(e))}}
class V extends Obs{constructor(o){super();this.c=o.center;this.z=o.zoom}getCenter(){return this.c}getZoom(){return this.z}setCenter(c){this.c=c;this.fire('change:center',{})}setZoom(z){this.z=z;this.fire('change:resolution',{})}animate(o){if(o.center)this.setCenter(o.center);if(o.zoom!=null)this.setZoom(o.zoom)}calculateExtent(){return[this.c[0]-500,this.c[1]-500,this.c[0]+500,this.c[1]+500]}fit(e,o){this.c=[(e[0]+e[2])/2,(e[1]+e[3])/2]}}
class C{constructor(a=[]){this.a=a}getArray(){return this.a}}
class I{constructor(){this.a=true}setActive(v){this.a=!!v}getActive(){return this.a}} class DragPan extends I{} class DoubleClickZoom extends I{}
class ZoomControl{constructor(o={}){this.o=o;this.kind='zoom'}} class AttributionControl{constructor(o={}){this.o=o;this.kind='attribution'}}
class M extends Obs{constructor(o){super();this.v=o.view;this.l=new C(o.layers||[]);this.controls=o.controls||[];this.i=new C([new DragPan(),new DoubleClickZoom()]);this.viewport=document.createElement('div');this.viewport.className='ol-viewport';o.target.appendChild(this.viewport)}getSize(){return[800,500]}getInteractions(){return this.i}getLayers(){return this.l}addLayer(x){if(!this.l.a.includes(x))this.l.a.push(x)}removeLayer(x){this.l.a=this.l.a.filter(v=>v!==x)}getPixelFromCoordinate(c){return[c[0]/10,c[1]/10]}getCoordinateFromPixel(p){return[p[0]*10,p[1]*10]}getEventPixel(e){return[e.clientX||0,e.clientY||0]}getViewport(){return this.viewport}updateSize(){this.updated=true}render(){this.rendered=(this.rendered||0)+1}forEachFeatureAtPixel(pixel,cb,opts={}){for(const layer of this.l.a){if(opts.layerFilter&&!opts.layerFilter(layer))continue;for(const feature of layer.getSource?.()?.f||[]){const out=cb(feature,layer);if(out)return out;}}}}
class S{constructor(o={}){this.o=o}} class TWMS extends S{} class VS extends S{constructor(o={}){super(o);this.f=[];this.changedCount=0}addFeatures(x){this.f.push(...x)}clear(){this.f=[]}getFeatureById(id){return this.f.find(x=>x.id===id)||null}changed(){this.changedCount++}}
class Lyr{constructor(o={}){this.o=o;this.v=o.visible!==false;this.opacity=o.opacity??1;this.z=o.zIndex??0;this.style=o.style}setVisible(v){this.v=!!v}setOpacity(v){this.opacity=v}setZIndex(v){this.z=v}setStyle(v){this.style=v}getSource(){return this.o.source}}
class Group extends Lyr{}
class F{constructor(o={}){Object.assign(this,o);this.values_={...o}}setStyle(s){this.style=s}setId(v){this.id=v}getId(){return this.id}get(k){return this[k]??this.values_[k]}setGeometry(v){this.geometry=v;this.values_.geometry=v}} class Pt{constructor(c){this.c=c}} class GJ{readFeature(raw){return new F({raw,geometry:{type:raw.geometry?.type,coordinates:raw.geometry?.coordinates}})}readGeometry(raw){return{type:raw.type,coordinates:raw.coordinates,projected:true}}}
class Sty{constructor(o){this.o=o}}
const canonicalLon=v=>((Number(v)+180)%360+360)%360-180;
window.ol={Map:M,View:V,Feature:F,geom:{Point:Pt},format:{GeoJSON:GJ},proj:{fromLonLat:c=>[c[0]*1000,c[1]*1000],toLonLat:c=>[canonicalLon(c[0]/1000),c[1]/1000],transformExtent:e=>e.map(x=>x*1000)},extent:{containsCoordinate:()=>false},interaction:{DragPan,DoubleClickZoom},control:{Zoom:ZoomControl,Attribution:AttributionControl},layer:{Tile:Lyr,Vector:Lyr,Image:Lyr,Group},source:{XYZ:S,TileWMS:TWMS,Vector:VS,ImageStatic:S},style:{Style:Sty,Stroke:Sty,Fill:Sty,Circle:Sty,Text:Sty}};
let leafletMapCalls=0;
window.L={map:()=>{leafletMapCalls++;throw new Error('OpenLayers runtime must not create a Leaflet map');}};
'''

with sync_playwright() as p:
    opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    exe=chromium_path()
    if exe: opts['executable_path']=exe
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':800,'height':500})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<!doctype html><html><body><div id="map" style="width:800px;height:500px"></div><script>'+FAKE_OL+'</script></body></html>')
    page.add_script_tag(path=str(ROOT/'docs/assets/editpolygon-map-adapter.js'))
    result=page.evaluate('''async()=>{
      const r=EditPolygonMapAdapter.createRuntime({engine:'openlayers',target:'map',center:[153,-27],zoom:6,ol});
      const base=r.createTileLayer({url:'https://{s}.example/{z}/{x}/{y}.png'});r.addDisplayLayer(base);
      const vec=r.createEditableVectorLayer({layerKey:'editable-main',features:[{id:'p1',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:5},label:{text:'P1',coordinate:[153,-27]}}]});r.addDisplayLayer(vec);
      const p=r.lonLatToPixel([153,-27]);r.setPanEnabled(false);const disabled=!r.isPanEnabled();r.setPanEnabled(true);
      const hitIds=r.editableFeatureIdsAtPixel([15300,-2700],{hitTolerance:8});
      const initialGeometry={type:'Point',coordinates:[153,-27]},movedGeometry={type:'Point',coordinates:[154,-28]};
      const matchesInitial=r.editableLayerMatchesGeometry(vec,'p1',initialGeometry);
      const liveUpdated=r.updateEditableFeatureGeometry(vec,'p1',movedGeometry);
      const matchesMoved=r.editableLayerMatchesGeometry(vec,'p1',movedGeometry),matchesOldAfterMove=r.editableLayerMatchesGeometry(vec,'p1',initialGeometry);
      const liveGeometry=vec.__editpolygonGeometryFeatures.get('p1').geometry;
      const purgeProbe=r.createEditableVectorLayer({layerKey:'purge-probe',features:[{id:'probe',geometry:initialGeometry,style:{color:'#333'}}]});r.addDisplayLayer(purgeProbe);const purgeCount=r.clearEditableVectorLayers('purge-probe'),purgeGone=!r.hasDisplayLayer(purgeProbe);
      const transient=r.createVectorOverlayLayer({zIndex:1700});r.setVectorOverlayFeatures(transient,[{id:'t1',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#b42318',radius:7}}]);
      const wms=r.createWmsLayer({url:'https://example.test/geoserver/wms',layers:'demo',opacity:.6,zIndex:25});r.addDisplayLayer(wms);
      const ref=r.createGeoJsonLayer({data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[153,-27]}}]},style:{color:'#d92c32'},zIndex:40.01});r.addDisplayLayer(ref);
      const raster=r.createStaticImageLayer({url:'data:image/png;base64,AA==',bounds:[[-28,152],[-26,154]],opacity:.7,zIndex:40.02});r.addDisplayLayer(raster);r.setDisplayLayerOpacity(raster,.5);
      const handle=r.createDomOverlay({coordinate:[153,-27],className:'native-handle',anchor:[4,4]});
      const handleEngine=!!handle.getElement()?.dataset?.editpolygonMapOverlay;const handleParent=handle.getElement()?.parentElement?.className||'';const childOrder=[...document.getElementById('map').children].map(el=>el.className||'');handle.remove();
      let nativeClick=null;r.on('click',event=>{nativeClick={pixel:[event.pixel.x,event.pixel.y],lonLat:event.lonLat};});
      r.getNativeMap().fire('click',{pixel:[320,210],coordinate:[3200,2100],originalEvent:{shiftKey:false}});
      r.setView([873,-27],6,{animate:false});
      const wrappedPixel=r.lonLatToPixel([153,-27]);
      const wrappedInverse=r.pixelToLonLat(wrappedPixel);
      return {engine:r.engine,center:r.getCenter(),zoom:r.getZoom(),pixel:[p.x,p.y],wrappedPixel:[wrappedPixel.x,wrappedPixel.y],wrappedInverse,layers:r.getNativeMap().getLayers().getArray().length,featureCount:vec.__editpolygonFeatureCount,hitIds,wmsParams:wms.getSource().o.params,wmsServerType:wms.getSource().o.serverType||null,wmsHasCrossOrigin:Object.prototype.hasOwnProperty.call(wms.getSource().o,'crossOrigin'),styleCacheSize:vec.__editpolygonStyleCacheSize,disabled,leafletMapCalls,hasLegacyMap:('getLegacyMap' in r),hasParityBridge:('parityBridge' in r),matchesInitial,matchesMoved,matchesOldAfterMove,purgeCount,purgeGone,liveUpdated,liveCoordinates:liveGeometry.coordinates,transientCount:transient.getSource().f.length,handleEngine,handleParent,childOrder,nativeClick,refCount:ref.__editpolygonFeatureCount,rasterKind:raster.__editpolygonReferenceKind,rasterOpacity:raster.opacity,controlKinds:r.getNativeMap().controls.map(c=>c.kind)};
    }''')
    assert result['engine']=='openlayers',result
    assert result['center']==[873,-27],result
    assert result['zoom']==6,result
    assert result['wrappedPixel']==[87300,-2700],result
    assert result['wrappedInverse']==[873,-27],result
    assert result['layers']==6,result
    assert result['controlKinds']==['zoom','attribution'],result
    assert result['featureCount']==1,result
    assert result['hitIds']==['p1'],result
    assert result['wmsParams']['LAYERS']=='demo',result
    assert result['wmsParams']['TILED'] is True,result
    assert result['wmsServerType']=='geoserver',result
    assert result['wmsHasCrossOrigin'] is False,result
    assert result['styleCacheSize']==1,result
    assert result['disabled'] is True,result
    assert result['leafletMapCalls']==0,result
    assert result['hasLegacyMap'] is False,result
    assert result['hasParityBridge'] is False,result
    assert result['matchesInitial'] is True,result
    assert result['matchesMoved'] is True,result
    assert result['matchesOldAfterMove'] is False,result
    assert result['purgeCount']==1 and result['purgeGone'] is True,result
    assert result['liveUpdated'] is True,result
    assert result['liveCoordinates']==[154,-28],result
    assert result['transientCount']==1,result
    assert result['handleEngine'] is True,result
    assert result['handleParent']=='editpolygon-openlayers-dom-overlays',result
    assert result['refCount']==1,result
    assert result['rasterKind']=='image',result
    assert result['rasterOpacity']==0.5,result
    assert result['childOrder'][-1]=='editpolygon-openlayers-dom-overlays',result
    assert result['nativeClick'] is not None,result
    assert result['nativeClick']['pixel']==[320,210],result
    assert abs(result['nativeClick']['lonLat'][0]-3.2)<1e-9 and abs(result['nativeClick']['lonLat'][1]-2.1)<1e-9,result
    assert 'editpolygon-leaflet-compat' not in result['childOrder'],result
    assert not errors,errors
    browser.close()
print('OpenLayers parity browser smoke test passed.')
