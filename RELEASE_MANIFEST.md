# Current release manifest — v1.55.4.15

v1.55.4.15 is a project-persistence parity correction on top of v1.55.4.14. Live save/reload testing found that a WMS layer worked in the active OpenLayers project but disappeared after reopening the saved `.polygonproject`. The saved payload already contained the GIS workspace; the loss occurred when `normaliseSavedProjectPayload()` stripped `gisWorkspace` before restoration.

## Upgrade basis

Upgrade from **v1.55.4.14**.

## Behavioural changes

- Manual project files retain custom GIS service definitions across the full save → JSON parse → normalise → restore path.
- WMS URL, `LAYERS`, styles, image format, WMS version, transparency, discovered bounds and metadata are retained.
- The associated custom layer retains visibility, opacity, order, role, lock state and group assignment through GIS-core normalisation.
- `referenceOverlays` are preserved at the same normalisation boundary so all non-editable project context follows one persistence contract.
- Runtime restoration rebuilds saved GIS services through the existing engine-neutral GIS runtime; no OpenLayers-specific project format is introduced.

## Files to update

See `V1.55.4.15_CHANGED_FILES.md` in the release artifacts for the exact generated diff.

## Files to add

- `tests/wms-project-persistence.test.mjs`

## Files to delete

None.

## Deployment

1. Replace every file listed in the generated changed-files manifest.
2. Add the new WMS project-persistence regression test file.
3. Wait for GitHub Pages to deploy.
4. Hard-refresh `?mapEngine=openlayers`.
5. Add a WMS, change its opacity/visibility if desired, save the `.polygonproject`, then reopen it in a fresh page.
6. Confirm the WMS card returns, the imagery renders, and its URL/layer/display state are preserved.

The complete v1.55.4.15 repository ZIP can instead be used as the authoritative clean tree.
