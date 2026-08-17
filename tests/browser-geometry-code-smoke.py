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
    page.set_content('''<!doctype html><html><body>
      <section id="selectedSection"><div id="selectedPanel"></div></section>
    </body></html>''')
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
      window.__feature={id:'point-1',geometry:{type:'Point',coordinates:[153,-27]},properties:{name:'Point 1'},editStack:[]};
      window.__file={id:'layer-1',name:'geometry-smoke.geojson',sourceFormat:'geojson'};
      window.__pointEditing=false;
      window.EditPolygonPointEditing={active:()=>window.__pointEditing};
      // Disable the editor's fallback observer/timer installers in this smoke test.
      // The regression we care about is synchronous ownership of the lexical
      // renderSelected chain used by downstream Inspector wrappers.
      window.MutationObserver=class{observe(){} disconnect(){}};
      window.requestAnimationFrame=()=>0;
      window.setTimeout=()=>0;
      window.setInterval=()=>0;
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
      function renderAll(){window.renderSelected();}
      function renderSelected(){
        const panel=document.getElementById('selectedPanel'),type=window.__feature.geometry.type;
        if(type==='Polygon'||type==='MultiPolygon'){
          panel.innerHTML='<div class="v53-inspector-shell"><details class="v53-inspector-section" data-v53-section="geometry"><summary><span class="v53-section-title"><b>Geometry</b></span></summary><div class="v53-section-body">Polygon geometry</div></details></div>';
        }else{
          panel.innerHTML='<div class="inspector-card"><h3>Geometry</h3><div>'+type+'</div></div><div class="inspector-card"><h3>Other</h3></div>';
        }
      }
      window.renderSelected=renderSelected;
      window.__setFeature=(feature)=>{window.__feature=clone(feature);ensureFeatureModel(window.__feature);window.renderSelected();};
    ''')
    page.add_script_tag(content=EDITOR)
    # Simulate the real app: point/style/reference enhancements are installed after
    # the geometry-code module and capture the lexical renderSelected function.
    # A window-only geometry-code wrapper is therefore insufficient.
    page.add_script_tag(content=r'''
      const __downstreamInspectorBase=renderSelected;
      renderSelected=function(){
        const out=__downstreamInspectorBase.apply(this,arguments);
        const panel=document.getElementById('selectedPanel');
        if(window.__feature.geometry.type==='LineString'){
          const other=[...panel.querySelectorAll('.inspector-card h3')].find(h=>h.textContent==='Other');
          if(other)other.textContent='Line actions';
        }
        return out;
      };
      window.renderSelected=renderSelected;
    ''')

    # Point: the generic Inspector gets Geometry code and applies through manual edit/history.
    page.evaluate("__setFeature({id:'point-1',geometry:{type:'Point',coordinates:[153,-27]},properties:{name:'Point 1'},editStack:[]})")
    page.wait_for_selector('[data-gce-section="code"]')
    point_section = page.locator('[data-gce-section="code"]')
    point_section.locator('summary').click()
    page.wait_for_selector('#gceCode')
    assert page.locator('.gce-meta-row').nth(1).inner_text().lower().endswith('point')
    assert '"type": "Point"' in page.locator('#gceCode').input_value()
    page.locator('#gceCode').fill('{"type":"Point","coordinates":[153.25,-27.5]}')
    page.locator('#gceApply').click()
    page.wait_for_function("__feature.geometry.coordinates[0]===153.25 && __feature.geometry.coordinates[1]===-27.5")
    point_result = page.evaluate("({geometry:__feature.geometry,history:__historyCalls.length,lastEdit:__editCalls.at(-1)})")
    assert point_result['geometry'] == {'type': 'Point', 'coordinates': [153.25, -27.5]}, point_result
    assert point_result['history'] == 1, point_result
    assert point_result['lastEdit']['type'] == 'manual', point_result
    assert point_result['lastEdit']['params']['source'] == 'geometry-code', point_result

    # A point cannot silently become a line; conversion remains a deliberate GIS operation.
    page.locator('[data-gce-section="code"] summary').click()
    page.wait_for_selector('#gceCode')
    page.locator('#gceCode').fill('{"type":"LineString","coordinates":[[153,-27],[154,-28]]}')
    page.locator('#gceApply').click()
    assert page.evaluate("__feature.geometry.type") == 'Point'
    assert page.locator('.gce-alert.error').count() == 1

    # Point graphical editing owns geometry while active, so code application is read-only.
    page.evaluate("window.__pointEditing=true; window.renderSelected();")
    page.wait_for_selector('[data-gce-section="code"]')
    page.locator('[data-gce-section="code"] summary').click()
    page.wait_for_selector('#gceCode')
    assert page.locator('#gceCode').is_editable() is False
    assert page.locator('#gceApply').is_disabled()
    page.evaluate("window.__pointEditing=false")

    # LineString: the same generic editor handles line geometry and detects a middle-vertex change.
    page.evaluate("__setFeature({id:'line-1',geometry:{type:'LineString',coordinates:[[153,-27],[153.5,-27.5],[154,-28]]},properties:{name:'Line 1'},editStack:[]})")
    page.wait_for_selector('[data-gce-section="code"]')
    page.locator('[data-gce-section="code"] summary').click()
    page.wait_for_selector('#gceCode')
    assert '"type": "LineString"' in page.locator('#gceCode').input_value()
    page.locator('#gceCode').fill('{"type":"LineString","coordinates":[[153,-27],[153.75,-27.25],[154,-28]]}')
    page.locator('#gceApply').click()
    page.wait_for_function("__feature.geometry.coordinates[1][0]===153.75")
    assert page.evaluate("__feature.geometry.coordinates[1]") == [153.75, -27.25]

    # Polygon keeps the existing v53 Inspector-host path and remains editable.
    page.evaluate("__setFeature({id:'polygon-1',geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]},properties:{name:'Polygon 1'},editStack:[]})")
    page.wait_for_selector('[data-v53-section="code"]')
    page.locator('[data-v53-section="code"] summary').click()
    page.wait_for_selector('#gceCode')
    assert '"type": "Polygon"' in page.locator('#gceCode').input_value()
    assert page.locator('[data-gce-section="code"]').count() == 0

    assert not errors, errors
    browser.close()

print('Geometry code browser smoke test passed.')
