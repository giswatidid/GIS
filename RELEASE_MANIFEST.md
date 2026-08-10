# EditPolygon v1.55.4.16 release manifest

v1.55.4.16 replaces the development-only plain JSON project download with the new lossless `.epz` EditPolygon project container. This is deliberately a clean format cutover: `.polygonproject` is not retained as a supported import or export format because there are no production project files requiring compatibility yet.

## Project format

A normal saved project is now `editpolygon_project.epz`. It is a ZIP/DEFLATE container containing:

- `manifest.json` — EditPolygon container identity, format version, app version, project member name, save timestamp, compression method and optional SHA-256 integrity record;
- `project.json` — the complete canonical EditPolygon project payload, unchanged in GIS semantics;
- `assets/` — reserved for future embedded binary/reference assets without forcing Base64 data into the JSON model.

Compression is lossless. The project model still preserves exact stored coordinates, feature properties, styles/labels, true-circle metadata, measurements/annotations, images, reference overlays, GIS workspace/service definitions, layer visibility/opacity/order, CRS metadata and view/UI state.

## Load safety

`.epz` loading validates the ZIP structure, manifest identity and format version, requires `project.json`, verifies SHA-256 when Web Crypto is available, parses the canonical project JSON, and only then hands it to the existing project normalisation/restoration path. CRC re-decompression is deliberately not enabled because SHA-256 already verifies the canonical project member after a single decompression, avoiding a large-project performance penalty. Corrupt, malformed or newer unsupported containers fail with a clear project-file error rather than attempting partial state restoration.

## Architecture

Project packaging is isolated in `docs/assets/editpolygon-project-format.js`, loaded after JSZip and before `editpolygon-app.js`. The application owns project state; the project-format module owns only container encode/decode/integrity. The historical v1.72 project save/import wrapper no longer replaces `saveProject` or `importFile`.

## Validation checklist

1. Save a mixed project and confirm the downloaded file ends in `.epz`.
2. Optionally rename a copy to `.zip` and inspect it: `manifest.json`, `project.json` and `assets/` should be present.
3. Compare the `.epz` file size with the uncompressed `project.json`; geometry-heavy projects should compress substantially without changing data.
4. Open the `.epz` in a fresh EditPolygon page and confirm editable geometry, true circles, measurements, styles, remote/reference layers, WMS, visibility/opacity/order and view state restore.
5. Edit a restored feature and verify undo/redo still renders immediately.
6. Corrupt/truncate a copy of the `.epz` and confirm EditPolygon reports an unreadable/damaged project rather than loading partial state.

## Automated gate

The release must pass repository integration checks, runtime/binding audits, the complete Node test suite and all seven browser smoke suites before deployment.
