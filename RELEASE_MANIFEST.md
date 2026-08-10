# Current release manifest — v1.55.4.13

v1.55.4.13 is the focused-selection/edit performance correction on top of v1.55.4.12. Live testing showed that the 821-feature ecoregions layer became much faster for ordinary pan/zoom in v1.55.4.12, but selecting a region and entering edit mode still caused a noticeable performance cliff. The review found that selection styling could rebuild the complete heavy layer and precision editing promoted the whole layer from image-backed interaction rendering to a normal vector renderer. This release isolates only the focused feature(s) into a precise vector overlay while keeping the heavy background stable.

## Upgrade basis

Upgrade from **v1.55.4.12**.

## Behavioural changes

- Heavy OpenLayers background vectors remain image-backed during selection and editing.
- Selected/picked features are rendered in a small precise vector focus overlay.
- Live edit geometry targets that focus overlay first.
- The active edited feature is temporarily suppressed in the heavy background so stale geometry cannot show through.
- Geometry changes confined to the active focus feature do not rebuild the heavy background after each pointer release.
- Selection changes no longer participate in the heavy background cache signature.
- Leaflet retains the previous single-layer rendering path because it reports that focused editable overlays are not preferred.

## Files to update

See `V1.55.4.13_CHANGED_FILES.md` in the release artifacts for the exact generated diff.

## Files to add

None expected beyond release-test changes already present in the repository diff.

## Files to delete

None.

## Deployment

1. Replace every file listed in the generated changed-files manifest.
2. Do not delete unrelated repository files.
3. Wait for GitHub Pages to finish deploying.
4. Hard-refresh `?mapEngine=openlayers`.
5. Import the OpenLayers ecoregions GeoJSON, select several different regions, enter/exit vertex editing, drag a vertex, and compare responsiveness with v1.55.4.12.

The complete v1.55.4.13 repository ZIP can instead be used as the authoritative clean tree.
