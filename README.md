# Crystal / Terrain Sessions

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
| Space or Down | Stronger edge engagement; combine with a turn to skid / slow |
| W or Up | Tuck: lower posture and aerodynamic drag |
| N / visible Restart button | Restart the entire run, clearing time, distance and tracks |
| R | Return to the latest checkpoint; preserve session stats |
| O | Follow / overview camera |
| Esc / P | Pause / resume |
| H | Help |

Space alone is deliberately **not a pedal brake**. Skiing across the slope reduces downhill acceleration; turning and lateral skid dissipate energy. Tucking reduces drag and cannot accelerate a stationary skier on flat ground.

## v0.2 changes

- PBR snow micro-normal, albedo and roughness maps, broad surface variation, directional sunlight and local dynamic shadows.
- Two ski grooves follow the rendered terrain triangles, with subtle displaced-rim shading. Sliding produces short-lived snow spray. Tracks remain for the current run, including checkpoint resets, with a bounded 8,500-segment ring buffer. This is a surface effect, not volumetric snow deformation.
- Three real named OSM trail geometries replace the invented demo lines: **Green Valley**, **Lucky Shot**, and **Tinkerbell**.
- Real surrounding mountains, including the geographic area containing Mount Rainier, use another georeferenced USGS DEM. Their visibility depends on camera direction and foreground occlusion.
- Steering / edge control, mass-based aerodynamic drag, adjustable snow friction, tuck posture and calibrated skier scale.
- Visible Restart button, N shortcut, stance indicator and frame-rate readout. Hover the FPS number for the averaged per-frame CPU physics time, excluding rendering.

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

Snow, vegetation and skier are procedural. A [Crystal Mountain skier's photo](https://www.ingridbackstrom.com/thoughts-from-a-skier-mom-blog/2019/1/6/the-great-family-ski-road-trip-part-2-crystal-mountain) informed the cold-shadow / warm-sun contrast and snow-laden conifer direction; its photography is not bundled or redistributed. Tree positions are not surveyed vegetation boundaries. No official logos, photographs, or map artwork are redistributed.

This independent prototype is not affiliated with Crystal Mountain Resort and is not an on-mountain navigation tool.

## Physics and performance

`src/physics.js` uses SI units and a fixed 1/120 s step:

- Gravity is projected onto the local terrain plane.
- Coulomb-style base snow resistance depends on the surface normal and the selected friction parameter.
- Aerodynamic deceleration is `0.5 × airDensity × CdA × surfaceSpeed² / mass`.
- Tuck lowers CdA instead of adding thrust.
- Ski heading differs from velocity; lateral grip and skidding dissipate energy during turns.

Parameters are explicit prototype assumptions: 85 kg combined mass, 1.0 kg/m³ air density, CdA 0.65 upright / 0.28 tucked, friction 0.025 packed / 0.06 soft. They are **not measured or field-calibrated**. A 42 m/s horizontal safety cap remains. No airborne motion, ragdoll, ski flex, independent leg forces or measured edge-contact model is simulated.

The FPS readout is an observation of the current browser, not a hardware performance guarantee. Snow and trees use bounded geometry / instancing; physics is one constrained skier, not a forest of dynamic rigid bodies.

## Reproduce data imports

```sh
# Python 3 + Pillow needed for DEMs
python3 scripts/fetch-dem.py
python3 scripts/fetch-dem.py --context
# Standard library only for trails
python3 scripts/fetch-trails.py
```

The app uses checked-in JSON at runtime; terrain and trails do not require live external APIs. Google Fonts is optional with system font fallbacks.

See `docs/SCOPE.md` and `docs/VALIDATION.md` for remaining work and verification limits.
