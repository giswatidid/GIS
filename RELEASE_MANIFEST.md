# EditPolygon v1.55.7 release manifest

v1.55.7 is the first **OpenLayers-only performance and architecture cleanup** after the map-runtime migration. It deliberately adds no end-user GIS feature.

## Runtime cleanup

- collapses the adapter to one public `createRuntime()` factory;
- removes remaining transition-era capability methods and native-map test escape surfaces;
- removes the application-level runtime-name dataset/branch surface;
- removes the now-dead map-pan recovery compatibility/listener stack;
- makes persistent heavy-vector sources and focused precision overlays direct single-runtime invariants;
- removes engine markers that no longer carry information.

## Interaction/performance cleanup

- reuses one `ol.format.GeoJSON` formatter per runtime for editable/reference/transient geometry conversion;
- batches DOM-overlay refresh at runtime level rather than attaching map/view listeners for every handle/label;
- centralises zoom lifecycle detection and fans each logical zoom start/end to every subscriber;
- removes redundant explicit source/map render invalidations after OpenLayers operations that already invalidate themselves;
- removes a private OpenLayers feature-state fallback from editable hit detection.

The central zoom fan-out also fixes a latent single-runtime ordering bug where multiple subscribers sharing the old global zoom state could cause the first registered listener to consume a logical zoom transition before later listeners observed it.

## Repository hygiene

- adds `.gitignore` for dependencies, test/cache/log and editor-local files;
- `CRS_VALIDATION.md` is absent from the authoritative baseline (the user removed the stale report before this release);
- runtime/mobile cache keys and version metadata are advanced to v1.55.7;
- architecture, quality baseline and changelog are updated for the single-runtime cleanup.

## Preserved behaviour

- authoritative cached editable rendering and focused precision overlays;
- repeated-world / International Date Line protections;
- authoritative history epochs and geometry-content cache checks;
- large-vector image-backed interaction mode without geometry simplification;
- WMS/ArcGIS/remote/reference service support;
- lossless `.epz` persistence;
- full mobile/touch GIS interface.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final verification: **270/270 Node tests** and **8/8 browser smoke suites**. The binding/architecture audit reports **1,686 named bindings**, ceilings of **198 duplicate names / 371 extra binding sites**, **0 application engine branches**, **0 application native-map calls** and **0 native-map escapes**.

## Targeted live validation

Because this is a cleanup release, live validation can stay narrow:

1. pan and zoom the normal map;
2. draw/edit one representative feature and undo/redo it;
3. select/edit one feature in a large layer such as the ecoregions test dataset;
4. check one DOM-overlay-heavy interaction (for example a true-circle handle or measurement label);
5. on mobile, perform one pan/pinch and one edit after opening/closing a drawer.

If those remain normal, the Processing Toolbox can proceed from this baseline.
