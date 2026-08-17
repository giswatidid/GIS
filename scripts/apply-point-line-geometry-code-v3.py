from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / 'docs/assets/editpolygon-app.js'
CHANGELOG_PATH = ROOT / 'CHANGELOG.md'
STATIC_TEST_PATH = ROOT / 'tests/point-line-geometry-code-v2.test.mjs'
BROWSER_TEST_PATH = ROOT / 'tests/browser-point-line-geometry-code-v2.py'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


app = APP_PATH.read_text(encoding='utf-8')

# Keep the restored polygon Geometry-code implementation byte-for-byte untouched.
polygon_start = app.index('/* v125: geometry-code editor integrated inside the core app closure. */')
polygon_end = app.index('\nshowAutosaveRecoveryIfAvailable();', polygon_start)
polygon_before = app[polygon_start:polygon_end]

app = replace_once(
    app,
    "const PLGCE_VERSION='1.0.1';",
    "const PLGCE_VERSION='1.0.2';",
    'Point/Line editor version',
)

old_summary = """    const summary=details.querySelector('summary');
    summary?.addEventListener('click',()=>{PLGCE_OPEN_STATE.set(stateKey,!details.open);});
    details.addEventListener('toggle',()=>{
      PLGCE_OPEN_STATE.set(stateKey,details.open);
      if(details.open){const current=plgceCurrentRef(),fresh=plgceCurrentGeometry(current);if(current&&fresh&&PLGCE_TYPE_SET.has(fresh.type)&&current.feature.id===r.feature.id)plgceMountEditor(current,details);}
    });"""
new_summary = """    const summary=details.querySelector('summary');
    summary?.addEventListener('click',event=>{
      // The production Inspector has delegated click handlers that can rebuild the
      // selected panel. Own this accordion interaction so a Point/Line section is
      // not destroyed between the summary click and the native <details> toggle.
      event.preventDefault();
      event.stopPropagation();
      const opening=!details.open;
      details.open=opening;
      PLGCE_OPEN_STATE.set(stateKey,opening);
      if(opening){
        const current=plgceCurrentRef(),fresh=plgceCurrentGeometry(current);
        if(current&&fresh&&PLGCE_TYPE_SET.has(fresh.type)&&current.feature.id===r.feature.id)plgceMountEditor(current,details);
      }
    });
    details.addEventListener('toggle',()=>{
      PLGCE_OPEN_STATE.set(stateKey,details.open);
      if(details.open&&!details.querySelector('.plgce-code')){const current=plgceCurrentRef(),fresh=plgceCurrentGeometry(current);if(current&&fresh&&PLGCE_TYPE_SET.has(fresh.type)&&current.feature.id===r.feature.id)plgceMountEditor(current,details);}
    });"""
app = replace_once(app, old_summary, new_summary, 'deterministic Point/Line accordion')

old_lifecycle = """  function plgceEnsureSection(){
    plgceQueued=false;
    const panel=document.getElementById('selectedPanel');if(!panel)return null;
    const r=plgceCurrentRef(),geom=plgceCurrentGeometry(r),supported=!!(r&&geom&&PLGCE_TYPE_SET.has(geom.type));
    const existing=panel.querySelector('[data-plgce-section=\"code\"]');
    if(!supported){if(existing)existing.remove();return null;}
    return existing||plgceCreateSection(r);
  }
  function plgceQueueEnsure(){if(plgceQueued)return;plgceQueued=true;Promise.resolve().then(plgceEnsureSection);}
  function plgceInstallObserver(){
    const panel=document.getElementById('selectedPanel');if(!panel)return;
    plgceObserver?.disconnect?.();plgceObserver=new MutationObserver(plgceQueueEnsure);plgceObserver.observe(panel,{childList:true,subtree:true});
    plgceQueueEnsure();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',plgceInstallObserver,{once:true});else plgceInstallObserver();
  window.addEventListener?.('editpolygon:gis-selection-changed',plgceQueueEnsure);
  window.__pointLineGeometryCodeV2=Object.freeze({version:PLGCE_VERSION,supportedTypes:[...PLGCE_TYPES],analyze:plgceAnalyze,ensureNow:plgceEnsureSection});"""
