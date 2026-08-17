from pathlib import Path
import subprocess

BASE='ba3afbc0235c6765f954f81b7c6fa7f94d7bd042'
OLD_KEY='20260817-v1561-geometry-code-inspector-final'
NEW_KEY='20260817-v1561-polygon-geometry-restore'


def baseline(path):
    return subprocess.check_output(['git','show',f'{BASE}:{path}'], text=True)


def replace_range(current, reference, start_marker, end_marker, label):
    cs=current.find(start_marker)
    ce=current.find(end_marker, cs)
    rs=reference.find(start_marker)
    re=reference.find(end_marker, rs)
    if min(cs,ce,rs,re) < 0:
        raise SystemExit(f'Could not locate {label} boundaries')
    return current[:cs] + reference[rs:re] + current[ce:]


# 1. Restore the exact polygon-only Geometry code implementation from the last
# known-good baseline. Deliberately leave all later Processing Toolbox and other
# v1.56.1 work in place.
app_path=Path('docs/assets/editpolygon-app.js')
app=app_path.read_text(encoding='utf-8')
base_app=baseline(str(app_path))
module_start='/* v125: geometry-code editor integrated inside the core app closure. */'
module_end='\nshowAutosaveRecoveryIfAvailable();'
app=replace_range(app,base_app,module_start,module_end,'v125 polygon Geometry code module')

# 2. Remove the generic Point/Line Geometry code card that was added to the old
# Inspector renderer. Polygon Geometry code is owned by the v53 polygon Inspector.
generic_card='''    <details class="inspector-card gce-inspector-section gce-generic-section" data-gce-section="code">\n      <summary><strong>Geometry code</strong><span class="gce-generic-subtitle">GeoJSON · edit</span></summary>\n      <div id="gceMount"><div class="gce-note"><strong>Editable GeoJSON geometry.</strong> Open this section to inspect, validate, repair, or manually replace the selected feature geometry.</div></div>\n    </details>\n'''
if generic_card in app:
    app=app.replace(generic_card,'',1)

# 3. Restore the final Inspector/style wrapper to its known-good baseline. The
# failed Point/Line work added forced post-render reconciliation here, which is
# what could immediately reopen a polygon section after the user closed it.
v150_start='  const baseRenderSelectedV150=renderSelected;'
v150_end='\n\n  cloneStylePayloadFromFeature='
app=replace_range(app,base_app,v150_start,v150_end,'v150 Inspector renderer')
app_path.write_text(app,encoding='utf-8')

# 4. Restore the exact polygon Geometry-code CSS block. This removes generic
# accordion rules added for Point/Line while retaining all later unrelated CSS.
css_path=Path('docs/assets/editpolygon.css')
css=css_path.read_text(encoding='utf-8')
base_css=baseline(str(css_path))
css_start='/* ---- v122GeometryCodeEditorStyle ---- */'
css_end='/* v131 progressive complex-geometry feedback'
css=replace_range(css,base_css,css_start,css_end,'polygon Geometry code styles')
css_path.write_text(css,encoding='utf-8')

# 5. Force a clean browser asset refresh across the existing release-key files.
for raw in subprocess.check_output(['git','grep','-l',OLD_KEY], text=True).splitlines():
    p=Path(raw)
    try:s=p.read_text(encoding='utf-8')
    except UnicodeDecodeError:continue
    p.write_text(s.replace(OLD_KEY,NEW_KEY),encoding='utf-8')

# 6. Replace the failed all-geometry tests with regression coverage for the exact
# restored contract, including a real-browser collapse/reopen check.
Path('tests/geometry-code-editor.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');
const start=app.indexOf('/* v125: geometry-code editor integrated inside the core app closure. */');
const end=app.indexOf('\nshowAutosaveRecoveryIfAvailable();',start);
const editor=app.slice(start,end);

test('Geometry code is restored to the known-good polygon-only implementation',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(editor,/The editor accepts a Polygon or MultiPolygon geometry/);
  assert.match(editor,/Selected polygon GeoJSON geometry/);
  assert.doesNotMatch(editor,/EDITABLE_GEOMETRY_TYPES/);
  assert.doesNotMatch(editor,/geometryFamilyLabel/);
});

test('generic Point and Line Inspectors no longer receive the failed geometry-code retrofit',()=>{
  assert.doesNotMatch(app,/data-gce-section="code"/);
  assert.doesNotMatch(app,/gceOpenButton/);
  assert.doesNotMatch(app,/Final Geometry code Inspector reconciliation failed/);
});

test('polygon Geometry-code styling uses the original v53 details host without generic accordion overrides',()=>{
  assert.match(css,/v125: selected-polygon GeoJSON editor/);
  assert.match(css,/\.gce-inspector-section \.v53-section-body/);
  assert.doesNotMatch(css,/\.gce-generic-section/);
});
''',encoding='utf-8')

Path('tests/browser-geometry-code-smoke.py').write_text(r'''from pathlib import Path
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

    # This is the regression that the failed retrofit broke: closing the section
    # must actually close it and a normal Inspector rebuild must not force it open.
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
''',encoding='utf-8')

# 7. Make the current hotfix notes truthful about the rollback.
changelog=Path('CHANGELOG.md')
if changelog.exists():
    lines=changelog.read_text(encoding='utf-8').splitlines()
    remove_prefixes=(
        '- Makes Geometry code a final-stage Inspector concern',
        '- Fixes the Geometry code Inspector lifecycle for Point/LineString',
        '- Generalises the Inspector **Geometry code** editor from polygon-only editing',
    )
    lines=[line for line in lines if not line.startswith(remove_prefixes)]
    heading='## v1.56.1 live-test hotfixes'
    try:i=lines.index(heading)
    except ValueError:raise SystemExit('CHANGELOG hotfix heading not found')
    note='- Restores the Inspector **Geometry code** editor to the last known-good polygon-only implementation from `ba3afbc`; the failed Point/Line retrofit and forced Inspector reconciliation are removed before Point/Line support is attempted again in isolation.'
    if note not in lines:lines.insert(i+2,note)
    changelog.write_text('\n'.join(lines)+'\n',encoding='utf-8')

# 8. Do not leave the one-shot bootstrap machinery in the resulting repo commit.
for ephemeral in ['.github/workflows/restore-polygon-geometry-code.yml','scripts/restore-polygon-geometry-code.py']:
    Path(ephemeral).unlink(missing_ok=True)

print('Restored known-good polygon Geometry code implementation without rolling back unrelated v1.56.1 work.')
