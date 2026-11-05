# Validation — v0.3.1

## Automated

`npm test` checks:

- Downhill gravity and stationary flat-ground behavior.
- Space enters an arc on the last selected side, with no flat-ground thrust.
- High edge engagement gives a materially tighter turn than flat-ski steering.
- Speed reduction from a completed turn / lateral skid.
- Tuck reduces aerodynamic drag without creating forward thrust.
- Mirrored steering, fast engagement / reversal, and stopping idle pivot after release.
- Static powder vertex buffers across rebases, with persistent imprints across rolling texture windows.
- Soft-snow drag and bounded finite simulation.
- Kinetic energy does not exceed released gravitational energy on a constant slope.
- Trail projection, DEM integrity and named OSM coordinate placement.
- Render-triangle interpolation used for tracks / foot placement.
- Powder compression, raised rims, persistent world coordinates and bounded storage.
- Alignment of the aerial-derived mask with the DEM.
- A bounded steering controller reaches all checkpoints on all three imported trail lines within four simulated minutes, in both packed and powder snow.

Route traversal verifies the simplified ground controller on the checked-in DEM, not field accuracy, beginner usability, or a full browser-session completion.

`npm run build` compiles the static app. The app bundles Three.js and uses local elevation / trail data. The expected renderer bundle size warning is informational.

## Browser QA

Interactive checks cover loading the snow shader / context terrain, powder deformation, moving on terrain, twin ski tracks, edge-angle feedback, tuck input, restarting, pause, overview, aerial-map toggle and speed-blur toggle. Browser console is checked for shader / runtime errors.

The HUD reports FPS, raw frame interval P95 / maximum, hitch count, raster scale, and CPU powder / physics cost. See `PERFORMANCE.md` for the focused measurements. This is not a sustained benchmark across named hardware, browsers or mobile devices.

## Remaining fidelity limits

- No measured snow friction / edge calibration or flight / landing physics.
- OSM lines may not coincide precisely with winter snow and grooming.
- Near powder displaces a heightfield, not a physically conserved volume of snow; far trails remain lightweight ribbons.
- Forest placement follows an aerial-derived heuristic; individual tree positions / heights are not surveyed. Crossed fir alpha cards are a visual approximation.
- OSM infrastructure positions use approximate authored appearance and support heights.
- The surrounding 120 m DEM reproduces large mountain form, not detailed glaciers or cliffs.