new_lifecycle = """  function plgceEnsureSection(){
    const panel=document.getElementById('selectedPanel');if(!panel)return null;
    const r=plgceCurrentRef(),geom=plgceCurrentGeometry(r),supported=!!(r&&geom&&PLGCE_TYPE_SET.has(geom.type));
    const existing=panel.querySelector('[data-plgce-section=\"code\"]');
    if(!supported){if(existing)existing.remove();return null;}
    if(existing){
      const key=plgceKey(r);
      if(existing.dataset.plgceFeatureKey===key)return existing;
      existing.remove();
    }
    return plgceCreateSection(r);
  }
  function plgceQueueEnsure(){
    if(plgceQueued)return;
    plgceQueued=true;
    const run=()=>{plgceQueued=false;plgceEnsureSection();};
    // Reconcile after the complete Inspector renderer chain, not in the middle of
    // the synchronous Point/Line wrappers that rewrite selectedPanel.
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(run));else setTimeout(run,0);
  }
  function plgceInstallObserver(){
    const root=document.getElementById('selectedSection')||document.body;if(!root)return;
    plgceObserver?.disconnect?.();
    plgceObserver=new MutationObserver(mutations=>{
      const panel=document.getElementById('selectedPanel');if(!panel)return;
      for(const mutation of mutations){
        if(mutation.target===panel||panel.contains(mutation.target)){plgceQueueEnsure();return;}
        for(const node of mutation.addedNodes||[]){if(node===panel||(node?.nodeType===1&&node.contains?.(panel))){plgceQueueEnsure();return;}}
      }
    });
    plgceObserver.observe(root,{childList:true,subtree:true});
    plgceQueueEnsure();
  }
  function plgceOpenCurrent(){
    const r=plgceCurrentRef(),geom=plgceCurrentGeometry(r);if(!r||!geom||!PLGCE_TYPE_SET.has(geom.type))return null;
    const details=plgceEnsureSection();if(!details)return null;
    PLGCE_OPEN_STATE.set(plgceKey(r),true);details.open=true;
    if(!details.querySelector('.plgce-code'))plgceMountEditor(r,details);
    return details;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',plgceInstallObserver,{once:true});else plgceInstallObserver();
  window.addEventListener?.('editpolygon:gis-selection-changed',plgceQueueEnsure);
  window.__pointLineGeometryCodeV2=Object.freeze({version:PLGCE_VERSION,supportedTypes:[...PLGCE_TYPES],analyze:plgceAnalyze,ensureNow:plgceEnsureSection,openNow:plgceOpenCurrent});"""
app = replace_once(app, old_lifecycle, new_lifecycle, 'Point/Line Inspector lifecycle')

# Mark each mounted generic section with its actual selected feature. This prevents
# a surviving section from being reused for another Point/Line selection.
old_state_key = "    const stateKey=plgceKey(r);details.open=PLGCE_OPEN_STATE.get(stateKey)===true;"
new_state_key = "    const stateKey=plgceKey(r);details.dataset.plgceFeatureKey=stateKey;details.open=PLGCE_OPEN_STATE.get(stateKey)===true;"
app = replace_once(app, old_state_key, new_state_key, 'Point/Line feature-key binding')

# The v150 wrapper is the last authoritative Inspector renderer in the live app.
# Reconcile the isolated Point/Line module here, after native Line/Point wrappers.
old_final_renderer = """  const baseRenderSelectedV150=renderSelected;
  renderSelected=function(){const out=baseRenderSelectedV150.apply(this,arguments);requestAnimationFrame(enhanceInspectorStyle);return out;};window.renderSelected=renderSelected;
"""
new_final_renderer = """  const baseRenderSelectedV150=renderSelected;
  renderSelected=function(){
    const out=baseRenderSelectedV150.apply(this,arguments);
    const reconcilePointLineGeometryCode=()=>{try{window.__pointLineGeometryCodeV2?.ensureNow?.();}catch(error){console.warn('Point/Line Geometry code Inspector reconciliation failed',error);}};
    reconcilePointLineGeometryCode();
    requestAnimationFrame(()=>{reconcilePointLineGeometryCode();enhanceInspectorStyle();});
    return out;
  };window.renderSelected=renderSelected;
"""
app = replace_once(app, old_final_renderer, new_final_renderer, 'final Inspector reconciliation')

# Assert Polygon editor was not changed by any targeted replacement above.
polygon_after = app[polygon_start:polygon_end]
if polygon_after != polygon_before:
    raise RuntimeError('Restored Polygon Geometry code block changed unexpectedly')

APP_PATH.write_text(app, encoding='utf-8')

# Static regression: the isolated module stays isolated, but the real final
# Inspector renderer is now required to reconcile it.
static = STATIC_TEST_PATH.read_text(encoding='utf-8')
static = replace_once(
    static,
    "test('retry is a separate Point/Line module and does not wrap renderSelected',()=>{\n  assert.deepEqual(plain(api.supportedTypes),['Point','MultiPoint','LineString','MultiLineString']);\n  assert.doesNotMatch(moduleCode,/renderSelected\\s*=/);\n  assert.doesNotMatch(moduleCode,/window\\.renderSelected/);\n  assert.match(moduleCode,/new MutationObserver\\(plgceQueueEnsure\\)/);\n  assert.match(moduleCode,/data-plgce-section=\"code\"/);\n});",
    "test('Point/Line module stays isolated while the final live Inspector renderer reconciles it',()=>{\n  assert.deepEqual(plain(api.supportedTypes),['Point','MultiPoint','LineString','MultiLineString']);\n  assert.doesNotMatch(moduleCode,/renderSelected\\s*=/);\n  assert.doesNotMatch(moduleCode,/window\\.renderSelected/);\n  assert.match(moduleCode,/new MutationObserver\\(/);\n  assert.match(moduleCode,/requestAnimationFrame\\(\\(\\)=>requestAnimationFrame\\(run\\)\\)/);\n  assert.match(moduleCode,/event\\.preventDefault\\(\\)/);\n  assert.match(moduleCode,/event\\.stopPropagation\\(\\)/);\n  assert.match(moduleCode,/data-plgce-section=\"code\"/);\n  assert.match(app,/__pointLineGeometryCodeV2\\?\\.ensureNow\\?\\.\\(\\)/);\n  assert.match(app,/Point\\/Line Geometry code Inspector reconciliation failed/);\n});",
    'static lifecycle regression',
)
STATIC_TEST_PATH.write_text(static, encoding='utf-8')

