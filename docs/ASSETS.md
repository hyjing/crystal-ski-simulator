# Visual assets and geospatial references — v0.3

## Public-domain aerial reference

- File: `public/data/crystal-aerial.jpg` (2056 × 2568).
- Source: [USGS / USDA NAIP ImageServer](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer).
- Requested/exported bounds in EPSG:32610: `613351.2019716937, 5196180.504790717, 618417.1903457006, 5202508.062253971`.
- RGB bands 0,1,2, bilinear export. Pixel size approximately 2.464 m.
- Retrieved November 4, 2026 (Pacific time). The service is a mosaic; exact source acquisition dates are not established here.
- This is **snow-free aerial orthoimagery**, not a winter satellite photograph. It is available as the minimap's aerial layer and guides vegetation likelihood. It is not pasted onto the snow surface.
- `public/data/crystal-landcover.json`: RGB-based vegetation likelihood at DEM grid locations. This heuristic can confuse dark grass, shrubs and forest; it does not locate individual surveyed trees or give canopy height.
- Reproduce: `python3 scripts/fetch-aerial.py` (Pillow required).

USGS describes the NAIP compressed orthoimagery as public domain in its [service metadata](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer).

## Resort infrastructure

`public/data/crystal-infrastructure.json` is an OpenStreetMap FeatureCollection of lift centerlines and building footprints, exported from the Crystal-area map API, © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Locations reference OSM geometry. Lift support height, chairs, cable sag, speeds, lodge heights and facade appearance are approximate authored proxies. They are not measured mechanical models or exact architecture; some OSM lift records can lag resort upgrades. Reproduce with `python3 scripts/fetch-trails.py --infrastructure`.

## Generated snow-covered fir

- Saved project asset: `public/assets/snow-fir.png`.
- Built-in ImageGen tool, transparent-background generation, November 4, 2026. No CLI or external API key was used.
- Purpose: crossed alpha cards for snow-covered fir vegetation. This is a generated texture, not a surveyed tree, a full branch mesh, or official resort artwork.
- The final prompt was:

> Use case: photorealistic-natural. Asset type: alpha-cutout evergreen vegetation billboard for a realistic 3D ski-resort game in the Washington Cascade Mountains. Generate ONE entire mature subalpine fir, isolated on genuinely transparent background. Full tree fits from tip to visible trunk base, straight-on orthographic view, portrait composition, tall and naturally narrow, approximately height to width 2.6:1. Photoreal needles, many irregular layered branches, dark evergreen interiors, heavy but uneven fresh soft powder snow resting in rounded pillows on upper branches, small patches of needles visible. Natural asymmetry and fine silhouette detail, not conical geometric tiers, not a Christmas decoration. Neutral softly overcast outdoor lighting suitable for a game albedo texture, no hard baked cast shadows or dramatic highlights. Thin natural gray-brown trunk at bottom. No ground plane, no snow mound under the trunk, no scenery, no horizon, no sky, no objects, no text, no watermark. Use the whole portrait image with a small transparent margin.

## Powder and speed effects

- Near-field snow: a static 48 m square tessellated patch with GPU elevation / normal sampling, 0.1875 m vertex spacing, over the unchanged USGS ground model. Snow thickness and wind mounds are artistic parameters.
- Compression: bounded sparse world-coordinate field, retaining up to 180,000 cells at 0.125 m spacing. The 512 × 512 visible displacement texture covers 64 m; ski imprints depress the surface and add raised rims.
- Patch boundaries feather back into the base terrain. No granular particle mass-conservation, subsurface fracture or snow-water content is modeled.
- Far session trails retain lightweight ribbons; near powder supplies the actual mesh deformation.
- Peripheral speed effect: a seven-tap radial post-process preserving the center and DOM HUD. It is a speed cue, not per-object velocity-buffer motion blur. Users can disable it.

## Mount Rainier and surrounding mountain textures

