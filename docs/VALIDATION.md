# Validation — v0.3.1

## Automated

`npm test` checks:

- Downhill gravity and stationary flat-ground behavior.
- Strong edge held without steering does not invent a turn or flat-ground thrust (current behavior).
- High edge engagement gives a materially tighter turn than flat-ski steering.
- Speed reduction from a completed turn / lateral skid.
- Tuck reduces aerodynamic drag without creating forward thrust.
- Mirrored steering, fast engagement / reversal, and stopping idle pivot after release.
- Static powder vertex buffers across rebases, with persistent imprints across rolling texture windows.
- Soft-snow drag and bounded finite simulation.
- Kinetic energy does not exceed released gravitational energy on a constant slope.
- Trail projection, DEM integrity and named OSM coordinate placement.
- Render-triangle interpolation used for tracks / foot placement.
- Powder compression, raised rims, persistent world coordinates and bounded storage.
- Alignment of the aerial-derived mask with the DEM.
- A bounded steering controller reaches all checkpoints on all three imported trail lines within four simulated minutes, in both packed and powder snow.

Route traversal verifies the simplified ground controller on the checked-in DEM, not field accuracy, beginner usability, or a full browser-session completion.

`npm run build` compiles the static app. The app bundles Three.js and uses local elevation / trail data. The expected renderer bundle size warning is informational.

## Browser QA

Interactive checks cover loading the snow shader / context terrain, powder deformation, moving on terrain, twin ski tracks, edge-angle feedback, tuck input, restarting, pause, overview, aerial-map toggle and speed-blur toggle. Browser console is checked for shader / runtime errors.

The HUD reports FPS, raw frame interval P95 / maximum, hitch count, raster scale, and CPU powder / physics cost. See `PERFORMANCE.md` for the focused measurements. This is not a sustained benchmark across named hardware, browsers or mobile devices.

## Remaining fidelity limits

- No measured snow friction / edge calibration or flight / landing physics.
- OSM lines may not coincide precisely with winter snow and grooming.
- Near powder displaces a heightfield, not a physically conserved volume of snow; far trails remain lightweight ribbons.
- Forest placement follows an aerial-derived heuristic; individual tree positions / heights are not surveyed. Nearby procedural meshes and far crossed fir cards remain visual approximations.
- OSM infrastructure positions use approximate authored appearance and support heights.
- The surrounding 120 m DEM reproduces large mountain form, not detailed glaciers or cliffs.

## Distant scenery update — November 4, 2026

- 26 automated tests pass, including summit registration against Rainier's geographic position, aerial/DEM bounds alignment, and a far-terrain triangle budget below the previous mesh.
- Browser checks: the new winter shader compiles without console warnings/errors; scenic view works at narrow and 1280 × 720 desktop layouts; returning restores the active run rather than resetting its position/time.
- New real-frame screenshot: `docs/media/crystal-rainier.png`. The existing README video predates this scenery update.
- Texture registration and the DEM are real; winter cover, local viewing height and the snow shader remain authored approximations. No new instrumented GPU benchmark was performed.

## Expanded trail catalog

- 29 tests pass. All 81 imported centerlines are accounted for exactly once across 78 route entries; IDs are unique and all points lie within the original DEM.
- Route search, apostrophe normalization, grade filters, connected-fragment assembly, and disconnected-line handling have regression coverage.
- The former three-route completion check is now an explicitly named representative downhill check: the original three plus seven new blue/black runs, in both snow modes. It does not assert that all imported road/traverse geometry can be completed. A separate simple soft-snow audit completed 62 of 78 entries; limitations are recorded in [TRAILS.md](TRAILS.md).
- Short sections have a smaller finish radius so a 63 m section does not complete immediately on spawn. Route signs are capped at 21 locations; forest clearance uses a spatial index to avoid multiplying tree-placement work by the full catalog.
- Browser: original Green Valley and new Sunnyside start correctly after selection; difficulty/search selection uses a bounded list so the start button is not pushed below a 78-row list.

## Lift runs, fine ground and canopy update

