from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'docs/assets/gis-processing.js'
CSS=ROOT/'docs/assets/gis-processing.css'
PKG=ROOT/'package.json'
MANIFEST=ROOT/'RELEASE_MANIFEST.md'
ARCH=ROOT/'ARCHITECTURE.md'
SMOKE=ROOT/'tests/browser-processing-preview-smoke.py'
INTERACTIVE=ROOT/'tests/browser-processing-preview-interactive-smoke.py'
NEW_SMOKE=ROOT/'tests/browser-processing-preview-map-mode-smoke.py'
OLD_KEY='20260820-v1561-processing-preview-v6'
NEW_KEY='20260820-v1561-processing-preview-v7'

def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old,new,1)

js=JS.read_text(encoding='utf-8')
js=replace_once(js,
"  previewTimer:null,livePreview:true,previewActivated:false,previewStale:false\n};",
"  previewTimer:null,livePreview:true,previewActivated:false,previewStale:false,mapPreviewMode:false\n};",
'state map preview flag')
js=replace_once(js,
"  worker:null,job:null,jobSeq:0,token:0,overlay:null,last:null\n};",
"  worker:null,job:null,jobSeq:0,token:0,overlay:null,last:null,renderItems:[],mapUnbind:null,restoreRaf:0\n};",
'preview runtime persistence state')
old_overlay="""function ensurePreviewOverlay(){
  const map=global.EditPolygonMap;
  if(!map?.createVectorOverlayLayer)return null;
  if(!previewRuntime.overlay)previewRuntime.overlay=map.createVectorOverlayLayer({zIndex:1580});
  return previewRuntime.overlay;
}
function clearPreviewOverlay(){
  try{if(previewRuntime.overlay)global.EditPolygonMap?.clearVectorOverlayLayer?.(previewRuntime.overlay);}catch(_){}
}
"""
new_overlay="""function ensurePreviewOverlay(){
  const map=global.EditPolygonMap;
  if(!map?.createVectorOverlayLayer)return null;
  if(!previewRuntime.overlay)previewRuntime.overlay=map.createVectorOverlayLayer({zIndex:1580});
  else if(typeof map.hasDisplayLayer==='function'&&!map.hasDisplayLayer(previewRuntime.overlay))map.addDisplayLayer?.(previewRuntime.overlay);
  return previewRuntime.overlay;
}
function restorePreviewOverlay(){
  const items=previewRuntime.renderItems||[];
  if(!items.length)return false;
  const map=global.EditPolygonMap,overlay=ensurePreviewOverlay();
  if(!overlay)return false;
  try{map.setVectorOverlayFeatures?.(overlay,clone(items));return true;}catch(_){return false;}
}
function schedulePreviewOverlayRestore(){
  if(!previewRuntime.renderItems?.length||previewRuntime.restoreRaf)return;
  const restore=()=>{previewRuntime.restoreRaf=0;restorePreviewOverlay();};
  previewRuntime.restoreRaf=global.requestAnimationFrame?.(restore)||global.setTimeout?.(restore,0)||0;
}
function bindPreviewOverlayPersistence(){
  if(previewRuntime.mapUnbind||!global.EditPolygonMap?.on)return;
  const off=global.EditPolygonMap.on('viewreset resize',schedulePreviewOverlayRestore);
  previewRuntime.mapUnbind=typeof off==='function'?off:()=>global.EditPolygonMap?.off?.('viewreset resize',schedulePreviewOverlayRestore);
}
function unbindPreviewOverlayPersistence(){
  try{previewRuntime.mapUnbind?.();}catch(_){}
  previewRuntime.mapUnbind=null;
  if(previewRuntime.restoreRaf){try{global.cancelAnimationFrame?.(previewRuntime.restoreRaf);}catch(_){}previewRuntime.restoreRaf=0;}
}
function clearPreviewOverlay({forget=false}={}){
  try{if(previewRuntime.overlay)global.EditPolygonMap?.clearVectorOverlayLayer?.(previewRuntime.overlay);}catch(_){}
  if(forget){previewRuntime.renderItems=[];unbindPreviewOverlayPersistence();}
}
"""
js=replace_once(js,old_overlay,new_overlay,'preview overlay persistence block')
old_render="""function renderPreviewOverlay(task,result){
  clearPreviewOverlay();
  const features=previewFeaturesFromResult(task,result),kind=result?.kind==='selection'?'selection':'layer',overlay=ensurePreviewOverlay();
  const rendered=features.slice(0,PREVIEW_RENDER_LIMIT);
  if(overlay&&rendered.length){
    global.EditPolygonMap?.setVectorOverlayFeatures?.(overlay,rendered.map((feature,index)=>({
      id:`processing-preview-${index}`,
      geometry:clone(feature.geometry),
      style:previewStyle(kind,feature.geometry?.type)
    })));
  }
  return {features,renderedCount:rendered.length,truncated:features.length>rendered.length};
}
"""
new_render="""function renderPreviewOverlay(task,result){
  clearPreviewOverlay();
  const features=previewFeaturesFromResult(task,result),kind=result?.kind==='selection'?'selection':'layer',overlay=ensurePreviewOverlay();
  const rendered=features.slice(0,PREVIEW_RENDER_LIMIT);
  const items=rendered.map((feature,index)=>({
    id:`processing-preview-${index}`,
    geometry:clone(feature.geometry),
    style:previewStyle(kind,feature.geometry?.type)
  }));
  previewRuntime.renderItems=clone(items);
  if(overlay&&items.length)global.EditPolygonMap?.setVectorOverlayFeatures?.(overlay,items);
  if(items.length)bindPreviewOverlayPersistence();
  return {features,renderedCount:rendered.length,truncated:features.length>rendered.length};
}
"""
js=replace_once(js,old_render,new_render,'preview overlay render')
js=replace_once(js,
"  terminatePreviewWorker();\n  clearPreviewOverlay();\n  const token=++previewRuntime.token,task=buildPreviewTask",
"  terminatePreviewWorker();\n  clearPreviewOverlay({forget:true});\n  const token=++previewRuntime.token,task=buildPreviewTask",
'preview start overlay clear')
js=replace_once(js,
"  if(token!==previewRuntime.token){clearPreviewOverlay();throw previewCancelError('A newer Processing preview replaced this result.');}",
"  if(token!==previewRuntime.token){clearPreviewOverlay({forget:true});throw previewCancelError('A newer Processing preview replaced this result.');}",
'stale preview overlay clear')
js=replace_once(js,
"function clearProcessingPreview(){\n  ++previewRuntime.token;\n  terminatePreviewWorker();\n  clearPreviewOverlay();",
"function clearProcessingPreview(){\n  ++previewRuntime.token;\n  terminatePreviewWorker();\n  clearPreviewOverlay({forget:true});",
'clear processing preview')
js=replace_once(js,
"function cancelProcessingPreview(){\n  ++previewRuntime.token;\n  terminatePreviewWorker();\n  clearPreviewOverlay();",
"function cancelProcessingPreview(){\n  ++previewRuntime.token;\n  terminatePreviewWorker();\n  clearPreviewOverlay({forget:true});",
'cancel processing preview')

