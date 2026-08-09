# Current release manifest — v1.55.4.1

This is the current repository update manifest. v1.55.4.1 is a focused live-parity hotfix on top of the clean v1.55.4 architecture baseline.

## Upgrade basis

Upgrade from **v1.55.4**.

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
- `scripts/audit-bindings.mjs`
- `scripts/audit-runtime.mjs`
- `tests/browser-map-adapter-smoke.py`
- `tests/circle-click-selection-runtime.test.mjs`
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/map-click-selection.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/runtime-authority.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

- `tests/circle-draw-display-parity.test.mjs`

## Files to delete

None.

## Repository actions

If applying the GitHub patch ZIP through the web UI:

1. upload/replace every file contained in the patch ZIP at repository root;
2. do not delete any files;
3. do not manually edit any code.

The complete v1.55.4.1 repository ZIP may instead be used as the authoritative clean tree.
