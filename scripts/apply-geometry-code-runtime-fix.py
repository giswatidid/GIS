from pathlib import Path

OLD_KEY='20260817-v1561-geometry-code-hotfix'
NEW_KEY='20260817-v1561-geometry-code-runtime-fix'

def replace_once(path, old, new):
    p=Path(path); s=p.read_text(encoding='utf-8')
    if new in s and old not in s:
        return
    if old not in s:
        raise SystemExit(f'Expected text not found in {path}: {old[:120]!r}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')

def replace_all(path, old, new):
    p=Path(path); s=p.read_text(encoding='utf-8')
    if old not in s:
        if new in s:return
        raise SystemExit(f'Expected release key not found in {path}')
    p.write_text(s.replace(old,new),encoding='utf-8')

# Force every local runtime asset onto a fresh release key so browsers cannot
# reuse the half-working geometry-code bundle from the previous Pages deploy.
for path in [
    'scripts/audit-runtime.mjs','docs/index.html','tests/gis-remote-source-integration.test.mjs',
    'tests/processing-toolbox-integration.test.mjs','tests/release-cache.test.mjs',
    'tests/gis-crs-integration.test.mjs','tests/typed-fields-integration.test.mjs',
    'tests/render-performance.test.mjs','docs/assets/gis-processing-worker.js','docs/assets/editpolygon-app.js'
]:
    replace_all(path,OLD_KEY,NEW_KEY)

app='docs/assets/editpolygon-app.js'
replace_once(app,"const VERSION='v125.1';","const VERSION='v125.2';")
replace_once(app,
"""    for(const h of panel.querySelectorAll('.inspector-card h3'))if(h.textContent.trim()==='Polygon actions')h.textContent='Line actions';
    panel.querySelectorAll('#panelDeletePolygon,#deletePolygonBtn').forEach(b=>b.textContent='Delete line');""",
"""    for(const h of panel.querySelectorAll('.inspector-card h3'))if(h.textContent.trim()==='Polygon actions')h.textContent='Line actions';
    const editLineButton=panel.querySelector('#panelEditVertices');
    if(editLineButton)editLineButton.textContent=V.active?'Done editing':'Edit line';
    panel.querySelectorAll('#panelDeletePolygon,#deletePolygonBtn').forEach(b=>b.textContent='Delete line');""")
replace_once(app,
"""    btn.title=active?'Finish polygon editing':'Edit polygon';""",
"""    let selectedType='';
    try{selectedType=typeof ref==='function'?(getDisplayGeometry(ref()?.feature)?.type||''):'';}catch(_){ }
    const lineSelected=selectedType==='LineString'||selectedType==='MultiLineString';
    btn.title=active?(lineSelected?'Finish line editing':'Finish polygon editing'):(lineSelected?'Edit line':'Edit polygon');""")
replace_once(app,
"""        if(typeof setNotice==='function')setNotice('Select a polygon or line, then click <strong>Polygon</strong> or <strong>Edit polygon</strong>.');""",
"""        if(typeof setNotice==='function')setNotice('Select a polygon or line, then use the edit control for that geometry.');""")
replace_once(app,
"""  const previousRenderSelected=window.renderSelected;
  if(typeof previousRenderSelected==='function'){
    window.renderSelected=function(){
      const out=previousRenderSelected.apply(this,arguments);
      try{
        const r=typeof ref==='function'?ref():null;
        const geom=r?getDisplayGeometry(r.feature):null;
        if(r&&editableGeometry(geom))createSection(r);
      }catch(err){console.warn('Geometry code inspector could not render',err);}
      return out;
    };
  }""",
"""  /* Geometry-code rendering must wrap the authoritative lexical renderer, not
     only window.renderSelected. Later Inspector enhancements capture the lexical
     renderSelected function; wrapping only the window alias meant point/line
     renders could bypass this editor entirely or leave a half-mounted section. */
  const previousRenderSelected=renderSelected;
  if(typeof previousRenderSelected==='function'){
    const geometryCodeRenderSelected=function(){
      const out=previousRenderSelected.apply(this,arguments);
      try{
        const r=typeof ref==='function'?ref():null;
        const geom=r&&typeof getDisplayGeometry==='function'?getDisplayGeometry(r.feature):null;
        if(r&&editableGeometry(geom))createSection(r);
      }catch(err){console.warn('Geometry code inspector could not render',err);}
      return out;
    };
    renderSelected=geometryCodeRenderSelected;
    window.renderSelected=geometryCodeRenderSelected;
  }""")
