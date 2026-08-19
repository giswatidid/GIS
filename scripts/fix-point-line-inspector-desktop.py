from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'docs/assets/editpolygon-app.js'
CSS = ROOT / 'docs/assets/editpolygon.css'
INDEX = ROOT / 'docs/index.html'
PACKAGE = ROOT / 'package.json'
CHANGELOG = ROOT / 'CHANGELOG.md'
BROWSER_TEST = ROOT / 'tests/browser-point-line-geometry-code-v2.py'
NODE_TEST = ROOT / 'tests/point-line-inspector-layout.test.mjs'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# 1. Harden the Point/Line Geometry-code component itself. The live Inspector is
# rebuilt by several geometry-specific render layers; keep this card adjacent to
# Geometry whenever reconciliation runs rather than merely accepting any existing
# copy elsewhere in the panel.
app = APP.read_text(encoding='utf-8')
app = replace_once(app, "const PLGCE_VERSION='1.0.2';", "const PLGCE_VERSION='1.0.3';", 'Point/Line editor version')

create_marker = "  function plgceCreateSection(r){\n"
helper = """  function plgcePlaceSection(panel,details){
    if(!panel||!details)return details;
    const cards=Array.from(panel.querySelectorAll('.inspector-card')).filter(card=>card!==details);
    const geometryCard=cards.find(card=>card.querySelector('h3')?.textContent.trim()==='Geometry')||cards[0]||null;
    if(geometryCard){
      if(geometryCard.nextElementSibling!==details)geometryCard.insertAdjacentElement('afterend',details);
    }else if(panel.firstElementChild!==details){
      panel.prepend(details);
    }
    return details;
  }

"""
if 'function plgcePlaceSection(panel,details)' not in app:
    app = replace_once(app, create_marker, helper + create_marker, 'Point/Line section placement helper')

old_place = """    const cards=Array.from(panel.querySelectorAll('.inspector-card'));
    const geometryCard=cards.find(card=>card.querySelector('h3')?.textContent.trim()==='Geometry')||cards[0]||null;
    if(geometryCard)geometryCard.insertAdjacentElement('afterend',details);else panel.prepend(details);
"""
app = replace_once(app, old_place, "    plgcePlaceSection(panel,details);\n", 'Point/Line initial placement')
app = replace_once(
    app,
    "      if(existing.dataset.plgceFeatureKey===key)return existing;",
    "      if(existing.dataset.plgceFeatureKey===key)return plgcePlaceSection(panel,existing);",
    'Point/Line existing-section reconciliation',
)
APP.write_text(app, encoding='utf-8')

# 2. Fix the desktop clipping mode. The Point/Line editor is a <details> card
# inside a flex-column Inspector. It must never flex-shrink, and an opened card
# must not clip its mounted editor body. Mobile already had an independent
# scrolling Inspector, which is why this defect was desktop-biased.
css = CSS.read_text(encoding='utf-8')
css = replace_once(
    css,
    '.plgce-section{padding:0!important;overflow:hidden}',
    '.plgce-section{padding:0!important;overflow:hidden;flex:0 0 auto;min-width:0;align-self:stretch}\n.plgce-section[open]{overflow:visible}',
    'Point/Line Geometry-code layout CSS',
)
CSS.write_text(css, encoding='utf-8')

# 3. Make the browser regression assert the actual desktop failure mode as well
# as the existing functional editing path.
browser = BROWSER_TEST.read_text(encoding='utf-8')
point_anchor = """    assert page.locator('.plgce-code').is_visible()
    assert page.evaluate('__delegatedInspectorSummaryClicks') == 0
"""
point_checks = """    assert page.locator('.plgce-code').is_visible()
    point_layout=page.locator('[data-plgce-section=\"code\"]').evaluate(\"el=>({flexShrink:getComputedStyle(el).flexShrink,overflow:getComputedStyle(el).overflow,height:el.getBoundingClientRect().height,scrollHeight:el.scrollHeight})\")
    assert point_layout['flexShrink'] == '0', point_layout
    assert point_layout['overflow'] == 'visible', point_layout
    assert point_layout['height'] + 1 >= point_layout['scrollHeight'], point_layout
    assert page.evaluate('__delegatedInspectorSummaryClicks') == 0
"""
browser = replace_once(browser, point_anchor, point_checks, 'Point desktop layout browser assertion')

