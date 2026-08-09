# Current release manifest — v1.55.4.5

This is the current repository update manifest. v1.55.4.5 is a focused startup-order hotfix on top of v1.55.4.4. It fixes the `DRAW_RUNTIME_PREVIEW_LAYER` temporal-dead-zone failure visible in the browser console, which caused the application's initial `renderAll()` to abort before the remainder of `editpolygon-app.js` could finish evaluating.

## Upgrade basis

Upgrade from **v1.55.4.4**.

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
- `tests/draw-runtime-preview.test.mjs`
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

None.

## Files to delete

None.

## Repository actions

If applying the GitHub patch ZIP through the web UI:

1. upload/replace every file contained in the patch ZIP at repository root;
2. do not delete any files;
3. do not manually edit any code.

The complete v1.55.4.5 repository ZIP may instead be used as the authoritative clean tree.
