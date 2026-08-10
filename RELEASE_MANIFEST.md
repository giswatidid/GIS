# EditPolygon v1.55.6 release manifest

v1.55.6 completes the map-runtime migration. OpenLayers is now the **only** native map runtime in EditPolygon.

## Removed in this release

- retired map JavaScript/CSS dependency from `docs/index.html`;
- alternate runtime factory and map-selector/fallback state from `editpolygon-map-adapter.js`;
- `?mapEngine=` alternate-runtime behaviour;
- automatic fallback to the retired runtime;
- bootstrap/compatibility editable renderer that existed only for the retired runtime;
- retired full-detail reference canvas renderer;
- retired v1.30 native performance renderer;
- retired native control/CSS selectors;
- obsolete alternate-runtime browser smoke test;
- audit allowances for direct retired-native calls.

`EditPolygonMap.createRuntime()` now directly creates the OpenLayers implementation.

## Retained architecture

- application code remains engine-neutral and contains no direct `ol.*` calls;
- authoritative cached editable renderer and focused precision overlay;
- repeated-world / International Date Line protections;
- authoritative history epochs and geometry-content cache checks;
- large-vector persistent-source / image-backed interaction mode;
- WMS/remote/reference service support;
- lossless `.epz` persistence;
- full mobile/touch GIS interface;
- runtime-authority and source-order audits.

## Repository deletion

Delete:

```text
tests/browser-map-adapter-smoke.py
```

It tested the retired alternate runtime and has no role in the single-runtime repository.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final verification: **266/266 Node tests** and **8/8 browser smoke suites**. The browser matrix contains the OpenLayers parity smoke plus CRS, remote source, schema/data, join, Geometry Health and mobile/touch suites; there is no alternate-runtime smoke.

The binding/architecture audit enforces ceilings of **198 duplicate names / 371 extra binding sites**, with **0 application native-map calls** and **0 native-map escapes**.

## Live validation

After deployment:

1. open the normal application URL with no query parameter;
2. confirm `EditPolygonMap.engine === "openlayers"`;
3. pan/zoom, select, draw/edit and undo/redo a representative feature;
4. open/save one `.epz` project;
5. quickly verify Layers / Inspector / GIS on mobile.

No alternate map-engine validation is required: that implementation has been deleted.
