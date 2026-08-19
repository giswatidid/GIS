# EditPolygon changelog

## v1.56.1 live-test hotfixes

- Fixes Point/Line **Geometry code** validation: Point and LineString edits now use the geometry-type-aware shared Geometry Health core instead of the legacy polygon-only validator, eliminating false “Unsupported geometry type Point” and “open line / polygon area” errors while retaining real coordinate/line validity checks.
- Fixes desktop Point/Line **Geometry code** Inspector rendering: the editor card no longer flex-shrinks/clips when opened, reconciliation keeps it immediately after Geometry for both Point and Line inspectors, and the browser regression now checks desktop layout as well as editing behaviour.
- Fixes the live Point/Line **Geometry code** integration: Point now owns its accordion interaction so delegated Inspector clicks cannot immediately rebuild it, Line is reconciled by the final authoritative Inspector renderer after native geometry-specific UI finishes, and the restored Polygon editor remains unchanged.
- Adds Point/Line **Geometry code** back as an isolated v2 extension: the known-good polygon editor remains unchanged, Point/Line uses its own namespaced Inspector section and validation path, and integration is MutationObserver-driven rather than another `renderSelected` wrapper.
- Restores the Inspector **Geometry code** editor to the last known-good polygon-only implementation from `ba3afbc`; the failed Point/Line retrofit and forced Inspector reconciliation are removed before Point/Line support is attempted again in isolation.
- Geometry-constrained Processing tools now accept mixed-geometry EditPolygon layers and process only the compatible features for each input role; scope labels and pre-flight warnings report compatible/excluded counts instead of rejecting the whole layer.
- Processing tasks and in-place maintenance commits now use the exact compatibility-filtered pre-flight feature set, preserving unrelated geometry in mixed layers; switching tools or parameters also clears stale completion/result state from the previous configuration.
- Replaces raw browser multi-select boxes for Processing `fields` parameters with an explicit checkbox field picker, selected-count summary, **Select all** and **Clear** actions, including mobile/touch layout coverage.
- Fixes `Distance to nearest` / `Nearest feature` metric reads to use the GEOS-WASM supported `Module.getValue(..., 'double')` output-pointer path, with a safe typed-memory fallback.
- Same-layer nearest-neighbour searches now exclude the input feature itself instead of returning a guaranteed zero-distance self match, and pre-flight explains that behaviour.
- Processing worker tasks now carry explicit input-layer identities so same-layer spatial semantics are unambiguous.

## v1.56.1 — Full Processing Toolbox consolidation

- Live-testing hotfix: switching Processing tools now preserves the current source scope (All, Filtered or Selected), so **Process selected** remains selected after choosing Difference, Union or another tool.
- Completes the pre-release v1.56 Processing Toolbox milestone with a **32-tool declarative catalogue** spanning vector geometry, overlay, aggregation, conversion, selection, spatial analysis and geometry maintenance.
- Generalises Processing requests from a fixed source/overlay/new-layer shape to declared inputs, generic parameters and layer/selection result contracts, including deliberate in-place maintenance where a tool permits it.
- Adds `gis-processing-engine.js` as the shared high-level processing router and `gis-spatial-core.js` as the shared indexing/relationship/nearest engine.
- Expands the existing GEOS-WASM adapter for robust Intersection, Difference, Union, Symmetric difference, Unary Union/Dissolve, Snap, topology-preserving Simplify, Densify and metric Distance while retaining the Geometry Health MakeValid boundary.
- Adds real processing-CRS handling for projected GEOS/metric operations: cloned canonical WGS 84 input is transformed for processing and returned to canonical WGS 84 before commit; provenance records the actual CRS.
- Makes Join & Summarize consume the shared spatial core and shared dissolve primitive instead of maintaining independent implementations.
- Makes Select by Attribute consume typed schema/filter semantics and passes authoritative input schemas into worker tasks.
- Adds selection-only Toolbox results and undoable new-layer/in-place commit policies without making map visibility an analysis scope.
- Removes independent Simple Editor Merge/Dissolve, Cut/Difference, Intersection, Clip, Erase, Repair and Simplify processing entry points/kernels, including the broken development-era Erase path. Feature and multi-selection actions now open the authoritative Toolbox with **Selected features** preconfigured; direct graphical editing conveniences such as Offset/inset, Split, holes and Smooth remain.
- Adds `.gitignore` required by the repository quality gate and expands regression coverage for the full catalogue, contracts, shared spatial engine, GEOS adapter and Processing execution router.
- Marks v1.56 complete; v1.57 large-data performance is the next roadmap milestone.

## v1.56.0.4 — EPZ project-open history hotfix

- Fixes a project-open undo boundary bug where a stale structural history snapshot could survive the `.epz` restore wrappers and become the first Ctrl+Z action in the newly opened project.
- Opening an `.epz` now always starts a fresh editing session with empty project/image undo and redo stacks **after** GIS workspace and reference-overlay restoration has finished.
- Removes the obsolete `pushHistory()` snapshot taken immediately before replacing the current project with an opened project file.
- Keeps undo/redo intentionally transient: `.epz` stores durable project state and processing provenance, not in-memory editor history. After reopening, Ctrl+Z/Ctrl+Y do nothing until the user makes a new edit.
- Adds regression coverage for both project-open pipelines, the final GIS restore boundary, and the rule that history/future stacks are not serialised into `project.json`.
- Processing algorithms, output provenance and the v1.56.0.2 Toolbox layout are otherwise unchanged.

