# v1.52.3 — visible active-filter state

- Shows a persistent “Filter active” banner with matching and hidden feature counts.
- Marks the Filter tab with an active count badge even while another data tab is open.
- Shows an active-filter banner above the attribute table with Edit and Clear actions.
- Changes Apply filter to Update active filter while a filter is already controlling the layer.
- Disables Clear active filter when no filter is applied.

# v1.52.2 — schema history synchronisation

- Fields & stats refreshes immediately after project undo and redo.
- Removed schema rows no longer remain as stale, non-editable phantom fields.
- An open field editor closes safely when its field is removed by history restoration.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y preserve native text editing while focus is inside an input, textarea or contenteditable control.

# EditPolygon v1.52.1 — Typed-field API wiring fix

- Keeps the typed schema implementation inside the main application scope so field add, edit, delete, filters, calculations and scoped exports register against the live project.
- Registers the public schema API before layer initialisation and isolates malformed-layer schema inference failures.
- Adds regression coverage for the runtime scope and API registration order.

# EditPolygon Browser GIS v1.52.0

This release adds an explicit typed attribute model and upgrades the attribute table, Inspector, filtering, calculations and record export while keeping all local data operations in the browser.

## Typed field schemas

Each editable layer now carries a schema with text, integer, decimal, boolean, date and datetime fields. Imported and older projects receive a conservative inferred schema without discarding their original values.

Fields can define:

- A storage name and user-facing alias
- A description
- A default value
- Nullable and required rules
- Read-only behaviour

The schema editor can add, rename, delete and change field types. Type changes show a conversion preview before applying. Incompatible values are blocked by default and can only be replaced with `NULL` through an explicit option.

Renaming or deleting a field also updates dependent display-field, label, filter and styling references where applicable.

## Typed editing and tables

The attribute table and Inspector now use field-specific controls:

- Numeric inputs for integer and decimal fields
- Boolean selectors
- Native date and datetime inputs
- Explicit `NULL` controls
- Disabled controls for read-only fields

Sorting is type-aware, supports multiple columns through Shift-click, and keeps null values last. Search, paging and selected-record handling remain available.

## Compound and saved filters

Filters can contain multiple conditions using `AND` or `OR`. Available operators adapt to the field type and include text matching, ordered comparisons, ranges, list membership, boolean matching and empty/populated checks.

Filters can be named, saved, reapplied and removed without deleting records from the layer.

## Type-safe field calculator

The calculator now requires an output type and previews results before changes are applied. It supports all, visible or selected records and rejects values incompatible with the target field.

The deterministic expression language includes:

- Field references such as `[population]`
- Arithmetic and comparisons
- Conditional and null-handling functions
- Text manipulation
- Numeric rounding and aggregation helpers
- Date and datetime conversion and extraction

It does not execute arbitrary JavaScript.

## Scoped record export

GeoJSON and CSV/WKT record export can target:

- The entire layer
- Filtered records
- Visible records
- Selected records

GeoJSON record exports include the EditPolygon field schema.

## Compatibility

Existing projects continue to load. Their schemas are inferred in memory and are persisted the next time the project is saved. Processing outputs and selection-derived layers receive or inherit valid schemas.

## Validation

- Repository integration checks pass
- 71 automated tests pass
- CRS browser smoke test passes
- ArcGIS remote-source browser smoke test passes
- Typed-data browser smoke test passes

## Privacy

Schema inference, editing, filtering, calculations, statistics and exports execute locally in the browser. Remote services continue to be requested directly from their providers.
