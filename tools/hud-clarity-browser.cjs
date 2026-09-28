// Regression: real pickups update only the score HUD, bursts stay bounded, and
// stacked power-ups / large scores leave room for play on small phone screens.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets/game');
(async () => {
  const server = http.createServer((q, r) => {
    try {
      const f = path.join(root, q.url === '/' ? 'index.html' : q.url);
      r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      r.end(fs.readFileSync(f));
    } catch { r.statusCode = 404; r.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  let browser;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport: {width: 800, height: 450}, hasTouch: true}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.gameInstance?.state === 'MENU', null, {timeout: 60000});
    const pickup = await page.evaluate(() => {
      const g = gameInstance;
      g.loop = () => {}; g.startRound(1); g.cancelCountdown(); g.state = 'PLAYING';
      g.hideAllScreens(); document.getElementById('gameplay-hud').classList.remove('hidden');
      g.trackGen.buildRound(ROUNDS_DATA[0], 123); g.trackGen.update(0, 0);
      const coin = g.trackGen.activeCollectibles.find(c => !c.userData.isPowerup && !c.userData.isGem);
      const r = g.riderCtrl, d = coin.userData;
      r.reset(d.s, 0); r.laneX = d.laneX; r.updateMeshTransform();
      const input = {horizontalSteer: 0, isBraking: true, consumeJump: () => false};
      r.update(1 / 120, input, ROUNDS_DATA[0].baseSpeed, ROUNDS_DATA[0].roadWidth, (e, p) => g.onGameplayEvent(e, p));
      const hud = () => +document.getElementById('hud-score-val').textContent;
      const actual = {collected: coin.userData.collected, score: g.score, hud: hud()};
      const nodes = document.querySelectorAll('*').length;
      for (let i = 0; i < 40; i++) g.onGameplayEvent('coin', r.mesh.position);
      g.onGameplayEvent('gem', r.mesh.position); g.onGameplayEvent('jump_challenge'); g.onGameplayEvent('heart_pickup');
      const burst = {score: g.score, hud: hud(), nodes: document.querySelectorAll('*').length - nodes,
        labels: document.querySelectorAll('.floating-score-label, #floating-labels-layer').length,
        gain: document.getElementById('hud-score-val').classList.contains('hud-score-gain')};
      const beforeDamage = g.score;
      g.onGameplayEvent('hit_obstacle'); g.updateHUD();
      const damage = {score: g.score, hud: hud(), lost: beforeDamage - g.score, hearts: g.hearts,
        penalty: document.getElementById('hud-score-val').classList.contains('hud-score-penalty')};
      g.onGameplayEvent('checkpoint'); g.hud.update(2);
      const expired = {notice: document.getElementById('hud-status').textContent, penalty: document.getElementById('hud-score-val').classList.contains('hud-score-penalty')};
      g.startRound(1); g.cancelCountdown(); g.state = 'PLAYING';
      return {actual, burst, damage, expired, reset: hud()};
    });
    assert.deepEqual(pickup.actual, {collected: true, score: 10, hud: 10});
    assert.equal(pickup.burst.score, pickup.burst.hud); assert.equal(pickup.burst.nodes, 0); assert.equal(pickup.burst.labels, 0); assert(pickup.burst.gain);
    assert.equal(pickup.damage.lost, 50); assert.equal(pickup.damage.hearts, 2); assert.equal(pickup.damage.score, pickup.damage.hud); assert(pickup.damage.penalty);
    assert.deepEqual(pickup.expired, {notice: '', penalty: false}); assert.equal(pickup.reset, 0);
    console.log('PASS real coin collection, bulk/combo/gem/jump/heart rewards, immediate score, damage, bounded DOM, reset and notice expiry');

    await page.evaluate(() => {
      const g = gameInstance, r = g.riderCtrl;
      for (const power of ['antigravity', 'shield', 'magnet', 'double', 'overdrive', 'magic_fruit', 'propulsor']) r.applyPowerup(power, (e, p) => g.onGameplayEvent(e, p));
      g.score = 1234567; g.hud.snapScore(); g.updateHUD();
      document.getElementById('gameplay-hud').classList.remove('hidden');
    });
    for (const [width, height] of [[800, 450], [640, 360], [390, 844], [320, 640]]) {
      await page.setViewportSize({width, height});
      const layout = await page.evaluate(() => {
        const rect = n => {const b = n.getBoundingClientRect(); return {left: b.left, right: b.right, top: b.top, bottom: b.bottom};};
        const chips = [...document.querySelectorAll('.powerup-badge')];
        return {chips: chips.map(rect), named: chips.every(c => c.getAttribute('aria-label')?.includes(':')),
          top: [...document.querySelectorAll('.hud-hearts, .hud-score, #btn-hud-pause')].map(rect),
          pointerEvents: getComputedStyle(document.getElementById('hud-powerups')).pointerEvents};
      });
      assert.equal(layout.chips.length, 7); assert(layout.named); assert.equal(layout.pointerEvents, 'none');
      for (const b of [...layout.chips, ...layout.top]) assert(b.left >= 0 && b.right <= width + 1 && b.top >= 0 && b.bottom < height * .34, `HUD intrudes into playfield at ${width}x${height}: ${JSON.stringify(b)}`);
      for (let i = 0; i < layout.top.length; i++) for (let j = i + 1; j < layout.top.length; j++) {
        const a = layout.top[i], b = layout.top[j]; assert(a.right <= b.left || b.right <= a.left, `HUD overlap at ${width}x${height}`);
      }
    }
    await page.evaluate(() => {document.body.classList.add('reduced-motion'); gameInstance.hearts = 1; gameInstance.updateHUD();});
    assert.equal(await page.locator('#hud-hearts').evaluate(e => getComputedStyle(e).animationName), 'none');
    assert.equal(await page.locator('.powerup-badge').first().evaluate(e => getComputedStyle(e).animationName), 'none');
    console.log('PASS seven power-ups and large score fit landscape/portrait phones; Reduced Motion has no HUD pulses');

    const migration = await page.evaluate(() => {
      const g = gameInstance; g.saveActiveRun();
      const saved = GameStorage.getRun(); saved.layoutVersion = 1; GameStorage.saveRun(saved);
      g.continueSavedRun(); g.cancelCountdown();
      return {score: g.score, hud: +document.getElementById('hud-score-val').textContent,
        notice: document.getElementById('hud-status').textContent, labels: document.querySelectorAll('.floating-score-label').length};
    });
    assert.equal(migration.score, 1234567); assert.equal(migration.hud, migration.score);
    assert.equal(migration.notice, 'CHECKPOINT RESTORED'); assert.equal(migration.labels, 0);
    assert.deepEqual(errors, []);
    console.log('PASS legacy save migration uses the top HUD notice, no removed label API or browser errors');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
