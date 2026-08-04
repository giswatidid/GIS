# EditPolygon

**EditPolygon** is a free, privacy-first browser GIS editor for drawing, editing, inspecting, validating, processing, styling and converting vector data.

The application runs as a static website. Local files, geometry edits, attribute operations, processing outputs, autosave and exports remain in the browser. No EditPolygon account or application backend is required.

**Live application:** [editpolygon.com](https://editpolygon.com/)  
**Current application baseline:** v1.51.2

## What EditPolygon is for

EditPolygon is intended for:

- GIS professionals who need a quick browser-based editor or converter
- Emergency-management users working with operational polygons and reference layers
- Casual map users who need to inspect or modify common geospatial files
- Developers who need a static, client-side GIS application that can be deployed without a server

A desktop or laptop is recommended for detailed geometry editing.

## Core capabilities

### Draw and edit geometry

- Draw polygons, rectangles, circles, lines and points
- Edit vertices, edges, coordinates, holes and multipart geometry
- Move, reshape, duplicate, delete, hide and lock features
- Select overlapping or multiple features and navigate selections in the Inspector
- Edit supported geometry code manually with validation and recovery
- Preserve parametric circles in supported GML workflows
- Convert circles to polygon vertices when required by another export format

### Select and organise features

The left-side **Select** tool provides:

- Click selection
- Rectangle selection
- Polygon selection
- Lasso selection
- Select by attribute
- Select by location
- Replace, add, remove and intersect selection modes
- Live selection geometry, area and perimeter feedback
- Save selected features as a new editable layer

The Layers panel supports:

- Resizable width with a minimum size
- Layer and feature visibility
- Locking
- Layer ordering and grouping
- Search and filtering
- Multi-feature actions
- Display-field selection for meaningful feature names

### Inspect and edit attributes

Editable layers include browser-local data tools for:

- Attribute tables
- Search, sorting and pagination
- Single-feature property editing in the Inspector
- Adding and deleting fields
- Field calculations
- Numeric statistics
- Attribute filters
- Selection-aware calculations and statistics
- Exporting or processing selected subsets

### Style and label layers

EditPolygon has a unified styling model.

#### Simple styling

Use the layer menu or Inspector for:

- Fill or point colour
- Outline or line colour
- Line width
- Point size
- Fill opacity
- Feature opacity

#### Advanced styling

The **Style & labels** workspace supports:

- Single symbol
- Unique categories
- Numeric classes
- Equal-interval classification
- Quantile classification
- Manual class boundaries
- Continuous numeric scales
- Colour ramps
- Size-driven styling
- Automatic legends
- Labels from attribute fields
- Visual editing and declarative JSON style editing

When advanced styling is active, the simple layer editor is clearly disabled. Users can explicitly switch back to single-symbol styling without losing the stored advanced configuration.

Individual features can also receive a deliberate style override and later return to the layer style.

### Geometry processing

EditPolygon includes direct editing operations and worker-based layer processing.

Current tools include:

- Merge and dissolve
- Union
- Clip
- Intersection
- Erase and cut workflows
- Split polygon by drawn line
- Buffer
- Simplify
- Smooth
- Repair common geometry problems
- Fill or remove holes
- Centroids
- Points on surface
- Convex hull
- Bounding rectangle

Longer layer-processing operations run in a browser worker and create a new editable output layer, leaving the source layer unchanged.

### Validation and conversion

- Validate imported or current project geometry
- Detect common polygon and ring problems
- Apply guided repairs
- Convert files without adding them to the current map
- Preview export scope, format, filename and coordinate precision
- Export all, visible, selected, picked or active-layer features

## Supported file formats

### Import

- GML
- KML
- KMZ
- GeoJSON and JSON
- TopoJSON
- CSV with latitude and longitude fields
- WKT and text
- ESRI Shapefile ZIP
- EditPolygon `.polygonproject` files

### Export

- KML
- KMZ
- GeoJSON
- GML
- CSV
- WKT
- TopoJSON
- ESRI Shapefile ZIP
- EditPolygon project files

Some geometry types or format-specific features may require conversion during export. The application explains these conversions before downloading where applicable.

## Coordinate reference systems

EditPolygon stores map geometry internally as WGS 84 longitude and latitude while retaining source, native and preferred export CRS metadata.

Current CRS capabilities include:

- CRS detection from GeoJSON metadata
- CRS detection from GML
- Shapefile `.prj` detection
- ArcGIS service metadata detection
- Explicit distinction between assigning CRS metadata and reprojecting coordinates
- Native-coordinate samples in the Inspector
- CRS-aware GeoJSON, WKT, CSV and Shapefile ZIP export
- Suggested local metric CRS

Supported transformation families include:

- EPSG:4326
- EPSG:3857
- Worldwide WGS 84 UTM zones
- GDA94 / MGA zones
- GDA2020 / MGA zones

GDA94 and GDA2020 transformations use a browser-local ellipsoid and zero-parameter datum approximation. They are suitable for general GIS display and editing, but not survey-grade cadastral transformation requiring official grid files.

See [`CRS_VALIDATION.md`](CRS_VALIDATION.md) and [`GIS_CRS_RELEASE_NOTES.md`](GIS_CRS_RELEASE_NOTES.md) for additional detail.

## Remote data and basemaps

The Advanced GIS workspace supports:

- Built-in basemaps
- No-basemap mode
- Custom XYZ tiles
- TMS tiles
- TileJSON
- WMS layers
- Remote GeoJSON
- ArcGIS FeatureServer and MapServer discovery
- ArcGIS directory, folder, service, layer, item-page and query URLs
- Importing one, several or all compatible ArcGIS layers
- Editable copies or reference-layer workflows
- Source visibility, opacity, ordering, naming and grouping

ArcGIS requests use pagination and switch to POST where needed to avoid excessively long query URLs.

## Projects and recovery

EditPolygon can preserve the browser workspace in its own project format.

Project functionality includes:

- `.polygonproject` download and import
- Browser-local autosave
- Unsaved-work recovery
- Layer and source configuration
- CRS metadata
- Attributes
- Simple and advanced styles
- Feature-level style overrides
- Labels
- Selection-derived layers
- Processing outputs
- Undo and redo history during the current session

## Performance

The application is designed to remain usable with larger vector layers:

- Shared Leaflet Canvas rendering for editable vectors
- Dedicated high-fidelity overlays for selected and edited geometry
- Viewport-aware rendering
- Spatial indexing for map selection and analysis
- Layer render caching
- Worker-based processing
- Reduced image-overlay redraw work during map movement
- Collapsed imported feature lists by default
- Resizable Layers panel

Very large or unusually complex datasets can still exceed browser memory or rendering limits.

## Mobile compatibility

EditPolygon remains a desktop-first GIS editor, but the application is usable on phones and small tablets. At mobile widths:

- The map becomes the primary full-width workspace
- Layers and Inspector open as off-canvas drawers
- The desktop tool rail becomes a horizontally scrollable bottom dock
- Project, export, basemap, location and help actions remain available in a dedicated mobile sheet
- Selection, drawing and editing use compact contextual controls
- Touch targets and geometry handles are enlarged
- Safe-area insets, landscape phones and dynamic mobile viewport height are supported

Detailed geometry editing is still easier with a mouse or trackpad.

## Privacy

Local files and imported geometry are processed using browser memory, Web APIs and IndexedDB. EditPolygon does not upload them to an EditPolygon processing service.

Remote sources are requested directly from their providers by the user's browser. These providers may receive ordinary request metadata, including the user's IP address, browser headers and requested service parameters.

Basemaps, place search, WMS, remote GeoJSON, ArcGIS services and other remote sources are outside the local-file privacy boundary.

Do not use EditPolygon as the sole validation step for legal, cadastral, safety-critical or emergency-management decisions.

## Repository structure

```text
.
├── docs/                    # Deployable static website
│   ├── index.html           # Main application
│   ├── assets/
│   │   ├── editpolygon-app.js
│   │   ├── editpolygon.css
│   │   ├── gis-analysis-core.js
│   │   ├── gis-analysis-worker.js
│   │   ├── gis-core.js
│   │   ├── gis-crs-core.js
│   │   ├── gis-data-core.js
│   │   ├── gis-data-tools.js
│   │   ├── gis-remote-source.js
│   │   ├── gis-style-core.js
│   │   ├── gis-ui-integration.js
│   │   └── gis-workspace.js
│   └── guides/             # Public help and guide pages
├── scripts/                 # Repository checks
├── tests/                   # Unit and browser smoke tests
└── package.json
```

## Local development

No build step is required for the application itself.

From the repository root, serve the static files with any local HTTP server. For example:

```bash
python -m http.server 8000 --directory docs
```

Then open:

```text
http://localhost:8000
```

Do not open `docs/index.html` directly with a `file://` URL because browser security restrictions can interfere with modules, workers, remote requests and file handling.

## Development checks

Install Node.js, then run:

```bash
npm run check
```

This runs repository integration checks and the JavaScript test suite.

At the v1.51.2 baseline used for this README:

- Repository integration checks pass
- All 58 automated tests pass
- CRS and ArcGIS remote-source browser smoke tests pass
- Regression coverage includes unified styling, selection tools, Layers-panel resizing, mobile drawers and release cache keys

Run the browser smoke tests with:

```bash
npm run test:browser-smoke
```

The application should also be manually tested in a browser after changes to map interaction, import/export, styling, CRS handling or processing.

## Static deployment

Deploy the contents of `docs/` to:

- GitHub Pages
- Cloudflare Pages
- Another static web host

No application server, database or server-side processing service is required.

For deployment-specific notes, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Current roadmap

The next planned development phases are:

1. Typed field schemas and stronger schema editing
2. Saved filters, improved calculations and table tools
3. Attribute joins and spatial joins
4. Geometry validation and repair expansion
5. Additional processing tools
6. Virtualised tables and larger-dataset performance
7. Advanced rule-based styling and label placement
8. GeoPackage, FlatGeobuf, GeoParquet and GPX support
9. Better remote-layer refresh and source management
10. Project snapshots and portable project packages
11. Print layouts and high-resolution map export
12. Raster and GeoTIFF analysis tools

## Feedback

Report problems or suggest improvements at:

[feedback@editpolygon.com](mailto:feedback@editpolygon.com)

Do not attach sensitive or restricted geometry unless you have permission to share it.

## Licence

No licence file is currently included in this repository. Until a licence is added, copyright law applies by default and reuse rights are not granted automatically.
