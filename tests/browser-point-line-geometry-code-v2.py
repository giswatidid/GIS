from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'docs/assets/editpolygon-app.js').read_text(encoding='utf-8')
POLYGON_START = APP.index('/* v125: geometry-code editor integrated inside the core app closure. */')
POLYGON_END = APP.index('\nshowAutosaveRecoveryIfAvailable();', POLYGON_START)
POLYGON_EDITOR = APP[POLYGON_START:POLYGON_END]
PL_START_MARK = '/* v126-point-line-geometry-code-v2:start */'
PL_END_MARK = '/* v126-point-line-geometry-code-v2:end */'
PL_START = APP.index(PL_START_MARK)
PL_END = APP.index(PL_END_MARK, PL_START) + len(PL_END_MARK)
POINT_LINE_EDITOR = APP[PL_START:PL_END]


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
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
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
      // Match the established Polygon smoke harness. This combined test is for
      // Inspector lifecycle/interference; Geometry Health has its own regressions.
      const validateCollectionGeometry=()=>({issues:[],summary:{}});
      const repairCollectionGeometry=()=>({features:[]});
      const wktToGeo=()=>{throw Error('WKT is not used in this smoke test')};
      const V={active:false};
      window.EditPolygonPointEditing={active:()=>false};
      window.__historyCalls=[];window.__editCalls=[];window.__statuses=[];window.__prefs={code:false};
      window.__file={id:'layer-1',name:'smoke.geojson',sourceFormat:'geojson'};
      window.__feature={id:'polygon-1',geometry:{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]},properties:{name:'Polygon 1'},editStack:[]};
      function v53InspectorPrefs(){return window.__prefs;}
      function v53SaveInspectorPref(key,value){window.__prefs[key]=!!value;}
      function ref(){return {file:window.__file,feature:window.__feature};}
      function ensureFeatureModel(f){if(!f.sourceGeometry)f.sourceGeometry=clone(f.geometry);if(!f.renderedGeometry)f.renderedGeometry=clone(f.geometry);if(!Array.isArray(f.editStack))f.editStack=[];return f;}
      function getDisplayGeometry(f){return f.geometry;}
      function isLocked(){return false;}
      function pushHistory(ids){window.__historyCalls.push({ids:clone(ids||[]),geometry:clone(window.__feature.geometry)});}
      function addEdit(f,type,params){f.editStack.push({type,params:clone(params)});if(type==='manual'&&params?.geometry){f.geometry=clone(params.geometry);f.renderedGeometry=clone(params.geometry);}window.__editCalls.push({type,params:clone(params)});}
      function clearFeatureCaches(){}
      function setDirty(){}
      function setStatus(message,type=''){window.__statuses.push([message,type]);}
      function logOperation(){}
      function renderSelected(){
        const panel=document.getElementById('selectedPanel');const geom=window.__feature.geometry;
        if(geom.type==='Polygon'||geom.type==='MultiPolygon'){
          panel.innerHTML='<div class="v53-inspector-shell"><details class="v53-inspector-section" data-v53-section="geometry" open><summary><span class="v53-section-title"><b>Geometry</b></span></summary><div class="v53-section-body">Polygon geometry</div></details></div>';
        }else{
          const family=(geom.type==='Point'||geom.type==='MultiPoint')?'Point':'Line';
          panel.innerHTML='<div class="inspector-card"><h3>Geometry</h3><div class="inspector-grid"><div>Type</div><div>'+geom.type+'</div></div></div><div class="inspector-card"><h3>'+family+' actions</h3><div class="inspector-actions"><button id="panelEditVertices">Edit '+family.toLowerCase()+'</button></div></div>';
        }
      }
      window.renderSelected=renderSelected;
      function renderAll(){window.renderSelected();}
      window.__setFeature=(id,geometry)=>{window.__feature=ensureFeatureModel({id,geometry:clone(geometry),properties:{name:id},editStack:[]});window.__historyCalls=[];window.__editCalls=[];window.__statuses=[];window.__prefs.code=false;window.renderSelected();};
      ensureFeatureModel(window.__feature);
    ''')
    page.add_script_tag(content=POLYGON_EDITOR)
    page.add_script_tag(content=POINT_LINE_EDITOR)
    page.evaluate("""()=>{
      window.__delegatedInspectorSummaryClicks=0;
      document.getElementById('selectedPanel').addEventListener('click',event=>{
        if(event.target.closest('[data-plgce-section=\"code\"] summary')){
          window.__delegatedInspectorSummaryClicks++;
          window.renderSelected();
        }
      });
    }""")

    # Polygon regression must remain exactly usable with the new module present.
    page.evaluate("__setFeature('polygon-1',{type:'Polygon',coordinates:[[[153,-27],[154,-27],[154,-28],[153,-27]]]})")
    page.wait_for_selector('[data-v53-section="code"]')
    assert page.locator('[data-plgce-section="code"]').count() == 0
    page.locator('[data-v53-section="code"] summary').click()
    page.wait_for_selector('#gceCode')
    page.wait_for_function('__prefs.code===true')
    page.locator('#gceCode').fill('{"type":"Polygon","coordinates":[[[153,-27],[154.25,-27],[154,-28],[153,-27]]]}')
    page.locator('#gceApply').click()
    page.wait_for_function('__feature.geometry.coordinates[0][1][0]===154.25')
    polygon_result=page.evaluate('({history:__historyCalls.length,lastEdit:__editCalls.at(-1)})')
    assert polygon_result['history'] == 1, polygon_result
    assert polygon_result['lastEdit']['params']['source'] == 'geometry-code', polygon_result
    page.locator('[data-v53-section="code"] summary').click()
    page.wait_for_function('__prefs.code===false')
    assert page.evaluate("document.querySelector('[data-v53-section=\"code\"]').open") is False
    page.evaluate('window.renderSelected()')
    page.wait_for_selector('[data-v53-section="code"]')
    page.wait_for_timeout(50)
    assert page.evaluate("document.querySelector('[data-v53-section=\"code\"]').open") is False

    # Point gets its own isolated generic section, can apply, and can stay closed.
    page.evaluate("__setFeature('point-1',{type:'Point',coordinates:[153,-27]})")
    page.wait_for_selector('[data-plgce-section="code"]')
    assert page.locator('[data-v53-section="code"]').count() == 0
    assert page.evaluate("document.querySelector('[data-plgce-section=\"code\"]').open") is False
    page.locator('[data-plgce-section="code"] summary').click()
    page.wait_for_selector('.plgce-code')
    assert page.locator('.plgce-code').is_visible()
    assert page.evaluate('__delegatedInspectorSummaryClicks') == 0
    page.locator('.plgce-code').fill('{"type":"Point","coordinates":[154,-28]}')
    page.locator('[data-plgce="apply"]').click()
    page.wait_for_function('__feature.geometry.type==="Point" && __feature.geometry.coordinates[0]===154 && __feature.geometry.coordinates[1]===-28')
    point_result=page.evaluate('({history:__historyCalls.length,lastEdit:__editCalls.at(-1)})')
    assert point_result['history'] == 1, point_result
    assert point_result['lastEdit']['params']['source'] == 'geometry-code-point-line-v2', point_result
    page.wait_for_selector('[data-plgce-section="code"]')
    page.wait_for_function("document.querySelector('[data-plgce-section=\"code\"]').open===true")
    page.locator('[data-plgce-section="code"] summary').click()
    page.wait_for_function("document.querySelector('[data-plgce-section=\"code\"]').open===false")
    page.evaluate('window.renderSelected()')
    page.wait_for_selector('[data-plgce-section="code"]')
    page.wait_for_timeout(50)
    assert page.evaluate("document.querySelector('[data-plgce-section=\"code\"]').open") is False

    # Line follows the same independent path and preserves line family.
    page.evaluate("__setFeature('line-1',{type:'LineString',coordinates:[[153,-27],[154,-28]]})")
    page.wait_for_selector('[data-plgce-section="code"]')
    page.evaluate("window.renderSelected()")
    assert page.locator('[data-plgce-section="code"]').count() == 0
    page.evaluate("window.__pointLineGeometryCodeV2.ensureNow()")
    page.wait_for_selector('[data-plgce-section="code"]')
    assert page.locator('[data-v53-section="code"]').count() == 0
    page.locator('[data-plgce-section="code"] summary').click()
    page.wait_for_selector('.plgce-code')
    page.locator('.plgce-code').fill('{"type":"LineString","coordinates":[[153,-27],[155,-29],[156,-30]]}')
    page.locator('[data-plgce="apply"]').click()
    page.wait_for_function('__feature.geometry.type==="LineString" && __feature.geometry.coordinates.length===3 && __feature.geometry.coordinates[1][0]===155')
    line_result=page.evaluate('({history:__historyCalls.length,lastEdit:__editCalls.at(-1)})')
    assert line_result['history'] == 1, line_result
    assert line_result['lastEdit']['params']['source'] == 'geometry-code-point-line-v2', line_result
    page.wait_for_selector('[data-plgce-section="code"]')
    page.locator('[data-plgce-section="code"] summary').click()
    page.wait_for_function("document.querySelector('[data-plgce-section=\"code\"]').open===false")
    page.evaluate('window.renderSelected()')
    page.wait_for_selector('[data-plgce-section="code"]')
    page.wait_for_timeout(50)
    assert page.evaluate("document.querySelector('[data-plgce-section=\"code\"]').open") is False

    assert not errors, errors
    browser.close()

print('Combined Polygon + Point + Line Geometry code browser regression passed.')
