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
    page=browser.new_page(viewport={'width':1180,'height':820})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{--panel:#fff;--panel2:#f8fafc;--line:#d0d7de;--text:#1f2937;--muted:#667085;--soft:#f5f7fa;--accent:#1664d6}*{box-sizing:border-box}body{margin:0;font:14px Arial;color:var(--text)}button,input,select{font:inherit;border:1px solid var(--line);background:#fff;padding:7px}.primary{background:#1f2937;color:#fff}.gis-button-row{display:flex;gap:6px;margin-top:8px}#host{padding:18px;max-width:1100px;margin:auto}
    </style></head><body><div id="host"></div><div id="status" aria-live="polite"></div><script>
      window.__selection={ids:['hidden-a']};
      window.__layers=[
        {id:'source',name:'Source polygons',tableOnly:false,features:[
          {id:'hidden-a',name:'Hidden A',geometryType:'Polygon',properties:{name:'Hidden A'},filtered:false,visible:false},
          {id:'filtered-b',name:'Filtered B',geometryType:'Polygon',properties:{name:'Filtered B'},filtered:true,visible:true},
          {id:'visible-c',name:'Visible C',geometryType:'Polygon',properties:{name:'Visible C'},filtered:false,visible:true}
        ]},
        {id:'overlay',name:'Overlay polygons',tableOnly:false,features:[{id:'mask',name:'Mask',geometryType:'Polygon',properties:{name:'Mask'},filtered:false,visible:true}]}
      ];
      window.__statuses=[];window.__cancelCount=0;window.__slow=false;window.__pendingReject=null;
    </script></body></html>''')
    page.add_style_tag(path=str(ROOT/'docs/assets/gis-processing.css'))
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing-registry.js'))
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing-core.js'))
    page.add_script_tag(content='''
      window.EditPolygonGIS={
        getEditableLayers:()=>window.__layers,
        getSelection:()=>({ids:[...window.__selection.ids],count:window.__selection.ids.length,index:0}),
        previewProcessingRequest:request=>EditPolygonGISProcessingCore.preflight(request,{layers:window.__layers,selectionIds:window.__selection.ids}),
        runProcessingRequest:(request,onProgress)=>new Promise((resolve,reject)=>{
          window.__pendingReject=reject;onProgress({stage:'Preparing input',done:0,total:3,percent:0});
          setTimeout(()=>{if(window.__pendingReject!==reject)return;onProgress({stage:'Processing',done:3,total:3,percent:90});window.__pendingReject=null;resolve({output:{id:'out',name:request.output.name||'Result',features:[{id:'out1'}]},summary:{input:3,processed:3,output:1,failed:0,partial:false},failures:[],provenance:{tool:request.toolId}});},window.__slow?300:30);
        }),
        cancelProcessing:()=>{window.__cancelCount++;const reject=window.__pendingReject;window.__pendingReject=null;if(reject)reject(Error('Processing cancelled. No project data was changed.'));return true;},
        zoomLayer:id=>{window.__zoomed=id;return true;}
      };
      window.__status=(message,type)=>{window.__statuses.push([message,type]);document.getElementById('status').textContent=message;};
    ''')
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing.js'))
    page.evaluate("EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',api:EditPolygonGIS,status:window.__status,onOpenOutput:output=>window.__opened=output.id})")

    assert page.locator('[data-processing-tool]').count()==8
    assert page.locator('[data-processing-tool="buffer"]').get_attribute('class').find('active')>=0
    options=page.locator('#gisProcessingSourceScope option').all_inner_texts()
    assert 'All features (3)' in options,options
    assert 'Filtered features (2)' in options,options
    assert 'Selected features (1)' in options,options
    assert 'Layer visibility does not change processing membership.' in page.locator('.gis-processing-parameter-lock > .gis-processing-form').inner_text()

    page.locator('#gisProcessingSourceScope').select_option('filtered')
    assert '2 source features' in page.locator('.gis-processing-preflight').inner_text()
    page.locator('[data-processing-tool="clip"]').click()
    assert page.locator('#gisProcessingOverlay').count()==1
    assert page.locator('#gisProcessingOverlay').input_value()=='overlay'
    assert '1 overlay feature' in page.locator('.gis-processing-preflight').inner_text()

    page.locator('[data-processing-tool="buffer"]').click()
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_selector('.gis-processing-result')
    result=page.locator('.gis-processing-result').inner_text()
    assert 'Processing completed' in result and '1 output' in result,result
    page.locator('[data-processing-action="open-output"]').click()
    page.locator('[data-processing-action="zoom-output"]').click()
    assert page.evaluate('window.__opened')=='out'
    assert page.evaluate('window.__zoomed')=='out'

    # Cancellation is atomic at the UI contract: cancel is delegated and the user is told nothing changed.
    page.locator('[data-processing-action="run-again"]').click()
    page.evaluate('window.__slow=true')
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_selector('[data-processing-action="cancel"]:not([disabled])')
    page.locator('[data-processing-action="cancel"]').click()
    page.wait_for_timeout(30)
    assert page.evaluate('window.__cancelCount')==1
    assert 'No project data was changed' in page.locator('#status').inner_text()

    # The same toolbox remains usable at a phone-sized viewport, with touch-sized primary controls.
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(50)
    mobile=page.evaluate('''()=>({
      scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,
      runHeight:document.querySelector('[data-processing-action="run"]').getBoundingClientRect().height,
      searchWidth:document.getElementById('gisProcessingSearch').getBoundingClientRect().width,
      hostWidth:document.getElementById('host').getBoundingClientRect().width
    })''')
    assert mobile['scroll']<=mobile['client']+1,mobile
    assert mobile['runHeight']>=44,mobile
    assert mobile['searchWidth']<=mobile['hostWidth'],mobile

    assert not errors,errors
    browser.close()
print('Processing Toolbox browser smoke test passed.')