## v1.56.0.1 — Processing selection-scope hotfix

- Fixes a startup/runtime wiring error in the new Processing Toolbox where the application bridge referenced a private `selectedIds()` helper outside its lexical scope.
- The visible symptom was `selectedIds is not defined`, a pre-flight count of 0 source features and a disabled **Run and create layer** button even when the chosen layer contained valid features.
- Processing now resolves selection through the public `EditPolygonGIS.getSelection()` API, so **All**, **Filtered** and **Selected** scopes share the same stable selection contract as the rest of Advanced GIS.
- Adds a source-order regression guard that rejects any future Processing bridge dependency on the earlier private selection helper. No geometry algorithms, output schema or project format changed from v1.56.0.

## v1.56.0 — Processing Toolbox foundation

- Replaced the historical Process tab with a searchable, declarative **Processing Toolbox** shared by desktop and mobile.
- Added the first controlled toolbox catalogue: **Buffer, Centroids, Point on surface, Convex hull, Bounding rectangle, Clip, Intersection and Dissolve**.
- Added `gis-processing-registry.js`, `gis-processing-core.js`, `gis-processing-worker.js`, `gis-processing.js` and `gis-processing.css` so tool metadata, validation/execution, worker lifecycle and UI are no longer embedded as one-off processing branches in `editpolygon-app.js`.
- Processing requests now use explicit **All / Filtered / Selected** feature scopes. Individual feature/layer visibility is presentation state and no longer silently changes which records are processed.
- Added pre-flight geometry/parameter checks, stage-aware progress, cancellation, output summaries and explicit partial-failure reporting. Aggregate operations such as Dissolve fail atomically if an input cannot be combined rather than returning an incomplete aggregate without warning.
- Processing runs create a new editable layer only after a complete result returns. Cancellation, worker failure and empty results leave the project unchanged; successful output creation is one history transaction.
- Output layers retain machine-readable `gisProcessing` provenance in `.epz`, including tool, source/overlay layers, scopes, parameters, processing CRS, worker/engine metadata, input counts and result/failure summary.
- Per-feature/overlay outputs preserve source schema and layer styling/labels where compatible, and transient GeoJSON feature IDs allow matching feature-level style overrides without adding internal IDs to attributes.
- Retired `gis-analysis-worker.js`; all toolbox worker execution now delegates to the shared processing core instead of maintaining a second geometry implementation.
- v1.56.0 deliberately keeps the migrated Turf-based overlay behaviour. Robust GEOS-backed Difference, Symmetric difference, true two-layer Union, dissolve-by-field and Make Valid are reserved for v1.56.1.

## v1.55.7.4 — Single live-sketch render authority

- Fixes the remaining transient polygon ghost seen during pan/zoom by removing duplicate screen-space SVG rendering of unfinished sketch geometry.
- Makes the adapter-owned OpenLayers transient vector overlay the sole renderer of live draw linework, polygon fill, dashed cursor guide and cursor marker.
- Keeps the DOM edit overlay only for clickable draw vertices and textual hints, so there is no second geometry copy that can repaint one frame behind the map.
- Retains v1.55.7.3 screen-pixel cursor reprojection and all v1.55.7.2 navigation behaviour: drag pan without vertices, wheel/arrow/+/- navigation, and Freehand Polygon press-and-drag drawing.
- Covers both the normal polygon renderer and the late LineString wrapper so historical source-order code cannot reintroduce SVG sketch geometry.
- Adds a regression test that rejects any future live geometry writes to `drawFillPath`, `drawLinePath` or `drawPreviewPath`.
- No project schema, committed geometry, Advanced GIS or Processing Toolbox behaviour changes.

## v1.55.7.3 — Draw preview pan/zoom hotfix

- Fixes a transient drawing-preview ghost that could appear while panning or zooming an unfinished click-based polygon after v1.55.7.2 enabled map navigation during drawing.
- Tracks the live drawing cursor by **screen pixel** as well as geographic coordinate. When the map view changes, the cursor coordinate is immediately reprojected from that fixed screen pixel before the transient OpenLayers preview is rendered.
- Keeps the pointer-linked dashed guide and temporary polygon fill attached to the actual mouse position instead of letting an older ground-coordinate preview survive for one frame during map movement.
- Applies the same cursor resynchronisation to drag-pan, wheel/keyboard zoom and view-reset paths while leaving committed vertices unchanged.
- Preserves v1.55.7.2 behaviour: drag pans without adding vertices, wheel/arrow/+/- navigation works during drawing, and Freehand Polygon still owns press-and-drag.
- Adds regression coverage for screen-pixel cursor reprojection and synchronous transient-preview refresh before the normal requestAnimationFrame overlay pass.
- No project schema, saved geometry, Advanced GIS, editing or Processing Toolbox behaviour changes.

## v1.55.7.2 — Draw-time map navigation

