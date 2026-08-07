# EditPolygon v1.53.2 — join output spatial-index wiring fix

- Creating an attribute-join, grouped-summary or spatial-join result now invalidates the GIS spatial index through the public application API.
- The result layer or table completes normally instead of stopping after insertion with `invalidateSpatialIndex is not defined`.
- Typed field calculations use the same scope-safe spatial-index invalidation path.
- The v1.53.1 complete join preview remains intact and displays all output fields.

# EditPolygon v1.53.1 — complete join preview columns

- Join previews display the complete output schema instead of truncating the preview to the first eight fields.
- Joined fields remain visible even when the target layer already contains many attributes.

# EditPolygon v1.53.0 — joins, summaries and spatial enrichment

Version 1.53 adds browser-local tools for combining attribute data, creating grouped summaries and enriching layers according to spatial relationships. All results are materialised as new project layers or tables; the source data is never modified and no EditPolygon server receives the records.

## Join by matching fields

The Join & summarize workspace can append selected fields from another loaded layer, a project table, or a directly selected CSV, TSV, JSON or GeoJSON lookup file.

The workflow provides:

- Explicit target and source fields
- Typed key compatibility checks
- Preservation of leading-zero text identifiers
- Optional case-insensitive, trimmed and whitespace-normalised text matching
- Left joins that keep every target record
- Inner joins that keep matched target records only
- Duplicate-key and join-cardinality analysis
- Blocking of ambiguous multiple matches by default
- Explicit first-match or one-to-many expansion choices
- Selection of source fields and output names
- Automatic conflict prefixes and unique output field names
- All, filtered, visible and selected input scopes
- Match, no-match, warning and expected-output previews

Joined layers preserve target geometry and typed target fields. Copied fields retain their source types while becoming safely nullable when a left join can produce unmatched records.

## Grouped summaries

Records can be grouped by one or more typed fields and summarized using:

- Record count
- Populated-value count
- Distinct-value count
- Sum
- Average
- Median
- Minimum
- Maximum
- First value
- Last value
- Combined distinct text

The default result is a non-spatial project table. Spatial inputs can instead keep the first geometry in each group, and polygon layers can dissolve geometry by group in the processing worker.

Summary result schemas are created explicitly. Counts are integers, averages and medians are decimals, and minimum/maximum fields preserve the source type.

## Project tables

Non-spatial summary results are stored as project tables and appear in the Layers panel with a TABLE indicator.

Tables:

- Do not render on the map
- Open in the typed attribute table
- Support editing, sorting, filtering and saved filters
- Support field calculations and statistics
- Can be exported as CSV/WKT or GeoJSON records
- Can be used as a source or target in later attribute joins
- Persist in autosave and `.polygonproject` files
- Are created and removed as one undoable project operation

## Join by location

Spatial joins retain target geometry and add source information according to geometry relationships:

- Point within polygon
- Intersects
- Within
- Contains
- Touches
- Overlaps
- Nearest feature

Multiple spatial matches can be:

- Summarized, including counts and typed calculations
- Expanded into one target copy per source match
- Reduced to an explicitly chosen first match

Nearest joins can include geodesic distance in kilometres and apply a maximum search distance. For lines and polygons, the nearest workflow clearly reports that representative points are used rather than survey-grade boundary-to-boundary distance.

Spatial joins build a source bounding-box index, test exact geometry relationships only against candidate features, run in a dedicated worker, report progress and support cancellation. Missing or invalid geometries are skipped and reported rather than silently treated as matches.

## Preview and safety

Every join or summary is configured and previewed before output creation. Previews report relevant counts, warnings, schema conflicts and sample result records. Operations with unresolved field types, missing fields, duplicate matches or invalid configurations remain disabled.

The input layers, tables, filters and selections are not changed. Output creation is one project-history operation, so Undo removes the complete result and Redo restores it.

## Compatibility

v1.53 builds on the v1.52 typed-field schema. Existing layers and projects continue to load. Joined fields work with filtering, styling, labels, calculations, processing and export.

## Validation

- Repository integration checks pass
- 96 automated tests pass
- CRS browser smoke test passes
- ArcGIS remote-source browser smoke test passes
- Typed-data browser smoke test passes
- Join and summary browser smoke test passes
- JavaScript syntax validation passes

## Privacy

Attribute joins, grouped summaries, table creation, spatial indexing and spatial joins execute in the browser. Directly selected lookup files are read locally and are not added to the project unless the user creates an output. Remote layer data continues to be requested directly from its provider by the user's browser.
