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

- Near-field snow: a static 48 m square tessellated patch with GPU elevation / normal sampling, 0.1875 m vertex spacing, over the USGS ground model with the authored piste / station overlays described below. Snow thickness and wind mounds are artistic parameters.
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
- Terrain appearance: `src/ground.js` builds static 5/10/20 m LOD meshes, with shared finest-resolution perimeter samples and globally sampled normals across LODs to close tile seams without dark skirts. Large landforms follow source heights; authored piste / station overlays are described below. Bare-rock coloring is authored from surface steepness.
- `crystal-canopy.png` and `crystal-vegetation.json`: derived locally from the aerial image using RGB vegetation rules, canopy texture maxima and minimum 8 m candidate spacing. Candidate centers remain at real image pixels; size and orientation remain artistic. Up to 20,000 candidates are retained. This is an image-derived approximation, not a canopy-height or individual-tree survey. `scripts/derive-vegetation.py` reproduces them.
- Forest line clearance is reduced from 18 m to 5 m so inferred trees no longer cut a broad uniform empty lane through the photographic forest. The same mask shades distant forest cover on the terrain. Extents are transformed independently of the DEM resolution.
- Lift itineraries combine OSM source centerlines with authored short station aprons / junction connections. Details and bounds are explicit in [TRAILS.md](TRAILS.md).


## Station, piste and character update — November 5, 2026