- `public/data/rainier-dem.json`: USGS 3DEP, 513 × 481, approximately 36.18 m export spacing, EPSG:32610, metric heights. This is resampled export spacing, not a claim of survey resolution. The render uses every second sample (~72.36 m) for a distant mesh.
- `public/data/rainier-aerial.jpg`: 2048 × 1920 public-domain USGS / USDA NAIP RGB orthoimagery, georegistered to the same DEM pixel edges.
- `public/data/context-aerial.jpg`: 2048 × 1708 NAIP imagery for the existing surrounding terrain. Its rendered grid uses every second sample (~240.73 m) to keep the total far-terrain triangle count below the previous context mesh.
- Adjacent `*-aerial.json` files preserve the exported UTM bounds, image dimensions, source URL and retrieval date. Reproduce with `python3 scripts/fetch-scenery.py` (Pillow required).
- Sources: [USGS 3DEP](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), [USGS / USDA NAIP](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer). Retrieved November 4, 2026, Pacific time. Exact source acquisition dates are not established.
- NAIP is snow-free-season aerial reference, not a winter satellite photograph. The shader adds authored snow cover by elevation and slope, retaining more of the photographed glacier / rock pattern at high elevation. Shadows in the imagery are baked into the reference and are not a fully relightable photogrammetry material.
- The mountain retains its real southwest bearing, summit height and distance. `V` opens a scenic camera on the west-facing local ridge and suspends the skiing simulation; returning preserves the run. This view uses a 46-degree vertical field of view.
- New textures total ~1.36 MiB compressed. These are static meshes and maps, with no extra shadow passes or post-processing. Triangle-budget validation does not establish identical GPU performance on all devices.

## Expanded blue / single-black trail import

`crystal-trails.json` now retains 81 named OSM centerline ways in the Crystal area, grouped into 78 selectable entries: 38 intermediate, 37 advanced, 3 easy. The fetch uses `https://api.openstreetmap.org/api/0.6/map?bbox=-121.525,46.90,-121.435,46.985`, with name/type/grade/geometry filtering. Reproduce with `python3 scripts/fetch-trails.py`, or `--input` with a previously exported XML map. Original IDs and tags remain in the data. © OpenStreetMap contributors, ODbL 1.0.

The current official winter map was inspected through the resort's [map page](https://www.crystalmountainresort.com/the-mountain/trail-maps); it marks Quicksilver and Easy Street green, overriding their OSM intermediate tags for the selector. No official map image is redistributed in the repository. See [TRAILS.md](TRAILS.md) for every source ID and scope limits.

## Fine local ground and georeferenced canopy placement

- Local source image is now 2056 × 2568 RGB pixels (~2.46 m export pixels), from the same public-domain USGS / USDA NAIP service and exact extent recorded in `crystal-landcover.json`. Reproduce with `scripts/fetch-aerial.py`.
- `crystal-detail-dem.json` + `.bin` contain a 1025 × 1281 USGS bare-earth export, 4.928004 m spacing, Float32 little-endian heights in meters. Its pixel-center footprint matches the original local DEM exactly. Reproduce with `scripts/fetch-ground-detail.py`. Export spacing does not establish the native source survey resolution; local 1 m lidar availability has not been verified here.
- Terrain appearance: `src/ground.js` builds static 5/10/20 m LOD meshes, with downward skirts to close tile seams. Cliffs, gullies and banks follow the source heights; no decorative obstacle cliffs were added. Bare-rock coloring is authored from surface steepness.
- `crystal-canopy.png` and `crystal-vegetation.json`: derived locally from the aerial image using RGB vegetation rules, canopy texture maxima and minimum 8 m candidate spacing. Candidate centers remain at real image pixels; size and orientation remain artistic. Up to 20,000 candidates are retained. This is an image-derived approximation, not a canopy-height or individual-tree survey. `scripts/derive-vegetation.py` reproduces them.
- Forest line clearance is reduced from 18 m to 5 m so inferred trees no longer cut a broad uniform empty lane through the photographic forest. The same mask shades distant forest cover on the terrain. Extents are transformed independently of the DEM resolution.
- Lift itineraries combine OSM source centerlines with authored short station aprons / junction connections. Details and bounds are explicit in [TRAILS.md](TRAILS.md).
