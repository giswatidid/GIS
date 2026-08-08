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
  const context={console,Math,Number,Object,Array,JSON,Date,document:{body,documentElement}};
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
  assert.equal(runtime.version,'1.55.0');
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
