# EditPolygon v1.55.1.9 — OpenLayers true-circle click event fix

## Scope

This release is deliberately focused on the remaining ordinary click-selection failure for `CircleByCenterPoint` features in OpenLayers mode. It does not advance the wider OpenLayers migration.

## Root cause

The previous fixes concentrated on circle geometry hit-testing and candidate resolution. Those paths were valid, but they could never run when a legacy Leaflet compatibility element intercepted the browser click before OpenLayers emitted its map click event.

The temporary OpenLayers parity architecture still has a synchronized Leaflet compatibility surface above the OpenLayers viewport for the remaining reference/image paths. Its CSS had broadly re-enabled pointer events for `.leaflet-interactive` elements. True circles were uniquely exposed because the historic Leaflet circle renderer was interactive and carried its own click handler. This could swallow the DOM click even though rectangle/lasso/spatial selection continued to work, because those tools use their own overlay/spatial-query paths.

## Fix

v1.55.1.9 fixes the event architecture at three levels:

1. The native OpenLayers map-click path remains authoritative for normal map clicks.
2. The map adapter now installs a narrowly scoped capture-phase fallback on the map container for clicks originating inside the Leaflet compatibility surface but outside the OpenLayers viewport. After specialized overlay handlers have had a chance to mark the event handled, the fallback normalizes the pixel/lon-lat and sends the click through the same EditPolygon selection handler.
3. Legacy Leaflet circle layers are explicitly non-interactive whenever OpenLayers is active. The compatibility CSS also no longer globally enables pointer events for `.leaflet-interactive`; only the legacy popup pane remains pointer-enabled.

The geometry-aware true-circle hit-testing added in earlier releases remains in place as a second layer of protection. The important change here is that the click is now guaranteed to reach that selection system rather than being lost in the compatibility DOM.

## Regression coverage

The OpenLayers browser smoke test now creates a real DOM element representing a legacy `.leaflet-interactive` circle above the OpenLayers viewport, dispatches a browser click to that blocking element, and verifies that EditPolygon still receives the normalized map click at the correct map pixel and coordinate.

Additional automated checks assert that:

- compatibility `.leaflet-interactive` geometry cannot accept pointer events in OpenLayers mode;
- the legacy Leaflet true-circle renderer is non-interactive in OpenLayers mode;
- the compatibility-surface click fallback remains wired into the map adapter;
- normal OpenLayers map clicks continue using the native OpenLayers event path.

## Validation

The working release passes the complete repository check and all browser smoke suites. The final GitHub ZIP is also re-extracted and retested before delivery.
