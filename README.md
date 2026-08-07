# EditPolygon

**EditPolygon** is a free, privacy-first browser GIS editor for drawing, editing, inspecting, validating, processing, styling and converting vector data.

The application runs as a static website. Local files, geometry edits, attribute operations, processing outputs, autosave and exports remain in the browser. No EditPolygon account or application backend is required.

**Live application:** [editpolygon.com](https://editpolygon.com/)  
**Current application baseline:** v1.53.3

The v1.53.3 interface maintenance release keeps the layer **More** and **GIS** menus inside the browser viewport, adds internal scrolling for short screens, completes the GIS shortcut list, and replaces the accumulated layer menu controls with clearer layer-management groups.

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

Editable layers use an explicit, browser-local field schema. Supported field types are:

- Text
- Integer
- Decimal
- Boolean
- Date
- Datetime

The schema editor supports:

- Adding, renaming and deleting fields
- Field aliases and descriptions
- Default values
- Nullable, required and read-only rules
- Conservative type inference for imported and legacy layers
- Conversion previews before changing a field type
- Optional conversion of incompatible values to `NULL`
- Automatic updates to labels, filters, display fields and styles when fields are renamed or removed

The attribute table and Inspector use the schema to provide:

- Type-appropriate editors, including booleans, dates and datetimes
- Clear `NULL` handling rather than treating every empty value as text
- Read-only field enforcement
- Type-aware sorting
- Shift-click multi-column sorting
- Search, pagination and configurable page sizes
- Selection-aware editing and calculations

Filtering supports multiple type-aware conditions joined with `AND` or `OR`, including text matching, numeric and date comparisons, ranges, booleans, lists and populated/empty checks. Filters can be named, saved, reapplied and deleted.

The deterministic field calculator supports typed output, previews and all, visible or selected record scopes. Expressions can reference fields as `[field]` and use arithmetic, comparisons, concatenation, conditionals, text functions, numeric functions and date functions without evaluating arbitrary JavaScript.

GeoJSON and CSV/WKT record exports can be limited to the entire layer, filtered records, visible records or selected records. GeoJSON exports include the EditPolygon field schema.

### Join, summarize and enrich data

The **Join & summarize** workspace combines records without changing the input layers. Every operation shows a preview and creates a new materialised result that can be undone, saved, filtered, styled and exported.

**Join by matching fields** works like a spreadsheet lookup: choose a field in the current layer and a matching field in another loaded layer, project table, CSV or JSON lookup file, then copy selected source fields into the result. The workflow includes:

- Typed key compatibility checks
- Exact text matching with optional case and whitespace normalisation
- Leading-zero preservation for identifier fields
- Left and inner joins
- Explicit handling of duplicate source matches
- Match, no-match and output-count previews
- Automatic field-name conflict resolution
- Source and target scopes based on all, filtered, visible or selected records

**Summarize records** works like a pivot table. Records can be grouped by one or more fields and calculated using count, distinct count, sum, average, median, minimum, maximum, first, last and distinct-text combination operations. Results can be created as:

- A non-spatial project table
- One feature using the first geometry in each group
- Dissolved polygon geometry for each group

Non-spatial results appear in the Layers panel with a **TABLE** indicator and use the same typed attribute table, filtering, calculations, exports and project persistence as map layers.

**Join by location** combines records according to where their geometry is located. It supports:

- Point-in-polygon matching
- Intersects, within, contains, touches and overlaps relationships
- Nearest-feature matching with an optional maximum distance
- First-match, expanded or summarized match handling
- Counts and typed summaries of matching features
- Match-distance fields for nearest joins
- Invalid-geometry and skipped-record reporting

Join and summary outputs are self-contained. They do not remain linked to, or modify, the original inputs. Spatial operations run in a dedicated browser worker with progress and cancellation.

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

At the v1.53.3 baseline used for this README:

- Repository integration checks pass
- All 101 automated tests pass
- CRS, ArcGIS remote-source, typed-data, join and summary browser smoke tests pass
- Regression coverage includes typed schema inference and conversion, visible active-filter state, compound filters, multi-column sorting, field calculations, joins and summaries, unified styling, selection tools, viewport-safe menus, Layers-panel resizing, mobile drawers and release cache keys

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

1. Geometry validation and repair expansion
2. Additional processing tools
3. Virtualised tables and larger-dataset performance
4. Advanced rule-based styling and label placement
5. GeoPackage, FlatGeobuf, GeoParquet and GPX support
6. Better remote-layer refresh and source management
7. Project snapshots and portable project packages
8. Print layouts and high-resolution map export
9. Raster and GeoTIFF analysis tools

## Feedback

Report problems or suggest improvements at:

[feedback@editpolygon.com](mailto:feedback@editpolygon.com)

Do not attach sensitive or restricted geometry unless you have permission to share it.

## Licence

No licence file is currently included in this repository. Until a licence is added, copyright law applies by default and reuse rights are not granted automatically.
