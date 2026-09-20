# SKY SCOOTER — LOUFFI EDITION

Android WebView + offline Three.js scooter runner. This update adds a reference-inspired warm stone bridge, wooden rails, a rounded helmeted rider, blue scooter, floating islands, leafy trees, castle towers, clouds and waterfalls. It is original stylized geometry, not an exact reconstruction of the reference illustration.

## Painterly summer pass

Inspired by a cozy painterly delivery-game clip, the road now carries small-town summer details: white picket fence sections, flower tufts on the rails, black lamp posts with warm glowing heads, and broadleaf canopy trees that lean over the road and dapple it with shadow. The sky gained larger cumulus clouds, a hazy horizon cloud bank and a warm painterly glow near the horizon, with a slightly warmer sun. All charm props are instanced per segment and recycle with the track; the CPU and browser smoke tests still pass.

## Sixteen magical environments

Every round now selects its own cached scenery geometry, nearby landmarks, distant skyline, road materials and rails. `js/biomeArt.js` builds original theme assets and merges static geometry by material before cloning them. The existing single GLB still supplies the rider, scooter and shared gameplay props.

| Round | World scenery |
| --- | --- |
| 1 | Flower gardens, pink arches and round trees |
| 2 | Lavender-roofed castles and stone battlements |
| 3 | Turquoise waterfalls and tall floating mesas |
| 4 | Giant forest trees, pink mushrooms and fireflies |
| 5 | Sandstone pyramids and glowing oasis ruins |
| 6 | Lavender/cyan crystals and cave arches |
| 7 | Snowy peaks, frosted pines and snowmen |
| 8 | Floating sailboats and sunset lighthouses |
| 9 | Pastel neon towers, glowing windows and rings |
| 10 | Golden gears, mint cranes and toy factories |
| 11 | Lilac clouds and steady lightning sculptures |
| 12 | Peach-glowing volcanoes and gentle magic embers |
| 13 | Moon rings and luminous mushroom gardens |
| 14 | Blue citadels, lavender banners and columns |
| 15 | Layered rainbow arches and pink cloud islands |
| 16 | Golden palaces, pink flags and sky portals |

Floating light crystals move gently beside the road; Reduced Motion freezes their animation. Only Moon Garden and Neon Skyline use night lighting, with enough fill light to keep the roadway readable. No flashing lightning is used. The How to Play panel is unchanged.

Run `node tools/biome-preview.cjs` with Playwright and Chromium to render all 16 worlds, check theme resets and low-quality visibility, and regenerate `docs/worlds-overview.png`. These are actual game screenshots. The CPU test checks that all 16 worlds have distinct geometry and matching road colors. Browser smoke also verifies the existing controls and round access. Android device performance has not been measured.

## Arcade test update

All 16 campaign rounds are selectable immediately, including on existing saves. Scores, stars and normal campaign progress are preserved; test access is controlled by `ScooterTuning.testAllRounds` in `js/arcadeEffects.js`. The Play button still starts your current campaign round.

- Cruise speed increased by 25%; steering now targets 9 m/s with rapid reversal and release damping. Brake reduces the capped target speed to 65%, including during turbo. Pointer capture keeps touch controls working when your finger leaves a button.
- The bridge has continuous hills (9 m peak-to-valley over 190 m). Descents add up to 4.5 m/s. Road tiles, rails, collectibles, obstacles, finish gate and rider follow the surface, and the camera looks along the slope.
- Gold star pickups activate five seconds of 1.55× turbo, capped at 28 m/s (about 101 km/h). A guaranteed star appears at 31 m, then every 96 m outside gap sections. Coins and gems emit gold stars; turbo leaves a star trail, while wind streaks intensify downhill and during boost.
- A speed/status HUD distinguishes cruise, downhill rush and star turbo. Two pooled effect draw calls keep particle counts bounded. Reduced Motion disables wind streaks, continuous turbo stars and FOV changes, and reduces pickup bursts; Low quality uses fewer wind lines.
- Route validation uses the new maximum speed and steering limit. Swept pickup height is relative to the sloping road. Distant sky towers now have valid placement data, and round changes reset clouds and reapply graphics quality.

