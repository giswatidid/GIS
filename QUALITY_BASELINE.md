# EditPolygon quality baseline

**Current baseline: v1.55.6.** OpenLayers is the sole map runtime. The desktop/mobile parity campaign and the v1.55.5 default-engine soak passed before the previous runtime was removed.

## Current automated gate

A release must pass:

```bash
npm run check
npm run test:browser-smoke
```

v1.55.6 currently expects:

- **266/266 Node tests**;
- **8/8 browser smoke suites** after removal of the obsolete alternate-runtime smoke;
- repository integration audit;
- runtime/repository audit;
- binding/architecture audit;
- JavaScript syntax validation for critical runtime modules.


## Architecture invariants

### One map runtime

- OpenLayers is the only native map implementation.
- Normal startup has no engine selector or compatibility fallback.
- Application code contains **0 direct `ol.*` calls**.
- Application code contains **0 direct retired-native calls**.
- Application code contains **0 `getNativeMap` escapes**.
- Native calls belong in `editpolygon-map-adapter.js`.

### One editable display authority

The final cached renderer owns editable display materialisation through `EditPolygonMap.createEditableVectorLayer()`.

Cache reuse is guarded by:

- render generation;
- monotonic history epoch;
- geometry-content fingerprints;
- native/model geometry identity checks;
- owner-keyed hard purge on history restoration.

A live drag may mutate the focused native feature for pointer responsiveness, but the project model becomes authoritative again at commit/end-of-edit.

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

The v1.55.6 no-growth ceilings are:

- **198 duplicate function-binding names**;
- **371 extra historical binding sites**.

Critical runtime functions must retain stable identities. No new feature function may be appended after the runtime-authority boundary.

These numbers should decrease as the application is modularised.

## Live parity evidence carried into v1.55.6

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

v1.55.5 then made OpenLayers the normal/default runtime and was live-confirmed before v1.55.6 removed the alternate implementation.

## v1.55.7 gate

The next release may optimise aggressively because there is only one runtime, but it must not weaken the invariants above. Performance changes should be measured against large vector datasets while preserving exact canonical geometry and editing semantics.
