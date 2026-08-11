# EditPolygon v1.55.7.3 release manifest

v1.55.7.3 is a focused draw-preview hotfix on top of the accepted v1.55.7.2 draw-navigation release. It does not change project data, geometry storage or draw completion semantics.

## Fixed regression

After v1.55.7.2 allowed OpenLayers pan/zoom while a click-based geometry remained unfinished, the cursor-linked guide/fill could briefly show an older position while the map view moved. The committed vertices were correct; only the transient pointer-linked preview could lag by one rendered frame.

The live draw state now retains the pointer's screen pixel. Whenever the view centre/resolution changes, EditPolygon immediately converts that screen pixel back to the current map coordinate and refreshes the runtime transient vector overlay before the deferred DOM-overlay repaint. This keeps the preview attached to the pointer while the map moves.

The resynchronisation covers:

- click-and-drag pan while drawing;
- mouse-wheel zoom;
- keyboard `+` / `-` zoom;
- arrow-key pan;
- view reset / resize refreshes.

Committed vertices are never moved by this logic. Freehand Polygon remains unchanged because its press-and-drag gesture draws geometry rather than navigating the map.

## Regression protection

The automated suite verifies that:

- the cursor can be reprojected from its stored screen pixel after a view change;
- `move`/`resize` refresh the runtime cursor-linked preview synchronously;
- zoom-start/zoom-end paths resynchronise the live cursor before rendering;
- pointer-drag and pointer-move events remember screen position;
- all v1.55.7.2 drag-without-vertex and keyboard/wheel navigation behaviour remains intact.

All local deployment assets use the `20260811-v15573-draw-preview-pan` cache key.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final verification: **276/276 Node tests**, **8/8 browser smoke suites**, **1,699 named bindings / 198 duplicate names / 371 extra binding sites**, and **0 application engine branches / 0 application native-map calls / 0 native-map escapes**.

## Targeted live validation

1. Start **Free polygon** and place three vertices.
2. Move the pointer away from the last vertex so the dashed live guide is obvious.
3. Click-drag the map several times. The guide/fill should stay attached to the pointer with no old-position ghost.
4. Repeat with wheel zoom and `+` / `-`.
5. Finish the polygon and confirm it remains visible/editable.
6. Confirm Freehand Polygon still draws normally with press-and-drag.
