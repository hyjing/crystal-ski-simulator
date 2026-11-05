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
- Disable peripheral blur by default. When blur has zero strength, bypass the entire post-processing chain. The user can still enable it.
- FPS tooltip now includes raw frame interval P95, maximum interval, count of intervals >25 ms, CPU powder / physics time and raster scale. Unlike average FPS, this can expose brief hitches.

## Reproduce CPU update measurement

```sh
npm run bench:powder
```

One local run after optimization reported an initial empty-window update of 0.20 ms, moving-window updates averaging 2.67 ms (maximum 4.44 ms), and ordinary updates averaging 0.32 ms. Numbers vary with JIT warm-up and the host. This benchmark excludes construction / initial loading, GPU execution, rendering and driver uploads.

The test suite checks quick engagement / reversal, released-input pivot, unchanged vertex-buffer versions across rebases, and preservation of powder imprints across rolling texture windows. Route traversal continues to pass on both packed and powder snow.

A short 1280 × 900 browser trial reported a P95 frame interval around 18.5 ms, maximum 18.7 ms and no >25 ms intervals in the observed sample after automatic raster adjustment. This is a small observation under browser automation, not a sustained benchmark or an input-to-photon latency measurement.
