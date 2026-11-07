# Responsiveness and frame pacing — v0.3.1

## Problems found

The old powder patch rebuilt positions, normals, UVs and colors for ~66,000 vertices on the main thread whenever its world anchor moved. A CPU-only local sample measured ~21.6 ms mean / 22.9 ms maximum for those rebases, before rendering or GPU uploads.

Steering used two slow exponential filters, followed by a camera filter with a 250 ms time constant. The idle-pivot term also depended on the sign of a decaying steering value rather than its magnitude, so a released input could leave a small persistent pivot.

## Changes

- Keep powder topology / vertex buffers static. Sample georeferenced elevation and smooth terrain normals in the vertex shader; change the patch transform and uniforms when moving.
- Use numeric world-cell keys instead of allocating coordinate strings for each lookup.
- Roll the deformation texture in place; refresh newly exposed strips and current ski-contact cells, instead of rereading the entire window after every anchor change.
- Fill untouched snow windows with a typed-array operation.
- Raise steering engagement / reversal response; target >90% engagement and >80% reversal within 100 ms of simulated input.
- Scale low-speed pivot by steering magnitude and snap tiny released input to zero.
- Increase normal A/D edge engagement to ~30°; strong edge input remains ~52°.
- Tighten follow camera and body response while retaining smoothing.
- Cap default device-pixel ratio at 1.25 instead of 1.75. This changes canvas raster resolution, not terrain dimensions or DOM text.
- If sustained frame P95 exceeds 24 ms, reduce raster scale in small steps, down to 0.85. Keep all terrain, trees and snow interaction.
- Prewarm direct and post-processing shaders while the loading UI is visible, avoiding a first-toggle compilation hitch during play.
- Disable peripheral blur by default. When blur has zero strength, bypass the entire post-processing chain. The user can still enable it.
- FPS tooltip now includes raw frame interval P95, maximum interval, count of intervals >25 ms, CPU powder / physics time and raster scale. Unlike average FPS, this can expose brief hitches.

## Reproduce CPU update measurement

```sh
npm run bench:powder
```

One local run after optimization reported an initial empty-window update of 0.20 ms, moving-window updates averaging 2.67 ms (maximum 4.44 ms), and ordinary updates averaging 0.32 ms. Numbers vary with JIT warm-up and the host. This benchmark excludes construction / initial loading, GPU execution, rendering and driver uploads.

The test suite checks quick engagement / reversal, released-input pivot, unchanged vertex-buffer versions across rebases, and preservation of powder imprints across rolling texture windows. Route traversal continues to pass on both packed and powder snow.

A short 1280 × 900 browser trial reported a P95 frame interval around 18.5 ms, maximum 18.7 ms and no >25 ms intervals in the observed sample after automatic raster adjustment. This is a small observation under browser automation, not a sustained benchmark or an input-to-photon latency measurement.


## Station and forest budget — November 5, 2026

Station beams, roofs, windows and machinery are merged into static material batches rather than retaining one draw call per part. Nearby procedural trees use three shared prototypes with a maximum of eight instances each (24 total), selected within 110 m at most every 650 ms. Only replaced far-card instance ranges are uploaded. Tree collision queries use a 16 m spatial grid rather than scanning the entire forest at each physics step.

Terrain tile boundaries share the finest edge samples and DEM-gradient normals across 5/10/20 m LODs; no per-frame geometry reconstruction or dark downward skirts are required. The photographed sky adds a 5.2 MiB HDR asset and a prefiltered environment texture. These are budget measures, not proof of unchanged frame times; no new sustained hardware benchmark has been performed for this scene update.


## Unified weather / denser forest

- Far forest uses shared geometry in 384 m spatial batches so the frustum can reject invisible regions. Far cards do not cast shadows; near / mid branch instances do. Nearby replacement updates only dirty instance ranges at most every 500 ms.
- Dense solid foliage clusters were replaced by bent needle cutouts, reducing near mesh triangles while preserving a porous silhouette. Geometry and materials are shared across three variants at each distance level.
- Snowfall stays at 2,400 sprites and reuses a typed vertex buffer. Sky uses one dome pass, photographed cloud detail plus five noise octaves, with no volumetric ray marcher or extra shadow cascade.
- Initial raster cap is now 1.15. Sustained frame P95 above 21.5 ms reduces raster scale towards 0.85, including overview / scenery and development inspection views. This trades raster sharpness for frame pacing; it does not guarantee 60 FPS on all devices.
- This update adds detail and forest density, so old benchmark figures are historical, not performance parity claims.


## Stable forest and imported humanoid

The final forest path no longer allocates / sorts nearest-tree lists or updates crown transforms while skiing. Fixed crowns and trunks are spatially instanced; the silhouette remains the same as the camera approaches. Independent static shadow proxies use lightweight geometry and submit no color-pass instances. This removes the former dynamic pool / dither-shadow transition work. Shadow texel snapping and distance fading address crawling / border changes.

