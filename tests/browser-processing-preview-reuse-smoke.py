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
    const manual={enabled:true,mode:'manual',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['features','vertices']};
    const tools=[
      {id:'buffer',title:'Buffer',category:'geometry',description:'Buffer',resultKind:'layer',mutationPolicy:'new-layer',previewPolicy:manual,inputs:[{id:'source',label:'Input layer',families:['polygon'],scopes:['all']}],parameters:[{id:'distance',label:'Distance',type:'number',default:1,required:true,min:0,nonZero:true}]},
      {id:'simplify',title:'Simplify',category:'maintenance',description:'Simplify',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,mode:'live',debounceMs:250,maxAutoFeatures:2500,expensive:false,metrics:['vertices-before','vertices-after','vertices-removed']},inputs:[{id:'source',label:'Input layer',families:['polygon'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance',type:'number',default:1,required:true,min:0,nonZero:true}]}
    ];
    window.EditPolygonGISProcessingRegistry={
      getTool:id=>tools.find(t=>t.id===id)||null,
      search:q=>tools.filter(t=>!q||t.title.toLowerCase().includes(q.toLowerCase())),
      getCategories:()=>[{id:'geometry',title:'Vector geometry'},{id:'maintenance',title:'Geometry maintenance'}],
      getCategory:id=>({geometry:{title:'Vector geometry'},maintenance:{title:'Geometry maintenance'}}[id])
    };
    const fam=t=>/Polygon$/i.test(t||'')?'polygon':'other';
    function normaliseRequest(v){
      const tool=EditPolygonGISProcessingRegistry.getTool(v.toolId||'buffer'),inputs={source:{layerId:v.inputs?.source?.layerId||'source',scope:'all'}},parameters={};
      for(const d of tool.parameters||[])parameters[d.id]=v.parameters?.[d.id]??d.default??'';
      return {toolId:tool.id,inputs,parameters,output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}};
    }
    function preflight(v){
      const request=normaliseRequest(v),tool=EditPolygonGISProcessingRegistry.getTool(request.toolId),layer=window.__layers[0],features=layer.features,errors=[];
      for(const d of tool.parameters||[])if(d.required&&(!Number(request.parameters[d.id])||Number(request.parameters[d.id])<0))errors.push(d.label+' is required.');
      return {valid:!errors.length,errors,warnings:[],request,tool,inputs:{source:layer},inputFeatures:{source:features},counts:{source:features.length,overlay:0},source:layer};
    }
    window.EditPolygonGISProcessingCore={family:fam,normaliseRequest,defaultOutputName:(t,s)=>(s?.name||'Layer')+' — '+t.title,preflight,resolveProcessingCrs:()=> 'EPSG:4326',previewFingerprint:()=> 'unused'};
    window.__layers=[{id:'source',name:'Source',features:[{id:'a',geometryType:'Polygon',properties:{name:'A'}}]}];
    window.__previewCalls=0;window.__runCalls=0;window.__preparedCalls=0;window.__mutations=0;
    window.EditPolygonGIS={
      getEditableLayers:()=>window.__layers,getSelection:()=>({ids:[]}),previewProcessingRequest:r=>preflight(r),
      runProcessingPreview:async(r,onProgress)=>{
        window.__previewCalls++;onProgress({stage:'Preview',done:1,total:1,percent:100});
        const value=Number(r.parameters.distance??r.parameters.tolerance??1),fp=r.toolId+':'+value;
        return {kind:'preview',resultKind:'layer',summary:{input:1,processed:1,output:1,failed:0},metrics:{features:1,inputVertices:4,outputVertices:r.toolId==='simplify'?3:4,verticesRemoved:r.toolId==='simplify'?1:0,reductionPct:r.toolId==='simplify'?25:0},renderedCount:1,truncated:false,processingCrs:'EPSG:4326',elapsedMs:5,temporary:true,fingerprint:fp,preparedResult:{kind:'layer',features:[{type:'Feature',id:'a',properties:{name:'A'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}],summary:{input:1,processed:1,output:1,failed:0}}};
      },
      clearProcessingPreview:()=>true,cancelProcessingPreview:()=>true,cancelProcessing:()=>true,
      commitPreparedProcessingResult:async(r,prepared,fingerprint,onProgress)=>{
        window.__preparedCalls++;
        const value=Number(r.parameters.distance??r.parameters.tolerance??1),current=r.toolId+':'+value;
        if(fingerprint!==current)return {reused:false,reason:'stale-preview'};
        window.__mutations++;onProgress({stage:'Commit preview',done:1,total:1,percent:100});
        return {kind:'layer',reused:true,output:{id:'out',name:r.output.name||'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]};
      },
      runProcessingRequest:async r=>{window.__runCalls++;window.__mutations++;return {kind:'layer',output:{id:'out2',name:r.output.name||'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]};}
    };
    </script></body></html>""")
    page.add_script_tag(path=str(JS))
    page.evaluate("""EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',api:EditPolygonGIS,status:(m,t)=>document.getElementById('status').textContent=m})""")

    # A manual preview is committed exactly once without recomputation.
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_selector('.gis-processing-result:not(.gis-processing-preview)')
    assert page.evaluate('window.__preparedCalls')==1
    assert page.evaluate('window.__runCalls')==0
    assert page.evaluate('window.__mutations')==1
    assert 'verified preview result' in page.locator('#status').inner_text().lower()

    # Once a parameter changes the preview becomes stale/cleared, so Run recomputes normally.
    page.locator('[data-processing-action="run-again"]').click()
    page.locator('[data-processing-action="preview"]').click()
    page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-param="distance"]').fill('2')
    page.locator('[data-processing-param="distance"]').dispatch_event('change')
    assert page.locator('.gis-processing-preview').count()==0
    page.locator('[data-processing-action="run"]').click()
    page.wait_for_timeout(30)
    assert page.evaluate('window.__runCalls')==1
    assert page.evaluate('window.__mutations')==2

    # Simplify opts into debounced live preview and reports comparison metrics.
    page.locator('[data-processing-tool="simplify"]').click()
    before=page.evaluate('window.__previewCalls')
    page.locator('[data-processing-param="tolerance"]').fill('3')
    page.wait_for_timeout(400)
    assert page.evaluate('window.__previewCalls')>before
    page.wait_for_selector('.gis-processing-preview')
    assert '1 vertex removed' in page.locator('.gis-processing-preview').inner_text().lower()
    assert page.locator('[data-processing-live-preview]').is_checked()
    assert not errors,errors
    browser.close()
print('Processing preview reuse/live browser smoke test passed.')
