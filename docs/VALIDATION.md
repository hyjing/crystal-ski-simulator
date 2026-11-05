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
- Forest placement follows an aerial-derived heuristic; individual tree positions / heights are not surveyed. Nearby procedural meshes and far crossed fir cards remain visual approximations.
- OSM infrastructure positions use approximate authored appearance and support heights.
- The surrounding 120 m DEM reproduces large mountain form, not detailed glaciers or cliffs.

## Distant scenery update — November 4, 2026

- 26 automated tests pass, including summit registration against Rainier's geographic position, aerial/DEM bounds alignment, and a far-terrain triangle budget below the previous mesh.
- Browser checks: the new winter shader compiles without console warnings/errors; scenic view works at narrow and 1280 × 720 desktop layouts; returning restores the active run rather than resetting its position/time.
- New real-frame screenshot: `docs/media/crystal-rainier.png`. The existing README video predates this scenery update.
- Texture registration and the DEM are real; winter cover, local viewing height and the snow shader remain authored approximations. No new instrumented GPU benchmark was performed.

## Expanded trail catalog

- 29 tests pass. All 81 imported centerlines are accounted for exactly once across 78 route entries; IDs are unique and all points lie within the original DEM.
- Route search, apostrophe normalization, grade filters, connected-fragment assembly, and disconnected-line handling have regression coverage.
- The former three-route completion check is now an explicitly named representative downhill check: the original three plus seven new blue/black runs, in both snow modes. It does not assert that all imported road/traverse geometry can be completed. A separate simple soft-snow audit completed 62 of 78 entries; limitations are recorded in [TRAILS.md](TRAILS.md).
- Short sections have a smaller finish radius so a 63 m section does not complete immediately on spawn. Route signs are capped at 21 locations; forest clearance uses a spatial index to avoid multiplying tree-placement work by the full catalog.
- Browser: original Green Valley and new Sunnyside start correctly after selection; difficulty/search selection uses a bounded list so the start button is not pushed below a 78-row list.

## Lift runs, fine ground and canopy update

- 34 tests pass: selected itineraries meet the 400 m cutoff; S/F coordinates match the assigned lift terminals; all 10 runs have a clear snow exit near the upper terminal; fine / coarse terrain footprints agree; canopy positions retain image registration; pole input works only at low speeds.
- The 78-entry source inventory tests remain data-integrity checks, not a statement that 78 runs remain selectable.
- A simple controller audit on full itineraries, with detailed ground and pole input, completed 5/10 before the station-exit refinement. This audit is not a manual-playability certification; it does not justify claiming all station-to-station traverses are validated.
- Browser checks verify the Lucky Shot spawn near the Rainier Express upper terminal and outside building proxies, terrain shader compilation, the bounded run selector and the more detailed forest layout.
- Additional geometry / texture memory comes from static terrain LOD meshes and the finer DEM texture. No frame-time equality with the previous build is claimed.


## Station, snow edges and skier update — November 5, 2026

- **37 automated tests pass**, plus the static production build. The earlier counts above are historical snapshots.
- All ten station spawns have a physical surface pitch below 3°. Pole work is checked at low speed and at 12 m/s; trunk collision uses a swept test that excludes canopy-only proximity.
- A regression starts at 12 m/s on constant 10°, 20° and 30° pitches, turns the skis across the slope with high edge input, then releases steering while retaining edge. Each case stops and remains stationary for a further two seconds. This validates controller behavior, not measured real ski friction.
- All terrain LODs share identical perimeter coordinates, heights and normals in a synthetic tile fixture, preventing the former dark grid / skirt seams.
- Representative source-section completion tests remain successful in both snow modes. Their controller uses light edge input (0.18), reserving strong edge for a deliberate stop, and uses poles at low speed. These checks do not establish completion of all ten full lift itineraries on the new authored terrain.
- Browser checks: Lucky Shot starts at 0 km/h on a 2° exit; Shift moves the skier from rest; station overview shows terminal models and Summit House; drag-to-look shows the photographed cloud sky. No runtime or shader errors were observed. A development hot-reload session reported a duplicate Three.js import warning; the production build succeeds.
- Arrival / return was exercised with the development fixture: enter the lower ring from 23 m away under normal physics, show the finish panel, then return to a stationary gentle upper exit. This is an interaction test, not a manual full-run playthrough. Return is instantaneous, without a lift-ride animation.
- The new station / sky screenshot is `docs/media/crystal-stations.png`. The README video still predates this update. No new sustained GPU / frame-time benchmark was performed.


## Unified weather, forest and skier — November 5, 2026

- **45 tests pass**, plus `npm run build`. New checks cover shared sun-disk / light direction, lower-angle sunset light, jointly changing snow / fog / direct light, finite bounded flake positions, interrupted transitions without light / fog jumps, turn-end pole contact / recovery, gesture-side stability on reversal, explicit double-pole override, and contact with the supplied snow surface. Existing physics / powder / ground / route regressions remain green.
- Browser inspection positions exercise clear, overcast, snow and sunset, plus the actual production build. Captured images in `docs/media/environment-*.png` are staged inspection views of actual rendering, not a manual full-run recording. The older README video is not the current scene.
- A short static forest inspection at 1280 × 720, after adaptive raster scaling to 0.85, reported 17.6 ms P95 / 17.7 ms maximum and no >25 ms intervals in that 180-frame sample. During compilation / loading or transitions, observed FPS was lower. This is not a sustained performance guarantee or an input-latency measurement.
- Snowfall shader compilation was explicitly exercised and prewarmed during loading. Browser checks also cover pole-powered starts and the weather selector. All ten full itineraries have not been manually revalidated after this scene update.
- The skier is still an authored procedural character with kinematic poses and gesture timing. Weather is an artistic preset system with static weak IBL; snow is a heightfield with sprites, not volumetric conserved snow. Rock dressing and piste widths remain authored approximations. These changes improve presentation without establishing photogrammetric or measured physical accuracy.