# Browser regression: emulate the live delegated Inspector click handler. The
# Point/Line summary must own its click and remain open instead of being rebuilt.
browser = BROWSER_TEST_PATH.read_text(encoding='utf-8')
needle = """    page.add_script_tag(content=POLYGON_EDITOR)
    page.add_script_tag(content=POINT_LINE_EDITOR)

    # Polygon regression must remain exactly usable with the new module present.
"""
replacement = """    page.add_script_tag(content=POLYGON_EDITOR)
    page.add_script_tag(content=POINT_LINE_EDITOR)
    page.evaluate(\"\"\"()=>{\n      window.__delegatedInspectorSummaryClicks=0;\n      document.getElementById('selectedPanel').addEventListener('click',event=>{\n        if(event.target.closest('[data-plgce-section=\\\"code\\\"] summary')){\n          window.__delegatedInspectorSummaryClicks++;\n          window.renderSelected();\n        }\n      });\n    }\"\"\")

    # Polygon regression must remain exactly usable with the new module present.
"""
browser = replace_once(browser, needle, replacement, 'browser delegated click setup')
needle = """    page.locator('[data-plgce-section=\"code\"] summary').click()
    page.wait_for_selector('.plgce-code')
    assert page.locator('.plgce-code').is_visible()
"""
replacement = """    page.locator('[data-plgce-section=\"code\"] summary').click()
    page.wait_for_selector('.plgce-code')
    assert page.locator('.plgce-code').is_visible()
    assert page.evaluate('__delegatedInspectorSummaryClicks') == 0
"""
browser = replace_once(browser, needle, replacement, 'Point deterministic accordion browser assertion')

# Simulate a downstream Line Inspector rebuild, then invoke the same final-stage
# reconciliation used by the production renderer. This is the failure shown in
# the live screenshot: Line previously lost the section entirely.
needle = """    page.evaluate(\"__setFeature('line-1',{type:'LineString',coordinates:[[153,-27],[154,-28]]})\")
    page.wait_for_selector('[data-plgce-section=\"code\"]')
    assert page.locator('[data-v53-section=\"code\"]').count() == 0
"""
replacement = """    page.evaluate(\"__setFeature('line-1',{type:'LineString',coordinates:[[153,-27],[154,-28]]})\")
    page.wait_for_selector('[data-plgce-section=\"code\"]')
    page.evaluate(\"window.renderSelected()\")
    assert page.locator('[data-plgce-section=\"code\"]').count() == 0
    page.evaluate(\"window.__pointLineGeometryCodeV2.ensureNow()\")
    page.wait_for_selector('[data-plgce-section=\"code\"]')
    assert page.locator('[data-v53-section=\"code\"]').count() == 0
"""
browser = replace_once(browser, needle, replacement, 'Line downstream rebuild regression')
BROWSER_TEST_PATH.write_text(browser, encoding='utf-8')

# Cache-bust all release assets together so GitHub Pages clients cannot retain
# the broken v2 runtime. Update every text occurrence to keep release tests and
# worker/runtime keys coherent.
OLD_KEY = '20260817-v1561-point-line-geometry-v2'
NEW_KEY = '20260817-v1561-point-line-geometry-v3'
updated_key_files = []
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or path == Path(__file__).resolve():
        continue
    if path.suffix.lower() not in {'.js','.mjs','.html','.css','.md','.json','.py','.yml','.yaml'}:
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    if OLD_KEY in text:
        path.write_text(text.replace(OLD_KEY, NEW_KEY), encoding='utf-8')
        updated_key_files.append(str(path.relative_to(ROOT)))
if not updated_key_files:
    raise RuntimeError('Release cache key was not found anywhere')

changelog = CHANGELOG_PATH.read_text(encoding='utf-8')
entry = "- Fixes the live Point/Line **Geometry code** integration: Point now owns its accordion interaction so delegated Inspector clicks cannot immediately rebuild it, Line is reconciled by the final authoritative Inspector renderer after native geometry-specific UI finishes, and the restored Polygon editor remains unchanged.\n"
anchor = '## v1.56.1 live-test hotfixes\n\n'
if entry not in changelog:
    if anchor not in changelog:
        raise RuntimeError('Changelog hotfix heading not found')
    changelog = changelog.replace(anchor, anchor + entry, 1)
    CHANGELOG_PATH.write_text(changelog, encoding='utf-8')

print('Applied Point/Line Geometry code v3 live hotfix.')
print('Cache-key files:', ', '.join(updated_key_files))
