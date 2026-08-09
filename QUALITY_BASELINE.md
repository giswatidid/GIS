# EditPolygon v1.55.4 quality baseline

v1.55.4 is a parity, architecture and quality-control release. It does not make OpenLayers the default map engine. Its purpose is to establish a professional baseline before that switch. **v1.55.4.11** keeps this architecture baseline and incorporates the deployed parity corrections found so far: map-shape true circles use projection-aware display materialisation, viewport culling and inverse pixel conversion preserve horizontally repeated world copies, polygon/LineString vertices use a continuous longitude branch across the International Date Line, and in-progress drawing is visibly mirrored through the engine-neutral transient-vector runtime. Drawing remains pointer-interactive through zooms and uses Pointer Events for live cursor tracking, with Shift reserved for geometry constraints rather than the obsolete Shift-pan click-through mode. The v1.55.4.5 startup-order guard also requires the drawing-preview layer state to be initialized before the first `renderAll()`, preventing late lexical state from aborting application initialization. v1.55.4.6 makes editing branch-stable in repeated world copies: vertex, edge, whole-feature, DOM-handle and circle-centre edits map pointer longitude back beside the stored geometry before committing. v1.55.4.7 canonicalises standalone Point/MultiPoint and true-circle model centres, canonicalises OpenLayers editable/transient vector projection without breaking Date Line continuity, restores repeated-world transient guides, and caps point zoom/native OSM tile zoom so zero-size feature extents remain stable. v1.55.4.8 makes undo/redo rendering authoritative in the same frame: history closes vertex editing without a pre-restore map paint, then invalidates with a monotonic render generation after the restored model is installed before rendering it. v1.55.4.9 verifies the *final* source-order binding rather than only the original declaration: the late v1.16 `VStop` wrapper that discarded `{render:false}` is removed, editor shutdown drains pending edit callbacks/timers, and vertex/edge/point/circle drag history starts only on actual movement rather than pointerdown. v1.55.4.10 adds a hard render-authority invariant: history states have a monotonic non-serialised epoch, cached editable signatures include actual geometry-content fingerprints, selected/picked native geometry is content-checked before cache reuse, and the map adapter can purge editable layers by owner key before the restored model is painted. v1.55.4.11 adds the first external-source performance/parity corrections from deployed testing: WMS no longer forces anonymous CORS, GeoServer tiled hints are adapter-owned, advertised WMS bounds are discovered/fitted when capabilities are browser-readable, and large editable remote GeoJSON keeps full geometry while limiting sidebar DOM work and avoiding viewport-only native-vector rebuilds.

## What was reviewed

The review covered the complete static repository and the full application runtime, with particular attention to the historically layered `docs/assets/editpolygon-app.js` monolith.

The audit checked:

- Leaflet ↔ OpenLayers map-runtime contract parity;
- map navigation, pixel/coordinate conversion and map events;
- editable vector rendering and live geometry updates;
- click and spatial selection, including true circles;
- drawing/edit overlay infrastructure, snapping-related map conversions and transient handles;
- measurements and measurement history;
- Geometry Health overlays and output materialisation;
- reference vectors, tiles and GeoTIFF/static-raster previews;
- GIS XYZ/TMS/WMS service layers;
- layer visibility, opacity and z-order;
- styling/labels and selection-highlight redraws;
- CRS, typed attributes, filtering/calculation, joins/summaries and remote-source integration;
- project history hooks and cross-cutting edit-mode cleanup;
- source-order function reassignment risk;
- direct Leaflet/OpenLayers escape hatches;
- deployment asset references and repository clutter.

## Architecture baseline established in v1.55.4

### One authoritative editable renderer

Both Leaflet and OpenLayers now use `EditPolygonMap.createEditableVectorLayer()` from the final cached renderer. Application code no longer maintains a separate OpenLayers-specific cached renderer.

The current renderer:

