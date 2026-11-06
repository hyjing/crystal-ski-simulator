# Development scope

## v0.3 — feedback iteration

- [x] Real local + surrounding USGS elevation grids
- [x] Green Valley, Lucky Shot section and Tinkerbell from OSM coordinates
- [x] PBR snow relief / roughness, stronger side lighting and dynamic local shadows
- [x] Near-field powder displacement, compressed grooves / raised rims, bounded world field and snow spray
- [x] NAIP aerial minimap, vegetation likelihood and generated snow-covered fir assets
- [x] OSM-positioned lift / building proxies and optional peripheral speed blur
- [x] Turn / edge speed control; remove pedal braking
- [x] SI-unit mass / friction / air-drag parameters and tuck posture
- [x] Realistic skier scale, closer camera and speed-dependent field of view
- [x] Always-visible restart option, N shortcut, stance and performance feedback
- [x] Physics, elevation, trail and traversal regression tests

## Next — fidelity validation

- Survey / georeference winter trail boundaries and vegetation.
- Validate the source DEM resolution and obtain higher-resolution local coverage where possible.
- Calibrate speed, edge grip and drag with real ski footage / reference measurements.
- Improve character animation, ski contact and snow displacement.
- Benchmark on named target hardware; add quality presets and terrain LOD if needed.
- Evaluate a Unity client if the target becomes a desktop game with richer animation, flight / landing, full rigid-body collision or VR. Reuse georeferenced datasets and physics test cases.

## Outside this prototype

Complete resort recreation, multiplayer, live weather / snow conditions, avalanche simulation, articulated leg biomechanics, granular volumetric snow, VR and snowboarding.


## Gameplay first pass

- [x] Queens Run, the eleventh selectable lift itinerary.
- [x] Four lightweight non-colliding NPC skiers; local visibility toggle.
- [x] Oversized freeride silhouette, palette presets, individual colors and three ski profiles, saved locally.
- [x] Faster progressive bank response and park / powder sidecut differences.
- [x] Mouse-look recovery after release, with stable forward travel view during air spins.
- [x] Convex-crest contact loss, ballistic flight, manual hop, air yaw / grab pose, clean / switch landing scores and simple fall recovery.

Next: marked slalom / time challenges, persistent local records, linked trick combos, better grab hand-to-ski contact, terrain park features, and NPC yielding / collision. Flips and rails need additional body orientation / contact states and are not in the first pass. The full humanoid ragdoll, measured ski flex and granular snow solver remain outside this build.
