# v1.55.1.1 — OpenLayers parity runtime hotfix

This hotfix corrects the first live-browser OpenLayers parity startup failure found on GitHub Pages.

## Live issue found

The CDN browser build of OpenLayers 10.9.0 does not expose the ESM `defaults()` helpers at `ol.control.defaults` / `ol.interaction.defaults` in the shape assumed by the initial parity adapter. The OpenLayers runtime therefore threw `TypeError: ol.control.defaults is not a function` and correctly fell back to Leaflet.

## Fix

- OpenLayers is now constructed with `controls: []`, because EditPolygon already supplies its own map controls.
- OpenLayers' own default interaction set is allowed to initialise normally.
- The map adapter continues to enable/disable `DragPan` and `DoubleClickZoom` through the native interaction collection.
- When `doubleClickZoom:false` is requested, that interaction is deactivated immediately after map creation.
- The browser parity smoke mock no longer provides `ol.control.defaults` or `ol.interaction.defaults`, reproducing the global CDN API shape that exposed the bug.
- Local runtime asset cache keys were bumped so GitHub Pages clients cannot keep the broken adapter from v1.55.1.

There are no project-format or user-data changes. Leaflet remains the default renderer and the OpenLayers runtime is still requested only with `?mapEngine=openlayers`.
