from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def chromium_path():
    configured = os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():
        return configured
    for candidate in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'):
        found = shutil.which(candidate)
        if found:
            return found
    return None


with sync_playwright() as p:
    executable = chromium_path()
    options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    if executable:
        options['executable_path'] = executable
    browser = p.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html><body>
      <button id="validatorOpenBtn">Legacy validator</button>
      <script>
      window.__ghCalls=[];
      window.__features=[
       {type:'Feature',id:'ready-line',properties:{name:'Ready line'},geometry:{type:'LineString',coordinates:[[153,-27],[153.1,-27.1]]}},
       {type:'Feature',id:'safe-line',properties:{name:'Repeated vertex'},geometry:{type:'LineString',coordinates:[[153,-27],[153,-27],[153.1,-27.1]]}},
       {type:'Feature',id:'bowtie',properties:{name:'Crossed polygon'},geometry:{type:'Polygon',coordinates:[[[153,-27],[153.1,-26.9],[153,-26.9],[153.1,-27],[153,-27]]]}}
      ];
      </script>
    </body></html>''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-geometry-health-core.js'))
    page.add_script_tag(content='''
      const clone=v=>JSON.parse(JSON.stringify(v));
      window.EditPolygonGIS={
       getEditableLayers:()=>[{id:'layer',name:'Geometry test',count:__features.length,featureCount:__features.length,tableOnly:false,crs:'EPSG:4326'}],
       getGeometryHealthLayer:(id,{scope='all'}={})=>({id:'layer',name:'Geometry test',scope,crs:'EPSG:4326',sourceCrs:'EPSG:4326',exportCrs:'EPSG:4326',featureCount:__features.length,scopeCount:__features.length,features:clone(__features)}),
       getSelection:()=>({ids:['safe-line'],count:1,index:0}),
       getSelectedFeature:()=>({fileId:'layer',featureId:'safe-line'}),
       focusGeometryHealthIssue:(fileId,featureId,location)=>{__ghCalls.push(['focus',featureId,location]);return true;},
       previewGeometryHealthProposal:value=>{__ghCalls.push(['preview',value?.id||null]);return true;},
       clearGeometryHealthOverlay:()=>{__ghCalls.push(['clear']);return true;},
       createGeometryHealthLayer:(sourceId,collection,options)=>{__ghCalls.push(['create',sourceId,collection.features.length,options]);return {id:'output'};}
      };
      class GeometryHealthFakeWorker{
        constructor(url){this.url=url;this.onmessage=null;this.onerror=null;this.dead=false;}
        postMessage(message){Promise.resolve().then(()=>{if(this.dead)return;try{const core=window.EditPolygonGeometryHealthCore,options=message.options||{};let result;if(message.action==='validate')result=core.validateCollection(message.collection,options);else if(message.action==='repairSafe'){const repaired=core.safeRepairCollection(message.collection);result={...repaired,report:core.validateCollection(repaired.collection,options)};}else throw Error('Fake worker only covers standard validation and safe repair.');this.onmessage?.({data:{id:message.id,type:'result',result}});}catch(error){this.onmessage?.({data:{id:message.id,type:'error',error:error.message}});}});}
        terminate(){this.dead=true;}
      }
      window.Worker=GeometryHealthFakeWorker;
    ''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-geometry-health.js'))

    assert page.locator('#validatorOpenBtn').inner_text() == 'Check & fix geometry'
    page.locator('#validatorOpenBtn').click()
    page.wait_for_selector('#geometryHealthPanel.active')
    assert page.locator('text=Standard checks are designed to work without GIS topology knowledge.').count() == 1
    assert page.locator('#geometryHealthScope option[value="selected"]').is_enabled()

    page.locator('[data-gh-action="check"]').click()
    page.wait_for_function("EditPolygonGeometryHealth.getState().report?.counts?.checked === 3")
    state = page.evaluate('EditPolygonGeometryHealth.getState()')
    assert state['report']['counts']['ready'] == 1, state
    assert state['report']['counts']['safe'] == 1, state
    assert state['report']['counts']['review'] == 1, state
    assert state['report']['counts']['manual'] == 0, state
    assert page.locator('text=Boundary crosses itself').count() >= 1
    assert page.locator('[data-gh-action="safe-fix"]').is_enabled()

    page.locator('[data-gh-action="locate"]').first.click()
    assert page.evaluate("__ghCalls.some(call=>call[0]==='focus')")

    page.locator('[data-gh-action="safe-fix"]').click()
    page.wait_for_function("EditPolygonGeometryHealth.getState().safeChanges.length === 1")
    state = page.evaluate('EditPolygonGeometryHealth.getState()')
    assert state['report']['counts']['safe'] == 0, state
    assert state['report']['counts']['ready'] == 2, state
    assert state['report']['counts']['review'] == 1, state
    assert page.locator('text=Unresolved issues remain.').count() == 1

    page.locator('#geometryHealthOutputName').fill('Geometry test — repaired smoke')
    page.locator('[data-gh-action="create-layer"]').click()
    page.wait_for_function("__ghCalls.some(call=>call[0]==='create')")
    created = page.evaluate("__ghCalls.find(call=>call[0]==='create')")
    assert created[1] == 'layer'
    assert created[2] == 3
    assert created[3]['name'] == 'Geometry test — repaired smoke'
    assert created[3]['report']['afterCounts']['review'] == 1
    assert page.locator('#geometryHealthPanel').evaluate("el=>!el.classList.contains('active')")

    assert not errors, errors
    browser.close()

print('Geometry Health browser smoke test passed.')
