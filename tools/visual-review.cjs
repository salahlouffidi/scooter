// Capture actual game frames with the same seed, camera, time, tier and HUD state.
// Usage: NODE_PATH=<existing Playwright installation> node tools/visual-review.cjs <output> [asset-root]
// Test harness only: seeded RNG/frozen simulation never ship in the application.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const out = path.resolve(process.argv[2] || 'docs/visual-review');
const root = path.resolve(process.argv[3] || path.join(__dirname, '../app/src/main/assets/game'));
const scenes = [
  { name: 'day-medium', round: 1, tier: 'medium', w: 800, h: 450 },
  { name: 'moon-medium', round: 14, tier: 'medium', w: 800, h: 450 },
  { name: 'sunset-medium', round: 11, tier: 'medium', w: 800, h: 450 },
  { name: 'day-low', round: 1, tier: 'low', w: 800, h: 450 },
  { name: 'small-hud', round: 1, tier: 'medium', w: 640, h: 360, reduced: true, stacked: true }
];
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((q, r) => {
    try {
      const url = decodeURIComponent(q.url.split('?')[0]);
      const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
      if (!file.startsWith(root + path.sep)) throw new Error('outside asset root');
      r.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      r.end(fs.readFileSync(file));
    } catch (_) { r.statusCode = 404; r.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
    for (const scene of scenes) {
      const page = await browser.newPage({ viewport: { width: scene.w, height: scene.h }, deviceScaleFactor: 1, hasTouch: true });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(({ tier, reduced }) => {
        let seed = 20261030;
        window.__resetVisualSeed = () => { seed = 20261030; };
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        localStorage.setItem('skyscooter_settings_v1', JSON.stringify({ graphicsQuality: tier, adaptiveResolution: false, reducedMotion: !!reduced }));
      }, scene);
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.waitForFunction(() => window.gameInstance?.state === 'MENU' && window.louffiAssetStatus === 'GLB loaded', null, { timeout: 60000 });
      const result = await page.evaluate(scene => {
        const g = gameInstance;
        g.loop = () => {};
        window.__resetVisualSeed();
        g.startRound(scene.round, false, true); // Existing test-only bypass; no saved unlocks change.
        if (g.currentRoundId !== scene.round) throw new Error('Intended round was not entered');
        g.cancelCountdown();
        g.state = 'PLAYING';
        g.hideAllScreens();
        document.getElementById('countdown-display').classList.add('hidden');
        document.getElementById('gameplay-hud').classList.remove('hidden');
        const s = 100;
        g.trackGen.buildRound(ROUNDS_DATA[scene.round - 1], 20261030);
        g.riderCtrl.reset(s, 14);
        g.riderCtrl.idleTime = 1.25;
        g.riderCtrl.wheelRotation = 0;
        g.trackGen.update(s, 0);
        g.riderCtrl.updateMeshTransform();
        g.gameCam.reset(g.riderCtrl.mesh, g.trackGen);
        g.gameCam.update(0.5, g.riderCtrl.mesh, g.trackGen, false, { reducedMotion: true }, g.riderCtrl);
        g.camera.updateMatrixWorld(true);
        g.sky.time = 1.25;
        g.sky.update(g.riderCtrl.mesh.position, 0);
        g.updateLights(g.trackGen.getTrackPoint(s));
        g.post.snapState();
        g.post.time = 1.25;
        g.score = scene.stacked ? 1234567 : 2450;
        g.hearts = scene.stacked ? 1 : 3;
        g.coinsCollectedThisRun = 24;
        if (scene.stacked) {
          for (const type of ['shield', 'magnet', 'overdrive', 'antigravity']) g.riderCtrl.applyPowerup(type, () => {});
        }
        g.updateHUD();
        g.hud.update(0);
        g.gfx.render(g.scene, g.camera);
        g.gfx.render(g.scene, g.camera);
        const gl = g.renderer.getContext();
        gl.finish();
        const snapshot = g.trackGen.captureState();
        const nodes = ['.hud-top', '.hud-hearts', '.hud-score', '#hud-world', '#hud-speed'];
        const hud = Object.fromEntries(nodes.map(selector => {
          const el = document.querySelector(selector), r = el.getBoundingClientRect();
          return [selector, { x: r.x, y: r.y, width: r.width, height: r.height, text: el.textContent.trim(), color: getComputedStyle(el).color }];
        }));
        return {
          name: scene.name, round: scene.round, tier: g.gfx.tier, seed: 20261030, s, viewport: [scene.w, scene.h],
          reducedMotion: !!scene.reduced, post: g.gfx.postActive, renderScale: g.gfx.renderScale,
          renderer: g.gfx.profile.gpu, sceneCalls: g.post.enabled ? g.post.sceneInfo.calls : g.renderer.info.render.calls,
          sceneTriangles: g.post.enabled ? g.post.sceneInfo.triangles : g.renderer.info.render.triangles,
          textures: g.renderer.info.memory.textures, geometries: g.renderer.info.memory.geometries,
          rider: g.riderCtrl.captureState(), track: snapshot, camera: { position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray() }, hud,
          lightPositions: { key: g.dirLight.position.toArray(), keyTarget: g.dirLight.target.position.toArray(), rim: g.rimLight.position.toArray(), rimTarget: g.rimLight.target.position.toArray(), sun: g.sky.sunSprite.position.toArray() }
        };
      }, scene);
      result.trackHash = crypto.createHash('sha256').update(JSON.stringify(result.track)).digest('hex');
      delete result.track;
      await page.screenshot({ path: path.join(out, scene.name + '.png'), animations: 'disabled', timeout: 120000 });
      result.errors = errors;
      results.push(result);
      console.log('captured', scene.name, result.sceneCalls, 'calls', result.sceneTriangles, 'triangles', result.trackHash.slice(0, 12));
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'scenes.json'), JSON.stringify(results, null, 2) + '\n');
    if (results.some(r => r.errors.length)) throw new Error('Game page errors: ' + JSON.stringify(results.map(r => r.errors)));
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