- resolves feature style/labels once in application code;
- hands engine-neutral descriptors to the map runtime;
- refreshes selection state through the same renderer on both engines;
- live-updates dragged feature geometry through the runtime;
- adds a replacement cache layer before removing the previous one to prevent blank pan frames;
- excludes non-spatial table layers directly rather than installing another late `renderMap` wrapper.
- performs one final handoff render after all historical installers finish, clearing bootstrap-era Leaflet feature layers before the runtime-authority snapshot is published.
- treats direct native geometry mutation as transient pointer feedback only; completed manual edits invalidate the owner layer and history restoration hard-purges editable runtime layers before rematerialising from the project model.
- verifies cached selected/picked features against content-derived geometry signatures rather than trusting revision counters alone.

### Map-engine implementation boundary

Direct OpenLayers calls are forbidden in `editpolygon-app.js`; OpenLayers implementation code lives in `editpolygon-map-adapter.js`.

Leaflet remains a transition engine for the parity stage. There are **16 direct `L.*` call sites** left in application code, but **no application-level native-map escape** (`getNativeMap`) remains. They are confined to three legacy Leaflet-only areas:

1. the early/bootstrap Leaflet editable renderer and annotation icon helper;
2. the large-reference full-detail Leaflet canvas renderer;
3. the historical v1.30 Leaflet performance renderer.

Those are explicit transition debt. `scripts/audit-bindings.mjs` prevents that number from growing. They are scheduled for removal once OpenLayers has passed the live parity gate and Leaflet is retired. The audit also verifies that every remaining direct `L.*` call stays inside those documented legacy blocks; a new Leaflet call elsewhere fails the build even if the total call count does not increase.

Normal reference tiles, reference GeoJSON, GeoTIFF/static images, GIS services, display-layer state and current cached editable vectors now use the map-runtime contract.

### Runtime authority boundary

The application historically grew by appending enhancement blocks that captured and reassigned earlier functions. That pattern caused the true-circle click-selection failure: a correct selector was silently overwritten much later in the file.

v1.55.4 establishes an explicit runtime authority boundary at the end of the application scope. The final identities of rendering, selection, history and editing entry points are published through `window.__EditPolygonRuntimeAuthority` for diagnostics/tests. No new function patch is permitted after that boundary.

Cross-cutting point/circle editor cleanup no longer monkey-patches selection, delete, undo and redo functions. It uses a central runtime-transition registry for `selection`, `delete` and `history` lifecycle events.

### Historical wrapper debt

The binding audit is intentionally conservative: it counts repeated named declarations/reassignments even when some occur in separate local scopes. It therefore measures **source-order complexity**, not necessarily 199 global collisions.

Current v1.55.4 ceiling after cleanup:

- 1,694 named function bindings identified;
- 199 names occurring at more than one source site;
- 373 extra binding sites beyond the first occurrence;
- largest historical chains: `renderSelected` 15, `renderSidebar` 13, `renderAll` 10, `showFileLayerMenu` 8, `showFeatureLayerMenu` 7, `updateButtons` 7, `importFile` 7.

The generic local name `wrapped` appears 21 times in independent enhancement scopes and is not itself one global 21-stage wrapper chain.

v1.55.4 does **not** flatten all historical wrappers in one release. Doing that while simultaneously proving map parity would be a high-risk rewrite. Instead:

- known high-risk selection/history monkey patches were removed;
- the stale label-era `renderMap` wrapper was removed;
- critical click-selection functions must each have exactly one binding;
- major wrapper chains have no-growth ceilings;
- no OpenLayers implementation may leak back into application code;
- no new patch may appear after the authority boundary.

The next post-Leaflet cleanup should reduce these numbers, not increase them.

## Automated parity matrix

`Pass` below means the relevant core/module/integration/browser-smoke tests pass in this repository. `Live gate` means a deployed real-browser check is still required because the local OpenLayers browser smoke uses a controlled OpenLayers implementation rather than the external CDN bundle.

OpenLayers controls are instantiated explicitly (`ol.control.Zoom` and `ol.control.Attribution`) rather than through `ol.control.defaults()`. This preserves the visible `+ / −` and attribution UI while remaining compatible with the browser-global OpenLayers bundle used by the static site.

