# Character animation assets and authoring

## Current implementation

The player now has seven named full-body / upper-body ski clips in `public/assets/skier-motion.json`: `ski-glide`, `ski-tuck`, `ski-carve-left`, `ski-carve-right`, `ski-pole-push`, `ski-plant-left`, `ski-plant-right`. These are authored pose curves baked onto the native skeleton by `scripts/build-skier-motion.mjs`, not skiing motion capture or a purchased animation pack. They are a first animation baseline and still require artistic review / refinement.

`SkierMotion` plays the clips with Three.js AnimationMixer. Tuck, edge and pole inputs control smoothly blended weights. Stroke phase follows the physics pole cycle; the corresponding single-arm point-plant clip is additive and follows the existing linked-turn timing. Terrain / ski contact is corrected after the base animation. Falls, airborne tricks, seated / prop-holding visitors and special contact cases retain procedural behavior; this is not a complete animation replacement for every game state.

Elbow orientation uses an explicit bend-plane frame shared by the upper arm and forearm. A stable outside bend reference avoids the near-collinear elbow reference and independent shortest-rotation twists that produced abrupt forearm motion in the old pose generator. The bake tests reject large adjacent-frame rotations.

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

To also export the complete current skier with all nine clips for inspection / editing in Blender:

```sh
node scripts/build-skier-motion.mjs /path/to/UAL1_Standard.glb --preview /path/to/skier-animated-preview.glb
```

The preview omits runtime procedural fabric textures and is not a screenshot of the game renderer. GLB import exposes the named animation clips; further keyframe edits can be exported as glTF/GLB and retargeted back to the same native bone names. Keep root translation separate from physics motion, maintain loop seams and preserve the anatomical elbow / wrist bounds. The runtime motion JSON is ~807KiB uncompressed and is fetched / parsed once; actors share immutable clips with independent mixers.

No browser regression testing or visual-quality approval was performed in this iteration. Numeric continuity / rig tests establish constraints and integration, not professional animation quality.
