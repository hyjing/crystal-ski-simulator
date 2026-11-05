# README media

All gameplay imagery here was captured from this repository's live browser build, version 0.3.1. It is not a pre-rendered simulation or generated gameplay scene. The demo uses scripted analog steering inputs through the same `stepSkier` controller, with the live terrain renderer and powder deformation.

| Asset | Purpose |
| --- | --- |
| `crystal-demo.mp4` | ~20 s, 1280 × 720, H.264, 30 FPS, silent |
| `crystal-preview.gif` | 6 s excerpt, 640 × 360, 10 FPS, looping README preview |
| `crystal-poster.png` | Title frame from the actual capture |
| `crystal-powder.jpg` | Gameplay frame with powder and aerial minimap |
| `crystal-resort.jpg` | Overview frame showing terrain / resort layout |

## Record again

```sh
npm run dev
```

Open `http://127.0.0.1:5173/?record-demo` in a browser at 1280 × 720, then click **录制 20 秒实机 Demo**. The development-only recorder captures the game's WebGL canvas into a clean 2D composite with captions and live telemetry, then downloads `crystal-terrain-demo.webm`. No desktop / microphone recording permission is used. The recorder is excluded from production builds.

The first 2.2 seconds show the terrain; the next section runs the ski controller; the final 3.5 seconds use the overview camera. Inputs are automated for repeatability, not recorded human play. Wall-clock capture runs at real time.

## Encode

Requires FFmpeg:

```sh
ffmpeg -i crystal-terrain-demo.webm -c:v libx264 -preset medium -crf 22 \
  -pix_fmt yuv420p -r 30 -movflags +faststart -an crystal-demo.mp4

ffmpeg -ss 6 -t 6 -i crystal-demo.mp4 \
  -filter_complex 'fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle' \
  -loop 0 crystal-preview.gif
```

The README uses GIF for a reliable inline animation and links the full MP4 separately. Media files stay in the repository so they do not depend on an external video host. The source WebM is an intermediate and is not committed.

Elevation, map and generated-asset attribution remains in [ASSETS.md](../ASSETS.md). © OpenStreetMap contributors; USGS / USDA NAIP.

`crystal-rainier.png` is an additional live browser screenshot of the later distant-scenery update. It is not part of the original v0.3.1 video; that video remains a record of the previous build.
