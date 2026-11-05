# Development scope

## v0.1 — first playable prototype

- [x] Real Crystal-area elevation grid and reproducible import
- [x] Ground-constrained skiing with slope-based acceleration
- [x] Steering, braking, side slip, and alternate snow parameters
- [x] Three authored reference lines, sequential checkpoints, reset and finish
- [x] Follow / overview camera, mini-map, HUD, session trail
- [x] Basic trees, obstacles, skier model, optional wind audio
- [x] Pause and keyboard / basic touch controls
- [x] Physics and elevation-data regression tests

## v0.2 — validate the mountain and improve feel

- Georeference actual trail layout; record accuracy and source provenance.
- Check DEM source resolution and higher-resolution local coverage.
- Validate all route segments for terrain gradient, traverses, and connectivity.
- Test beginner controllability and turn timing with real skiers.
- Tune edge engagement, camera pitch, collision recovery, and snow feedback.
- Add a route-completion browser regression and performance measurements on agreed hardware.
- Verify production hosting and deployment before calling the build publicly playable.

## Later

More mountain coverage, terrain LOD, accurate vegetation boundaries, richer audio / tracks, gamepad support, replay, and lift transport.

## Out of scope for MVP

Multiplayer, VR, complete resort recreation, snowboarding, aerial tricks, dynamic snow deformation, avalanche simulation, live snow / weather, and physically articulated legs / skis.

## Known limitations

- Skier is constrained to ground height: no jumping, flight, or ragdoll.
- Terrain is a resampled bare-earth model, not a surveyed winter ski surface.
- Reference lines have not been validated as official or continuously groomed trails.
- Vegetation is generated and excluded around prototype routes; collision is approximate.
- Live slope is the DEM's local gradient, not a trail's official difficulty rating.
- HUD speed includes the inferred vertical component; max horizontal speed is capped for prototype stability.
- No persistent accounts, scores, backend, or analytics.
- Target 60 FPS has not yet been established on named target hardware.
