# Validation — v0.2

## Automated

`npm test` checks:

- Downhill gravity and stationary flat-ground behavior.
- No pedal brake from pressing edge alone in a straight run.
- Speed reduction from a completed turn / lateral skid.
- Tuck reduces aerodynamic drag without creating forward thrust.
- Mirrored steering, soft-snow drag, bounded finite simulation.
- Kinetic energy does not exceed released gravitational energy on a constant slope.
- Trail projection, DEM integrity and named OSM coordinate placement.
- Render-triangle interpolation used for tracks / foot placement.
- A bounded steering controller reaches all checkpoints on all three imported trail lines within four simulated minutes.

Route traversal verifies the simplified ground controller on the checked-in DEM, not field accuracy, beginner usability, or a full browser-session completion.

`npm run build` compiles the static app. The app bundles Three.js and uses local elevation / trail data. The expected renderer bundle size warning is informational.

## Browser QA

Interactive checks cover loading the snow shader / context terrain, moving on terrain, visible twin ski tracks, steering, tuck input, restarting, pause, overview and keyboard controls. Browser console is checked for shader / runtime errors.

The HUD reports current FPS and averaged per-frame CPU physics cost. This is not a sustained benchmark across named hardware, browsers or mobile devices.

## Remaining fidelity limits

- No measured snow friction / edge calibration or flight / landing physics.
- OSM lines may not coincide precisely with winter snow and grooming.
- Snow tracks are lit surface ribbons with rim shading, not actual displaced snow volume.
- Procedural trees still need accurate forest boundaries and more detailed assets.
- The surrounding 120 m DEM reproduces large mountain form, not detailed glaciers or cliffs.
