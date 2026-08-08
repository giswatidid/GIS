# EditPolygon v1.55.1.6 — OpenLayers rendered hit-testing and measurement selection

v1.55.1.6 fixes two interaction defects found during live OpenLayers parity testing.

## True-circle map selection

OpenLayers mode now asks the active OpenLayers renderer which editable geometry is actually painted under the pointer before falling back to EditPolygon's geometry-neutral manual hit test. Editable OpenLayers vector layers are marked explicitly and the runtime exposes `editableFeatureIdsAtPixel()` with a small hit tolerance.

This is particularly important for true `CircleByCenterPoint` features because their OpenLayers display is a materialised rendered polygon while their canonical project model remains centre + radius. Clicking the visible circle now selects the corresponding canonical circle feature.

The project model, circle export semantics and CircleByCenterPoint storage are unchanged.

## Saved measurement selection no longer starts editing

Clicking a saved distance/area measurement or its Layers row now selects the measurement and opens its Inspector state only. It no longer calls `startEditMeasure()` automatically.

Editing remains available through the explicit **Edit on map** action in the Inspector or measurement menu. This prevents the selection click from being reinterpreted as another measurement vertex.

The map-overlay click is marked as handled so the underlying normal map click does not run a second selection/drawing action.

## Verification

- Repository integration checks pass.
- 172 JavaScript tests pass.
- Leaflet and OpenLayers browser smoke suites pass.
- CRS, remote source, typed-data, join/summary and Geometry Health browser smoke suites pass.
