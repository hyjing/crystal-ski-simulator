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


## Progressive edge, humanoid IK and scene stability

Normal steering now accumulates same-side hold duration. Over approximately 1.25 s the target bank grows from about 18° to 57°, with a continuous signed-edge response and a larger available lateral grip budget. Reversing resets engagement and crosses through flat skis; the tangent-plane velocity / energy model remains. Strong-edge skid braking retains its separate control path. These coefficients are gameplay assumptions, not fitted snow-contact data.

`src/humanoid.js` loads a bundled CC0 skinned human and adapts it to the existing ski / pole rig. Two-bone IK uses source bone lengths; pelvis, spine, neck and head have distinct orientations. A bounded, smoothed heading difference to the local fall line distributes counter-rotation, with hips following skis more than chest / shoulders. A smooth actual-velocity / fall-line alignment gate removes counter-rotation for traversing or uphill travel, and a speed gate removes it at rest. Loose jacket and trouser meshes share the source skeleton with wider garment envelopes rather than following muscle contours. Equipment is bone-attached. The old procedural body remains only as the pose target / test fallback and is hidden in normal runtime. The main camera supports bounded wheel zoom and C reset.

Forest rendering is now static: fixed crown / trunk meshes in spatial batches and a static collision index. The former `updateLOD` replacement loop is removed. Independent low-poly tree shadow instances use zero instances in the color pass and their fixed count in the shadow pass, through renderer hooks. `stableShadowTarget` snaps light-space focus coordinates to a texel lattice. Directional shadows fade at 170–210 m, inside the 480 m coverage; shadow map size is 3072². These choices prevent near-tree replacement and shadow-grid crawling without asserting photoreal shadow geometry.

`prepareAtmosphere` composes with existing material hooks, adding world-space, height-weighted snowstorm haze and shadow-distance fading. It preserves snow's displacement shader and native skinned / instanced vertex transforms. Materials loaded progressively are registered before use. Static station geometry uses a merge helper that normalizes mixed indexed / non-indexed primitives, preserving merged geometry when rounded shells and box details share materials.


## Baked continuous outfit and detailed distant terrain

`node scripts/build-skier.mjs` produces the runtime complete GLB. A welded implicit surface joins jacket, sleeves and trousers before skeletal binding, so no runtime envelope projection or body-triangle garment slicing remains. Closed connectivity and normalized weights are tested. Anatomy and skeleton remain from the documented CC0 base; equipment is authored into the same asset. Runtime only loads materials and poses its native bones. Previous counter-rotation / velocity gates remain unchanged.

Distant terrain uses static local refinement around Rainier's summit and the intervening main valley, with every fine boundary vertex shared by its neighboring coarse fan. This prevents T-junction cracks without camera-dependent geometry swaps. Rainier currently uses 158,658 triangles and context 88,599 (247,257 combined). All vertices use real DEM samples. Textures share projected UTM pixel-edge bounds, preserving glacier / channel locations. NAIP RGB detail survives winter shading; authored snow cover uses elevation, slope, photographic brightness and vegetation tint. It does not create a hydraulic river model.


## Contoured character and close inspection camera

The garment builder uses smooth section profiles and localized compression folds instead of a constant elliptical torso. An explicit shoulder slope, hood opening, elbow / knee volume and seam details are baked into the complete GLB. Skin weights remain normalized on the original native skeleton. A versioned asset URL prevents reuse of the previous cached model after this update.

Wheel zoom now supports a closer view aimed at the character rather than far downhill. Follow-camera interpolation uses angle / radius around the skier, with terrain clearance, so a large close orbit does not linearly pass through the character. C resets the view as before. Default ski controls / contact physics are unchanged.


## Queens, traffic, equipment and airborne play

Queens Run uses retained easy OSM way 127126798 and the Forest Queen Express terminals. The current menu has eleven >=400m lift itineraries. Progressive bank reaches its full target in roughly 0.8s (initial engagement 0.43rad, bounded target 1.10rad), with the previous tangent-plane energy model. At a flat initial 12m/s the held-turn fixture reports ~32.7° bank at 0.25s, ~57.8° at 0.75s and ~63° / ~83° heading change at 1.5s. These are prototype outputs, not measured skiing calibration. Equipment supplies nominal sidecut 16/19/23m and authored visual length / width / tail variants.

`stepAirborne` leaves ground-only contact behavior to `stepSkier`. It detects convex-crest loss of required normal support with a short clearance probe, or accepts a speed-gated rising-edge J hop. Air velocity has gravity and drag; air yaw changes the visual skier orientation without steering world momentum. Q/E drive bounded yaw rate, F blends a grab pose. Landing compares ski heading with travel modulo 180° and normal impact speed, then awards clean jump / half-turn / grab points, supports switch landings, or enters a short recoverable fall. Pole plants, spray and snow stamps stop in the air; trail segments break at takeoff / touchdown. This is a prototype analytic contact approximation, without independent ski flex, pitch/roll tricks or full ragdoll.