replace_once(app,
"""    isEditableType:editableGeometryType,
    ensure:queueGeometryCodeSection,
    analyze:analyzeGeometryText,""",
"""    isEditableType:editableGeometryType,
    ensure:queueGeometryCodeSection,
    ensureNow:ensureGeometryCodeSection,
    analyze:analyzeGeometryText,""")

# Regression assertions: geometry-code rendering must own the lexical render
# chain that later Point/Line/Style Inspector wrappers capture.
test='tests/geometry-code-editor.test.mjs'
replace_once(test,
"test('generic Inspector host and apply path remain wired to canonical feature history/edit APIs',()=>{",
"test('generic Inspector host and apply path remain wired to the authoritative lexical renderer and canonical history APIs',()=>{")
replace_once(test,
"""  assert.match(app,/data-gce-section=\"code\"/);
  assert.match(app,/if\\(r&&editableGeometry\\(geom\\)\\)createSection\\(r\\);/);""",
"""  assert.match(app,/data-gce-section=\"code\"/);
  assert.match(app,/const previousRenderSelected=renderSelected;/);
  assert.match(app,/renderSelected=geometryCodeRenderSelected;\\s*window\\.renderSelected=geometryCodeRenderSelected;/);
  assert.match(app,/if\\(r&&editableGeometry\\(geom\\)\\)createSection\\(r\\);/);
  assert.match(app,/ensureNow:ensureGeometryCodeSection/);""")

browser='tests/browser-geometry-code-smoke.py'
replace_once(browser,
"""      window.EditPolygonPointEditing={active:()=>window.__pointEditing};
      function ref(){return {file:window.__file,feature:window.__feature};}""",
"""      window.EditPolygonPointEditing={active:()=>window.__pointEditing};
      // Disable the editor's fallback observer/timer installers in this smoke test.
      // The regression we care about is synchronous ownership of the lexical
      // renderSelected chain used by downstream Inspector wrappers.
      window.MutationObserver=class{observe(){} disconnect(){}};
      window.requestAnimationFrame=()=>0;
      window.setTimeout=()=>0;
      window.setInterval=()=>0;
      function ref(){return {file:window.__file,feature:window.__feature};}""")
replace_once(browser,
"window.__setFeature=(feature)=>{window.__feature=clone(feature);ensureFeatureModel(window.__feature);window.renderSelected();window.__gceAfterInspectorRender?.();};",
"window.__setFeature=(feature)=>{window.__feature=clone(feature);ensureFeatureModel(window.__feature);window.renderSelected();};")
replace_once(browser,
"""    page.add_script_tag(content=EDITOR)

    # Point: the generic Inspector gets Geometry code and applies through manual edit/history.""",
"""    page.add_script_tag(content=EDITOR)
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

    # Point: the generic Inspector gets Geometry code and applies through manual edit/history.""")
replace_once(browser,
'page.evaluate("window.__pointEditing=true; window.renderSelected(); window.__gceAfterInspectorRender();")',
'page.evaluate("window.__pointEditing=true; window.renderSelected();")')

changelog='CHANGELOG.md'
fix='- Fixes the Geometry code Inspector lifecycle for Point/LineString features by wrapping the authoritative lexical `renderSelected` chain instead of only the `window.renderSelected` alias. This prevents downstream Inspector wrappers from dropping the editor or leaving a partially mounted panel, and corrects the LineString action label to **Edit line**.\n'
feature='- Generalises the Inspector **Geometry code** editor from polygon-only editing to all six standard editable GeoJSON vector types: Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon. The shared editor validates through Geometry Health, keeps edits inside the selected geometry family, commits through the canonical manual-edit/history path, and preserves polygon behaviour while adding point/line support.\n'
p=Path(changelog); s=p.read_text(encoding='utf-8')
if fix not in s:
    if feature not in s: raise SystemExit('Geometry-code changelog anchor not found')
    p.write_text(s.replace(feature,fix+feature,1),encoding='utf-8')

# This bootstrap exists only to bridge the connector's text-file size limit.
# The resulting repository commit contains only the real application/test changes.
for ephemeral in ['.github/workflows/apply-geometry-code-runtime-fix.yml','scripts/apply-geometry-code-runtime-fix.py']:
    Path(ephemeral).unlink(missing_ok=True)
