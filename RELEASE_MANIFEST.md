# Current release manifest — v1.55.4.2

This is the current repository update manifest. v1.55.4.2 is a focused live-parity hotfix on top of the v1.55.4 architecture baseline. It fixes editable vectors disappearing after repeated horizontal world wraps without disabling viewport culling.

## Upgrade basis

Upgrade from **v1.55.4.1**.

## Files to update

- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `QUALITY_BASELINE.md`
- `README.md`
- `RELEASE_MANIFEST.md`
- `docs/assets/editpolygon-app.js`
- `docs/assets/editpolygon-map-adapter.js`
- `docs/assets/gis-analysis-core.js`
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

- `tests/world-wrap-rendering.test.mjs`

## Files to delete

None.

## Repository actions

If applying the GitHub patch ZIP through the web UI:

1. upload/replace every file contained in the patch ZIP at repository root;
2. do not delete any files;
3. do not manually edit any code.

The complete v1.55.4.2 repository ZIP may instead be used as the authoritative clean tree.
