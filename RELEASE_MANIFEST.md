# Current release manifest — v1.55.4.12

v1.55.4.12 is the second external-source performance/parity correction on top of v1.55.4.11. Deployed retesting showed that the 821-feature ecoregions layer was improved but still noticeably heavy during interaction, and the GeoServer WMS still appeared as a service card without drawing. The review found a deeper WMS map-membership mismatch and remaining avoidable large-vector interaction work. This release fixes those causes without simplifying project geometry or adding application-level OpenLayers calls.

## Upgrade basis

Upgrade from **v1.55.4.11**.

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
- `tests/wms-runtime-parity.test.mjs`

## Files to add

None.

## Files to delete

None.

## Deployment

1. Replace every file listed above.
2. Do not delete unrelated repository files.
3. Wait for GitHub Pages to finish deploying.
4. Hard-refresh the OpenLayers URL before testing.

The complete v1.55.4.12 repository ZIP can instead be used as the authoritative clean tree.
