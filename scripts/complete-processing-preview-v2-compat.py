from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tests/processing-preview.test.mjs'
text=path.read_text(encoding='utf-8')
old="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other'\n"
new="    resolveProcessingCrs:()=> 'EPSG:32756',\n    family:type=>/Polygon$/.test(type)?'polygon':'other',\n    previewFingerprint:()=> 'test-fingerprint'\n"
count=text.count(old)
if count!=1:
    raise RuntimeError(f'existing preview test fingerprint mock: expected 1 match, found {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('Existing preview unit harness updated for fingerprinted previews.')