The humanoid adds a 724 KiB bundled GLB and native skinning / IK; no external runtime asset service is used. The shadow map increases from 2048² to 3072², which costs additional GPU memory. The initial/adaptive raster policy remains. Stronger storm haze is a composed material function, without a volumetric ray marcher. These are workload changes, not an assertion of identical frame time on all hardware.


## Complete asset and 4K geographic scenery

The complete skier is ~4.11 MiB on disk and includes a 73,120-triangle continuous outfit plus the native exposed anatomy / equipment. Geometry construction and skin-weight transfer run offline; no marching cubes or garment remeshing runs in the browser. Native skinning and existing IK animate it.

Summit and valley detail is spatially limited: 247,257 total far-terrain triangles, with no runtime refinement / replacement. Each 4K aerial texture requires roughly 75–80 MiB including mipmaps, so the two larger maps cost additional GPU memory. They load progressively after skiing is initialized. Image detail and silhouette improve at a real memory / transfer cost; no blanket 60 FPS claim is made.


The contoured garment revision adds roughly 30k outfit triangles and a small skinned seam mesh to the previous character. The extra geometry supports the silhouette and folds; no per-frame garment generation is introduced. Stronger wheel zoom can increase character pixel coverage. Actual frame time remains device / view dependent; the existing adaptive raster policy remains active.


## NPCs and airborne state

Traffic is now capped at 24 actors with at most 12 visible (initial four-actor measurements below are historical). The 1.25MiB NPC asset is fetched / parsed once and cloned with independent skeletons; shared meshes / maps remain shared except local garment palette buffers. Baked geometry is ~24.0k triangles per NPC, plus the small ski / pole rig. NPCs add no shadow casters, powder-field stamps or independent particle emitters. Terrain/path movement is kinematic; bone poses are staggered at 24 / 12 / 5Hz by camera distance and skipped outside the frustum / 480m range or the visible budget. NPCs can be disabled in Equipment. They do not run the player's contact/flight simulation or collision solver.

`node scripts/benchmark-traffic.mjs` measured 900 warmed CPU-only frames on this development machine: median 0.126ms, P95 0.200ms, max 0.697ms for four actors. This excludes GPU rendering, asset startup and the rest of the game, so it is not an FPS guarantee. Short browser inspections varied by scene; the existing adaptive raster policy remains necessary.

Player flight adds one ballistic state and bounded terrain queries to the existing 120Hz step. There is no articulated rigid-body engine or cloth solver. The wardrobe preview pauses player/traffic simulation and persists only a small local settings record.

## Four-area loading and rule-based traffic

Only one local mountain pack is requested at a time. Selecting another area reloads the scene, releasing the old terrain / forest rather than retaining four GPU worlds. The broad Snoqualmie context is shared as a cached static resource. Existing skier / sky / fir assets are reused. New local grids are 449–513 columns by 513–577 rows and use the existing static terrain LOD; Alpental is 513².

The revised four-actor CPU benchmark (900 warmed frames) measured median 0.358ms / P95 0.882ms / max 13.167ms on this machine, including route movement rules and staggered poses, with no GPU rendering and no forest-neighbor callback in that fixture. Live fixed-step obstacle checks and the rest of the game add work; these figures do not promise a frame rate. NPCs remain optional.

## Regional landscape refinement

Only the active resort's regional pack loads: ~5.8MiB Crystal / ~6.7MiB Snoqualmie of additional DEM + JPEG downloads. Uncompressed RGBA texture plus mipmaps is approximately 45MiB / 42.7MiB respectively, excluding decoder staging and GPU alignment. Existing background / Rainier textures still have their previous costs.

Static geometry counts (background plus regional mesh, and Rainier for Crystal) are 347,058 triangles for Crystal and 300,858 for the Summit East origin fixture. Other Snoqualmie local origins may change the refined central footprint; tests keep both fixtures below 550k triangles. This replaces overlapping background cells, uses stitched static boundaries, and adds no per-frame DEM generation, particle emitters or shadow casters. Regional geometry / textures load after core skiing initialization; fallback background remains if exports fail. A one-time load / GPU upload may still hitch. No GPU or browser FPS test was performed for this change.

## 24-person activity crowd

A fixed pool holds 18 skiers / six visitors. The initial six skiers stay near the active run, while the remainder occupy other mapped trails; visitors use station / lodge anchors. Only twelve actors can be visible. Previously visible actors receive a small priority bias to reduce budget-boundary churn. All actors share the cached 1.25MiB NPC source; skeletons and palette buffers remain independent. The existing NPC switch controls both skiers and visitors. There are no added NPC shadow casters, individual particle systems or model downloads per person.

