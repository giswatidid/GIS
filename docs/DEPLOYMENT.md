# EditPolygon static deployment

The complete deployable application is contained in this `docs/` directory. It can be served by GitHub Pages, Cloudflare Pages, or any ordinary static web server. No application backend is required.

## GitHub Pages

Configure Pages as:

- Branch: `main`
- Folder: `/docs`

The project page will then load from the repository's GitHub Pages URL.

## Cloudflare Pages

1. Connect the repository or upload the site.
2. Leave the build command blank.
3. Set the output directory to `docs`.
4. Add the production custom domain if required.
5. Enable HTTPS and verify canonical redirects.

## Privacy boundary

Imported files, feature geometry, CRS transformations, analysis, autosave, and export are processed in the browser. Remote basemaps and data services are requested directly from their providers when the user enables them. No EditPolygon geometry-processing proxy or upload endpoint is required.

## Important files

- `index.html` – application shell and metadata
- `assets/editpolygon-app.js` – main editor and GIS application logic
- `assets/gis-crs-core.js` – browser-local CRS parsing and coordinate transformations
- `assets/gis-data-tools.js` – attributes, filters, styling, processing, and CRS interface
- `assets/gis-ui-integration.js` – consolidated Layers-panel and Inspector integration
- `assets/editpolygon.css`, `assets/gis-workspace.css`, `assets/gis-data-tools.css`, and `assets/gis-ui-integration.css` – application styling
- `crs-reprojection-guide/` – CRS assignment and reprojection guide
- `_headers` and `_redirects` – Cloudflare security/caching and redirects
- `robots.txt` and `sitemap.xml` – crawler configuration

## Local test server

From the repository root:

```powershell
py -m http.server 8000
```

Then open:

```text
http://localhost:8000/docs/
```

## Pre-launch checks

- Open and edit Polygon, MultiPolygon, line, point, and parametric-circle data.
- Test undo/redo after geometry and attribute changes.
- Import explicit EPSG:3857 or MGA coordinates and verify they appear in the correct location after interpretation.
- Verify **Assign CRS** changes metadata only.
- Verify **Interpret/reproject coordinates** changes coordinate values while preserving the real-world location.
- Export GeoJSON, WKT, CSV, and Shapefile ZIP in a selected CRS.
- Confirm Shapefile ZIP exports include matching `.prj` and `.cpg` files.
- Save and reopen an `.epz` project and confirm source, native, storage, export CRS, GIS service definitions, visibility/opacity/order and true-circle metadata persist.
- Test map selection, Inspector attributes, attribute table, filters, styling, labels, and processing outputs.
- Test remote WMS, XYZ/TMS/TileJSON, GeoJSON, and ArcGIS FeatureServer sources.
- Verify the browser console has no missing-asset or runtime errors.

## Automated checks

From the repository root:

```bash
npm run check
npm run test:browser-crs
```

The browser smoke test uses an installed Chromium/Chrome executable when available. Set `CHROMIUM_PATH` to a specific executable if automatic discovery does not find it.

## CRS accuracy note

Web Mercator and supported UTM/MGA projection mathematics are implemented locally. GDA94/GDA2020-to-WGS84 geographic datum conversion currently uses a zero-parameter approximation rather than official distortion grids. The app labels that limitation and should not be treated as a survey-grade datum-transformation tool.
