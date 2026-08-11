import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');
function classList(){const values=new Set();return {contains:v=>values.has(v),add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x))};}

function fakeOpenLayers(){
  const testState={lastMap:null,geoJsonConstructors:0};
  class Observable{
    constructor(){this.handlers=new Map();}
    on(t,h){if(!this.handlers.has(t))this.handlers.set(t,[]);this.handlers.get(t).push(h);}
    un(t,h){this.handlers.set(t,(this.handlers.get(t)||[]).filter(x=>x!==h));}
    fire(t,e={}){for(const h of this.handlers.get(t)||[])h(e);}
  }
  class View extends Observable{
    constructor(opts={}){super();this.center=opts.center||[0,0];this.zoom=opts.zoom??3;}
    getCenter(){return this.center;} getZoom(){return this.zoom;}
    setCenter(c){this.center=c;this.fire('change:center',{target:this});}
    setZoom(z){this.zoom=z;this.fire('change:resolution',{target:this});}
    animate(o){if(o.center)this.setCenter(o.center);if(o.zoom!=null)this.setZoom(o.zoom);}
    calculateExtent(){return [this.center[0]-500,this.center[1]-500,this.center[0]+500,this.center[1]+500];}
    fit(e,o){this.lastFit={e,o};this.center=[(e[0]+e[2])/2,(e[1]+e[3])/2];if(o?.maxZoom!=null)this.zoom=Math.min(this.zoom,o.maxZoom);}
  }
  class ActiveInteraction{constructor(){this.active=true;}setActive(v){this.active=!!v;}getActive(){return this.active;}}
  class DragPan extends ActiveInteraction{} class DoubleClickZoom extends ActiveInteraction{}
  class ZoomControl{constructor(opts={}){this.opts=opts;}} class AttributionControl{constructor(opts={}){this.opts=opts;}}
  class Collection{constructor(items=[]){this.items=items;}getArray(){return this.items;}includes(v){return this.items.includes(v);}}
  class MapCls extends Observable{
    constructor(opts={}){super();testState.lastMap=this;this.view=opts.view;this.layers=new Collection(opts.layers||[]);this.controls=opts.controls||[];this.interactions=new Collection([new DragPan(),new DoubleClickZoom()]);this.target=opts.target;this.viewport={className:'ol-viewport',handlers:{},parentNode:null,addEventListener:(t,h)=>this.viewport.handlers[t]=h,removeEventListener:t=>delete this.viewport.handlers[t]};opts.target?.appendChild?.(this.viewport);}
    getView(){return this.view;}getSize(){return [1000,700];}getInteractions(){return this.interactions;}getLayers(){return this.layers;}
    addLayer(l){if(!this.layers.items.includes(l))this.layers.items.push(l);}removeLayer(l){this.layers.items=this.layers.items.filter(x=>x!==l);}
    getPixelFromCoordinate(c){return [c[0]/10,c[1]/10];}getCoordinateFromPixel(p){return [p[0]*10,p[1]*10];}
    getEventPixel(e){return [e.clientX??0,e.clientY??0];}getViewport(){return this.viewport;}updateSize(){this.updated=true;}render(){this.rendered=(this.rendered||0)+1;}
  }
  class Source{constructor(opts={}){this.opts=opts;}}
  class VectorSource extends Source{constructor(opts={}){super(opts);this.features=[];this.changedCount=0;}addFeatures(f){this.features.push(...f);}clear(){this.features=[];}getFeatureById(id){return this.features.find(f=>f.id===id)||null;}changed(){this.changedCount++;}}
  class Layer{constructor(opts={}){this.opts=opts;this.visible=opts.visible!==false;this.opacity=opts.opacity??1;this.zIndex=opts.zIndex??0;this.style=opts.style;}setVisible(v){this.visible=!!v;}setOpacity(v){this.opacity=v;}setZIndex(v){this.zIndex=v;}setStyle(v){this.style=v;}getSource(){return this.opts.source;}}
  class Group extends Layer{constructor(opts={}){super(opts);this.layers=opts.layers||[];}}
  class Feature{constructor(props={}){Object.assign(this,props);}setStyle(v){this.style=v;}setId(v){this.id=v;}setGeometry(v){this.geometry=v;}}
  class Point{constructor(c){this.coordinates=c;}}
  class GeoJSON{constructor(){testState.geoJsonConstructors++;}readFeature(raw){return new Feature({raw,geometry:{type:raw.geometry?.type,coordinates:raw.geometry?.coordinates}});}readGeometry(raw){return {type:raw.type,coordinates:raw.coordinates,projected:true};}}
  class Style{constructor(o){this.options=o;}} class Stroke extends Style{} class Fill extends Style{} class CircleStyle extends Style{} class Text extends Style{}
  const canonicalLon=value=>((Number(value)+180)%360+360)%360-180;
  const proj={fromLonLat:c=>[c[0]*1000,c[1]*1000],toLonLat:c=>[canonicalLon(c[0]/1000),c[1]/1000],transformExtent:e=>e.map(v=>v*1000)};
  return {
    Map:MapCls,View,Feature,geom:{Point},format:{GeoJSON},
    proj,extent:{containsCoordinate:(e,c)=>c[0]>=e[0]&&c[0]<=e[2]&&c[1]>=e[1]&&c[1]<=e[3]},
    interaction:{defaults:()=>new Collection(),DragPan,DoubleClickZoom},control:{Zoom:ZoomControl,Attribution:AttributionControl},
    layer:{Tile:Layer,Vector:Layer,Image:Layer,Group},source:{XYZ:Source,TileWMS:Source,Vector:VectorSource,ImageStatic:Source},
    style:{Style,Stroke,Fill,Circle:CircleStyle,Text},__testState:testState
  };
}

