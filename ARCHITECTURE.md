# EditPolygon architecture

This document describes the current application architecture as of **v1.55.3**. It replaces the accumulated one-off foundation and map-migration notes that previously lived at the repository root.

## Product boundary

EditPolygon is a static, browser-local GIS editor. Local files, editable project geometry, attribute/schema operations, processing, autosave and exports stay in the browser. Remote basemaps and public GIS services are contacted directly by the browser when the user enables them.

The project deliberately has one authoritative application model rather than separate simple and advanced editors:

- one project/file/feature model;
- one selection model;
- one history/undo model;
- one schema and attribute model;
- one style/label model;
- one GIS processing output model.

Editable geometry is stored canonically as WGS 84 GeoJSON longitude/latitude coordinates. Source/native/export CRS metadata is handled separately.

## Main runtime layers

### Application

`docs/assets/editpolygon-app.js` remains the main application controller. It contains the historic editor plus later GIS integrations. It is still large and layered; v1.55.3 adds automated source-order checks around the map/selection boundary because late compatibility reassignments in this monolith have caused real regressions.

New GIS logic should prefer the smaller core modules where practical:

- `gis-core.js`
- `gis-data-core.js`
- `gis-schema-core.js`
- `gis-analysis-core.js`
- `gis-join-core.js`
- `gis-style-core.js`
- `gis-crs-core.js`
- `gis-geometry-health-core.js`
- `gis-remote-source.js`

Long-running analysis, joins and Geometry Health work use dedicated web workers.

### Map abstraction

Application code talks to `EditPolygonMap`, created by `editpolygon-map-adapter.js`.

The map contract owns:

- canonical longitude/latitude view state;
- coordinate ↔ screen-pixel conversion;
- extent fitting and map resize;
- pan and double-click interaction control;
- normalised map events;
- display-layer add/remove/visibility/opacity/z-order;
- tile and WMS services;
- reference GeoJSON and static-raster layers;
- editable vector rendering;
- transient vector overlays;
- DOM edit/measurement handles.

The intended dependency direction is:

```text
EditPolygon application/GIS models
              |
              v
       EditPolygonMap API
              |
        +-----+------+
        |            |
     Leaflet     OpenLayers
   transition     parity
     engine       engine
```

### OpenLayers migration state in v1.55.3

OpenLayers remains opt-in with `?mapEngine=openlayers`. Leaflet remains the default transition engine.

**OpenLayers now runs without any synchronized or hidden Leaflet map.** The old compatibility map, compatibility click bridge, compatibility DOM target and legacy map globals were removed in v1.55.3.

OpenLayers owns its own:

- map/view/navigation;
- built-in basemaps;
- editable vector layers and live geometry updates;
- click hit detection;
- GIS XYZ/TMS/WMS service layers;
- reference GeoJSON, reference tiles and GeoTIFF/static-image previews;
- Geometry Health and processing previews;
- measurements and measurement editing;
- point/circle editing handles;
- location and endpoint markers;
- engine-neutral image/trace overlay positioning.

Leaflet-specific renderer code still exists because Leaflet remains a supported transition engine. It must be guarded so it cannot execute as the OpenLayers renderer.

## Rendering authority

The authoritative editable-vector renderer is the `cachedRenderMap` implementation near the end of `editpolygon-app.js`.

Earlier Leaflet renderers remain for historical/bootstrap reasons while the Leaflet transition engine still exists, but:

- they return immediately in OpenLayers mode;
- `cachedRenderMap` handles non-spatial table exclusion directly;
- no later `renderMap = function ...` assignment is permitted after `renderMap=cachedRenderMap`;
- automated audit checks enforce this ordering.

OpenLayers vector-cache swaps add a replacement layer before removing the previous layer to avoid a blank intermediate frame during map movement.

## Selection authority

Ordinary click selection is geometry-aware and shares the same project selection state used by Layers and Inspector.

The following functions are protected against later reassignment by automated audit checks:

- `featuresAtLatLng`
- `featureHitAtMapPoint`
- `parametricCircleHitAtMapPoint`
- `applyMapFeatureSelection`
- `selectFromMapClick`

This guard exists because an old late source-order override previously replaced true-circle click selection at runtime.

## References, images and raster previews

Reference GeoJSON, XYZ/TMS tiles and existing GeoTIFF/static-raster previews are normal map-runtime display layers.

Perspective/georeferenceable trace images remain DOM overlays rather than simple static-image extent layers because their four-corner/projective transforms cannot be represented faithfully by a rectangular `ImageStatic` extent.

## History and derived outputs

Consequential GIS operations create normal materialised layers/tables rather than hidden side-state. Outputs carry provenance and participate in project history where appropriate.

Measurements also participate in undo/redo and have their own compact history snapshots.

## Known architectural debt

v1.55.3 deliberately does not rewrite the entire application. A static source audit finds 206 named functions with multiple declaration/reassignment sites in `editpolygon-app.js`. Many are intentional compatibility/enhancement wrappers, but they increase source-order risk.

The next releases should continue reducing that debt incrementally rather than performing a high-risk all-at-once rewrite:

1. full OpenLayers parity;
2. make OpenLayers the default;
3. remove Leaflet and Leaflet-only renderers/CSS;
4. simplify dual-engine-era wrappers and renderer caches;
5. continue moving cohesive GIS functionality into smaller modules.

See `V1.55.3_AUDIT.md` for the detailed audit performed for this release.
