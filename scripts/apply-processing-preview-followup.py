from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'docs/assets/gis-processing.js'
CSS=ROOT/'docs/assets/gis-processing.css'
TEST=ROOT/'tests/browser-processing-preview-map-mode-smoke.py'
OLD_KEY='20260820-v1561-processing-preview-v7'
NEW_KEY='20260820-v1561-processing-preview-v8'


def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    return text.replace(old,new,1)

js=JS.read_text(encoding='utf-8')
js=replace_once(js,
"  worker:null,job:null,jobSeq:0,token:0,overlay:null,last:null,renderItems:[],mapUnbind:null,restoreRaf:0\n",
"  worker:null,job:null,jobSeq:0,token:0,overlay:null,last:null,renderItems:[],mapUnbind:null,restoreRaf:0,restoreTimer:0\n",
'preview runtime restore state')
js=replace_once(js,
"""function schedulePreviewOverlayRestore(){
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
""",
"""function schedulePreviewOverlayRestore(){
  if(!previewRuntime.renderItems?.length)return;
  if(previewRuntime.restoreTimer){try{global.clearTimeout?.(previewRuntime.restoreTimer);}catch(_){}previewRuntime.restoreTimer=0;}
  const lateRestore=()=>{previewRuntime.restoreTimer=0;restorePreviewOverlay();};
  const restore=()=>{
    previewRuntime.restoreRaf=0;
    restorePreviewOverlay();
    previewRuntime.restoreTimer=global.setTimeout?.(lateRestore,120)||0;
  };
  if(previewRuntime.restoreRaf)return;
  if(typeof global.requestAnimationFrame==='function'){
    previewRuntime.restoreRaf=global.requestAnimationFrame(()=>{
      previewRuntime.restoreRaf=global.requestAnimationFrame(restore)||0;
    })||0;
  }else previewRuntime.restoreRaf=global.setTimeout?.(restore,0)||0;
}
function bindPreviewOverlayPersistence(){
  if(previewRuntime.mapUnbind||!global.EditPolygonMap?.on)return;
  const events='zoomstart zoomend viewreset resize';
  const off=global.EditPolygonMap.on(events,schedulePreviewOverlayRestore);
  previewRuntime.mapUnbind=typeof off==='function'?off:()=>global.EditPolygonMap?.off?.(events,schedulePreviewOverlayRestore);
}
function unbindPreviewOverlayPersistence(){
  try{previewRuntime.mapUnbind?.();}catch(_){}
  previewRuntime.mapUnbind=null;
  if(previewRuntime.restoreRaf){try{global.cancelAnimationFrame?.(previewRuntime.restoreRaf);}catch(_){}try{global.clearTimeout?.(previewRuntime.restoreRaf);}catch(_){}previewRuntime.restoreRaf=0;}
  if(previewRuntime.restoreTimer){try{global.clearTimeout?.(previewRuntime.restoreTimer);}catch(_){}previewRuntime.restoreTimer=0;}
}
""",
'zoom-safe preview overlay persistence')
js=replace_once(js,
"${progressHtml()}${previewHtml()}<div class=\"gis-processing-actions gis-processing-preview-mode-actions\">",
"${progressHtml()}${previewHtml()}${resultHtml()}<div class=\"gis-processing-actions gis-processing-preview-mode-actions\">",
'preview mode result card')
js=replace_once(js,
"""async function run(){
  if(busy())return;
  const pf=preflight();
""",
"""async function run(){
  if(busy())return;
  const stayOnMap=state.mapPreviewMode;
  const pf=preflight();
""",
'preserve preview mode during run')
js=replace_once(js,
"""    state.status?.(`${what}.${result.reused?' Used the verified preview result.':''}`,result.summary?.failed?'error':'ok');
    setMapPreviewMode(false,{renderNow:false});render();
  }catch(error){
    state.running=false;state.progress=null;setMapPreviewMode(false,{renderNow:false});state.status?.(error.message,'error');render();
""",
"""    state.status?.(`${what}.${result.reused?' Used the verified preview result.':''}`,result.summary?.failed?'error':'ok');
    setMapPreviewMode(stayOnMap,{renderNow:false});render();
  }catch(error){
    state.running=false;state.progress=null;setMapPreviewMode(stayOnMap,{renderNow:false});state.status?.(error.message,'error');render();
""",
'keep map preview open after run')
JS.write_text(js,encoding='utf-8')

