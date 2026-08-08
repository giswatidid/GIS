# EditPolygon v1.55.1.8 — true-circle click selection and pan-render continuity

v1.55.1.8 fixes two defects found during live OpenLayers parity testing.

## True-circle ordinary click selection

Rectangle, polygon and lasso selection already understood canonical `CircleByCenterPoint` geometry, but an ordinary map click could still miss a visible true circle. The click path now combines two independent signals without forcing either through the older geometry-bbox path:

- OpenLayers' actual rendered-feature hit result is resolved directly back to the EditPolygon project feature; and
- true circles are additionally tested against their visible screen-space centre/radius footprint.

This means ordinary click selection follows the same visible circle the user sees on the map. Locked geometry also remains selectable for inspection; locking continues to prevent editing rather than inspection.

## OpenLayers pan flicker

The large-vector viewport renderer rebuilds its cached candidate layer after a pan. The previous sequence removed the old OpenLayers layer before the replacement was added. Because OpenLayers paints asynchronously, that could expose a single empty vector frame and make polygons flash off briefly.

OpenLayers cache replacement is now atomic from the user's perspective: the new layer is built and added first, then the previous cached layer is removed in the same JavaScript task. Leaflet retains its existing replacement order.

## Regression coverage

Tests now assert that:

- rendered OpenLayers hit IDs resolve directly to project features;
- true-circle click hit testing uses the visible pixel footprint;
- locked features are not excluded from click selection; and
- OpenLayers cached-vector replacement adds the next layer before removing the previous one.