- Keeps native OpenLayers navigation available while any click-based drawing tool is active: drag to pan, mouse wheel to zoom, arrow keys to pan, and `+` / `-` to zoom.
- Makes map drag and draw-click semantics explicit. Runtime `pointerdrag` state suppresses the following click so holding the mouse button and dragging cannot create an accidental vertex.
- Keeps **Freehand Polygon** as the deliberate exception: press-and-drag continues to sketch geometry rather than pan the map. Wheel and keyboard navigation remain available between freehand strokes.
- Routes click-based drawing through normalized `EditPolygonMap` runtime events instead of requiring the full-screen edit overlay to own pointer input. Cursor preview, right-click undo, double-click finish and world-wrap/Date Line coordinate handling remain intact.
- Adds adapter-owned `panByPixels()` and `zoomBy()` navigation methods so application code never reaches into OpenLayers native objects.
- Moves **Free polygon** to the first position in the Draw flyout, ahead of Point and the dynamically inserted LineString tool.
- Adds regression coverage for drag-without-vertex behaviour, draw-time keyboard navigation, freehand pointer ownership, overlay pointer-event policy and Draw flyout ordering.
- No project schema, saved geometry format, editing semantics or Advanced GIS capability changes.

## v1.55.7.1 — Startup/render authority hotfix

- Fixes an uncaught `ReferenceError` introduced by v1.55.7 when the retired pan-recovery `customPointerDragActive` helper was removed but a late legacy enhancement block still referenced it.
- Removes that obsolete late compatibility hook instead of restoring dead pan-recovery machinery.
- Restores completion of application startup, including the final authoritative editable renderer and the Advanced GIS bridge/workspace controls.
- Fixes the live symptom where a polygon remained visible while drawing, was committed to the layer, then disappeared immediately after finishing because startup had aborted before the authoritative renderer installation.
- Adds audit/test guards so the retired drag-state hook cannot reappear and verifies the Advanced GIS installation occurs before the final runtime-authority boundary.
- No project schema, geometry semantics, GIS tools or map-runtime behaviour are otherwise changed from v1.55.7.

## v1.55.7 — OpenLayers-only performance and architecture cleanup

- Collapses the map adapter to one `createRuntime()` factory and removes the remaining transition-era capability methods, native-map escape surface, engine markers and application runtime-name dataset.
- Removes the dead pan-recovery compatibility stack and its global pointer/touch/visibility listeners, which had become no-ops after OpenLayers became the sole runtime.
- Makes persistent indexed sources and focused precision overlays direct OpenLayers-era invariants rather than capabilities negotiated by application code.
- Reuses one `ol.format.GeoJSON` formatter per runtime across editable layers, reference GeoJSON, transient overlays and live geometry updates.
- Reworks DOM overlays so all handles/labels share runtime-level map/view subscriptions and requestAnimationFrame-batched position refresh instead of adding six map subscriptions per overlay.
- Centralises zoom lifecycle detection and fans logical zoom start/end events to every subscriber. This closes a latent ordering bug where shared zoom state could let the first listener consume the transition before later listeners observed it.
- Removes redundant explicit native render/source invalidations after OpenLayers setters and source mutations that already schedule their own redraw.
- Removes the private `values_` fallback from editable feature hit detection and relies on public feature identity APIs.
- Generalises OpenLayers-only DOM/CSS selectors now that there is no engine-specific body selector.
- Adds `.gitignore` and removes the stale `CRS_VALIDATION.md` report from the normalized repository baseline.
- Expands regression coverage for shared GeoJSON conversion, constant DOM-overlay listener counts, multi-subscriber zoom fan-out and the absence of the retired pan listener stack.
- Final gate: 270/270 Node tests, 8/8 browser smoke suites, 1,686 named bindings, ceilings of 198 duplicate names / 371 extra binding sites, and zero application engine branches/native-map calls/escapes.
- Processing Toolbox work resumes after this stabilisation release.

## v1.55.6 — OpenLayers-only runtime

- Completes the map-runtime migration by making OpenLayers the only native map implementation in the repository.
- Removes the retired map dependency from deployment HTML, the alternate runtime implementation, engine query selector, automatic fallback state and compatibility runtime metadata.
- Removes the old bootstrap editable renderer, full-detail reference canvas renderer and v1.30 native performance renderer that existed only for the retired implementation.
- Converts remaining native-control styling to OpenLayers selectors and removes obsolete retired-runtime CSS.
- Deletes the alternate-runtime browser smoke and makes the OpenLayers parity smoke the single map-runtime browser contract.
- Tightens architecture audits to require zero application native-map calls, zero native-map escapes, one runtime factory and no selector/fallback state.
- Lowers the historical binding-debt ceilings to 198 duplicate names / 371 extra binding sites after the runtime cleanup.
- Carries forward all live-tested parity fixes: repeated-world and Date Line editing, authoritative undo/redo, focused large-vector editing, WMS/remote services, lossless `.epz` projects and full mobile/touch GIS parity.
- Sets v1.55.7 as the next OpenLayers-only performance/cleanup release before returning to the Processing Toolbox roadmap.

## v1.55.5 — OpenLayers default cutover

