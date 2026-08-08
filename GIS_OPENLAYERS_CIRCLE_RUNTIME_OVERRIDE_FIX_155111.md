# OpenLayers true-circle click runtime override fix — v1.55.1.11

## Root cause

The true-circle hit-test logic added during v1.55.1.5–v1.55.1.10 was correct in isolation, but it was not the selector that the complete application used at runtime.

`editpolygon-app.js` is still a large compatibility-augmented script. The modern geometry-aware selector is declared near the main map interaction code as `function featuresAtLatLng(latlng, pixel)`. Roughly 9,000 lines later, the older v1.16 LineString compatibility block reassigned the same binding with a generic `geometryHit(latlng, getDisplayGeometry(feature))` implementation. JavaScript executes the file top-to-bottom, so the v1.16 assignment replaced the modern selector after it had been defined.

Canonical true circles intentionally return the non-GeoJSON display descriptor `{type: "CircleByCenterPoint"}` from `getDisplayGeometry()`. The old v1.16 `geometryHit()` helper knows Point, MultiPoint, line and polygon types, but not `CircleByCenterPoint`. As a result, ordinary map click selection always discarded the circle even though rectangle/polygon/lasso selection and the modern circle-aware click function worked.

This also explains why earlier tests passed: they extracted and executed the first `featuresAtLatLng()` function from source, but did not execute the later reassignment in source order.

## Fix

The stale v1.16 `featuresAtLatLng` reassignment has been removed. The compatibility block retains its line-aware helpers for the paths that still need them, but ordinary map click selection now has one authoritative selector for all geometry types.

The authoritative selector continues to support:

- OpenLayers rendered-feature ID hit testing;
- parametric CircleByCenterPoint materialisation;
- Point and MultiPoint tolerance;
- LineString and MultiLineString stroke tolerance;
- Polygon and MultiPolygon interior/boundary hit testing;
- locked feature inspection;
- overlap cycling/picker and shared multi-selection semantics.

## Regression coverage

The circle runtime test now checks the entire source for any later `featuresAtLatLng = function ...` assignment after the authoritative declaration. A future compatibility block cannot silently replace map click selection without failing the test suite.

The existing true-circle runtime tests remain and still verify OpenLayers hit selection against the materialised circle polygon when native rendered-feature hit detection returns no IDs.
