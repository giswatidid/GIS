# EditPolygon v1.56.0.3 release manifest

v1.56.0.3 is a focused **EPZ project-open history hotfix** on the accepted v1.56.0.2 Processing Toolbox baseline.

## Toolbox architecture

New runtime modules:

- `docs/assets/gis-processing-registry.js` — declarative tool catalogue and search metadata.
- `docs/assets/gis-processing-core.js` — request normalisation, scopes, validation, provenance, result contracts and shared execution.
- `docs/assets/gis-processing-worker.js` — sole cancellable Toolbox worker.
- `docs/assets/gis-processing.js` — desktop/mobile Toolbox controller and result UI.
- `docs/assets/gis-processing.css` — responsive Toolbox layout.

Retired file:

- `docs/assets/gis-analysis-worker.js`

The historical Process tab now hosts the new Processing Toolbox rather than its own implementation. Layer **GIS → Processing** opens the same Toolbox with that layer preselected.

## v1.56.0.3 tools

- Buffer
- Centroids
- Point on surface
- Convex hull
- Bounding rectangle
- Clip
- Intersection
- Dissolve

The overlay set in this release deliberately preserves the existing Turf behaviour. Robust GEOS-backed Difference, Symmetric difference, true two-layer Union, dissolve-by-field and Make Valid belong to v1.56.1.

## Processing contract

- Explicit **All / Filtered / Selected** input and overlay scopes. Hidden visibility state never changes processing membership.
- Pre-flight geometry/parameter validation before execution.
- Stage-aware progress and one active cancellable job.
- Project mutation only after a complete result is returned and normalised.
- Cancellation, worker error and zero output leave the project untouched.
- Successful output creation is one history transaction.
- Per-feature errors are reported; unsafe partial aggregate outputs fail atomically.
- Per-feature/overlay outputs preserve compatible schema, layer style/labels and feature style overrides.
- Output layers store `.epz`-persistent `gisProcessing` provenance.
- v1.56.0.3 records its actual processing CRS as `EPSG:4326`.

All local deployment assets use the `20260812-v15603-processing-tool-list-ui` cache key, including the worker's local registry/core imports.

## Automated gate

Before packaging, the release must pass:

```bash
npm run check
npm run test:browser-smoke
```

Final automated verification: **291/291 Node tests**, **9/9 browser smoke suites**, **1,706 named bindings / 198 duplicate names / 371 extra binding sites**, and **0 application engine branches / 0 application native-map calls / 0 native-map escapes**.

## Targeted live validation

1. Open **GIS → Processing** on a polygon layer. Confirm the layer is preselected, all eight tools are searchable, and every left-menu tool title/description is left-aligned inside its own row with no horizontal scrollbar.
2. Hide one feature and verify **All features** still counts it; apply a filter and verify **Filtered features** changes independently.
3. Select a subset and run **Centroids** or **Buffer** with Selected features. Confirm only the selected records produce output and the source layer is unchanged.
4. Undo once: the complete processing output layer should disappear. Redo once: it should return.
5. Run **Clip** or **Intersection** with a polygon overlay and confirm both source and overlay scopes are available.
6. Run **Dissolve** on a simple polygon layer and inspect the result/provenance.
7. Start a non-trivial job and press **Cancel**. No partial output layer should appear.
8. Save/reopen `.epz` and confirm the processing output and `gisProcessing` provenance remain present. Immediately after reopening, Ctrl+Z/Ctrl+Y must do nothing until a new edit is made.
9. Repeat a simple run on a phone-sized interface to confirm the same Toolbox remains usable.
