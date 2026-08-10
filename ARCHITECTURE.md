# EditPolygon architecture

This document describes the current application architecture as of **v1.55.4.14**, retaining the v1.55.4 dual-engine parity/quality architecture baseline before OpenLayers becomes the default renderer.

## Product boundary

EditPolygon is a static, browser-local GIS editor. Local files, editable geometry, schemas/attributes, processing outputs, autosave and exports remain in the browser. Remote basemaps and public GIS services are contacted directly by the browser only when used.

The application has one authoritative model rather than separate simple/advanced editors:

- one project/file/feature model;
- one selection model;
- one history/undo model;
- one schema/attribute model;
- one style/label model;
- one processing-output model.

Editable spatial geometry is stored canonically as WGS 84 GeoJSON longitude/latitude coordinates. Source/native/export CRS metadata is maintained separately.

## Runtime layers

### GIS/domain modules

Reusable GIS behaviour belongs in focused modules where practical:

- `gis-core.js`
- `gis-data-core.js`
- `gis-schema-core.js`
- `gis-analysis-core.js`
- `gis-join-core.js`
- `gis-style-core.js`
- `gis-crs-core.js`
- `gis-geometry-health-core.js`
- `gis-remote-source.js`

Long-running analysis, joins and Geometry Health use web workers.

### Application controller

`docs/assets/editpolygon-app.js` remains the historical application controller and UI integration layer. It is still large and contains older enhancement sections, so v1.55.4 treats **source order as an explicit engineering risk** rather than assuming the last patch is harmless.

New work must not append another late compatibility wrapper merely to alter a core runtime function. v1.55.4 publishes a final runtime-authority boundary and automatically rejects function patches after it. v1.55.4.5 additionally treats lexical initialization order as part of that source-order contract: state read by startup rendering must be initialized before the first `renderAll()` can reach it. v1.55.4.6 extends the repeated-world contract into editing: screen/pointer coordinates are rebranched to the stored coordinate they replace before partial geometry edits are committed, so one edited vertex cannot be separated from untouched neighbours by an accidental +/-360n offset. v1.55.4.7 separates **canonical storage** from **repeated-world display** more explicitly: standalone Point/MultiPoint coordinates and true-circle centres are canonical CRS84 longitudes; path geometry may retain continuous longitudes across the Date Line; and the OpenLayers adapter canonicalises vector projection inputs while preserving local path continuity. v1.55.4.8 tightens the history/render boundary: closing vertex editing for undo/redo performs no intermediate map paint, restored state is installed before the one authoritative render, and render-cache invalidation advances a monotonic generation so historical feature revisions cannot collide with geometry that was live-mutated in the native vector layer. v1.55.4.9 completes that lifecycle boundary by removing the late v1.16 `VStop` wrapper that was discarding the no-render option at runtime. `VStop` is now a stable, non-reassignable lifecycle authority that drains pending edit listeners/RAFs/timers before history replacement, and drag tools only create history once a real geometry change begins. v1.55.4.10 then makes the renderer itself enforce geometry authority: history advances a non-serialised render epoch, cached signatures include geometry-content fingerprints, selected native features are checked against the project model before cache reuse, and adapter-owned editable layers can be hard-purged by layer key. Native live geometry is therefore transient pointer feedback only; after commit or history restore the project model is the sole source used to rematerialise editable map layers. v1.55.4.11 extends the same stable-runtime principle to large remote vectors and WMS: cached editable-layer identity depends on the candidate feature set rather than raw viewport coordinates, identical OpenLayers feature styles are shared, decluttering is enabled only when label/annotation content needs it, and large editable remote datasets keep full geometry while their sidebar is virtualised. WMS CORS is opt-in rather than forced; GeoServer hints live in the adapter, while capabilities-based advertised extents are discovered opportunistically in the application for zoom-to-source UX. v1.55.4.12 makes the native-source ownership boundary explicit for performance-managed vectors: the application may ask whether a runtime prefers a persistent editable source, OpenLayers answers yes because its `VectorSource` owns spatial indexing/wrap, and Leaflet keeps the application-culling path. Heavy OpenLayers layers may use the adapter-owned image-backed vector renderer for interaction. Service visibility is also a map-membership contract on both engines, so a newly created off-map WMS layer is added when shown and removed when hidden. v1.55.4.13 refines that boundary again: a heavy layer no longer changes its whole renderer merely because one feature is selected or edited. The persistent image-backed background carries normal layer styling, while a small adapter-owned normal-vector focus overlay carries selection/picked styling and precision edit geometry. During an active edit only the focused background feature is suppressed; live geometry updates target the focus overlay first. The application asks for this capability through the map-runtime contract, so there are still no application-level OpenLayers calls. v1.55.4.14 extends canonicalisation to object creation: annotation/measurement conversion and direct Point drawing share one geometry-family default-style helper, so equivalent GIS Point features do not acquire different symbols merely because they entered the model through different tools.

### Map abstraction

Application code talks to `EditPolygonMap`, created by `editpolygon-map-adapter.js`.

The map contract owns:

- map creation/view state;
- longitude/latitude ↔ screen/layer pixel conversion;
- extent fitting, resize and pan/zoom interaction control;
- normalised map events;
- display layer add/remove/visibility/opacity/z-order;
- named display panes where the engine supports them;
- basemap/XYZ/TMS/WMS creation;
- reference GeoJSON/static-image creation;
- editable vector rendering and rendered-feature hit testing;
- feature-level live geometry updates;
- transient vector overlays;
- DOM edit/measurement handles.

Dependency direction:

```text
EditPolygon project/GIS/UI logic
              |
              v
       EditPolygonMap API
              |
        +-----+------+
        |            |
     Leaflet     OpenLayers
   transition       parity
     engine         engine
```