| Workflow | Leaflet automated | OpenLayers automated | Deployed live gate |
|---|---:|---:|---|
| Map startup / view / fit / resize | Pass | Pass | Required |
| OSM/CARTO/Esri basemaps | Pass | Pass | Required |
| Pan / wheel zoom / controls | Pass | Pass | Required |
| Zoom buttons / attribution control | Pass | Pass | Required |
| Coordinate ↔ pixel conversion | Pass | Pass | Required for interaction feel |
| Editable point/line/polygon rendering | Pass | Pass | Required |
| Multi-geometry rendering | Pass | Pass | Required |
| True-circle rendering and click selection | Pass | Pass | Required |
| Polygon / LineString drawing across International Date Line | Shared continuous-longitude path pass | Shared continuous-longitude path pass | Required |
| Click / Shift / Ctrl selection semantics | Pass | Pass | Required |
| Rectangle / polygon / lasso selection | Shared app path pass | Shared app path pass | Required |
| Immediate selection highlight redraw | Pass | Pass | Required |
| Vertex live drag / midpoint insertion infrastructure | Shared runtime path pass | Shared runtime path pass | Required |
| Point editing handles | Shared runtime path pass | Shared runtime path pass | Required |
| Circle centre/radius handles | Shared runtime path pass | Shared runtime path pass | Required |
| Snapping/topology coordinate infrastructure | Shared app/runtime path pass | Shared app/runtime path pass | Required |
| Measurements create/select/edit/history | Shared app/runtime path pass | Shared app/runtime path pass | Required |
| Geometry Health locate/repair preview/output | Pass | Pass | Required |
| Processing/transient map previews | Shared runtime path pass | Shared runtime path pass | Required |
| Layer visibility / opacity / order | Pass | Pass | Required |
| Simple/advanced styling and labels | Shared descriptor path pass | Shared descriptor path pass | Required |
| Reference GeoJSON | Pass | Pass | Required |
| Reference XYZ/TMS | Pass | Pass | Required |
| GeoTIFF/static-image preview | Pass | Pass | Required |
| Perspective/trace image overlays | Shared DOM path pass | Shared DOM path pass | Required |
| GIS XYZ/TMS/WMS services | Pass | Pass | Required |
| Remote GeoJSON/ArcGIS ingestion | Pass | Engine-neutral after ingestion | Required for representative source |
| CRS metadata/reprojection/export | Pass | Engine-neutral | Required for visual position |
| Typed tables/filter/calculation | Pass | Engine-neutral | No engine-specific gate |
| Attribute/spatial joins and summaries | Pass | Engine-neutral | No engine-specific gate |
| Undo/redo incl. measurement history | Pass | Engine-neutral | Required for edit workflows |
| Mobile layout structural checks | Pass | Shared UI path pass | Touch-device live gate |
| Cache swap / pan flicker regression | Pass | Pass | Required with realistic data |

## Live v1.55.4 acceptance checklist

Before v1.55.5 makes OpenLayers the default, deploy v1.55.4 and check `?mapEngine=openlayers` in a normal browser with representative data:

