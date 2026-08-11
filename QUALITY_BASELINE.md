# EditPolygon quality baseline

**Current baseline: v1.55.7.4.** OpenLayers is the sole map runtime. This release preserves the v1.55.7 cleanup, v1.55.7.1 startup hotfix, v1.55.7.2 draw-time navigation and v1.55.7.3 screen-pixel cursor reprojection, while removing the remaining duplicate screen-space SVG sketch renderer. OpenLayers now exclusively owns unfinished sketch linework/fill; the DOM overlay retains only handles and hints.

## Current automated gate

A release must pass:

```bash
npm run check
npm run test:browser-smoke
```

v1.55.7.4 currently expects:

- **277/277 Node tests**;
- **8/8 browser smoke suites**;
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

The v1.55.7.4 no-growth ceilings are:

- **198 duplicate function-binding names**;
- **371 extra historical binding sites**.

The current audit sees **1,699 named bindings**. Critical runtime functions must retain stable identities. No new feature function may be appended after the runtime-authority boundary. These debt counts should decrease as the application is modularised.

## Live parity evidence carried into v1.55.7.4

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

The next feature work is the Processing Toolbox. New processing tools must continue to use the canonical project/geometry model, produce normal undoable layers with provenance where appropriate, and stay independent of native OpenLayers objects.