- 34 tests pass: selected itineraries meet the 400 m cutoff; S/F coordinates match the assigned lift terminals; all 10 runs have a clear snow exit near the upper terminal; fine / coarse terrain footprints agree; canopy positions retain image registration; pole input works only at low speeds.
- The 78-entry source inventory tests remain data-integrity checks, not a statement that 78 runs remain selectable.
- A simple controller audit on full itineraries, with detailed ground and pole input, completed 5/10 before the station-exit refinement. This audit is not a manual-playability certification; it does not justify claiming all station-to-station traverses are validated.
- Browser checks verify the Lucky Shot spawn near the Rainier Express upper terminal and outside building proxies, terrain shader compilation, the bounded run selector and the more detailed forest layout.
- Additional geometry / texture memory comes from static terrain LOD meshes and the finer DEM texture. No frame-time equality with the previous build is claimed.


## Station, snow edges and skier update — November 5, 2026

- **37 automated tests pass**, plus the static production build. The earlier counts above are historical snapshots.
- All ten station spawns have a physical surface pitch below 3°. Pole work is checked at low speed and at 12 m/s; trunk collision uses a swept test that excludes canopy-only proximity.
- A regression starts at 12 m/s on constant 10°, 20° and 30° pitches, turns the skis across the slope with high edge input, then releases steering while retaining edge. Each case stops and remains stationary for a further two seconds. This validates controller behavior, not measured real ski friction.
- All terrain LODs share identical perimeter coordinates, heights and normals in a synthetic tile fixture, preventing the former dark grid / skirt seams.
- Representative source-section completion tests remain successful in both snow modes. Their controller uses light edge input (0.18), reserving strong edge for a deliberate stop, and uses poles at low speed. These checks do not establish completion of all ten full lift itineraries on the new authored terrain.
- Browser checks: Lucky Shot starts at 0 km/h on a 2° exit; Shift moves the skier from rest; station overview shows terminal models and Summit House; drag-to-look shows the photographed cloud sky. No runtime or shader errors were observed. A development hot-reload session reported a duplicate Three.js import warning; the production build succeeds.
- Arrival / return was exercised with the development fixture: enter the lower ring from 23 m away under normal physics, show the finish panel, then return to a stationary gentle upper exit. This is an interaction test, not a manual full-run playthrough. Return is instantaneous, without a lift-ride animation.
- The new station / sky screenshot is `docs/media/crystal-stations.png`. The README video still predates this update. No new sustained GPU / frame-time benchmark was performed.


## Unified weather, forest and skier — November 5, 2026

- **45 tests pass**, plus `npm run build`. New checks cover shared sun-disk / light direction, lower-angle sunset light, jointly changing snow / fog / direct light, finite bounded flake positions, interrupted transitions without light / fog jumps, turn-end pole contact / recovery, gesture-side stability on reversal, explicit double-pole override, and contact with the supplied snow surface. Existing physics / powder / ground / route regressions remain green.
- Browser inspection positions exercise clear, overcast, snow and sunset, plus the actual production build. Captured images in `docs/media/environment-*.png` are staged inspection views of actual rendering, not a manual full-run recording. The older README video is not the current scene.
- A short static forest inspection at 1280 × 720, after adaptive raster scaling to 0.85, reported 17.6 ms P95 / 17.7 ms maximum and no >25 ms intervals in that 180-frame sample. During compilation / loading or transitions, observed FPS was lower. This is not a sustained performance guarantee or an input-latency measurement.
- Snowfall shader compilation was explicitly exercised and prewarmed during loading. Browser checks also cover pole-powered starts and the weather selector. All ten full itineraries have not been manually revalidated after this scene update.
- The skier is still an authored procedural character with kinematic poses and gesture timing. Weather is an artistic preset system with static weak IBL; snow is a heightfield with sprites, not volumetric conserved snow. Rock dressing and piste widths remain authored approximations. These changes improve presentation without establishing photogrammetric or measured physical accuracy.


## Turning / pole timing correction — November 5, 2026

- **52 tests pass**. New trajectory tests verify substantial lateral world displacement / velocity in a normal turn, low ski-relative slip, momentum retained during reversal, continuous signed edge crossover, and no energy creation during banked turns on an inclined plane. Existing representative route and 10–30° cross-slope stop checks remain successful.
- A flat 12 m/s, 1.5 s normal-turn fixture ends approximately 4.97 m to the side, with 6.67 m/s lateral world velocity, 10.88 m/s total speed and negligible ski-relative slip. These are scenario outputs, not measured skiing data.
- Tests cover both directions of linked turns, no plant on release / one held arc / same-side re-engagement / short alternating taps, expiry after a straight gap, Shift / stop cancellation, cancelling a pending touch before crossover, finite posed limbs and snow contact. An actual physics + animation fixture verifies one touch near signed-edge crossover, rather than only testing synthetic state changes.
- Historical pole-timing descriptions and tests above are superseded: cumulative turn angle no longer independently triggers a touch, and neutral release alone does not plant a pole.

