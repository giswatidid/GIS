from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]

path=ROOT/'tests/processing-preview.test.mjs'
text=path.read_text(encoding='utf-8')
old="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other'\n"
new="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other',\n    previewFingerprint:()=> 'test-fingerprint'\n"
if old in text:text=text.replace(old,new,1)
elif "previewFingerprint:()=> 'test-fingerprint'" not in text:raise RuntimeError('existing preview test fingerprint mock anchor was not found')
path.write_text(text,encoding='utf-8')

path=ROOT/'docs/assets/gis-processing.js'
text=path.read_text(encoding='utf-8')
old="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();scheduleAutoPreview();}"
new="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();}"
if old in text:text=text.replace(old,new,1)
path.write_text(text,encoding='utf-8')
shutil.rmtree(ROOT/'scripts/__pycache__',ignore_errors=True);shutil.rmtree(ROOT/'tests/__pycache__',ignore_errors=True)
subprocess.run(['git','config','user.name','github-actions[bot]'],cwd=ROOT,check=True);subprocess.run(['git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com'],cwd=ROOT,check=True)
paths=['docs/assets/gis-processing-registry.js','docs/assets/gis-processing-core.js','docs/assets/editpolygon-app.js','docs/assets/gis-processing.js','docs/assets/gis-processing.css','package.json','tests']
subprocess.run(['git','add','--',*paths],cwd=ROOT,check=True)
if not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT,text=True).strip():raise RuntimeError('completion candidate contained no staged production/test changes')
subprocess.run(['git','commit','-m','candidate: complete Processing preview workflow'],cwd=ROOT,check=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip();subprocess.run(['git','push','--force','origin','HEAD:refs/heads/verify/processing-preview-candidate'],cwd=ROOT,check=True)
print(f'PROCESSING_PREVIEW_CANDIDATE={sha}')