- Makes OpenLayers the default map engine for normal URLs with no `mapEngine` parameter.
- Retains Leaflet for this release only as the explicit `?mapEngine=leaflet` emergency fallback.
- Keeps automatic runtime fallback to Leaflet if the OpenLayers runtime fails to initialise, with `EditPolygonMap.fallbackReason` preserving the failure reason.
- Updates default-engine browser coverage so the OpenLayers parity smoke starts through `createRuntime()` without forcing an engine.
- Updates the Leaflet browser smoke to exercise the actual explicit fallback selector rather than constructing the Leaflet runtime directly.
- Adds Node-level guards for the no-query OpenLayers default, unknown-query safe default, explicit Leaflet selection and default runtime startup without any Leaflet map creation.
- Carries forward the complete v1.55.4 parity baseline: repeated-world/date-line editing, authoritative history rendering, large-vector performance/focus overlays, WMS/service parity, lossless `.epz` persistence and full mobile/touch GIS access.
- Leaflet implementation code, CSS and transition debt are intentionally retained until v1.55.6; this release changes authority, not dependency removal.

## v1.55.4.18 — Mobile layer-action menu reliability

- Fixes phone/touch layer action controls that could appear unresponsive while the full-width Layers drawer was open.
- Promotes the legacy feature/layer action popover above the mobile drawer stacking surface and presents both standard and GIS layer menus as viewport-safe bottom popovers.
- Gives the layer GIS shortcut and kebab action buttons 44 × 44 CSS-pixel touch targets with explicit pointer/touch ownership.
- Extends the mobile focus boundary to allow portaled layer/GIS menus to receive focus instead of immediately returning focus to the drawer close button.
- Keeps desktop menu placement and interaction unchanged.

## v1.55.4.17 — Mobile GIS parity and touch UI refinement

- Made mobile a first-class application surface rather than a reduced compatibility mode. Advanced GIS is now reachable from a dedicated **GIS** bottom-dock action and from the mobile Project actions sheet, both proxying the same authoritative `gisWorkspaceToggle` used on desktop.
- Removed the phone/tablet “works best on desktop” gate, its dismissal/session-storage logic and the related CSS. Public application metadata/help copy now describes phone, tablet and desktop as supported browser surfaces.
- Completed a phone-width UI audit: Layers and Inspector use full-width drawers on handsets; close buttons, project actions, search/filter controls, bulk actions, menus and major GIS controls use consistent touch targets; dense layer rows reflow instead of squeezing names/actions; Advanced GIS and data-tool controls gain mobile-sized inputs/buttons.
- Added mobile-specific OpenLayers control sizing so zoom/map controls remain comfortably tappable even though the OpenLayers stylesheet loads after the mobile stylesheet.
- Fixed an old mobile resize feedback loop: application-triggered synthetic resize notifications are no longer re-scheduled by the mobile window-resize listener. Real viewport/orientation changes still refresh contextual/layout state.
- Added static mobile-parity regressions plus a headless touch-viewport browser smoke covering GIS access/state, full-width Layers drawer geometry, project-sheet access, touch target sizes, OpenLayers controls and horizontal-overflow safety.

## v1.55.4.16 — Compressed `.epz` project container

- Replaced the development-only plain-JSON `.polygonproject` format with `.epz`, a lossless ZIP/DEFLATE EditPolygon project container. No geometry, coordinate precision, attributes, true-circle metadata, styling, measurements, reference definitions or GIS workspace state are simplified or discarded.
- `.epz` contains `manifest.json`, `project.json` and a reserved `assets/` directory. `project.json` remains the canonical complete project payload; the container is packaging/compression only.
- Added a versioned container manifest plus SHA-256 integrity metadata. Loading validates the ZIP structure, EditPolygon format/version, canonical `project.json` member and SHA-256 integrity record, and reports clear corruption/newer-format errors instead of attempting a partial restore. SHA-256 is verified after the single project decompression so large projects are not decompressed twice merely for CRC checking.
- Save now produces only `editpolygon_project.epz`; Open/drag-drop/converter/validator project ingestion accepts `.epz`. The obsolete `.polygonproject` import/save path and file-picker acceptance were removed rather than carried as compatibility debt during development.
- Removed the historical v1.72 project save/import rebinding: the later UI installer now only rebinds the Save button to the authoritative save function and updates accepted extensions. Project packaging lives in the dedicated `editpolygon-project-format.js` module.
- Added project-format regression coverage for manifest validation, source order, extension policy and absence of the old project extension.

## v1.55.4.15 — WMS project persistence parity

- Fixed manual project save/reload dropping custom GIS workspace definitions such as WMS layers. The saved `.polygonproject` already contained `gisWorkspace`, but the project-import normalisation step discarded that field before `restoreCompleteProjectPayload()` could rebuild runtime services.
- Project-file normalisation now preserves both `gisWorkspace` and `referenceOverlays` across the parsed JSON → normalised payload boundary.
- Restored WMS source definitions retain server URL, advertised layer names/styles, format/version, transparency, discovered bounds/metadata, and the associated layer visibility, opacity, order and lock state.
- Added an end-to-end persistence regression that fails on v1.55.4.14, verifies the save/normalise/restore contract, and exercises GIS-core WMS source/layer round-tripping.

## v1.55.4.14 — Annotation-point conversion parity

