import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/assets/editpolygon-map-adapter.js',import.meta.url),'utf8');

function classList(){
  const values=new Set();
  return {contains:v=>values.has(v),add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x))};
}

class FakeMap{
  constructor(){
    this.zoom=7;
    this.center={lng:153,lat:-27};
    this.handlers=new Map();
    this.container={classList:classList()};
    this._drag={_moving:false,_moved:false,_lastTarget:null,_onUp:()=>{this._upCalled=true;}};
    this.dragEnabled=true;
    this.doubleEnabled=true;
    this.dragging={
      _draggable:this._drag,
      enable:()=>{this.dragEnabled=true;},
      disable:()=>{this.dragEnabled=false;},
      enabled:()=>this.dragEnabled
    };
    this.doubleClickZoom={
      enable:()=>{this.doubleEnabled=true;},
      disable:()=>{this.doubleEnabled=false;},
      enabled:()=>this.doubleEnabled
    };
  }
  getContainer(){return this.container;}
  getSize(){return {x:1000,y:700};}
  getZoom(){return this.zoom;}
  getCenter(){return this.center;}
  setView(ll,z,opts){this.center={lat:Number(ll[0]),lng:Number(ll[1])};this.zoom=z;this.lastSetView={ll,z,opts};}
  fitBounds(bounds,opts){this.lastFit={bounds,opts};}
  getBounds(){
    let west=150,south=-30,east=156,north=-24;
    return {
      pad:r=>{west-=r;south-=r;east+=r;north+=r;return this.getBoundsPadded?.(west,south,east,north)||{getWest:()=>west,getSouth:()=>south,getEast:()=>east,getNorth:()=>north};},
      getWest:()=>west,getSouth:()=>south,getEast:()=>east,getNorth:()=>north
    };
  }
  latLngToContainerPoint(ll){return {x:Number(ll[1])*10,y:Number(ll[0])*-10};}
  containerPointToLatLng(p){return {lng:Number(p[0]??p.x)/10,lat:Number(p[1]??p.y)/-10};}
  latLngToLayerPoint(ll){return {x:Number(ll[1])*20,y:Number(ll[0])*-20};}
  layerPointToLatLng(p){return {lng:Number(p[0]??p.x)/20,lat:Number(p[1]??p.y)/-20};}
  project(ll,z){return {x:ll.lng*(z+1),y:ll.lat*(z+1)};}
  distance(a,b){
    const aa=Array.isArray(a)?a:[a.lat,a.lng],bb=Array.isArray(b)?b:[b.lat,b.lng];
    return Math.hypot(aa[0]-bb[0],aa[1]-bb[1])*1000;
  }
  invalidateSize(opts){this.resizeOptions=opts;}
  panInside(ll,opts){this.lastPanInside={ll,opts};}
  on(type,handler){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(handler);}
  off(type,handler){this.handlers.set(type,(this.handlers.get(type)||[]).filter(h=>h!==handler));}
  fire(type,event={}){for(const handler of this.handlers.get(type)||[])handler(event);}
}

function load(){
  const body={classList:classList()};
  const documentElement={classList:classList()};
  const context={console,Math,Number,Object,Array,JSON,Date,URLSearchParams,document:{body,documentElement}};
  context.globalThis=context;context.window=context;
  context.L={
    map:()=>new FakeMap(),
    canvas:()=>({renderer:true}),
    latLng:(lat,lng)=>({lat,lng}),
    DomEvent:{stop:()=>{}}
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'editpolygon-map-adapter.js'});
  return context;
}

test('map adapter exposes an engine-neutral Leaflet runtime with canonical lon/lat view state',()=>{
  const context=load(),native=new FakeMap();
  const runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  assert.equal(runtime.engine,'leaflet');
  assert.equal(runtime.version,'1.55.1.1');
  assert.deepEqual([...runtime.getCenter()],[153,-27]);
  runtime.setView([151,-33],9,{animate:false});
  assert.equal(JSON.stringify(native.lastSetView.ll),JSON.stringify([-33,151]));
  assert.deepEqual([...runtime.getCenter()],[151,-33]);
  assert.equal(runtime.getZoom(),9);
});

test('pixel and projection conversions stay behind the map contract',()=>{
  const context=load(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:new FakeMap()});
  const p=runtime.lonLatToPixel([153,-27]);
  assert.equal(p.x,1530);assert.equal(p.y,270);
  assert.deepEqual([...runtime.pixelToLonLat(p)],[153,-27]);
  const lp=runtime.lonLatToLayerPixel([153,-27]);
  assert.equal(lp.x,3060);assert.equal(lp.y,540);
  assert.deepEqual([...runtime.layerPixelToLonLat(lp)],[153,-27]);
  const projected=runtime.projectLonLat([10,5],2);
  assert.equal(projected.x,30);assert.equal(projected.y,15);
});

