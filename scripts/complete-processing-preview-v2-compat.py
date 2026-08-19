from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

# Existing isolated-preview unit harness now supplies the fingerprint helper used by previews.
path=ROOT/'tests/processing-preview.test.mjs'
text=path.read_text(encoding='utf-8')
old="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other'\n"
new="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other',\n    previewFingerprint:()=> 'test-fingerprint'\n"
count=text.count(old)
if count!=1:
    raise RuntimeError(f'existing preview test fingerprint mock: expected 1 match, found {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')

# Live tools preview after an actual input/scope/parameter edit, not merely when the tool is opened.
path=ROOT/'docs/assets/gis-processing.js'
text=path.read_text(encoding='utf-8')
old="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();scheduleAutoPreview();}"
new="function changeTool(id){if(busy())return;const sourceId=state.request?.inputs?.source?.layerId||state.sourceLayerId,sourceScope=state.request?.inputs?.source?.scope||state.sourceScope||'all';state.toolId=id;state.livePreview=true;state.request=defaultRequest(sourceId,id,sourceScope);invalidateResult();render();}"
count=text.count(old)
if count!=1:
    raise RuntimeError(f'live preview tool-open behaviour: expected 1 match, found {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')

print('Preview compatibility and live-preview trigger refinements applied.')
