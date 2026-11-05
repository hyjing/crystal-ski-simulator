# Crystal / Terrain Sessions

A browser-based 3D skiing prototype on **real USGS elevation data around Crystal Mountain, Washington**. Built with Three.js, Vite, and a small deterministic skiing controller.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm test
npm run build
npm run preview
```

## Prototype v0.1

- A 257 × 321 elevation grid, sampled at approximately 19.712 meters, in UTM zone 10N. Horizontal and vertical distances use meters, with no vertical exaggeration.
- Three **prototype reference routes** with start points, flags, sequential checkpoints, and a finish summary.
- Terrain-gradient gravity, independent ski heading / velocity, edge grip, drag, braking, and two snow parameter presets.
- Follow / overview cameras, route minimap, live speed / slope / elevation, and a session trail.
- Pause, restart, checkpoint recovery, generated tree collisions, optional synthesized wind audio, and basic touch controls.
- Chinese interface with English route names.

The snow presets are controller parameters. They do not simulate deformable snow, powder flotation, or measured current snow conditions.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Turn |
| Space or Down | Brake |
| R | Return to the latest reached checkpoint |
| O | Toggle follow / overview camera |
| Esc / P | Pause / resume |
| H | Help |

The skier accelerates under gravity. Turn across the slope or brake to manage speed. Follow the route flags in order; pass within 65 meters of each checkpoint. Leaving the reference line is allowed. Trees are obstacles. The map shows the orange session trail.

## Data provenance and fidelity

`public/data/crystal-dem.json` was derived from the [USGS National Map 3DEP Elevation ImageServer](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), retrieved November 4, 2026 (Pacific time).

- Requested geographic bounds: `-121.51, 46.91, -121.445, 46.965`.
- Export: 257 × 321, Float32 GeoTIFF, bilinear resampling, EPSG:32610.
- Actual exported extent is adjusted by the service to square pixels. GeoTIFF pixel scale and tie point supply the stored pixel-center origin and spacing.
- Height values are elevation in meters. Rendering subtracts 1,200 m as a local origin; the elevation HUD shows the original values.
- The service combines source datasets. **A 19.7 m export spacing does not establish the native resolution or survey accuracy.** Snow depth and current winter surface are not in this grid.
- USGS makes 3DEP products available [free of charge and without use restrictions](https://www.usgs.gov/3d-elevation-program).

**Route names and paths, trees, snow appearance, and skier are authored prototype content. They are not verified official trails, surveyed vegetation, or a resort digital twin.** Official trail maps are available from [Crystal Mountain Resort](https://www.crystalmountainresort.com/the-mountain/trail-maps). No official map artwork, logos, or resort assets are redistributed here. This independent project is not affiliated with the resort and is not an on-mountain navigation tool.

To regenerate the grid, see `scripts/fetch-dem.py`. It needs Python 3 and Pillow (`python3 -m pip install Pillow`). The playable app uses the checked-in JSON and needs no external terrain service at runtime. Fonts are optional remote Google Fonts; system fonts are the fallback.

## Structure

```text
src/terrain.js     Bilinear sampling, gradient queries, route definitions
src/physics.js     Fixed-step controller and route projection
src/main.js        Rendering, session state, controls, audio, minimap
src/style.css      Responsive overlay UI
public/data/       USGS-derived elevation grid
scripts/           Reproducible terrain download
tests/             Physics, route, and real grid regression checks
docs/SCOPE.md      Milestones and known limitations
```

## Next milestone

Validate route geometry against georeferenced trail data, test with Crystal skiers, tune carving and camera feel, and add measured performance targets on named hardware. The current DEM can support mountain-scale form; finer terrain features need better source data and a separate winter surface model.
