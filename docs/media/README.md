# Project media

Current README media was recorded from the live game on November 6, 2026, with the gameplay content from commit `690c6f3` (Whistler maps, current skier, NPCs and scenery). It is actual WebGL rendering, with scripted controller inputs and staged starting positions; it is not recorded human play or a generated / pre-rendered gameplay scene.

| Asset | Content |
| --- | --- |
| `terrain-demo-current.mp4` | ~24 seconds, 1280×720, H.264 / 30 FPS encoding, silent; Crystal skiing → Whistler skiing → Crystal sunset overview |
| `current-crystal.png` | Current Green Valley skier / snow / scenery, extracted from the new capture |
| `current-whistler.png` | Current Harmony Ridge, with nearby NPCs and OSM-referenced scenery |
| `current-sunset.png` | Current Crystal sunset overview |
| `../../public/social-card.png` | Copy of `current-crystal.png`, used for link previews |

The edit uses two freshly recorded 24-second source clips: Crystal 0–10s, Whistler 6–15s, Crystal 19–24s. Stills are extracted without scene alterations. Encoding at 30 FPS does not establish a sustained game frame rate. The weather change and overview camera are scripted. Whistler's reference map is derived from OSM landcover; it is not satellite photography.

## Record again

Run `npm run dev`, open one of these development URLs at **1280×720**, wait for scene / NPC loading, then click **录制 24 秒实机 Demo**:

- `/?record-demo&route=green-valley`
- `/?record-demo&mountain=whistler&route=harmony-ridge`

The recorder downloads `terrain-crystal-current.webm` or `terrain-whistler-current.webm`. It captures the game canvas with minimal captions / telemetry, without the desktop or microphone. The intermediate WebM files are not committed. Recording controls are excluded from production builds.

Use FFmpeg to encode H.264 with `-pix_fmt yuv420p -r 30 -movflags +faststart -map_metadata -1 -an`. The source clips run in real time; the current edit uses cuts without speeding up playback. Asset attribution remains in [ASSETS.md](../ASSETS.md).

Older `crystal-demo.mp4`, `crystal-preview.gif`, `crystal-poster.png` and other historical screenshots remain in this folder as development records. They are no longer the README's featured video / preview. In particular, the old 20-second video predates the current character, NPC and Whistler updates.