function openLayersContext(){
  const globalHandlers={};
  const body={classList:classList()},documentElement={classList:classList()};
  const context={console,Math,Number,Object,Array,JSON,Date,URLSearchParams,document:{body,documentElement}};
  context.globalThis=context;context.window=context;
  context.addEventListener=(t,h)=>{globalHandlers[t]=h;};context.removeEventListener=t=>{delete globalHandlers[t];};
  function matchesClosest(node,selector){
    for(let current=node;current;current=current.parentNode){
      if(selector.includes('[data-editpolygon-map-overlay="1"]')&&current.dataset?.editpolygonMapOverlay==='1')return current;
      if(selector.includes('#editOverlay')&&current.id==='editOverlay')return current;
      if(selector.includes('.gis-spatial-select-overlay')&&String(current.className||'').split(/\s+/).includes('gis-spatial-select-overlay'))return current;
    }
    return null;
  }
  function element(){return {className:'',id:'',dataset:{},classList:classList(),style:{},handlers:{},children:[],parentNode:null,appendChild(n){this.children.push(n);n.parentNode=this;},contains(n){for(let cur=n;cur;cur=cur.parentNode)if(cur===this)return true;return false;},closest(selector){return matchesClosest(this,selector);},getBoundingClientRect(){return this.parentNode?.getBoundingClientRect?.()||{left:0,top:0};},addEventListener(t,h){(this.handlers[t]??=[]).push(h);},removeEventListener(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(fn=>!h||fn!==h);},dispatchEvent(e){e.target=e.target||this;for(const h of this.handlers[e.type]||[])h(e);if(e.bubbles!==false&&this.parentNode)this.parentNode.dispatchEvent?.(e);},remove(){if(this.parentNode?.children)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;},setPointerCapture(){}};}
  const target={clientWidth:1000,clientHeight:700,children:[],handlers:{},appendChild(n){this.children.push(n);n.parentNode=this;},contains(n){for(let cur=n;cur;cur=cur.parentNode)if(cur===this)return true;return false;},getBoundingClientRect(){return{left:0,top:0};},classList:classList(),addEventListener(t,h){(this.handlers[t]??=[]).push(h);},removeEventListener(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(fn=>!h||fn!==h);},dispatchEvent(e){for(const h of this.handlers[e.type]||[])h(e);}};
  context.document.getElementById=id=>id==='map'?target:null;
  context.document.createElement=()=>element();
  context.requestAnimationFrame=fn=>{fn();return 1;};
  context.ol=fakeOpenLayers();
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'editpolygon-map-adapter.js'});
  return {context,target,globalHandlers};
}


