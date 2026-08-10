# EditPolygon v1.55.5 release manifest

v1.55.5 is the OpenLayers default-engine cutover. The deployed v1.55.4 parity gate has passed across desktop and mobile, so a normal EditPolygon URL now starts OpenLayers without requiring a query parameter.

## Engine authority

- No `mapEngine` parameter -> **OpenLayers**.
- `?mapEngine=openlayers` / `?mapEngine=ol` -> OpenLayers (accepted but now redundant).
- `?mapEngine=leaflet` -> **Leaflet emergency fallback** for this release only.
- Unknown/empty engine values resolve to OpenLayers rather than silently restoring the old Leaflet default.
- If OpenLayers itself fails to initialise, `createRuntime()` may fall back to Leaflet and exposes `requestedEngine: "openlayers"` plus `fallbackReason`.

## What does not change

- The `EditPolygonMap` adapter remains the application boundary.
- No application-level `ol.*` calls are introduced.
- The v1.55.4 repeated-world, drawing/editing, history, selection, WMS/remote-source, large-vector, `.epz`, Geometry Health and mobile/touch parity fixes remain in place.
- Leaflet JavaScript/CSS/runtime code remains present intentionally until v1.55.6 so the emergency fallback is genuine.

## Automated gate

`npm run check` must verify the OpenLayers default selector, version/cache coherence, adapter symmetry, runtime authority and the complete Node suite.

`npm run test:browser-smoke` must keep both sides of the cutover exercised:

- the OpenLayers parity browser smoke calls `createRuntime()` **without forcing an engine**, proving no-query default startup;
- the Leaflet browser smoke calls `createRuntime()` through `?mapEngine=leaflet`, proving the explicit fallback still works;
- CRS, remote-source, schema, join, Geometry Health and mobile/touch browser suites remain green.

## Live validation

1. Open the normal deployed URL with no query parameter and confirm `EditPolygonMap.engine === "openlayers"`.
2. Do a short representative desktop check: pan/zoom, select, draw/edit one feature, undo/redo and save/open `.epz`.
3. On a phone, confirm the normal URL still supports pan/pinch, Layers/Inspector/GIS and one draw/edit interaction.
4. Open once with `?mapEngine=leaflet` and confirm the emergency fallback still starts.

If these checks pass in the deployed build, v1.55.6 may remove Leaflet completely.
