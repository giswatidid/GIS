# EditPolygon architecture

This document describes the current application architecture as of **v1.55.6**.

## Runtime authority

EditPolygon now has **one map implementation: OpenLayers**. `docs/assets/editpolygon-map-adapter.js` owns every native map object and exposes the engine-neutral `EditPolygonMap` contract consumed by application code.

There is no alternate map selector, automatic map-engine fallback, compatibility map, synchronized secondary map, or application-level native-map escape hatch. `createRuntime()` constructs the OpenLayers runtime directly.

The application may know the runtime name for diagnostics (`document.body.dataset.mapEngine`), but feature behaviour and rendering must not branch on it.

## Application boundary

`docs/assets/editpolygon-app.js` owns the canonical application and GIS model:

- project files and editable features;
- selection and editing state;
- history and undo/redo;
- measurements and annotations;
- styling and labels;
- CRS/schema/join/analysis state;
- Geometry Health;
- reference/service definitions;
- project persistence orchestration.

Application code talks to the map only through `MAP_RUNTIME` / `EditPolygonMap`. Direct `ol.*` calls are prohibited outside the adapter and enforced by repository audits.

## OpenLayers adapter ownership

`docs/assets/editpolygon-map-adapter.js` owns:

- map/view creation and navigation;
- coordinate ↔ pixel conversion;
- horizontal world wrapping and canonical-world materialisation;
- map events and resize handling;
- XYZ/TMS and WMS layers;
- editable vector layers;
- vector overlays and DOM overlays;
- static/raster image layers;
- hit detection;
- live editable-geometry updates;
- focused-feature suppression;
- z-order, visibility and opacity;
- native source reuse and spatial indexing.

The adapter can expose `getNativeMap()` internally for adapter-oriented tests or integration work, but the application is forbidden from using it.

## Authoritative editable renderer

The final editable display path is the cached renderer beginning at `buildRuntimeCachedLayer()`.

Its contract is:

1. canonical project geometry is the durable authority;
2. application code resolves engine-neutral style/label descriptors;
3. the adapter creates and owns native vector layers;
4. cache identity includes model/render generation and geometry-content fingerprints;
5. history invalidation can hard-purge adapter-owned editable layers before rebuilding from the restored model;
6. live native geometry mutation is permitted only as transient pointer feedback during an active edit;
7. completion reconciles the display back to project geometry.

A monotonic history render epoch prevents an older restored state from accidentally reusing a later live-edit representation.

## Large-vector display strategy

Large editable datasets use a two-tier OpenLayers strategy:

- the complete background dataset can remain in a persistent indexed `VectorSource` and use image-backed vector rendering for fast pan/zoom;
- selected, picked or actively edited features are isolated into a small precise vector overlay.

This avoids promoting hundreds or thousands of unrelated features to the precision editing path while preserving exact source coordinates for the focused feature. Large-layer sidebar rendering is also bounded independently of the complete GIS dataset.

## World-wrap and Date Line model

EditPolygon stores durable geographic geometry in a canonical/continuous longitude model while allowing the map to show repeated-world copies.

Key rules:

- standalone points and true-circle centres are canonicalised;
- line/polygon geometry may retain a continuous longitude branch such as `179 → 181` so Date Line paths remain local;
- pointer edits are rebranched beside the stored geometry before commit;
- pixel/coordinate conversion chooses the nearest displayed world copy;
- viewport spatial queries are longitude-periodic;
- true-circle display materialisation and hit testing use the same projection-aware geometry.

These rules apply to drawing, vertex/edge movement, whole-feature movement, transient guides and history restoration.

## Selection and editing overlays

Selection highlighting, focused precision display, transient drawing geometry, snapping/topology feedback, Geometry Health previews and edit handles are runtime-owned overlays.

DOM overlays are reserved for interaction surfaces that genuinely need DOM hit targets. They must not become a second geometry authority.

## Remote and reference layers

The GIS workspace stores remote service definitions independently of their live OpenLayers objects. Runtime reconstruction creates display layers from those definitions.

Supported runtime paths include:

- Remote GeoJSON;
- ArcGIS FeatureServer / MapServer ingestion;
- XYZ/TMS;
- WMS;
- reference GeoJSON;
- static/GeoTIFF preview imagery where supported.

WMS definitions persist URL, layer/style parameters and display state. Visibility means actual runtime map membership, not only a UI flag.

## Project-container boundary

Manual projects are saved as **`.epz`** through `docs/assets/editpolygon-project-format.js`.

An EPZ is a lossless ZIP/DEFLATE container:

```text
project.epz
├── manifest.json
├── project.json
└── assets/
```

`project.json` remains the canonical project payload. Compression does not round, simplify or otherwise alter geometry. `manifest.json` records the container format/version and SHA-256 integrity metadata. `assets/` is reserved for future binary project resources.

The persistence normaliser must preserve `gisWorkspace` and `referenceOverlays` so live services reconstruct after reload.

## Mobile parity

Phone, tablet and desktop expose the same core GIS functionality. Mobile uses responsive drawers/sheets and bottom-dock actions rather than a reduced application mode.

Mobile invariants include:

- Advanced GIS is directly reachable;
- Layers and Inspector are viewport-safe;
- touch targets are appropriately sized;
- portaled layer/GIS action menus remain above drawers and inside the viewport;
- pinch/pan/draw/edit interactions use the same map runtime;
- synthetic layout resize notifications must not recursively trigger the mobile resize scheduler.

## Runtime authority boundary

The end of `editpolygon-app.js` contains the v1.55.6 runtime-authority boundary. No later feature monkey-patches may be appended after that point.

Public high-risk functions such as `renderMap`, selection, history and vertex-editor shutdown use stable identities/delegates. Repository audits fail if critical functions gain another late reassignment.

## Historical binding debt

The application remains a large historically layered file. v1.55.6 audits currently allow at most:

- **198** duplicated function-binding names;
- **371** extra historical binding sites.

Those are ceilings, not targets. New work should reduce them through extraction/modularisation rather than adding wrappers.

The previous map-engine removal eliminated all direct retired-native calls from application code and reduced the transition surface to a single runtime.

## Quality gates

The repository uses three complementary static gates:

- `scripts/check-repo.mjs` — deployment/integration structure;
- `scripts/audit-runtime.mjs` — single-runtime, persistence, renderer and deployment invariants;
- `scripts/audit-bindings.mjs` — source-order authority and binding-debt ceilings.

Node unit tests cover the canonical models and adapter contract. Browser smoke suites cover OpenLayers parity, CRS, remote sources, schema/data tools, joins, Geometry Health and mobile/touch behaviour.

## Next architecture step

**v1.55.7** should be an OpenLayers-only optimisation and cleanup release. Priorities are source reuse, feature-level updates, hit detection, render buffers, style caching, very-large-data interaction performance and further reduction of historical wrapper debt. After that, roadmap work can return to the Processing Toolbox and broader GIS capabilities.
