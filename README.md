# EditPolygon

**EditPolygon** is a free, privacy-first browser GIS editor for drawing, editing, inspecting, validating, processing, styling and converting vector data.

The application runs as a static website. Local files, geometry edits, attribute operations, processing outputs, autosave and exports remain in the browser. No EditPolygon account or application backend is required.

**Live application:** [editpolygon.com](https://editpolygon.com/)  
**Current application baseline:** v1.55.7.3

The v1.54 **Geometry Health** release replaces the old polygon-only validation workflow with guided validation and repair for point, line, polygon and multipart vector geometry. It separates safe cleanup from consequential repairs, links issues back to the map, verifies polygon topology with GEOS-WASM when available, previews make-valid results before they are accepted, and materialises repairs as normal undoable GIS layers with provenance. v1.54.1 integrated the workflow into the normal Inspector column. v1.54.2 incorporates the first live-testing refinement pass: advanced rules are staged until an explicit rerun, rule choices are geometry-aware, import warnings use Geometry Health diagnoses, repair previews fold in harmless normalisation, invalid before/after metrics are labelled not comparable, repaired-layer warning badges are recalculated consistently, and repeated dangling endpoints are condensed for readability.

The v1.55 map-runtime migration is complete. **v1.55.7.3 uses OpenLayers as the sole native map runtime** behind the `EditPolygonMap` adapter. It preserves the v1.55.7 single-runtime performance cleanup, v1.55.7.1 startup/render-authority hotfix and v1.55.7.2 draw-time navigation model. v1.55.7.3 fixes the remaining transient preview glitch by anchoring the unfinished cursor-linked guide/fill to the pointer's screen pixel while the map pans or zooms, so the live sketch cannot briefly render at its former map position. Click-based drawing still leaves native map pan/zoom available, map drags are suppressed from becoming vertices, arrow and `+` / `-` keys navigate during drawing, and Freehand Polygon retains press-and-drag ownership. Runtime DOM overlays share batched map/view refresh subscriptions, one GeoJSON formatter is reused for repeated geometry conversion, redundant native render invalidations have been removed, and zoom lifecycle events use central fan-out so every subscriber receives the same start/end transition. The deployed parity campaign still covers drawing/editing, repeated-world and International Date Line behaviour, authoritative undo/redo, points and true circles, snapping/topology, measurements, Geometry Health, styling/labels, remote GeoJSON, ArcGIS services, WMS, large-vector performance, lossless `.epz` persistence and mobile/touch parity. Application code remains map-library-neutral; native OpenLayers implementation details are isolated in `editpolygon-map-adapter.js`. See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`QUALITY_BASELINE.md`](QUALITY_BASELINE.md) and [`CHANGELOG.md`](CHANGELOG.md).

## What EditPolygon is for

EditPolygon is intended for:

- GIS professionals who need a quick browser-based editor or converter
- Emergency-management users working with operational polygons and reference layers
- Casual map users who need to inspect or modify common geospatial files
- Developers who need a static, client-side GIS application that can be deployed without a server

The same core GIS workflows are available on phone, tablet and desktop; larger screens simply provide more working space for dense geometry and tables.

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

### Geometry Health validation and repair

**GIS → Check & fix geometry** opens a guided Geometry Health workspace for an entire layer or only selected, filtered or visible records.

Standard checks cover Point, MultiPoint, LineString, MultiLineString, Polygon and MultiPolygon geometry. Results use four exclusive, plain-language categories so each feature appears once according to its most serious finding:

- **Ready** — no problem was found by the selected checks
- **Safe to fix** — an exact, shape-preserving cleanup is available
- **Needs review** — an automatic proposal can change the represented geometry and must be previewed
- **Manual review** — EditPolygon should not make the decision automatically

Geometry Health detects structural coordinate problems, repeated vertices and points, polygon closure and ring problems, collapsed geometry, self-intersections, invalid holes, nested/intersecting holes, duplicate rings and overlapping MultiPolygon parts. Optional layer rules can additionally flag exact duplicate features, polygon overlaps, line self-crossings and dangling line endpoints without pretending those conditions are universally invalid GIS geometry.

Polygon topology is independently verified with **GEOS-WASM 3.1.1** when the robust engine can be loaded. Consequential `MakeValid` proposals use GEOS first. If that engine is unavailable, the interface identifies the less-comprehensive Turf fallback rather than presenting it as equivalent. Geometry files themselves remain in browser memory; loading third-party runtime libraries can still send ordinary request metadata to their CDN providers.

Every issue can be located on the map. Consequential repairs show the proposed geometry as a separate preview, identify the repair engine, report geometry-type/vertex changes and relative area or length changes, and elevate material changes for explicit review. Exact duplicate features are never deleted automatically.

**Fix safe issues** is deliberately limited to changes such as removing exact neighbouring duplicate vertices or points, redundant closure storage and normalising polygon ring direction. It does not automatically close ambiguous boundaries, delete holes, remove features or choose between competing interpretations.

The default output is a new **repaired layer**; the input layer is preserved. Outputs retain validation provenance including rules, before/after counts and statistics, robust-engine status, warnings, safe changes, accepted review repairs and unresolved-issue summaries. Full validation reports can also be exported as JSON and issue lists as CSV.

### Conversion

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
- EditPolygon `.epz` files

### Export

- KML
- KMZ
- GeoJSON
- GML
- CSV
- WKT
- TopoJSON
- ESRI Shapefile ZIP
- EditPolygon `.epz` project files

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

See [`QUALITY_BASELINE.md`](QUALITY_BASELINE.md) for current CRS validation evidence and accuracy limitations.

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

- `.epz` download and import
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

- Cached engine-specific vector rendering with shared map-runtime control
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

Phone and tablet are first-class EditPolygon surfaces rather than a separate reduced mode. At mobile widths:

- The map becomes the primary full-width workspace
- Layers and Inspector open as touch-friendly drawers; phone drawers use the full available width
- The desktop tool rail becomes a horizontally scrollable bottom dock, including direct **GIS** access
- Advanced GIS exposes the same Layers, Add data, Basemaps and Project workspace on touch devices
- Project, save/export, basemap, location, conversion, validation and help actions remain available in the mobile Project sheet
- Selection, drawing, editing and measurement workflows use compact contextual controls without dropping the underlying functionality
- Layer-management, GIS forms, menus and OpenLayers controls use mobile-sized touch targets and viewport-safe scrolling
- Safe-area insets, landscape phones and dynamic mobile viewport height are supported

A larger screen can be more convenient for very dense geometry or wide attribute tables, but it is not a different capability tier.

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
│   │   ├── gis-geometry-health-core.js
│   │   ├── gis-geometry-health-worker.js
│   │   ├── gis-geos-adapter.js
│   │   ├── gis-geometry-health.js
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

This runs repository integration checks, the v1.55.7.3 single-runtime/draw-navigation audit, the binding/architecture no-growth audit and the JavaScript test suite.

Run the browser smoke matrix with:

```bash
npm run test:browser-smoke
```

OpenLayers is the only map runtime. `EditPolygonMap.engine` should report `"openlayers"` on normal startup. There is no alternate engine selector, compatibility fallback or application-level native-map escape.

The audits verify that the final cached editable renderer is engine-neutral, OpenLayers implementation details stay inside the adapter, critical click-selection functions have one authoritative binding, application code contains no native-map escape, and no new function patch appears after the final runtime-authority boundary.

The application should also be manually tested in a real browser after changes to map interaction, import/export, styling, CRS handling or processing.

## Static deployment

Deploy the contents of `docs/` to:

- GitHub Pages
- Cloudflare Pages
- Another static web host

No application server, database or server-side processing service is required.

For deployment-specific notes, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Current roadmap

The map-runtime migration and its single-runtime cleanup are complete. v1.55.7.3 is the stable pre-toolbox baseline.

1. **v1.56 — Processing Toolbox:** consolidated browser-local vector processing, selection and geometry-maintenance framework with workers, progress/cancellation and consistent outputs.
2. **v1.57 — Large-data performance:** virtualised tables/lists, worker-based data operations, spatial indexing and larger-dataset architecture.
3. **v1.58 — Professional styling and labels:** rule/expression styling, scale-dependent symbology and stronger cartographic label placement.
4. **v1.59 — Advanced formats:** GeoPackage, FlatGeobuf, GeoParquet and GPX, plus format hardening.
5. **v1.60 — Viewer / Presenter:** read-only viewer mode, configurable presentation controls and scene-based spatial storytelling.
6. **v1.61 — 3D visualisation:** synchronized 2D/3D viewing, terrain, camera bookmarks and attribute-driven extrusion.
7. **v1.62 — Data source management:** persistent remote source definitions, refresh/reconnect, service discovery and source health.
8. **v1.63 — Portable projects and snapshots:** richer `.epz` assets, named restore points, project dependencies and portability.
9. **v1.64 — Print layouts:** map composition and publication-quality PDF/high-resolution export.
10. **v1.65 — Raster GIS:** raster inspection, calculations, clipping/resampling/reprojection and DEM tools.
11. **v1.66 — Advanced 3D GIS:** local terrain/DEM integration, 3D Tiles/models/point clouds and advanced 3D analysis.

Temporal GIS, Model Builder, extensibility and server-assisted heavy processing remain later candidates after the core roadmap is established.

The migration preserves the existing project, geometry, CRS, schema, history and analysis models rather than rebuilding the application around the map library.

## Feedback

Report problems or suggest improvements at:

[feedback@editpolygon.com](mailto:feedback@editpolygon.com)

Do not attach sensitive or restricted geometry unless you have permission to share it.

## Licence

No licence file is currently included in this repository. Until a licence is added, copyright law applies by default and reuse rights are not granted automatically.