supports="function supportsPreview(){return currentPreviewPolicy().enabled!==false&&typeof state.api?.runProcessingPreview==='function';}\n"
preview_mode=r'''function supportsPreview(){return currentPreviewPolicy().enabled!==false&&typeof state.api?.runProcessingPreview==='function';}

function previewModal(){return state.host?.closest?.('#gisDataModal')||null;}
function setMapPreviewMode(active,{renderNow=true}={}){
  state.mapPreviewMode=!!active;
  const modal=previewModal();
  modal?.classList.toggle('gis-processing-map-preview',state.mapPreviewMode);
  if(renderNow&&state.host)render();
  global.requestAnimationFrame?.(()=>{try{global.EditPolygonMap?.resize?.();}catch(_){}});
  return state.mapPreviewMode;
}
function previewModeRunLabel(tool){return tool?.resultKind==='selection'?'Apply selection':state.request?.output?.mode==='modify-source'?'Apply to input layer':'Run and create layer';}
function previewModeView(pf){
  const tool=pf.tool||registry()?.getTool(state.toolId);if(!tool)return '<section class="gis-processing-config"><p>Choose a processing tool.</p></section>';
  const params=(tool.parameters||[]).filter(item=>!item.advanced).map(def=>parameterControl(def,state.request.parameters[def.id])).join('');
  const advanced=(tool.parameters||[]).filter(item=>item.advanced).map(def=>parameterControl(def,state.request.parameters[def.id])).join('');
  const previewLabel=previewActionLabel(tool),runLabel=previewModeRunLabel(tool),issues=!pf.valid||(pf.warnings||[]).length;
  return `<section class="gis-processing-config gis-processing-map-preview-panel"><div class="gis-processing-preview-mode-head"><div><span>Preview mode</span><h2>${esc(tool.title)}</h2><p>Pan and zoom the map while you tune the processing result.</p></div><button type="button" data-processing-action="back-to-toolbox">Back to Processing</button></div><div class="gis-processing-preview-mode-note"><strong>Nothing is committed yet.</strong><span>The original geometry stays visible underneath the temporary preview.</span></div><fieldset class="gis-processing-parameter-lock" ${busy()?'disabled':''}><div class="gis-processing-form">${inputControls(tool)}${params}</div>${advanced?`<details class="gis-processing-advanced"><summary>Advanced parameters</summary><div class="gis-processing-form">${advanced}</div></details>`:''}</fieldset>${livePreviewControls(pf,tool)}${issues?`<div id="gisProcessingPreflight">${preflightHtml(pf)}</div>`:'<div id="gisProcessingPreflight" hidden></div>'}${progressHtml()}${previewHtml()}<div class="gis-processing-actions gis-processing-preview-mode-actions"><button type="button" data-processing-action="preview" ${busy()||!pf.valid?'disabled':''}>${state.previewing?'Previewing…':previewLabel}</button><button type="button" class="primary" data-processing-action="run" ${busy()||!pf.valid||!state.previewResult?'disabled':''}>${state.running?'Processing…':runLabel}</button><button type="button" data-processing-action="cancel" ${busy()?'':'disabled'}>Cancel</button></div></section>`;
}
'''
js=replace_once(js,supports,preview_mode,'map preview mode helpers')
old_render_ui="function render(){if(!state.host)return;ensureRequest();const pf=(state.result||state.previewResult)&&state.preflight?state.preflight:preflight();state.host.innerHTML=`<div class=\"gis-processing-layout\"><aside class=\"gis-processing-browser\"><label>Find a tool<input id=\"gisProcessingSearch\" type=\"search\" placeholder=\"Search buffer, dissolve, spatial join…\" value=\"${esc(state.query)}\"></label><div class=\"gis-processing-tools\">${toolButtons()}</div></aside>${parameterView(pf)}</div>`;}"
new_render_ui="function render(){if(!state.host)return;ensureRequest();const pf=(state.result||state.previewResult)&&state.preflight?state.preflight:preflight();if(state.mapPreviewMode){state.host.innerHTML=previewModeView(pf);return;}state.host.innerHTML=`<div class=\"gis-processing-layout\"><aside class=\"gis-processing-browser\"><label>Find a tool<input id=\"gisProcessingSearch\" type=\"search\" placeholder=\"Search buffer, dissolve, spatial join…\" value=\"${esc(state.query)}\"></label><div class=\"gis-processing-tools\">${toolButtons()}</div></aside>${parameterView(pf)}</div>`;}"
js=replace_once(js,old_render_ui,new_render_ui,'Processing render branch')
js=replace_once(js,
"  if(!pf.valid){render();return;}\n  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);",
"  if(!pf.valid){render();return;}\n  if(!automatic)setMapPreviewMode(true,{renderNow:false});\n  const policy=currentPreviewPolicy(),count=Number(pf.counts?.source||0);",
'enter map preview mode')
js=replace_once(js,
"    state.status?.(`${what}.${result.reused?' Used the verified preview result.':''}`,result.summary?.failed?'error':'ok');\n    render();\n  }catch(error){\n    state.running=false;state.progress=null;state.status?.(error.message,'error');render();",
"    state.status?.(`${what}.${result.reused?' Used the verified preview result.':''}`,result.summary?.failed?'error':'ok');\n    setMapPreviewMode(false,{renderNow:false});render();\n  }catch(error){\n    state.running=false;state.progress=null;setMapPreviewMode(false,{renderNow:false});state.status?.(error.message,'error');render();",
'exit preview mode after run')
old_click="function click(event){const fieldsAction=event.target.closest('[data-processing-fields-action]');if(fieldsAction){fieldPickerAction(fieldsAction);return;}const tool=event.target.closest('[data-processing-tool]');if(tool){changeTool(tool.dataset.processingTool);return;}const action=event.target.closest('[data-processing-action]')?.dataset.processingAction;if(action==='preview')runPreview();else if(action==='clear-preview')clearPreviewState({cancel:false,renderNow:true});else if(action==='run')run();else if(action==='cancel')cancel();else if(action==='open-output'&&state.result?.output)state.onOpenOutput?.(state.result.output);else if(action==='zoom-output'&&state.result?.output)state.api?.zoomLayer?.(state.result.output.id);else if(action==='run-again'){state.result=null;state.progress=null;render();}}"
new_click="function click(event){const fieldsAction=event.target.closest('[data-processing-fields-action]');if(fieldsAction){fieldPickerAction(fieldsAction);return;}const tool=event.target.closest('[data-processing-tool]');if(tool){changeTool(tool.dataset.processingTool);return;}const action=event.target.closest('[data-processing-action]')?.dataset.processingAction;if(action==='preview')runPreview();else if(action==='back-to-toolbox')setMapPreviewMode(false);else if(action==='clear-preview')clearPreviewState({cancel:false,renderNow:true});else if(action==='run')run();else if(action==='cancel')cancel();else if(action==='open-output'&&state.result?.output)state.onOpenOutput?.(state.result.output);else if(action==='zoom-output'&&state.result?.output)state.api?.zoomLayer?.(state.result.output.id);else if(action==='run-again'){state.result=null;state.progress=null;render();}}"
js=replace_once(js,old_click,new_click,'preview mode action routing')
js=replace_once(js,
"function mount(host,{layerId='',toolId='',sourceScope='',api=null,status=null,onOpenOutput=null}={}){state.host=host;state.api=installPreviewBridge(api||global.EditPolygonGIS);",
"function mount(host,{layerId='',toolId='',sourceScope='',api=null,status=null,onOpenOutput=null}={}){state.host=host;state.api=installPreviewBridge(api||global.EditPolygonGIS);setMapPreviewMode(false,{renderNow:false});",
'mount preview mode reset')
js=replace_once(js,
"function reset(){if(busy())cancel();clearPreviewState({cancel:true});state.request=null;state.preflight=null;state.result=null;state.progress=null;}",
"function reset(){if(busy())cancel();clearPreviewState({cancel:true});setMapPreviewMode(false,{renderNow:false});state.request=null;state.preflight=null;state.result=null;state.progress=null;}",
'reset preview mode')
JS.write_text(js,encoding='utf-8')

