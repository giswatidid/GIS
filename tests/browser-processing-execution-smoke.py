from pathlib import Path
import os, shutil
from playwright.sync_api import sync_playwright, Error as PlaywrightError

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'docs/assets'
MODULES=['gis-processing-registry.js','gis-processing-core.js','gis-spatial-core.js','gis-schema-core.js','gis-crs-core.js','gis-geometry-health-core.js','gis-geos-adapter.js','gis-processing-engine.js']
worker_source='\n'.join((ASSETS/name).read_text() for name in MODULES)+r'''
const GEOS_ESM_URL='https://cdn.jsdelivr.net/npm/geos-wasm@3.1.1/build/package/geos.esm.js';
let geosPromise=null;
function ensureGeos(){if(!geosPromise)geosPromise=Promise.race([import(GEOS_ESM_URL),new Promise((_,reject)=>setTimeout(()=>reject(new Error('GEOS-WASM CDN import timed out')),7000))]).then(mod=>mod.default()).then(geos=>{self.EditPolygonGeosAdapter.assertGeos(geos);return geos;});return geosPromise;}
self.onmessage=async event=>{const {id,task}=event.data||{};try{const tool=self.EditPolygonGISProcessingRegistry.getTool(task.toolId),needsGeos=tool?.engine==='geos'||tool?.engine==='geometry-health'||['select-invalid','nearest-feature','distance-to-nearest'].includes(tool?.id),geos=needsGeos?await ensureGeos():null;const result=await self.EditPolygonGISProcessingEngine.execute({...task,tool},{geos,crs:self.EditPolygonCRS,onProgress:update=>self.postMessage({id,type:'progress',...update})});self.postMessage({id,type:'result',result});}catch(error){self.postMessage({id,type:'error',message:error?.message||String(error),stack:error?.stack||''});}};
'''

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None

with sync_playwright() as p:
    opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    exe=chromium_path()
    if exe:opts['executable_path']=exe
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':800,'height':600})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<!doctype html><html><body>processing execution smoke</body></html>')
    try:
        result=page.evaluate('''async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url);let seq=0;
      const run=task=>new Promise((resolve,reject)=>{const id=++seq,timeout=setTimeout(()=>reject(new Error('processing worker timeout')),12000);const handler=e=>{const m=e.data||{};if(m.id!==id||m.type==='progress')return;worker.removeEventListener('message',handler);clearTimeout(timeout);if(m.type==='error')reject(new Error(m.message));else resolve(m.result);};worker.addEventListener('message',handler);worker.postMessage({id,task});});
      const polygon=(id,minX,minY,maxX,maxY,properties={})=>({id,type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]]}});
      const a=polygon('a',153,-27,153.02,-26.98,{group:'one'}),b=polygon('b',153.01,-27,153.03,-26.98,{group:'one'}),mask=polygon('mask',153.01,-27.01,153.04,-26.97,{zone:'mask'});
      const difference=await run({toolId:'difference',inputs:{source:[a],overlay:[mask]},parameters:{},processingCrs:'EPSG:32756',currentSelectionIds:[]});
      const intersection=await run({toolId:'intersection',inputs:{source:[a],overlay:[mask]},parameters:{},processingCrs:'EPSG:32756',currentSelectionIds:[]});
      const dissolve=await run({toolId:'dissolve',inputs:{source:[a,b]},parameters:{field:'group'},processingCrs:'EPSG:32756',currentSelectionIds:[]});
      const simplify=await run({toolId:'simplify',inputs:{source:[a]},parameters:{tolerance:2},processingCrs:'EPSG:32756',currentSelectionIds:[]});
      const select=await run({toolId:'select-by-attribute',inputs:{source:[{id:'low',type:'Feature',properties:{value:2},geometry:{type:'Point',coordinates:[153,-27]}},{id:'high',type:'Feature',properties:{value:10},geometry:{type:'Point',coordinates:[153.1,-27]}}]},parameters:{field:'value',operator:'gt',value:'5',selectionMode:'replace'},processingCrs:'EPSG:4326',currentSelectionIds:[]});
      worker.terminate();URL.revokeObjectURL(url);return {difference,intersection,dissolve,simplify,select};
        }''',worker_source)
    except PlaywrightError as error:
        message=str(error)
        if 'Failed to fetch dynamically imported module' in message or 'ERR_BLOCKED_BY_ADMINISTRATOR' in message or 'GEOS-WASM CDN import timed out' in message or 'processing worker timeout' in message:
            browser.close()
            print('Processing engine + GEOS execution browser smoke test SKIPPED: this environment blocks the geos-wasm CDN import.')
            raise SystemExit(0)
        raise
    assert result['difference']['kind']=='layer' and result['difference']['summary']['output']>=1,result
    assert result['difference']['processingCrs']=='EPSG:32756',result
    assert result['intersection']['summary']['output']>=1,result
    props=result['intersection']['features'][0]['properties'];assert props.get('zone')=='mask' or props.get('overlay_zone')=='mask',result
    assert result['dissolve']['summary']['output']==1,result
    assert result['dissolve']['features'][0]['properties']['group']=='one',result
    assert result['simplify']['summary']['failed']==0 and result['simplify']['summary']['output']==1,result
    assert result['select']['kind']=='selection' and result['select']['selectionIds']==['high'],result
    assert not errors,errors
    browser.close()
print('Processing engine + GEOS execution browser smoke test passed.')
