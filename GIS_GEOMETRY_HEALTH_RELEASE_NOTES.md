# EditPolygon v1.54.0 — Geometry Health

Version 1.54 replaces the legacy polygon-focused validation dialog with a guided, layer-based **Geometry Health** workflow designed to make serious GIS geometry validation understandable without requiring users to know topology terminology.

## User workflow

Open **GIS → Check & fix geometry** from a layer or use the top-level **Check & fix geometry** action.

The default workflow is intentionally short:

1. Choose a layer and record scope.
2. Check geometry.
3. Fix shape-preserving issues in one action.
4. Review consequential repairs individually on the map.
5. Create a repaired layer while preserving the original.

The workspace can check the whole layer or only selected, filtered or visible records.

## Plain-language geometry status

Every checked feature is assigned to exactly one highest-severity category:

- **Ready**
- **Safe to fix**
- **Needs review**
- **Manual review**

Issue cards use plain-language titles and explanations. Technical issue codes and engine details remain available under expandable technical details rather than being the primary interface.

## Geometry types

Standard checks support:

- Point
- MultiPoint
- LineString
- MultiLineString
- Polygon
- MultiPolygon

A normal open LineString is treated as valid line geometry. It is not incorrectly rejected for being “unclosed”. Line self-crossing and dangling-end requirements are optional layer rules because those are dataset rules, not universal geometry-validity rules.

## Standard checks

Geometry Health detects and reports, where applicable:

- Empty or unsupported geometry
- Missing/non-numeric coordinates
- Coordinates outside the editor's expected WGS84 internal range
- Empty MultiPoints and exact repeated points
- Lines with too few distinct points
- Empty multiline parts
- Exact consecutive duplicate vertices
- Missing polygon boundaries
- Unreadable rings
- Unclosed rings
- Repeated closing coordinates
- Too few distinct polygon vertices
- Zero-area/collapsed rings
- Non-conventional ring direction
- Repeated rings
- Polygon self-intersections
- Holes outside shells
- Holes that cross/touch shells
- Intersecting or nested holes
- Overlapping MultiPolygon components

Large rings are guarded against expensive quadratic segment scans; when the deterministic scan is intentionally limited, the user is told rather than receiving a false clean result.

## Robust GEOS topology engine

Polygon topology checks attempt an independent validation pass using **GEOS-WASM 3.1.1**. The worker converts GeoJSON directly into GEOS geometry, obtains the GEOS validity reason and associates it with the feature result.

Consequential self-intersection and general polygon repairs use `GEOSMakeValid` first. GeometryCollections returned by GEOS are reduced to polygonal components for a polygon-layer result. Lower-dimensional components are never hidden: their omission is reported and the proposal is elevated for review.

The GEOS runtime is loaded lazily so point/line-only validation does not pay its cost. If GEOS cannot load or cannot complete a repair, Geometry Health can use the existing Turf-based polygon fallback. The UI explicitly identifies fallback mode and warns that it is less comprehensive.

## Repair safety model

### Safe bulk cleanup

**Fix safe issues** is limited to deterministic, shape-preserving normalisation:

- Exact consecutive duplicate vertices
- Exact duplicate MultiPoint coordinates
- Redundant repeated closure coordinates
- Polygon ring-direction normalisation

It does **not** close an open polygon, remove a hole, delete a feature, split a shape or remove a duplicate feature.

### Review repairs

Consequential repairs require an individual preview and explicit acceptance. Current proposals include:

- Closing a selected open polygon boundary
- Removing a clearly identified invalid/collapsed hole
- Removing a duplicate ring
- Removing a collapsed MultiPolygon part
- GEOS MakeValid for self-intersecting/invalid polygon topology

The preview overlays proposed geometry in purple on the map while leaving the source selected and visible. It reports geometry type, vertex changes, relative area/length change and repair-engine identity. Material changes, feature removal, geometry-type changes and lower-dimensional GEOS output are flagged as significant.

Exact duplicate **features** are review-only data findings and are never automatically deleted.

## Optional layer rules

Advanced rules are separated from intrinsic geometry validity. v1.54 can optionally flag:

- Exact duplicate features
- Polygon feature overlaps
- Line self-crossings
- Dangling line endpoints

Enabling or disabling an advanced rule rechecks the current repair state rather than discarding repairs already accepted in the workspace.

## Map review

Issue cards can locate their feature on the map. When an exact problem coordinate is available, Geometry Health marks it with a dedicated issue marker. Repair previews use a separate overlay so proposed geometry is visually distinct from the original.

## Repaired outputs and provenance

The default action is **Create repaired layer**. The original layer remains unchanged.

The output uses the existing project/layer/history architecture and preserves CRS, schema, style, labels and display-field metadata where applicable. Creating the result is one undoable project operation.

Stored Geometry Health provenance includes:

- v1.54 engine version and creation time
- Source layer ID/name
- Checked record scope
- Selected optional rules
- Before/after feature-status counts
- Before/after geometry statistics
- Robust-engine status
- Validation warnings
- Per-feature safe cleanup log
- Accepted consequential repairs and their engine/warnings
- Aggregated unresolved issue summary

Geometry Health refuses to silently drop an unusable record while materialising an output. A record must either remain represented or be explicitly removed through an accepted review action.

## Reports

The workspace can export:

- Full JSON validation/repair report
- CSV issue list

The JSON report contains the before and current validation reports, rule configuration, safe-cleanup log and accepted repair decisions.

## Performance and cancellation

Validation, robust polygon checks, optional polygon-overlap checks and repairs run through a dedicated Web Worker. Progress is surfaced in the Geometry Health panel and work can be cancelled by terminating the worker.

## Tests

At release validation:

- Repository integration checks pass
- 128 automated JavaScript tests pass
- Geometry Health core tests pass across point, line, polygon and multipart edge cases
- GEOS adapter tests cover GeoJSON conversion, validity diagnostics, MakeValid output extraction and pointer cleanup with a controlled GEOS mock
- Worker tests cover standard validation, safe repair, progress, robust GEOS validity augmentation and GEOS MakeValid previews
- CRS browser smoke test passes
- ArcGIS remote-source browser smoke test passes
- Typed-data browser smoke test passes
- Join and summary browser smoke test passes
- Geometry Health browser smoke test passes

The execution environment used for repository validation blocks live browser network imports, so the production jsDelivr fetch of the GEOS-WASM module could not be exercised end-to-end there. The worker's actual GEOS path is covered with the same public C-API surface through a controlled mock, and failure to load the external runtime degrades explicitly instead of preventing deterministic validation.

## Privacy

Geometry records remain in browser memory and are not sent to EditPolygon or GEOS. As with EditPolygon's existing Leaflet/Turf/JSZip and other CDN-loaded dependencies, fetching GEOS-WASM from jsDelivr sends ordinary web-request metadata to that provider. Remote GIS services retain their existing provider-specific privacy boundary.