css=CSS.read_text(encoding='utf-8')
marker='/* v1.56.1 map inspection preview mode */'
if marker in css: raise SystemExit('map preview CSS already present')
css += r'''

/* v1.56.1 map inspection preview mode */
.gis-data-modal.gis-processing-map-preview{display:block!important;background:transparent!important;padding:0!important;pointer-events:none}
.gis-processing-map-preview .gis-data-shell{position:fixed;top:72px;right:16px;bottom:auto;left:auto;width:min(400px,calc(100vw - 32px));height:auto;max-height:calc(100vh - 96px);margin:0;border:2px solid #7c3aed;border-radius:10px;box-shadow:0 18px 52px rgba(15,23,42,.28);overflow:hidden;pointer-events:auto;z-index:1}
.gis-processing-map-preview .gis-data-shell>header,.gis-processing-map-preview .gis-data-shell>footer{display:none!important}
.gis-processing-map-preview .gis-data-shell>main{flex:none;max-height:calc(100vh - 100px);overflow:auto;padding:0;background:var(--panel)}
.gis-processing-map-preview .gis-processing-layout{display:block;max-width:none;margin:0}.gis-processing-map-preview .gis-processing-browser{display:none}.gis-processing-map-preview .gis-processing-config{border:0;padding:13px;background:var(--panel)}
.gis-processing-preview-mode-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--line)}.gis-processing-preview-mode-head>div{min-width:0}.gis-processing-preview-mode-head span{display:inline-block;padding:3px 6px;border-radius:999px;background:#ede9fe;color:#5b21b6;text-transform:uppercase;letter-spacing:.08em;font-size:9px;font-weight:800}.gis-processing-preview-mode-head h2{margin:5px 0 2px;font-size:18px}.gis-processing-preview-mode-head p{margin:0;color:var(--muted);font-size:10px;line-height:1.35}.gis-processing-preview-mode-head button{white-space:nowrap;font-size:10px;padding:6px 8px}
.gis-processing-preview-mode-note{margin:10px 0;padding:8px 9px;border:1px solid #c4b5fd;background:#f5f3ff;display:grid;gap:2px}.gis-processing-preview-mode-note strong{font-size:10px;color:#5b21b6}.gis-processing-preview-mode-note span{font-size:9px;color:#6d5a8f}
.gis-processing-map-preview-panel .gis-processing-form{grid-template-columns:1fr;gap:8px}.gis-processing-map-preview-panel .gis-processing-form label{font-size:10px}.gis-processing-map-preview-panel .gis-processing-form label small{font-size:8px}.gis-processing-map-preview-panel .gis-processing-field-options{max-height:120px}.gis-processing-map-preview-panel .gis-processing-live-preview{margin-top:8px}.gis-processing-map-preview-panel .gis-processing-preflight{margin-top:8px}.gis-processing-map-preview-panel .gis-processing-progress,.gis-processing-map-preview-panel .gis-processing-result{margin-top:9px}.gis-processing-map-preview-panel .gis-processing-result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gis-processing-map-preview-panel .gis-processing-result>header{gap:6px}.gis-processing-map-preview-panel .gis-processing-result>header span{font-size:9px}.gis-processing-map-preview-panel .gis-processing-data-preview>div{max-height:150px}.gis-processing-preview-mode-actions{position:sticky;bottom:0;margin:10px -13px -13px;padding:10px 13px;background:var(--panel);box-shadow:0 -7px 14px rgba(15,23,42,.06);z-index:2}.gis-processing-preview-mode-actions .primary{margin-left:auto}
body.night-mode .gis-processing-preview-mode-head span{background:#2e2454;color:#ddd6fe}body.night-mode .gis-processing-preview-mode-note{background:#211b37;border-color:#5b4b87}body.night-mode .gis-processing-preview-mode-note strong{color:#c4b5fd}body.night-mode .gis-processing-preview-mode-note span{color:#b9acd5}
@media(max-width:620px){.gis-processing-map-preview .gis-data-shell{top:auto;right:8px;left:8px;bottom:8px;width:auto;max-height:min(62vh,560px);border-radius:12px}.gis-processing-map-preview .gis-data-shell>main{max-height:min(62vh,560px)}.gis-processing-preview-mode-head{align-items:flex-start}.gis-processing-preview-mode-head button{min-height:40px}.gis-processing-preview-mode-actions button{min-height:42px;flex:1}.gis-processing-preview-mode-actions .primary{margin-left:0}}
'''
CSS.write_text(css,encoding='utf-8')

