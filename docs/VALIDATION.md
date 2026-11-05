# Validation — v0.1

## Automated

`npm test` covers projected downhill gravity, flat-ground rest, braking, mirrored steering, snow drag, numerical stability, route projection, elevation-grid integrity, and route completion.

The route regression uses bounded steering and braking through the same physics controller as the app. All checkpoints must be reached sequentially within four simulated minutes. On the included DEM, packed-snow runs complete in approximately:

| Prototype route | Controller time |
| --- | --- |
| Ridge to Valley | 144 seconds |
| Open Bowl | 119 seconds |
| Lower Traverse | 80 seconds |

This checks terrain traversability with the simplified controller. It does not establish official trail alignment, beginner usability, collision-free traversal away from the reference corridor, or a full browser-session completion.

`npm run build` produces the static application. The renderer bundle includes Three.js; no terrain API is contacted during play.

## Interactive browser checks

- DEM loads and renders in WebGL.
- Starting a session changes the route panel to live telemetry.
- Unbraked motion increases speed and lowers elevation.
- Holding Space reduces speed substantially.
- Turning responds to keyboard input.
- R resets to the current checkpoint and updates elevation / position.
- Follow / overview switching changes the camera mode.
- Pause opens the session dialog.

No sustained frame-rate benchmark on named hardware has been performed.
