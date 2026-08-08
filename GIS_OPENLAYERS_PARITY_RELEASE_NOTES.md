# EditPolygon v1.55.1 — OpenLayers parity release notes

## Purpose

v1.55.1 is the first release in which OpenLayers can run the live EditPolygon map. It is a **parity preview**, not the final Leaflet removal release.

The normal application URL continues to use Leaflet. Add `?mapEngine=openlayers` to request the OpenLayers runtime against the same project, UI, editing logic and browser-local data. The goal is to compare engines safely before OpenLayers becomes the default.

## Engine selection

- normal URL: Leaflet
- `?mapEngine=openlayers` or `?mapEngine=ol`: OpenLayers parity runtime
- if OpenLayers does not load or cannot initialise: automatic Leaflet fallback rather than a blank editor

The active runtime remains available as `window.EditPolygonMap`. In an OpenLayers preview, `EditPolygonMap.engine` is `openlayers`, `EditPolygonMap.requestedEngine` is `openlayers`, and `EditPolygonMap.nativeVersion` identifies the pinned OL runtime. A fallback exposes `fallbackReason`.

## What OpenLayers owns in v1.55.1

When the parity runtime is active, OpenLayers now owns:

- the map/view and Web Mercator display projection
- pan/zoom and the standard navigation interactions
- canonical WGS84 ↔ map-pixel conversion through the shared runtime contract
- built-in OSM, CARTO Light, CARTO Dark and Esri imagery basemaps
- cached editable vector display layers for project points, lines, polygons and multipart geometry
- existing per-feature simple/advanced style descriptors translated to OL styles
- current attribute labels/point annotations translated to OL vector text styles
- editable-layer order, visibility and opacity at the renderer layer boundary
- GIS XYZ and TMS service layers
- GIS WMS service layers

The project itself is unchanged: editable/project geometry remains EPSG:4326 GeoJSON `[longitude, latitude]`, while the adapter transforms to/from the OpenLayers map projection.

## Transitional Leaflet compatibility surface

Several specialised editor overlays still construct mature Leaflet objects. Rewriting all of those in the same release as the map/view/vector migration would make parity regressions much harder to isolate.

v1.55.1 therefore creates a transparent, non-navigable Leaflet compatibility map that is synchronised to the OpenLayers view. It temporarily carries legacy overlay paths such as:

- measurement markers/labels
- Geometry Health locate and repair-preview overlays
- point and true-circle editing handles
- geometry preview layers
- location-search markers/popups
- image/reference-overlay renderer internals
- reference raster/vector overlays that still use Leaflet objects

The compatibility map does **not** own navigation in OpenLayers mode. Core editable vector rendering and GIS tile/WMS sources use OpenLayers directly.

This bridge is deliberately temporary and is scheduled to disappear before Leaflet is removed.

## Existing custom editing logic is preserved

The custom EditPolygon draw, vertex, midpoint, edge-move, whole-geometry move, snapping, topology and map-selection systems continue to use the v1.55 map contract for pixel/coordinate operations. They are not replaced by OpenLayers `Draw`/`Modify` interactions in this parity release.

That allows a renderer comparison without simultaneously changing the editing model. Native OpenLayers interactions can be considered selectively after parity is established.

## Remote GIS sources

The GIS source bridge now has OpenLayers-native display paths for:

- XYZ
- TMS
- WMS
- custom basemaps built from those source types

The stored source/layer definitions and privacy model are unchanged. Remote requests still go directly from the user's browser to the configured provider.

## OpenLayers loading

For the parity period, the OpenLayers browser bundle and stylesheet are loaded only when the OpenLayers query switch is requested. The preview is pinned to OpenLayers 10.9.0. Leaflet remains loaded because the specialised compatibility overlay still needs it.

This conditional CDN bootstrap is appropriate for the temporary parity build. Before OpenLayers becomes the sole production renderer, the dependency should be vendored/bundled with the application's static assets so a third-party runtime CDN is not a permanent startup dependency.

## No data-model migration

This release does not alter:

- `.polygonproject` format or geometry semantics
- project/source/layer/feature IDs
- WGS84 canonical editable geometry
- CRS metadata or export CRS preferences
- schemas, attributes, filters or joins
- Geometry Health / GEOS inputs and provenance
- undo/redo history
- processing outputs
- autosave/recovery semantics

A project opened under Leaflet and OpenLayers is the same project.

## Tests

At release time:

- repository integration checks pass
- **155/155 JavaScript automated tests pass**
- Leaflet map-adapter browser smoke passes
- OpenLayers parity browser smoke passes
- CRS browser smoke passes
- ArcGIS remote-source browser smoke passes
- typed-data browser smoke passes
- join/summary browser smoke passes
- Geometry Health browser smoke passes

The OpenLayers tests cover explicit engine selection, canonical lon/lat view state, coordinate/pixel conversion, OL pan/double-click interactions, OL tile/WMS/vector layer construction, display-layer ownership, compatibility-surface synchronisation and safe fallback to Leaflet.

The available automated browser environment cannot fetch the external OpenLayers CDN bundle or exercise the complete deployed page. Manual testing on the GitHub Pages deployment with `?mapEngine=openlayers` is therefore a required release gate.

## Live parity checklist

Compare the normal Leaflet URL with the OpenLayers URL using the same project. Prioritise:

1. initial map centre/zoom and basemap
2. pan, wheel zoom, +/- controls, Fit and location search
3. point/line/polygon/multipart rendering and layer order
4. selection highlighting
5. simple/advanced styles and labels
6. rectangle/polygon/lasso selection
7. draw point/line/polygon/rectangle/circle
8. vertex drag, midpoint insertion, edge move and whole-geometry move
9. snapping and topology-linked edits
10. point and true-circle editing handles
11. measurements
12. Geometry Health Locate and repair preview
13. image/reference overlays
14. XYZ/TMS/WMS sources and custom basemaps
15. save/reload/project recovery
16. mobile/responsive map resizing

Any discrepancy should be fixed in the OpenLayers path without intentionally changing established EditPolygon behaviour during the parity phase.

## Next stages

- **v1.55.2 — OpenLayers default:** finish remaining native/compatibility renderer work, pass live parity, then make OpenLayers the normal engine while retaining Leaflet as a temporary fallback.
- **v1.55.3 — Leaflet removal:** remove the compatibility surface, Leaflet dependency, Leaflet-only CSS/workarounds and native-map escape hatches after stabilisation.
