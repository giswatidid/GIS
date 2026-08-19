from pathlib import Path
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
    page.set_content("""<!doctype html><html><head><style>:root{--line:#d7dce3;--panel:#fff;--text:#111827;--muted:#64748b;--soft:#f3f5f7}.gis-data-modal{position:fixed;inset:0;z-index:4000;display:flex;background:rgba(15,23,42,.52);padding:28px}.gis-data-shell{width:900px;height:650px;margin:auto;background:#fff;display:flex;flex-direction:column}.gis-data-shell>header,.gis-data-shell>footer{height:40px}.gis-data-shell>main{flex:1}</style></head><body><div id="map" style="position:fixed;inset:0;background:#dde7d8"></div><div id="gisDataModal" class="gis-data-modal active"><div class="gis-data-shell"><header>Toolbox</header><main><div id="host"></div></main><footer>Footer</footer></div></div></body></html>""")
    page.evaluate("""() => {
      const tool={id:'simplify',title:'Simplify',category:'maintenance',description:'Reduce vertices',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'live',debounceMs:80,maxAutoFeatures:1000,metrics:[]},inputs:[{id:'source',label:'Input layer',families:['line'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance (metres)',type:'number',default:1000,required:true,min:0,nonZero:true,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}}]};
      const layer={id:'source',name:'Source',features:[{id:'a',geometryType:'LineString',properties:{name:'A'},filtered:false}]};
      const normaliseRequest=v=>({toolId:'simplify',inputs:{source:{layerId:'source',scope:'all'}},parameters:{tolerance:v?.parameters?.tolerance??1000},output:{mode:v?.output?.mode||'new-layer',name:v?.output?.name||'Result'}});
      const preflight=v=>{const request=normaliseRequest(v);return{valid:true,errors:[],warnings:[],request,tool,inputs:{source:layer},inputFeatures:{source:layer.features},counts:{source:1},source:layer};};
      window.EditPolygonGISProcessingRegistry={getTool:id=>id==='simplify'?tool:null,search:()=>[tool],getCategories:()=>[{id:'maintenance',title:'Geometry maintenance'}],getCategory:()=>({title:'Geometry maintenance'})};
      window.EditPolygonGISProcessingCore={family:()=> 'line',normaliseRequest,defaultOutputName:()=> 'Result',preflight,resolveProcessingCrs:()=> 'EPSG:32756',previewFingerprint:()=> 'fp'};
      window.compactProjectState=()=>({files:[{id:'source',name:'Source',features:[{id:'a',name:'A',properties:{name:'A'},geometry:{type:'LineString',coordinates:[[153,-27],[153.2,-27.1],[153.4,-27]]}}]}]});
      window.Worker=undefined;window.turf={length:()=>10,bbox:()=>[153,-27.1,153.4,-27]};
      window.EditPolygonGISProcessingEngine={execute:async(task,{onProgress})=>{onProgress({stage:'Simplifying',done:1,total:1,percent:80});return{kind:'layer',features:[{type:'Feature',id:'a',properties:{name:'A'},geometry:{type:'LineString',coordinates:[[153,-27],[153.4,-27]]}}],summary:{input:1,processed:1,output:1,failed:0},failures:[],processingCrs:'EPSG:32756'};}};
      window.__setCalls=0;window.__addCalls=0;window.__mapHandlers={};window.__overlay=null;window.__runCalls=0;
      window.EditPolygonMap={createVectorOverlayLayer:()=>window.__overlay={present:true,items:[]},clearVectorOverlayLayer:o=>{o.items=[];return true},setVectorOverlayFeatures:(o,items)=>{o.items=items;window.__setCalls++;return true},hasDisplayLayer:o=>!!o.present,addDisplayLayer:o=>{o.present=true;window.__addCalls++;return o},on:(types,handler)=>{for(const type of String(types).split(' ').filter(Boolean))window.__mapHandlers[type]=handler;return()=>{for(const type of String(types).split(' ').filter(Boolean))delete window.__mapHandlers[type]}},resize:()=>true};
      window.EditPolygonGIS={getEditableLayers:()=>[layer],getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,runProcessingRequest:async()=>{window.__runCalls++;return{kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]}},cancelProcessing:()=>true};
    }""")
    page.add_style_tag(path=str(CSS));page.add_script_tag(path=str(JS));page.evaluate("window.EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',toolId:'simplify',api:window.EditPolygonGIS})")
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    assert page.locator('.gis-processing-browser').count()==0
    assert page.locator('.gis-processing-preview-mode-head').count()==1
    assert page.locator('#gisDataModal').evaluate("e=>getComputedStyle(e).pointerEvents")=='none'
    assert page.evaluate('window.__setCalls')>=1 and page.evaluate('window.__overlay.items.length')==1
    before=page.evaluate('window.__setCalls')
    assert page.evaluate("typeof window.__mapHandlers.zoomend")=='function'
    page.evaluate("window.__overlay.present=false;window.__overlay.items=[];window.__mapHandlers.zoomend();setTimeout(()=>{window.__overlay.present=false;window.__overlay.items=[];},50)")
    page.wait_for_timeout(230)
    assert page.evaluate('window.__overlay.present') is True
    assert page.evaluate('window.__overlay.items.length')==1
    assert page.evaluate('window.__setCalls')>before and page.evaluate('window.__addCalls')>=1
    page.locator('[data-processing-action="back-to-toolbox"]').click()
    assert not page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    assert page.locator('.gis-processing-browser').count()==1
    assert page.evaluate('window.__overlay.items.length')==1,'returning to the Toolbox must preserve the current preview'
    # This fixture intentionally constrains the modal height; invoke the visible control directly
    # rather than making pointer geometry part of this lifecycle regression.
    page.locator('[data-processing-action="preview"]').evaluate("e=>e.click()");page.wait_for_selector('.gis-processing-preview')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    page.locator('[data-processing-action="run"]').click();page.wait_for_selector('.gis-processing-result')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')"),'committing from Preview Mode must stay on the map'
    assert page.evaluate('window.__runCalls')==1
    assert 'Processing completed' in page.locator('.gis-processing-result').inner_text()
    assert not errors,errors
    browser.close()
print('Processing map preview mode browser smoke test passed.')