test('fit, pan, interaction toggles and resize do not leak Leaflet calls to consumers',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  runtime.fitExtent([150,-30,156,-24],{padding:[20,20]});
  assert.equal(JSON.stringify(native.lastFit.bounds),JSON.stringify([[-30,150],[-24,156]]));
  runtime.panInside([153,-27],{padding:[70,70]});
  assert.equal(JSON.stringify(native.lastPanInside.ll),JSON.stringify([-27,153]));
  runtime.setPanEnabled(false);assert.equal(runtime.isPanEnabled(),false);
  runtime.setPanEnabled(true);assert.equal(runtime.isPanEnabled(),true);
  runtime.setDoubleClickZoomEnabled(false);assert.equal(runtime.isDoubleClickZoomEnabled(),false);
  runtime.resize({pan:false});assert.deepEqual(native.resizeOptions,{pan:false});
});

test('normalised map events provide lonLat, latLng and pixel independent of the native event shape',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  let received=null;
  runtime.on('click',event=>{received=event;});
  native.fire('click',{latlng:{lat:-27,lng:153},containerPoint:{x:40,y:50},originalEvent:{shiftKey:true}});
  assert.deepEqual([...received.lonLat],[153,-27]);
  assert.equal(JSON.stringify(received.latLng),JSON.stringify({lat:-27,lng:153}));
  assert.equal(received.pixel.x,40);assert.equal(received.pixel.y,50);
  assert.equal(received.originalEvent.shiftKey,true);
});

test('Leaflet private drag recovery is contained inside the adapter',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  native._drag._moving=true;
  assert.equal(runtime.nativePanLooksActive(),true);
  runtime.recoverNativePan({});
  assert.equal(native._upCalled,true);
  assert.equal(native._drag._moving,false);
});

test('shared point and extent helpers are map-engine neutral',()=>{
  const context=load(),api=context.EditPolygonMapAdapter;
  assert.equal(api.point(0,0).distanceTo(api.point(3,4)),5);
  assert.equal(api.bboxIntersects([0,0,2,2],[2,2,4,4]),true);
  assert.equal(api.bboxIntersects([0,0,1,1],[2,2,3,3]),false);
});


function fakeOpenLayers(){
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
  class Collection{constructor(items=[]){this.items=items;}getArray(){return this.items;}includes(v){return this.items.includes(v);}}
  class MapCls extends Observable{
    constructor(opts={}){super();this.view=opts.view;this.layers=new Collection(opts.layers||[]);this.interactions=new Collection([new DragPan(),new DoubleClickZoom()]);this.target=opts.target;this.viewport={handlers:{},addEventListener:(t,h)=>this.viewport.handlers[t]=h,removeEventListener:t=>delete this.viewport.handlers[t]};}
    getView(){return this.view;}getSize(){return [1000,700];}getInteractions(){return this.interactions;}getLayers(){return this.layers;}
    addLayer(l){if(!this.layers.items.includes(l))this.layers.items.push(l);}removeLayer(l){this.layers.items=this.layers.items.filter(x=>x!==l);}
    getPixelFromCoordinate(c){return [c[0]/10,c[1]/10];}getCoordinateFromPixel(p){return [p[0]*10,p[1]*10];}
    getEventPixel(e){return [e.clientX??0,e.clientY??0];}getViewport(){return this.viewport;}updateSize(){this.updated=true;}
  }
  class Source{constructor(opts={}){this.opts=opts;}}
  class VectorSource extends Source{constructor(opts={}){super(opts);this.features=[];}addFeatures(f){this.features.push(...f);}}
  class Layer{constructor(opts={}){this.opts=opts;this.visible=opts.visible!==false;this.opacity=opts.opacity??1;this.zIndex=opts.zIndex??0;}setVisible(v){this.visible=!!v;}setOpacity(v){this.opacity=v;}setZIndex(v){this.zIndex=v;}getSource(){return this.opts.source;}}
  class Group extends Layer{constructor(opts={}){super(opts);this.layers=opts.layers||[];}}
  class Feature{constructor(props={}){Object.assign(this,props);}setStyle(v){this.style=v;}}
  class Point{constructor(c){this.coordinates=c;}}
  class GeoJSON{readFeature(raw){return new Feature({raw});}}
  class Style{constructor(o){this.options=o;}} class Stroke extends Style{} class Fill extends Style{} class CircleStyle extends Style{} class Text extends Style{}
  const proj={fromLonLat:c=>[c[0]*1000,c[1]*1000],toLonLat:c=>[c[0]/1000,c[1]/1000],transformExtent:e=>e.map(v=>v*1000)};
  return {
    Map:MapCls,View,Feature,geom:{Point},format:{GeoJSON},
    proj,extent:{containsCoordinate:(e,c)=>c[0]>=e[0]&&c[0]<=e[2]&&c[1]>=e[1]&&c[1]<=e[3]},
    interaction:{defaults:()=>new Collection(),DragPan,DoubleClickZoom},control:{defaults:()=>new Collection()},
    layer:{Tile:Layer,Vector:Layer,Group},source:{XYZ:Source,TileWMS:Source,Vector:VectorSource},
    style:{Style,Stroke,Fill,Circle:CircleStyle,Text}
  };
}

