# Visual assets and geospatial references — v0.3

## Public-domain aerial reference

- File: `public/data/crystal-aerial.jpg` (1028 × 1284).
- Source: [USGS / USDA NAIP ImageServer](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer).
- Requested/exported bounds in EPSG:32610: `613351.2019716937, 5196180.504790717, 618417.1903457006, 5202508.062253971`.
- RGB bands 0,1,2, bilinear export. Pixel size approximately 4.928 m.
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
