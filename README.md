# SKY SCOOTER — LOUFFI EDITION

Offline 3D magical scooter runner for Android WebView and desktop browsers. The existing rider, scooter, four-way joystick, Jump, braking and camera behavior remain intact. Package identity, scores, settings and save keys are preserved.

## Arcade colors and turbo effects

The visual pass from [`scooter2` commit 7f60b85](https://github.com/salahlouffidi/scooter2/commit/7f60b8529a1996285172cfa60cbdf55de853cafb) is adapted into the official game: richer city palettes, a subtle canvas color grade, a bold speed badge with turbo/downhill states, twin exhaust flames and a small rainbow star trail. Flames follow the scooter's lean and slope; pickup bursts retain their gold color and normal size. All particles reuse the existing fixed pool.

Low graphics disables the canvas filter and halves trail emission. Reduced Motion disables the flames, continuous trail and HUD pulse; pausing freezes the pulse. OS Reduced Motion also disables the HUD pulse. No additional GLB or runtime download is required.

## Antigravity and gliding

Collect the purple gyroscope for **eight seconds of antigravity**. It first appears around 61 metres in every city, then repeats along the safe pickup lane. The scooter hovers, its wheels fold sideways, and purple rings and sparkles show the active power. Gravity drops to 22% and steering becomes quicker.

Tap **Jump** (or Space) to launch; **hold it while descending to glide**. Release it to descend faster. The joystick and Jump track separate fingers, so steering continues during a glide. Cars remain solid and rooftops support the hovering scooter. The existing Sky Lift can run alongside antigravity. Expiry restores normal gravity without snapping an airborne rider to the ground.

The HUD shows the remaining time and a glide hint. Pause, menu Resume and saved-run recovery preserve the timer and height; switching apps releases held controls. Older saves still load normally. Low graphics reduces particles and Reduced Motion keeps a steady hover ring without continuous trails.

## Resume your run

Use **RESUME** in the pause screen, or **RESUME · world · distance** in the main menu. **NEW RUN**, Retry and selecting another round deliberately start a new run.

- Menu navigation saves the current position, height, velocity, score, hearts, combo, collected items, power-up timers, checkpoint, traffic motion time and ML window.
- Track generation restores each visible segment's RNG state and difficulty, then continues the same future sequence. Collected items and hit obstacles are preserved.
- Saves occur every two seconds of play and immediately on pause, menu, visibility loss, page exit and native Android background callbacks.
- Android mirrors the snapshot in private SharedPreferences. WebView reload or Activity recreation offers the saved run from the menu.
- Returning from another app stays paused. Only an explicit Resume starts the countdown. Backgrounding during a countdown cancels it.
- Completed or failed runs clear the snapshot; the existing transaction ID prevents duplicate wallet rewards.

## Solid traffic and rooftop jumps

Vehicle collision bounds come from the actual factory mesh. Physics uses substeps up to 1/120 second with swept lateral/forward checks and height-aware landing. A front or side hit blocks the scooter; invulnerability and shields do not let it pass through the vehicle. Jump above the roof to clear it or descend onto it, ride briefly on top, then drop back onto the road. A rooftop landing gives 50 points once per vehicle.

The four-way joystick remains: left/right steer, up accelerates, down brakes. Jump and the dedicated brake button remain available. Desktop: A/D or arrows, W/up, S/down, Space and Escape.

## Sixteen authored magical places

Each round has a distinct route surface, foreground silhouette, landmark family, lighting palette and gameplay profile. The repeated asphalt/shopfront layer has been removed.

| Round | Place | Main challenge |
| --- | --- | --- |
| 1 | Enchanted Garden | Gentle steering and simple obstacles |
| 2 | Golden Desert | Dunes and visible slowing sand patches |
| 3 | Giant Jungle | Fallen logs and winding paths |
| 4 | Mountain Pass | Narrow bridges and moving boulders |
| 5 | Waterfall Canyon | Marked jumps between ledges |
| 6 | Crystal Cavern | Crystal formations and moving obstacles |
| 7 | Frozen Glacier | Slippery steering on marked ice |
| 8 | Volcano Valley | Telegraphing lava hazards |
| 9 | Mushroom Forest | Bounce pads and aerial collectibles |
| 10 | Ancient Temple | Timed traps and stone platforms |
| 11 | Sunset Archipelago | Island crossings and landing accuracy |
| 12 | Clockwork Workshop | Moving machinery and timing |
| 13 | Storm Skyway | Bounded visible wind gusts |
| 14 | Moon Realm | Low-gravity jumps and floating rocks |
| 15 | Rainbow Rapids | Boost and glide combinations |
| 16 | Final Sky Arena | Fair combinations of learned challenges |

All rounds stay unlocked for testing. The continuous route remains authored and reachable; adaptive ML can only make bounded local adjustments inside each round's limits.

## Magic and adaptive difficulty

Gold stars give five-second turbo. Magic fruit gives ten seconds of turbo and two protected faults during that period. Sky Lift carries the rider above traffic and returns to the street. Wind and star particles are pooled; Reduced Motion reduces or disables continuous effects.

The local logistic model persists and chooses bounded difficulty for future segments. Its predicted clearance probability adjusts moving traffic and recovery pickup chances. It does not generate graphics or 3D models. Cold start and Adaptive OFF use fixed designer defaults. There are no cloud AI calls during gameplay.

## Assets and verification

The existing `models/louffi-world.glb` remains the single reusable Blender-compatible glTF asset for the rider and shared props. Magical scenery and route construction are generated from code. When layouts change, older active saves are deliberately migrated to the last safe checkpoint while scores, health, power-up inventory and run identity are preserved.

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
