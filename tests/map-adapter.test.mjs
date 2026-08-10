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
    this.layers=new Set();
    this.panes=new Map();
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
  containerPointToLayerPoint(p){return {x:Number(p[0]??p.x),y:Number(p[1]??p.y)};}
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
  addLayer(layer){this.layers.add(layer);layer._map=this;return this;}
  removeLayer(layer){this.layers.delete(layer);if(layer)layer._map=null;return this;}
  hasLayer(layer){return this.layers.has(layer);}
  eachLayer(fn){for(const layer of this.layers)fn(layer);}
  getPane(name){return this.panes.get(name)||null;}
  createPane(name){const pane={classList:classList(),style:{}};this.panes.set(name,pane);return pane;}
}

function load(){
  const body={classList:classList()};
  const documentElement={classList:classList()};
  const context={console,Math,Number,Object,Array,JSON,Date,URLSearchParams,document:{body,documentElement}};
  context.globalThis=context;context.window=context;
  const tileLayerCalls=[];
  function layerGroup(){
    const children=[];
    return {children,__editpolygonFakeGroup:true,addLayer(layer){children.push(layer);return this;},clearLayers(){children.splice(0);return this;},eachLayer(fn){children.forEach(fn);},addTo(map){map.addLayer(this);return this;}};
  }
  function basicVectorChild(feature){
    const geometry=feature?.geometry||{};
    const child={feature:null,options:{},_latlng:null,_latlngs:null,_containsPoint:()=>true,redrawCount:0,
      setLatLng(value){this._latlng=value;return this;},getLatLng(){return this._latlng;},setLatLngs(value){this._latlngs=value;return this;},redraw(){this.redrawCount++;return this;},on(){return this;}};
    if(geometry.type==='Point')child._latlng={lat:Number(geometry.coordinates?.[1]),lng:Number(geometry.coordinates?.[0])};
    return child;
  }
  function geoJSON(data,options={}){
    const group=layerGroup(),features=data?.type==='FeatureCollection'?(data.features||[]):[data];
    for(const feature of features){
      let child;
      if(feature?.geometry?.type==='Point'&&typeof options.pointToLayer==='function')child=options.pointToLayer(feature,{lat:Number(feature.geometry.coordinates?.[1]),lng:Number(feature.geometry.coordinates?.[0])});
      else child=basicVectorChild(feature);
      child.feature=feature;child.options={...(child.options||{}),...(typeof options.style==='function'?options.style(feature):options.style||{})};group.addLayer(child);
    }
    group.setStyle=style=>{group.lastStyle=style;return group;};
    return group;
  }
  function circleMarker(ll,options={}){const child=basicVectorChild({geometry:{type:'Point',coordinates:[Number(ll.lng??ll[1]),Number(ll.lat??ll[0])]}});child.options=options;return child;}
  function marker(ll,options={}){return {_latlng:{lat:Number(ll[0]),lng:Number(ll[1])},options,__editpolygonKind:null,addTo(map){map.addLayer(this);return this;},getLatLng(){return this._latlng;},setLatLng(value){this._latlng=Array.isArray(value)?{lat:Number(value[0]),lng:Number(value[1])}:value;return this;}};}
  const tileLayer=(url,options)=>{const layer={url,options,addTo(map){map.addLayer?.(this);return this;},setOpacity(value){this.opacity=value;},setZIndex(value){this.zIndex=value;}};tileLayerCalls.push(layer);return layer;};
  tileLayer.wms=(url,options)=>tileLayer(url,options);
  context.L={
    map:()=>new FakeMap(),
    canvas:options=>({renderer:true,options}),
    latLng:(lat,lng)=>({lat,lng}),
    tileLayer,
    layerGroup,
    geoJSON,
    circleMarker,
    marker,
    divIcon:options=>({options}),
    imageOverlay:(url,bounds,options)=>({url,bounds,options,addTo(map){map.addLayer?.(this);return this;},setOpacity(value){this.opacity=value;},setZIndex(value){this.zIndex=value;}}),
    DomEvent:{stop:()=>{}}
  };
  context.__tileLayerCalls=tileLayerCalls;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'editpolygon-map-adapter.js'});
  return context;
}

