# EditPolygon v1.55.7.4 release manifest

v1.55.7.4 is a focused live-sketch rendering hotfix on top of v1.55.7.3. It does not change project data, committed geometry, draw completion semantics or the v1.55.7.2 navigation model.

## Fixed regression

The remaining pan/zoom ghost came from **duplicate preview authority**. Unfinished drawing geometry was being painted twice: once as an OpenLayers transient vector layer and again as historical screen-space SVG paths in `#editOverlay`. At rest both copies overlap exactly, but during map movement the SVG copy can repaint one frame behind the native vector layer, revealing the old dashed guide/fill as a ghost.

v1.55.7.4 removes geometry painting from the SVG draw overlay. OpenLayers now exclusively renders live sketch linework, fill, cursor and guide geometry. The DOM overlay remains responsible only for interactive vertex handles and textual draw hints.

The v1.55.7.3 screen-pixel cursor resynchronisation remains in place, so the sole OpenLayers preview continues to follow the mouse correctly during pan/zoom.

## Regression protection

The automated suite verifies that:

- `drawRuntimePreviewItems()` continues to supply polygon fill, linework, live guide and cursor geometry to the adapter-owned transient vector layer;
- the authoritative `renderDrawOverlay()` no longer writes `drawFillPath`, `drawLinePath` or `drawPreviewPath`;
- the late LineString compatibility wrapper cannot reintroduce SVG sketch geometry;
- click-drag navigation still pans without creating a vertex;
- screen-pixel cursor reprojection remains active during map movement;
- Freehand Polygon keeps press-and-drag ownership.

All local deployment assets use the `20260811-v15574-single-sketch-authority` cache key.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final automated verification: **277/277 Node tests**, **8/8 browser smoke suites**, **1,699 named bindings / 198 duplicate names / 371 extra binding sites**, and **0 application engine branches / 0 application native-map calls / 0 native-map escapes**.

## Targeted live validation

1. Start **Free polygon** and place at least three vertices.
2. Move the mouse so the dashed live guide and temporary fill are obvious.
3. Click-drag the map repeatedly. There should be **one** live guide/fill and no old-position ghost.
4. Repeat with wheel zoom and keyboard navigation.
5. Finish the polygon and confirm it remains visible/editable.
6. Confirm Freehand Polygon still draws normally with press-and-drag.
