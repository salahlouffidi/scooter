// Real browser input: two concurrent touch pointers, keyboard hold, cancellation and pause.
const {chromium} = require('playwright'), http = require('node:http'), fs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets/game');
(async () => {
  const server = http.createServer((q, r) => {
    try {
      const f = path.join(root, q.url === '/' ? 'index.html' : q.url);
      r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      r.end(fs.readFileSync(f));
    } catch { r.statusCode = 404; r.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r)); let browser;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport: {width: 844, height: 390}, hasTouch: true});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.gameInstance?.state === 'MENU');
    await page.evaluate(() => {
      const g = gameInstance; g.startRound(1); g.pause();
      const p = g.trackGen.activeCollectibles.find(p => p.userData.type === 'antigravity');
      g.riderCtrl.reset(p.userData.s - 1, 10); g.riderCtrl.laneX = p.userData.laneX;
      g.riderCtrl.updateMeshTransform(); g.gameCam.reset(g.riderCtrl.mesh, g.trackGen);
    });
    await page.click('#btn-pause-resume');
    await page.waitForFunction(() => gameInstance.state === 'PLAYING' && gameInstance.riderCtrl.activeAntigravity);
    assert(await page.locator('.powerup-badge.antigravity').isVisible());
    assert(await page.evaluate(() => gameInstance.riderCtrl.mesh.userData.hoverRing.visible));
    console.log('PASS pickup activates antigravity, hover ring and countdown');
    const cdp = await page.context().newCDPSession(page);
    const joy = await page.locator('#joystick-zone').boundingBox(), jump = await page.locator('#btn-jump').boundingBox();
    const stick = {id: 1, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2};
    const button = {id: 2, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2};
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [stick]});
    stick.x -= 25;
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [stick]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [stick, button]});
    await page.waitForFunction(() => gameInstance.input.isJumpHeld && gameInstance.input.horizontalSteer < -.2);
    await page.evaluate(() => {const r = gameInstance.riderCtrl; r.y = 5; r.verticalVelocity = -5; r.isGrounded = false; r.supportId = null;});
    await page.waitForFunction(() => gameInstance.riderCtrl.isGliding && gameInstance.riderCtrl.verticalVelocity >= -1.4);
    assert.equal(await page.locator('.antigravity small').textContent(), 'GLIDING');
    // Release only the Jump finger. CDP touchEnd identifies the ending touch;
    // a mouse-up cannot release a held finger on an Android-style screen.
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: [button]});
    await page.waitForFunction(() => !gameInstance.input.isJumpHeld && gameInstance.riderCtrl.verticalVelocity < -1.45);
    assert(await page.evaluate(() => gameInstance.input.joystickPointerId !== null), 'releasing Jump leaves the joystick held');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    console.log('PASS two-thumb steering, hold-to-glide and independent touch release');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => gameInstance.riderCtrl.isGliding);
    const attempts = await page.evaluate(() => gameInstance.riderCtrl.jumpAttempts);
    await page.keyboard.down('Space'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => gameInstance.riderCtrl.jumpAttempts), attempts, 'key repeat cannot buffer another jump');
    await page.keyboard.up('Space');
    assert.equal(await page.evaluate(() => gameInstance.input.isJumpHeld), false);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [button]});
    await page.keyboard.down('Space'); await page.keyboard.up('Space');
    assert(await page.evaluate(() => gameInstance.input.isJumpHeld), 'keyboard release cannot cancel a held touch');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    assert.equal(await page.evaluate(() => gameInstance.input.isJumpHeld), false, 'touch cancellation releases the glider');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [button]});
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => gameInstance.state), 'PAUSED');
    assert.equal(await page.evaluate(() => gameInstance.input.isJumpHeld), false, 'app switch releases held controls');
    const timer = await page.evaluate(() => gameInstance.riderCtrl.antigravityTimer);
    await page.waitForTimeout(250); assert.equal(await page.evaluate(() => gameInstance.riderCtrl.antigravityTimer), timer);
    console.log('PASS keyboard hold/repeat, touch cancellation and app-switch freeze');
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.evaluate(() => {
      const g = gameInstance; g.onAppForeground();
      g.riderCtrl.reset(78, 12); g.riderCtrl.applyPowerup('antigravity');
      g.riderCtrl.updateMeshTransform(); g.gameCam.reset(g.riderCtrl.mesh, g.trackGen);
    });
    await page.click('#btn-pause-resume'); await page.waitForFunction(() => gameInstance.state === 'PLAYING');
    await page.waitForFunction(() => gameInstance.arcadeEffects.pool.some(p => p.trail && p.hover && p.life > 0));
    fs.mkdirSync(path.resolve(__dirname, '../docs'), {recursive: true});
    await page.screenshot({path: path.resolve(__dirname, '../docs/antigravity.png')});
    await page.evaluate(() => {gameInstance.pause(); gameInstance.updateHUD();});
    // Check the HUD with simultaneous powers in both phone orientations.
    for (const viewport of [{width: 844, height: 390}, {width: 390, height: 844}]) {
      await page.setViewportSize(viewport);
      const bounds = await page.evaluate(() => {
        const g = gameInstance;
        for (const p of ['shield','magnet','double','magic_fruit','propulsor']) g.riderCtrl.applyPowerup(p);
        g.updateHUD();
        return ['.powerup-badge.antigravity','#hud-speed','#hud-world'].map(s => {
          const r = document.querySelector(s).getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom};
        });
      });
      const [badge, speed, city] = bounds;
      const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      assert(!overlaps(badge, speed) && !overlaps(badge, city), 'hover badge remains readable on phones');
      assert(badge.right <= viewport.width && badge.x >= 0);
    }
    assert.deepEqual(errors, []);
    console.log('PASS browser antigravity: real pickup, simultaneous touch steering/glide, release/cancel, keyboard hold/repeat, app-switch freeze, purple rendering and phone HUD.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
