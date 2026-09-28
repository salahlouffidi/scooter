// SKY SCOOTER — LOUFFI EDITION
// Graphics manager: GPU profiling, quality tiers, shadow set-up, dynamic
// resolution and the render entry point. Keeps every quality decision in one
// place so game.js only asks for a frame.
window.GraphicsManager = class GraphicsManager {
  constructor(game) {
    this.game = game;
    this.T = game.THREE;
    this.renderer = game.renderer;
    this.post = new window.PostFX(this.renderer, this.T);
    this.setting = 'auto';
    this.tier = 'high';
    this.dprCap = 2;
    this.renderScale = 1;
    this.minScale = 0.6;
    this.adaptive = true;
    this.postEnabled = true;
    this.shadowSize = 0;
    this.profile = window.GraphicsManager.lastProbe || window.GraphicsManager.probe();
    // Frame pacing state for the resolution governor.
    this.emaMs = 16.7;
    this.minMs = 1000;
    this.slowTime = 0;
    this.fastTime = 0;
    this.sinceChange = 0;
    this.upBlock = 0;
    this.frames = 0;
    this.settings = {};
  }

  // ---------- GPU probe (runs once, before the real context exists) ----------
  static probe() {
    const ua = (navigator.userAgent || '');
    const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
    let gpu = '';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (_) { /* profile stays conservative */ }
    let tier = 'high';
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    if (mobile) {
      tier = 'medium';
      let m;
      if ((m = /Adreno[^0-9]*(\d{3})/i.exec(gpu))) tier = +m[1] >= 640 ? 'high' : +m[1] >= 610 ? 'medium' : 'low';
      else if ((m = /Mali-?G(\d{2,3})/i.exec(gpu))) tier = +m[1] >= 77 ? 'high' : +m[1] >= 57 ? 'medium' : 'low';
      else if (/Mali-?T|PowerVR|SGX|VideoCore/i.test(gpu)) tier = 'low';
      else if (/Immortalis|Xclipse/i.test(gpu)) tier = 'high';
      else if (/Apple/i.test(gpu)) tier = 'high';
      if (mem <= 2 || cores <= 4) tier = tier === 'high' ? 'medium' : 'low';
      else if (mem <= 3 && tier === 'high') tier = 'medium';
    } else if (/SwiftShader|llvmpipe|Software/i.test(gpu)) {
      tier = 'high'; // desktop software renderer: only used by automated tests, keep full pipeline on.
    }
    window.GraphicsManager.lastProbe = { tier, gpu, mobile, mem, cores };
    return window.GraphicsManager.lastProbe;
  }

  resolveTier(setting) {
    if (setting === 'low' || setting === 'medium' || setting === 'high') return setting;
    return this.profile.tier;
  }

  // ---------- Apply settings ----------
  apply(settings) {
    const g = this.game, r = this.renderer;
    this.settings = settings || {};
    this.setting = settings.graphicsQuality || 'auto';
    this.tier = this.resolveTier(this.setting);
    this.adaptive = settings.adaptiveResolution !== false;
    this.postEnabled = settings.postFx !== false;
    this.dprCap = { low: 1, medium: 1.5, high: 2 }[this.tier];
    const native = window.devicePixelRatio || 1;
    this.pixelRatio = Math.min(native, this.dprCap);
    this.minScale = this.tier === 'low' ? 0.7 : 0.6;
    this.renderScale = Math.min(1, Math.max(this.minScale, this.renderScale || 1));

    // Shadows
    const wantShadows = this.tier !== 'low';
    const size = this.tier === 'high' ? 2048 : 1024;
    r.shadowMap.enabled = wantShadows;
    r.shadowMap.type = this.T.PCFSoftShadowMap;
    if (g.dirLight && this.shadowSize !== (wantShadows ? size : 0)) {
      g.dirLight.shadow.mapSize.set(size, size);
      if (g.dirLight.shadow.map) { g.dirLight.shadow.map.dispose(); g.dirLight.shadow.map = null; }
      g.dirLight.castShadow = wantShadows;
      this.shadowSize = wantShadows ? size : 0;
      this.materialsNeedUpdate();
    }
    if (g.dirLight) g.dirLight.castShadow = wantShadows;

    // Post-processing tier: low -> direct render; medium/high -> HDR pipeline.
    const wantPost = this.tier !== 'low' && this.postEnabled && this.post.supported;
    this.postActive = wantPost;
    this.layout();
    const achieved = this.post.configure(wantPost ? this.tier : 'off', this.canvasW, this.canvasH, this.renderScale);
    this.postActive = achieved !== 'off';
    if (wantPost && !this.postActive) this.layout();
    this.post.features.blur = !settings.reducedMotion;
    this.post.features.lines = !settings.reducedMotion;
    this.post.features.ca = !settings.reducedMotion;
    this.post.features.grain = this.tier === 'high';
    this.applyToneMapping();
    if (g.sky) g.sky.setQuality(this.tier);
    g.container?.classList.toggle('post-fx', this.postActive);
    document.body.dataset.gfx = this.postActive ? this.tier : 'direct';
    this.sinceChange = 0; this.slowTime = 0; this.fastTime = 0;
    this.materialsNeedUpdate();
    return this.tier;
  }

  materialsNeedUpdate() {
    this.game.scene?.traverse(o => {
      const m = o.material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(x => { x.needsUpdate = true; });
    });
  }

  applyToneMapping() {
    const r = this.renderer, T = this.T;
    if (this.postActive) {
      // Tone mapping happens in the composite pass; the renderer only writes linear HDR.
      r.toneMapping = T.NoToneMapping;
    } else {
      r.toneMapping = T.ACESFilmicToneMapping;
    }
    this.game.applyExposure?.();
  }

  // Canvas sizing. With post-fx the canvas stays at the tier's pixel ratio and only the
  // HDR scene target is scaled; in direct mode the canvas itself is scaled.
  layout() {
    const r = this.renderer, w = window.innerWidth, h = window.innerHeight;
    r.setPixelRatio(this.postActive ? this.pixelRatio : Math.max(0.5, this.pixelRatio * this.renderScale));
    r.setSize(w, h);
    const v = new this.T.Vector2();
    r.getDrawingBufferSize(v);
    this.canvasW = v.x; this.canvasH = v.y;
  }

  resize() {
    this.layout();
    this.post.resize(this.canvasW, this.canvasH);
  }

  // ---------- Dynamic resolution governor ----------
  govern(rawDt, playing) {
    if (!this.adaptive || rawDt <= 0 || rawDt > 0.5) return;
    const ms = rawDt * 1000;
    this.frames++;
    this.emaMs += (ms - this.emaMs) * 0.06;
    if (this.frames < 90) { this.minMs = Math.min(this.minMs, ms); return; }
    this.minMs = Math.min(this.minMs * 1.0005, Math.max(4, ms));
    if (!playing) return;
    const refresh = Math.max(8.3, Math.min(16.7, this.minMs));
    const budget = Math.max(16.7, refresh * 1.05);
    this.sinceChange += rawDt;
    if (this.upBlock > 0) this.upBlock -= rawDt;
    // ~51 fps or worse counts as slow; ~57 fps or better counts as headroom. Vsync quantises
    // frame times, so the averaged interval is what separates "just under 60" from "solid 60".
    if (this.emaMs > budget * 1.12) { this.slowTime += rawDt; this.fastTime = 0; }
    else if (this.emaMs < budget * 1.05) { this.fastTime += rawDt; this.slowTime = Math.max(0, this.slowTime - rawDt); }
    else { this.slowTime = Math.max(0, this.slowTime - rawDt * 0.5); this.fastTime = Math.max(0, this.fastTime - rawDt * 0.5); }
    if (this.slowTime > 1.4 && this.sinceChange > 2.0) {
      this.step(-0.1);
      this.upBlock = 20; // do not bounce straight back up into the load that just caused the drop
    } else if (this.fastTime > 6 && this.sinceChange > 6 && this.renderScale < 1 && !(this.upBlock > 0)) {
      this.step(0.05);
    }
  }

  step(delta) {
    const next = Math.max(this.minScale, Math.min(1, +(this.renderScale + delta).toFixed(2)));
    this.slowTime = 0; this.fastTime = 0; this.sinceChange = 0;
    if (next === this.renderScale) {
      // Already at the floor and still slow: shed the most expensive optional feature.
      if (delta < 0 && this.tier === 'high' && this.setting !== 'high') this.demote();
      return;
    }
    this.renderScale = next;
    if (this.postActive) this.post.setRenderScale(next);
    else this.resize();
    this.onScaleChange?.(next);
  }

  demote() {
    // Auto mode only: high -> medium keeps a full look but halves shadow/bloom cost.
    if (this.setting !== 'auto') return;
    this.profile = { ...this.profile, tier: 'medium' };
    this.renderScale = 1;
    this.apply({ ...this.settings });
  }

  // ---------- Frame ----------
  render(scene, camera) {
    this.post.render(scene, camera);
  }
};
