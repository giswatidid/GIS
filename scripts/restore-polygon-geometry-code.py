from pathlib import Path
import subprocess

# One-shot guarded rollback: production commit occurs only after the polygon browser regression passes.
BASE='ba3afbc0235c6765f954f81b7c6fa7f94d7bd042'
OLD_KEY='20260817-v1561-geometry-code-inspector-final'
NEW_KEY='20260817-v1561-polygon-geometry-restore'


def baseline(path):
    return subprocess.check_output(['git','show',f'{BASE}:{path}'], text=True)


def replace_range(current, reference, start_marker, end_marker, label):
    cs=current.find(start_marker)
    ce=current.find(end_marker, cs)
    rs=reference.find(start_marker)
    re=reference.find(end_marker, rs)
    if min(cs,ce,rs,re) < 0:
        raise SystemExit(f'Could not locate {label} boundaries')
    return current[:cs] + reference[rs:re] + current[ce:]


# Restore only the Geometry-code subsystem from the known-good polygon baseline.
app_path=Path('docs/assets/editpolygon-app.js')
app=app_path.read_text(encoding='utf-8')
base_app=baseline(str(app_path))
app=replace_range(
    app,base_app,
    '/* v125: geometry-code editor integrated inside the core app closure. */',
    '\nshowAutosaveRecoveryIfAvailable();',
    'v125 polygon Geometry code module'
)

# Remove the failed generic Point/Line card from the legacy Inspector renderer.
generic_card='''    <details class="inspector-card gce-inspector-section gce-generic-section" data-gce-section="code">\n      <summary><strong>Geometry code</strong><span class="gce-generic-subtitle">GeoJSON · edit</span></summary>\n      <div id="gceMount"><div class="gce-note"><strong>Editable GeoJSON geometry.</strong> Open this section to inspect, validate, repair, or manually replace the selected feature geometry.</div></div>\n    </details>\n'''
app=app.replace(generic_card,'',1)

# Remove the forced final Inspector reconciliation added by the failed retrofit.
app=replace_range(
    app,base_app,
    '  const baseRenderSelectedV150=renderSelected;',
    '\n\n  cloneStylePayloadFromFeature=',
    'v150 Inspector renderer'
)
app_path.write_text(app,encoding='utf-8')

# Restore the exact polygon-only Geometry-code styling block.
css_path=Path('docs/assets/editpolygon.css')
css=css_path.read_text(encoding='utf-8')
base_css=baseline(str(css_path))
css=replace_range(
    css,base_css,
    '/* ---- v122GeometryCodeEditorStyle ---- */',
    '/* v131 progressive complex-geometry feedback',
    'polygon Geometry code styles'
)
css_path.write_text(css,encoding='utf-8')

# Fresh release key so GitHub Pages/browser caches cannot retain the broken bundle.
try:
    key_files=subprocess.check_output(['git','grep','-l',OLD_KEY], text=True).splitlines()
except subprocess.CalledProcessError:
    key_files=[]
for raw in key_files:
    p=Path(raw)
    try:s=p.read_text(encoding='utf-8')
    except UnicodeDecodeError:continue
    p.write_text(s.replace(OLD_KEY,NEW_KEY),encoding='utf-8')

# Make the current hotfix notes truthful about the rollback.
changelog=Path('CHANGELOG.md')
lines=changelog.read_text(encoding='utf-8').splitlines()
remove_prefixes=(
    '- Makes Geometry code a final-stage Inspector concern',
    '- Fixes the Geometry code Inspector lifecycle for Point/LineString',
    '- Generalises the Inspector **Geometry code** editor from polygon-only editing',
)
lines=[line for line in lines if not line.startswith(remove_prefixes)]
heading='## v1.56.1 live-test hotfixes'
try:i=lines.index(heading)
except ValueError:raise SystemExit('CHANGELOG hotfix heading not found')
note='- Restores the Inspector **Geometry code** editor to the last known-good polygon-only implementation from `ba3afbc`; the failed Point/Line retrofit and forced Inspector reconciliation are removed before Point/Line support is attempted again in isolation.'
if note not in lines:lines.insert(i+2,note)
changelog.write_text('\n'.join(lines)+'\n',encoding='utf-8')

# One-shot bootstrap files must not remain in the resulting production commit.
for ephemeral in ['.github/workflows/restore-polygon-geometry-code.yml','scripts/restore-polygon-geometry-code.py']:
    Path(ephemeral).unlink(missing_ok=True)

print('Restored known-good polygon Geometry code implementation without rolling back unrelated v1.56.1 work.')