# Browser regressions must explicitly return from map preview mode before selecting another tool.
text=SMOKE.read_text(encoding='utf-8')
text=replace_once(text,
"    assert page.evaluate('window.__clear')>before\n\n    page.locator('[data-processing-tool=\"select-by-attribute\"]').click()",
"    assert page.evaluate('window.__clear')>before\n    page.locator('[data-processing-action=\"back-to-toolbox\"]').click()\n\n    page.locator('[data-processing-tool=\"select-by-attribute\"]').click()",
'preview smoke return after buffer')
text=replace_once(text,
"    assert page.evaluate('window.__mutations')==0\n\n    page.locator('[data-processing-tool=\"buffer\"]').click()",
"    assert page.evaluate('window.__mutations')==0\n    page.locator('[data-processing-action=\"back-to-toolbox\"]').click()\n\n    page.locator('[data-processing-tool=\"buffer\"]').click()",
'preview smoke return after selection')
SMOKE.write_text(text,encoding='utf-8')

text=INTERACTIVE.read_text(encoding='utf-8')
text=replace_once(text,
"    assert 'vertices removed' in page.locator('.gis-processing-preview').inner_text().lower()\n\n    page.locator('[data-processing-tool=\"snap\"]').click()",
"    assert 'vertices removed' in page.locator('.gis-processing-preview').inner_text().lower()\n    page.locator('[data-processing-action=\"back-to-toolbox\"]').click()\n\n    page.locator('[data-processing-tool=\"snap\"]').click()",
'interactive return after simplify')
text=replace_once(text,
"    assert page.locator('[data-processing-action=\"preview\"]').inner_text()=='Refresh preview'\n\n    page.locator('[data-processing-tool=\"distance-to-nearest\"]').click()",
"    assert page.locator('[data-processing-action=\"preview\"]').inner_text()=='Refresh preview'\n    page.locator('[data-processing-action=\"back-to-toolbox\"]').click()\n\n    page.locator('[data-processing-tool=\"distance-to-nearest\"]').click()",
'interactive return after snap')
INTERACTIVE.write_text(text,encoding='utf-8')

