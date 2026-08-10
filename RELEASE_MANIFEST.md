# EditPolygon v1.55.4.18 release manifest

v1.55.4.18 is the mobile layer-action reliability follow-up before the OpenLayers default switch. It keeps the v1.55.4.17 full mobile GIS surface, while making portaled layer/feature/GIS menus authoritative above the full-width Layers drawer and inside the handset viewport.

## Mobile capability parity

- A dedicated **GIS** bottom-dock button opens/closes the existing Advanced GIS workspace on mobile.
- Project actions also expose **Open Advanced GIS / Return to simple editor**, using the same authoritative `gisWorkspaceToggle`.
- Layers, Inspector, project save/export, conversion/validation, drawing/editing and contextual actions continue to use the shared application controls and models.
- The previous “EditPolygon works best on desktop” dialog and dismissal storage path are removed.

## Phone UI refinement

- Layers and Inspector occupy the full handset width at <=600 CSS px; tablets retain a capped drawer width.
- Drawer/sheet close actions and primary project/GIS controls use consistent touch targets.
- Layer search/filter/bulk actions, feature/layer icon controls and viewport menus are reflowed/sized for touch without hiding the underlying layer-management capability.
- Advanced GIS forms, tabs, layer controls, remote-source chooser, data tools and table/join controls receive phone-appropriate sizing and scrolling.
- OpenLayers native controls receive explicit mobile sizing even though the engine stylesheet loads after mobile CSS.
- The old mobile resize feedback loop is removed: synthetic application resize notifications are not fed back into `scheduleLayoutRefresh()`.

## Desktop isolation

All new layout rules are scoped under `body.v151-mobile-layout`, and the mobile controller only activates for the existing narrow/coarse-pointer media query. Desktop application geometry and workflows remain unchanged. The mobile GIS buttons proxy existing controls rather than creating new GIS state.

## Validation checklist

1. Open `?mapEngine=openlayers` on a phone and confirm no desktop-preference dialog appears.
2. Confirm **GIS** is visible in the bottom dock; open it and verify Advanced GIS Layers/Add data/Basemaps/Project are reachable and scrollable.
3. Open **More → Tools** and verify Advanced GIS can also be toggled there.
4. Open Layers and Inspector: on a phone they should use the full available width, with aligned/tappable search, filters, layer actions and close controls.
5. Pan/pinch-zoom, select, draw a point/polygon and edit one feature; opening/closing drawers or GIS must not leave a stuck interaction state.
6. Check portrait and landscape once; the map and bottom dock should resize without page-level horizontal overflow.
7. In the Layers drawer, tap the layer-level **GIS** button and a feature-level **⋮** button; both action menus must open above the drawer and remain fully tappable.
8. Save/open an `.epz` project to ensure the mobile presentation changes do not affect project persistence.

## Automated gate

The release must pass repository integration checks, runtime/binding audits, the complete Node test suite and **nine** browser smoke suites. The mobile parity smoke uses a touch-enabled phone viewport to check Advanced GIS state, full-width handset drawers, Project-sheet GIS access, touch target sizes, OpenLayers control sizing and horizontal-overflow safety. A dedicated layer-action smoke additionally verifies that the layer-level GIS and feature action popovers sit above the drawer, retain focus and expose 44×44 px trigger targets.
