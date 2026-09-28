// Exercise real generated hazards, game-loop scoring, HUD, reload and terminal screens.
const {chromium} = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets/game');
(async () => {
  const server = http.createServer((q, r) => {
    try {
      const file = path.join(root, q.url === '/' ? 'index.html' : q.url);
      r.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      r.end(fs.readFileSync(file));
    } catch {r.statusCode = 404; r.end();}
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  let browser;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport: {width: 800, height: 450}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:' + server.address().port);
    async function installClock() {
      await page.waitForFunction(() => window.gameInstance?.state === 'MENU', {timeout: 60000});
      await page.evaluate(() => {
        const g = gameInstance, tick = g.loop.bind(g); g.loop = () => {};
        window.damageTime = g.lastTime = performance.now();
        window.damageStep = frames => {
          const render = g.renderer.render;
          // Run every production update; render the final frame of each simulated interval.
          g.renderer.render = () => {};
          try {for (let i = 0; i < frames; i++) tick(window.damageTime += 1000 / 60);}
          finally {g.renderer.render = render;}
          render.call(g.renderer, g.scene, g.camera);
        };
        window.damageSetup = (round = 1, type = 'crate', moving = false) => {
          g.startRound(round); g.cancelCountdown(); g.state = 'PLAYING';
          document.getElementById('gameplay-hud').classList.remove('hidden');
          g.trackGen.buildRound(ROUNDS_DATA[round - 1], 123); g.trackGen.update(240);
          const o = g.trackGen.activeObstacles.find(o => o.userData.type === type && !!o.userData.isMoving === moving);
          if (!o) throw new Error('Missing generated ' + type + ' in round ' + round);
          const d = o.userData, r = g.riderCtrl;
          r.reset(d.s - d.collision.halfLength - .95, 28); r.laneX = d.laneX; r.updateMeshTransform();
          g.gameCam.reset(r.mesh, g.trackGen); g.input.resetAll();
          for (const c of g.trackGen.activeCollectibles) c.userData.collected = true;
          g.score = 300; g.distanceScore = Math.floor(r.furthestS); g.consecutiveCoins = 12; g.coinMultiplier = 2;
          window.damageStartDistance = g.distanceScore;
          window.damageTime = g.lastTime = performance.now();
          return d.id;
        };
        window.damageStats = () => ({hearts: g.hearts, score: g.score, penalty: g.obstaclePenaltyScore,
          distance: g.distanceScore, state: g.state, multiplier: g.coinMultiplier,
          hudScore: +document.getElementById('hud-score-val').innerText,
          hudHearts: [...document.querySelectorAll('#hud-hearts-val .heart')].map(h => h.classList.contains('full') ? 'full' : 'empty').join(','),
          labels: document.getElementById('floating-labels-layer').innerText});
      });
    }
    await installClock();
    const hit = await page.evaluate(() => {
      damageSetup(); damageStep(18);
      return {...damageStats(), distanceGain: gameInstance.distanceScore - damageStartDistance,
        pulse: document.getElementById('hud-score-val').classList.contains('hud-score-penalty'),
        shake: gameInstance.arcadeEffects.screenShake.timer > 0};
    });
    assert.equal(hit.hearts, 2); assert.equal(hit.penalty, 50); assert.equal(hit.score, 250 + hit.distanceGain);
    assert.equal(hit.hudScore, hit.score); assert.equal(hit.hudHearts, 'full,full,empty'); assert.equal(hit.multiplier, 1);
    assert(hit.labels.includes('-50 POINTS!') && hit.labels.includes('-1 HEART!')); assert(hit.pulse);
    if (process.env.OBSTACLE_SCREENSHOT) await page.screenshot({path: process.env.OBSTACLE_SCREENSHOT});
    console.log('PASS browser: generated box blocks the rider, removes one heart and 50 points, and updates the HUD.');
    const saved = await page.evaluate(() => {gameInstance.pause(); return GameStorage.getRun();});
    assert.equal(saved.stats.obstaclePenaltyScore, 50); assert.equal(saved.stats.score, hit.score);
    await page.reload(); await installClock();
    const resumed = await page.evaluate(() => {
      const g = gameInstance; g.continueSavedRun(); g.cancelCountdown(); g.state = 'PLAYING';
      damageTime = g.lastTime = performance.now(); damageStep(360); return damageStats();
    });
    assert.equal(resumed.hearts, 2); assert.equal(resumed.score, hit.score); assert.equal(resumed.penalty, 50);
    console.log('PASS browser: reload preserves deducted points and a held collision cannot charge again.');
    for (const power of ['shield','magic_fruit']) {
      const guarded = await page.evaluate(power => {
        damageSetup(); gameInstance.riderCtrl.applyPowerup(power); damageStep(18);
        return {...damageStats(), distanceGain: gameInstance.distanceScore - damageStartDistance};
      }, power);
      assert.equal(guarded.hearts, 3); assert.equal(guarded.penalty, 0); assert.equal(guarded.score, 300 + guarded.distanceGain);
    }
    // The authored routes use these two other obstacle families, including lateral motion.
    for (const type of ['barrier','barrel']) {
      const hit = await page.evaluate(type => {
        let round;
        for (const data of ROUNDS_DATA) {
          gameInstance.trackGen.buildRound(data, 123); gameInstance.trackGen.update(240);
          if (gameInstance.trackGen.activeObstacles.some(o => o.userData.type === type && o.userData.isMoving)) {round = data.id; break;}
        }
        damageSetup(round, type, true); damageStep(18); return damageStats();
      }, type);
      assert.equal(hit.hearts, 2, type); assert.equal(hit.penalty, 50, type);
    }
    const terminal = await page.evaluate(() => {
      damageSetup(); gameInstance.hearts = 1; damageStep(18);
      const score = gameInstance.score;
      gameInstance.onGameplayEvent('coin', gameInstance.riderCtrl.mesh.position);
      gameInstance.onGameplayEvent('heart_pickup'); damageStep(5);
      return {...damageStats(), finalScore: score, modalScore: +document.getElementById('go-run-score').innerText,
        saved: GameStorage.getRun(), visible: !document.getElementById('game-over-modal').classList.contains('hidden')};
    });
    assert.equal(terminal.state, 'GAME_OVER'); assert.equal(terminal.hearts, 0); assert(terminal.visible);
    assert.equal(terminal.score, terminal.finalScore); assert.equal(terminal.modalScore, terminal.score); assert.equal(terminal.saved, null);
    const legacy = await page.evaluate(() => {
      damageSetup(); gameInstance.saveActiveRun(); const saved = GameStorage.getRun();
      delete saved.stats.obstaclePenaltyScore; GameStorage.saveRun(saved); gameInstance.obstaclePenaltyScore = 999;
      gameInstance.continueSavedRun(); gameInstance.cancelCountdown();
      return {score: gameInstance.score, penalty: gameInstance.obstaclePenaltyScore};
    });
    assert.equal(legacy.score, 300); assert.equal(legacy.penalty, 0);
    await page.setViewportSize({width: 667, height: 375});
    const summary = await page.evaluate(() => {
      damageSetup(); damageStep(18); gameInstance.triggerRoundComplete();
      return {penalty: document.getElementById('rc-obstacle-penalty-pts').innerText,
        total: +document.getElementById('rc-total-score').innerText, score: gameInstance.score};
    });
    assert.equal(summary.penalty, '-50'); assert.equal(summary.total, summary.score);
    await page.locator('#btn-next-round').scrollIntoViewIfNeeded();
    assert(await page.locator('#btn-next-round').isVisible());
    await page.locator('#btn-next-round').click();
    assert.equal(await page.evaluate(() => gameInstance.currentRoundId), 2);
    assert.deepEqual(errors, []);
    console.log('PASS browser: shield/guard, moving barriers/barrels, final-hit score, older saves and round summary on a phone viewport.');
  } finally {if (browser) await browser.close(); server.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
