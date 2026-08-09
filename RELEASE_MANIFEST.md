# Current release manifest — v1.55.4.7

This is the current repository update manifest. v1.55.4.7 is a focused live-parity hotfix on top of v1.55.4.6. It fixes three defects exposed by extended OpenLayers acceptance testing: standalone points could persist repeated-world longitudes and disappear/zoom into unsupported tile levels; undo/redo could leave a stale cached geometry that changed again on the next map click; and the true-circle radius guide could disappear because transient vector geometry was projected from a distant repeated-world branch.

## Upgrade basis

Upgrade from **v1.55.4.6**.

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

- `tests/history-point-circle-parity.test.mjs`

## Files to delete

None.

## Deployment

If applying the GitHub patch ZIP through the web UI:

1. replace every file listed under **Files to update**;
2. add every file under **Files to add**;
3. do not delete any files;
4. do not manually edit any code.

The complete v1.55.4.7 repository ZIP may instead be used as the authoritative clean tree.
