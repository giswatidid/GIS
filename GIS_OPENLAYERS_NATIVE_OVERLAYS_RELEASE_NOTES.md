# EditPolygon v1.55.1.3 — native OpenLayers interaction overlays

v1.55.1.3 continues the v1.55 OpenLayers parity migration without changing EditPolygon's project model or making OpenLayers the default renderer yet.

## What moved off the Leaflet compatibility surface

When `?mapEngine=openlayers` is active, the following now render and interact through the engine-neutral `EditPolygonMap` runtime rather than Leaflet layers:

- Processing/geometry preview overlays.
- Geometry Health issue-location markers and repair previews.
- Place-search result markers.
- Point and MultiPoint edit handles.
- True-circle centre/radius edit handles and radius guide.
- Saved and in-progress measurement geometry.
- Measurement labels, point markers and annotations.
- Selected-LineString endpoint markers.

OpenLayers transient geometry uses native `ol.layer.Vector` / `ol.source.Vector` layers. Screen-space handles and labels use map-runtime DOM overlays positioned through canonical WGS84 ↔ map-pixel conversion. The same APIs also work under the Leaflet runtime.

## Editing behaviour

- Point handles now live-update the cached rendered point while dragging, then commit one history operation on release.
- True-circle handles use engine-neutral drag overlays while preserving the canonical `CircleByCenterPoint` model.
- Circle and point dragging continue to use EditPolygon snapping/history semantics.
- Measurements remain project objects; only their map presentation layer changed.

## OpenLayers loading

The temporary `document.write()` OpenLayers bootstrap has been removed. OpenLayers 10.9.0 CSS and browser bundle are now loaded normally before the map adapter, eliminating Chrome's parser-blocking warning seen during live parity testing.

During the parity phase both Leaflet and OpenLayers are loaded. Leaflet remains the default engine and is still retained as a reduced compatibility renderer for remaining reference/image paths.

## Compatibility surface remaining

The OpenLayers runtime now reports:

`EditPolygonMap.parityBridge === "leaflet-reference-image-overlays"`

The remaining migration work is concentrated in legacy/reference presentation paths, particularly reference vectors/rasters and specialised image/reference rendering. These will be removed before Leaflet is made unnecessary.

## Verification

- Repository integration checks pass.
- 163 JavaScript tests pass.
- Leaflet map-adapter browser smoke passes.
- OpenLayers parity browser smoke passes.
- CRS, remote-source, typed-data, join/summary and Geometry Health browser smoke suites pass.