- Point-marker annotations converted to editable features now use the same canonical GIS Point symbol as **Draw point**: filled symbol, radius 6 and weight 2, while retaining the chosen annotation colour.
- Measurement-to-feature conversion now applies geometry-family defaults consistently: point, line and polygon conversions no longer all inherit the old polygon-like 18% fill / weight-3 symbol.
- Text annotations still preserve their annotation typography after conversion; point-marker annotations deliberately become normal GIS Point features.
- The Draw point path and annotation/measurement conversion path now share `canonicalEditableFeatureStyle()`, preventing their default point appearance from drifting apart again.
- Added conversion regression coverage for Point, LineString, Polygon and text-annotation conversions.


## v1.55.4.13 — Focused precision overlays for large-layer selection and editing

- Removed the large-layer selection performance cliff. Performance-managed OpenLayers datasets keep their full image-backed background unchanged when a feature is selected; the selected/picked feature(s) are rendered in a small precise vector overlay instead of forcing a rebuild of the complete editable source merely to show highlight styling.
- Removed the large-layer edit-mode renderer promotion. Entering polygon, line, point, circle or whole-feature editing no longer converts every feature in a heavy layer back to a normal `VectorLayer`; only the focused feature(s) use the precise vector path.
- Live geometry updates target the focused precision overlay first. During active precision editing the corresponding feature in the image-backed background is temporarily suppressed so stale pre-edit geometry cannot show through, while the project model remains the authoritative geometry.
- Added structural/background cache identity so geometry changes confined to the actively edited focused feature do not rebuild the heavy background after every pointer release. The background is reconciled once precision editing ends or another authoritative invalidation requires it.
- Base large-layer styles are now selection-independent. Selection changes rebuild only the small focus overlay; the background style/source cache remains stable.
- Removed private geometry revision counters from base renderer identity where actual geometry-content fingerprints already provide authoritative identity. Entering an editor can therefore normalise an unchanged feature without rebuilding a heavy background solely because an internal revision advanced.
- Added adapter capabilities for focused editable overlays and single-feature background suppression without leaking OpenLayers calls into application code.
- Added regressions for focused selection overlays, focused live-edit targets, active-edit background reuse, stale-background suppression and engine-neutral runtime ownership.

## v1.55.4.12 — Persistent large-vector rendering and WMS map-membership parity

- Fixed the remaining OpenLayers WMS blank-layer defect. Remote service instances are created off-map and first displayed through `setDisplayLayerVisible()`; the OpenLayers implementation previously toggled only `visible` and never added a newly created WMS layer to the map. Visibility now owns add/remove map membership on both engines.
- Added an adapter-level persistent editable-source capability. Performance-managed OpenLayers datasets retain one full indexed `VectorSource` so native spatial indexing/wrap can cull features without EditPolygon rebuilding projected geometry whenever an application viewport query crosses a feature boundary. Leaflet keeps the existing viewport-culling path.
- Added adaptive OpenLayers `VectorImageLayer` rendering for heavy inactive editable datasets. This preserves all source geometry and attributes while making pan/zoom interaction image-backed; entering point/circle/polygon/whole-feature editing switches the layer back to the precise normal vector renderer.
- Reduced interaction overhead for selected complex polygons. The floating polygon toolbar now uses cached feature bounds, is hidden while map/zoom interaction is active, and is positioned once after movement settles instead of performing DOM measurement/style writes in the hot pan loop.
- Tightened heavy-layer display costs further: the expanded Layers tree now materialises at most 80 feature rows at once, unlabeled heavy vectors use a 16-pixel render buffer, and the interaction image ratio is 1 so the renderer does not draw a larger-than-viewport image unless required.
- Removed a historical duplicate map-pointer coordinate listener: the enhanced readout now replaces the core listener instead of stacking a second projection/DOM update on every pointer move.
- Added/expanded regressions for WMS map membership, persistent-source policy, adaptive VectorImage rendering, precise-edit fallback, large-layer source stability and selected-toolbar pan suppression.

## v1.55.4.11 — External-source parity and large-vector responsiveness

- Fixed WMS sources being accepted into the project but remaining blank when a provider allows image display without anonymous CORS. Leaflet/OpenLayers WMS creation no longer forces cross-origin mode; `crossOrigin` is opt-in per source.
- Added OpenLayers GeoServer detection at the adapter boundary. GeoServer WMS sources receive `serverType: geoserver` and tiled-request hints without leaking engine-specific code into the application.
- Added best-effort WMS GetCapabilities discovery for advertised geographic bounds. WMS creation remains immediate and non-blocking; when capabilities are browser-readable, the source bounds are persisted and the view fits to the requested layer.
- Reduced large editable-vector rebuild churn by removing raw viewport coordinates from the authoritative cached-render signature. A pan no longer rebuilds a native editable layer when the candidate feature/content set has not changed.
- Large Remote GeoJSON imports now enter a performance-managed mode without simplifying or dropping geometry. Their Layers tree starts collapsed and limits feature-row DOM construction to 200 rows while retaining all features for map rendering, selection, tables and export.
- OpenLayers editable-vector layers now share identical style objects per layer, keep spatial indexing/wrap enabled explicitly, disable update-during-interaction/animation, and enable decluttering only when labels/annotations require it.
- Added WMS/runtime and large-vector performance regressions covering no-forced-CORS construction, GeoServer hints, capabilities extent handling, viewport-independent cache identity, sidebar limits, style sharing and conditional declutter.