The updated 900-frame CPU-only fixture measured 24 actors, up to 11 visible: median 0.452ms, P95 0.958ms, max 2.170ms, including movement, activities, staggered IK and snow contact. It excludes GPU rendering and the live forest-neighbor callback. Rule decisions are throttled while movement stays continuous; distant poses receive fewer updates. Snow support samples are cached in local mesh space; terrain/powder heights are evaluated for visible actors. The powder sampler now immediately returns the unchanged terrain surface outside its bounded patch. This is not a browser FPS guarantee.


## Sequenced visitors and lift passengers

Ground traffic remains 24 actors / at most 12 visible. Eight additional lift riders share the cached source and are capped at four visible with 2Hz seated-pose updates; total rendered NPC budget is 16. Three fixed authored cabins add doors, benches and shared material geometry. Static station / chair refinements remain material-batched or instanced. Dynamic doors are queried separately; static facility colliders use a 32m spatial grid and moving chairs are distance-filtered.

The updated 900-frame ground-crowd CPU fixture measured median 0.904ms / P95 2.445ms / max 21.043ms on this machine, with all 24 actors and up to 12 visible. This supersedes the preceding activity-crowd benchmark for the current build. It excludes lift riders, facility collisions, GPU rendering and the live forest-neighbor callback; it is not an end-to-end frame-rate claim. No browser/GPU performance test was run in this iteration, at the user's request.


## Interpolated crowd poses and touch rendering

The current 900-frame ground-crowd CPU fixture measured median 0.346ms / P95 0.650ms / max 1.110ms for 24 actors, up to 12 visible, including interpolation of cached bone targets. Measurements vary with machine load; this is not a browser or phone FPS claim. Existing staggered IK and NPC visibility budgets remain. Lift assignment scans current carrier centers at 2Hz, reusing the eight passenger actors. Touch devices start at pixel ratio <=1 and 2048px shadows; the adaptive raster floor remains 0.85. No mobile GPU benchmark was performed.


The committed-avoidance update measured 0.566ms median / 0.972ms P95 / 1.888ms max in the same 900-frame CPU ground-traffic fixture (24 actors, up to 12 visible). It includes bounded path correction and root / bone smoothing, but still excludes GPU rendering, live forest callbacks, lift riders and player facility collision. No browser performance test was run.

The shoulder-relative arm revision measured 0.294ms median / 0.485ms P95 / 0.792ms maximum in the same 900-frame CPU ground-crowd fixture (24 actors, up to 12 visible). This includes the new arm targets and reach constraints, but excludes GPU rendering, live forest callbacks, lift riders and player facility collision. It is not an end-to-end frame-rate measurement.

The clip-based crowd fixture now explicitly installs the shared motion library / individual mixers before timing. The current 900-frame CPU result is median 0.281ms / P95 0.474ms / max 0.949ms for 24 ground actors, up to 12 visible; it includes clip mixing, contact corrections and staggered poses, but excludes GPU rendering, live forest callbacks, lift passengers and player facility collision. The ~807KiB uncompressed motion JSON is loaded once and its immutable tracks are shared; mixers remain per-actor. No mobile FPS result is claimed.

### Expanded ski animation clips — November 6, 2026

Isolated traffic benchmark with 24 NPCs, 12 visible and 900 measured frames: median **0.297ms**, P95 **0.533ms**, max **1.066ms** CPU. This includes motion mixing and staggered contact / IK, and excludes GPU / forest callbacks. Clip-to-procedural transition buffers are reused and only copied during transitions. The expanded 20-clip library is **536,216 bytes** uncompressed after removing redundant held-pose keys, smaller than the previous nine-clip library. These measurements are not an end-to-end FPS guarantee.

Palm attachment follow-up: synchronizing the actual rendered NPC hand sockets every frame measured **0.369ms median / 0.651ms P95 / 2.017ms max** in the same isolated CPU traffic benchmark (24 NPCs, 12 visible, 900 frames). The synchronizer updates only the required transform chains, rather than recursively updating the entire actor on every render frame. GPU rendering remains excluded.

Load-driven motion follow-up: isolated CPU traffic benchmark (24 NPCs, 12 visible, 900 frames) measured **0.402ms median / 0.698ms P95 / 1.567ms max**. This includes the new pose response and equipment attachment; GPU rendering is excluded.

Grove / automatic-stance follow-up: seed construction measured 143ms for Crystal, 36ms for Summit Central and 35ms for Whistler before route / station filtering. This is startup-only CPU work; grove instances remain static. Isolated crowd workload measured **0.835ms median / 1.551ms P95 / 2.615ms max** across 900 frames, 24 NPCs / 12 visible, including the raw-pose restore that prevents overlay accumulation. These CPU results exclude GPU canopy overdraw and are not a frame-rate guarantee.