test('map adapter exposes an engine-neutral Leaflet runtime with canonical lon/lat view state',()=>{
  const context=load(),native=new FakeMap();
  const runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  assert.equal(runtime.engine,'leaflet');
  assert.equal(runtime.version,'1.55.4.17');
  assert.deepEqual([...runtime.getCenter()],[153,-27]);
  runtime.setView([151,-33],9,{animate:false});
  assert.equal(JSON.stringify(native.lastSetView.ll),JSON.stringify([-33,151]));
  assert.deepEqual([...runtime.getCenter()],[151,-33]);
  assert.equal(runtime.getZoom(),9);
});

test('named display panes stay inside the adapter contract',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  const pane=runtime.ensureDisplayPane('referenceVectorPane',{zIndex:360,pointerEvents:'none',className:'reference-vector'});
  assert.equal(pane,native.getPane('referenceVectorPane'));
  assert.equal(pane.style.zIndex,'360');
  assert.equal(pane.style.pointerEvents,'none');
  assert.equal(pane.classList.contains('reference-vector'),true);
});

test('Leaflet tile layers preserve Leaflet subdomain defaults unless explicitly overridden',()=>{
  const context=load(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:new FakeMap()});
  runtime.createTileLayer({url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'});
  assert.equal(context.__tileLayerCalls.length,1);
  assert.equal(Object.prototype.hasOwnProperty.call(context.__tileLayerCalls[0].options,'subdomains'),false);
  runtime.createTileLayer({url:'https://{s}.example.test/{z}/{x}/{y}.png',subdomains:['a','b']});
  assert.deepEqual([...context.__tileLayerCalls[1].options.subdomains],['a','b']);
});

test('Leaflet reference/service primitives preserve adapter-owned pane and z-index placement',()=>{
  const context=load(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:new FakeMap()});
  const tile=runtime.createTileLayer({url:'https://tiles.example/{z}/{x}/{y}.png',pane:'gisServicePane',zIndex:33});
  assert.equal(tile.options.pane,'gisServicePane');
  assert.equal(tile.options.zIndex,33);
  const ref=runtime.createGeoJsonLayer({data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[153,-27]}}]},pane:'referenceVectorPane',style:{color:'#d92c32'},pointRadius:5});
  assert.equal(ref.children[0].options.pane,'referenceVectorPane');
  const raster=runtime.createStaticImageLayer({url:'data:image/png;base64,AA==',bounds:[[-28,152],[-26,154]],pane:'referenceRasterPane',opacity:.7});
  assert.equal(raster.options.pane,'referenceRasterPane');
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



test('Leaflet runtime can live-update cached editable geometry without rebuilding a layer',()=>{
  const context=load(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:new FakeMap()});
  let latlngs=null,redraws=0;
  const child={featureId:'poly-1',setLatLngs:value=>{latlngs=value;},redraw:()=>{redraws++;}};
  const group={eachLayer:fn=>fn(child)};
  assert.equal(runtime.updateEditableFeatureGeometry(group,'poly-1',{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]}),true);
  assert.equal(latlngs[0][1].lat,-27);
  assert.equal(latlngs[0][1].lng,154);
  assert.equal(redraws,1);
});
test('Leaflet runtime owns the same editable-vector primitive and rendered hit testing as OpenLayers',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  const layer=runtime.createEditableVectorLayer({features:[{id:'poly-1',geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]},style:{color:'#123456'},label:{text:'Test',coordinate:[153.5,-27.5]}}]});
  assert.equal(layer.__editpolygonEditable,true);
  assert.equal(layer.__editpolygonFeatureCount,1);
  runtime.addDisplayLayer(layer);
  assert.equal(runtime.hasDisplayLayer(layer),true);
  assert.deepEqual([...runtime.editableFeatureIdsAtPixel({x:20,y:20},{hitTolerance:8})],['poly-1']);
  assert.equal(runtime.updateEditableFeatureGeometry(layer,'poly-1',{type:'Polygon',coordinates:[[[153,-27],[155,-27],[155,-28],[153,-27]]]}),true);
  assert.ok(layer.__editpolygonGeometryFeatures.get('poly-1'));
});

