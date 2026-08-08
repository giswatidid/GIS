# EditPolygon v1.55.1.7 — circle click selection and first-class measurement editing/history

v1.55.1.7 fixes three defects found during live OpenLayers parity testing.

## True-circle click selection

OpenLayers renderer hit testing is no longer treated as an exclusive fast path. Click selection now combines native rendered-feature hits with EditPolygon's canonical geometry-aware hit testing. A true `CircleByCenterPoint` is tested against its displayed centre/radius footprint before bbox pruning, so ordinary click selection follows the same circle semantics already used by rectangle, polygon and lasso selection.

This keeps the canonical centre + radius project model unchanged while making a visible true circle directly clickable.

## Measurement geometry editing

Saved distance and area measurements now have a real map editor rather than an append-only sketch mode.

When **Edit on map** is active:

- existing measurement vertices are displayed as draggable edit handles;
- dragging an existing vertex reshapes the measurement live;
- midpoint handles are shown between vertices;
- clicking a midpoint inserts a new vertex;
- clicking empty map space can still append a new point when desired;
- pointer movement no longer creates a trailing ghost vertex while editing an existing measurement;
- the saved item is updated only when **Save measurement** is chosen.

The same map-runtime DOM overlay system is used in both Leaflet and OpenLayers modes.

## Measurement undo and redo

Measurements now participate in normal project history.

- Creating a measurement creates an undo checkpoint.
- Saving edits to a measurement creates an undo checkpoint.
- Deleting a measurement creates an undo checkpoint.
- `Ctrl+Z` restores the previous measurement state instead of skipping the measurement and undoing an unrelated polygon edit.
- `Ctrl+Y` restores the measurement change again.
- Structural full-project history states now retain measurements as well, so operations such as measurement-to-feature conversion and project clearing remain coherent.

Measurement-only history entries are compact and do not snapshot all vector geometry merely to undo a measurement change.

## Verification

The release adds dedicated regression coverage for circle click hit testing, measurement vertex/midpoint editing, and measurement history integration in addition to the existing Leaflet/OpenLayers parity suites.
