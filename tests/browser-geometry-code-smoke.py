from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'docs/assets/editpolygon-app.js').read_text(encoding='utf-8')
START = APP.index('/* v125: geometry-code editor integrated inside the core app closure. */')
END = APP.index('\nshowAutosaveRecoveryIfAvailable();', START)
EDITOR = APP[START:END]


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
    page.set_content('<!doctype html><html><body><section id="selectedSection"><div id="selectedPanel"></div></section></body></html>')
    page.add_style_tag(path=str(ROOT / 'docs/assets/editpolygon.css'))
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-geometry-health-core.js'))
    page.add_script_tag(content=r'''
      const clone=v=>JSON.parse(JSON.stringify(v));
      const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
      const coordSame=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&Number(a[0])===Number(b[0])&&Number(a[1])===Number(b[1]);
      const coordKey=c=>Array.isArray(c)&&c.length>=2?`${Number(c[0]).toPrecision(12)},${Number(c[1]).toPrecision(12)}`:'';
      function vertexCount(g){let n=0;const walk=v=>{if(Array.isArray(v)&&v.length>=2&&!Array.isArray(v[0])&&!Array.isArray(v[1])){n++;return;}if(Array.isArray(v))v.forEach(walk);};walk(g?.coordinates);return n;}
      const metrics=()=>({area:null,perim:null,bbox:null});
      const areaLabel=()=>'';
      const lenLabel=()=>'';
      const validateCollectionGeometry=()=>({issues:[],summary:{}});
      const repairCollectionGeometry=()=>({features:[]});
      const wktToGeo=()=>{throw Error('WKT not used in this smoke test')};
      const V={active:false};
      window.__historyCalls=[];window.__editCalls=[];window.__statuses=[];
      window.__feature={id:'polygon-1',geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]},properties:{name:'Polygon 1'},editStack:[]};
      window.__file={id:'layer-1',name:'polygon-smoke.geojson',sourceFormat:'geojson'};
      window.__prefs={code:false};
      function v53InspectorPrefs(){return window.__prefs;}
      function v53SaveInspectorPref(key,value){window.__prefs[key]=!!value;}
      function ref(){return {file:window.__file,feature:window.__feature};}
      function ensureFeatureModel(f){if(!f.sourceGeometry)f.sourceGeometry=clone(f.geometry);if(!f.renderedGeometry)f.renderedGeometry=clone(f.geometry);if(!Array.isArray(f.editStack))f.editStack=[];}
      function getDisplayGeometry(f){return f.geometry;}
      function isLocked(){return false;}
      function pushHistory(ids){window.__historyCalls.push({ids:clone(ids),geometry:clone(window.__feature.geometry)});}
      function addEdit(f,type,params){f.editStack.push({type,params:clone(params)});if(type==='manual'&&params?.geometry){f.geometry=clone(params.geometry);f.renderedGeometry=clone(params.geometry);}window.__editCalls.push({type,params:clone(params)});}
      function clearFeatureCaches(){}
      function setDirty(){}
      function setStatus(message,type=''){window.__statuses.push([message,type]);}
      function logOperation(){}
      function renderSelected(){
        document.getElementById('selectedPanel').innerHTML='<div class="v53-inspector-shell"><details class="v53-inspector-section" data-v53-section="geometry" open><summary><span class="v53-section-title"><b>Geometry</b></span></summary><div class="v53-section-body">Polygon geometry</div></details></div>';
      }
      window.renderSelected=renderSelected;
      function renderAll(){window.renderSelected();}
      ensureFeatureModel(window.__feature);
    ''')
    page.add_script_tag(content=EDITOR)
    page.evaluate('window.renderSelected()')
    page.wait_for_selector('[data-v53-section="code"]')

    section='[data-v53-section="code"]'
    assert page.evaluate(f"document.querySelector('{section}').open") is False
    assert page.locator('#gceCode').count() == 0

    # Open: the original polygon editor must mount and be usable.
    page.locator(f'{section} summary').click()
    page.wait_for_selector('#gceCode')
    assert page.evaluate(f"document.querySelector('{section}').open") is True
    assert page.locator('#gceCode').is_visible()
    assert '"type": "Polygon"' in page.locator('#gceCode').input_value()

    # Apply one valid polygon code edit through the canonical history/manual-edit path.
    page.locator('#gceCode').fill('{"type":"Polygon","coordinates":[[[153,-27],[154.25,-27],[154,-28],[153,-27]]]}')
    page.locator('#gceApply').click()
    page.wait_for_function('__feature.geometry.coordinates[0][1][0]===154.25')
    result=page.evaluate('({geometry:__feature.geometry,history:__historyCalls.length,lastEdit:__editCalls.at(-1)})')
    assert result['history'] == 1, result
    assert result['lastEdit']['type'] == 'manual', result
    assert result['lastEdit']['params']['source'] == 'geometry-code', result

    # Regression: closing must actually close, and a normal Inspector rebuild must
    # not force the Geometry code section back open.
    page.locator(f'{section} summary').click()
    assert page.evaluate(f"document.querySelector('{section}').open") is False
    assert page.locator('#gceCode').is_visible() is False
    assert page.evaluate('__prefs.code') is False

    page.evaluate('window.renderSelected()')
    page.wait_for_selector(section)
    page.wait_for_timeout(50)
    assert page.evaluate(f"document.querySelector('{section}').open") is False

    # It must still reopen normally afterwards.
    page.locator(f'{section} summary').click()
    page.wait_for_selector('#gceCode')
    assert page.locator('#gceCode').is_visible()
    assert page.locator('[data-gce-section="code"]').count() == 0
    assert page.locator('#gceOpenButton').count() == 0

    assert not errors, errors
    browser.close()

print('Polygon Geometry code browser regression passed.')
