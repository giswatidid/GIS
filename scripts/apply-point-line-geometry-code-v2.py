from pathlib import Path
import subprocess

BASE='ba3afbc0235c6765f954f81b7c6fa7f94d7bd042'
BRANCH_KEY='20260817-v1561-point-line-geometry-v2'
OLD_KEY='20260817-v1561-polygon-geometry-restore'
JS_START='/* v126-point-line-geometry-code-v2:start */'
JS_END='/* v126-point-line-geometry-code-v2:end */'


def baseline(path):
    return subprocess.check_output(['git','show',f'{BASE}:{path}'], text=True)


def slice_between(text,start_marker,end_marker):
    start=text.find(start_marker)
    end=text.find(end_marker,start)
    if start < 0 or end < 0:
        raise SystemExit(f'Missing guarded range: {start_marker!r} -> {end_marker!r}')
    return text[start:end]


app_path=Path('docs/assets/editpolygon-app.js')
css_path=Path('docs/assets/editpolygon.css')
app=app_path.read_text(encoding='utf-8')
css=css_path.read_text(encoding='utf-8')
base_app=baseline(str(app_path))
base_css=baseline(str(css_path))

# Guard 1: Polygon Geometry code must still be byte-for-byte the known-good baseline.
poly_start='/* v125: geometry-code editor integrated inside the core app closure. */'
poly_end='\nshowAutosaveRecoveryIfAvailable();'
if slice_between(app,poly_start,poly_end) != slice_between(base_app,poly_start,poly_end):
    raise SystemExit('Refusing Point/Line integration: the restored polygon Geometry code block no longer matches the known-good baseline.')

# Guard 2: the polygon Geometry-code CSS must also remain the known-good baseline.
css_start='/* ---- v122GeometryCodeEditorStyle ---- */'
css_end='/* v131 progressive complex-geometry feedback'
if slice_between(css,css_start,css_end) != slice_between(base_css,css_start,css_end):
    raise SystemExit('Refusing Point/Line integration: polygon Geometry-code CSS no longer matches the known-good baseline.')

# Guard 3: none of the failed integration strategy may have returned.
failed_markers=('data-gce-section="code"','gceOpenButton','Final Geometry code Inspector reconciliation failed','Deferred Geometry code Inspector reconciliation failed')
for marker in failed_markers:
    if marker in app:
        raise SystemExit(f'Refusing Point/Line integration: failed retrofit marker still exists: {marker}')
if JS_START in app or JS_END in app:
    raise SystemExit('Point/Line Geometry code v2 is already installed.')

snippet=Path('scripts/point-line-geometry-code-v2.snippet.js').read_text(encoding='utf-8').strip()
if not (snippet.startswith(JS_START) and snippet.endswith(JS_END)):
    raise SystemExit('Point/Line JavaScript snippet markers are invalid.')
node_check=Path('/tmp/point-line-geometry-code-v2.js')
node_check.write_text(snippet+'\n',encoding='utf-8')
subprocess.run(['node','--check',str(node_check)],check=True)

# Install Point/Line after the untouched polygon module. It observes Inspector DOM
# replacement instead of wrapping renderSelected, so later renderer wrappers cannot
# drop it and the module never needs to force Polygon Geometry code back open.
call_marker='showAutosaveRecoveryIfAvailable();\n;'
if app.count(call_marker)!=1:
    raise SystemExit(f'Expected one Geometry-code insertion marker, found {app.count(call_marker)}.')
app=app.replace(call_marker,'showAutosaveRecoveryIfAvailable();\n\n'+snippet+'\n;',1)
app_path.write_text(app,encoding='utf-8')

# Append namespaced Point/Line-only styles. No existing gce/v53 polygon selector is changed.
css_snippet=Path('scripts/point-line-geometry-code-v2.css').read_text(encoding='utf-8').strip()
if JS_START not in css_snippet or JS_END not in css_snippet:
    raise SystemExit('Point/Line CSS snippet markers are invalid.')
css_path.write_text(css.rstrip()+'\n\n'+css_snippet+'\n',encoding='utf-8')

# Fresh runtime key to ensure the browser cannot retain the polygon-only JavaScript/CSS bundle.
try:
    key_files=subprocess.check_output(['git','grep','-l',OLD_KEY], text=True).splitlines()
except subprocess.CalledProcessError:
    key_files=[]
if not key_files:
    raise SystemExit('Could not locate the current release cache key.')
for raw in key_files:
    p=Path(raw)
    try:text=p.read_text(encoding='utf-8')
    except UnicodeDecodeError:continue
    p.write_text(text.replace(OLD_KEY,BRANCH_KEY),encoding='utf-8')

# Document the architecture: Polygon stays on the restored v125 implementation;
# Point/Line v2 is a separate observer-driven extension.
changelog=Path('CHANGELOG.md')
lines=changelog.read_text(encoding='utf-8').splitlines()
heading='## v1.56.1 live-test hotfixes'
try:index=lines.index(heading)
except ValueError:raise SystemExit('CHANGELOG v1.56.1 heading not found.')
note='- Adds Point/Line **Geometry code** back as an isolated v2 extension: the known-good polygon editor remains unchanged, Point/Line uses its own namespaced Inspector section and validation path, and integration is MutationObserver-driven rather than another `renderSelected` wrapper.'
if note not in lines:lines.insert(index+2,note)
changelog.write_text('\n'.join(lines)+'\n',encoding='utf-8')

# One-shot branch bootstrap files are not production assets.
for ephemeral in (
    '.github/workflows/apply-point-line-geometry-code-v2.yml',
    'scripts/apply-point-line-geometry-code-v2.py',
    'scripts/point-line-geometry-code-v2.snippet.js',
    'scripts/point-line-geometry-code-v2.css',
):
    Path(ephemeral).unlink(missing_ok=True)

print('Installed isolated Point/Line Geometry code v2 while preserving the known-good Polygon editor byte-for-byte.')