## v1.55.4.10 — Hard history/render geometry authority

- Reworked undo/redo rendering after live testing proved that the project model and a live-mutated native editable layer could still disagree until a later selection redraw. History restoration is now a hard model/native boundary rather than a best-effort cache invalidation.
- Added a non-serialised monotonic `HISTORY_RENDER_EPOCH` directly to the authoritative render signature. Historical feature revision counters may move backwards; this epoch never does, so an undo/redo state cannot reuse a native layer from an earlier history generation.
- Added content-derived geometry fingerprints to cached editable signatures. Cache identity therefore depends on the actual geometry as well as private revision counters, closing the revision-collision class of stale-render bugs.
- Editable map-runtime layers now carry an owning layer key and per-feature geometry-content signatures. Before accepting a selected/picked cache hit, the renderer verifies that the native feature still matches the project model.
- Added `clearEditableVectorLayers()` to both map runtimes. History restore and render-cache invalidation can now hard-purge adapter-owned editable layers, including any orphan native layer that escaped application cache bookkeeping.
- Manual geometry commits now retire the transient native live-edit materialisation before the next authoritative paint. Direct native geometry mutation is therefore limited to the active pointer interaction rather than surviving as an implicit post-edit authority.
- Added executable regressions and runtime-audit requirements for history epochs, geometry fingerprints, model/native verification, keyed editable-layer ownership and hard purge. OpenLayers browser smoke coverage now exercises content matching and keyed purge directly.

## v1.55.4.9 — History transaction and edit-lifecycle hardening

- Completed a full undo/redo and edit-lifecycle review after extended live testing still found occasional geometry changes only becoming visible after deselection.
- Removed the stale v1.16 `VStop` compatibility wrapper. It silently discarded the `{render:false}` option added in v1.55.4.8, so the deployed runtime could still paint pre-history geometry even though the authoritative `VStop` implementation supported a no-render shutdown.
- `VStop` is now a single stable runtime function. It cancels pending vertex/edge/centre edit animation frames, pointer listeners, midpoint timers and delayed geometry guards; restores any unfinished live drag to its pointer-down geometry; and cannot be reassigned by later compatibility code.
- Vertex and edge drag history is now created only after the pointer actually crosses the movement threshold. Clicking a red vertex or edge without changing geometry no longer consumes the next Ctrl+Z as a no-op history entry.
- The delayed extra-vertex safety guard is explicitly owned by the vertex editor and cancelled when the editor/history closes, preventing an old timeout from mutating a newly restored historical geometry.
- Point and true-circle drag editors now also avoid pointer-down-only history entries and ignore cancelled DOM-overlay drag-end callbacks, reducing false history states during lifecycle transitions.
- Extended the architecture audit so any future `VStop` reassignment fails CI, and expanded history regressions to cover final source-order authority, no-op drag history, delayed callbacks and cancelled point/circle overlays. The new regression suite fails against v1.55.4.8 at the exact stale-wrapper/no-op sites.

## v1.55.4.8 — Undo/redo render-authority hotfix

- Fixed undo/redo restoring the project model while a selected polygon could continue displaying the pre-history geometry until the next map click or deselection.
- History restoration now closes vertex editing without an intermediate `renderAll()` of the geometry that is about to be replaced; the restored model is installed first and receives the authoritative paint.
- Cached editable rendering now carries a monotonic render generation. Every explicit render-cache invalidation advances that generation, so a restored historical feature cannot accidentally reuse the signature of an OpenLayers feature that was live-mutated during editing even when their private geometry revisions coincide.
- Kept the v1.55.4.7 post-restore spatial/vector invalidation, now as a second guard after model replacement rather than as compensation for a deliberately stale intermediate paint.
- Added a regression that fails on v1.55.4.7 and verifies no pre-history paint, post-replacement invalidation ordering and generation-based cache authority.

## v1.55.4.7 — Point, history-cache and transient-overlay parity hotfix

- Fixed standalone Point/MultiPoint features created or moved in a repeated world copy storing viewport longitudes such as `3114°` in the canonical project geometry. Standalone point longitudes are now canonical CRS84 values, and existing affected point models are healed when loaded through the feature model.
- OpenLayers editable and transient vector geometry is projected from one canonical world branch while preserving short International Date Line continuity for lines and polygons. This restores point visibility in repeated worlds and the dotted true-circle radius guide during circle editing.
- True-circle centres are now canonical project coordinates while display materialisation explicitly chooses the repeated-world copy nearest the current view, keeping circle drawing/editing local across both world wraps and the Date Line.
- Undo/redo now invalidates spatial and vector render caches **after** restored feature/project state is installed, preventing a later map click from revealing stale pre-history geometry.
- Feature zoom is capped at zoom 17, and OSM is configured with native maximum zoom 19 while permitting display overzoom, preventing zero-size Point extents from triggering unsupported z20+ source-tile requests and the resulting 400/CORS console flood.
- Added regressions for repeated-world Point storage, project-model healing, history-cache restoration, transient circle-guide projection, Date Line continuity and native-vs-display tile zoom.

