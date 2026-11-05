# Lift-to-lift runs

The menu now contains 10 lift-to-lift itineraries, rather than 78 independently selectable map fragments. Runs shorter than 400 m are excluded. Short named segments remain in the routing network when they connect a complete run.

The four requested corrections are explicit: Green Valley starts at the Green Valley upper terminal and ends at its lower terminal; Lucky Shot uses Rainier Express; Mr Magoo and Chappelle’s use Forest Queen Express. The skier starts at rest on an authored gentle unloading apron, 35–150 m along the approach, avoiding building proxies and camera obstruction. All ten current spawn slopes test below 3°. The map's S/F pins still mark the actual mapped lift endpoints. Finishing requires reaching the visible 18 m lower-terminal arrival zone; intermediate checkpoint progression is not required to enter it. The finish button restarts at the upper exit, without an animated lift ride.

| Run | Lift | Approximate itinerary length | Via |
| --- | --- | ---: | --- |
| Green Valley | Green Valley | 1.22 km | Grubstake → Green Valley |
| Lucky Shot | Rainier Express | 1.98 km | Front Traverse → Back Traverse to Lucky Shot → Lucky Shot → Gandy's Run |
| Mr Magoo | Forest Queen Express | 1.64 km | Downhill → Mr Magoo → Ms. Magoo → Lower Magoo → Broadway |
| Chappelle's | Forest Queen Express | 1.77 km | Downhill → Chappelle's → Lower Magoo → Broadway |
| Downhill | Forest Queen Express | 1.58 km | Downhill → Afterburn → Broadway |
| Gold Hills | Gold Hills | 0.62 km | Gold Hills |
| Northway | Northway | 2.08 km | Upper Northway → Northway Drainage |
| Otto Bahn | Northway | 2.81 km | Upper Otto Bahn → Otto Bahn → Lower Otto Bahn |
| Quicksilver | Quicksilver | 1.11 km | Quicksilver → Tinkerbell |
| Tinkerbell | Quicksilver | 1.32 km | Easy Street → Tinkerbell |

## Sources and authored connections

- `crystal-trail-network.json` retains 93 easy/intermediate/advanced OSM ways, including green and unnamed connectors. The older `crystal-trails.json` remains an 81-way source inventory and is not the current menu.
- `crystal-lift-runs.json` records lift IDs, contributing OSM way IDs, named legs, and the lengths of inferred station / junction connections. `scripts/build-trail-network.py --input <Crystal OSM XML>` exports the network; `scripts/assemble-lift-runs.mjs` reproduces the itineraries from these local inputs.
- Real mapped segments are retained. Source gaps of up to 50 m are bridged as approximate junctions; station apron connections may be up to 300 m at the top and 180 m at the bottom. Northway's upper approach is approximately 215 m; the lower apron links for Lucky Shot and Otto Bahn are approximately 137 m and 146 m. These are authored approaches, not surveyed trail or gate geometry.
- The current menu is a curated subset. Other long source sections remain outside the menu until their lift approaches / exits are assembled. Double-black and cliff lines are outside this set.

## Ground and forest limits

Near terrain now uses a 4.928 m USGS elevation export on the same footprint as the original tile, rendered with static 5/10/20 m LOD meshes. Denser sampling preserves more of the service's slope and gully shape; it does not establish the native resolution or recover every small cliff. Piste edges now use authored snowbanks and inferred corridor widths, and groomed traverses receive shallow benches. Station plazas are separately leveled to gentle pitches. These overlays are applied over the retained source heights; they are not surveyed winter edge geometry. Overhangs and airborne landing physics are not modeled.

Tree candidates come from RGB vegetation and canopy-texture peaks in the 2056 × 2568 NAIP image, with georeferenced pixel centers and a narrow 5 m clearance at mapped lines. This estimates forest placement rather than surveying individual trees. The far forest cover uses the same georeferenced canopy mask. See [ASSETS.md](ASSETS.md).

## Validation boundaries

Tests verify the lift endpoint coordinates, minimum run length, clear gentle station exits, ground registration and pole acceleration at both low and higher speeds. The original source-section physics regressions still cover representative downhill segments; they do not prove all 10 full itineraries can be followed continuously on the current DEM. A simple waypoint-controller audit on the detailed ground completed 5 of the 10 full itineraries and failed to follow the others, especially traverses. Manual control can differ; complete-run traversal after the new authored benches / station aprons has not been exhaustively validated, and route junctions and full-run calibration remain work in progress.

## Source inventory — raw mapped sections, not menu entries

