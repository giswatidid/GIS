# Current release manifest — v1.55.4.6

This is the current repository update manifest. v1.55.4.6 is a focused live-parity hotfix on top of v1.55.4.5. It fixes repeated-world editing after horizontal map wraps: a dragged vertex or edge is now committed on the longitude branch of the stored coordinate it replaces, instead of the viewport copy returned by the map. The same branch-stability rule is applied to whole-feature movement, draggable DOM handles and true-circle centre movement.

## Upgrade basis

Upgrade from **v1.55.4.5**.

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
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

- `tests/edit-world-wrap.test.mjs`

## Files to delete

None.

## Deployment

If applying the GitHub patch ZIP through the web UI:

1. replace every file listed under **Files to update**;
2. add every file under **Files to add**;
3. do not delete any files;
4. do not manually edit any code.

The complete v1.55.4.6 repository ZIP may instead be used as the authoritative clean tree.
