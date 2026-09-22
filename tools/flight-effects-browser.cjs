// Render the actual game loop, inspect GPU programs, and optionally record a deterministic run.
const {chromium} = require('playwright'), http = require('node:http'), fs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict'), child = require('node:child_process'), os = require('node:os');
const root = path.resolve(__dirname, '../app/src/main/assets/game'), out = path.resolve(__dirname, '../docs');
const record = process.argv.includes('--record');
(async () => {
  const server = http.createServer((q, r) => {
    try {
      const file = path.join(root, q.url === '/' ? 'index.html' : q.url);
      r.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
      r.end(fs.readFileSync(file));
    } catch {r.statusCode = 404; r.end();}
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  let browser, frames;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport: {width: 800, height: 450}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.gameInstance?.state === 'MENU');
    await page.evaluate(() => {
      const g = gameInstance;
      window.flightTick = g.loop.bind(g); g.loop = () => {};
      window.flightSetup = () => {
        g.startRound(1); g.cancelCountdown(); g.state = 'PLAYING';
        document.getElementById('gameplay-hud').classList.remove('hidden');
        g.trackGen.buildRound(ROUNDS_DATA[0], 123); g.riderCtrl.reset(20, 12);
        g.gameCam.reset(g.riderCtrl.mesh, g.trackGen); g.input.resetAll();
        g.lastTime = performance.now(); window.flightTime = g.lastTime;
      };
      window.flightStep = (frames, steer = 0) => {
        g.input.horizontalSteer = steer;
        // Supply repeatable steering while stepping the production game loop.
        g.input.update = () => {g.input.horizontalSteer = steer;};
        for (let i = 0; i < frames; i++) flightTick(window.flightTime += 1000 / 60);
      };
      flightSetup();
    });
    const ground = await page.evaluate(() => {
      flightStep(12); const r = gameInstance.riderCtrl;
      return {tail: !!r.mesh.userData.riderTail, original: louffiAssetStatus,
        smoke: gameInstance.arcadeEffects.flightExhaust.smoke.geometry.drawRange.count};
    });
    assert(ground.tail && ground.original === 'GLB loaded'); assert.equal(ground.smoke, 0);
    await page.evaluate(() => {gameInstance.riderCtrl.applyPowerup('propulsor'); flightStep(80, .2);});
    const flight = await page.evaluate(() => {
      const g = gameInstance, f = g.arcadeEffects.flightExhaust;
      return {air: g.riderCtrl.activeSkyFlight, smoke: f.smoke.geometry.drawRange.count,
        flames: f.flames.every(x => x.visible), cores: f.cores.every(x => x.visible),
        programs: g.renderer.info.programs.every(p => !p.diagnostics || p.diagnostics.runnable !== false)};
    });
    assert(flight.air && flight.smoke > 0 && flight.flames && flight.cores && flight.programs);
    fs.mkdirSync(out, {recursive: true});
    await page.screenshot({path: path.join(out, 'nitro-flight.jpg'), type: 'jpeg', quality: 88});
    // A second actual render makes the attachment and curved tail easy to inspect.
    await page.evaluate(() => {
      const g = gameInstance, p = g.riderCtrl.mesh.position;
      g.camera.position.set(p.x + 3.6, p.y + 2.6, p.z - 3.8);
      g.camera.lookAt(p.x, p.y + .85, p.z - .4); g.renderer.render(g.scene, g.camera);
    });
    await page.screenshot({path: path.join(out, 'rider-tail.jpg'), type: 'jpeg', quality: 88});
    const landed = await page.evaluate(() => {
      flightStep(300); const g = gameInstance, f = g.arcadeEffects.flightExhaust;
      return {ground: g.riderCtrl.isGrounded, smoke: f.smoke.geometry.drawRange.count, flames: f.flames.some(x => x.visible)};
    });
    assert(landed.ground); assert.equal(landed.smoke, 0); assert(!landed.flames);
    await page.evaluate(() => {
      const g = gameInstance; g.riderCtrl.applyPowerup('propulsor'); flightStep(20);
      GameStorage.saveSettings({...GameStorage.getSettings(), reducedMotion: true}); flightStep(2);
    });
    assert(await page.evaluate(() => !gameInstance.arcadeEffects.flightExhaust.root.visible));
    console.log('PASS browser: original GLB and tail, powered flight smoke/cores, GPU shader compile, landing fade and Reduced Motion.');
    if (record) {
      frames = fs.mkdtempSync(path.join(os.tmpdir(), 'scooter-flight-frames-'));
      await page.setViewportSize({width: 640, height: 360});
      await page.evaluate(() => {GameStorage.saveSettings({...GameStorage.getSettings(), reducedMotion: false}); flightSetup();});
      for (let i = 0; i < 84; i++) {
        await page.evaluate(i => {
          if (i === 6) gameInstance.riderCtrl.applyPowerup('propulsor', (e, p) => gameInstance.onGameplayEvent(e, p));
          flightStep(5, i >= 16 && i < 22 ? .5 : i >= 30 && i < 36 ? -.5 : 0);
        }, i);
        await page.screenshot({path: path.join(frames, `frame-${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 85});
        if (i % 24 === 0) console.log(`Recorded ${i + 1}/84 frames`);
      }
      child.execFileSync('ffmpeg', ['-y','-hide_banner','-loglevel','error','-framerate','12','-i',path.join(frames,'frame-%03d.jpg'),
        '-c:v','libx264','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'nitro-flight.mp4')]);
      console.log('WROTE docs/nitro-flight.mp4 (scripted 7-second gameplay capture; not a performance benchmark).');
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close(); server.close();
    if (frames) fs.rmSync(frames, {recursive: true, force: true});
  }
})().catch(e => {console.error(e); process.exitCode = 1;});
