from pathlib import Path

ROOT=Path('.')
OLD_KEY='20260817-v1561-geometry-code-runtime-fix'
NEW_KEY='20260817-v1561-geometry-code-inspector-final'

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: expected source text not found')
    return text.replace(old,new,1)

path=Path('docs/assets/editpolygon-app.js')
t=read(path)
t=t.replace("const VERSION='v125.2';","const VERSION='v125.3';",1)
old="""  function sectionOpenPreference(){
    try{const p=typeof v53InspectorPrefs==='function'?v53InspectorPrefs():{};return !!p.code;}catch(_){return false;}
  }
"""
new="""  function sectionOpenPreference(){
    try{const p=typeof v53InspectorPrefs==='function'?v53InspectorPrefs():{};return !!p.code;}catch(_){return false;}
  }
  function ensureGeometryCodeAction(r,details){
    if(!r||!details)return;
    const family=geometryFamily(getDisplayGeometry(r.feature)?.type);
    if(family!=='point'&&family!=='line')return;
    const panel=$g('selectedPanel');if(!panel||panel.querySelector('#gceOpenButton'))return;
    const actionCard=[...panel.querySelectorAll('.inspector-card')].find(card=>/actions|vertex editing/i.test(card.querySelector('h3')?.textContent||''));
    const host=actionCard?.querySelector('.inspector-actions')||actionCard;
    if(!host)return;
    const button=document.createElement('button');button.id='gceOpenButton';button.type='button';button.textContent='Edit geometry code';
    button.addEventListener('click',()=>{
      const current=typeof ref==='function'?ref():null;
      const currentGeometry=current&&typeof getDisplayGeometry==='function'?getDisplayGeometry(current.feature):null;
      if(!current||!editableGeometry(currentGeometry))return;
      const section=createSection(current);if(!section)return;
      section.open=true;
      try{if(typeof v53SaveInspectorPref==='function')v53SaveInspectorPref('code',true);}catch(_){ }
      mountEditor(current,section,true);
      try{section.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){ }
    });
    host.appendChild(button);
  }
"""
t=replace_once(t,old,new,'geometry action helper')
old="""    if(details.open)mountEditor(r,details);
    return details;
  }
"""
new="""    if(details.open)mountEditor(r,details);
    ensureGeometryCodeAction(r,details);
    return details;
  }
"""
t=replace_once(t,old,new,'geometry section action')
old="""  function ensureGeometryCodeSection(){
    inspectorEnsureQueued=false;
    try{
      const r=typeof ref==='function'?ref():null;
      const geom=r&&typeof getDisplayGeometry==='function'?getDisplayGeometry(r.feature):null;
      if(r&&editableGeometry(geom))createSection(r);
    }catch(err){console.warn('Geometry code inspector lifecycle check failed',err);}
  }
"""
new="""  function ensureGeometryCodeSection(){
    inspectorEnsureQueued=false;
    try{
      const r=typeof ref==='function'?ref():null;
      const geom=r&&typeof getDisplayGeometry==='function'?getDisplayGeometry(r.feature):null;
      if(r&&editableGeometry(geom))return createSection(r);
    }catch(err){console.warn('Geometry code inspector lifecycle check failed',err);}
    return null;
  }
"""
t=replace_once(t,old,new,'geometry ensure return')
old="""  const baseRenderSelectedV150=renderSelected;
  renderSelected=function(){const out=baseRenderSelectedV150.apply(this,arguments);requestAnimationFrame(enhanceInspectorStyle);return out;};window.renderSelected=renderSelected;
"""
new="""  const baseRenderSelectedV150=renderSelected;
  renderSelected=function(){
    const out=baseRenderSelectedV150.apply(this,arguments);
    try{window.__geometryCodeEditorV124?.ensureNow?.();}catch(error){console.warn('Final Geometry code Inspector reconciliation failed',error);}
    requestAnimationFrame(()=>{
      try{window.__geometryCodeEditorV124?.ensureNow?.();}catch(error){console.warn('Deferred Geometry code Inspector reconciliation failed',error);}
      enhanceInspectorStyle();
    });
    return out;
  };window.renderSelected=renderSelected;
"""
t=replace_once(t,old,new,'final inspector reconciliation')
t=t.replace(f"const PROCESSING_KEY='{OLD_KEY}';",f"const PROCESSING_KEY='{NEW_KEY}';",1)
write(path,t)

path=Path('docs/assets/editpolygon.css')
t=read(path)
needle='.gce-generic-section>#gceMount{display:grid;gap:8px;padding:0 12px 12px}\n'
rule='.gce-generic-section:not([open])>#gceMount{display:none!important}\n'
if rule not in t:
    if needle not in t: raise SystemExit('geometry-code CSS anchor missing')
    t=t.replace(needle,needle+rule,1)
write(path,t)

for rel in ['docs/index.html','docs/assets/gis-processing-worker.js']:
    path=Path(rel);t=read(path)
    if OLD_KEY not in t and NEW_KEY not in t: raise SystemExit(f'{rel}: release key missing')
    t=t.replace(OLD_KEY,NEW_KEY)
    write(path,t)

