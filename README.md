# LOUFFI CITY RUSH — LOUFFI EDITION

Offline 3D scooter runner for Android WebView and desktop browsers. The launcher label, menu, intro and translations now use **LOUFFI CITY RUSH**. Package identity and existing save keys are preserved, so the rename does not reset scores or settings.

## Arcade colors and turbo effects

The visual pass from [`scooter2` commit 7f60b85](https://github.com/salahlouffidi/scooter2/commit/7f60b8529a1996285172cfa60cbdf55de853cafb) is adapted into the official game: richer city palettes, a subtle canvas color grade, a bold speed badge with turbo/downhill states, twin exhaust flames and a small rainbow star trail. Flames follow the scooter's lean and slope; pickup bursts retain their gold color and normal size. All particles reuse the existing fixed pool.

Low graphics disables the canvas filter and halves trail emission. Reduced Motion disables the flames, continuous trail and HUD pulse; pausing freezes the pulse. OS Reduced Motion also disables the HUD pulse. No additional GLB or runtime download is required.

## Antigravity and gliding

Collect the purple gyroscope for **eight seconds of antigravity**. It first appears around 61 metres in every city, then repeats along the safe pickup lane. The scooter hovers, its wheels fold sideways, and purple rings and sparkles show the active power. Gravity drops to 22% and steering becomes quicker.

Tap **Jump** (or Space) to launch; **hold it while descending to glide**. Release it to descend faster. The joystick and Jump track separate fingers, so steering continues during a glide. Cars remain solid and rooftops support the hovering scooter. The existing Sky Lift can run alongside antigravity. Expiry restores normal gravity without snapping an airborne rider to the ground.

The HUD shows the remaining time and a glide hint. Pause, menu Resume and saved-run recovery preserve the timer and height; switching apps releases held controls. Older saves still load normally. Low graphics reduces particles and Reduced Motion keeps a steady hover ring without continuous trails.

## Resume your run

Use **RESUME** in the pause screen, or **RESUME · city · distance** in the main menu. **NEW RUN**, Retry and selecting another round deliberately start a new run.

- Menu navigation saves the current position, height, velocity, score, hearts, combo, collected items, power-up timers, checkpoint, traffic motion time and ML window.
- Track generation restores each visible segment's RNG state and difficulty, then continues the same future sequence. Collected items and hit obstacles are preserved.
- Saves occur every two seconds of play and immediately on pause, menu, visibility loss, page exit and native Android background callbacks.
- Android mirrors the snapshot in private SharedPreferences. WebView reload or Activity recreation offers the saved run from the menu.
- Returning from another app stays paused. Only an explicit Resume starts the countdown. Backgrounding during a countdown cancels it.
- Completed or failed runs clear the snapshot; the existing transaction ID prevents duplicate wallet rewards.

## Solid traffic and rooftop jumps

Vehicle collision bounds come from the actual factory mesh. Physics uses substeps up to 1/120 second with swept lateral/forward checks and height-aware landing. A front or side hit blocks the scooter; invulnerability and shields do not let it pass through the vehicle. Jump above the roof to clear it or descend onto it, ride briefly on top, then drop back onto the road. A rooftop landing gives 50 points once per vehicle.

The four-way joystick remains: left/right steer, up accelerates, down brakes. Jump and the dedicated brake button remain available. Desktop: A/D or arrows, W/up, S/down, Space and Escape.

## Sixteen city districts

`cityArt.js` builds cached architecture and merges it by material. Streets now have textured asphalt, lane markings, broad sidewalks, shopfront glass, awnings, balconies, lamps, crosswalks, traffic signals, trees, layered skyline blocks and authored landmarks. Beveled traffic meshes have bumpers, lights, mirrors and wheel hubs. The sky supplies a generated environment reflection map for glass and metal; the renderer uses tone mapping, fog and shadow mapping. These are original stylized city assets, with magical elements above the urban route.

| Round | City | Street and skyline cues |
| --- | --- | --- |
| 1 | Kyoto | Tea shops, lanterns, cherry trees, pagoda roofs and torii |
| 2 | London | Brick terraces, red phone boxes, red buses, clock tower |
| 3 | Singapore | Garden storefronts, palms, elevated skypark towers |
| 4 | Vancouver | Glass buildings, coffee shops, observation tower |
| 5 | Marrakech | Terracotta markets, striped awnings, minarets |
| 6 | Prague | Gabled houses and gothic twin towers |
| 7 | Sapporo | Snow roofs, ramen shops and winter pagoda |
| 8 | Rio de Janeiro | Pastel shops, palms and a hilltop landmark |
| 9 | Tokyo | Neon storefronts, tall signs and illuminated towers |
| 10 | Amsterdam | Gabled canal houses, bicycles and windmill |
| 11 | New York | Deli shops, taxis and stepped skyscraper |
| 12 | Naples | Balconies, gelato shops, coastal towers and distant volcano |
| 13 | Paris | Mansard roofs, boulangeries, iron balconies and Eiffel-inspired tower |
| 14 | Istanbul | Bazaar frontage, domes and minarets |
| 15 | Barcelona | Mosaic details, balconies and sculptural spires |
| 16 | LOUFFI City | Festive world-city shops, towers and golden ring |

All rounds stay unlocked for testing. Street gameplay follows the continuous runner route; intersections are scenery, not branching navigation.

## Magic and adaptive difficulty

Gold stars give five-second turbo. Magic fruit gives ten seconds of turbo and two protected faults during that period. Sky Lift carries the rider above traffic and returns to the street. Wind and star particles are pooled; Reduced Motion reduces or disables continuous effects.

The local logistic model persists and chooses bounded difficulty for future segments. Its predicted clearance probability adjusts moving traffic and recovery pickup chances. It does not generate graphics or 3D models. Cold start and Adaptive OFF use fixed designer defaults. There are no cloud AI calls during gameplay.

## Assets and verification

The existing `models/louffi-world.glb` remains the single reusable Blender-compatible glTF asset for the rider and shared props. City architecture is generated from code. The bundled loader supports the static uncompressed format produced by `tools/build-visual-kit.cjs`.

Serve `app/src/main/assets/game` with a local HTTP server. Run:

```sh
node tools/verify-game.cjs
node tools/resume-physics.cjs
node tools/verify-antigravity.cjs
node tools/browser-smoke.cjs
node tools/session-browser.cjs
node tools/antigravity-browser.cjs
node tools/biome-preview.cjs
```

Browser scripts require Playwright and Chromium; set `CHROMIUM_EXECUTABLE_PATH` for an installed browser. They test controls and GLB loading, menu/app-switch/reload resume, all 16 city districts, finite transforms and rendering errors. The physics test covers solid bodies, rooftop landings, steering escape, turbo sweeps and exact track/RNG restoration. Preview images are actual game renders.

`npm test` runs the game, collision/resume and antigravity physics checks. `npm run test:antigravity:browser` checks two simultaneous touch pointers, hold/release gliding, keyboard repeat, cancellation, app-switch pausing, purple effects and phone HUD layout.

This is a Three.js mobile visual upgrade, not a PS5-class renderer. Real Android frame rate, memory pressure recovery and native Activity lifecycle still require device testing. No signed APK/AAB is included in this commit.