Follow view waits about 1.8s after pointer release, then smoothly decays yaw/pitch along the shortest rotation back towards travel. Equipment previews have front / back controls and pause the run; wheel distance persists. Air spins and switch travel do not force the camera to orbit with the model's yaw.

`SkiTraffic` uses a fixed pool of 24 lower-detail skinned actors: 18 skiers across mapped itineraries and six lodge / station visitors. At most 12 are drawn, with frustum / distance culling and staggered pose updates. Contact penalties are handled separately from the kinematic movement; there is no multiplayer. Resetting the run resets traffic; skiers stop before the lower terminal instead of visibly teleporting to the front.

`wardrobe.js` validates hex colors and an explicit ski-profile allowlist, clones palette buffers per actor, and stores colors / profile / NPC toggle locally under `crystal-gear-v1`. No appearance or score is uploaded.

### Gameplay jump tuning

J adds a deliberately assisted vertical pop of 5.2–6.6m/s, increasing smoothly with horizontal speed from 3 to 20m/s. The former 2.5m/s hop allowed only about half a second on flat terrain. Gravity stays 9.81m/s², horizontal momentum is unchanged apart from drag, and natural crest takeoffs receive no automatic bonus. A J press at a natural crest still applies the assisted pop. Flat/moderate slope fixtures give roughly 1–1.4s airtime and 1.3–2.3m terrain clearance; abrupt drop-offs or rising landings can differ. Terrain elevations, trail lengths and coordinates are unchanged.

## NPC behavior, contact and drone camera

The first six skiers populate the active route / nearby lift branches, while the other twelve spread across the remaining mapped long itineraries, with individual bounded carving lines and speed targets. Deterministic local rules predict nearby skiers / trees, ease lateral avoidance and brake. Movement integrates in the fixed physics step; proximity decisions are throttled to ~10Hz nearby / 2Hz far away. Bone poses update at 24/12/5Hz by camera distance, with a 12-person visible budget. These are kinematic agents, not independently simulated skis, a learned model, an LLM service or a navigation-mesh planner.

Swept player-to-NPC contact uses a combined 0.9m horizontal radius and vertical separation check; airborne players above 1.6m do not collide with a standing skier. A contact awards -100 points, rolls both characters into a simple fall pose, then restores the player near their current route progress with zero starting speed. Recovery candidates avoid nearby trunks / NPCs and prefer slopes under ~33°; a bounded route fallback remains for crowded / steep sections. Recovery grants 3s immunity; the struck NPC has its own cooldown. This is contact gameplay, not a full ragdoll.

V opens a drone follow view; free mode freezes player and NPC simulation and moves only the camera. WASD / arrows translate, Q/E descend / ascend, Shift boosts speed. The camera stays within the active DEM tile and at least 5m above its surface. Exiting restores normal camera settings and the previous skiing mode / location.

Normal follow samples the near grade and the grade 24–32m ahead. A convex downhill transition smoothly adds up to 5.5m camera height / 3m pullback and aims farther down the slope; uniformly steep slopes do not trigger this lift. Sixteen terrain samples keep the crest sightline clear. Close equipment viewing, air spins and large manual orbits disable anticipation.

## Stable natural crest contact

Automatic takeoff now samples curvature across a 2.5–6m span tied to DEM spacing, rather than 1–2m triangle-scale creases. It also checks ballistic clearance at 0.04s / 0.12s / 0.30s (>0.5cm / 6cm / 18cm), plus negative required support, and requires the conditions to persist for 25ms. The short probe prevents launching into an immediately rising surface even if longer lookahead sees a drop. A natural release starts with only 6mm numerical clearance, rather than a visible 25mm pop. Landing clears candidate state and uses a 450ms cooldown. Manual J retains its assisted impulse and bypasses natural-crest qualification. This deliberately lets the skier absorb small surface variations instead of bouncing at every DEM crease.

## Region-specific scenery and drone sampling

The broad context remains the outer horizon. Once the optional regional DEM / image succeeds and validates against its background cell indices, background cells inside its footprint are omitted. Regional outer heights blend to the exact piecewise-triangle coarse height over 600m, preventing a mismatched hard boundary. More central cells use native exported samples while distant cells retain the existing static coarse/fine stitching. The active ski tile is excluded as before.

Regional winter material preserves photographic detail and uses a low-slope / dark-blue color heuristic to reduce accidental whitening of water. It shares the existing sky / weather fog treatment. A separate drone sampling view uses local ski surface heights inside the ski tile and stitched regional terrain outside; this expands free-camera bounds without expanding ski physics or making the regional terrain skiable. If the optional pack fails, the original background and local drone bounds remain available.

## Crowd activities and snow contact