| Name | Grade | Length | Drop | Source way IDs |
| --- | --- | ---: | ---: | --- |
| Green Valley | 蓝道 | 1.08 km | 272 m | [127128250](https://www.openstreetmap.org/way/127128250) |
| Lucky Shot | 蓝道 | 0.59 km | 213 m | [127128246](https://www.openstreetmap.org/way/127128246) |
| Tinkerbell | 绿道 | 1.11 km | 191 m | [127128768](https://www.openstreetmap.org/way/127128768) |
| 13-F | 黑道 | 1.18 km | 96 m | [388926563](https://www.openstreetmap.org/way/388926563) |
| Afterburn | 蓝道 | 0.11 km | 38 m | [1170380967](https://www.openstreetmap.org/way/1170380967) |
| Back Traverse to Lucky Shot | 蓝道 | 0.77 km | 113 m | [1170380978](https://www.openstreetmap.org/way/1170380978) |
| Berry Patch | 蓝道 | 0.23 km | 84 m | [1170385764](https://www.openstreetmap.org/way/1170385764) |
| Berry Patch Right | 蓝道 | 0.22 km | 96 m | [1170385765](https://www.openstreetmap.org/way/1170385765) |
| Big Shot | 黑道 | 0.39 km | 188 m | [1170380975](https://www.openstreetmap.org/way/1170380975) |
| Bill's Face | 蓝道 | 0.27 km | 62 m | [1170380976](https://www.openstreetmap.org/way/1170380976) |
| Blazing Elk | 黑道 | 0.27 km | 96 m | [129727068](https://www.openstreetmap.org/way/129727068) |
| Boondoggle | 黑道 | 0.48 km | 130 m | [1170380966](https://www.openstreetmap.org/way/1170380966) |
| Breakover | 黑道 | 0.33 km | 221 m | [1170420242](https://www.openstreetmap.org/way/1170420242) |
| Buck | 蓝道 | 0.14 km | 51 m | [1170380980](https://www.openstreetmap.org/way/1170380980) |
| Chappelle's | 蓝道 | 1.14 km | 249 m | [127126801](https://www.openstreetmap.org/way/127126801) |
| CMAC | 蓝道 | 0.53 km | 168 m | [1170380974](https://www.openstreetmap.org/way/1170380974) |
| Deer Fly | 黑道 | 0.64 km | 204 m | [270509646](https://www.openstreetmap.org/way/270509646) |
| Downhill | 蓝道 | 1.23 km | 299 m | [127126804](https://www.openstreetmap.org/way/127126804) |
| Easy Street | 绿道 | 0.21 km | 13 m | [129727066](https://www.openstreetmap.org/way/129727066) |
| Elevator Shaft | 黑道 | 0.09 km | 57 m | [1171733406](https://www.openstreetmap.org/way/1171733406) |
| Frisco | 黑道 | 0.14 km | 78 m | [270510637](https://www.openstreetmap.org/way/270510637) |
| Front Traverse | 蓝道 | 0.62 km | 101 m | [1171733408](https://www.openstreetmap.org/way/1171733408) |
| Gandy's Run | 蓝道 | 0.43 km | 113 m | [127128255](https://www.openstreetmap.org/way/127128255) |
| Glory Days | 黑道 | 0.24 km | 171 m | [1170413271](https://www.openstreetmap.org/way/1170413271) |
| Gold Hills | 蓝道 | 0.62 km | 177 m | [127128464](https://www.openstreetmap.org/way/127128464) |
| Greg's Gulch | 黑道 | 0.21 km | 101 m | [147773441](https://www.openstreetmap.org/way/147773441) |
| Grubstake | 黑道 | 0.61 km | 193 m | [127128257](https://www.openstreetmap.org/way/127128257) |
| Howeird's | 蓝道 | 0.17 km | 49 m | [1170380971](https://www.openstreetmap.org/way/1170380971) |
| Huckleberry | 蓝道 | 0.19 km | 49 m | [391399426](https://www.openstreetmap.org/way/391399426) |
| I-5 | 黑道 | 2.49 km | 342 m | [388926556](https://www.openstreetmap.org/way/388926556) |
| Jack's Cut | 蓝道 | 0.27 km | 68 m | [1170385768](https://www.openstreetmap.org/way/1170385768) |
| Jeremy's Road | 蓝道 | 0.48 km | 61 m | [1569896705](https://www.openstreetmap.org/way/1569896705) |
| Jump Hill | 蓝道 | 0.29 km | 73 m | [1338125308](https://www.openstreetmap.org/way/1338125308) |
| K2 | 黑道 | 0.18 km | 113 m | [147068126](https://www.openstreetmap.org/way/147068126) |
| Kelley's Gap Road | 蓝道 | 3.02 km | 442 m | [129729323](https://www.openstreetmap.org/way/129729323), [1457205131](https://www.openstreetmap.org/way/1457205131), [1457205130](https://www.openstreetmap.org/way/1457205130) |
| Last Scream | 黑道 | 0.15 km | 103 m | [1171733407](https://www.openstreetmap.org/way/1171733407) |
| Little Magoo | 蓝道 | 0.08 km | 8 m | [127126796](https://www.openstreetmap.org/way/127126796) |
| Little Portillo | 黑道 | 0.49 km | 109 m | [127128256](https://www.openstreetmap.org/way/127128256) |
| Little Shot | 蓝道 | 0.68 km | 126 m | [147068138](https://www.openstreetmap.org/way/147068138) |
| Lower Ferk's Run | 黑道 | 0.78 km | 246 m | [270509647](https://www.openstreetmap.org/way/270509647) |
| Lower Grub | 蓝道 | 0.30 km | 83 m | [1462496057](https://www.openstreetmap.org/way/1462496057) |
| Lower Magoo | 蓝道 | 0.36 km | 79 m | [1354789362](https://www.openstreetmap.org/way/1354789362) |
| Lower North | 黑道 | 0.75 km | 320 m | [388926565](https://www.openstreetmap.org/way/388926565) |
| Lower Otto Bahn | 黑道 | 0.83 km | 159 m | [1373900053](https://www.openstreetmap.org/way/1373900053) |
| Mel's Left | 蓝道 | 0.32 km | 90 m | [1170380969](https://www.openstreetmap.org/way/1170380969) |
| Mel's Right | 蓝道 | 0.16 km | 55 m | [1170380970](https://www.openstreetmap.org/way/1170380970) |
| Memorial Forest | 黑道 | 0.34 km | 197 m | [147773443](https://www.openstreetmap.org/way/147773443) |
| Middle Arwine's | 蓝道 | 0.24 km | 46 m | [1354789361](https://www.openstreetmap.org/way/1354789361) |
| Middle Ferk's Run | 黑道 | 0.53 km | 253 m | [127128253](https://www.openstreetmap.org/way/127128253) |
| Middle Sluiceway | 蓝道 | 0.06 km | 25 m | [1170385763](https://www.openstreetmap.org/way/1170385763) |
| Mr Magoo | 蓝道 | 0.61 km | 128 m | [127126794](https://www.openstreetmap.org/way/127126794) |
| Ms. Magoo | 蓝道 | 0.13 km | 48 m | [1370119185](https://www.openstreetmap.org/way/1370119185) |
| Northway Drainage | 黑道 | 1.38 km | 345 m | [129729321](https://www.openstreetmap.org/way/129729321), [1170413267](https://www.openstreetmap.org/way/1170413267) |
| Otto Bahn | 黑道 | 1.10 km | 211 m | [129727067](https://www.openstreetmap.org/way/129727067) |
| Paradise | 黑道 | 0.44 km | 165 m | [386367813](https://www.openstreetmap.org/way/386367813) |
| Pro Course | 蓝道 | 0.43 km | 135 m | [127128259](https://www.openstreetmap.org/way/127128259) |
| Quicksilver | 绿道 | 0.47 km | 124 m | [127128767](https://www.openstreetmap.org/way/127128767) |
| Rolling Knolls | 蓝道 | 0.57 km | 149 m | [127126799](https://www.openstreetmap.org/way/127126799) |
| Sheppard | 黑道 | 0.16 km | 80 m | [1170380981](https://www.openstreetmap.org/way/1170380981) |
| Side Burn | 蓝道 | 0.16 km | 29 m | [127126802](https://www.openstreetmap.org/way/127126802) |
| Sled Face | 黑道 | 0.17 km | 60 m | [1170380973](https://www.openstreetmap.org/way/1170380973) |
| Snorting Elk | 蓝道 | 0.54 km | 128 m | [1170380979](https://www.openstreetmap.org/way/1170380979) |
| Spook Hill | 黑道 | 0.18 km | 107 m | [386368121](https://www.openstreetmap.org/way/386368121) |
| Stockholder's | 黑道 | 0.13 km | 50 m | [1357541579](https://www.openstreetmap.org/way/1357541579) |
| Stump Farm | 蓝道 | 0.23 km | 61 m | [127126805](https://www.openstreetmap.org/way/127126805) |
| Sunnyside | 黑道 | 0.25 km | 168 m | [127128254](https://www.openstreetmap.org/way/127128254) |
| The Doors | 黑道 | 0.18 km | 136 m | [992447086](https://www.openstreetmap.org/way/992447086) |
| The Plunge | 黑道 | 0.19 km | 128 m | [1170380977](https://www.openstreetmap.org/way/1170380977) |
| Upper Arwine's | 蓝道 | 0.50 km | 109 m | [1170380968](https://www.openstreetmap.org/way/1170380968) |
| Upper Boondoggle. | 黑道 | 0.19 km | 49 m | [1357545511](https://www.openstreetmap.org/way/1357545511) |
| Upper Ferk's Run | 蓝道 | 0.55 km | 141 m | [127128247](https://www.openstreetmap.org/way/127128247) |
| Upper Northway | 黑道 | 0.49 km | 151 m | [1373900054](https://www.openstreetmap.org/way/1373900054) |
| Upper Otto Bahn | 黑道 | 0.71 km | 145 m | [1373900052](https://www.openstreetmap.org/way/1373900052) |
| Upper Sluiceway | 黑道 | 0.16 km | 65 m | [1170385762](https://www.openstreetmap.org/way/1170385762) |
| Wally's Way | 蓝道 | 0.19 km | 39 m | [127126791](https://www.openstreetmap.org/way/127126791) |
| West Face | 黑道 | 0.17 km | 83 m | [129729318](https://www.openstreetmap.org/way/129729318) |
| Whit's End | 黑道 | 0.25 km | 97 m | [1170413268](https://www.openstreetmap.org/way/1170413268) |
| Willie's Run | 黑道 | 0.22 km | 95 m | [1170380982](https://www.openstreetmap.org/way/1170380982) |
