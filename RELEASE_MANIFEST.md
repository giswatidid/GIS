# Current release manifest — v1.55.4.10

v1.55.4.10 is a focused undo/redo render-authority release on top of v1.55.4.9. Live testing showed that, despite transaction-safe editor shutdown, a selected OpenLayers feature could still display live-mutated geometry until a selection change forced another renderer pass. This release removes that implicit dual authority: native live geometry is transient pointer feedback only, while committed/history rendering is rematerialised from the project model under explicit content and ownership checks.

## Upgrade basis

Upgrade from **v1.55.4.9**.

## Files to update

- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `QUALITY_BASELINE.md`
- `README.md`
- `RELEASE_MANIFEST.md`
- `docs/assets/editpolygon-app.js`
- `docs/assets/editpolygon-map-adapter.js`
- `docs/index.html`
- `package.json`
- `scripts/audit-runtime.mjs`
- `tests/browser-map-adapter-smoke.py`
- `tests/browser-openlayers-parity-smoke.py`
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/history-render-authority.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

None.

## Files to delete

None.

## Deployment

1. Replace every file listed above.
2. Do not delete unrelated repository files.
3. Wait for GitHub Pages to finish deploying.
4. Hard-refresh the OpenLayers URL before testing.

The complete v1.55.4.10 repository ZIP can instead be used as the authoritative clean tree.