NEW_SMOKE.write_text(r'''from pathlib import Path
import os,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'docs/assets/gis-processing.js';CSS=ROOT/'docs/assets/gis-processing.css'
def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None
with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']};exe=chromium_path()
    if exe:options['executable_path']=exe
    browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1200,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content("""<!doctype html><html><head><style>:root{--line:#d7dce3;--panel:#fff;--text:#111827;--muted:#64748b;--soft:#f3f5f7}.gis-data-modal{position:fixed;inset:0;z-index:4000;display:flex;background:rgba(15,23,42,.52);padding:28px}.gis-data-shell{width:900px;height:650px;margin:auto;background:#fff;display:flex;flex-direction:column}.gis-data-shell>header,.gis-data-shell>footer{height:40px}.gis-data-shell>main{flex:1}</style></head><body><div id=map style='position:fixed;inset:0;background:#dde7d8'></div><div id=gisDataModal class='gis-data-modal active'><div class=gis-data-shell><header>Toolbox</header><main><div id=host></div></main><footer>Footer</footer></div></div><script>
    const tool={id:'simplify',title:'Simplify',category:'maintenance',description:'Reduce vertices',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'live',debounceMs:80,maxAutoFeatures:1000,metrics:[]},inputs:[{id:'source',label:'Input layer',families:['line'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance (metres)',type:'number',default:1000,required:true,min:0,nonZero:true,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}}]};
    const layer={id:'source',name:'Source',features:[{id:'a',geometryType:'LineString',properties:{name:'A'},filtered:false}]};
    window.EditPolygonGISProcessingRegistry={getTool:id=>id==='simplify'?tool:null,search:()=>[tool],getCategories:()=>[{id:'maintenance',title:'Geometry maintenance'}],getCategory:()=>({title:'Geometry maintenance'})};
    function normaliseRequest(v){return{toolId:'simplify',inputs:{source:{layerId:'source',scope:'all'}},parameters:{tolerance:v.parameters?.tolerance??1000},output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}}}
    function preflight(v){const request=normaliseRequest(v);return{valid:true,errors:[],warnings:[],request,tool,inputs:{source:layer},inputFeatures:{source:layer.features},counts:{source:1},source:layer}}
    window.EditPolygonGISProcessingCore={family:()=> 'line',normaliseRequest,defaultOutputName:()=> 'Result',preflight,resolveProcessingCrs:()=> 'EPSG:32756',previewFingerprint:()=> 'fp'};
    window.compactProjectState=()=>({files:[{id:'source',name:'Source',features:[{id:'a',name:'A',properties:{name:'A'},geometry:{type:'LineString',coordinates:[[153,-27],[153.2,-27.1],[153.4,-27]]}}]}]});
    window.Worker=undefined;window.turf={length:()=>10,bbox:()=>[153,-27.1,153.4,-27]};
    window.EditPolygonGISProcessingEngine={execute:async(task,{onProgress})=>{onProgress({stage:'Simplifying',done:1,total:1,percent:80});return{kind:'layer',features:[{type:'Feature',id:'a',properties:{name:'A'},geometry:{type:'LineString',coordinates:[[153,-27],[153.4,-27]]}}],summary:{input:1,processed:1,output:1,failed:0},failures:[],processingCrs:'EPSG:32756'}};
    window.__setCalls=0;window.__addCalls=0;window.__restore=null;window.__overlay=null;
    window.EditPolygonMap={createVectorOverlayLayer:()=>window.__overlay={present:true,items:[]},clearVectorOverlayLayer:o=>{o.items=[];return true},setVectorOverlayFeatures:(o,items)=>{o.items=items;window.__setCalls++;return true},hasDisplayLayer:o=>!!o.present,addDisplayLayer:o=>{o.present=true;window.__addCalls++;return o},on:(types,handler)=>{window.__restore=handler;return()=>{window.__restore=null}},resize:()=>true};
    window.EditPolygonGIS={getEditableLayers:()=>[layer],getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,runProcessingRequest:async()=>({kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]}),cancelProcessing:()=>true};
    </script></body></html>""")
    page.add_style_tag(path=str(CSS));page.add_script_tag(path=str(JS));page.evaluate("EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',toolId:'simplify',api:EditPolygonGIS})")
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    assert page.locator('.gis-processing-browser').count()==0
    assert page.locator('.gis-processing-preview-mode-head').count()==1
    assert page.locator('#gisDataModal').evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
    assert page.evaluate('window.__setCalls')>=1 and page.evaluate('window.__overlay.items.length')==1
    before=page.evaluate('window.__setCalls');page.evaluate("window.__overlay.present=false;window.__overlay.items=[];window.__restore()")
    page.wait_for_timeout(60)
    assert page.evaluate('window.__overlay.present') is True
    assert page.evaluate('window.__overlay.items.length')==1
    assert page.evaluate('window.__setCalls')>before and page.evaluate('window.__addCalls')>=1
    page.locator('[data-processing-action="back-to-toolbox"]').click()
    assert not page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    assert page.locator('.gis-processing-browser').count()==1
    assert page.evaluate('window.__overlay.items.length')==1,'returning to the Toolbox must preserve the current preview'
    assert not errors,errors
    browser.close()
print('Processing map preview mode browser smoke test passed.')
''',encoding='utf-8')

