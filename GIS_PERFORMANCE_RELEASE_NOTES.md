# EditPolygon Browser GIS v1.43.0

## Vector map performance

Imported editable vector features now share a Leaflet Canvas renderer. This avoids hundreds or thousands of independent SVG path elements during map movement while preserving the existing canonical feature model, layer cache, filtering, styles and selection behaviour.

The selected feature, geometry editor and vertex handles continue to use dedicated overlays so Canvas acceleration does not reduce editing precision.

## Map movement

The move handler no longer calls the image overlay renderer for vector-only projects. Where visible image overlays exist, redraw is coalesced with requestAnimationFrame.

## Compatibility

No project format migration is required. The deployable application remains in docs/.