test('Leaflet and OpenLayers runtimes expose the same engine-neutral application contract',()=>{
  const leafletContext=load(),leaflet=leafletContext.EditPolygonMapAdapter.createLeafletRuntime({L:leafletContext.L,map:new FakeMap()});
  const {context}=openLayersContext(),openlayers=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const ignored=new Set(['engine','requestedEngine','nativeVersion']);
  const methods=runtime=>Object.keys(runtime).filter(key=>!ignored.has(key)&&typeof runtime[key]==='function').sort();
  assert.deepEqual(methods(leaflet),methods(openlayers));
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
  class ZoomControl{constructor(opts={}){this.opts=opts;}} class AttributionControl{constructor(opts={}){this.opts=opts;}}
  class Collection{constructor(items=[]){this.items=items;}getArray(){return this.items;}includes(v){return this.items.includes(v);}}
  class MapCls extends Observable{
    constructor(opts={}){super();this.view=opts.view;this.layers=new Collection(opts.layers||[]);this.controls=opts.controls||[];this.interactions=new Collection([new DragPan(),new DoubleClickZoom()]);this.target=opts.target;this.viewport={className:'ol-viewport',handlers:{},parentNode:null,addEventListener:(t,h)=>this.viewport.handlers[t]=h,removeEventListener:t=>delete this.viewport.handlers[t]};opts.target?.appendChild?.(this.viewport);}
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
  class GeoJSON{readFeature(raw){return new Feature({raw,geometry:{type:raw.geometry?.type,coordinates:raw.geometry?.coordinates}});}readGeometry(raw){return {type:raw.type,coordinates:raw.coordinates,projected:true};}}
  class Style{constructor(o){this.options=o;}} class Stroke extends Style{} class Fill extends Style{} class CircleStyle extends Style{} class Text extends Style{}
  const canonicalLon=value=>((Number(value)+180)%360+360)%360-180;
  const proj={fromLonLat:c=>[c[0]*1000,c[1]*1000],toLonLat:c=>[canonicalLon(c[0]/1000),c[1]/1000],transformExtent:e=>e.map(v=>v*1000)};
  return {
    Map:MapCls,View,Feature,geom:{Point},format:{GeoJSON},
    proj,extent:{containsCoordinate:(e,c)=>c[0]>=e[0]&&c[0]<=e[2]&&c[1]>=e[1]&&c[1]<=e[3]},
    interaction:{defaults:()=>new Collection(),DragPan,DoubleClickZoom},control:{Zoom:ZoomControl,Attribution:AttributionControl},
    layer:{Tile:Layer,Vector:Layer,Image:Layer,Group},source:{XYZ:Source,TileWMS:Source,Vector:VectorSource,ImageStatic:Source},
    style:{Style,Stroke,Fill,Circle:CircleStyle,Text}
  };
}

function openLayersContext(){
  const context=load(),globalHandlers={};
  context.addEventListener=(t,h)=>{globalHandlers[t]=h;};context.removeEventListener=t=>{delete globalHandlers[t];};
  function matchesClosest(node,selector){
    for(let current=node;current;current=current.parentNode){
      if(selector.includes('.editpolygon-leaflet-compat')&&String(current.className||'').split(/\s+/).includes('editpolygon-leaflet-compat'))return current;
      if(selector.includes('[data-editpolygon-map-overlay="1"]')&&current.dataset?.editpolygonMapOverlay==='1')return current;
      if(selector.includes('#editOverlay')&&current.id==='editOverlay')return current;
      if(selector.includes('.gis-spatial-select-overlay')&&String(current.className||'').split(/\s+/).includes('gis-spatial-select-overlay'))return current;
      if(selector.includes('.leaflet-popup-pane')&&String(current.className||'').split(/\s+/).includes('leaflet-popup-pane'))return current;
    }
    return null;
  }
  function element(){return {className:'',id:'',dataset:{},classList:classList(),style:{},handlers:{},children:[],parentNode:null,appendChild(n){this.children.push(n);n.parentNode=this;},contains(n){for(let cur=n;cur;cur=cur.parentNode)if(cur===this)return true;return false;},closest(selector){return matchesClosest(this,selector);},getBoundingClientRect(){return this.parentNode?.getBoundingClientRect?.()||{left:0,top:0};},addEventListener(t,h){(this.handlers[t]??=[]).push(h);},removeEventListener(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(fn=>!h||fn!==h);},dispatchEvent(e){e.target=e.target||this;for(const h of this.handlers[e.type]||[])h(e);if(e.bubbles!==false&&this.parentNode)this.parentNode.dispatchEvent?.(e);},remove(){if(this.parentNode?.children)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;},setPointerCapture(){}};}
  const target={clientWidth:1000,clientHeight:700,children:[],handlers:{},appendChild(n){this.children.push(n);n.parentNode=this;},contains(n){for(let cur=n;cur;cur=cur.parentNode)if(cur===this)return true;return false;},getBoundingClientRect(){return{left:0,top:0};},classList:classList(),addEventListener(t,h){(this.handlers[t]??=[]).push(h);},removeEventListener(t,h){this.handlers[t]=(this.handlers[t]||[]).filter(fn=>!h||fn!==h);},dispatchEvent(e){for(const h of this.handlers[e.type]||[])h(e);}};
  context.document.getElementById=id=>id==='map'?target:null;
  context.document.createElement=()=>element();
  context.requestAnimationFrame=fn=>{fn();return 1;};
  context.ol=fakeOpenLayers();
  let leafletMapCalls=0;
  context.L.map=()=>{leafletMapCalls++;return new FakeMap();};
  return {context,target,globalHandlers,getLeafletMapCalls:()=>leafletMapCalls};
}

test('map engine selection is explicit and defaults safely to Leaflet',()=>{
  const {context}=openLayersContext();
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=openlayers'),'openlayers');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=ol'),'openlayers');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine('?mapEngine=leaflet'),'leaflet');
  assert.equal(context.EditPolygonMapAdapter.requestedEngine(''),'leaflet');
});

