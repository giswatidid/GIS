from pathlib import Path
import re
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]

# Existing isolated-preview unit harness supplies the fingerprint helper used by previews.
path=ROOT/'tests/processing-preview.test.mjs'
text=path.read_text(encoding='utf-8')
old="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other'\n"
new="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other',\n    previewFingerprint:()=> 'test-fingerprint'\n"
if old in text:text=text.replace(old,new,1)
elif "previewFingerprint:()=> 'test-fingerprint'" not in text:raise RuntimeError('existing preview test fingerprint mock anchor was not found')
path.write_text(text,encoding='utf-8')

# The v2 patch initially scheduled live work just by opening a tool. Remove that
# before the v3 interaction layer enforces explicit Preview activation.
path=ROOT/'docs/assets/gis-processing.js'
text=path.read_text(encoding='utf-8')
old="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();scheduleAutoPreview();}"
new="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();}"
if old in text:text=text.replace(old,new,1)
path.write_text(text,encoding='utf-8')

# The v3 source has two intentionally shared helper fragments. Make the layer/
# selection replacements sequential, and temporarily spell Snap's numeric step
# as 0.1 so the Simplify tolerance metadata has a unique exact match.
v3=ROOT/'scripts/complete-processing-preview-v3.py'
v3_source=v3.read_text(encoding='utf-8')
old_line="registry=replace_once(registry,\"previewPolicy:previewPolicy(value.previewPolicy),inputs:\",\"previewPolicy:previewPolicy(value.previewPolicy,'geometry'),inputs:\",'registry layer preview kind')"
new_line="registry=registry.replace(\"previewPolicy:previewPolicy(value.previewPolicy),inputs:\",\"previewPolicy:previewPolicy(value.previewPolicy,'geometry'),inputs:\",1)"
if old_line not in v3_source:raise RuntimeError('v3 layer preview-kind patch anchor missing')
v3_source=v3_source.replace(old_line,new_line,1)
old_line="registry=replace_once(registry,\"previewPolicy:previewPolicy(value.previewPolicy),inputs:\",\"previewPolicy:previewPolicy(value.previewPolicy,'selection'),inputs:\",'registry selection preview kind')"
new_line="registry=registry.replace(\"previewPolicy:previewPolicy(value.previewPolicy),inputs:\",\"previewPolicy:previewPolicy(value.previewPolicy,'selection'),inputs:\",1)"
if old_line not in v3_source:raise RuntimeError('v3 selection preview-kind patch anchor missing')
v3_source=v3_source.replace(old_line,new_line,1)

registry_path=ROOT/'docs/assets/gis-processing-registry.js'
registry_text=registry_path.read_text(encoding='utf-8')
snap_match=re.search(r"  layerTool\(\{id:'snap'[^\n]*",registry_text)
if not snap_match:raise RuntimeError('Snap registry line missing before v3')
snap_line=snap_match.group(0)
if "step:.1" not in snap_line:raise RuntimeError('Snap tolerance step anchor missing before v3')
registry_text=registry_text[:snap_match.start()]+snap_line.replace("step:.1","step:0.1",1)+registry_text[snap_match.end():]
registry_path.write_text(registry_text,encoding='utf-8')

exec(compile(v3_source,str(v3),'exec'),globals(),globals())

# Restore the equivalent compact spelling used throughout the registry.
registry_text=registry_path.read_text(encoding='utf-8')
snap_match=re.search(r"  layerTool\(\{id:'snap'[^\n]*",registry_text)
if not snap_match:raise RuntimeError('Snap registry line missing after v3')
snap_line=snap_match.group(0)
if "step:0.1" not in snap_line:raise RuntimeError('temporary Snap tolerance marker missing after v3')
registry_text=registry_text[:snap_match.start()]+snap_line.replace("step:0.1","step:.1",1)+registry_text[snap_match.end():]
registry_path.write_text(registry_text,encoding='utf-8')

# The preflight regression guard must now assert the intentional preview-session
# invariant: parameter/input edits preserve explicit preview activation, mark the
# old result stale, and therefore permit live refresh or an explicit Refresh preview.
preflight_test=ROOT/'tests/processing-result-preflight.test.mjs'
preflight_text=preflight_test.read_text(encoding='utf-8')
old_assert="  assert.match(source,/function invalidateResult\\(\\)\\{state\\.result=null;state\\.progress=null;clearPreviewState\\(\\{cancel:true\\}\\)/);"
new_assert="  assert.match(source,/function invalidateResult\\(\\)\\{const activated=state\\.previewActivated\\|\\|state\\.previewing\\|\\|!!state\\.previewResult;state\\.result=null;state\\.progress=null;clearPreviewState\\(\\{cancel:true,preserveActivation:activated\\}\\)/);\n  assert.match(source,/state\\.previewActivated=activated;state\\.previewStale=activated/);"
if old_assert in preflight_text:
    preflight_text=preflight_text.replace(old_assert,new_assert,1)
elif 'preserveActivation:activated' not in preflight_text:
    raise RuntimeError('processing preflight regression assertion anchor missing')
preflight_test.write_text(preflight_text,encoding='utf-8')

# Geometry previews are now deliberately labelled "Preview on map" to distinguish
# them from selection matches and data-result previews. Keep the original smoke
# test aligned with that completed UX instead of the earlier generic label.
preview_smoke=ROOT/'tests/browser-processing-preview-smoke.py'
preview_smoke_text=preview_smoke.read_text(encoding='utf-8')
old_label="assert page.locator('[data-processing-action=\"preview\"]').inner_text()=='Preview result'"
new_label="assert page.locator('[data-processing-action=\"preview\"]').inner_text()=='Preview on map'"
if old_label in preview_smoke_text:
    preview_smoke_text=preview_smoke_text.replace(old_label,new_label,1)
elif "=='Preview on map'" not in preview_smoke_text:
    raise RuntimeError('legacy processing preview button assertion anchor missing')
preview_smoke.write_text(preview_smoke_text,encoding='utf-8')

# Keep verification-only bytecode out of repository audits.
shutil.rmtree(ROOT/'scripts/__pycache__',ignore_errors=True)
shutil.rmtree(ROOT/'tests/__pycache__',ignore_errors=True)

# Publish the exact patched production/test tree to an isolated candidate ref.
subprocess.run(['git','config','user.name','github-actions[bot]'],cwd=ROOT,check=True)
subprocess.run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],cwd=ROOT,check=True)
paths=[
  'ARCHITECTURE.md','RELEASE_MANIFEST.md','docs/index.html',
  'docs/assets/editpolygon-app.js','docs/assets/gis-processing-registry.js','docs/assets/gis-processing-core.js',
  'docs/assets/gis-processing.js','docs/assets/gis-processing.css','docs/assets/gis-processing-worker.js',
  'scripts/audit-runtime.mjs','package.json','tests'
]
subprocess.run(['git','add','--',*paths],cwd=ROOT,check=True)
if not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT,text=True).strip():raise RuntimeError('interactive preview candidate contained no staged changes')
subprocess.run(['git','commit','-m','candidate: complete interactive Processing previews'],cwd=ROOT,check=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
subprocess.run(['git','push','--force','origin','HEAD:refs/heads/verify/processing-preview-candidate'],cwd=ROOT,check=True)
print(f'PROCESSING_PREVIEW_CANDIDATE={sha}')
