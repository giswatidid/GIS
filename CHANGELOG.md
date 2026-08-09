# EditPolygon changelog

This file replaces the large collection of one-release and one-hotfix markdown files that previously accumulated at the repository root. Git history remains the source for file-by-file historical detail.

## v1.55.3 — OpenLayers compatibility-map removal and repository audit

- Removed the hidden synchronized Leaflet compatibility map from OpenLayers mode.
- Removed compatibility-map globals, view synchronization and compatibility click forwarding.
- Kept Leaflet as the default transition engine, but confined its renderer/map creation to the Leaflet runtime.
- Routed built-in basemaps and GIS XYZ/TMS/WMS creation through the shared map adapter for both engines.
- Guarded historical Leaflet editable renderers from executing in OpenLayers mode.
- Made the final cached vector renderer authoritative and folded non-spatial table exclusion into it instead of applying another late renderer wrapper.
- Added automated source-order/runtime audits for critical selection and rendering functions.
- Consolidated repository documentation, removed obsolete release-note/change-manifest clutter, and added ignore/orphan-asset checks to discourage new repository junk.
- Updated deployment documentation and static-host CSP for the actual OpenLayers CDN and direct HTTPS GIS services.

## v1.55.2 — Native OpenLayers references

- Moved reference GeoJSON, XYZ/TMS reference tiles and GeoTIFF/static-raster previews onto the map-runtime contract.
- Added native OpenLayers reference vector/tile/image layers with engine-neutral visibility, opacity, z-order, zoom and removal.
- Kept projective trace/image overlays as engine-neutral DOM overlays.

## v1.55.1 — OpenLayers parity series

The v1.55.1.x releases introduced and hardened the opt-in OpenLayers runtime:

- OpenLayers map/view, basemaps, editable vectors and GIS services.
- Native transient overlays, Geometry Health previews, measurements, point editing and true-circle editing.
- Live geometry updates during vertex dragging.
- Dedicated DOM overlay stacking above the OpenLayers viewport.
- Unified map/Layers selection semantics.
- Measurement editing and undo/redo.
- Vector-cache swap ordering to remove pan flicker.
- True-circle click-selection fixes.

The final true-circle blocker was a source-order issue: a historic compatibility assignment later in `editpolygon-app.js` overwrote the modern `featuresAtLatLng()` implementation. v1.55.1.11 removed that stale override and added a regression for the final runtime binding.

## v1.55.0 — Map abstraction

- Introduced `EditPolygonMapAdapter`.
- Routed core viewport, coordinate, fitting and interaction operations through an engine-neutral contract while Leaflet remained the production renderer.

## v1.54 — Geometry Health

- Added guided point/line/polygon/multipart geometry validation.
- Separated safe cleanup from consequential review repairs.
- Added GEOS-WASM validity/MakeValid support, issue location, repair preview, provenance and undoable repaired layers.
- Integrated Geometry Health into the Inspector and refined topology-rule staging and import diagnostics.

## v1.53 — Join and summarize

- Added typed attribute joins, lookup-file support, grouped summaries and spatial joins.
- Added non-spatial project tables that reuse the typed table/filter/calculation/export system.

## v1.52 — Typed attributes, filters and statistics

- Expanded field/schema management, filtering, calculations, table workflows and statistics.
- Integrated history and UI feedback around data changes.

## Earlier releases

Earlier versions established the browser-local editor, multi-format import/export, remote ArcGIS/WMS/tile sources, editing/drawing, styling, labels, selection, performance optimisations, project persistence and mobile support. Use Git history for detailed pre-v1.52 changes.