test('OpenLayers runtime preserves canonical lon/lat state without creating a Leaflet map',()=>{
  const {context,target,getLeafletMapCalls}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  assert.equal(runtime.engine,'openlayers');
  assert.equal(runtime.requestedEngine,'openlayers');
  assert.equal(runtime.nativeVersion,'10.9.0');
  assert.equal(runtime.getNativeMap().controls.length,2);
  assert.equal(runtime.getNativeMap().controls[0].constructor.name,'ZoomControl');
  assert.equal(runtime.getNativeMap().controls[1].constructor.name,'AttributionControl');
  assert.equal(getLeafletMapCalls(),0);
  assert.equal('getLegacyMap' in runtime,false);
  assert.equal('parityBridge' in runtime,false);
  assert.deepEqual([...runtime.getCenter()],[153,-27]);
  assert.equal(runtime.getZoom(),6);
  assert.equal(target.children.length,2);
  assert.equal(target.children[0].className,'ol-viewport');
  assert.equal(target.children[1].className,'editpolygon-openlayers-dom-overlays');
  assert.equal(target.children[1].style.zIndex,'40');
  runtime.setView([151,-33],8,{animate:false});
  assert.deepEqual([...runtime.getCenter()],[151,-33]);
  assert.equal(runtime.getZoom(),8);
  const px=runtime.lonLatToPixel([151,-33]);
  assert.equal(px.x,15100);assert.equal(px.y,-3300);
  assert.deepEqual([...runtime.pixelToLonLat(px)],[151,-33]);
});