Direct `ol.*` calls in application code are prohibited. Remaining direct `L.*` calls are explicitly budgeted transition debt and are confined to legacy Leaflet-only renderers that disappear when Leaflet is removed. Application code has no `getNativeMap()` escape; ordinary renderer/layer/view work must stay on the adapter contract.

## OpenLayers migration state

OpenLayers remains opt-in with `?mapEngine=openlayers`; Leaflet remains the default/reference renderer during the v1.55.4 parity gate.

OpenLayers runs independently: there is no hidden/synchronised Leaflet map, compatibility target, compatibility click bridge or legacy-map global.

OpenLayers coordinate inversion preserves the continuous longitude represented by the active EPSG:3857 world copy rather than exposing `ol.proj.toLonLat()`'s canonical ±180° wrap to application drawing/edit logic. Live draw geometry is mirrored through the shared transient-vector overlay contract, while the DOM edit overlay remains responsible for pointer capture, vertex dots and hints.

OpenLayers currently owns its own:

- map/view/navigation and basemaps;
- current editable-vector renderer and hit detection;
- live geometry updates;
- GIS XYZ/TMS/WMS layers;
- reference GeoJSON, tiles and GeoTIFF/static-image previews;
- Geometry Health/processing overlays;
- measurements and measurement editing;
- point/circle edit handles;
- search/endpoint markers;
- engine-neutral perspective/trace overlay positioning.

## Rendering authority

The authoritative editable renderer is `cachedRenderMap` near the end of `editpolygon-app.js`.

Both map engines receive the same engine-neutral feature descriptors through `MAP_RUNTIME.createEditableVectorLayer()`. The renderer contains no direct `L.*`, no direct `ol.*`, and no engine branch.

The cache design:

- includes viewport, style, label and selection state in its signature;
- updates individual dragged geometry through `updateEditableFeatureGeometry` when possible;
- adds the replacement layer before removing the old one to avoid blank frames;
- removes sleeping/table-only layers from the spatial render path.

Historical Leaflet renderers still exist earlier in the file because Leaflet remains a transition engine. They are not OpenLayers renderers and are guarded from OpenLayers execution. They will be removed with Leaflet rather than being disguised as shared code.

## Selection authority

Ordinary click selection, spatial-selection tools, Layers and Inspector share the project selection state.

Critical click-selection functions have exactly one source binding and are protected by audit:

- `featuresAtLatLng`
- `featureHitAtMapPoint`
- `parametricCircleHitAtMapPoint`
- `applyMapFeatureSelection`
- `selectFromMapClick`

True circles are hit-tested using the same materialised display geometry used by the current renderer, avoiding a second competing circle representation.

Selection style refresh calls the same authoritative cached renderer for both engines.

## Runtime lifecycle

Cross-cutting edit subsystems register lifecycle callbacks through the v1.55.4 runtime-transition registry rather than wrapping selection/delete/history functions later in the source.

Current transition events include:

- `selection`
- `delete`
- `history`

This is used by point and true-circle editing to end/cancel edit state safely when another application action takes control.

## References and GIS services

Reference tile, normal GeoJSON and static-raster/GeoTIFF display use map-runtime primitives on both engines. Visibility, opacity, order and removal are runtime-owned.

The only special reference renderer still outside the adapter is the **Leaflet-only large/full-detail reference canvas** used for very large reference GeoJSON while Leaflet remains supported. It cannot execute in OpenLayers mode.

Perspective/georeferenceable trace images remain DOM overlays because a four-corner projective transform cannot be represented faithfully by a rectangular static-image extent.

GIS XYZ/TMS/WMS creation and runtime visibility/opacity/z-order also use the map contract. WMS source construction does not force CORS: providers that can be displayed as images but do not grant browser-readable CORS remain usable, while callers may opt into a cross-origin mode when needed. GeoServer URLs receive adapter-owned `serverType`/tiled hints. The application may fetch WMS capabilities on a best-effort basis to persist advertised geographic bounds and fit the view; failure to read capabilities does not block tile display.

## History and outputs

Consequential GIS operations materialise normal project layers/tables with provenance. Measurements have compact measurement-specific history entries while structural project history retains them when needed.

## Source-order / wrapper debt policy

The application grew historically through appended enhancement blocks. v1.55.4 does not attempt a dangerous all-at-once rewrite while map parity is being proven.

Instead it establishes enforceable rules:

1. core public runtime entry points (`renderMap`, selection/clear, delete, undo and redo) keep stable function identities; later stages update private delegates or lifecycle hooks instead of replacing the public functions;
2. critical click-selection functions have one authoritative binding;
3. the current cached renderer is engine-neutral;
4. no function patch is permitted after the runtime-authority boundary;
5. major historical wrapper chains have no-growth ceilings;
6. application-level OpenLayers implementation calls are forbidden;
7. direct Leaflet application debt has a no-growth ceiling and must remain confined to documented transition blocks;
8. future work should reduce those ceilings as code moves into authoritative modules/functions.

See `QUALITY_BASELINE.md` for counts, automated parity evidence and the live acceptance matrix.

## Migration sequence after v1.55.4

1. Complete the deployed real-browser parity gate documented in `QUALITY_BASELINE.md`.
2. **v1.55.5:** make OpenLayers the default; keep `?mapEngine=leaflet` as a one-release fallback.
3. **v1.55.6:** remove Leaflet dependency/runtime/renderers/CSS/workarounds and lower the wrapper/direct-call debt ceilings.
4. **v1.55.7:** OpenLayers-specific cleanup and performance work (source reuse, hit detection, render buffers, style caches, large-data pan/zoom stability).
5. Resume the GIS roadmap with the Processing Toolbox.
