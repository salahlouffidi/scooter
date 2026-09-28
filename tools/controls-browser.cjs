// Real-browser tests for the touch/tilt/keyboard/gamepad input layer and haptics.
// Uses CDP touch events so the pointer path matches an Android WebView.
const {chromium} = require('playwright'), http = require('node:http'), fs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets/game');
const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (±${eps})`);

(async () => {
  const server = http.createServer((q, r) => {
    try {
      const f = path.join(root, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
      r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      r.end(fs.readFileSync(f));
    } catch { r.statusCode = 404; r.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r)); let browser;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport: {width: 844, height: 390}, hasTouch: true});
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.gameInstance?.state === 'MENU');
    await page.evaluate(() => {
      const g = gameInstance; g.startRound(1); g.cancelCountdown(); g.state = 'PLAYING'; g.hideAllScreens();
      document.getElementById('gameplay-hud').classList.remove('hidden'); g.input.resetAll();
      // Freeze the simulation so only the input layer is under test.
      g.loop = () => {}; window.__raf = window.requestAnimationFrame; g.lastTime = performance.now();
    });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts});
    const input = expr => page.evaluate(`(() => { const i = gameInstance.input; return ${expr}; })()`);
    const settings = patch => page.evaluate(p => { const s = {...GameStorage.getSettings(), ...p}; GameStorage.saveSettings(s); gameInstance.input.applySettings(s); }, patch);
    const expo = (v, dead, e) => { const a = Math.abs(v); if (a <= dead) return 0; const t = Math.min(1, (a - dead) / (0.94 - dead)); return Math.sign(v) * ((1 - e) * t + e * t * t * t); };

    await settings({controlScheme: 'floating', stickSize: 1, steeringSensitivity: 1, leftHanded: false});
    const R = await input('i.radius');
    const zone = await page.locator('#joystick-zone').boundingBox();
    assert(zone.x <= 1 && zone.width > 300 && zone.height > 200, 'floating zone covers the left half');
    const start = {id: 1, x: 170, y: 250};

    // ---- 1. Floating base appears under the thumb ----
    await touch('touchStart', [start]);
    await page.waitForFunction(() => document.getElementById('joystick-zone').classList.contains('active'));
    const base = await page.locator('#joystick-base').boundingBox();
    near(base.x + base.width / 2, start.x, 3, 'base centred under thumb (x)'); near(base.y + base.height / 2, start.y, 3, 'base centred under thumb (y)');
    assert.equal(await input('i.horizontalSteer'), 0, 'no steering before movement');

    // ---- 2. Response curve: dead zone, fine control near centre, full at the rim ----
    const steer = async dx => { start.x = 170 + dx; await touch('touchMove', [start]); return input('i.horizontalSteer'); };
    const expoV = await input('i.expo'), deadX = await input('i.deadX');
    assert.equal(await steer(R * 0.04), 0, 'inside dead zone');
    const fine = await steer(R * 0.3);
    near(fine, expo(0.3, deadX, expoV), 0.02, 'curve at 30% deflection');
    assert(fine < 0.3, 'expo gives finer control than linear near the centre');
    near(await steer(R * 0.6), expo(0.6, deadX, expoV), 0.02, 'curve at 60% deflection');
    near(await steer(R * 0.97), 1, 0.001, 'full steering slightly before the rim');
    assert(await steer(-R * 0.6) < 0, 'left is negative'); start.x = 170;
    console.log('PASS floating stick placement, dead zone and expo response curve');

    // ---- 3. Vertical axis: larger dead zone prevents accidental acceleration/braking ----
    start.x = 170; start.y = 250 - R * 0.15; await touch('touchMove', [start]);
    assert.equal(await input('i.verticalSteer'), 0, 'slight upward drift is ignored');
    start.y = 250 - R * 0.8; await touch('touchMove', [start]);
    assert(await input('i.verticalSteer') > 0.5, 'pushing up accelerates');
    start.y = 250 + R * 0.9; await touch('touchMove', [start]);
    assert(await input('i.verticalSteer') < -0.5 && await input('i.isBraking'), 'pulling down brakes');
    assert.equal(await page.locator('#joystick-zone').getAttribute('data-dir'), 'down');

    // ---- 4. Follow-the-thumb: overshooting drags the base instead of drifting away ----
    start.x = 170; start.y = 250; await touch('touchMove', [start]);
    const before = await page.locator('#joystick-base').boundingBox();
    start.x = 170 + R * 2.6; await touch('touchMove', [start]);
    const after = await page.locator('#joystick-base').boundingBox();
    assert(after.x > before.x + R, 'base follows an overshooting thumb');
    assert(await input('Math.hypot(i.thumbX, i.thumbY) <= i.radius + 0.01'), 'thumb is clamped to the rim');
    near(await input('i.horizontalSteer'), 1, 0.001, 'full deflection while following');
    await touch('touchEnd', []);
    await page.waitForFunction(() => !gameInstance.input.joystickPointerId && !document.getElementById('joystick-zone').classList.contains('active'));
    assert.equal(await input('i.horizontalSteer'), 0); assert.equal(await input('i.verticalSteer'), 0);
    console.log('PASS vertical dead zone, braking, follow-the-thumb and release');

    // ---- 5. Right-hand jump zone: tap anywhere; brake never jumps; hold = glide input ----
    const jz = await page.locator('#jump-zone').boundingBox(), jump = await page.locator('#btn-jump').boundingBox(), brake = await page.locator('#btn-brake').boundingBox();
    const empty = {id: 2, x: jz.x + jz.width * 0.35, y: jz.y + jz.height * 0.3};
    assert(!(empty.x > jump.x && empty.x < jump.x + jump.width && empty.y > jump.y && empty.y < jump.y + jump.height), 'test point is away from the button');
    await touch('touchStart', [empty]);
    await page.waitForFunction(() => gameInstance.input.isJumpHeld && gameInstance.input.jumpBufferTimer > 0);
    assert(await page.locator('#btn-jump').evaluate(e => e.classList.contains('pressed')), 'button shows pressed state for zone taps');
    await touch('touchEnd', []);
    await page.waitForFunction(() => !gameInstance.input.isJumpHeld);
    await page.evaluate(() => gameInstance.input.consumeJump());
    const brakePt = {id: 3, x: brake.x + brake.width / 2, y: brake.y + brake.height / 2};
    await touch('touchStart', [brakePt]);
    await page.waitForFunction(() => gameInstance.input.isBraking);
    assert.equal(await input('i.isJumpHeld'), false, 'brake press does not jump'); assert.equal(await input('i.jumpBufferTimer'), 0);
    await touch('touchEnd', []);
    await page.waitForFunction(() => !gameInstance.input.isBraking);
    console.log('PASS jump anywhere on the right, brake isolation, pressed feedback');

    // ---- 6. Fixed scheme + left-handed layout ----
    await settings({controlScheme: 'fixed'});
    const fixedZone = await page.locator('#joystick-zone').boundingBox();
    assert(fixedZone.width < 300, 'fixed stick uses a compact touch zone');
    const fb = await page.locator('#joystick-base').boundingBox();
    await page.waitForFunction(() => +getComputedStyle(document.getElementById('joystick-base')).opacity > 0.5, null, {timeout: 3000}); // fixed base is always visible (fades in)
    await touch('touchStart', [{id: 4, x: fb.x + fb.width / 2, y: fb.y + fb.height / 2}]);
    await touch('touchMove', [{id: 4, x: fb.x + fb.width / 2 - R, y: fb.y + fb.height / 2}]);
    assert(await input('i.horizontalSteer') < -0.9, 'fixed stick steers from the visible base');
    await touch('touchEnd', []);
    await settings({controlScheme: 'floating', leftHanded: true});
    const lz = await page.locator('#joystick-zone').boundingBox(), rz = await page.locator('#jump-zone').boundingBox();
    assert(lz.x > rz.x, 'left-handed layout swaps the stick and jump sides');
    await settings({leftHanded: false, stickSize: 1.4});
    assert(await input('i.radius') > R * 1.3, 'stick size setting scales the travel radius');
    await settings({stickSize: 1});
    console.log('PASS fixed stick, left-handed layout and stick size');

    // ---- 7. Tilt steering (steering-wheel style), both landscape orientations ----
    await settings({controlScheme: 'tilt', tiltSensitivity: 1});
    const motion = (dx, dy) => page.evaluate(([x, y]) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', {accelerationIncludingGravity: {x, y, z: 0.5}})), [dx, dy]);
    const roll = (deg, variant) => { const t = deg * Math.PI / 180; return variant === 'A' ? [9.8 * Math.cos(t), 9.8 * Math.sin(t)] : [-9.8 * Math.cos(t), -9.8 * Math.sin(t)]; };
    for (const variant of ['A', 'B']) {
      await page.evaluate(() => gameInstance.input.calibrateTilt());
      await motion(...roll(0, variant));
      for (let i = 0; i < 12; i++) await motion(...roll(0, variant));
      assert.equal(await input('i.horizontalSteer'), 0, `neutral pose steers straight (${variant})`);
      for (let i = 0; i < 30; i++) await motion(...roll(20, variant));
      assert(await input('i.horizontalSteer') > 0.5, `clockwise rotation steers right (${variant})`);
      for (let i = 0; i < 40; i++) await motion(...roll(-20, variant));
      assert(await input('i.horizontalSteer') < -0.5, `counter-clockwise rotation steers left (${variant})`);
    }
    await settings({controlScheme: 'floating'});
    console.log('PASS tilt steering with auto-detected screen orientation');

    // ---- 8. Keyboard + gamepad ----
    await page.keyboard.down('KeyD'); await page.evaluate(() => gameInstance.input.update(0.016));
    assert(await input('i.horizontalSteer') > 0.9); await page.keyboard.up('KeyD');
    await page.evaluate(() => {
      window.__padJump = 0;
      navigator.getGamepads = () => [{connected: true, axes: [0.9, -0.95], buttons: Array.from({length: 17}, (_, i) => ({pressed: i === 0}))}];
    });
    await page.evaluate(() => gameInstance.input.update(0.5));
    assert(await input('i.horizontalSteer') > 0.6 && await input('i.verticalSteer') > 0.6, 'gamepad stick steers/accelerates');
    assert(await input('i.jumpBufferTimer') > 0 && await input('i.isJumpHeld'), 'gamepad A jumps');
    await page.evaluate(() => { navigator.getGamepads = () => []; gameInstance.input.update(0.5); });
    assert.equal(await input('i.horizontalSteer'), 0);
    console.log('PASS keyboard and gamepad input');

    // ---- 9. Haptics: patterns, strength and the vibration switch ----
    await page.evaluate(() => {
      window.__h = []; window.AndroidBridge = {vibrate: ms => __h.push(['v', ms]), vibratePattern: (j, k) => __h.push(['p', JSON.parse(j), k])};
      GameStorage.saveSettings({...GameStorage.getSettings(), vibration: true, hapticStrength: 1.5});
      gameInstance.vibrate(20); gameInstance.vibrate([0, 18, 20, 12]);
      GameStorage.saveSettings({...GameStorage.getSettings(), vibration: false}); gameInstance.vibrate(50);
      GameStorage.saveSettings({...GameStorage.getSettings(), vibration: true, hapticStrength: 1});
    });
    const h = await page.evaluate(() => __h);
    assert.deepEqual(h[0], ['v', 30], 'single pulse scaled by strength');
    assert.deepEqual(h[1], ['p', [0, 27, 20, 18], 1.5], 'pattern pulses scaled, pauses untouched');
    assert.equal(h.length, 2, 'vibration switch mutes haptics');
    console.log('PASS haptic patterns, strength scaling and mute');

    assert.deepEqual(errors, []);
    console.log('PASS browser controls: floating/fixed/tilt schemes, response curve, follow, jump zone, brake isolation, left-handed, keyboard, gamepad, haptics.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
