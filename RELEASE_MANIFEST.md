# Current release manifest — v1.55.4.11

v1.55.4.11 is an external-source parity and large-vector responsiveness hotfix on top of v1.55.4.10. Deployed OpenLayers testing found two blockers: a valid remote ecoregions GeoJSON loaded but made the application lag, and a GeoServer WMS source was accepted but displayed no imagery. This release fixes the source/runtime causes without simplifying imported geometry or adding application-level OpenLayers branches.

## Upgrade basis

Upgrade from **v1.55.4.10**.

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
- `tests/map-adapter.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

- `tests/wms-runtime-parity.test.mjs`

## Files to delete

None.

## Deployment

1. Replace every file listed above.
2. Add `tests/wms-runtime-parity.test.mjs`.
3. Do not delete unrelated repository files.
4. Wait for GitHub Pages to finish deploying.
5. Hard-refresh the OpenLayers URL before testing.

The complete v1.55.4.11 repository ZIP can instead be used as the authoritative clean tree.
