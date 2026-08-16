# EditPolygon quality baseline

**Current baseline: v1.56.1.** OpenLayers remains the sole map runtime. The accepted v1.55.7.4 drawing/rendering baseline is unchanged; v1.56.1 completes the Processing Toolbox consolidation with 32 declarative tools, shared spatial/schema/GEOS engines and generic layer/modify/selection result contracts.

## Current automated gate

A release must pass:

```bash
npm run check
npm run test:browser-smoke
```

v1.56.1 currently expects:

- **304/304 Node tests**;
- **9/9 browser smoke suites**;
- repository integration audit;
- runtime/repository audit;
- binding/architecture audit;
- JavaScript syntax validation for critical runtime modules.

## Architecture invariants

### One map runtime

- OpenLayers is the only native map implementation.
- Normal startup has no engine selector or compatibility fallback.
- Application code contains **0 runtime-engine branches**.
- Application code contains **0 direct `ol.*` calls**.
- Application code contains **0 native-map escapes**.
- Native implementation calls belong in `editpolygon-map-adapter.js`.

### One editable display authority

The final cached renderer owns editable display materialisation through `EditPolygonMap.createEditableVectorLayer()`.

Cache reuse is guarded by:

- render generation;
- monotonic history epoch;
- geometry-content fingerprints;
- native/model geometry identity checks;
- owner-keyed hard purge on history restoration.

A live drag may mutate the focused native feature for pointer responsiveness, but the project model becomes authoritative again at commit/end-of-edit.

### Runtime performance invariants

- One `ol.format.GeoJSON` formatter is reused per runtime rather than recreated in live geometry paths.
- DOM overlays share runtime-owned map/view subscriptions; adding overlays must not add per-overlay map listeners.
- DOM-overlay movement refresh is requestAnimationFrame-batched.
- Zoom lifecycle uses a central detector/fan-out; multiple `zoomstart` and `zoomend` subscribers must all be notified exactly once for the same logical transition.
- OpenLayers setters/source mutations are not followed by redundant explicit render invalidations unless a specific path demonstrably requires one.
- The removed single-runtime pan-recovery compatibility listener stack must not return.
- Click-based drawing keeps the edit overlay pointer-transparent so native OpenLayers drag-pan and wheel-zoom interactions remain available.
- A map `pointerdrag` during drawing suppresses the following map click from becoming a geometry vertex.
- Freehand Polygon retains pointer-drag ownership; it is the only polygon draw mode where dragging draws instead of panning.
- Draw-time arrow keys and `+` / `-` route through adapter-owned navigation methods and must not mutate geometry.
- The unfinished click-based draw cursor is screen-pixel anchored across view movement; synchronous runtime-preview refresh must occur before the deferred DOM overlay pass so a former pointer-linked guide/fill cannot flash during pan/zoom.

### Processing Toolbox invariants

- The canonical 32-tool catalogue is declarative and lives in `gis-processing-registry.js`.
- Processing membership has only three scopes: **all**, **filtered** and **selected**; feature visibility is not a processing filter.
- `gis-processing-core.js` owns generic request/pre-flight/result/provenance/CRS contracts; algorithms do not leak back into application code.
- The sole worker delegates to `gis-processing-engine.js`; `gis-analysis-worker.js` is retired and must not be packaged.
- `gis-spatial-core.js` is the shared spatial index/relationship/nearest engine used by both Processing and Join & Summarize.
- `gis-geos-adapter.js` is the shared low-level GEOS-WASM boundary used by Geometry Health and robust Processing operations.
- Typed attribute selection uses the schema/filter predicate engine rather than a separate text-only comparator.
- Pre-flight validation rejects missing/unsupported layers, scopes, geometry families, fields and parameters before worker execution.
- Cancellation and worker failure do not mutate the project.
- New-layer and permitted in-place operations are each committed as exactly one history transaction; selection results create no layer.
- Per-feature failures carry feature identity/message; aggregate jobs that would be misleading if partial fail atomically.
- Provenance records every input/scope, parameters, output policy, actual processing CRS, engine and result/failure metadata and survives `.epz`.
- Projected GEOS operations transform cloned WGS 84 input to a suitable metric CRS and transform output back before commit; provenance records the CRS actually used.
- Join & Summarize may offer a specialised workflow, but it must not own a second dissolve or spatial-match implementation.
- The Simple Editor must not reintroduce independent Merge/Dissolve, Cut/Difference, Intersection, Clip, Erase, Repair or Simplify processing kernels. It may keep direct graphical editing operations such as Offset/inset, Split by drawn line, holes and Smooth, while feature and multi-selection shortcuts open the authoritative Processing Toolbox.