function openLayersContext(){
  const context=load();
  const target={clientWidth:1000,clientHeight:700,children:[],appendChild(n){this.children.push(n);},classList:classList()};
  context.document.getElementById=id=>id==='map'?target:null;
  context.document.createElement=()=>({className:'',dataset:{},classList:classList(),style:{}});
  context.requestAnimationFrame=fn=>{fn();return 1;};
  context.ol=fakeOpenLayers();
  context.L.map=()=>new FakeMap();
  return {context,target};
}

test('map engine selection is explicit and defaults safely to Leaflet',()=>{
  const {context}=openLayersContext();
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=openlayers'),'openlayers');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=ol'),'openlayers');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=leaflet'),'leaflet');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine(''),'leaflet');
});

test('OpenLayers runtime preserves the same canonical lon/lat contract and compatibility surface',()=>{
  const {context,target}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol,L:context.L});
  assert.equal(runtime.engine,'openlayers');
  assert.equal(runtime.requestedEngine,'openlayers');
  assert.equal(runtime.nativeVersion,'10.9.0');
  assert.equal(runtime.parityBridge,'leaflet-overlays');
  assert.equal(target.children[0].style.position,'absolute');
  assert.equal(target.children[0].style.pointerEvents,'none');
  assert.deepEqual([...runtime.getCenter()],[153,-27]);
  assert.equal(runtime.getZoom(),6);
  assert.equal(target.children.length,1);
  assert.ok(runtime.getLegacyMap());
  runtime.setView([151,-33],8,{animate:false});
  assert.deepEqual([...runtime.getCenter()],[151,-33]);
  assert.equal(runtime.getZoom(),8);
  const px=runtime.lonLatToPixel([151,-33]);
  assert.equal(px.x,15100);assert.equal(px.y,-3300);
  assert.deepEqual([...runtime.pixelToLonLat(px)],[151,-33]);
});

test('OpenLayers runtime owns display layers and GIS tile/WMS/vector primitives',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol,L:context.L});
  const xyz=runtime.createTileLayer({url:'https://{s}.example/{z}/{x}/{y}.png',tms:true});
  const wms=runtime.createWmsLayer({url:'https://example.test/wms',layers:'roads'});
  const vector=runtime.createEditableVectorLayer({features:[{id:'a',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:6},label:{text:'A',coordinate:[153,-27]}}]});
  runtime.addDisplayLayer(xyz);runtime.addDisplayLayer(wms);runtime.addDisplayLayer(vector);
  assert.equal(runtime.hasDisplayLayer(xyz),true);
  assert.equal(vector.__editpolygonFeatureCount,1);
  runtime.removeDisplayLayer(wms);assert.equal(runtime.hasDisplayLayer(wms),false);
});

test('OpenLayers interaction toggles are implemented by native OL interactions, not Leaflet state',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol,L:context.L});
  runtime.setPanEnabled(false);assert.equal(runtime.isPanEnabled(),false);
  runtime.setPanEnabled(true);assert.equal(runtime.isPanEnabled(),true);
  runtime.setDoubleClickZoomEnabled(false);assert.equal(runtime.isDoubleClickZoomEnabled(),false);
  assert.equal(runtime.nativePanLooksActive(),false);
});

test('OpenLayers request falls back to Leaflet without breaking the editor if OL failed to load',()=>{
  const context=load(),native=new FakeMap();
  context.L.map=()=>native;
  const runtime=context.EditPolygonMapAdapter.createRuntime({engine:'openlayers',L:context.L,ol:null,map:native});
  assert.equal(runtime.engine,'leaflet');
  assert.equal(runtime.requestedEngine,'openlayers');
  assert.match(runtime.fallbackReason,/OpenLayers failed to load/);
});