## v1.55.4.6 — Repeated-world editing parity hotfix

- Fixed polygon and LineString vertex dragging after several horizontal world wraps producing world-spanning segments because the moved vertex was committed in the viewport's repeated longitude branch while its neighbours remained in the stored branch.
- Applied the same branch-stability rule to parallel edge dragging and whole-feature centre movement, including geographic-area movement.
- Draggable map-runtime DOM handles now keep pointer coordinates on the pre-drag longitude branch, protecting point/measurement/overlay editing from the same repeated-world offset.
- True-circle centre dragging now keeps the canonical centre on its pre-drag branch while retaining local International Date Line crossings.
- Added dedicated repeated-world edit regressions covering +/-360n offsets and 179/181 degree dateline continuity.

## v1.55.4.5 — Drawing preview startup-order hotfix

- Fixed a temporal-dead-zone startup crash introduced by v1.55.4.4: the live drawing preview layer state is now initialized beside the core drawing state before the application's first `renderAll()` can enter `renderOverlay()`.
- This prevents `ReferenceError: Cannot access 'DRAW_RUNTIME_PREVIEW_LAYER' before initialization`, allows the remainder of `editpolygon-app.js` to finish evaluating, and restores the v1.55.4.4 live polygon/circle preview and dateline fixes in the deployed application.
- Added a source-order regression that requires exactly one preview-layer state binding and proves it is initialized before both `renderOverlay()` and the startup render call.

## v1.55.4.4 — Live drawing preview and circle dateline parity hotfix

- Restored visible in-progress drawing feedback by mirroring the active draw geometry, clicked vertices and live cursor through the engine-neutral transient-vector map runtime; the existing DOM overlay remains as an interaction/handle layer and visual fallback.
- Replaced the legacy mouse-only live draw cursor path with one Pointer Events path for mouse, pen and touch, with a compatibility fallback only where Pointer Events are unavailable.
- Fixed OpenLayers pixel-to-longitude conversion losing the active repeated-world branch because `ol.proj.toLonLat()` canonicalises longitude into ±180°. The adapter now recovers the continuous longitude represented by the EPSG:3857 x coordinate for view centres, extents, map events and screen-to-map conversion.
- Made screen-generated closed rings longitude-continuous around their reference point. True circles, rectangles, regular polygons, rotated rectangles and freehand previews therefore stay local when crossing the International Date Line.
- Geographic-size circle display materialisation is also unwrapped only for map display; canonical geographic export materialisation remains unchanged.
- Added regressions for canonicalising OpenLayers inverse transforms, repeated-world inverse pixel conversion, dateline/repeated-world true circles, live runtime drawing previews and Pointer Events draw tracking.

## v1.55.4.3 — Drawing interaction and dateline parity hotfix

- Fixed polygon/LineString vertices crossing the International Date Line being normalised into opposite longitude branches, which could render a short dateline segment as a line around most of the world.
- Removed the stale v1.16 LineString `constrainedDrawCoord` override so all draw tools use the authoritative continuous-longitude coordinate path.
- Removed the obsolete Shift-pan keyboard behaviour that made the draw overlay click-through even though modern drawing uses Shift for angle/shape constraints.
- Drawing now clears stale zoom/click-through overlay state when it starts and stays pointer-interactive during zoom; CSS provides a second safety guard.
- Added executable regressions for eastward/westward dateline crossing, repeated-world first-click placement, late draw-coordinate overrides and stale overlay interaction state.
- Tightened the historical binding-debt ceiling from 200/374 to 199/373 after removing the obsolete LineString wrapper.

## v1.55.4.2 — Repeated-world rendering parity hotfix

- Fixed editable vectors disappearing after panning horizontally around the repeated world multiple times in OpenLayers.
- Added longitude-periodic spatial-index queries for map viewport culling while preserving continuous-longitude project geometry.
- Map spatial-selection candidate queries use the same repeated-world logic.
- Coordinate-to-pixel conversion now chooses the equivalent longitude nearest the current view, keeping handles and transient overlays aligned with the visible world copy.
- Web Mercator helper projection preserves continuous longitude instead of clamping x to the canonical world.
- Added multi-world regressions covering canonical Australian data, continuous-longitude geometry, latitude filtering and viewport spans wider than one world.

## v1.55.4.1 — True-circle projection parity hotfix

- Fixed true circles changing apparent centre/shape after the radius click in screen/map-shape mode, most visibly at Australian and southern mid-latitudes.
- Separated projection-aware map-display materialisation from geographic export/conversion materialisation.
- Made the committed map circle use the same screen-space ring maths as the live draw preview, eliminating the preview-to-final jump.
- Made geographic-size mode compute its draw radius geodesically and preview the same geographic circle that will be committed.
- Updated circle click hit-testing, spatial selection bounds, map zoom-to-feature/file/all and context-toolbar anchoring to use the exact displayed circle geometry.
- Added southern-hemisphere regression tests that verify the committed circle stays centred, circular and pixel-identical to the preview over Australia.

## v1.55.4 — OpenLayers parity and architecture baseline