### Large-data interaction

Performance-managed editable datasets keep a persistent native indexed source. Normal pan/zoom can use image-backed vector rendering, while selected/picked/edited geometry is displayed in a separate precise overlay. This preserves editing accuracy without making the complete source layer precision-rendered during one-feature interaction.

### World-wrap correctness

The following are regression requirements:

- repeated horizontal world pans do not make editable geometry disappear;
- Date Line lines/polygons remain local rather than wrapping around the globe;
- vertex/edge/whole-feature edits remain on the stored longitude branch;
- points and true-circle centres remain canonical in saved data;
- true-circle previews, final display, edit guides and hit tests agree;
- history restoration cannot resurrect a live-mutated world-copy representation.

### Project persistence

`.epz` is lossless packaging around the canonical project JSON. Save/reload must preserve:

- editable geometry and attributes;
- true-circle semantics;
- measurements/annotations;
- styles and labels;
- visibility, opacity and order;
- GIS workspace definitions;
- reference overlays;
- WMS/service definitions and display state.

Compression is never a geometry simplification mechanism.

### Mobile parity

Mobile is a first-class interface. The quality gate covers:

- Advanced GIS access;
- full-width Layers/Inspector drawers;
- Project sheet access;
- touch-sized controls;
- OpenLayers controls;
- layer/GIS action popovers above the drawer;
- viewport/horizontal-overflow safety;
- touch interaction after drawer/workspace transitions.

## Binding/source-order baseline

The v1.56.1 no-growth ceilings are:

- **196 duplicate function-binding names**;
- **369 extra historical binding sites**.

The current audit sees **1,670 named bindings**. Critical runtime functions must retain stable identities. No new feature function may be appended after the runtime-authority boundary. These debt counts should decrease as the application is modularised.

## Live parity evidence carried into v1.56.1

The deployed OpenLayers path has been manually exercised for:

- map startup/navigation and repeated-world movement;
- point, line, polygon and true-circle drawing/editing;
- Date Line geometry;
- vertex/edge/whole-feature movement;
- undo/redo with immediate visual authority;
- snapping and topology;
- measurements;
- Geometry Health locate/preview/repair interactions;
- simple/advanced styling and labels;
- visibility, opacity and ordering;
- Remote GeoJSON;
- ArcGIS FeatureServer and MapServer paths;
- WMS;
- complex/large vector data and focused editing performance;
- `.epz` save/reload including WMS persistence;
- phone/touch GIS access and mobile action menus.

v1.55.5 made OpenLayers the normal runtime, v1.55.6 removed the alternate implementation, v1.55.7 performed the first single-runtime cleanup, v1.55.7.1 fixed the startup regression discovered during live validation, and v1.55.7.2 restored full map navigation while drawing click-based geometry, v1.55.7.3 reprojected the live cursor from screen pixels during view movement, and v1.55.7.4 makes the transient OpenLayers vector overlay the sole unfinished-sketch geometry renderer.

## Next gate

v1.56 is complete. Proceed to **v1.57 large-data performance** without weakening the Processing/Spatial/GEOS ownership boundaries established here.
