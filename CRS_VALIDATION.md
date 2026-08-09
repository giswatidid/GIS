# CRS validation report — v1.44.1

## Automated repository suite

`npm run check` validates repository integration and runs the Node test suite. The final v1.44.1 result is 34 passing tests and 0 failures.

CRS-specific coverage includes:

- CRS identifier normalisation.
- GeoJSON and WKT CRS detection.
- Web Mercator forward/inverse transformations.
- WGS 84 UTM and Australian MGA forward/inverse transformations.
- Nested GeoJSON geometry transformation.
- Preservation of Z/additional coordinate ordinates.
- Projected GeoJSON preparation into internal WGS 84 storage.
- WKT and PRJ definition generation.
- Application API and UI wiring.
- ArcGIS source-spatial-reference metadata handling.
- Multi-format CRS export controls.

## Independent projection comparison

Representative transformations were compared with `pyproj 3.7.2` for:

- EPSG:3857
- EPSG:7850
- EPSG:7855
- EPSG:7856
- EPSG:28356
- EPSG:32756

Sample locations included Brisbane, Sydney, Melbourne and Perth. The largest observed projection-coordinate difference was approximately **0.000104 metres**. This validates the Transverse Mercator and Web Mercator projection implementation; it does not change the stated limitation for high-accuracy datum transformations.

## Browser UI smoke test

A headless Chromium/Playwright smoke harness loaded the actual `gis-crs-core.js` and `gis-data-tools.js` browser files, then verified:

- The layer Table control initialises.
- The CRS tab opens.
- Source, storage, native and metric CRS details render.
- Metadata assignment calls the application API.
- Coordinate interpretation/reprojection calls the application API after confirmation.
- Preferred export CRS is saved.
- WKT export is passed to the application API.
- EPSG:7856 transformation returns the expected central-meridian easting.

Result: **passed**.

## Static deployment smoke test

A local HTTP server returned status 200 for:

- `docs/`
- `docs/assets/gis-crs-core.js`
- `docs/assets/editpolygon-app.js`
- `docs/assets/gis-data-tools.js`
- `docs/crs-reprojection-guide/`

## Accuracy limitation

GDA94/GDA2020 transformations use the correct GRS80 ellipsoid and projection parameters, but datum conversion to the WGS 84 map store uses a zero-parameter approximation. The interface identifies this limitation. Survey-grade transformations requiring official distortion/grid files are outside this release.
