# Technical notes — Crystal / Terrain Sessions

A browser-based 3D skiing prototype on **USGS elevation data and georeferenced OpenStreetMap trails at Crystal Mountain, Washington**. Three.js renders the scene; a custom fixed-step, ground-constrained controller models skiing. It does not use Unity, PhysX, or a full articulated ski solver.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open Vite's printed URL, normally http://127.0.0.1:5173.

```sh
npm test
npm run build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Hold to complete a turn and control speed |
| Space or Down | With A/D, turn skis across travel for a skid; hold to stop across the slope |
| Shift | Rhythmic double-pole propulsion, no speed cutoff |
| W or Up | Tuck: lower posture and aerodynamic drag |
| N / visible Restart button | Restart the entire run, clearing time, distance and tracks |
| R | Return to the latest checkpoint; preserve session stats |
| O | Follow / overview camera; near terminals, frame the station |
| Drag / C | Orbit the follow view / reset look direction |
| Esc / P | Pause / resume |
| H | Help |

Space engages an edge, and A / D select the turn direction. Once turned across the slope, releasing A / D while holding Space retains the skid / static hold rather than automatically continuing an arc. Skiing across the slope reduces downhill acceleration; turning and lateral skid dissipate energy. Tucking reduces drag and cannot accelerate a stationary skier on flat ground.

## v0.3.1 — responsiveness and frame pacing

Steering / reversal and camera response are faster, and releasing input stops idle pivoting. Powder terrain / normals now update in the GPU shader with static vertex buffers and rolling texture updates. Default rendering caps raster scale at 1.25, adapts down under sustained slow frames, and bypasses post-processing when blur is off. Blur is now off by default and remains optional.

See [measurements and reproduction](PERFORMANCE.md). `npm run bench:powder` measures CPU powder updates; hover the FPS HUD for frame-interval P95 / maximum and hitch count.

## v0.3 changes (historical; current braking behavior above supersedes the original Space arc)

- **Powder is the default.** The near-field tessellated snow layer compresses under the skis and forms displaced rims, with world-coordinate imprints retained in a bounded field. Loose snow spray accompanies sliding / edge engagement. Hard snow remains selectable.
- Snow grain uses irregular multiscale noise, replacing the repeating ribbed appearance.
- Space now rolls the skis into an arc on the last selected side; A / D choose left / right. A 19 m nominal sidecut and lean-dependent turning limit make high edge angles produce a materially tighter turn. Ski roll, body lean and a degree readout expose the result.
- More speed-dependent field of view and optional peripheral blur. Tuck CdA is 0.25; the horizontal safety cap is 55 m/s. Gravity and drag continue to determine actual speed; no artificial engine thrust is added.
- A georeferenced public-domain NAIP aerial image is available in the minimap. An aerial-derived RGB vegetation likelihood replaces invented forest-density waves.
- Generated snow-covered fir alpha cards replace cone trees. Instanced chairs / pylons and lodge proxies follow OSM lift lines / building footprints.
- Resort-sized named trail signs replace oversized game flags and the floating guide ribbon.

See [assets and generation prompt](ASSETS.md) for provenance, limitations and import commands.

## Data, attribution and accuracy

### Elevation

Derived from the [USGS National Map 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), retrieved November 4, 2026 (Pacific time).

| Grid | Requested geographic bounds | Export size | Pixel spacing |
| --- | --- | --- | --- |
| Ski area, fine runtime source | -121.51, 46.91, -121.445, 46.965 | 1025 × 1281 | ~4.928 m |
| Ski area, backup | same footprint | 257 × 321 | ~19.712 m |
| Surrounding mountains | -121.9, 46.75, -121.3, 47.08 | 385 × 321 | ~120.366 m |

Both exports are Float32 GeoTIFF in EPSG:32610, resampled bilinearly. Pixel-center origins and square-pixel spacing come from the actual GeoTIFF tags. All distances / heights are meters, without vertical exaggeration. Rendering subtracts a 1,200 m local altitude origin.

**Export spacing does not establish source survey resolution or accuracy.** This is a ground elevation model, not today's winter snow surface. USGS makes 3DEP products available [without use restrictions](https://www.usgs.gov/3d-elevation-program).

### Trails

`public/data/crystal-trails.json` retains 81 OSM centerline ways grouped into 78 raw named entries. The menu uses ten full lift itineraries from `crystal-lift-runs.json`, assembled using 93 ways in `crystal-trail-network.json`. © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [source inventory, lift assignments and connection limits](TRAILS.md).

Coordinates are converted from WGS84 to UTM 10N and placed on the USGS footprint. Names were cross-checked against the [official resort trail map](https://www.crystalmountainresort.com/the-mountain/trail-maps). Geometry is community mapping, not verified resort survey data. Authored piste benches, edge banks and station aprons modify a runtime copy of the ground, with the same modified surface used by physics and rendering. Source elevation arrays remain unchanged on disk.

Snow and the skier use authored procedural models; the fir texture is generated and vegetation placement is constrained by aerial imagery. A [Crystal Mountain skier's photo](https://www.ingridbackstrom.com/thoughts-from-a-skier-mom-blog/2019/1/6/the-great-family-ski-road-trip-part-2-crystal-mountain) informed the cold-shadow / warm-sun contrast and snow-laden conifer direction; its photography is not bundled or redistributed. Tree positions are not surveyed vegetation boundaries. No official logos, photographs, or map artwork are redistributed.

This independent prototype is not affiliated with Crystal Mountain Resort and is not an on-mountain navigation tool.

## Physics and performance

`src/physics.js` uses SI units and a fixed 1/120 s step:

- Gravity is projected onto the local terrain plane.
- Coulomb-style base snow resistance depends on the surface normal and the selected friction parameter.
- Aerodynamic deceleration is `0.5 × airDensity × CdA × surfaceSpeed² / mass`.
- Tuck lowers CdA instead of adding thrust.
- Ski heading differs from velocity; lateral grip and skidding dissipate energy during turns.

Parameters are explicit prototype assumptions: 85 kg combined mass, 1.0 kg/m³ air density, CdA 0.65 upright / 0.25 tucked, friction 0.025 packed / 0.06 soft. They are **not measured or field-calibrated**. A 55 m/s horizontal safety cap remains. No airborne motion, ragdoll, ski flex, independent leg forces or measured edge-contact model is simulated.

The FPS readout is an observation of the current browser, not a hardware performance guarantee. Snow and trees use bounded geometry / instancing; physics is one constrained skier, not a forest of dynamic rigid bodies.

## Reproduce data imports

```sh
# Python 3 + Pillow needed for DEMs
python3 scripts/fetch-dem.py
python3 scripts/fetch-dem.py --context
# Standard library only for trails
python3 scripts/fetch-trails.py
python3 scripts/fetch-trails.py --infrastructure
python3 scripts/fetch-aerial.py
```

The app uses checked-in JSON at runtime; terrain and trails do not require live external APIs. Google Fonts is optional with system font fallbacks.

See `docs/SCOPE.md` and `docs/VALIDATION.md` for remaining work and verification limits.

## Distant scenery update

Mount Rainier now has a separate georeferenced 36.18 m DEM export and NAIP texture. The surrounding grid also uses NAIP imagery with an elevation/slope-based winter treatment. `src/scenery.js` renders decimated static meshes with a shared winter shader; the combined far terrain stays below the original context mesh triangle count. `V` switches to a summit-ridge scenic view and suspends physics until returning. See [asset provenance](ASSETS.md#mount-rainier-and-surrounding-mountain-textures) for export bounds and limitations.

## Lift-run / local ground update

`getRoutes` retains the raw OSM inventory for data checks and tree clearance. The menu uses `getLiftRuns`, built from `crystal-lift-runs.json`, with actual lift coordinates and explicit authored station / junction links. Short source sections are no longer menu entries. `liftExitSpawn` chooses an unobstructed snow exit near the station and includes space for the trailing camera. Shift provides rhythmic pole work at any speed, bounded by an authored 420 N force / 1800 W peak-power model. These sprint-like gameplay settings are not measured athlete performance.

The fine DEM uses a binary height array on the original footprint. `src/ground.js` prebuilds terrain LOD tiles; geometry is not rebuilt while skiing. Vegetation comes from georeferenced aerial canopy peaks and distant canopy cover. Fine export spacing is not native survey accuracy. See [TRAILS.md](TRAILS.md) and [ASSETS.md](ASSETS.md) for limitations and reproduction.


## Station scene and braking update — November 5, 2026

The init pipeline builds piste corridors, then station aprons, before creating render / snow / physics terrain. All ten spawns start at zero velocity on gentle ground. Terminal and lodge details are merged by material into static geometry. The lower terminal has an 18 m arrival ring and a return-to-start action. An explicit development-only `?station-qa` fixture places the player just outside this ring to exercise arrival and return; it is excluded from production.

Lateral snow shear is force-limited, with slip / edge-dependent drag and a static-friction hold. A latched high-edge cross-slope skid disables automatic arc steering until edge input is released. This is still a ground-constrained approximation, not independent ski contact / flex simulation. The pole cycle also drives arm, torso and basket animation. Sky uses a local CC0 HDR photograph and a prefiltered environment map; see [assets](ASSETS.md).


## Unified environment and scene refinement

`MountainWeather` owns the dynamic sky, weather transition, light direction / colors, fog, exposure and snowfall. `snowLighting` shares cloud cover with snow materials. User selection comes from the accessible `#weather` select. A five-second smoothstep transition restarts from the current state when interrupted. Weather continues while a run is paused; skier physics / spray retain their existing pause behavior.

