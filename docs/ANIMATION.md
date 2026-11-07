# Character animation assets and authoring

## Current implementation

The native skeleton now has **18 authored ski clips** in `public/assets/skier-motion.json`: glide, tuck, left/right carve, double-pole push, left/right transition plants, edge release, terrain absorption, jump preload, air rise/float/prepare, soft/hard landing and fall brace/down/rise. Two retargeted CC0 visitor clips bring the total to 20. These are authored pose curves baked by `scripts/build-skier-motion.mjs`, not skiing motion capture. They still require visual / artistic review against reference footage.

The relaxed stance has ankle/knee flexion, forward hands and a small hip hinge. Carves shift the hips into the turn and lengthen the outside leg relative to the inside leg. Edge release briefly unloads the old stance. The existing travel-aware upper-body counter rotation remains: traverses and uphill travel do not force the shoulders toward the fall line.

`SkierMotion` uses Three.js AnimationMixer with continuous weights. Left/right point-plant clips affect one arm additively at the existing linked-turn transition timing. Double-pole strokes, visitor footsteps and landing clips follow event / physics phase rather than independent looping timers. Pole contact selects a feasible point on the fixed-length pole sphere; unreachable moving contacts release without pulling the hand.

Manual jumps buffer a tap through a 100ms preload before applying the same pop impulse. Rising, floating and landing preparation blend by flight age, descent and actual snow clearance. This does not increase the jump impulse or horizontal momentum. Landing animation strength uses normal impact speed and has its own 0.55–0.75s recovery clock, separate from landing judgement and steering recovery. Existing crash phases drive brace, down, rise and return-to-glide poses for the player and skiing NPCs.

A ski-length terrain curvature estimate drives bounded, damped absorption without changing the physics trajectory or creating automatic jumps. Grounded foot IK corrects at most 6.5cm toward the snow target and preserves the authored knee bend plane. It does not replace air / fall leg poses. Air / fall skis follow the final animated boots. Clip-to-procedural grab and ride transitions blend for 0.2s; their snapshots are allocated once and only copied during transitions. Seated / prop-holding visitors and grabs retain specialized procedural poses.

Elbow orientation uses an explicit bend-plane frame shared by the upper arm and forearm, avoiding near-collinear references and independent shortest-rotation forearm twists. Hands remain shoulder-relative with bounded reach and wrist rotation. The bake tests reject adjacent-frame flips. Duplicate keys in held poses are removed, reducing the expanded library to about 524KiB uncompressed.

## Free assets checked

- [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library): the downloaded Standard archive contains 43 clips and a CC0 license. It includes locomotion, idle, sitting and other general actions; **it does not include skiing**. The current game uses retargeted `Walk_Loop` and `Idle_Loop` for eligible non-seated visitors without hand props. Only those two derived clips are bundled; the 15MB archive and source skeleton remain outside the repository. The included license is `public/assets/QUATERNIUS-ANIMATION-LICENSE.txt`.
- [Quaternius Universal Base Characters](https://quaternius.com/): the current character already derives from this author's CC0 base skeleton. The animation pack uses similar bone names, but proportions / bind rotations differ, so names alone are insufficient for direct playback.
- [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html): Adobe documents free access with an Adobe ID and royalty-free use in games. It is not a CC0 asset library; raw-asset redistribution into an open source repository needs a separate license check. No Mixamo account, upload or asset has been used here. No suitable free Mixamo downhill-ski set was verified.

The two bundled Quaternius clips are retargeted using bind-relative local rotation deltas. Only pelvis translation is retained / scaled to the target bind height; child translations and root travel are removed so limb lengths and game movement remain controlled by the current skeleton / simulation.

## Rebuild and edit

Download the free Standard package from the author's page and use its **non-root-motion** `Unreal-Godot/UAL1_Standard.glb`:

```sh
node scripts/build-skier-motion.mjs /path/to/UAL1_Standard.glb
```

To also export the complete current skier with all twenty clips for inspection / editing in Blender:

```sh
node scripts/build-skier-motion.mjs /path/to/UAL1_Standard.glb --preview /path/to/skier-animated-preview.glb
```

The preview omits runtime procedural fabric textures and is not a screenshot of the game renderer. GLB import exposes the named animation clips; further keyframe edits can be exported as glTF/GLB and retargeted back to the same native bone names. Keep root translation separate from physics motion, maintain loop seams and preserve the anatomical elbow / wrist bounds. The runtime motion JSON is ~524KiB uncompressed and is fetched / parsed once; actors share immutable clips with independent mixers.

No browser regression testing or visual-quality approval was performed in this iteration. Numeric continuity / rig tests establish constraints and integration, not professional animation quality.

## Palm grip attachment correction

Pole shafts now begin at a native hand-local palm socket between the thumb and finger bases, rather than the wrist origin. A visible rubber handle surrounds the socket. `syncHandPoles` runs after player transition blending and after every rendered NPC bone interpolation; deferred target poses do not update equipment. Snow contact projects from the final palm grip, preserves shaft length and never moves the hand to meet a pole. A per-contact identifier prevents repeated projection during NPC interpolation. Tuck / stroke hand offsets keep both hands on their own sides with forward-facing fingers.

### Outward elbow constraint

The previous loose elbow reference collapsed toward the torso during the rear half of the pole stroke. Ski arms now choose the elbow lateral coordinate directly on the exact two-bone joint circle in the moving chest frame. This retains segment lengths and hand targets while keeping a stable outward / rearward bend branch. Clips are rebuilt with the same solver; a bounded runtime check corrects inward elbows caused by clip blending. Walking, grab and fall IK retain their specialized poses. Palm attachments still run after the final rendered pose.
