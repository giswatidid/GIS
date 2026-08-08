# EditPolygon v1.55.0 — Map abstraction release notes

## Purpose

v1.55.0 is the first stage of EditPolygon's migration from Leaflet to OpenLayers. It is deliberately an architectural release rather than a renderer replacement: **Leaflet remains the production map renderer in v1.55.0**.

The goal is to give the editor a stable map-engine contract before introducing a second renderer. This lets the OpenLayers work in v1.55.1 be compared against known Leaflet behaviour without simultaneously redesigning drawing, editing, selection or the GIS project model.

## New map-engine boundary

`docs/assets/editpolygon-map-adapter.js` introduces `EditPolygonMapAdapter` and the active runtime exposed as `window.EditPolygonMap`.

The editor now obtains these capabilities through the runtime instead of directly through Leaflet APIs:

- map creation and access to current view state
- canonical WGS84 `[longitude, latitude]` centre/coordinate handling
- WGS84 ↔ container-pixel conversion
- WGS84 ↔ layer-pixel conversion used by custom overlays
- map projection for screen-distance/editing calculations
- extent retrieval and extent fitting
- pan-inside behaviour
- map zoom/view changes
- pan enable/disable state
- double-click-zoom enable/disable state
- resize/invalidate behaviour
- normalised map events for click, context menu, pointer/mouse, move, zoom, drag and resize workflows
- containment of the legacy Leaflet private drag-state recovery workaround

The project and analysis models remain canonical WGS84/GeoJSON geometry. No project-format or CRS semantic change is introduced by this release.

## Normalised event contract

Runtime events provide engine-neutral values such as:

- `lonLat` — canonical `[longitude, latitude]`
- `latLng` — temporary compatibility `{lat, lng}` value for editor code still being migrated
- `pixel` — container pixel
- `originalEvent` — browser pointer/mouse event where applicable
- `nativeEvent` — renderer-specific event retained only for transitional integration

Main editor subscriptions now use this runtime event layer instead of subscribing directly to Leaflet map events.

## Transitional compatibility surface

v1.55.0 intentionally retains a small renderer-native escape hatch:

- `EditPolygonMap.getNativeMap()`
- `window.__polygonEditorLeafletMap`
- compatibility helpers such as `latLngToPixel()` / `pixelToLatLng()`

These exist so existing Leaflet layer construction can remain stable while the map contract is introduced. They are **not** the intended long-term API and are scheduled to disappear after OpenLayers becomes stable.

## Leaflet-specific work intentionally left for v1.55.1+

The following areas still construct or manage Leaflet objects directly and are therefore the primary parity work for the next release:

- basemap tile layers and pane ordering
- editable vector layer construction and cached Canvas rendering
- native Leaflet GeoJSON/marker/circle/layer-group creation
- selection/highlight and transient renderer layers
- label markers
- measurement overlays
- point and true-circle editing handles that currently use native Leaflet markers
- image/reference-overlay renderer internals
- XYZ/TMS/WMS and other reference/remote source layer construction
- custom reference raster layers
- endpoint/reference overlays and other renderer-specific utility layers
- Leaflet-specific CSS/control positioning and compatibility globals

The custom EditPolygon drawing/vertex-editing/snapping/topology logic remains intentionally intact. v1.55.1 should change the renderer underneath these workflows before considering whether selected interactions should later adopt native OpenLayers `Draw`, `Modify`, `Select` or `Snap` implementations.

## Coordinate policy

EditPolygon continues to store editable/project geometry as EPSG:4326 longitude/latitude GeoJSON coordinates. The future OpenLayers adapter will be responsible for transforming between that canonical representation and the renderer's map projection.

This release therefore does not alter:

- `.polygonproject` geometry semantics
- import/export coordinate semantics
- Geometry Health / GEOS input geometry
- joins, filters or schemas
- undo/redo history
- CRS metadata and preferred export CRS

## Tests

v1.55.0 adds dedicated map-abstraction coverage.

At release time:

- repository integration checks pass
- **149/149 JavaScript automated tests pass**
- map-adapter browser smoke test passes
- CRS browser smoke test passes
- ArcGIS remote-source browser smoke test passes
- typed-data browser smoke test passes
- join/summary browser smoke test passes
- Geometry Health browser smoke test passes

The new coverage verifies the adapter's canonical view state, coordinate/pixel transforms, fit/pan behaviour, interaction toggles, normalised events, containment of Leaflet private drag recovery, script load order and guards against reintroducing direct active-editor viewport/interaction calls.

A complete locally served EditPolygon page could not be opened by the available browser environment because localhost navigation was blocked by the environment administrator. The focused browser smoke suites passed, but **manual testing of the deployed application remains a release gate** for pan/zoom, drawing, selection, editing, snapping, fit/zoom, project restore and Geometry Health locate/preview behaviour.

## Next release

**v1.55.1 — OpenLayers parity build** implements the next stage described here. See `GIS_OPENLAYERS_PARITY_RELEASE_NOTES.md` for the dual-engine runtime, current OpenLayers-owned renderer paths and the remaining compatibility-overlay boundary.
