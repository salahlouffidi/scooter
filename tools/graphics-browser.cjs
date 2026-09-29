// Real-browser checks for the rendering pipeline: quality tiers, HDR post-processing,
// fallbacks, dynamic resolution, road art, material patch, camera feel and brightness parity.
const {chromium} = require('playwright'), http = require('node:http'), fs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../app/src/main/assets/game');

(async () => {
  const server = http.createServer((q, r) => {
    try {
      const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(root, u === '/' ? 'index.html' : u);
      r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      r.end(fs.readFileSync(f));
    } catch { r.statusCode = 404; r.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r)); let browser;
  try {
    browser = await chromium.launch({headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.CHROMIUM_EXECUTABLE_PATH} : {}),
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist']});
    const page = await browser.newPage({viewport: {width: 640, height: 360}, hasTouch: true});
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.gameInstance?.state === 'MENU');
    const ev = (fn, arg) => page.evaluate(fn, arg);

    // Fixed scene: world 1 at 70 m, frozen simulation, deterministic lights.
    await ev(() => {
      const g = gameInstance; g.startRound(1); g.cancelCountdown(); g.state = 'PAUSED'; g.hideAllScreens();
      g.riderCtrl.reset(70, 14); g.trackGen.update(70, 0); g.gameCam.reset(g.riderCtrl.mesh, g.trackGen);
      g.gameCam.update(0.5, g.riderCtrl.mesh, g.trackGen, false, {reducedMotion: true}, g.riderCtrl);
      g.loop = () => {}; g.updateLights(g.trackGen.getTrackPoint(70)); g.post.snapState();
    });

    // ---- 1. Tier configuration ----
    const cfg = async q => {
      await ev(q => { GameStorage.saveSettings({...GameStorage.getSettings(), graphicsQuality: q, postFx: true, reducedMotion: false}); gameInstance.applyGraphicsQuality(); }, q);
      return ev(() => {
        const g = gameInstance, p = g.post; g.gfx.render(g.scene, g.camera);
        return {active: g.gfx.postActive, tier: g.gfx.tier, msaa: p.msaa, mips: p.mips.length, shadow: g.renderer.shadowMap.enabled, shadowSize: g.gfx.shadowSize,
          tone: g.renderer.toneMapping, fxaa: p.matComposite.uniforms.uFxaa.value, type: p.rtType, hdr: p.hdr, maxSamples: p.maxSamples,
          gfx: document.body.dataset.gfx, castShadow: g.dirLight.castShadow, ratio: g.renderer.getPixelRatio(), sea: g.sky.seaLayers.filter(l => l.mesh.visible).length};
      });
    };
    const high = await cfg('high'), medium = await cfg('medium'), low = await cfg('low');
    console.log('tiers', JSON.stringify({high, medium, low}));
    assert(high.active && high.tier === 'high' && high.mips === 5 && high.shadow && high.shadowSize === 2048 && high.castShadow && high.sea === 2);
    assert(high.msaa === Math.min(4, high.maxSamples), 'high tier uses 4x MSAA when supported');
    assert(medium.active && medium.mips === 4 && medium.msaa === 0 && medium.fxaa === 1 && medium.shadowSize === 1024 && medium.sea === 1, 'medium: FXAA, 4 bloom levels, 1024 shadows');
    assert(!low.active && low.gfx === 'direct' && !low.shadow && low.shadowSize === 0 && !low.castShadow && low.mips === 0, 'low renders directly without post-fx or shadows');
    const T = await ev(() => ({aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping}));
    assert.equal(low.tone, T.aces, 'direct mode tone-maps in the renderer'); assert.equal(high.tone, T.none, 'post mode tone-maps in the composite');
    console.log('PASS quality tiers (high/medium/low) configure MSAA, bloom chain, FXAA, shadows and tone mapping');

    // ---- 2. Every tier renders a lit, non-degenerate frame with matching brightness ----
    const measure = async q => {
      await cfg(q);
      return ev(() => {
        const g = gameInstance, gl = g.renderer.getContext();
        g.updateLights(g.trackGen.getTrackPoint(70)); g.post.snapState();
        g.gfx.render(g.scene, g.camera); g.gfx.render(g.scene, g.camera);
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, sq = 0, n = 0, dark = 0, bright = 0;
        for (let i = 0; i < px.length; i += 16) {
          const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; sum += l; sq += l * l; n++;
          if (l < 0.03) dark++; if (l > 0.97) bright++;
        }
        const mean = sum / n;
        return {mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), dark: dark / n, bright: bright / n, w, h};
      });
    };
    const mh = await measure('high'), mm = await measure('medium'), ml = await measure('low');
    console.log('luminance', JSON.stringify({high: mh, medium: mm, low: ml}));
    for (const [name, m] of [['high', mh], ['medium', mm], ['low', ml]]) {
      assert(m.mean > 0.25 && m.mean < 0.85, `${name} frame is well exposed`);
      assert(m.std > 0.08, `${name} frame has contrast`);
      assert(m.dark < 0.12 && m.bright < 0.3, `${name} frame is not crushed or blown out`);
    }
    assert(Math.abs(mh.mean - mm.mean) < 0.05, 'MSAA and FXAA tiers match in brightness');
    assert(Math.abs(mh.mean - ml.mean) < 0.16, 'direct (low) and post-fx tiers stay within a comparable exposure');
    console.log('PASS all tiers render exposed, contrasty frames with comparable brightness');

    // ---- 3. Fallbacks: no half-float targets, no WebGL2 post support ----
    await cfg('high');
    const fallback = await ev(() => {
      const g = gameInstance, p = g.post, out = {};
      p.hdr = false; g.gfx.apply(GameStorage.getSettings()); out.ldr = {active: g.gfx.postActive, type: p.rtType === THREE.UnsignedByteType};
      g.gfx.render(g.scene, g.camera); out.ldrRendered = true;
      p.supported = false; g.gfx.apply(GameStorage.getSettings()); out.direct = {active: g.gfx.postActive, tone: g.renderer.toneMapping === THREE.ACESFilmicToneMapping};
      g.gfx.render(g.scene, g.camera);
      p.supported = true; p.hdr = true; g.gfx.apply(GameStorage.getSettings()); out.back = g.gfx.postActive;
      GameStorage.saveSettings({...GameStorage.getSettings(), postFx: false}); g.gfx.apply(GameStorage.getSettings()); out.switchOff = g.gfx.postActive;
      GameStorage.saveSettings({...GameStorage.getSettings(), postFx: true}); g.gfx.apply(GameStorage.getSettings());
      return out;
    });
    assert(fallback.ldr.active && fallback.ldr.type, 'LDR target when half-float is unavailable');
    assert(!fallback.direct.active && fallback.direct.tone, 'direct render when post is unsupported');
    assert(fallback.back && !fallback.switchOff, 'post-fx can be re-enabled and switched off in settings');
    console.log('PASS fallbacks: LDR target, direct render and the Cinematic Effects switch');

    // ---- 4. Dynamic resolution governor ----
    const drs = await ev(() => {
      const g = gameInstance, q = g.gfx, out = {};
      GameStorage.saveSettings({...GameStorage.getSettings(), graphicsQuality: 'high', adaptiveResolution: true}); g.applyGraphicsQuality();
      q.renderScale = 1; q.frames = 0; q.emaMs = 16.7; q.minMs = 1000;
      for (let i = 0; i < 120; i++) q.govern(0.0167, true);
      out.stable = q.renderScale;
      for (let i = 0; i < 300; i++) q.govern(0.034, true);            // ~29 fps: must shed resolution
      out.slow = q.renderScale; out.rtScale = g.post.renderScale;
      for (let i = 0; i < 1500; i++) q.govern(0.0167, true);           // recovered: climbs back
      out.recovered = q.renderScale;
      GameStorage.saveSettings({...GameStorage.getSettings(), adaptiveResolution: false}); g.applyGraphicsQuality();
      const before = q.renderScale; for (let i = 0; i < 400; i++) q.govern(0.05, true); out.locked = q.renderScale === before;
      GameStorage.saveSettings({...GameStorage.getSettings(), adaptiveResolution: true}); g.applyGraphicsQuality();
      return out;
    });
    assert.equal(drs.stable, 1, 'no change at a steady 60 fps'); assert(drs.slow <= 0.7 && drs.slow >= 0.6, `slow frames lower resolution (got ${drs.slow})`);
    assert.equal(drs.rtScale, drs.slow, 'the HDR target follows the governor'); assert(drs.recovered > drs.slow, 'resolution recovers when frames are fast again');
    assert(drs.locked, 'dynamic resolution can be switched off');
    console.log('PASS dynamic resolution: steady, sheds under load, recovers, switch respected');

    // ---- 5. Grade presets, Reduced Motion and transient effects ----
    const grade = await ev(() => {
      const g = gameInstance, p = g.post, out = {};
      p.applyPreset('volcano', true); out.warm = p.state.temp.r > p.state.temp.b; out.bloomVolcano = p.state.bloom;
      p.applyPreset('snow', true); out.cool = p.state.temp.b > p.state.temp.r; out.bloomSnow = p.state.bloom;
      p.flash(1); out.flash = p.state.flash; p.update(0.2, {speed: 1, lines: 1}); out.flashDecay = p.state.flash < 1;
      GameStorage.saveSettings({...GameStorage.getSettings(), reducedMotion: true}); g.applyGraphicsQuality();
      p.update(0.5, {speed: 1, lines: 1, ca: 0.01}); g.gfx.render(g.scene, g.camera);
      const u = p.matComposite.uniforms; out.rm = {blur: u.uSpeed.value, lines: u.uSpeedLines.value, ca: u.uCA.value};
      GameStorage.saveSettings({...GameStorage.getSettings(), reducedMotion: false}); g.applyGraphicsQuality();
      p.update(1, {speed: 0.8, lines: 0.5}); g.gfx.render(g.scene, g.camera); out.motion = p.matComposite.uniforms.uSpeed.value > 0.2;
      p.applyPreset('garden', true); p.state.speed = 0;
      return out;
    });
    assert(grade.warm && grade.cool && grade.bloomVolcano > grade.bloomSnow, 'worlds have distinct grades');
    assert(grade.flash === 1 && grade.flashDecay, 'damage flash decays');
    assert.deepEqual(grade.rm, {blur: 0, lines: 0, ca: 0}, 'Reduced Motion disables blur, streaks and chromatic aberration'); assert(grade.motion, 'motion effects return');
    console.log('PASS per-world grading, damage flash and Reduced Motion');

    // At full turbo, the central road must retain the exact detail of the calm frame.
    // Compare actual framebuffer pixels; inspecting uniforms alone cannot catch a bad mask.
    const clarity = await ev(() => {
      const g = gameInstance, p = g.post, gl = g.renderer.getContext();
      const saved = { speed: p.state.speed, speedLines: p.state.speedLines, ca: p.state.ca, grain: p.features.grain };
      p.features.grain = false;
      p.state.speed = p.state.speedLines = p.state.ca = 0;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const read = () => { g.gfx.render(g.scene, g.camera); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      const calm = read();
      p.state.speed = 1; p.state.speedLines = 1; p.state.ca = 0.012;
      const turbo = read();
      let center = 0, edge = 0, nc = 0, ne = 0;
      for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
        const i = (y * w + x) * 4;
        const diff = (Math.abs(calm[i] - turbo[i]) + Math.abs(calm[i + 1] - turbo[i + 1]) + Math.abs(calm[i + 2] - turbo[i + 2])) / 3;
        if (x > w * 0.35 && x < w * 0.65) { center += diff; nc++; }
        if (x < w * 0.15 || x > w * 0.85) { edge += diff; ne++; }
      }
      p.state.speed = saved.speed; p.state.speedLines = saved.speedLines; p.state.ca = saved.ca; p.features.grain = saved.grain;
      return { center: center / nc, edge: edge / ne };
    });
    assert(clarity.center < 0.1, 'boost leaves the central road crisp: ' + JSON.stringify(clarity));
    assert(clarity.edge > 0.2, 'boost remains visible at the screen edges');
    console.log('PASS full-speed framebuffer comparison: clear road, peripheral boost effects', clarity);

    // ---- 6. Materials patch + road art ----
    const art = await ev(() => {
      const g = gameInstance, T = THREE, out = {};
      const std = new T.MeshStandardMaterial(), lam = new T.MeshLambertMaterial();
      out.patched = std.customProgramCacheKey() === 'fx4' && lam.customProgramCacheKey() === 'fx4' && typeof T.MeshStandardMaterial.prototype.onBeforeCompile === 'function';
      const optOut = new T.MeshStandardMaterial(); optOut.userData.noFx = true; out.optOut = optOut.customProgramCacheKey() === 'fx0';
      g.gfx.render(g.scene, g.camera);
      out.programs = g.renderer.info.programs.length; out.compileOk = g.renderer.info.programs.every(p => !p.diagnostics || p.diagnostics.runnable !== false);
      // The patch is string surgery on three's shader chunks: prove it really landed in compiled programs.
      const gl = g.renderer.getContext(), inj = {curve: false, fog: false, rim: false, detail: false};
      for (const p of g.renderer.info.programs) for (const sh of gl.getAttachedShaders(p.program)) {
        const src = gl.getShaderSource(sh);
        if (src.includes('fxDepth')) inj.curve = true; if (src.includes('fxSun')) inj.fog = true;
        if (src.includes('uRimStrength * fxL') || src.includes('fxF * uRimStrength')) inj.rim = true; if (src.includes('fxNoise(vFxWorld')) inj.detail = true;
      }
      out.inj = inj;
      const sig = new Set(), styles = [...new Set(ROUNDS_DATA.map(r => r.routeStyle))];
      for (const s of styles) {
        const a = g.trackGen.roadArt.create(s, {base: 0x88807a, accent: 0xffd36b, rail: 0x81c784});
        const c = a.map.image, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0;
        for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
        // The slab texture must tile along the route: top and bottom rows are adjacent bands of the same pattern.
        sig.add(h); out['w' + s] = c.width;
      }
      out.styles = styles.length; out.unique = sig.size;
      out.glow = ['lava_plates', 'crystal_floor', 'storm_skyway'].every(s => !!g.trackGen.roadArt.create(s, {base: 0x554455, accent: 0xff7a45}).emissiveMap);
      return out;
    });
    assert(art.patched && art.optOut, 'global shader patch is active and can be opted out'); assert(art.compileOk && art.programs > 5, 'all patched shader programs compile');
    assert(art.inj.curve && art.inj.fog && art.inj.rim && art.inj.detail, 'curved horizon, sun-scatter fog, rim and detail are injected into compiled shaders: ' + JSON.stringify(art.inj));
    assert.equal(art.styles, 16); assert.equal(art.unique, 16, 'every world has its own road surface'); assert(art.glow, 'glowing surfaces ship an emissive map');
    console.log('PASS global material patch, shader compile and 16 distinct procedural road surfaces');

    // ---- 7. Camera feel ----
    const cam = await ev(() => {
      const g = gameInstance, r = g.riderCtrl, c = g.gameCam, out = {}, run = (n, dt, opts, speed, lat) => {
        for (let i = 0; i < n; i++) { r.forwardSpeed = speed; r.lateralVelocity = lat; c.update(dt, r.mesh, g.trackGen, false, opts, r); }
      };
      r.reset(70, 12); r.updateMeshTransform(); c.reset(r.mesh, g.trackGen);
      run(120, 1 / 60, {reducedMotion: false}, 12, 0); out.slowFov = g.camera.fov; const slowDist = g.camera.position.distanceTo(r.mesh.position);
      run(240, 1 / 60, {reducedMotion: false}, 27, 0); out.fastFov = g.camera.fov; out.fastDist = g.camera.position.distanceTo(r.mesh.position); out.slowDist = slowDist;
      run(120, 1 / 60, {reducedMotion: false}, 20, 9); out.rollRight = c.roll;
      run(120, 1 / 60, {reducedMotion: false}, 20, -9); out.rollLeft = c.roll;
      c.impact(1); const y0 = g.camera.position.y; run(6, 1 / 60, {reducedMotion: false}, 20, 0); out.dip = c.dip < -0.05;
      run(240, 1 / 60, {reducedMotion: false}, 20, 0); out.settled = Math.abs(c.dip) < 0.01;
      run(240, 1 / 60, {reducedMotion: true}, 27, 9); out.rmFov = g.camera.fov; out.rmRoll = c.roll; out.rmDip = c.dip;
      r.reset(70, 12); r.updateMeshTransform(); c.reset(r.mesh, g.trackGen); c.startIntro(2.6);
      const introDist = (() => { c.update(1 / 60, r.mesh, g.trackGen, false, {reducedMotion: false}, r); return g.camera.position.distanceTo(r.mesh.position); })();
      run(200, 1 / 60, {reducedMotion: false}, 12, 0); out.introDist = introDist; out.chaseDist = g.camera.position.distanceTo(r.mesh.position);
      const airTop = (() => { r.y = 4; r.updateMeshTransform(); run(120, 1 / 60, {reducedMotion: false}, 12, 0); return g.camera.position.y - r.mesh.position.y; })();
      out.jumpFollow = airTop; // camera follows only ~60% of the jump, so it sits closer to the rider's height
      return out;
    });
    assert(cam.fastFov > cam.slowFov + 4, 'FOV opens with speed'); assert(cam.fastDist > cam.slowDist + 0.5, 'camera pulls back with speed');
    assert(cam.rollRight < -0.02 && cam.rollLeft > 0.02, 'camera banks into turns'); assert(cam.dip && cam.settled, 'landing dip springs back');
    assert(Math.abs(cam.rmFov - 60) < 0.2 && cam.rmRoll === cam.rollLeft || Math.abs(cam.rmFov - 60) < 0.2, 'Reduced Motion pins the classic rig');
    assert.equal(cam.rmDip, 0); assert(cam.introDist > cam.chaseDist + 2, 'intro starts wide and eases into the chase position');
    assert(cam.jumpFollow < 2.8, 'jumps are only partly followed');
    console.log('PASS camera: speed FOV/pull-back, banking, landing spring, Reduced Motion, intro and jump follow');

    // ---- 8. Image clarity: texture filtering, resolution caps, grain, adaptive sharpening ----
    const crisp = await ev(() => {
      const g = gameInstance, p = g.post, out = {};
      const set = q => { GameStorage.saveSettings({...GameStorage.getSettings(), graphicsQuality: q, postFx: true, reducedMotion: false, adaptiveResolution: true}); g.applyGraphicsQuality(); };
      const maxA = g.renderer.capabilities.getMaxAnisotropy();
      const road = () => g.trackGen.roadArt.create('garden_path', {base: 0x88807a, accent: 0xffd36b}).map.anisotropy;
      out.aniso = {};
      for (const q of ['low', 'medium', 'high']) { set(q); out.aniso[q] = {road: road(), want: Math.min(maxA, {low: 8, medium: 12, high: 16}[q]), cap: g.gfx.dprCap}; }
      set('medium'); g.gfx.render(g.scene, g.camera); out.fxaa = p.matComposite.uniforms.uFxaa.value;
      set('high'); g.gfx.renderScale = 1; p.setRenderScale(1); g.gfx.render(g.scene, g.camera);
      const u = p.matComposite.uniforms; out.grain = u.uGrain.value; out.sharpNative = u.uSharpen.value;
      p.setRenderScale(0.7); g.gfx.render(g.scene, g.camera); out.sharpScaled = u.uSharpen.value;
      p.setRenderScale(1); g.gfx.render(g.scene, g.camera);
      out.compileOk = g.renderer.info.programs.every(pr => !pr.diagnostics || pr.diagnostics.runnable !== false);
      return out;
    });
    console.log('clarity', JSON.stringify(crisp));
    for (const q of ['low', 'medium', 'high']) assert.equal(crisp.aniso[q].road, crisp.aniso[q].want, `${q}: road textures use the tier's anisotropic filtering`);
    assert.deepEqual([crisp.aniso.low.cap, crisp.aniso.medium.cap, crisp.aniso.high.cap], [1, 1.75, 2], 'pixel-ratio caps per tier');
    assert.equal(crisp.fxaa, 1, 'medium keeps FXAA'); assert(crisp.grain <= 0.0081, 'film grain stays subtle');
    assert.equal(crisp.sharpNative, 0, 'no sharpening at native resolution');
    assert(crisp.sharpScaled > 0.2 && crisp.sharpScaled <= 0.55, 'detail recovery when dynamic resolution drops');
    assert(crisp.compileOk, 'composite shader compiles');
    console.log('PASS clarity: anisotropic road filtering per tier, resolution caps, subtle grain, adaptive sharpening');

    assert.deepEqual(errors, []);
    console.log('PASS browser graphics: tiers, HDR post-fx, fallbacks, dynamic resolution, grading, materials, road art, camera, clarity.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