test('OpenLayers forward and inverse pixel conversion preserve the active repeated-world longitude branch',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[873,-27],zoom:6,ol:context.ol});
  // The fake intentionally mirrors real ol.proj.toLonLat() by canonicalising
  // longitude. The adapter must recover the continuous longitude from EPSG:3857 x.
  assert.deepEqual([...runtime.getCenter()],[873,-27]);
  const canonical=runtime.lonLatToPixel([153,-27]);
  const alreadyWrapped=runtime.lonLatToPixel([873,-27]);
  assert.equal(canonical.x,87300);
  assert.equal(canonical.y,-2700);
  assert.equal(canonical.x,alreadyWrapped.x);
  assert.equal(canonical.y,alreadyWrapped.y);
  assert.deepEqual([...runtime.pixelToLonLat(canonical)],[873,-27]);
  const extent=runtime.getExtent(0);
  assert.ok(extent[0]>872&&extent[2]<874,`extent left repeated-world branch: ${extent.join(',')}`);
});

test('OpenLayers runtime owns display layers and GIS tile/WMS/vector primitives',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const xyz=runtime.createTileLayer({url:'https://{s}.example/{z}/{x}/{y}.png',tms:true});
  const wms=runtime.createWmsLayer({url:'https://example.test/geoserver/wms',layers:'roads'});
  const vector=runtime.createEditableVectorLayer({features:[{id:'a',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:6},label:{text:'A',coordinate:[153,-27]}}]});
  runtime.addDisplayLayer(xyz);runtime.addDisplayLayer(wms);runtime.addDisplayLayer(vector);
  assert.equal(runtime.hasDisplayLayer(xyz),true);
  assert.equal(wms.getSource().opts.params.LAYERS,'roads');
  assert.equal(wms.getSource().opts.params.TILED,true);
  assert.equal(wms.getSource().opts.serverType,'geoserver');
  assert.equal('crossOrigin' in wms.getSource().opts,false);
  assert.equal(vector.__editpolygonFeatureCount,1);
  assert.equal(vector.__editpolygonStyleCacheSize,1);
  assert.equal(vector.__editpolygonDeclutter,true);
  assert.equal(runtime.updateEditableFeatureGeometry(vector,'a',{type:'Point',coordinates:[154,-28]}),true);
  assert.equal(vector.__editpolygonGeometryFeatures.get('a').geometry.coordinates[0],154);
  assert.equal(vector.getSource().changedCount,1);
  runtime.removeDisplayLayer(wms);assert.equal(runtime.hasDisplayLayer(wms),false);
});

test('OpenLayers editable vectors share identical styles and skip decluttering when no text is present',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const layer=runtime.createEditableVectorLayer({features:[
    {id:'a',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#123456',radius:5}},
    {id:'b',geometry:{type:'Point',coordinates:[154,-28]},style:{color:'#123456',radius:5}}
  ]});
  assert.equal(layer.__editpolygonStyleCacheSize,1);
  assert.equal(layer.__editpolygonDeclutter,false);
  assert.equal(layer.getSource().opts.wrapX,true);
  assert.equal(layer.getSource().opts.useSpatialIndex,true);
  assert.equal(layer.__editpolygonGeometryFeatures.get('a').style,layer.__editpolygonGeometryFeatures.get('b').style);
});