css=CSS.read_text(encoding='utf-8')
marker='/* v1.56.1 map inspection preview mode */'
if css.count(marker)!=1:
    raise SystemExit(f'preview CSS marker: expected one match, found {css.count(marker)}')
css=css.split(marker,1)[0].rstrip()+"\n\n"+marker+"\n"+r'''
.gis-data-modal.gis-processing-map-preview{display:block!important;background:transparent!important;padding:0!important;pointer-events:none}
.gis-processing-map-preview .gis-data-shell{position:fixed;top:72px;right:16px;bottom:auto;left:auto;width:min(400px,calc(100vw - 32px));height:auto;max-height:calc(100vh - 96px);margin:0;border:1px solid var(--line);border-radius:2px;background:var(--panel);box-shadow:0 10px 28px rgba(15,23,42,.16);overflow:hidden;pointer-events:auto;z-index:1}
.gis-processing-map-preview .gis-data-shell>header,.gis-processing-map-preview .gis-data-shell>footer{display:none!important}
.gis-processing-map-preview .gis-data-shell>main{flex:none;max-height:calc(100vh - 100px);overflow:auto;padding:0;background:var(--panel)}
.gis-processing-map-preview .gis-processing-layout{display:block;max-width:none;margin:0}.gis-processing-map-preview .gis-processing-browser{display:none}.gis-processing-map-preview .gis-processing-config{border:0;padding:13px;background:var(--panel)}
.gis-processing-preview-mode-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--line)}.gis-processing-preview-mode-head>div{min-width:0}.gis-processing-preview-mode-head span{display:block;padding:0;background:transparent;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-size:9px;font-weight:700}.gis-processing-preview-mode-head h2{margin:3px 0 2px;font-size:18px}.gis-processing-preview-mode-head p{margin:0;color:var(--muted);font-size:10px;line-height:1.35}.gis-processing-preview-mode-head button{white-space:nowrap;font-size:10px;padding:6px 8px}
.gis-processing-preview-mode-note{margin:10px 0;padding:8px 9px;border:1px solid var(--line);background:var(--soft);display:grid;gap:2px}.gis-processing-preview-mode-note strong{font-size:10px;color:var(--text)}.gis-processing-preview-mode-note span{font-size:9px;color:var(--muted)}
.gis-processing-map-preview-panel .gis-processing-form{grid-template-columns:1fr;gap:8px}.gis-processing-map-preview-panel .gis-processing-form label{font-size:10px}.gis-processing-map-preview-panel .gis-processing-form label small{font-size:8px}.gis-processing-map-preview-panel .gis-processing-field-options{max-height:120px}.gis-processing-map-preview-panel .gis-processing-live-preview{margin-top:8px}.gis-processing-map-preview-panel .gis-processing-preflight{margin-top:8px}.gis-processing-map-preview-panel .gis-processing-progress,.gis-processing-map-preview-panel .gis-processing-result{margin-top:9px}.gis-processing-map-preview-panel .gis-processing-result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gis-processing-map-preview-panel .gis-processing-result>header{gap:6px}.gis-processing-map-preview-panel .gis-processing-result>header span{font-size:9px}.gis-processing-map-preview-panel .gis-processing-data-preview>div{max-height:150px}.gis-processing-preview-mode-actions{position:sticky;bottom:0;margin:10px -13px -13px;padding:10px 13px;background:var(--panel);border-top:1px solid var(--line);z-index:2}.gis-processing-preview-mode-actions .primary{margin-left:auto}
@media(max-width:620px){.gis-processing-map-preview .gis-data-shell{top:auto;right:8px;left:8px;bottom:8px;width:auto;max-height:min(62vh,560px);border-radius:2px}.gis-processing-map-preview .gis-data-shell>main{max-height:min(62vh,560px)}.gis-processing-preview-mode-head{align-items:flex-start}.gis-processing-preview-mode-head button{min-height:40px}.gis-processing-preview-mode-actions button{min-height:42px;flex:1}.gis-processing-preview-mode-actions .primary{margin-left:0}}
''' .lstrip()
CSS.write_text(css,encoding='utf-8')