- Unified the final cached editable-vector renderer across Leaflet and OpenLayers through `EditPolygonMap.createEditableVectorLayer()`.
- Added equivalent Leaflet rendered-feature hit testing and live cached-geometry updates behind the same map-runtime API used by OpenLayers.
- Made selection-highlight redraws engine-neutral and protected the replacement-before-removal cache swap on both engines.
- Moved normal reference GeoJSON, tiles, GeoTIFF/static-image state and GIS service visibility/opacity/z-order further behind the map adapter; removed the obsolete custom Leaflet GeoTIFF image layer.
- Added a central runtime-transition registry so point/circle editors no longer monkey-patch selection/delete/undo/redo late in source order.
- Removed another obsolete label-era `renderMap` wrapper and established an explicit final runtime-authority boundary.
- Added `audit-bindings.mjs` with no-growth budgets for historical wrapper debt, direct Leaflet calls and app-level engine branching; direct OpenLayers calls in application code are prohibited.
- Expanded both map-adapter test harnesses and added runtime-authority regression tests.
- Restored native OpenLayers `+ / −` zoom and attribution controls explicitly through `ol.control.Zoom` and `ol.control.Attribution`, avoiding the browser-global `ol.control.defaults()` API that caused the original parity startup failure.
- Replaced version-specific root audit/CRS/change-manifest documents with durable `QUALITY_BASELINE.md` and `RELEASE_MANIFEST.md`.
- OpenLayers remains opt-in until the deployed real-browser acceptance matrix passes.


## 1.55.3.1 — Leaflet basemap hotfix

- Fixed the Leaflet map adapter passing `subdomains: undefined` into `L.tileLayer`, which erased Leaflet’s default subdomain set and prevented `{s}` OSM/CARTO basemap URLs from resolving.
- Added regression coverage ensuring optional tile-layer settings are omitted unless explicitly configured.


This file replaces the large collection of one-release and one-hotfix markdown files that previously accumulated at the repository root. Git history remains the source for file-by-file historical detail.

## v1.55.3 — OpenLayers compatibility-map removal and repository audit

- Removed the hidden synchronized Leaflet compatibility map from OpenLayers mode.
- Removed compatibility-map globals, view synchronization and compatibility click forwarding.
- Kept Leaflet as the default transition engine, but confined its renderer/map creation to the Leaflet runtime.
- Routed built-in basemaps and GIS XYZ/TMS/WMS creation through the shared map adapter for both engines.
- Guarded historical Leaflet editable renderers from executing in OpenLayers mode.
- Made the final cached vector renderer authoritative and folded non-spatial table exclusion into it instead of applying another late renderer wrapper.
- Added automated source-order/runtime audits for critical selection and rendering functions.
- Consolidated repository documentation, removed obsolete release-note/change-manifest clutter, and added ignore/orphan-asset checks to discourage new repository junk.
- Updated deployment documentation and static-host CSP for the actual OpenLayers CDN and direct HTTPS GIS services.

## v1.55.2 — Native OpenLayers references

- Moved reference GeoJSON, XYZ/TMS reference tiles and GeoTIFF/static-raster previews onto the map-runtime contract.
- Added native OpenLayers reference vector/tile/image layers with engine-neutral visibility, opacity, z-order, zoom and removal.
- Kept projective trace/image overlays as engine-neutral DOM overlays.

## v1.55.1 — OpenLayers parity series

The v1.55.1.x releases introduced and hardened the opt-in OpenLayers runtime:

- OpenLayers map/view, basemaps, editable vectors and GIS services.
- Native transient overlays, Geometry Health previews, measurements, point editing and true-circle editing.
- Live geometry updates during vertex dragging.
- Dedicated DOM overlay stacking above the OpenLayers viewport.
- Unified map/Layers selection semantics.
- Measurement editing and undo/redo.
- Vector-cache swap ordering to remove pan flicker.
- True-circle click-selection fixes.

The final true-circle blocker was a source-order issue: a historic compatibility assignment later in `editpolygon-app.js` overwrote the modern `featuresAtLatLng()` implementation. v1.55.1.11 removed that stale override and added a regression for the final runtime binding.

## v1.55.0 — Map abstraction

- Introduced `EditPolygonMapAdapter`.
- Routed core viewport, coordinate, fitting and interaction operations through an engine-neutral contract while Leaflet remained the production renderer.

## v1.54 — Geometry Health

- Added guided point/line/polygon/multipart geometry validation.
- Separated safe cleanup from consequential review repairs.
- Added GEOS-WASM validity/MakeValid support, issue location, repair preview, provenance and undoable repaired layers.
- Integrated Geometry Health into the Inspector and refined topology-rule staging and import diagnostics.

## v1.53 — Join and summarize

- Added typed attribute joins, lookup-file support, grouped summaries and spatial joins.
- Added non-spatial project tables that reuse the typed table/filter/calculation/export system.

## v1.52 — Typed attributes, filters and statistics

- Expanded field/schema management, filtering, calculations, table workflows and statistics.
- Integrated history and UI feedback around data changes.

## Earlier releases

Earlier versions established the browser-local editor, multi-format import/export, remote ArcGIS/WMS/tile sources, editing/drawing, styling, labels, selection, performance optimisations, project persistence and mobile support. Use Git history for detailed pre-v1.52 changes.
