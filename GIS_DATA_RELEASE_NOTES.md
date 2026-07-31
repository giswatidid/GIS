# EditPolygon Browser GIS v1.41.1

This release retains the Simple editor and adds browser-local data operations to Advanced GIS.

## Added
- Docked attribute table for editable layers with paging, searching, sorting, row selection and inline cell editing.
- Field creation, deletion and calculator expressions.
- Attribute filters that control map display and processing inputs without deleting records.
- Single, categorised and graduated vector styling.
- Property-driven map labels.
- CRS metadata assignment with an explicit warning that assignment is not reprojection.
- Non-destructive processing outputs: buffer, dissolve/union, centroid, point-on-feature, convex hull and bounding rectangle.
- Processing results are ordinary editable layers.
- `docs/` is the deployable GitHub Pages directory; no `public/` directory remains.

## Privacy
All local feature editing, filtering, field calculation, styling and processing execute in the browser. Existing remote services continue to be requested directly from their providers.
