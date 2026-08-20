from pathlib import Path
import os,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];JS=ROOT/'docs/assets/gis-processing.js'
def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():return configured
    for c in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        f=shutil.which(c)
        if f:return f
    return None
with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']};exe=chromium_path()
    if exe:options['executable_path']=exe
    browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1150,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content("""<!doctype html><html><body><div id=host></div><div id=status></div><script>
    const input={id:'source',label:'Input layer',families:['line'],scopes:['all']};
    const tools=[
      {id:'simplify',title:'Simplify',category:'maintenance',description:'Simplify',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'live',debounceMs:80,maxAutoFeatures:1000,metrics:[]},inputs:[input],parameters:[{id:'tolerance',label:'Tolerance (metres)',type:'number',default:1,required:true,min:0,nonZero:true,slider:{scale:'log',min:1,max:100000,labels:['1 m','10 m','100 m','1 km','10 km','100 km']}}]},
      {id:'snap',title:'Snap',category:'maintenance',description:'Snap',resultKind:'layer',mutationPolicy:'new-or-modify',previewPolicy:{enabled:true,kind:'geometry',mode:'manual',debounceMs:300,maxAutoFeatures:1000,expensive:true,metrics:[]},inputs:[input,{id:'overlay',label:'Reference layer',families:['line'],scopes:['all']}],parameters:[{id:'tolerance',label:'Tolerance',type:'number',default:1,required:true,min:0,nonZero:true}]},
      {id:'distance-to-nearest',title:'Distance to nearest',category:'spatial',description:'Distance',resultKind:'layer',mutationPolicy:'new-layer',previewPolicy:{enabled:true,kind:'data',mode:'manual',debounceMs:300,maxAutoFeatures:1000,metrics:[]},inputs:[input,{id:'overlay',label:'Candidate layer',families:['line'],scopes:['all']}],parameters:[{id:'distanceField',label:'Distance field',type:'text',default:'nearest_distance_m'}]}
    ];
    window.EditPolygonGISProcessingRegistry={getTool:id=>tools.find(t=>t.id===id)||null,search:()=>tools,getCategories:()=>[{id:'maintenance',title:'Geometry maintenance'},{id:'spatial',title:'Spatial analysis'}],getCategory:id=>({title:id==='spatial'?'Spatial analysis':'Geometry maintenance'})};
    const layers=[{id:'source',name:'Source',features:[{id:'a',geometryType:'LineString',properties:{name:'A'},filtered:false}]},{id:'ref',name:'Reference',features:[{id:'r',geometryType:'LineString',properties:{name:'R'},filtered:false}]}];
    function normaliseRequest(v){const tool=EditPolygonGISProcessingRegistry.getTool(v.toolId||'simplify'),inputs={};for(const d of tool.inputs)inputs[d.id]={layerId:v.inputs?.[d.id]?.layerId||(d.id==='source'?'source':'ref'),scope:'all'};const parameters={};for(const d of tool.parameters||[])parameters[d.id]=v.parameters?.[d.id]??d.default??'';return{toolId:tool.id,inputs,parameters,output:{mode:v.output?.mode||'new-layer',name:v.output?.name||'Result'}}}
    function preflight(v){const request=normaliseRequest(v),tool=EditPolygonGISProcessingRegistry.getTool(request.toolId),inputLayers={},features={},counts={};for(const d of tool.inputs){const layer=layers.find(l=>l.id===request.inputs[d.id].layerId);inputLayers[d.id]=layer;features[d.id]=layer.features;counts[d.id]=layer.features.length}return{valid:true,errors:[],warnings:[],request,tool,inputs:inputLayers,inputFeatures:features,counts:{source:counts.source||0,overlay:counts.overlay||0},source:inputLayers.source}}
    window.EditPolygonGISProcessingCore={family:()=> 'line',normaliseRequest,defaultOutputName:()=> 'Result',preflight,resolveProcessingCrs:()=> 'EPSG:32756',previewFingerprint:()=> 'fp'};
    window.__previewCalls=0;
    window.EditPolygonGIS={getEditableLayers:()=>layers,getSelection:()=>({ids:[]}),previewProcessingRequest:preflight,clearProcessingPreview:()=>true,cancelProcessingPreview:()=>true,cancelProcessing:()=>true,
      runProcessingPreview:async(r,onProgress)=>{window.__previewCalls++;onProgress({stage:'Preview',done:1,total:1,percent:100});const data=r.toolId==='distance-to-nearest';return{kind:'preview',resultKind:'layer',previewKind:data?'data':'geometry',summary:{input:1,processed:1,output:1,failed:0},metrics:data?{features:1,vertices:2}:{features:1,inputVertices:5,outputVertices:3,verticesRemoved:2,reductionPct:40,maxDisplacementM:r.toolId==='snap'?42:undefined,featuresUnchanged:r.toolId==='snap'?0:undefined},dataPreview:data?{fields:['nearest_distance_m'],rows:[[123.4]],totalRows:1,totalFields:1,truncated:false}:null,renderedCount:data?0:1,truncated:false,processingCrs:'EPSG:32756',elapsedMs:3,temporary:true,fingerprint:'fp',preparedResult:{kind:'layer',features:[],summary:{input:1,output:1,failed:0}}}},
      commitPreparedProcessingResult:async()=>({reused:false}),runProcessingRequest:async()=>({kind:'layer',output:{id:'o',name:'Result'},summary:{input:1,processed:1,output:1,failed:0},failures:[]})};
    </script></body></html>""")
    page.add_script_tag(path=str(JS));page.evaluate("EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',toolId:'simplify',api:EditPolygonGIS,status:m=>document.getElementById('status').textContent=m})")
    assert page.locator('[data-processing-slider="tolerance"]').count()==1
    page.locator('[data-processing-param="tolerance"]').fill('2');page.locator('[data-processing-param="tolerance"]').dispatch_event('input');page.wait_for_timeout(140)
    assert page.evaluate('window.__previewCalls')==0,'live preview must require explicit activation'
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview');before=page.evaluate('window.__previewCalls')
    page.locator('[data-processing-slider="tolerance"]').fill('800');page.locator('[data-processing-slider="tolerance"]').dispatch_event('input');page.wait_for_timeout(160);page.wait_for_selector('.gis-processing-preview')
    assert page.evaluate('window.__previewCalls')>before
    assert float(page.locator('[data-processing-param="tolerance"]').input_value())>1
    assert 'vertices removed' in page.locator('.gis-processing-preview').inner_text().lower()
    page.locator('[data-processing-action="back-to-toolbox"]').click()

    page.locator('[data-processing-tool="snap"]').click();page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-preview')
    page.locator('[data-processing-param="tolerance"]').fill('5');page.locator('[data-processing-param="tolerance"]').dispatch_event('input');page.wait_for_timeout(40)
    assert page.locator('[data-processing-action="preview"]').inner_text()=='Refresh preview'
    page.locator('[data-processing-action="back-to-toolbox"]').click()

    page.locator('[data-processing-tool="distance-to-nearest"]').click();assert page.locator('[data-processing-action="preview"]').inner_text()=='Preview data'
    page.locator('[data-processing-action="preview"]').click();page.wait_for_selector('.gis-processing-data-preview')
    text=page.locator('.gis-processing-data-preview').inner_text();assert 'nearest_distance_m' in text and '123.4' in text
    assert not errors,errors
    browser.close()
print('Processing interactive preview browser smoke test passed.')