The distant winter material has reduced baked-darkness contrast so it integrates with the new haze. Near / mid trees use shared bent branch / needle geometry and snow caps, with spatially batched far cards. Corridor clearance uses authored piste widths; local rock dressing is cosmetic and excluded from mapped route vicinity.

The follow camera blends ski and travel direction, with slower heading response than the skier and bounded speed-dependent distance / FOV. This gives turn continuity without artificial camera shake. The articulated pose shifts the hips, flexes the inside leg and counter-rotates the torso while keeping ankles anchored to the ski rig approximation. Snow spray follows slip direction and uses frame-rate-independent accumulated emission.

Development-only `?visual-qa` offers fixed slope / forest inspection positions and an explicit start-from-here action. It is excluded from production. Inspection captures are real renders at staged positions, not full-run playthrough evidence.


Turn-end pole timing lives in `src/skier-animation.js`: release / reversal or an accumulated turn arc arms a single 0.8 s gesture with a short contact window. Gesture-side state is retained through a steering reversal. The plant point is world anchored against the supplied snow surface, and the hand follows the fixed-length pole during contact. It generates contact spray but does not modify ski velocity; Shift remains the explicit propulsion input. Head / torso proportions, continuous sleeve and trouser sections, and independent ski pivots replace the earlier primitive-only silhouette. This is not motion capture or a physically articulated body solver.


