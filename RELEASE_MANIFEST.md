# Current release manifest — v1.55.4.3

This is the current repository update manifest. v1.55.4.3 is a focused live-parity hotfix on top of the v1.55.4 architecture baseline. It fixes intermittent polygon drawing clicks that could fall through the edit overlay and makes polygon/LineString drawing preserve the short continuous-longitude branch across the International Date Line.

## Upgrade basis

Upgrade from **v1.55.4.2**.

## Files to update

- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `QUALITY_BASELINE.md`
- `README.md`
- `RELEASE_MANIFEST.md`
- `docs/assets/editpolygon-app.js`
- `docs/assets/editpolygon-map-adapter.js`
- `docs/assets/editpolygon.css`
- `docs/index.html`
- `package.json`
- `scripts/audit-bindings.mjs`
- `scripts/audit-runtime.mjs`
- `tests/browser-map-adapter-smoke.py`
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

- `tests/draw-interaction-world-wrap.test.mjs`

## Files to delete

None.

## Repository actions

If applying the GitHub patch ZIP through the web UI:

1. upload/replace every file contained in the patch ZIP at repository root;
2. do not delete any files;
3. do not manually edit any code.

The complete v1.55.4.3 repository ZIP may instead be used as the authoritative clean tree.