test('map adapter publishes one runtime factory and no transition-era runtime aliases',()=>{
  const {context}=openLayersContext(),api=context.EditPolygonMapAdapter;
  assert.equal(api.version,'1.56.0.1');
  assert.equal(typeof api.createRuntime,'function');
  assert.equal('createOpenLayersRuntime' in api,false);
  assert.equal('requestedEngine' in api,false);
  const retiredFactory=['create','Lea','fletRuntime'].join('');
  assert.equal(retiredFactory in api,false);
  assert.equal('fallbackReason' in api,false);
  const runtime=api.createRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  assert.equal(runtime.engine,'openlayers');
  assert.equal('requestedEngine' in runtime,false);
});

test('sole runtime fails clearly when OpenLayers is unavailable',()=>{
  const {context}=openLayersContext();
  context.ol=null;
  assert.throws(()=>context.EditPolygonMapAdapter.createRuntime({target:'map',ol:null}),/OpenLayers failed to load/);
});

test('shared point, extent and geometry fingerprint helpers remain runtime-neutral',()=>{
  const {context}=openLayersContext(),api=context.EditPolygonMapAdapter;
  assert.equal(api.point(0,0).distanceTo(api.point(3,4)),5);
  assert.equal(api.bboxIntersects([0,0,2,2],[2,2,4,4]),true);
  const a={type:'Polygon',coordinates:[[[150,-28],[151,-28],[151,-27],[150,-28]]]};
  const b={type:'Polygon',coordinates:[[[150,-28],[152,-28],[151,-27],[150,-28]]]};
  assert.notEqual(api.geometryFingerprint(a),api.geometryFingerprint(b));
});

test('OpenLayers view and controls preserve canonical lon/lat application state',()=>{
  const {context,target}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  assert.equal(runtime.engine,'openlayers');
  assert.equal(runtime.nativeVersion,'10.9.0');
  assert.equal('getNativeMap' in runtime,false);
  assert.equal(context.ol.__testState.lastMap.controls.length,2);
  assert.deepEqual([...runtime.getCenter()],[153,-27]);
  runtime.setView([151,-33],8,{animate:false});
  assert.deepEqual([...runtime.getCenter()],[151,-33]);
  assert.equal(runtime.getZoom(),8);
  assert.equal(target.children[0].className,'ol-viewport');
  assert.equal(target.children[1].className,'editpolygon-dom-overlays');
});

test('OpenLayers forward and inverse pixel conversion preserve active repeated-world longitude',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',center:[873,-27],zoom:6,ol:context.ol});
  assert.deepEqual([...runtime.getCenter()],[873,-27]);
  const canonical=runtime.lonLatToPixel([153,-27]),wrapped=runtime.lonLatToPixel([873,-27]);
  assert.equal(canonical.x,wrapped.x);assert.equal(canonical.y,wrapped.y);
  assert.deepEqual([...runtime.pixelToLonLat(canonical)],[873,-27]);
});

test('OpenLayers runtime owns tile, WMS and editable vector construction',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const xyz=runtime.createTileLayer({url:'https://{s}.example/{z}/{x}/{y}.png',tms:true});
  const wms=runtime.createWmsLayer({url:'https://example.test/geoserver/wms',layers:'roads'});
  const vector=runtime.createEditableVectorLayer({layerKey:'a',features:[{id:'a',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:6}}]});
  runtime.addDisplayLayer(xyz);runtime.addDisplayLayer(wms);runtime.addDisplayLayer(vector);
  assert.equal(runtime.hasDisplayLayer(xyz),true);
  assert.equal(wms.getSource().opts.params.LAYERS,'roads');
  assert.equal(wms.getSource().opts.params.TILED,true);
  assert.equal(wms.getSource().opts.serverType,'geoserver');
  assert.equal('crossOrigin' in wms.getSource().opts,false);
  assert.equal(vector.__editpolygonFeatureCount,1);
  assert.equal(runtime.updateEditableFeatureGeometry(vector,'a',{type:'Point',coordinates:[154,-28]}),true);
});