## Supported turning and linked pole transitions — November 5, 2026

This supersedes earlier descriptions of heading-first turns, Space auto-arcs and pole gestures triggered by release / accumulated angle.

Normal A/D turns build lateral world velocity using a bounded snow reaction. The controller rotates velocity in the actual slope tangent plane (Rodrigues rotation), with rate limited by bank angle, nominal sidecut and grip; it does not discard lateral world momentum to point the skier in the requested direction. Ski heading follows the same curvature. Remaining grip handles ski-relative slip. Signed edge roll passes continuously through flat skis on a reversal, and visual hip / ski roll follows that signed value.

Space + A/D is the deliberate ski-attack / skid control; Space alone no longer invents a turn. Existing cross-slope static-hold behavior remains. These are prototype controls, with no independent ski flex or measured contact solver. The distinction between turning snow reaction and skidding follows the conceptual discussion in [Jentschura & Fahrbach, Physics of Skiing](https://arxiv.org/abs/physics/0310086); the implementation is an authored approximation rather than a reproduction / validation of that model.

A pole gesture requires a meaningful previous turn (at least 0.20 s steering and 0.045 rad heading change), followed by input to the opposite side. A short neutral release may link turns; a straight gap over 0.75 s clears the previous leg. Touch occurs after at least 55 ms of continued incoming input, near signed-edge flattening / crossover, with a 75 ms contact window and 0.5 s total gesture. The new inside hand plants once; release, continuing the same arc, and short alternating taps do not trigger it. Shift overrides the timing gesture. Pose timing pauses with simulation.
