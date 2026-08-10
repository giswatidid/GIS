# Current release manifest — v1.55.4.14

v1.55.4.14 is a creation-path consistency correction on top of v1.55.4.13. Live testing found that an **Annotate → Point marker → Convert to feature** result looked different from a Point created with **Draw point**. The review found that `featureFromMeasure()` applied the same polygon-like style (`weight: 3`, `fillOpacity: .18`, no point radius) to every converted geometry type, while Draw point used a filled radius-6 point symbol.

## Upgrade basis

Upgrade from **v1.55.4.13**.

## Behavioural changes

- Converted point-marker annotations use the same canonical GIS Point defaults as Draw point.
- The chosen annotation colour is retained when the marker becomes a GIS feature.
- Converted distance measurements use line defaults; converted area measurements use polygon defaults.
- Text annotations still retain their text/typography metadata after conversion.
- Direct Point drawing and annotation/measurement conversion share `canonicalEditableFeatureStyle()` so the two creation paths cannot silently drift apart again.

## Files to update

See `V1.55.4.14_CHANGED_FILES.md` in the release artifacts for the exact generated diff.

## Files to add

- `tests/annotation-feature-conversion.test.mjs`

## Files to delete

None.

## Deployment

1. Replace every file listed in the generated changed-files manifest.
2. Add the new regression test file.
3. Wait for GitHub Pages to finish deploying.
4. Hard-refresh `?mapEngine=openlayers`.
5. Create an Annotate → Point marker, convert it to a feature, and compare it with a directly drawn Point. They should use the same normal GIS Point symbol (subject to the same selection highlight state).
6. Optionally convert a distance, area and text annotation to confirm their geometry-family styling remains appropriate.

The complete v1.55.4.14 repository ZIP can instead be used as the authoritative clean tree.