The 18/6 world population reuses one cached NPC asset. Visitor anchors prefer mapped buildings close to station aprons, with safe station-side fallbacks outside building footprints / the main exit lane. Visitors follow arrival-gated waypoint / sit / stand / rest / door / indoor sequences; the movement checks buildings, nearby trunks, other NPCs and the player. Gait phase follows distance moved. Its stance-foot trajectory approximately cancels forward body movement, with a separate lifted swing phase. Pedestrian wrists retain their native forearm-local rotation instead of aiming at hidden pole tips. Seated pelvis / knee targets and stand-up lean use the existing humanoid IK; cups and sandwiches follow the right hand. These are procedural poses, not motion-capture clips or ragdoll physics.

NPC heading follows actual lateral travel; bank angles track turn rate, rather than rotating the model independently of the path. Slow flat sections use pole strokes and straight fast sections blend into a tuck.

`fitSnowContact` samples the actual rendered ski underside vertices after bank / root orientation, then raises the root enough to clear the current snow surface by 12mm. The main scene supplies the live powder surface, so fresh local snow relief is included. Hidden ski / pole rigs are not drawn for visitors; walking boot bounding soles provide conservative support. This is a visual support correction, not independently flexing ski contacts or an NPC rigid-body engine.


## Choreographed visitors, lift passengers and solid facilities

`npc-routines.js` controls six visitor sequences at three authored cabins. Move steps wait for arrival; doorway steps wait for the hinged door to open. An entrance ramp and cabin floor supply visitor support height. Indoor visitors are hidden until they exit. Sit/stand positions interpolate between the same seat and approach point. Shared-seat approaches use front waypoints to avoid blocking another visitor. Six skier profiles vary pace, roadside pauses and occasional recoverable falls. A shared fall envelope eases player and NPC side falls and recovery.

Eight additional independently posed actors occupy four open chairs on the selected lift; at most four are rendered. Rider positions and orientations derive from the exact carrier instance matrix. Seated boots / skis hang forward, poles are hidden and head poses update at 2Hz. They share the cached NPC asset and the Equipment visibility toggle.

`structure-collision.js` indexes static collision shapes in 32m cells. Mapped houses use extruded polygons, towers use cylinders, and station / cabin parts use oriented boxes. Station shapes are snapshotted before render batching. Dynamic doors and moving carriers retain current transforms. A radius-0.34m three-sphere player approximation sweeps in <=0.10m increments, clips motion and removes velocity into the surface. Impacts over 4.5m/s trigger a 1.6s fall and nearby recovery; recovery checks structures as well as trees. This is bounded gameplay collision, not a rigid-body engine, rideable-chair system or roof/platform locomotion solver. Fine handles and cables are not individually solid.


## Touch input and NPC continuity

`HeldControls` tracks each finger / keyboard source separately. Releasing one source preserves other held keys; global clear removes all owners on pause, blur and visibility changes. Touch capture cancellation / loss also releases its source. Mobile and coarse-pointer layouts provide separate steering / action groups, jump / air tricks, recenter, collapsible navigation and map, safe-area spacing, scrolling menus and compact landscape HUD. Free drone mode swaps to movement / elevation buttons. Canvas orbit owns one pointer ID, preventing a second finger from overwriting its drag.

Touch devices cap initial pixel ratio at 1.0 and use a 2048px shadow map (desktop cap 1.15 / shadow 3072px). This reduces rendering cost but does not establish mobile compatibility or FPS.

Lift riders now refresh their assignment among nearby in-frustum open chairs every 0.5s, with a retention bias and a preference for the active lift. A deterministic one-in-three chair candidate set keeps some chairs empty. Their eight-actor / four-visible budget remains unchanged. This fixes the previous allocation to only four widely separated chairs, which could leave all nearby chairs empty.

Ground NPCs keep staggered IK but save bone targets and interpolate local quaternion / position every render frame. Newly visible actors receive a fresh pose immediately; frustum / distance margins and selection bias reduce visibility churn. Heading changes are capped at 1.8rad/s; parked agents hold their actual point and heading rather than rotating from tiny displacement noise. This is a targeted continuity fix, not proof that all visual artifacts are eliminated.


## Committed avoidance and selective crest launch

NPC obstacle decisions now use the intended route heading, not a heading already perturbed by the last evasive move. Each encounter commits to a passing side until the corridor has stayed clear for 1.2s. Targets no longer sum conflicting neighbor signs. Lateral offsets have a speed-dependent slew limit, total per-step travel is bounded to 1.3 times forward speed, and rendered root orientation eases through DEM-normal changes. These changes address route / avoidance motion directly, in addition to existing bone interpolation.

Manual jump minimum is 5m/s (18km/h). Automatic launch minimum is 12m/s (43.2km/h), plus a fore/aft grade difference over 0.16, negative support force, predicted separation above 0.025m / 0.20m / 0.50m at 0.10s / 0.22s / 0.38s, and 50ms continuous confirmation. Constant planar slopes cannot satisfy the curvature / separation gate. Rejected manual presses report the minimum speed and remain edge-triggered; holding does not defer the launch until speed rises. These thresholds are gameplay tuning, not a biomechanics calibration.