- `src/stations.js` builds both terminals for the selected lifts and Mt. Rainier Gondola, including approximate bullwheels, roller banks, machinery roofs, operator huts, ramps and rails. Summit House, Campbell Basin Lodge and Green Valley Wheelhouse use OSM footprint position / orientation with authored timber facades, windows, roofs and terraces. These are procedural approximations, not photogrammetry or manufacturer models. The resort describes [Summit House beside the Gondola / Rainier Express](https://www.crystalmountainresort.com/things-to-do/dining/summit-house-restaurant) and [Campbell Basin at the top of Forest Queen](https://www.crystalmountainresort.com/things-to-do/dining).
- `preparePisteTerrain` adds inferred groomed corridors and raised snowbanks along mapped centerlines. Half widths are authored (roughly 6–22 m), with up to 3 m corridor adjustment and roughly 1.15 m edge mounds. `prepareStationTerrain` adds shallow unloading / loading aprons and lodge foundations. These edits are applied to a copied height array and shared by rendering, powder and physics; checked-in USGS source heights are retained unchanged. They do **not** establish surveyed piste boundaries, real small cliffs or measured earthworks.
- `src/trees.js` adds three shared procedural branch / needle / snow prototypes, with at most 24 nearby trees within 110 m replaced by meshes. Far trees retain the generated crossed cards. Aerial-derived placement remains approximate. Collision is against a swept trunk circle plus the skier radius, not the canopy.
- `src/athlete.js` is an authored articulated procedural model: flexing legs, counter-rotating shoulders, curved goggles, clothing detail, boots / bindings and cyclic double-pole strokes. It is not a scanned or fully skinned production character. Animation is driven by controller state rather than motion capture.

## Photographed HDR sky

- File: `public/assets/partly-cloudy-sky.hdr`, 2K Radiance HDR, 5,451,493 bytes.
- Source: [Kloofendal 48d Partly Cloudy (Pure Sky), Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), [direct HDR download](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr).
- Authors: Greg Zaal (original), Jarod Guest (sky edits). License: CC0. Retrieved November 5, 2026, Pacific time.
- Rendered as the equirectangular background and a prefiltered environment map for materials. It is a real photographed sky, **not a Crystal Mountain photograph or live weather**. Directional sunlight is authored, not calibrated to the photographed sun. A procedural sky remains available as a loading-error fallback.


## Unified alpine environment — November 5, 2026

This update supersedes the single-background / 24-tree-pool description above.

- `src/environment.js` uses one interpolated weather state for sky color, cloud cover, directional sun, hemispherical fill, exponential fog, exposure, falling snow and spray tint. Four authored presets (clear / overcast / snow / sunset) blend over five seconds; changing again starts from the currently blended state. This is not a weather service, measured atmospheric scattering or an astronomical sun model.
- The existing CC0 Poly Haven HDR supplies photographed cloud silhouettes (via a whiteness mask) and low-intensity IBL. The visible sky combines this mask with procedural moving clouds, authored horizon / zenith colors and a sun disk aligned to the actual directional light. The retained IBL is a static, low-intensity daytime reference; it is not a continuously rebaked reflection capture. The colored fill and direct lighting change continuously.
- Falling snow is bounded at 2,400 point sprites in near and far camera-adjacent volumes, with world-anchored wrapping, varied size / falling speed, wind drift and fog. Snow particles do not physically accumulate or conserve mass.
- The same aerial canopy-peak extraction now retains **56,053 candidates**, up from the former 20,000 cap (still 8 m minimum source spacing). Reproduce with `python3 scripts/derive-vegetation.py`. These are still inferred positions; increasing the cap does not turn them into surveyed trees.
- Three near branch prototypes (up to 48 trees within 125 m) and three simplified mid prototypes (up to 144 trees within 480 m) replace far cards. Needles use a locally generated deterministic RGBA branch texture on bent meshes; snow caps and trunks are geometry. No third-party tree model or new generated image was imported. Far cards are grouped into 384 m spatial batches. Piste clearance follows inferred corridor width rather than a fixed 5 m everywhere.
- Piste snowbanks now have low-frequency variation to break uniform tube-like edges. Sparse cosmetic rock outcrops are placed on steep DEM ground away from routes / stations, with snowy caps. These are authored dressing, not scanned geology, additional surveyed terrain or collision obstacles.
- Snow adds distance-filtered micro normal relief and subtle sun-dependent sparkle, retaining world-coordinate tracks. Spray emission is accumulated fractionally across frames and follows lateral slip, with drag and settling. The near-powder shader's world-position varying now follows the moving patch correctly.
- The procedural skier uses a tailored elliptical jacket / backpack mesh, anatomically scaled helmet / goggles, continuously bent sleeve / trouser meshes, curved sidecut skis with independent roll pivots, outside-leg support / inside-leg flex and upper-body counter-rotation. A turn-end gesture sends one pole forward, briefly anchors the tip to the snow in world space, adjusts the hand along the fixed-length pole, emits a small contact puff, and recovers. It can trigger on steering release / reversal or a completed turn arc. Explicit Shift double-poling overrides this gesture. This remains kinematic procedural animation, without a skinned production model, cloth simulation or independent ski contact forces.


## Skinned skier and stable resort scene — November 5, 2026

This section supersedes the earlier primitive-only character and dynamic near/mid tree replacement descriptions.

- **Character**: Quaternius, Universal Base Characters, free Standard `Superhero_Male_FullBody`, [author / license page](https://quaternius.com/packs/universalbasecharacters.html), CC0 1.0. Downloaded from the [public CC0 mirror](https://github.com/programasweights/avatar/blob/main/public/assets/character.glb), with its [verbatim pack license](../public/assets/QUATERNIUS-LICENSE.txt). Local file `public/assets/skier-human.glb`: 741,320 bytes; SHA-256 `d6f3b64cab629f6ddca9ba063811aeffd3663a8a4e49ade47cd9505dc2bbd70f`. Retrieved November 5, 2026 (Pacific time). The official itch.io entry was rate limited, so the documented CC0 mirror supplied the file.
- The original GLB remains checked in unmodified. Runtime adaptation replaces the jade preview material with skin / winter clothing colors; reshapes independent loose jacket / trouser envelopes using the original topology, bone weights and skeleton, with wider hems and knee / cuff folds; hides covered body triangles; adds cloth grain, helmet, goggles and a rounded pack; and curls finger bones around the grip. It is a stylized rigged game character, not a scan, motion capture or the reference video's original asset. The 65-bone skeleton is posed with two-link limb IK and distributed spine counter-rotation.
- **Forest**: retain the georeferenced aerial candidates and original generated fir texture. All distances now use fixed intersecting crown surfaces plus real trunk geometry. There is no nearest-N visible-tree reselection, 3D/cutout swap or per-frame instance-transform update. Spatial batches provide frustum culling. This deliberately favors a consistent silhouette and stable frame cost over changing branch topology near the camera. Crowns remain textured approximations rather than botanical scans.
- **Tree shadows**: independent low-complexity static fir casters; they render only in shadow passes via standard renderer hooks. They do not change with visible crown representation. Their shape is approximate. The light-space grid is snapped to shadow texels; shadows fade over a bounded distance before the coverage edge. Stochastic / screen-door depth masks are not used for tree shadows.
- **Resort models**: rounded terminal / gondola shells; padded chair seats, tubular safety bars, footrests and hangers; tower ladders / platforms / sheaves; wood grain and masonry textures generated locally; window mullions, gable faces, fascia, chimneys, gutters and doors. Geometry is batched by material. Locations / footprints remain from OSM; these details are authored approximations, not manufacturer CAD or surveyed architecture.
- **Snowstorm haze**: stronger exponential distance fog plus height-weighted drifting world-space pockets, sharing sky / ground fog color and clock. It is analytic haze, not volumetric ray marching, and is applied to people, snow, forests and structures together. Snowflakes remain the existing bounded sprite system.


## Complete skier and higher-resolution scenery — November 5, 2026

- Runtime character is now `public/assets/skier-complete.glb` (4,365,244 bytes; SHA-256 `05c2c4b95fbc5994075c68057b57c7901436e08a03ea657f3091299e6759434b`). `scripts/build-skier.mjs` rebuilds it from the preserved Quaternius CC0 source, retaining its head, hands and 65-bone skeleton. The original license above remains applicable to source components.
- The authored winter outfit is one closed, connected 37,281-vertex / 74,562-triangle surface, rather than inflated and clipped body triangles. Shoulder / sleeve unions, seat / trouser transitions and collar are built in bind pose, welded with smooth normals, and given normalized weights transferred from the native skeleton. Helmet, goggles and sculpted ski boots are included in the GLB. Covered body triangles and legacy box boots are hidden. No new clothing asset from an unverified marketplace is used. It remains an authored stylized character, not a scanned / commercially produced skier or cloth simulation.
- `scripts/fetch-scenery-detail.py` exports four NAIP tiles per footprint and stitches them into 4096px images; coordinates, tile extents, source and retrieval date are retained in adjacent JSON. This increases actual sampled image detail rather than enlarging the old bitmap. Winter appearance remains authored from snow-free imagery.
- `scripts/fetch-context-detail.py` retrieves USGS 3DEP on the same imagery footprint at about 60m export spacing (770 × 642 samples). Export spacing is not a claim about native survey resolution. The summit retains its existing ~36m source grid. Adaptive static geometry retains finer samples in the summit / river-valley areas and stitches their boundaries to coarse outer cells.
- Distant winter shading preserves photographed RGB rock / ice / forest / river-bed structure rather than replacing every pixel with a grayscale winter palette. Rivers here remain georeferenced orthoimagery; no measured river depth or dynamic water surface is supplied.


### Contoured winter character revision

The current outfit replaces the previous straight-sided torso with smooth garment sections through hem, waist, chest and sloping shoulders. Front / back panels have local compression folds, sleeves have elbow ease and gathered cuffs, and trousers have distinct thigh / knee / lower-leg volume. A folded hood, skinned zipper / pocket / yoke details, a dark neck gaiter and proportionally narrower goggles make the character read as dressed rather than a set of cylinders. The separate small seam mesh shares the native skeleton. Geometry and weights are baked offline; this is still authored stylized art, not the supplied video's original asset or a cloth simulation. `contoured-character-front.png` and `contoured-character-back.png` are actual close inspection renders.


## Freeride kit and lightweight traffic

The current cut widens shoulder / chest / hem, sleeves, thighs and lower legs, while reducing repeated fold amplitude. Preset and custom colors are applied to native vertex-color regions, helmet material and ski geometry; no branded clothing or texture is introduced. Three authored ski shapes use nominal sidecuts of 16 / 19 / 23m. These are gameplay parameters, not manufacturer calibration.

`public/assets/skier-npc.glb` is a lower-resolution derivative generated with `node scripts/build-skier.mjs --npc` from the same documented CC0 source. 1,324,404 bytes; SHA-256 `27049e15991bf845f30f80ad214ec1eabb42b5e3de453102a70a33c1ea085be3`. The outfit has 5,874 vertices / 11,748 triangles; the complete baked NPC model has 24,336 triangles including anatomy / equipment. The shared skeleton has independent poses per NPC. This uses the existing source license, with authored clothing / gear additions.
