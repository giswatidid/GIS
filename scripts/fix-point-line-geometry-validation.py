from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'docs/assets/editpolygon-app.js'
UNIT=ROOT/'tests/point-line-geometry-code-v2.test.mjs'
BROWSER=ROOT/'tests/browser-point-line-geometry-code-v2.py'
CHANGELOG=ROOT/'CHANGELOG.md'


def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old,new,1)

app=APP.read_text(encoding='utf-8')
app=replace_once(app,"const PLGCE_VERSION='1.0.3';","const PLGCE_VERSION='1.0.4';",'Point/Line Geometry-code version')
old_validation="""    try{
      if(typeof validateCollectionGeometry==='function'){
        const report=validateCollectionGeometry({type:'Feature',properties:{name:'Manual geometry'},geometry:proposal});
        for(const item of report?.issues||[]){
          const severity=item.severity||'info';
          if(severity==='error')issues.push(plgceIssue('error',item.code||'GEOMETRY_HEALTH',item.message||'Geometry Health found an error.',item.path||''));
          else if(severity==='warning')issues.push(plgceIssue('warning',item.code||'GEOMETRY_HEALTH',item.message||'Geometry Health found a warning.',item.path||''));
        }
      }
    }catch(error){issues.push(plgceIssue('warning','GEOMETRY_HEALTH_UNAVAILABLE',`Geometry Health could not complete this check: ${String(error?.message||error)}`));}
"""
new_validation="""    try{
      // Do not call the legacy in-app validateCollectionGeometry helper here.
      // That helper belongs to the polygon Geometry-code editor and interprets
      // Point/Line input as polygon geometry. Point/Line code must use the shared
      // Geometry Health core, whose validateFeature path is geometry-type aware.
      const geometryHealth=window.EditPolygonGeometryHealthCore;
      if(geometryHealth&&typeof geometryHealth.validateFeature==='function'){
        const report=geometryHealth.validateFeature({type:'Feature',id:'geometry-code-preview',properties:{name:'Manual geometry'},geometry:proposal},0,{});
        for(const item of report?.issues||[]){
          const risk=String(item.risk||item.status||'').toLowerCase();
          const severity=risk==='manual'?'error':'warning';
          const message=item.detail||item.summary||item.title||'Geometry Health found an issue.';
          issues.push(plgceIssue(severity,item.code||'GEOMETRY_HEALTH',message,item.path||''));
        }
      }
    }catch(error){issues.push(plgceIssue('warning','GEOMETRY_HEALTH_UNAVAILABLE',`Geometry Health could not complete this check: ${String(error?.message||error)}`));}
"""
app=replace_once(app,old_validation,new_validation,'Point/Line Geometry Health validation path')
APP.write_text(app,encoding='utf-8')

unit=UNIT.read_text(encoding='utf-8')
unit=replace_once(unit,
"""const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
""",
"""const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const geometryHealthCore=fs.readFileSync(new URL('../docs/assets/gis-geometry-health-core.js',import.meta.url),'utf8');
""",'unit test Geometry Health fixture')
unit=replace_once(unit,
"""    document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    validateCollectionGeometry:()=>({issues:[]}),
  };
""",
"""    document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},
    // Deliberately hostile polygon-only validator. Point/Line Geometry code must
    // never call this legacy helper.
    validateCollectionGeometry:()=>({issues:[{severity:'error',code:'LEGACY_POLYGON_VALIDATOR',message:'Legacy polygon validator was called.'}]}),
  };
""",'unit test hostile legacy validator')
unit=replace_once(unit,
"""  vm.createContext(sandbox);
  vm.runInContext(moduleCode,sandbox,{filename:'point-line-geometry-code-v2.js'});
""",
"""  vm.createContext(sandbox);
  vm.runInContext(geometryHealthCore,sandbox,{filename:'gis-geometry-health-core.js'});
  vm.runInContext(moduleCode,sandbox,{filename:'point-line-geometry-code-v2.js'});
""",'unit test shared Geometry Health load')
unit=replace_once(unit,
"""  assert.match(moduleCode,/data-plgce-section=\"code\"/);
  assert.match(app,/__pointLineGeometryCodeV2\?\.ensureNow\?\.\(\)/);
""",
"""  assert.match(moduleCode,/data-plgce-section=\"code\"/);
  assert.match(moduleCode,/EditPolygonGeometryHealthCore/);
  assert.match(moduleCode,/geometryHealth\.validateFeature/);
  assert.doesNotMatch(moduleCode,/typeof validateCollectionGeometry/);
  assert.match(app,/__pointLineGeometryCodeV2\?\.ensureNow\?\.\(\)/);
""",'unit test validation architecture assertions')
insert_after="""test('LineString and MultiLineString code validates without changing geometry family',()=>{
  const line=api.analyze('[[153,-27],[154,-28]]','LineString');
  assert.equal(line.valid,true);
  assert.deepEqual(plain(line.proposal),{type:'LineString',coordinates:[[153,-27],[154,-28]]});

  const multi=api.analyze('{\"type\":\"MultiLineString\",\"coordinates\":[[[153,-27],[154,-28]],[[150,-25],[151,-26]]]}','LineString');
  assert.equal(multi.valid,true);
  assert.equal(multi.proposal.type,'MultiLineString');
  assert.equal(multi.proposal.coordinates.length,2);
});
"""
addition=insert_after+"""

test('Point and Line validation uses type-aware Geometry Health rather than polygon-only validation',()=>{
  const point=api.analyze('{\"type\":\"Point\",\"coordinates\":[142.17575195312497,-18.823877065543243]}','Point');
  assert.equal(point.valid,true);
  assert.ok(!point.issues.some(item=>item.code==='LEGACY_POLYGON_VALIDATOR'));
  assert.ok(!point.issues.some(item=>/unsupported geometry type/i.test(item.message||'')));

  const line=api.analyze('{\"type\":\"LineString\",\"coordinates\":[[142.625947265625,-25.016656493537425],[145.438447265625,-24.717624948506227],[147.02047851562503,-22.015105167331043]]}','LineString');
  assert.equal(line.valid,true);
  assert.ok(!line.issues.some(item=>item.code==='LEGACY_POLYGON_VALIDATOR'));
  assert.ok(!line.issues.some(item=>/polygon area|open line/i.test(item.message||'')));

  const collapsed=api.analyze('{\"type\":\"LineString\",\"coordinates\":[[153,-27],[153,-27]]}','LineString');
  assert.equal(collapsed.valid,false);
  assert.ok(collapsed.issues.some(item=>item.code==='TOO_FEW_LINE_VERTICES'));
});
"""
unit=replace_once(unit,insert_after,addition,'unit type-aware validation regression')
UNIT.write_text(unit,encoding='utf-8')