- Touch presentation also has a frame-hitch regression at 60 Hz, 30 Hz and a 100 ms frame: a valid linked transition still presents one contact rather than dropping it or planting twice. Browser checks exercised the actual Green Valley inspection slope, pole-powered starts, linked A/D input and visible curved tracks, with no new runtime errors.


## Five-part refinement — November 5, 2026

- **59 tests pass**, including progressive bank / actual-path tightening, continuous reversal, bundled skinned-model parsing and finite deformation, chest / hips heading separation toward the fall line, smooth removal during traverse / uphill / rest using actual velocity, separate loose garments and trouser knee volume, static forest topology / transforms across camera motion, stable light-space texels, fixed shadow-proxy pass counts, and finite merged detailed chair / gondola / tower geometry. Existing route, snow, braking and linked-pole checks remain green.
- A flat 12 m/s hold fixture reports about 23.5° edge at 0.25 s, 39.9° at 0.75 s and 57.3° at 1.5 s. Ski heading changes about 59° at 1.5 s and 118° at 2.5 s. These are prototype scenario outputs, not measured ski-turn calibration.
- Normal runtime loads the bundled 65-bone human rather than the procedural body. The source license and checksum are recorded in ASSETS.md. Screenshots `refined-character.png`, `refined-resort.png` and `refined-storm.png` are actual staged inspection renders; they do not prove a full-route playthrough.
- Tree crowns remain textured crossed surfaces with physical trunks. The static shadow proxy and architecture are approximations. The new costume, textures and pose timing still have room for improvement against the reference video; this update does not establish visual or physical parity.


## Complete skier / geographic detail rebuild — November 5, 2026

- 61 tests pass: new checks cover a single connected closed outfit surface, absence of nonmanifold seams / degenerate triangles, normalized native skin weights, native bones and finite deformation. Existing downhill / traverse counter-rotation, linked pole timing and physics tests remain.
- Adaptive terrain boundary tests check both 2-cell and 4-cell coarse grids for unpaired interior edges; summit position / elevation and aerial pixel-edge registration remain checked. The measured distant geometry total is 247,257 triangles, bounded below 300k.
- `rebuilt-character.png` is an actual staged, moving-turn render paused for inspection; `refined-rainier.png` shows the real ridge viewpoint after the scenery update. These are visual QA, not evidence of a full route playthrough, scanned character quality or fluid simulation.

## Public play preparation — November 5, 2026

- Gitleaks 8.30.1 (official release, checksum verified) reported no leaks in the original 15-commit history, the anonymized 16-commit pre-publication history, and the current working tree. Separate review found no private local paths in 224 historical file blobs and no private GPS / author image metadata. The included video metadata contains only format / encoder information.
- Local author / committer metadata was replaced with the GitHub username and noreply email after a verified private bundle backup outside the repository. Only `main` is pushed; private backup refs are not published. This describes the canonical visible history, not deletion of every server-side cached object.
- The production build was tested under `/crystal-ski-simulator/`, including lift-area start and the detailed Rainier view, with no new browser warnings / errors observed. Pages publishes `dist/` only. No personal access token is embedded in source or required by the deployment workflow.


## Character silhouette revision — November 5, 2026

- 62 tests pass. The new silhouette fixture verifies that both chest and loose hem widen by more than 2cm from the waist in the baked mesh, and that garment details share the native skeleton. Existing closed-surface connectivity, normalized weights, finite posed bounds and ski-boot bank checks remain green.
- Actual browser inspection covered the front, back, wheel close-up, a large orbit and a short turn paused for review, with no new warnings / errors observed after loading. The initial close-orbit linear interpolation exposed the near clipping plane; angle / radius interpolation fixes that camera path. No long full-route performance certification is implied.
- Current close front / back screenshots supersede `rebuilt-character.png` for the README character example. The game remains stylized and has not reached reference-video parity.


## First freeride gameplay pass — November 5, 2026

