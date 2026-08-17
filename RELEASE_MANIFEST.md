# EditPolygon v1.56.1 release manifest

v1.56.1 is the pre-release **full Processing Toolbox consolidation**. Because EditPolygon has not yet been publicly deployed, this release intentionally removes redundant development-era processing paths rather than carrying compatibility code forward.

## Processing architecture

Authoritative runtime modules:

- `docs/assets/gis-processing-registry.js` — 32-tool declarative catalogue and parameter/input metadata.
- `docs/assets/gis-processing-core.js` — generic request normalisation, scopes, validation, output/provenance contracts and processing-CRS resolution.
- `docs/assets/gis-processing-engine.js` — shared high-level algorithm router.
- `docs/assets/gis-spatial-core.js` — shared indexing, relationships, nearest and aggregation primitives.
- `docs/assets/gis-geos-adapter.js` — sole low-level GEOS-WASM adapter, shared with Geometry Health.
- `docs/assets/gis-processing-worker.js` — sole cancellable Processing worker.
- `docs/assets/gis-processing.js` / `gis-processing.css` — responsive Toolbox UI.

Retired/forbidden architecture:

- `docs/assets/gis-analysis-worker.js` must remain absent.
- Independent Simple Editor batch Clip, Erase, Repair and Simplify entry points must not return.
- Join & Summarize must not reintroduce its own dissolve or spatial-index/relationship engine.

## Tool catalogue

**Vector geometry:** Buffer; Centroids; Point on surface; Convex hull; Bounding geometry; Points along line.

**Overlay:** Union; Intersection; Difference; Symmetric difference; Clip.

**Aggregation:** Dissolve; Singlepart → multipart.

**Geometry conversion:** Multipart → singlepart; Polygon → line; Line → points.

**Selection:** Select by attribute; Select by location; Invert selection; Select duplicates; Select invalid geometry.

**Spatial analysis:** Nearest feature; Distance to nearest; Count points in polygon; Join attributes by location; Spatial summary.

**Geometry maintenance:** Fix geometries; Remove duplicate vertices; Remove duplicate features; Snap; Simplify; Densify.

## Processing contract

- Inputs are declared generically per tool rather than hard-coded as source + optional overlay.
- Every layer input supports **All / Filtered / Selected** where applicable; presentation visibility never changes analysis membership.
- Parameter controls are generated from registry metadata, including field/fields/select/number/boolean/text controls.
- Result kinds are layer or selection. Maintenance tools may declare **new layer or modify input**; cardinality/schema-changing tools remain new-layer only.
- One active worker job is cancellable. Worker failure/cancellation creates no partial project state.
- New-layer and in-place mutations are one undoable history transaction.
- Processing requests carry authoritative layer schemas to typed operations.
- Provenance stores all inputs/scopes, parameters, output policy, actual processing CRS, engine, counts and failures.

## Shared engines

- GEOS-WASM backs robust Difference, Intersection, Union, Symmetric difference, Dissolve, Snap, Simplify, Densify, distance and MakeValid-related processing through one adapter.
- Projected/metric operations transform cloned canonical geometry into a suitable processing CRS and back to `EPSG:4326` before commit.
- Join & Summarize uses the same shared spatial core and Processing dissolve primitive.
- Select by Attribute uses the same typed schema/filter semantics as the attribute-table filtering system.
- Fix geometries reuses Geometry Health and the existing GEOS MakeValid boundary.

## Geometry-code editing

The v1.56.1 live-test geometry-code hotfix generalises manual geometry replacement to all six standard editable GeoJSON vector types: Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon. The editor keeps the selected geometry family stable, validates proposals through Geometry Health, and commits successful changes through the existing manual-edit/history path. Parametric Circle remains intentionally separate.

## Quality gate

Before packaging:

```bash
npm run check
npm run test:browser-smoke
```

An additional network-dependent test is available as:

```bash
npm run test:browser-processing-execution
```

It executes real worker + GEOS-WASM processing when the test environment is permitted to load the pinned CDN module, and reports a skip when that external import is administratively blocked.

Automated release verification for this package: **319/319 Node tests**, **11/11 browser smoke suites**, **1,674 named bindings / 196 duplicate names / 369 extra binding sites**, and **0 application engine branches / 0 application native-map calls / 0 native-map escapes**.

## Next milestone

v1.57 is the large-data performance release: virtualisation, worker-based tabular operations, broader spatial indexing, reduced cloning/memory pressure, progressive import and larger editable datasets.