Validation: CPU checks cover all 16 generators, quick steering/reversal/release, downhill acceleration, turbo/brake behavior, pickups on slopes, pooled effects and Reduced Motion, in addition to existing GLB/jump/ML tests. Browser smoke checks fresh/existing-save round access, starts round 16, checks controls and turbo rendering, and captures `docs/gameplay.png`. Android device performance still needs testing.

## Sky & lighting polish

`js/skyAtmosphere.js` adds a camera-following gradient sky dome, a world-space sun/moon glow sprite, canvas stars for night rounds, drifting cloud sprites and distant recycled floating islands. `game.js` applies per-round atmosphere: fog density, hemisphere and directional light color/intensity, and tone-mapping exposure are derived from each round's `skyColor`, `fogColor`, `ambientLight` and `theme` (night, warm sunset, storm, and default day). The sky respects the graphics quality setting — low quality hides clouds and distant islands, keeping only the dome, sun and stars.

## One reusable Blender-compatible asset file

`app/src/main/assets/game/models/louffi-world.glb` is a real binary glTF 2.0 asset containing named RiderScooter, Island, Castle, Tree, Cloud, Waterfall and Crate groups. In Blender use **File → Import → glTF 2.0** to edit it. There are not sixteen duplicate level files. The game loads and clones these shared assets. This is a GLB, not a native `.blend` project.

`node tools/build-visual-kit.cjs` rebuilds the asset deterministically from `visualKit.js` using the bundled Three.js, without downloading packages. `kitLoader.js` supports the uncompressed static mesh/material/TRS subset emitted by that builder; it is not a general-purpose glTF loader. Blender exports with textures, skins or compression require a full GLTFLoader integration. Android reads the single fixed bundled asset through the existing bridge; web previews use fetch. If loading fails the same original procedural kit is used and the console records that fallback.

## Run and verify

Serve `app/src/main/assets/game` with a local HTTP server, for example `python -m http.server 8765 --directory app/src/main/assets/game`. Open localhost:8765. Touch joystick steers; right buttons jump/brake. Desktop A/D or arrows, Space, S/down, Escape. Android requests landscape orientation.

Run `node tools/verify-game.cjs`. It checks real GLB parsing and geometry, all sixteen round generators, bounded active objects, short-gap jump physics, applied difficulty parameters, ML weight changes, persistence and adaptive OFF. These CPU checks do not establish Android frame rate or visual quality on a device.

`node tools/browser-smoke.cjs` runs a real headless-browser pass (Playwright, now a devDependency): it loads the GLB, plays, steers, jumps, pauses/resumes, and asserts no page errors. Set `CHROMIUM_EXECUTABLE_PATH` to use a system Chrome/Edge instead of downloading browsers.

Open the Android project in Android Studio to build/test on a device. This change does not include a signed release APK/AAB.

## Gameplay corrections

- Full-width gap hazards are 2.4m instead of the previous ~20m. Concrete lane layouts are checked before placing obstacles, using steering limits and actual jump constants. This is a conservative validator for the present static obstacles, not a proof for future moving hazards.
- Difficulty selection changes the density of new, unseen segments. Their speed multiplier takes effect when the rider enters that segment; already visible obstacle positions do not move.
- Model weights and the bounded example buffer persist. Cold start uses fixed designer difficulty until sufficient success/failure examples exist. Features use current segment parameters rather than treating an unplayed future candidate as the current experience. Personal-model efficacy still needs playtesting; the target probability is not a measured success guarantee.
- Collection checks use lane coordinates consistently; stars count spawned coins. Checkpoint reconstruction remembers collected IDs.

## Limits and follow-up

The existing sixteen rounds remain configuration-driven. Each round now has its own scenery geometry and palette while sharing the runner mechanics. The decorative waterfalls are static stylized meshes. Physics still uses the existing capped variable timestep. Moving hazards, richer animations, more biome-specific assets, broad device testing and statistical evaluation of adaptation remain future work. No cloud AI calls occur during gameplay.