1. Confirm `EditPolygonMap.engine === "openlayers"` and no fallback reason.
2. Pan/zoom repeatedly with several polygons visible; vectors must not flash away.
3. Click-select point, line, polygon and true circle; Shift-click multiple; click empty map to clear.
4. Draw point, line, polygon and true circle. The clicked vertices, current segment/polygon and circle radius preview must remain visibly live before finishing. Cross the International Date Line with a LineString, polygon and true circle; each must stay on the short local branch, including after repeated horizontal world pans. Every click must register immediately, including after zooming. For a true circle over Australia/southern mid-latitudes, the final circle must remain centred on the first click and keep the same apparent circular shape/diameter as the live preview.
5. Edit polygon/line vertices and midpoint handles; verify live geometry follows the pointer and undo/redo. Repeat after several horizontal world pans: dragging one vertex or edge must not create a world-spanning seam.
6. Edit a point and true circle centre/radius, including after several horizontal world pans; the stored feature must remain on its existing longitude branch.
7. Test snapping and topology mode against adjacent geometry.
8. Create distance and area measurements; edit existing vertices/midpoints; save; undo/redo.
9. Run Geometry Health on the bow-tie fixture; use Locate and repair preview; create repaired layer.
10. Change layer style/labels, visibility, opacity and ordering.
11. Add a reference GeoJSON, XYZ/TMS reference and GeoTIFF preview; test hide/show, opacity, order and zoom.
12. Add representative XYZ/TMS/WMS/ArcGIS or remote GeoJSON data.
13. Save/reload a project containing editable vectors, references and measurements.
14. Test a larger FeatureServer/import and pan/zoom for stability/performance.
15. On a touch device, check pan/zoom, drawers, selection and one edit workflow.

Any live failure is a v1.55.4 parity defect and should be fixed before the default-engine switch. The true-circle preview/final mismatch is fixed in v1.55.4.1. The repeated-world pan disappearance is fixed in v1.55.4.2. The dateline LineString/polygon drawing and intermittent click-through issues are fixed in v1.55.4.3. The missing live draw preview and true-circle/repeated-world inverse-coordinate seam were implemented in v1.55.4.4; v1.55.4.5 fixes the startup source-order error that prevented that code from completing initialization in the deployed app. v1.55.4.6 fixes repeated-world vertex/edge/handle editing so partial edits cannot introduce +/-360n seams. v1.55.4.7 fixes standalone-point repeated-world storage, repeated-world transient circle guides and point zoom/native-tile limits. Extended live testing showed its post-restore cache clear was not sufficient by itself: v1.55.4.8 introduced the no-prehistory-paint and render-generation design, but extended live testing proved a late v1.16 `VStop` wrapper was still overriding part of that behaviour by dropping the new options argument. v1.55.4.9 removes that wrapper, hardens the edit shutdown transaction, and eliminates pointerdown-only no-op history entries. v1.55.4.10 then establishes hard project/native geometry authority for history restore. Live external-source testing subsequently found a blank WMS path and avoidable whole-app lag with the 821-feature OpenLayers ecoregions dataset; v1.55.4.11 removes forced WMS CORS, adds best-effort advertised-extent fitting, keeps full remote geometry while virtualising large sidebar listings, avoids viewport-only editable-source rebuilds, shares equivalent OpenLayers style objects and disables declutter when no label content exists. These paths now have dedicated automated regressions.

## CRS validation retained from earlier releases

The CRS core has automated coverage for identifier/WKT detection, Web Mercator, WGS 84 UTM/MGA, nested GeoJSON reprojection, preservation of extra ordinates, projected GeoJSON preparation, WKT/PRJ generation, ArcGIS source CRS metadata and multi-format export.

An earlier independent comparison against `pyproj 3.7.2` covered EPSG:3857, 7850, 7855, 7856, 28356 and 32756 using representative Australian locations; the largest reported projection-coordinate difference was about **0.000104 m**. This validates the implemented projection maths, not survey-grade datum transformations.

Known limitation: GDA94/GDA2020-to-WGS84 datum conversion uses a zero-parameter approximation rather than official distortion/grid files. The UI identifies that limitation; survey-grade datum work remains outside the current browser implementation.

## Test and audit commands

```bash
npm run check
npm run test:browser-smoke
```

`npm run check` executes repository integration checks, the runtime/repository audit, the source-binding/architecture audit and the complete Node test suite.

The browser-smoke command exercises both map adapters plus CRS, remote-source, typed-data, join/summary and Geometry Health browser harnesses.

## Release decision

v1.55.4 is suitable as the **parity baseline**, not yet as proof that every visual/touch interaction has passed on the deployed real OpenLayers library. The next decision boundary is the live acceptance checklist above. If it passes, v1.55.5 can make OpenLayers the default while retaining Leaflet as a one-release fallback.
