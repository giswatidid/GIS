# EditPolygon v1.55.1.5 — OpenLayers map-selection parity fix

## Purpose

v1.55.1.5 fixes live map selection behaviour discovered while testing the OpenLayers parity runtime. It does not change the project model or make OpenLayers the default renderer.

## Fixed

- Click a visible editable feature on the map to select it immediately.
- Normal click replaces the existing selection.
- Shift-click adds another feature to the current selection.
- Ctrl/Cmd-click toggles an individual feature in the selection.
- Clicking empty map clears the selection.
- Map selection now hit-tests Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon geometry using screen-pixel tolerances appropriate to the rendered symbol.
- Parametric `CircleByCenterPoint` features participate in the same click-selection workflow and can be selected by clicking inside the displayed circle.
- Polygon edges can still be selected when clicking close to their outline.
- The map selection path now uses the same v1.33 selection state as the Layers panel, eliminating divergent active/picked state.
- OpenLayers cached vector styles are refreshed immediately when map or Layers selection changes; no zoom or pan is required to reveal the selection highlight.
- The overlap picker now says “feature” instead of assuming every selectable object is a polygon.

## Selection semantics

| Interaction | Result |
| --- | --- |
| Click feature | Select only that feature |
| Shift-click feature | Add feature to current selection |
| Ctrl/Cmd-click feature | Toggle feature |
| Click empty map | Clear selection |
| Alt-click stacked features | Cycle through features under the cursor |

## Engine scope

The hit-test logic is map-engine neutral and is used by both Leaflet and OpenLayers. OpenLayers remains opt-in with `?mapEngine=openlayers`.