pkg=PKG.read_text(encoding='utf-8')
pkg=replace_once(pkg,
'python tests/browser-processing-preview-interactive-smoke.py',
'python tests/browser-processing-preview-interactive-smoke.py && python tests/browser-processing-preview-map-mode-smoke.py',
'browser smoke package chain')
PKG.write_text(pkg,encoding='utf-8')

manifest=MANIFEST.read_text(encoding='utf-8')
manifest=manifest.replace('responsive Toolbox UI. Includes non-destructive previews, logarithmic Simplify/Densify controls, specialised metrics, data-result preview tables and fingerprint-safe preview reuse.', 'responsive Toolbox UI. Includes non-destructive previews, a map-first floating Preview Mode, logarithmic Simplify/Densify controls, specialised metrics, data-result preview tables and fingerprint-safe preview reuse.')
manifest=manifest.replace('**319/319 Node tests**, **11/11 browser smoke suites**','**340/340 Node tests**, **16/16 browser smoke suites**')
MANIFEST.write_text(manifest,encoding='utf-8')

arch=ARCH.read_text(encoding='utf-8')
needle='Preview and Run execute the same Processing request/worker/engine path'
if needle in arch and 'map-first floating Preview Mode' not in arch:
    arch=arch.replace(needle,needle+'; geometry previews enter a map-first floating Preview Mode so the map remains interactive while parameters are tuned')
ARCH.write_text(arch,encoding='utf-8')

# Advance every already-versioned preview asset reference consistently.
for path in list((ROOT/'docs').rglob('*'))+list((ROOT/'tests').rglob('*')):
    if not path.is_file() or path.suffix.lower() not in {'.js','.html','.mjs','.py','.md','.css'}:continue
    try:text=path.read_text(encoding='utf-8')
    except UnicodeDecodeError:continue
    if OLD_KEY in text:path.write_text(text.replace(OLD_KEY,NEW_KEY),encoding='utf-8')

print('Processing map preview mode patch applied.')
