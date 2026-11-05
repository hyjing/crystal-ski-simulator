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
| Space or Down | Roll onto an edge and enter an arc on the last selected side |
| W or Up | Tuck: lower posture and aerodynamic drag |
| N / visible Restart button | Restart the entire run, clearing time, distance and tracks |
| R | Return to the latest checkpoint; preserve session stats |
| O | Follow / overview camera |
| Esc / P | Pause / resume |
| H | Help |

Space enters a turn rather than applying pedal-style direct deceleration. A / D select its direction. Skiing across the slope reduces downhill acceleration; turning and lateral skid dissipate energy. Tucking reduces drag and cannot accelerate a stationary skier on flat ground.

## v0.3.1 — responsiveness and frame pacing

Steering / reversal and camera response are faster, and releasing input stops idle pivoting. Powder terrain / normals now update in the GPU shader with static vertex buffers and rolling texture updates. Default rendering caps raster scale at 1.25, adapts down under sustained slow frames, and bypasses post-processing when blur is off. Blur is now off by default and remains optional.

See [measurements and reproduction](PERFORMANCE.md). `npm run bench:powder` measures CPU powder updates; hover the FPS HUD for frame-interval P95 / maximum and hitch count.

## v0.3 changes

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
| Ski area | -121.51, 46.91, -121.445, 46.965 | 257 × 321 | ~19.712 m |
| Surrounding mountains | -121.9, 46.75, -121.3, 47.08 | 385 × 321 | ~120.366 m |

Both exports are Float32 GeoTIFF in EPSG:32610, resampled bilinearly. Pixel-center origins and square-pixel spacing come from the actual GeoTIFF tags. All distances / heights are meters, without vertical exaggeration. Rendering subtracts a 1,200 m local altitude origin.

**Export spacing does not establish source survey resolution or accuracy.** This is a ground elevation model, not today's winter snow surface. USGS makes 3DEP products available [without use restrictions](https://www.usgs.gov/3d-elevation-program).

### Trails

`public/data/crystal-trails.json` contains three unchanged source LineStrings from **© OpenStreetMap contributors**, under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), with source IDs and URLs. See [OSM attribution and copyright](https://www.openstreetmap.org/copyright).

| Trail | Source way | Playable coverage |
| --- | --- | --- |
| Green Valley | [127128250](https://www.openstreetmap.org/way/127128250) | Mapped line, starting at its second node, ~19 m below its initial connection |
| Lucky Shot | [127128246](https://www.openstreetmap.org/way/127128246) | Only the available mapped section; not represented as the complete named run |
| Tinkerbell | [127128768](https://www.openstreetmap.org/way/127128768) | Available mapped line |

Coordinates are converted from WGS84 to UTM 10N and placed directly on the USGS grid. Names were cross-checked against the [official resort trail map](https://www.crystalmountainresort.com/the-mountain/trail-maps). OSM geometry is community mapping, not verified resort survey data. The first Green Valley connection falls on a locally opposing bare-earth slope, so spawning begins at the second source node without altering the retained source data.

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

`getRoutes` retains the raw OSM inventory for data checks and tree clearance. The menu uses `getLiftRuns`, built from `crystal-lift-runs.json`, with actual lift coordinates and explicit authored station / junction links. Short source sections are no longer menu entries. `liftExitSpawn` chooses an unobstructed snow exit near the station and includes space for the trailing camera. Shift provides bounded low-speed pole work.

The fine DEM uses a binary height array on the original footprint. `src/ground.js` prebuilds terrain LOD tiles; geometry is not rebuilt while skiing. Vegetation comes from georeferenced aerial canopy peaks and distant canopy cover. Fine export spacing is not native survey accuracy. See [TRAILS.md](TRAILS.md) and [ASSETS.md](ASSETS.md) for limitations and reproduction.