browser=BROWSER.read_text(encoding='utf-8')
browser=replace_once(browser,
"""    page.locator('.plgce-code').fill('{\"type\":\"Point\",\"coordinates\":[154,-28]}')
    page.locator('[data-plgce=\"apply\"]').click()
""",
"""    page.locator('.plgce-code').fill('{\"type\":\"Point\",\"coordinates\":[154,-28]}')
    page.wait_for_function("document.querySelector('.plgce-report')?.classList.contains('ok')")
    point_report=page.locator('.plgce-report').inner_text()
    assert 'Unsupported geometry type' not in point_report, point_report
    page.locator('[data-plgce=\"apply\"]').click()
""",'browser point validation regression')
browser=replace_once(browser,
"""    page.locator('.plgce-code').fill('{\"type\":\"LineString\",\"coordinates\":[[153,-27],[155,-29],[156,-30]]}')
    page.locator('[data-plgce=\"apply\"]').click()
""",
"""    page.locator('.plgce-code').fill('{\"type\":\"LineString\",\"coordinates\":[[153,-27],[155,-29],[156,-30]]}')
    page.wait_for_function("document.querySelector('.plgce-report')?.classList.contains('ok')")
    line_report=page.locator('.plgce-report').inner_text()
    assert 'polygon area' not in line_report.lower(), line_report
    assert 'open line' not in line_report.lower(), line_report
    page.locator('[data-plgce=\"apply\"]').click()
""",'browser line validation regression')
BROWSER.write_text(browser,encoding='utf-8')

# Advance the release key consistently so GitHub Pages cannot retain the broken
# application JS while loading the new tests/runtime around it.
old_key='20260819-v1561-point-line-inspector-v4'
new_key='20260819-v1561-point-line-validation-v5'
cache_files=[
    ROOT/'docs/index.html',
    ROOT/'docs/assets/editpolygon-app.js',
    ROOT/'docs/assets/gis-processing-worker.js',
    ROOT/'scripts/audit-runtime.mjs',
    ROOT/'tests/release-cache.test.mjs',
    ROOT/'tests/gis-crs-integration.test.mjs',
    ROOT/'tests/gis-remote-source-integration.test.mjs',
    ROOT/'tests/typed-fields-integration.test.mjs',
    ROOT/'tests/render-performance.test.mjs',
    ROOT/'tests/processing-toolbox-integration.test.mjs',
]
for path in cache_files:
    text=path.read_text(encoding='utf-8')
    if old_key not in text:
        raise RuntimeError(f'cache key not found in {path.relative_to(ROOT)}')
    path.write_text(text.replace(old_key,new_key),encoding='utf-8')

changelog=CHANGELOG.read_text(encoding='utf-8')
heading='## v1.56.1 live-test hotfixes\n\n'
bullet='- Fixes Point/Line **Geometry code** validation: Point and LineString edits now use the geometry-type-aware shared Geometry Health core instead of the legacy polygon-only validator, eliminating false “Unsupported geometry type Point” and “open line / polygon area” errors while retaining real coordinate/line validity checks.\n'
if bullet not in changelog:
    changelog=replace_once(changelog,heading,heading+bullet,'changelog Point/Line validation entry')
CHANGELOG.write_text(changelog,encoding='utf-8')

print('Applied Point/Line Geometry-code validation fix and regressions.')
