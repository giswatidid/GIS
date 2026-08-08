# OpenLayers true-circle click selection fix — v1.55.1.10

## Why v1.55.1.9 still failed live

The previous fixes hardened OpenLayers click delivery and rendered-feature hit detection, but ordinary click selection still had one unique code path for `CircleByCenterPoint` features.

OpenLayers does not render the canonical centre + radius object directly. `buildOpenLayersCachedLayer()` calls `featJSON(feature)`, which materialises a true circle into a polygon and sends that polygon to OpenLayers. The spatial selection tools also operate against the materialised feature geometry. Ordinary click selection, however, bypassed that representation and tested a separate screen/geographic centre-radius calculation (`trueCircleHitAtPixel()` / `circleContainsLatLng()`).

That meant ordinary click selection was the only selection mode testing a different shape from the one actually drawn by OpenLayers. The user's repeated live result — rectangle/polygon/lasso selection finding the circle while click selection did not — is consistent with this representation split.

## Fix

OpenLayers click selection now uses `parametricCircleHitAtMapPoint()`:

1. Materialise the canonical true circle with the same `featJSON(feature)` path used by the OpenLayers renderer.
2. Test the click point against that exact Polygon/MultiPolygon using Turf point-in-polygon.
3. Use the existing pixel boundary tolerance against that same rendered ring for edge clicks.
4. Only fall back to canonical centre/radius containment when the active engine is Leaflet, or if OpenLayers materialisation unexpectedly fails.

The separate `trueCircleHitAtPixel()` shortcut was removed from the ordinary candidate loop, so there is now one geometry-aware hit path instead of two competing circle definitions.

## Regression coverage

A new runtime test evaluates the actual circle-click helper rather than only checking source text. It deliberately makes the legacy/canonical circle containment result return `false` while the click lies inside the materialised OpenLayers polygon. The OpenLayers click must still hit. A second case verifies a point outside the rendered polygon does not hit even if the legacy calculation says it would.

Leaflet's canonical circle path is also tested separately.

## Validation

- Repository integration checks: pass
- JavaScript tests: 184 / 184 pass
- Leaflet map-adapter browser smoke: pass
- OpenLayers parity browser smoke: pass
- CRS browser smoke: pass
- remote-source browser smoke: pass
- typed-data browser smoke: pass
- join/summary browser smoke: pass
- Geometry Health browser smoke: pass

This release changes no project-format, CRS, schema, history or analysis data model.