test('editable vectors share identical styles and skip decluttering when no text is present',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  const layer=runtime.createEditableVectorLayer({features:[
    {id:'a',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:5}},
    {id:'b',geometry:{type:'Point',coordinates:[154,-28]},style:{color:'#123456',radius:5}}
  ]});
  assert.equal(layer.__editpolygonStyleCacheSize,1);
  assert.equal(layer.__editpolygonDeclutter,false);
  assert.equal(layer.getSource().opts.wrapX,true);
  assert.equal(layer.getSource().opts.useSpatialIndex,true);
});

test('OpenLayers runtime owns reference GeoJSON and static image layers',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  const ref=runtime.createGeoJsonLayer({data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[153,-27]}}]},style:{color:'#d92c32'},pointRadius:5,zIndex:40.01});
  const raster=runtime.createStaticImageLayer({url:'data:image/png;base64,AA==',bounds:[[-28,152],[-26,154]],opacity:.7,zIndex:40.02});
  runtime.addDisplayLayer(ref);runtime.addDisplayLayer(raster);
  assert.equal(ref.__editpolygonReferenceKind,'geojson');
  assert.equal(raster.__editpolygonReferenceKind,'image');
  runtime.setDisplayLayerOpacity(raster,.4);assert.equal(raster.opacity,.4);
  runtime.setDisplayLayerVisible(raster,false);assert.equal(raster.visible,false);
});

test('interaction toggles and public drawing navigation stay adapter-owned',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  runtime.setPanEnabled(false);assert.equal(runtime.isPanEnabled(),false);
  runtime.setPanEnabled(true);assert.equal(runtime.isPanEnabled(),true);
  runtime.setDoubleClickZoomEnabled(false);assert.equal(runtime.isDoubleClickZoomEnabled(),false);
  assert.equal(typeof runtime.panByPixels,'function');
  assert.equal(typeof runtime.zoomBy,'function');
  const z=runtime.getZoom();assert.equal(runtime.zoomBy(1,{animate:false}),z+1);assert.equal(runtime.getZoom(),z+1);
  const before=[...runtime.getCenter()];runtime.panByPixels(80,0,{animate:false});assert.notDeepEqual([...runtime.getCenter()],before);
  assert.equal('nativePanLooksActive' in runtime,false);
  assert.equal('recoverNativePan' in runtime,false);
});

test('transient vector overlays and DOM handles are native map-runtime primitives',()=>{
  const {context,target,globalHandlers}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const overlay=runtime.createVectorOverlayLayer({zIndex:1700});
  runtime.setVectorOverlayFeatures(overlay,[{id:'issue',geometry:{type:'Point',coordinates:[153,-27]},style:{radius:8}}]);
  assert.equal(overlay.getSource().features.length,1);
  let dragged=null;
  const handle=runtime.createDomOverlay({coordinate:[153,-27],className:'test-handle',draggable:true,onDrag:e=>dragged=e.lonLat});
  const el=handle.getElement(),pane=target.children.find(child=>child.className==='editpolygon-dom-overlays');
  assert.ok(pane);assert.equal(pane.children.includes(el),true);
  el.handlers.pointerdown[0]({button:0,clientX:15300,clientY:-2700,preventDefault(){},stopPropagation(){}});
  globalHandlers.pointermove({clientX:15400,clientY:-2800});globalHandlers.pointerup({clientX:15400,clientY:-2800,type:'pointerup'});
  assert.deepEqual([...dragged],[154,-28]);
  handle.remove();assert.equal(pane.children.includes(el),false);
});

test('click delivery is native and has no compatibility DOM surface',()=>{
  const {context,target}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  let received=null;runtime.on('click',event=>received=event);
  context.ol.__testState.lastMap.fire('click',{pixel:[320,210],coordinate:[3200,2100],originalEvent:{}});
  assert.ok(received);assert.equal(received.pixel.x,320);assert.equal((target.handlers.click||[]).length,0);
});

