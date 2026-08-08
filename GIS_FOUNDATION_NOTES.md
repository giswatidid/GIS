# GIS foundation implementation notes

## Design decision

The existing simple editor remains the authoritative editing application. Advanced GIS is a workspace layered over the same project, geometry and undo systems. This avoids maintaining two editors and ensures that opening a project in either workspace produces the same data.

## Files added

- `public/assets/gis-core.js` — pure source/layer state model, validation and migrations.
- `public/assets/gis-workspace.js` — Advanced GIS user interface.
- `public/assets/gis-workspace.css` — Advanced GIS layout and theme integration.
- `tests/gis-core.test.mjs` — unit tests for the state model and source validation.
- `scripts/check-repo.mjs` — syntax, load-order and privacy integration checks.

## Main application integration

`public/assets/editpolygon-app.js` now exposes `window.EditPolygonGIS`, a controlled bridge over the existing project, map, basemap, editable-layer, image and reference-overlay systems. The bridge owns custom remote source runtime layers and serialises the GIS workspace into project saves, autosaves and journal checkpoints.

## Supported remote source types

### XYZ and TMS

The URL must contain `{z}`, `{x}` and `{y}`. Sources may be used as a basemap or an overlay.

### TileJSON

TileJSON is fetched directly from its provider. The first valid tile template, zoom range, bounds and attribution are saved into the project source definition.

### WMS

The user supplies the service URL and one or more WMS layer names. PNG/JPEG, WMS 1.3.0/1.1.1, opacity and transparency are supported.

### Remote GeoJSON and ArcGIS FeatureServer

GeoJSON is fetched directly and copied into the local browser project. ArcGIS FeatureServer layer URLs use `returnIdsOnly` followed by paged GeoJSON queries. The result can be imported as editable data or a read-only reference copy.

## Known boundary of this release

This is the layer/source foundation, not the completion of every desktop GIS capability. It deliberately does not yet add attribute tables, arbitrary CRS reprojection, WMTS capabilities discovery, vector-tile styling, GeoPackage editing, SQL or GEOS-WASM processing. Those should be built on the new source/layer boundary rather than patched into the legacy UI independently.

## v1.55 map-engine boundary

v1.55.0 adds a formal map runtime before the planned OpenLayers renderer migration. The project, source, layer, feature, CRS and history models remain independent of the renderer and continue to use canonical WGS84 GeoJSON coordinates.

`docs/assets/editpolygon-map-adapter.js` now owns map lifecycle, view state, coordinate/pixel conversion, extent fitting, normalised map events and interaction-state controls. v1.55.1 now provides both Leaflet and OpenLayers implementations of that runtime. Leaflet remains the default, while `?mapEngine=openlayers` activates the parity renderer. In OpenLayers mode the native OL map owns view/navigation, built-in basemaps, cached editable vector layers, and XYZ/TMS/WMS GIS service layers. v1.55.1.3 moved transient processing/Geometry Health overlays, measurements, point/circle edit handles, location markers and selected-line endpoints onto the engine-neutral runtime. v1.55.1.4 fixes live parity regressions in those paths by mounting DOM handles/labels above the OpenLayers viewport and making active/picked selection part of the cached render signature. A reduced synchronised Leaflet compatibility surface remains only for reference/image paths that have not yet been ported.

The active runtime is exposed as `window.EditPolygonMap`. `getNativeMap()`, `getLegacyMap()` and the legacy Leaflet globals remain temporary compatibility bridges only; new editor logic should use the map runtime contract instead of adding new direct renderer dependencies. Canonical project geometry remains EPSG:4326 longitude/latitude GeoJSON regardless of the active map engine.