test=TEST.read_text(encoding='utf-8')
test=replace_once(test,
"window.__setCalls=0;window.__addCalls=0;window.__restore=null;window.__overlay=null;",
"window.__setCalls=0;window.__addCalls=0;window.__mapHandlers={};window.__overlay=null;window.__runCalls=0;",
'map fixture state')
test=replace_once(test,
"window.EditPolygonMap={createVectorOverlayLayer:()=>window.__overlay={present:true,items:[]},clearVectorOverlayLayer:o=>{o.items=[];return true},setVectorOverlayFeatures:(o,items)=>{o.items=items;window.__setCalls++;return true},hasDisplayLayer:o=>!!o.present,addDisplayLayer:o=>{o.present=true;window.__addCalls++;return o},on:(types,handler)=>{window.__restore=handler;return()=>{window.__restore=null}},resize:()=>true};",
"window.EditPolygonMap={createVectorOverlayLayer:()=>window.__overlay={present:true,items:[]},clearVectorOverlayLayer:o=>{o.items=[];return true},setVectorOverlayFeatures:(o,items)=>{o.items=items;window.__setCalls++;return true},hasDisplayLayer:o=>!!o.present,addDisplayLayer:o=>{o.present=true;window.__addCalls++;return o},on:(types,handler)=>{for(const type of String(types).split(/\\s+/).filter(Boolean))window.__mapHandlers[type]=handler;return()=>{for(const type of String(types).split(/\\s+/).filter(Boolean))delete window.__mapHandlers[type]}},resize:()=>true};",
'map fixture event handlers')
test=replace_once(test,
"window.EditPolygonGIS={getEditableLayers:()=>[layer],getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,runProcessingRequest:async()=>({kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]}),cancelProcessing:()=>true};",
"window.EditPolygonGIS={getEditableLayers:()=>[layer],getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,runProcessingRequest:async()=>{window.__runCalls++;return{kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]}},cancelProcessing:()=>true};",
'run fixture counter')
test=replace_once(test,
"""    before=page.evaluate('window.__setCalls');page.evaluate("window.__overlay.present=false;window.__overlay.items=[];window.__restore()")
    page.wait_for_timeout(60)
    assert page.evaluate('window.__overlay.present') is True
    assert page.evaluate('window.__overlay.items.length')==1
    assert page.evaluate('window.__setCalls')>before and page.evaluate('window.__addCalls')>=1
""",
"""    before=page.evaluate('window.__setCalls')
    assert page.evaluate("typeof window.__mapHandlers.zoomend")=='function'
    page.evaluate("window.__overlay.present=false;window.__overlay.items=[];window.__mapHandlers.zoomend();setTimeout(()=>{window.__overlay.present=false;window.__overlay.items=[];},50)")
    page.wait_for_timeout(230)
    assert page.evaluate('window.__overlay.present') is True
    assert page.evaluate('window.__overlay.items.length')==1
    assert page.evaluate('window.__setCalls')>before and page.evaluate('window.__addCalls')>=1
""",
'late zoom redraw persistence assertion')
test=replace_once(test,
"""    assert page.evaluate('window.__overlay.items.length')==1,'returning to the Toolbox must preserve the current preview'
    assert not errors,errors
""",
"""    assert page.evaluate('window.__overlay.items.length')==1,'returning to the Toolbox must preserve the current preview'
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')")
    page.locator('[data-processing-action="run"]').click();page.wait_for_selector('.gis-processing-result')
    assert page.locator('#gisDataModal').evaluate("e=>e.classList.contains('gis-processing-map-preview')"),'committing from Preview Mode must stay on the map'
    assert page.evaluate('window.__runCalls')==1
    assert 'Processing completed' in page.locator('.gis-processing-result').inner_text()
    assert not errors,errors
""",
'run stays in map mode assertion')
TEST.write_text(test,encoding='utf-8')

changed=0
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or path==Path(__file__):
        continue
    if path.suffix.lower() not in {'.js','.mjs','.html','.md','.css','.py','.json'}:
        continue
    try:
        text=path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    count=text.count(OLD_KEY)
    if count:
        path.write_text(text.replace(OLD_KEY,NEW_KEY),encoding='utf-8')
        changed+=count
if changed<5:
    raise SystemExit(f'release cache key: expected multiple v7 references, found {changed}')

print(f'Processing preview follow-up applied; advanced {changed} release-key references.')