test('OpenLayers runtime owns reference GeoJSON and static-image layers',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const ref=runtime.createGeoJsonLayer({data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[152,-28],[154,-28],[154,-26],[152,-28]]]}}]},style:{color:'#d92c32',fillColor:'#d92c32',fillOpacity:.15},pointRadius:5,zIndex:40.01});
  const raster=runtime.createStaticImageLayer({url:'data:image/png;base64,AA==',bounds:[[-28,152],[-26,154]],opacity:.7,zIndex:40.02});
  runtime.addDisplayLayer(ref);runtime.addDisplayLayer(raster);
  assert.equal(ref.__editpolygonReferenceKind,'geojson');
  assert.equal(ref.__editpolygonFeatureCount,1);
  assert.equal(raster.__editpolygonReferenceKind,'image');
  assert.deepEqual([...raster.__editpolygonImageExtent],[152000,-28000,154000,-26000]);
  runtime.setDisplayLayerOpacity(raster,.4);assert.equal(raster.opacity,.4);
  runtime.setDisplayLayerVisible(raster,false);assert.equal(raster.visible,false);
  runtime.setDisplayLayerZIndex(ref,40.5);assert.equal(ref.zIndex,40.5);
  assert.equal(runtime.setGeoJsonLayerStyle(ref,{style:{color:'#000000'},pointRadius:7}),true);
  assert.ok(ref.style);
});

