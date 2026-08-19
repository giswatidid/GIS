from pathlib import Path
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

# Apply the final interactive/semantic preview layer.
v3=ROOT/'scripts/complete-processing-preview-v3.py'
exec(compile(v3.read_text(encoding='utf-8'),str(v3),'exec'),globals(),globals())

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
