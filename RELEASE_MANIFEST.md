# EditPolygon v1.55.7.2 release manifest

v1.55.7.2 is a focused interaction release on top of the accepted v1.55.7.1 OpenLayers baseline. It changes how unfinished drawing and map navigation share pointer/keyboard input; it does not change project data or geometry storage.

## Draw-time navigation

For click-based drawing tools:

- single click adds a vertex/control point;
- click-and-drag pans the OpenLayers map and does **not** add a vertex;
- mouse wheel zoom remains native;
- arrow keys pan the map;
- `+` / `-` zoom the map;
- double-click/Enter/first-point completion behaviour remains unchanged;
- right-click undo remains available.

The full-screen edit overlay is pointer-transparent for click-based drawing. Normalized runtime click/move/context-menu/double-click events provide drawing input, while OpenLayers owns drag-pan and wheel-zoom.

## Freehand exception

Freehand Polygon intentionally keeps overlay pointer ownership because press-and-drag is the drawing gesture. Its wheel and keyboard navigation remain available when a freehand stroke is not actively being drawn.

## Adapter boundary

The application still performs no direct native OpenLayers navigation calls. `EditPolygonMap` adds:

- `panByPixels(dx, dy, options)`
- `zoomBy(delta, options)`

These are used by draw-time keyboard navigation and keep the application/runtime boundary intact.

## UI order

**Free polygon** is now the first item in the Draw flyout. The dynamically installed LineString command follows it, then Point and the remaining shape tools.

## Regression protection

The automated suite checks that:

- click-based drawing uses `pointer-events:none` on the full-screen edit overlay;
- Freehand Polygon restores pointer ownership;
- a runtime `pointerdrag` suppresses the following drawing click;
- normalized runtime click/double-click/mousemove/contextmenu events own click-based drawing input;
- arrow and `+` / `-` keys call adapter navigation without editing geometry;
- Free polygon precedes Point in the Draw flyout;
- OpenLayers adapter navigation methods remain public without exposing the native map.

All local deployment assets use the `20260811-v15572-draw-navigation` cache key.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final verification: **274/274 Node tests**, **8/8 browser smoke suites**, **1,696 named bindings / 198 duplicate names / 371 extra binding sites**, and **0 application engine branches / 0 application native-map calls / 0 native-map escapes**.

## Targeted live validation

1. Start **Free polygon**, place two or three vertices, then click-drag the map. The map should pan and the vertex count must not change.
2. While the polygon is unfinished, use the mouse wheel, arrow keys and `+` / `-`; navigation should work and the unfinished polygon should stay aligned.
3. Finish the polygon and confirm it remains visible/editable.
4. Try Point, LineString, Rectangle and Circle briefly; drag-panning between clicks should work.
5. Start **Freehand polygon** and confirm press-and-drag still sketches rather than pans.
6. Confirm **Free polygon** is the first Draw option.