- 72 tests pass: Queens is an easy ~1.93km Forest Queen Express itinerary with the mapped terminal endpoints and a gentle spawn; legacy route, ground energy, grip and linked-pole tests remain. The tighter-turn fixture now checks its stronger arc instead of requiring a nearly straight forward component after a held turn.
- New tests cover unchanged ground-only stepping through the flight wrapper, natural convex-crest takeoff, ballistic return, no horizontal steering from air tricks, held-key hop suppression, switch / sideways / high-impact landings, mouse look delay / recovery, strict wardrobe validation and local persistence, profile turn-radius differences, and finite independent NPC rigs / pause / disable behavior.
- Browser checks include selecting Queens, nearby moving NPCs, palette and ski-profile preview, a slow inspection of an airborne grab, and a normal-speed manually controlled J + E hop landing for 200 points / 180° / Switch. Camera recentering was observed after mouse orbit. Debug poses are staged checks, not a complete route playthrough or validated competitive freestyle simulation.

## Assisted jump window

- 74 tests pass after increasing the J pop. At 4/12/22m/s, flat and 15° downhill fixtures stay airborne for 1–1.5s, clear the surface by 1.3–2.5m, and land cleanly without adding horizontal speed. A 12m/s fixture completes a controlled 360 plus grab for 450 points (~1.21s airtime). Held J still cannot trigger a second takeoff.
- Live browser inspection at the Queens QA location showed 1.9m clearance after a normal-speed J press. This is a staged location with actual flight simulation, frozen for capture. Natural crest flight, terrain geometry and trail distances retain their previous behavior.

## Snoqualmie, NPC contact and drone

- 85 tests pass, including real data fixtures for all four areas: every route is >=700m, fully inside its DEM, descends >100m, starts at its mapped upper terminal, and has a leveled spawn under 5°. Mapped unnamed connectors are retained for routing but skipped by the named-route renderer.
- Tests cover branch selection, bounded individual lines, proximity braking / avoidance, swept high-speed contact, airborne separation, collision immunity / cooldown, nearby recovery filtering, free-drone translation / terrain bounds, and crest anticipation / clear terrain sightlines.
- Browser smoke checks started and moved in West, Central, East and Alpental. A staged player/NPC proximity fixture triggered an actual contact, -100 points, visible fall and nearby recovery; no penalty event was injected. Drone free flight moved vertically / forward, and returning preserved ski progress. These are short inspections, not full playthroughs of every itinerary.

## Final anatomical revision

87 local unit tests pass. Both regenerated GLBs are checked at three leg cross-sections for an actual center gap (no connecting triangles), for absence of opposite-leg influences below the crotch, for exclusion of arm influences on the central chest, and for a bounded chest depth below the hood. Existing closed/manifold topology, normalized weights, animated finite bounds and full-grab pose checks remain. Production bundling also passes. No further browser tests were performed after the user requested local-only verification; the new character appearance and crest-camera change have not been visually validated in-browser.

## Beanie and shorter neck

89 local tests pass. Both GLBs contain the integrated beanie / cuff and no helmet group; cap material is rough and nonmetallic, both cloth parts retain wardrobe recoloring, and the Head joint segment measures ~4.6cm after shortening. Finite animated / grab bounds and prior anatomical separation tests pass. Validation remains unit tests plus production bundling, with no additional browser tests.

## Crest micro-hop regression

92 unit tests pass. A local 16m/s fixture over a 10cm bump previously produced a natural takeoff followed by a landing after ~0.192s. Revised tests cover 5–10cm bumps across 1/5/7.4m terrain spacings with zero takeoffs / zero free points; a genuine convex crest still launches once and lands after >0.3s; a sharp rising approach no longer launches and immediately recontacts. Existing manual J airtime, controlled 360 / grab, and landing tests remain passing. No browser tests were added.

## Regional landscape refinement

96 local unit tests pass. New checks cover exact DEM / imagery pixel-edge registration, four-tile metadata, JPEG integrity, ground-distance-per-pixel improvement over the old backgrounds, valid geographic grid indices, unmodified raw elevations, boundary height continuity, independent ray/triangle agreement for the coarse seam sampler, omission of replaced background cells, finite geometry and bounded triangle counts. Expanded drone bounds clamp correctly and preserve the original local ground surface. Existing skiing / animation / contact tests remain passing. Production bundling is checked separately. No browser / GPU visual test was performed, per the requested workflow.