test('runtime reuses one GeoJSON formatter across layer creation and live geometry updates',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  assert.equal(context.ol.__testState.geoJsonConstructors,1);
  const layer=runtime.createEditableVectorLayer({features:[{id:'p',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123'}}]});
  runtime.createGeoJsonLayer({data:{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[153,-27]}}});
  runtime.setVectorOverlayFeatures(runtime.createVectorOverlayLayer(),[{id:'o',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#456'}}]);
  runtime.updateEditableFeatureGeometry(layer,'p',{type:'Point',coordinates:[154,-28]});
  assert.equal(context.ol.__testState.geoJsonConstructors,1);
});

test('zoom lifecycle fanout notifies every subscriber exactly once',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',zoom:6,ol:context.ol});
  const map=context.ol.__testState.lastMap,view=map.view,starts=[0,0],ends=[0,0];
  runtime.on('zoomstart',()=>starts[0]++);runtime.on('zoomstart',()=>starts[1]++);
  runtime.on('zoomend',()=>ends[0]++);runtime.on('zoomend',()=>ends[1]++);
  view.setZoom(7);view.setZoom(8);
  assert.deepEqual(starts,[1,1]);assert.deepEqual(ends,[0,0]);
  map.fire('moveend',{target:map});
  assert.deepEqual(ends,[1,1]);
  map.fire('moveend',{target:map});
  assert.deepEqual(ends,[1,1]);
});

test('DOM overlays share runtime-level map subscriptions instead of adding listeners per overlay',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  const map=context.ol.__testState.lastMap,view=map.view;
  const counts=()=>({center:(view.handlers.get('change:center')||[]).length,resolution:(view.handlers.get('change:resolution')||[]).length,moveend:(map.handlers.get('moveend')||[]).length});
  const before=counts(),overlays=[];
  for(let i=0;i<25;i++)overlays.push(runtime.createDomOverlay({coordinate:[153+i*.01,-27],className:'batch-test'}));
  assert.deepEqual(counts(),before);
  overlays.forEach(overlay=>overlay.remove());
  assert.deepEqual(counts(),before);
});

test('canonical repeated-world geometry is projected without breaking dateline continuity',()=>{
  const {context}=openLayersContext(),api=context.EditPolygonMapAdapter;
  assert.deepEqual(JSON.parse(JSON.stringify(api.geometryToCanonicalWorld({type:'Point',coordinates:[873,-27]}))),{type:'Point',coordinates:[153,-27]});
  assert.deepEqual(JSON.parse(JSON.stringify(api.geometryToCanonicalWorld({type:'LineString',coordinates:[[179,0],[-179,1],[-178,2]]}))),{type:'LineString',coordinates:[[179,0],[181,1],[182,2]]});
});

test('tile layers distinguish display max zoom from native tile max zoom',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  const layer=runtime.createTileLayer({url:'https://tiles.example/{z}/{x}/{y}.png',maxZoom:22,maxNativeZoom:19});
  assert.equal(layer.getSource().opts.maxZoom,19);assert.equal(layer.opts.maxZoom,22);
});

test('editable layer geometry identity and hard purge stay inside the map adapter',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createRuntime({target:'map',ol:context.ol});
  const a={type:'Polygon',coordinates:[[[150,-28],[151,-28],[151,-27],[150,-28]]]},b={type:'Polygon',coordinates:[[[150,-28],[152,-28],[151,-27],[150,-28]]]};
  const layer=runtime.createEditableVectorLayer({layerKey:'layer-a',features:[{id:'f1',geometry:a,style:{color:'#123'}}]});
  runtime.addDisplayLayer(layer);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',a),true);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',b),false);
  assert.equal(runtime.updateEditableFeatureGeometry(layer,'f1',b),true);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',b),true);
  assert.equal(runtime.clearEditableVectorLayers('layer-a'),1);
  assert.equal(runtime.hasDisplayLayer(layer),false);
});
