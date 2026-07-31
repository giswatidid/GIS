# EditPolygon Browser GIS

EditPolygon is a static, browser-based GIS editor. Imported files, feature geometry, geometry processing, autosave and export remain in the user's browser. The application does not upload project data to an EditPolygon processing service.

## Workspaces

- **Simple editor** remains the default and preserves the existing focused polygon-editing workflow.
- **Advanced GIS** adds a unified layer/source workspace without creating a separate application or project format.

## Advanced GIS through v1.44.1

- Unified view of image overlays, reference overlays, built-in basemaps and custom remote services.
- The existing Layers panel is now the authoritative editable-layer list.
- Each dataset layer has one compact GIS action menu for table, filter, style, CRS and processing tools.
- Imported datasets collapse their feature children by default and show the active selected feature plus hidden or locked features so they remain recoverable.
- Clicking a feature shows prioritised attributes directly in the Inspector.
- The Inspector supports full-field viewing, single-feature attribute editing, table opening and zooming.
- Display-field detection gives imported features meaningful names and can be changed per layer.
- The duplicate editable-layer section is suppressed from the Advanced GIS panel.

- Custom XYZ and TMS tile sources.
- Direct TileJSON loading and conversion to a persisted tile source.
- WMS layers as either overlays or basemaps.
- Remote GeoJSON URLs and ArcGIS FeatureServer layer URLs imported directly by the browser as editable or reference copies.
- Custom basemap activation, including a no-basemap option.
- Layer visibility, opacity, ordering, renaming, zooming, removal and user-defined groups.
- Browser-local source/layer configuration saved in `.polygonproject`, autosave and journal recovery.
- Explicit local-versus-remote network labels throughout the Advanced GIS interface.
- Export of source definitions without imported feature geometry.


## v1.44.1 coordinate reference systems and performance

- CRS metadata is detected from GeoJSON, GML, Shapefile `.prj` files and ArcGIS FeatureServer metadata.
- The app distinguishes assigning a CRS label from actually reprojecting numeric coordinates.
- Map geometry remains in an internal WGS 84 browser store, while layers retain source/native and export CRS metadata.
- Web Mercator, worldwide WGS 84 UTM, GDA94/MGA and GDA2020/MGA transformations run locally in the browser.
- The Inspector displays native-CRS coordinate samples.
- Layer exports support GeoJSON, WKT, CSV and Shapefile ZIP with `.prj` in the chosen CRS.
- See `GIS_CRS_RELEASE_NOTES.md` for supported codes, behaviour and accuracy limitations.

## Privacy boundary

Local files and imported feature geometry are processed in browser memory, Web APIs and IndexedDB. Remote tiles, WMS, TileJSON, GeoJSON and ArcGIS services are requested directly from the provider by the user's browser. No EditPolygon proxy or upload endpoint is used.

Remote providers may receive normal request metadata such as the user's IP address, browser headers and requested tile or service parameters. Imported polygon geometry is not transmitted as part of ordinary basemap tile requests.

## Development checks

```bash
npm run check
```

This runs JavaScript syntax validation, repository integration checks and GIS-core unit tests.

## Static deployment

Deploy the contents of `docs/` to Cloudflare Pages, GitHub Pages or another static host. No application backend is required.

## Next architecture milestones

The source/layer bridge introduced here is intended to support later modular work on:

- Attribute tables, field calculations, filtering and SQL.
- WMTS, vector tiles, COG and additional ArcGIS service support.
- Robust worker-based geometry processing.
- Categorised, graduated and rule-based styling.
- Larger dataset indexing and viewport-based rendering.


## Browser-local data tools

Editable layers now include an attribute table, filters, field editing/calculation, categorised and graduated styles, labels, CRS metadata and non-destructive processing outputs. See `GIS_DATA_RELEASE_NOTES.md`.


## v1.43.0 vector rendering performance

- Editable point, line and polygon map layers share a Leaflet Canvas renderer rather than creating one SVG DOM node per feature.
- Selected geometry and editing handles remain in dedicated high-fidelity overlays.
- Map movement no longer invokes image-overlay rendering when no visible image overlays exist.
- Visible image overlays are redrawn at most once per animation frame while panning.
- Existing per-feature render caching and viewport culling remain active.
