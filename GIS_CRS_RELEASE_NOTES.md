# EditPolygon Browser GIS v1.44.1

## Browser-local CRS support

This release adds a dedicated CRS engine that runs entirely in the browser. Editable map geometry remains stored internally as WGS 84 longitude/latitude so all layers can be rendered together, while each layer retains its original/native CRS and preferred export CRS.

## Detection

The app now detects CRS metadata from:

- Legacy GeoJSON `crs` members.
- Shapefile `.prj` files inside ZIP archives.
- GML `srsName` values.
- ArcGIS FeatureServer layer metadata (`wkid` / `latestWkid`).

Explicit projected GeoJSON and GML coordinates are transformed to the internal WGS 84 map store during import. Shapefiles retain their original `.prj` CRS metadata after shpjs converts their geometry for web display. Files with coordinate values outside longitude/latitude range are flagged for manual CRS interpretation.

## Assignment versus reprojection

The CRS panel deliberately separates:

- **Assign metadata only** — records what the coordinates represent without moving the layer.
- **Interpret current coordinates and reproject** — treats the current numeric values as the selected projected CRS and transforms them into the map's WGS 84 storage.

This avoids the common GIS mistake of changing a CRS label when the coordinates actually require transformation.

## Supported transformations

- EPSG:4326 — WGS 84
- EPSG:3857 — Web Mercator
- EPSG:4283 — GDA94
- EPSG:7844 — GDA2020
- EPSG:28348–28358 — GDA94 / MGA zones 48–58
- EPSG:7846–7859 — GDA2020 / MGA zones 46–59
- EPSG:32601–32660 — WGS 84 / UTM north zones
- EPSG:32701–32760 — WGS 84 / UTM south zones

Projection calculations use ellipsoidal Transverse Mercator and Web Mercator formulas. GDA94/GDA2020 datum conversion uses a zero-parameter approximation and is labelled accordingly; survey-grade grid transformations are not claimed.

## Export

Each editable layer can save a preferred export CRS and download:

- GeoJSON
- Shapefile ZIP with matching `.prj` and UTF-8 `.cpg`
- WKT
- CSV with attributes and geometry WKT

Projected GeoJSON includes a legacy `crs` member. EPSG:4326 remains the standards-compatible RFC 7946 option.

## Inspector and processing

The selected-feature Inspector displays a coordinate sample in the layer's native CRS and, where different, the WGS 84 map coordinate. The CRS panel recommends a local UTM/MGA metric CRS based on the layer extent. Existing distance and area processing continues to use browser-local geodesic WGS 84 methods.

## Validation

The release includes unit and integration coverage for CRS identifier normalisation, GeoJSON and WKT detection, Web Mercator, UTM/MGA forward and inverse transformations, nested geometry reprojection, CRS-aware export definitions, source detection wiring and cache/version integration.


## v1.44.1 performance regression fix

- Scoped the GIS UI MutationObserver to the Layers list and Inspector instead of the entire document.
- Coalesced GIS UI refreshes to one animation frame.
- Removed layer-bounds and suggested-metric-CRS calculations from lightweight layer-list snapshots.
- Selected-feature CRS display now derives its suggested metric CRS from the selected coordinate without scanning the complete dataset.
- Restores smooth panning for editable FeatureServer/GeoJSON point datasets while retaining CRS inspection and export.