test('OpenLayers interaction toggles are implemented by native OL interactions, not Leaflet state',()=>{
  const {context}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
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


test('OpenLayers transient vector overlays and DOM handles are native map-runtime primitives',()=>{
  const {context,target,globalHandlers}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const overlay=runtime.createVectorOverlayLayer({zIndex:1700});
  assert.equal(overlay.__editpolygonEngine,'openlayers');
  runtime.setVectorOverlayFeatures(overlay,[{id:'issue',geometry:{type:'Point',coordinates:[153,-27]},style:{color:'#b42318',fillColor:'#fff',radius:8}}]);
  assert.equal(overlay.getSource().features.length,1);
  runtime.clearVectorOverlayLayer(overlay);assert.equal(overlay.getSource().features.length,0);
  let dragged=null,ended=null;
  const handle=runtime.createDomOverlay({coordinate:[153,-27],className:'test-handle',anchor:[9,9],draggable:true,onDrag:e=>{dragged=e.lonLat;},onDragEnd:e=>{ended=e.lonLat;}});
  const el=handle.getElement();assert.equal(el.className,'test-handle');const pane=target.children.find(child=>child.className==='editpolygon-openlayers-dom-overlays');assert.ok(pane);assert.equal(pane.children.includes(el),true);
  el.handlers.pointerdown[0]({button:0,clientX:15300,clientY:-2700,preventDefault(){},stopPropagation(){}});
  globalHandlers.pointermove({clientX:15400,clientY:-2800});globalHandlers.pointerup({clientX:15400,clientY:-2800,type:'pointerup'});
  assert.deepEqual([...dragged],[154,-28]);assert.deepEqual([...ended],[154,-28]);assert.deepEqual([...handle.getCoordinate()],[154,-28]);
  handle.remove();assert.equal(pane.children.includes(el),false);
});



test('OpenLayers click delivery is native and has no compatibility-surface DOM fallback',()=>{
  const {context,target}=openLayersContext();
  const runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  let received=null;runtime.on('click',event=>{received=event;});
  runtime.getNativeMap().fire('click',{pixel:[320,210],coordinate:[3200,2100],originalEvent:{shiftKey:false}});
  assert.ok(received);
  assert.equal(received.pixel.x,320);assert.equal(received.pixel.y,210);
  assert.ok(Math.abs(received.lonLat[0]-3.2)<1e-9);assert.ok(Math.abs(received.lonLat[1]-2.1)<1e-9);
  assert.equal((target.handlers.click||[]).length,0);
  assert.equal(target.children.some(child=>child.className==='editpolygon-leaflet-compat'),false);
});

test('OpenLayers runtime exposes editable rendered-feature hit testing',()=>{
  assert.match(source,/function editableFeatureIdsAtPixel\(pixelValue,options=\{\}\)/);
  assert.match(source,/layer\.__editpolygonEditable=true/);
  assert.match(source,/hitTolerance/);
});

test('OpenLayers canonicalises repeated-world vector geometry before projection without breaking dateline continuity',()=>{
  const {context}=openLayersContext(),api=context.EditPolygonMapAdapter;
  assert.deepEqual(JSON.parse(JSON.stringify(api.geometryToCanonicalWorld({type:'Point',coordinates:[873,-27]}))),{type:'Point',coordinates:[153,-27]});
  assert.deepEqual(JSON.parse(JSON.stringify(api.geometryToCanonicalWorld({type:'LineString',coordinates:[[179,0],[-179,1],[-178,2]]}))),{type:'LineString',coordinates:[[179,0],[181,1],[182,2]]});
  const runtime=api.createOpenLayersRuntime({target:'map',center:[873,-27],zoom:6,ol:context.ol});
  const layer=runtime.createEditableVectorLayer({features:[{id:'p',geometry:{type:'Point',coordinates:[873,-27]},style:{radius:6}}]});
  assert.deepEqual(JSON.parse(JSON.stringify(layer.__editpolygonGeometryFeatures.get('p').raw.geometry.coordinates)),[153,-27]);
  assert.equal(runtime.updateEditableFeatureGeometry(layer,'p',{type:'Point',coordinates:[1233,-28]}),true);
  assert.deepEqual(JSON.parse(JSON.stringify(layer.__editpolygonGeometryFeatures.get('p').geometry.coordinates)),[153,-28]);
  const overlay=runtime.createVectorOverlayLayer({zIndex:1700});
  runtime.setVectorOverlayFeatures(overlay,[{id:'guide',geometry:{type:'LineString',coordinates:[[873,-27],[874,-27]]},style:{dashArray:'5,4'}}]);
  assert.deepEqual(JSON.parse(JSON.stringify(overlay.getSource().features[0].raw.geometry.coordinates)),[[153,-27],[154,-27]]);
});

test('OpenLayers tile layers distinguish display max zoom from native tile max zoom',()=>{
  const {context}=openLayersContext(),runtime=context.EditPolygonMapAdapter.createOpenLayersRuntime({target:'map',center:[153,-27],zoom:6,ol:context.ol});
  const layer=runtime.createTileLayer({url:'https://tiles.example/{z}/{x}/{y}.png',maxZoom:22,maxNativeZoom:19});
  assert.equal(layer.getSource().opts.maxZoom,19);
  assert.equal(layer.opts.maxZoom,22);
  assert.equal(layer.__editpolygonMaxNativeZoom,19);
});

test('editable layer content identity and hard purge stay inside the map adapter',()=>{
  const context=load(),native=new FakeMap(),runtime=context.EditPolygonMapAdapter.createLeafletRuntime({L:context.L,map:native});
  const a={type:'Polygon',coordinates:[[[150,-28],[151,-28],[151,-27],[150,-28]]]};
  const b={type:'Polygon',coordinates:[[[150,-28],[152,-28],[151,-27],[150,-28]]]};
  assert.notEqual(context.EditPolygonMapAdapter.geometryFingerprint(a),context.EditPolygonMapAdapter.geometryFingerprint(b));
  const layer=runtime.createEditableVectorLayer({layerKey:'layer-a',features:[{id:'f1',geometry:a,style:{color:'#123'}}]});
  runtime.addDisplayLayer(layer);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',a),true);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',b),false);
  assert.equal(runtime.updateEditableFeatureGeometry(layer,'f1',b),true);
  assert.equal(runtime.editableLayerMatchesGeometry(layer,'f1',b),true);
  assert.equal(runtime.clearEditableVectorLayers('layer-a'),1);
  assert.equal(runtime.hasDisplayLayer(layer),false);
});
