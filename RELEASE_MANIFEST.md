# EditPolygon v1.55.7.1 release manifest

v1.55.7.1 is a focused hotfix for the v1.55.7 OpenLayers-only cleanup. It does not add GIS functionality or change project data.

## Fixed regression

- v1.55.7 removed the obsolete pan-recovery guard and its `customPointerDragActive` helper near the main runtime setup.
- A later historical enhancement block still referenced that retired binding. Browsers therefore raised an uncaught `ReferenceError` during application startup.
- The exception occurred after drawing-preview logic was installed but before the Advanced GIS bridge and final runtime-authority renderer were installed. This explains both live symptoms: finalized polygons could disappear even though their layer/feature existed, and Advanced GIS controls were absent.
- v1.55.7.1 removes the stale late compatibility hook. The retired pan-recovery system remains deleted.

## Regression protection

- runtime audit explicitly forbids the retired drag-state symbol in `editpolygon-app.js`;
- runtime-authority tests verify the Advanced GIS installation is present after the historical enhancement section and before the final authority boundary;
- all local deployment assets use the v1.55.7.1 hotfix cache key so GitHub Pages cannot mix v1.55.7 and v1.55.7.1 modules.

## Preserved v1.55.7 architecture

- OpenLayers remains the sole native map runtime;
- application code has no native-map escape;
- authoritative cached editable rendering and focused precision overlays remain unchanged;
- shared GeoJSON conversion, batched DOM overlays and central zoom lifecycle fan-out remain unchanged;
- repeated-world/date-line protections, WMS/ArcGIS/remote sources, Geometry Health, mobile parity and lossless `.epz` persistence remain intact.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final verification: **271/271 Node tests** and **8/8 browser smoke suites**. The binding/architecture audit remains at **1,686 named bindings**, **198 duplicate names / 371 extra binding sites**, **0 application engine branches**, **0 application native-map calls** and **0 native-map escapes**.

## Targeted live validation

1. draw and finish a polygon; it must remain visible after commit;
2. confirm the Advanced GIS controls/workspace are present;
3. perform one select/edit + undo/redo;
4. optionally open/save the current `.epz` project.
