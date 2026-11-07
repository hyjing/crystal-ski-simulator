# Multi-resort scenery

The header, home link, country, coordinates, caption, accessible world label and page metadata follow the selected resort. The mountain / contour mark and favicon belong to Terrain Sessions; they are not a resort's official logo.

The visual direction draws on [Steep's alpine environment](https://www.ubisoft.com/en-gb/games/steep), [Death Stranding 2's changing landscape and atmosphere](https://blog.playstation.com/2025/06/25/death-stranding-2-on-the-beach-launch-interview/) and [Microsoft Flight Simulator's geographic scenery / weather](https://www.flightsimulator.com/microsoft-flight-simulator-2024/). The practical interpretation here is recognizable terrain silhouettes, distinct foreground / middle distance / horizon, and consistent sky, snow and valley haze. No assets from those games are used and this does not claim equivalent fidelity.

## Coast Mountains

Whistler / Blackcomb now load three registered, derived satellite textures from the **2016** EOxCloudless CC BY 4.0 mosaic. The OSM reference maps remain separate; forest candidates still originate from mapped landcover, not surveyed tree crowns. Snow, buildings and trees remain authored render content. The local ground has the same tiled snow / canopy treatment used by the other resorts, with photographic forest, rock and water variation in the middle distance. The minimap can show the registered satellite layer.

A 705 × 705 regional DEM at 45m export spacing replaces a roughly 32km square of the 90m background. It samples higher-zoom open elevation tiles and stitches its perimeter to the background's actual triangles. The outer mesh is 90m between vertices, with native 45m samples in selected ridge patches, including the southwestern Black Tusk direction. This refines the real elevation source; it does not manufacture new summit heights or modify playable route geography. Local skiing still uses the original 25m export, and export spacing is not original survey resolution.

[Whistler Blackcomb's photo locations](https://www.whistlerblackcomb.com/travel-guide/iconic-whistler-photo-locations.aspx) and [alpine sightseeing guide](https://www.whistler.com/blog/post/peak-2-peak-gondola/) were geographic references for the alpine ridges, forested valley and Black Tusk views.

## Cascades and built scenery

Crystal and Snoqualmie retain registered USGS / NAIP scenery. Per-region winter snowlines, forest tint and altitude-weighted haze distinguish the high alpine and lower pass environment. A small distance-dependent ridge haze separates the horizon while near slopes remain readable; sky color and active weather still drive fog, illumination and snow.

Mapped lodges at Roundhouse, Rendezvous, Glacier Creek, Crystal Hut / Horstman Hut, Summit West / Central, Silver Fir, Hyak and Alpental now use detailed static lodge construction: foundations, windows / mullions, doors, snowy roof edges, decks, rails and benches. Major Whistler dining lodges have a shallower roof style. These are authored footprint-based approximations, not architectural replicas. Extra steep-ground rock dressing is bounded to 800 static instances and kept outside route / station corridors.

## Provenance and performance

Rebuild Canadian derived assets with `python3 scripts/fetch-whistler-scenery.py` (NumPy / Pillow and curl). Downloads are cached outside the repository. Pixel-center sampling / UTM reprojection are explicit, and each image's metadata records its exact bounds, vintage and license.

The [EOxCloudless licensing FAQ](https://cloudless.eox.at/documentation/faq) permits the 2016 basemap under CC BY 4.0 with attribution. The game shows a persistent imagery credit while these textures are visible, and the development video recorder embeds it in Canadian footage. Newer paid / noncommercial mosaics are not used. See `public/data/scenery/whistler/ATTRIBUTION.txt` and `ASSETS.md`.

Each selected resort loads its own assets. Context / regional detail arrives progressively after playable terrain. Ground tiles use stable prebuilt LODs, ridge geometry has a bounded triangle budget, and valley haze is a shared material effect rather than additional transparent geometry. No browser visual regression or GPU frame-rate validation was performed; unit tests check registration, seams, geometry budget, UI identity and shader integration.

## Forest groves

`forest-distribution.js` uses coherent 57m / 170m density fields to group the existing georeferenced vegetation anchors into dense groves with open glades. New infill stays inside supported landcover and at least 5.8m from neighboring trunks; routes, station aprons and elevation exclusions still filter every tree. Crowns are wider, while collision remains on the narrow trunk. Positions / instance matrices are built once and do not regenerate with camera motion. A 90,000-seed cap bounds the pool. Raw seed-stage counts before route / station filtering: Crystal 56,053 → 52,521 (sparse outliers removed and core infill), Summit Central 14,699 → 15,818, Whistler shared 5,095 → 18,218. Grove dressing is authored, not a survey of individual trees.