for base in [Path('scripts'),Path('tests')]:
    for path in base.rglob('*'):
        if not path.is_file(): continue
        try:t=read(path)
        except UnicodeDecodeError: continue
        if OLD_KEY in t:
            write(path,t.replace(OLD_KEY,NEW_KEY))

path=Path('tests/browser-geometry-code-smoke.py');t=read(path)
t=t.replace("""        if(window.__feature.geometry.type==='LineString'){
          const other=[...panel.querySelectorAll('.inspector-card h3')].find(h=>h.textContent==='Other');
          if(other)other.textContent='Line actions';
        }
""","""        if(window.__feature.geometry.type==='LineString'||window.__feature.geometry.type==='Point'){
          const other=[...panel.querySelectorAll('.inspector-card h3')].find(h=>h.textContent==='Other');
          if(other)other.textContent=window.__feature.geometry.type==='LineString'?'Line actions':'Point actions';
        }
""",1)
t=t.replace("""    page.evaluate("__setFeature({id:'point-1',geometry:{type:'Point',coordinates:[153,-27]},properties:{name:'Point 1'},editStack:[]})")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    point_section = page.locator('[data-gce-section=\"code\"]')
    point_section.locator('summary').click()
    page.wait_for_selector('#gceCode')
""","""    page.evaluate("__setFeature({id:'point-1',geometry:{type:'Point',coordinates:[153,-27]},properties:{name:'Point 1'},editStack:[]}); window.__geometryCodeEditorV124.ensureNow();")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    point_section = page.locator('[data-gce-section=\"code\"]')
    assert page.locator('#gceOpenButton').count() == 1
    assert page.locator('#gceMount').is_visible() is False
    page.locator('#gceOpenButton').click()
    page.wait_for_selector('#gceCode')
""",1)
t=t.replace("""    page.evaluate("window.__pointEditing=true; window.renderSelected();")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    page.locator('[data-gce-section=\"code\"] summary').click()
    page.wait_for_selector('#gceCode')
""","""    page.evaluate("window.__pointEditing=true; window.renderSelected(); window.__geometryCodeEditorV124.ensureNow();")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    page.locator('#gceOpenButton').click()
    page.wait_for_selector('#gceCode')
""",1)
t=t.replace("""    page.evaluate("__setFeature({id:'line-1',geometry:{type:'LineString',coordinates:[[153,-27],[153.5,-27.5],[154,-28]]},properties:{name:'Line 1'},editStack:[]})")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    page.locator('[data-gce-section=\"code\"] summary').click()
    page.wait_for_selector('#gceCode')
""","""    page.evaluate("__setFeature({id:'line-1',geometry:{type:'LineString',coordinates:[[153,-27],[153.5,-27.5],[154,-28]]},properties:{name:'Line 1'},editStack:[]})")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    page.evaluate("document.querySelector('[data-gce-section=\\\"code\\\"]')?.remove(); window.__geometryCodeEditorV124.ensureNow();")
    page.wait_for_selector('[data-gce-section=\"code\"]')
    assert page.locator('#gceOpenButton').count() == 1
    page.locator('#gceOpenButton').click()
    page.wait_for_selector('#gceCode')
""",1)
write(path,t)

path=Path('tests/geometry-code-editor.test.mjs');t=read(path)
needle="  assert.match(app,/ensureNow:ensureGeometryCodeSection/);\n"
extra="  assert.match(app,/button\\.id='gceOpenButton'/);\n  assert.match(app,/window\\.__geometryCodeEditorV124\\?\\.ensureNow\\?\\.\\(\\)/);\n"
if extra not in t:
    if needle not in t: raise SystemExit('geometry-code static test anchor missing')
    t=t.replace(needle,needle+extra,1)
write(path,t)

path=Path('CHANGELOG.md');t=read(path)
mark='## v1.56.1 live-test hotfixes\n\n'
entry='- Makes Geometry code a final-stage Inspector concern for Point/LineString as well as polygon features: the last Inspector renderer now reconciles the shared editor after geometry-specific panels finish, generic point/line actions expose an explicit **Edit geometry code** button, and collapsed generic accordions no longer leak partial editor metadata.\n'
if entry not in t:
    if mark not in t: raise SystemExit('CHANGELOG v1.56.1 marker missing')
    t=t.replace(mark,mark+entry,1)
write(path,t)

path=Path('RELEASE_MANIFEST.md');t=read(path)
t=t.replace('**1,674 named bindings / 196 duplicate names / 369 extra binding sites**','**1,676 named bindings / 196 duplicate names / 369 extra binding sites**')
write(path,t)

for rel in ['scripts/apply-geometry-code-inspector-final.py','.github/workflows/apply-geometry-code-inspector-final.yml']:
    p=ROOT/rel
    if p.exists(): p.unlink()

print('Applied final Geometry code Inspector integration.')
