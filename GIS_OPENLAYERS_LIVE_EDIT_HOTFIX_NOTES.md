# EditPolygon v1.55.1.2 — live vertex geometry

This hotfix improves vertex editing during the OpenLayers parity phase.

## Changes

- The actual rendered geometry now follows a dragged vertex continuously instead of waiting for pointer-up.
- Cached vector layers update only the affected feature geometry on animation frames, avoiding a full visible-layer rebuild for ordinary edits.
- The same live-update bridge is available to both the OpenLayers and Leaflet renderers.
- Topology-linked vertices are live-updated together.
- Cancelling a topology-linked drag restores every linked feature to its pointer-down geometry.
- Project history remains a single commit for the completed drag; pointer-move frames do not create undo entries.
- Extremely dense edited features retain a conservative handle-only fallback above 12,000 vertices to protect responsiveness.

This is still part of the v1.55.1 OpenLayers parity stage; Leaflet remains the default renderer unless `?mapEngine=openlayers` is requested.
