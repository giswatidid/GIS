# EditPolygon changelog

## v1.55.4.5 — Drawing preview startup-order hotfix

- Fixed a temporal-dead-zone startup crash introduced by v1.55.4.4: the live drawing preview layer state is now initialized beside the core drawing state before the application's first `renderAll()` can enter `renderOverlay()`.
- This prevents `ReferenceError: Cannot access 'DRAW_RUNTIME_PREVIEW_LAYER' before initialization`, allows the remainder of `editpolygon-app.js` to finish evaluating, and restores the v1.55.4.4 live polygon/circle preview and dateline fixes in the deployed application.
- Added a source-order regression that requires exactly one preview-layer state binding and proves it is initialized before both `renderOverlay()` and the startup render call.

## v1.55.4.4 — Live drawing preview and circle dateline parity hotfix

- Restored visible in-progress drawing feedback by mirroring the active draw geometry, clicked vertices and live cursor through the engine-neutral transient-vector map runtime; the existing DOM overlay remains as an interaction/handle layer and visual fallback.
- Replaced the legacy mouse-only live draw cursor path with one Pointer Events path for mouse, pen and touch, with a compatibility fallback only where Pointer Events are unavailable.
- Fixed OpenLayers pixel-to-longitude conversion losing the active repeated-world branch because `ol.proj.toLonLat()` canonicalises longitude into ±180°. The adapter now recovers the continuous longitude represented by the EPSG:3857 x coordinate for view centres, extents, map events and screen-to-map conversion.
- Made screen-generated closed rings longitude-continuous around their reference point. True circles, rectangles, regular polygons, rotated rectangles and freehand previews therefore stay local when crossing the International Date Line.
- Geographic-size circle display materialisation is also unwrapped only for map display; canonical geographic export materialisation remains unchanged.
- Added regressions for canonicalising OpenLayers inverse transforms, repeated-world inverse pixel conversion, dateline/repeated-world true circles, live runtime drawing previews and Pointer Events draw tracking.

## v1.55.4.3 — Drawing interaction and dateline parity hotfix

- Fixed polygon/LineString vertices crossing the International Date Line being normalised into opposite longitude branches, which could render a short dateline segment as a line around most of the world.
- Removed the stale v1.16 LineString `constrainedDrawCoord` override so all draw tools use the authoritative continuous-longitude coordinate path.
- Removed the obsolete Shift-pan keyboard behaviour that made the draw overlay click-through even though modern drawing uses Shift for angle/shape constraints.
- Drawing now clears stale zoom/click-through overlay state when it starts and stays pointer-interactive during zoom; CSS provides a second safety guard.
- Added executable regressions for eastward/westward dateline crossing, repeated-world first-click placement, late draw-coordinate overrides and stale overlay interaction state.
- Tightened the historical binding-debt ceiling from 200/374 to 199/373 after removing the obsolete LineString wrapper.

## v1.55.4.2 — Repeated-world rendering parity hotfix

- Fixed editable vectors disappearing after panning horizontally around the repeated world multiple times in OpenLayers.
- Added longitude-periodic spatial-index queries for map viewport culling while preserving continuous-longitude project geometry.
- Map spatial-selection candidate queries use the same repeated-world logic.
- Coordinate-to-pixel conversion now chooses the equivalent longitude nearest the current view, keeping handles and transient overlays aligned with the visible world copy.
- Web Mercator helper projection preserves continuous longitude instead of clamping x to the canonical world.
- Added multi-world regressions covering canonical Australian data, continuous-longitude geometry, latitude filtering and viewport spans wider than one world.

## v1.55.4.1 — True-circle projection parity hotfix

- Fixed true circles changing apparent centre/shape after the radius click in screen/map-shape mode, most visibly at Australian and southern mid-latitudes.
- Separated projection-aware map-display materialisation from geographic export/conversion materialisation.
- Made the committed map circle use the same screen-space ring maths as the live draw preview, eliminating the preview-to-final jump.
- Made geographic-size mode compute its draw radius geodesically and preview the same geographic circle that will be committed.
- Updated circle click hit-testing, spatial selection bounds, map zoom-to-feature/file/all and context-toolbar anchoring to use the exact displayed circle geometry.
- Added southern-hemisphere regression tests that verify the committed circle stays centred, circular and pixel-identical to the preview over Australia.

## v1.55.4 — OpenLayers parity and architecture baseline

- Unified the final cached editable-vector renderer across Leaflet and OpenLayers through `EditPolygonMap.createEditableVectorLayer()`.
- Added equivalent Leaflet rendered-feature hit testing and live cached-geometry updates behind the same map-runtime API used by OpenLayers.
- Made selection-highlight redraws engine-neutral and protected the replacement-before-removal cache swap on both engines.
- Moved normal reference GeoJSON, tiles, GeoTIFF/static-image state and GIS service visibility/opacity/z-order further behind the map adapter; removed the obsolete custom Leaflet GeoTIFF image layer.
- Added a central runtime-transition registry so point/circle editors no longer monkey-patch selection/delete/undo/redo late in source order.
- Removed another obsolete label-era `renderMap` wrapper and established an explicit final runtime-authority boundary.
- Added `audit-bindings.mjs` with no-growth budgets for historical wrapper debt, direct Leaflet calls and app-level engine branching; direct OpenLayers calls in application code are prohibited.
- Expanded both map-adapter test harnesses and added runtime-authority regression tests.
- Restored native OpenLayers `+ / −` zoom and attribution controls explicitly through `ol.control.Zoom` and `ol.control.Attribution`, avoiding the browser-global `ol.control.defaults()` API that caused the original parity startup failure.
- Replaced version-specific root audit/CRS/change-manifest documents with durable `QUALITY_BASELINE.md` and `RELEASE_MANIFEST.md`.
- OpenLayers remains opt-in until the deployed real-browser acceptance matrix passes.


## 1.55.3.1 — Leaflet basemap hotfix

- Fixed the Leaflet map adapter passing `subdomains: undefined` into `L.tileLayer`, which erased Leaflet’s default subdomain set and prevented `{s}` OSM/CARTO basemap URLs from resolving.
- Added regression coverage ensuring optional tile-layer settings are omitted unless explicitly configured.


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
