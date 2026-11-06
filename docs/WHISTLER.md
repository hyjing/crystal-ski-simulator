# Whistler / Blackcomb first map pack

Two selectable areas, eight mapped long lift itineraries each. The common local terrain is 641×641 at 25m export spacing in UTM zone 10N; surrounding mountains use 513×513 at 90m. Export spacing is not a claim of original survey resolution. Terrain comes from [Mapzen Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/), reprojected from Terrarium XYZ pixel centers to the game's metric grid. Canada terrain data contains information licensed under the Open Government Licence – Canada. Global fallback terrain sources include USGS SRTM/GMTED2010. See [provider attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Trail centerlines, lift endpoints, building and forest outlines come from OpenStreetMap contributors, ODbL 1.0. [Official resort maps](https://www.whistlerblackcomb.com/the-mountain/about-the-mountain/trail-maps.aspx) are a reference link; their artwork is not bundled. Winter grooming, temporary closures and actual visitor / individual tree positions are not represented.

The green-gray background reference is generated from OSM landcover polygons, **not satellite or aerial photography**. Trees are deterministic candidates inside those mapped polygons. Missing / incomplete forest outlines can leave gaps. The map switch says “参考图” for these areas. No commercial imagery was copied.

## Rebuild

```sh
python3 scripts/fetch-whistler.py --dem-only
python3 scripts/extract-whistler.py
node scripts/assemble-whistler.mjs public/data/whistler/shared/source-osm.json
python3 scripts/build-whistler-landcover.py
```

Python needs Pillow and NumPy. Downloads are cached in `../../work/whistler-cache`, outside this repository. The official OSM API fallback fetches modest map tiles; only resort geometry and allowlisted tags enter the public pack, without editor / user metadata. Respect upstream service limits when rerunning.

Graph itineraries use connected OSM piste nodes, penalize uphill / more difficult connectors, and include explicit station links and short authored junction snaps. Routes start and end at lift endpoints; this is approximate station-apron reconstruction, not a survey. Routes with more than 60m accumulated ascent are rejected, which currently excludes Wishbone and Saudan Couloir candidates. The Saddle and other names below refer to a full lift itinerary containing the named run, not only that run's official standalone length. Junction / station gap lengths are stored with each itinerary for review.

| Area | Itinerary | Length |
| --- | --- | --- |
| Whistler | Peak to Creek | 5.45 km |
| Whistler | The Saddle | 4.69 km |
| Whistler | Harmony Ridge | 2.53 km |
| Whistler | Jeff's Ode To Joy | 2.44 km |
| Whistler | Pony Trail | 3.05 km |
| Whistler | Dave Murray Downhill | 5.76 km |
| Whistler | Ego Bowl | 2.05 km |
| Whistler | Jolly Green Giant | 1.92 km |
| Blackcomb | Cloud Nine | 2.55 km |
| Blackcomb | Panorama | 2.68 km |
| Blackcomb | Jersey Cream | 1.73 km |
| Blackcomb | Springboard | 2.52 km |
| Blackcomb | Cruiser | 2.58 km |
| Blackcomb | Ridge Runner | 2.20 km |
| Blackcomb | Twist and Shout | 2.61 km |
| Blackcomb | Gear Jammer | 4.72 km |

This independent prototype is not affiliated with Whistler Blackcomb, Crystal Mountain or The Summit at Snoqualmie, and must not be used for real-world navigation.
