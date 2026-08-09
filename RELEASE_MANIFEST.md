# Current release manifest — v1.55.4

This file is the single current-repository update manifest. It replaces accumulating `Vx.y.z_CHANGED_FILES.md` files.

## Upgrade basis

Upgrade from the clean **v1.55.3.1** repository.

## Files to update

- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `README.md`
- `docs/assets/editpolygon-app.js`
- `docs/assets/editpolygon-map-adapter.js`
- `docs/assets/editpolygon-openlayers.css`
- `docs/index.html`
- `package.json`
- `scripts/audit-runtime.mjs`
- `scripts/check-repo.mjs`
- `tests/browser-map-adapter-smoke.py`
- `tests/browser-openlayers-parity-smoke.py`
- `tests/circle-click-selection-runtime.test.mjs`
- `tests/gis-crs-integration.test.mjs`
- `tests/gis-remote-source-integration.test.mjs`
- `tests/map-abstraction-integration.test.mjs`
- `tests/map-adapter.test.mjs`
- `tests/map-click-selection.test.mjs`
- `tests/openlayers-native-overlays.test.mjs`
- `tests/openlayers-reference-overlays.test.mjs`
- `tests/release-cache.test.mjs`
- `tests/render-performance.test.mjs`
- `tests/typed-fields-integration.test.mjs`

## Files to add

- `QUALITY_BASELINE.md`
- `RELEASE_MANIFEST.md`
- `scripts/audit-bindings.mjs`
- `tests/runtime-authority.test.mjs`

## Files to delete

- `CRS_VALIDATION.md`
- `V1.55.3_AUDIT.md`
- `V1.55.3_CHANGED_FILES.md`

The still-relevant CRS validation details and the current audit/parity findings are consolidated into `QUALITY_BASELINE.md`. Historical release detail remains in Git history and `CHANGELOG.md`.

## Repository actions

If applying the GitHub patch ZIP through the web UI:

1. upload/replace every file contained in the patch ZIP at repository root;
2. manually delete the three files listed above;
3. do not delete any other file.

No other manual code edits are required. Alternatively, the complete v1.55.4 repository ZIP can be used as the authoritative clean tree.
