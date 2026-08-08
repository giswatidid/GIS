# EditPolygon v1.55.1.4 — OpenLayers live parity fixes

## Purpose

v1.55.1.4 fixes regressions found during live GitHub Pages testing of the native OpenLayers overlay paths introduced in v1.55.1.3. OpenLayers remains opt-in via `?mapEngine=openlayers`; Leaflet remains the default renderer.

## Fixed

- Active feature selection and picked/multi-selection styling now invalidate the cached vector signature immediately. Selection highlighting no longer waits for a pan or zoom before appearing.
- OpenLayers DOM map overlays now live in a dedicated `editpolygon-openlayers-dom-overlays` pane above the OpenLayers viewport and the temporary Leaflet compatibility surface.
- True-circle centre/radius handles therefore remain visible and draggable in OpenLayers mode.
- Measurement value labels and point/annotation DOM overlays are visible again in OpenLayers mode.
- The DOM pane remains map-engine-neutral to callers; circle, point, measurement and Geometry Health code still uses `EditPolygonMap.createDomOverlay()`.

## Chrome Canvas2D advisory

Chrome may report that repeated `getImageData()` operations would be faster with a `willReadFrequently` canvas. This originates from OpenLayers canvas hit detection and is a performance advisory, not a functional error. EditPolygon does not patch OpenLayers' internal canvas context to suppress it.

## No project-model changes

There are no changes to project files, CRS semantics, schemas, Geometry Health results, undo/redo or analysis outputs.