line_anchor = """    page.evaluate(\"window.__pointLineGeometryCodeV2.ensureNow()\")
    page.wait_for_selector('[data-plgce-section=\"code\"]')
    assert page.locator('[data-v53-section=\"code\"]').count() == 0
    page.locator('[data-plgce-section=\"code\"] summary').click()
    page.wait_for_selector('.plgce-code')
"""
line_checks = """    page.evaluate(\"window.__pointLineGeometryCodeV2.ensureNow()\")
    page.wait_for_selector('[data-plgce-section=\"code\"]')
    assert page.locator('[data-v53-section=\"code\"]').count() == 0
    line_position=page.locator('[data-plgce-section=\"code\"]').evaluate(\"el=>el.previousElementSibling?.querySelector('h3')?.textContent.trim()||''\")
    assert line_position == 'Geometry', line_position
    page.locator('[data-plgce-section=\"code\"] summary').click()
    page.wait_for_selector('.plgce-code')
    line_layout=page.locator('[data-plgce-section=\"code\"]').evaluate(\"el=>({flexShrink:getComputedStyle(el).flexShrink,overflow:getComputedStyle(el).overflow,height:el.getBoundingClientRect().height,scrollHeight:el.scrollHeight})\")
    assert line_layout['flexShrink'] == '0', line_layout
    assert line_layout['overflow'] == 'visible', line_layout
    assert line_layout['height'] + 1 >= line_layout['scrollHeight'], line_layout
"""
browser = replace_once(browser, line_anchor, line_checks, 'Line desktop layout/placement browser assertion')
BROWSER_TEST.write_text(browser, encoding='utf-8')

# 4. Add a cheap Node regression so the important DOM/CSS contracts run in the
# normal npm test suite even when browser smoke tests are not executed.
NODE_TEST.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../docs/assets/editpolygon.css',import.meta.url),'utf8');
const start=app.indexOf('/* v126-point-line-geometry-code-v2:start */');
const end=app.indexOf('/* v126-point-line-geometry-code-v2:end */',start);
assert.ok(start>=0&&end>start,'Point/Line Geometry-code module must exist');
const moduleCode=app.slice(start,end);

test('Point/Line Geometry-code card is stable in the desktop Inspector layout',()=>{
  assert.match(css,/\\.plgce-section\\{[^}]*flex:0 0 auto[^}]*align-self:stretch/);
  assert.match(css,/\\.plgce-section\\[open\\]\\{overflow:visible\\}/);
  assert.match(moduleCode,/function plgcePlaceSection\\(panel,details\\)/);
  assert.match(moduleCode,/geometryCard\\.nextElementSibling!==details/);
  assert.match(moduleCode,/return plgcePlaceSection\\(panel,existing\\)/);
});
""", encoding='utf-8')

# 5. Ensure the Point/Line browser regression is part of the documented geometry
# browser suite and of the aggregate browser smoke command.
package = PACKAGE.read_text(encoding='utf-8')
package = replace_once(
    package,
    'python tests/browser-geometry-code-smoke.py && python tests/browser-mobile-parity-smoke.py',
    'python tests/browser-geometry-code-smoke.py && python tests/browser-point-line-geometry-code-v2.py && python tests/browser-mobile-parity-smoke.py',
    'aggregate browser smoke command',
)
package = replace_once(
    package,
    '"test:browser-geometry-code": "python tests/browser-geometry-code-smoke.py"',
    '"test:browser-geometry-code": "python tests/browser-geometry-code-smoke.py && python tests/browser-point-line-geometry-code-v2.py"',
    'geometry-code browser command',
)
PACKAGE.write_text(package, encoding='utf-8')

# 6. Bust GitHub Pages/browser caches for the updated app and CSS assets.
index = INDEX.read_text(encoding='utf-8')
old_key = '20260817-v1561-point-line-geometry-v3'
new_key = '20260819-v1561-point-line-inspector-v4'
if old_key not in index:
    raise RuntimeError('index cache key not found')
index = index.replace(old_key, new_key)
INDEX.write_text(index, encoding='utf-8')

# 7. Record the fix in the live-test hotfix notes.
changelog = CHANGELOG.read_text(encoding='utf-8')
heading = '## v1.56.1 live-test hotfixes\n\n'
bullet = '- Fixes desktop Point/Line **Geometry code** Inspector rendering: the editor card no longer flex-shrinks/clips when opened, reconciliation keeps it immediately after Geometry for both Point and Line inspectors, and the browser regression now checks desktop layout as well as editing behaviour.\n'
if bullet not in changelog:
    changelog = replace_once(changelog, heading, heading + bullet, 'changelog hotfix heading')
CHANGELOG.write_text(changelog, encoding='utf-8')

print('Applied Point/Line desktop Inspector fix and regressions.')
