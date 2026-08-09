# Current release manifest — v1.55.4.9

This is the current repository update manifest. v1.55.4.9 is a focused history/edit-lifecycle hardening release on top of v1.55.4.8. Extended live testing proved the v1.55.4.8 design was correct but not actually authoritative at runtime: a late v1.16 `VStop` compatibility wrapper discarded the new `{render:false}` argument, allowing the pre-undo geometry to be painted even though the base history-aware implementation explicitly prohibited it.

The release removes that stale wrapper, makes vertex-editor shutdown drain pending edit work before history replacement, and prevents pointerdown-only edit interactions from generating no-op undo entries.

## Upgrade basis

Upgrade from **v1.55.4.8**.

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

If applying the GitHub patch ZIP through the web UI:

1. replace every file listed under **Files to update**;
2. do not add or delete any files;
3. do not manually edit any code.

The complete v1.55.4.9 repository ZIP may instead be used as the authoritative clean tree.
