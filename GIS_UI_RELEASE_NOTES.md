# EditPolygon Browser GIS v1.53.3

## Layer menu usability and accessibility

- Layer **More** and **GIS** menus are measured after their complete contents are rendered.
- Desktop menus prefer opening beside and below their trigger, flip when required, and remain within an eight-pixel viewport margin.
- Menus use bounded internal scrolling on short screens so every action remains reachable.
- Escape closes an open menu and restores focus to the originating button.
- The GIS menu now exposes all workspace tabs, including **Join & summarize**, with grouped Data, Query & analysis, Presentation, Coordinate system and Settings sections.
- The layer More menu now separates View, Layer, Layer order, Features or Records, Appearance and Remove actions.
- Point, line, polygon, mixed-geometry and table layers receive appropriate sorting choices and terminology.
- The previous duplicated embedded style editor and polygon-group creation action were removed from the layer menu.
- Join completion messages now distinguish output records from matched and unmatched targets.

Mobile menus continue to use the existing bounded bottom-sheet presentation.

---

# EditPolygon Browser GIS v1.42.0

## Interface consolidation

- Existing Layers panel is the single authoritative editable-layer list.
- Compact GIS layer menu opens Attributes, Filter, Style & labels, CRS and Processing.
- Large imported datasets collapse individual feature children by default; the active feature remains visible.
- Selected-feature attributes appear in the Inspector with summary/all modes and explicit edit/save/cancel.
- Map selection, Inspector and attribute table use the same feature identifiers.
- Display fields are detected from common GIS attribute names and configurable per layer.
- Advanced GIS no longer duplicates editable layer cards.

All feature data remains in the browser.
