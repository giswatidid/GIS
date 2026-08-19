from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=ROOT/'docs/assets/gis-processing.js'

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
    page=browser.new_page(viewport={'width':1100,'height':800})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content("""<!doctype html><html><body><div id="host"></div><div id="status"></div><script>
    const tools=[
      {id:'buffer',title:'Buffer',category:'geometry',description:'Buffer',resultKind:'layer',mutationPolicy:'new-layer',inputs:[{id:'source',label:'Input layer',families:['point','line','polygon'],scopes:['all','filtered','selected']}],parameters:[{id:'distance',label:'Distance',type:'number',default:1,required:true,min:0,nonZero:true}]},
      {id:'select-by-attribute',title:'Select by attribute',category:'selection',description:'Select',resultKind:'selection',mutationPolicy:'selection',inputs:[{id:'source',label:'Input layer',families:['point','line','polygon'],scopes:['all','filtered']}],parameters:[{id:'field',label:'Field',type:'field',required:true},{id:'operator',label:'Operator',type:'select',default:'eq',options:[{value:'eq',label:'Equals'}]},{id:'value',label:'Value',type:'text',default:''}]}
    ];
    window.EditPolygonGISProcessingRegistry={
      getTool:id=>tools.find(t=>t.id===id)||null,
      search:q=>tools.filter(t=>!q||t.title.toLowerCase().includes(q.toLowerCase())),
      getCategories:()=>[{id:'geometry',title:'Vector geometry'},{id:'selection',title:'Selection'}],
      getCategory:id=>({geometry:{title:'Vector geometry'},selection:{title:'Selection'}}[id])
    };
    const fam=t=>/Point$/i.test(t||'')?'point':/LineString$/i.test(t||'')?'line':/Polygon$/i.test(t||'')?'polygon':'other';
    function normaliseRequest(v){
      const tool=EditPolygonGISProcessingRegistry.getTool(v.toolId||'buffer');
      const inputs={};for(const d of tool.inputs){const g=v.inputs?.[d.id]||{};inputs[d.id]={layerId:g.layerId||'source',scope:g.scope||'all'};}
      const parameters={};for(const d of tool.parameters||[])parameters[d.id]=v.parameters?.[d.id]??d.default??'';
      return {toolId:tool.id,inputs,parameters,output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}};
    }
    function preflight(v,{layers,selectionIds}){
      const request=normaliseRequest(v),tool=EditPolygonGISProcessingRegistry.getTool(request.toolId),inputLayers={},inputFeatures={},counts={},errors=[];
      for(const d of tool.inputs){const layer=layers.find(x=>x.id===request.inputs[d.id].layerId);inputLayers[d.id]=layer;let fs=layer?.features||[];if(request.inputs[d.id].scope==='selected')fs=fs.filter(f=>selectionIds.includes(f.id));if(request.inputs[d.id].scope==='filtered')fs=fs.filter(f=>!f.filtered);fs=fs.filter(f=>(d.families||['point','line','polygon']).includes(fam(f.geometryType)));inputFeatures[d.id]=fs;counts[d.id]=fs.length;if(!fs.length)errors.push('No features');}
      for(const d of tool.parameters||[]){if(d.required&&(request.parameters[d.id]===''||request.parameters[d.id]==null))errors.push(d.label+' is required.');}
      return {valid:!errors.length,errors,warnings:[],request,tool,inputs:inputLayers,inputFeatures,counts:{source:counts.source||0,...counts},source:inputLayers.source};
    }
    window.EditPolygonGISProcessingCore={family:fam,normaliseRequest,defaultOutputName:(t,s)=>(s?.name||'Layer')+' — '+t.title,preflight,resolveProcessingCrs:()=> 'EPSG:4326'};
    window.__layers=[{id:'source',name:'Source',features:[
      {id:'a',geometryType:'Polygon',properties:{name:'A',kind:'x'},filtered:false},
      {id:'b',geometryType:'Polygon',properties:{name:'B',kind:'y'},filtered:false}
    ]}];
    window.__selection={ids:['a']};
    window.__clear=0;window.__cancel=0;window.__previewCalls=0;window.__runCalls=0;window.__mutations=0;window.__slow=false;
    window.EditPolygonGIS={
      getEditableLayers:()=>window.__layers,
      getSelection:()=>window.__selection,
      previewProcessingRequest:r=>preflight(r,{layers:window.__layers,selectionIds:window.__selection.ids}),
      runProcessingPreview:(r,onProgress)=>new Promise((resolve,reject)=>{
        window.__previewCalls++;window.__previewReject=reject;onProgress({stage:'Computing preview',done:0,total:2,percent:10});
        setTimeout(()=>{if(window.__previewReject!==reject)return;window.__previewReject=null;const sel=r.toolId==='select-by-attribute';resolve({kind:'preview',resultKind:sel?'selection':'layer',summary:{input:2,processed:2,output:sel?1:2,failed:0},metrics:{features:sel?1:2,vertices:sel?4:8,polygonAreaM2:100},renderedCount:sel?1:2,truncated:false,processingCrs:'EPSG:32756',elapsedMs:12,temporary:true});},window.__slow?250:20);
      }),
      clearProcessingPreview:()=>{window.__clear++;return true;},
      cancelProcessingPreview:()=>{window.__cancel++;const r=window.__previewReject;window.__previewReject=null;if(r){const e=Error('cancelled');e.processingPreviewCancelled=true;r(e);}return true;},
      runProcessingRequest:async()=>{window.__runCalls++;window.__mutations++;return {kind:'layer',output:{id:'out',name:'Result'},summary:{input:2,processed:2,output:2,failed:0},failures:[]};},
      cancelProcessing:()=>true
    };
    window.compactProjectState=()=>({files:[]});
    </script></body></html>""")
    page.add_script_tag(path=str(JS))
    page.evaluate("""EditPolygonGISProcessingUI.mount(document.getElementById('host'),{
      layerId:'source',api:EditPolygonGIS,status:(m,t)=>document.getElementById('status').textContent=m
    })""")
    assert page.locator('[data-processing-action="preview"]').inner_text()=='Preview on map'
    assert page.evaluate('window.__mutations')==0
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    text=page.locator('.gis-processing-preview').inner_text()
    assert 'Temporary preview' in text and '2 output' in text and 'EPSG:32756' in text,text
    assert page.evaluate('window.__mutations')==0
    before=page.evaluate('window.__clear')
    page.locator('[data-processing-param="distance"]').fill('2')
    page.locator('[data-processing-param="distance"]').dispatch_event('change')
    assert page.locator('.gis-processing-preview').count()==0
    assert page.evaluate('window.__clear')>before
    page.locator('[data-processing-action="back-to-toolbox"]').click()

    page.locator('[data-processing-tool="select-by-attribute"]').click()
    page.locator('[data-processing-param="field"]').select_option('kind')
    assert page.locator('[data-processing-action="preview"]').inner_text()=='Preview matches'
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    assert 'Selection matches are highlighted without changing the current selection.' in page.locator('.gis-processing-preview').inner_text()
    assert page.evaluate('window.__selection.ids')==['a']
    assert page.evaluate('window.__mutations')==0
    page.locator('[data-processing-action="back-to-toolbox"]').click()

    page.locator('[data-processing-tool="buffer"]').click()
    page.evaluate('window.__slow=true')
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('[data-processing-action="cancel"]:not([disabled])')
    page.locator('[data-processing-action="cancel"]').click()
    page.wait_for_timeout(30)
    assert page.evaluate('window.__cancel')>=1
    assert page.evaluate('window.__mutations')==0
    assert 'Project data was not changed' in page.locator('#status').inner_text()

    assert not errors,errors
    browser.close()
print('Processing preview browser smoke test passed.')
