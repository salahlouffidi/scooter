// SKY SCOOTER — LOUFFI EDITION
// Procedural road surfaces. One 1024x256 canvas texture covers a single 2.05 m slab
// (road width x slab length) and is seamless along the direction of travel, so the
// instanced slabs read as continuous cobbles, planks, ice, lava plates and so on.
// Everything is drawn at runtime: no files to ship, deterministic per style.
window.RoadArt = class RoadArt {
  constructor(THREE, maxAnisotropy = 4) {
    this.T = THREE;
    this.maxAniso = maxAnisotropy;
    this.cache = new Map();
    this.W = 1024;
    this.H = 256;
  }

  static rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tier-driven level published by GraphicsManager; falls back to the constructor value.
  anisotropy() { return (window.GraphicsManager && window.GraphicsManager.textureAniso) || this.maxAniso; }

  hex(c) { return '#' + new this.T.Color(c).getHexString(); }
  shade(c, f) {
    const col = new this.T.Color(c);
    col.multiplyScalar(f);
    return '#' + col.getHexString();
  }
  mix(a, b, t) { return '#' + new this.T.Color(a).lerp(new this.T.Color(b), t).getHexString(); }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    return [c, c.getContext('2d')];
  }

  // Draw a shape at v offsets -H, 0, +H so anything crossing the top/bottom wraps seamlessly.
  wrap(ctx, fn) { for (const dy of [-this.H, 0, this.H]) { ctx.save(); ctx.translate(0, dy); fn(); ctx.restore(); } }

  create(style, colors) {
    const key = style + ':' + colors.base + ':' + colors.accent;
    if (this.cache.has(key)) {
      // A graphics-tier change may have raised or lowered anisotropic filtering since this was built.
      const hit = this.cache.get(key), level = this.anisotropy();
      for (const t of [hit.map, hit.bumpMap, hit.emissiveMap]) if (t && t.anisotropy !== level) { t.anisotropy = level; t.needsUpdate = true; }
      return hit;
    }
    const T = this.T, W = this.W, H = this.H;
    const seed = [...style].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
    const R = RoadArt.rng(seed);
    const [color, ctx] = this.canvas();
    const [glow, gctx] = this.canvas();
    const [height, hctx] = this.canvas();
    gctx.fillStyle = '#000'; gctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, W, H);
    const P = { ctx, gctx, hctx, R, base: colors.base, accent: colors.accent, rail: colors.rail || colors.accent };
    const spec = { roughness: 0.85, metalness: 0.0, bump: 1.0, glow: 0, env: 0.6 };
    const recipe = {
      garden_path: 'cobble', temple_stone: 'temple', jungle_roots: 'planks', island_crossings: 'planks',
      mountain_bridge: 'blocks', canyon_ledges: 'blocks', sand_dunes: 'sand', glacier_ice: 'ice', lava_plates: 'plates',
      crystal_floor: 'crystal', clockwork_belts: 'metal', storm_skyway: 'glass', moon_rocks: 'moon',
      rainbow_rapids: 'rainbow', sky_arena: 'marble', mushroom_bounce: 'dots'
    }[style] || 'cobble';
    this['paint_' + recipe](P, spec);
    this.edgeAO(ctx);
    this.grain(ctx, recipe === 'ice' || recipe === 'glass' ? 0.025 : 0.05, R);

    const tex = (canvas, srgb) => {
      const t = new T.CanvasTexture(canvas);
      t.wrapS = T.ClampToEdgeWrapping; t.wrapT = T.RepeatWrapping;
      t.anisotropy = this.anisotropy();
      t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
      t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const out = {
      map: tex(color, true),
      bumpMap: spec.bump > 0 ? tex(height, false) : null,
      emissiveMap: spec.glow > 0 ? tex(glow, true) : null,
      roughness: spec.roughness, metalness: spec.metalness, bumpScale: spec.bump, emissiveIntensity: spec.glow, envMapIntensity: spec.env, recipe
    };
    this.cache.set(key, out);
    return out;
  }

  // Free every cached surface except the one in use (16 styles would otherwise hold ~60 MB of textures).
  disposeExcept(keep) {
    for (const [key, o] of this.cache) {
      if (o === keep) continue;
      o.map?.dispose(); o.bumpMap?.dispose(); o.emissiveMap?.dispose();
      this.cache.delete(key);
    }
  }

  disposeAll() {
    for (const o of this.cache.values()) { o.map?.dispose(); o.bumpMap?.dispose(); o.emissiveMap?.dispose(); }
    this.cache.clear();
  }

  // ---------- Shared finishing ----------
  edgeAO(ctx) {
    const W = this.W, H = this.H;
    for (const [x0, x1] of [[0, 0.075], [1, 0.925]]) {
      const g = ctx.createLinearGradient(x0 * W, 0, x1 * W, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x0, x1) * W, 0, Math.abs(x1 - x0) * W, H);
    }
  }
  grain(ctx, amount, R) {
    const W = this.W, H = this.H, img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (R() - 0.5) * 2 * amount * 255;
      d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }
  rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Rows of rounded tiles; alternate rows are offset (running bond).
  tiles(P, rows, perRow, gap, radius, tone, glowSeams) {
    const { ctx, hctx, gctx, R, base } = P, W = this.W, H = this.H, rh = H / rows;
    ctx.fillStyle = this.shade(base, 0.5); ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#202020'; hctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      const tw = W / perRow, off = (r % 2) * tw * 0.5;
      for (let i = -1; i <= perRow; i++) {
        const x = i * tw + off + gap / 2, y = r * rh + gap / 2, w = tw - gap, h = rh - gap;
        const f = 1 + (R() - 0.5) * tone;
        const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
        g.addColorStop(0, this.shade(base, f * 1.1)); g.addColorStop(1, this.shade(base, f * 0.92));
        ctx.fillStyle = g; this.rrect(ctx, x, y, w, h, radius); ctx.fill();
        hctx.fillStyle = `rgb(${150 + R() * 60},${150 + R() * 60},${150 + R() * 60})`; this.rrect(hctx, x, y, w, h, radius); hctx.fill();
        // chips / pits
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.08})`;
          ctx.beginPath(); ctx.arc(x + R() * w, y + R() * h, 1 + R() * 3, 0, 6.29); ctx.fill();
        }
      }
    }
    if (glowSeams) {
      gctx.strokeStyle = glowSeams; gctx.lineWidth = gap * 0.9; gctx.lineCap = 'round';
      for (let r = 0; r <= rows; r++) { gctx.beginPath(); gctx.moveTo(0, r * rh); gctx.lineTo(W, r * rh); gctx.stroke(); }
      const tw = W / perRow;
      for (let r = 0; r < rows; r++) for (let i = -1; i <= perRow; i++) {
        const x = i * tw + (r % 2) * tw * 0.5; gctx.beginPath(); gctx.moveTo(x, r * rh); gctx.lineTo(x, (r + 1) * rh); gctx.stroke();
      }
    }
  }

  // ---------- Recipes ----------
  paint_cobble(P, spec) { this.tiles(P, 4, 8, 6, 9, 0.22); spec.roughness = 0.88; spec.bump = 1.2; }
  paint_temple(P, spec) {
    const { ctx, hctx, gctx, R, base, accent } = P, H = this.H;
    this.tiles(P, 1, 4, 8, 6, 0.14);
    for (let i = 0; i < 4; i++) {
      const cx = i * 256 + 128, cy = H / 2;
      ctx.lineWidth = 5; ctx.strokeStyle = this.shade(base, 0.62);
      for (const s of [88, 62, 36]) { ctx.strokeRect(cx - s, cy - s, s * 2, s * 2); hctx.strokeStyle = '#303030'; hctx.lineWidth = 6; hctx.strokeRect(cx - s, cy - s, s * 2, s * 2); }
      ctx.fillStyle = this.hex(accent); ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 6.29); ctx.fill();
      gctx.fillStyle = this.mix(accent, 0xffffff, 0.2); gctx.beginPath(); gctx.arc(cx, cy, 12, 0, 6.29); gctx.fill();
    }
    spec.glow = 0.7; spec.roughness = 0.82; spec.bump = 1.4;
  }
  paint_planks(P, spec) {
    const { ctx, hctx, R, base } = P, W = this.W, H = this.H, rows = 8, rh = H / rows;
    ctx.fillStyle = this.shade(base, 0.32); ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#101010'; hctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      const f = 0.84 + R() * 0.3, y = r * rh + 2;
      ctx.fillStyle = this.shade(base, f); ctx.fillRect(0, y, W, rh - 4);
      hctx.fillStyle = `rgb(${170 + R() * 50},${170 + R() * 50},${170 + R() * 50})`; hctx.fillRect(0, y, W, rh - 4);
      for (let k = 0; k < 16; k++) { // grain
        ctx.strokeStyle = `rgba(0,0,0,${0.06 + R() * 0.1})`; ctx.lineWidth = 1 + R() * 1.5;
        const gy = y + 3 + R() * (rh - 10); ctx.beginPath(); ctx.moveTo(R() * 200, gy); ctx.bezierCurveTo(300, gy + R() * 4 - 2, 700, gy + R() * 4 - 2, W, gy + R() * 3); ctx.stroke();
      }
      for (const x of [26, W - 26]) { ctx.fillStyle = 'rgba(30,20,10,0.55)'; ctx.beginPath(); ctx.arc(x, y + (rh - 4) / 2, 3.4, 0, 6.29); ctx.fill(); }
    }
    spec.roughness = 0.9; spec.bump = 1.6;
  }
  paint_blocks(P, spec) {
    const { ctx, hctx, R, base } = P, W = this.W, H = this.H, rows = 2, rh = H / rows;
    ctx.fillStyle = this.shade(base, 0.42); ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#181818'; hctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      let x = -R() * 120; const y = r * rh + 3;
      while (x < W) {
        const w = 230 + R() * 190, f = 0.86 + R() * 0.28;
        const g = ctx.createLinearGradient(x, y, x + w, y + rh);
        g.addColorStop(0, this.shade(base, f * 1.08)); g.addColorStop(1, this.shade(base, f * 0.9));
        ctx.fillStyle = g; this.rrect(ctx, x + 3, y, w - 6, rh - 6, 12); ctx.fill();
        hctx.fillStyle = `rgb(${160 + R() * 60},${160 + R() * 60},${160 + R() * 60})`; this.rrect(hctx, x + 3, y, w - 6, rh - 6, 12); hctx.fill();
        if (R() < 0.6) { // hairline crack
          ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1.6; ctx.beginPath();
          let cx = x + 20 + R() * (w - 40), cy = y + 6; ctx.moveTo(cx, cy);
          for (let k = 0; k < 6; k++) { cx += (R() - 0.5) * 34; cy += (rh - 14) / 6; ctx.lineTo(cx, cy); } ctx.stroke();
        }
        x += w;
      }
    }
    spec.roughness = 0.9; spec.bump = 1.5;
  }
  paint_sand(P, spec) {
    const { ctx, hctx, R, base } = P, W = this.W, H = this.H;
    ctx.fillStyle = this.hex(base); ctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 14; i++) {
      const g = ctx.createRadialGradient(R() * W, R() * H, 4, R() * W, R() * H, 90 + R() * 120);
      g.addColorStop(0, R() < 0.5 ? 'rgba(255,240,200,0.16)' : 'rgba(120,80,30,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } });
    for (let i = 0; i < 9; i++) { // wind ripples, periodic in v
      const y0 = (i + 0.5) * (H / 9), amp = 3 + R() * 5, fr = 0.006 + R() * 0.006, ph = R() * 6.28;
      for (const [w, col] of [[5, 'rgba(255,238,190,0.28)'], [3, 'rgba(110,70,25,0.20)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp + (w === 3 ? 4 : 0); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
    }
    hctx.fillStyle = '#909090'; hctx.fillRect(0, 0, W, H);
    spec.roughness = 0.98; spec.bump = 0.5;
  }
  paint_ice(P, spec) {
    const { ctx, hctx, R, base } = P, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, this.mix(base, 0xffffff, 0.15)); g.addColorStop(0.5, this.hex(base)); g.addColorStop(1, this.mix(base, 0x3a9ad0, 0.25));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 9; i++) { // frosty clouds
      const x = R() * W, y = R() * H, rad = 60 + R() * 130, gr = ctx.createRadialGradient(x, y, 4, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    } });
    this.wrap(ctx, () => { for (let i = 0; i < 12; i++) { // cracks
      let x = R() * W, y = R() * H; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (R() - 0.3) * 70; y += (R() - 0.5) * 50; ctx.lineTo(x, y); }
      ctx.strokeStyle = 'rgba(30,90,140,0.32)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.3; ctx.stroke();
    } });
    for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(R() * W, R() * H, 2, 2); }
    hctx.fillStyle = '#909090'; hctx.fillRect(0, 0, W, H);
    // Satin sheen (like the crystal road): ice still gleams but no longer mirrors the sun
    // down the lane at the chase camera's grazing angle.
    spec.roughness = 0.3; spec.metalness = 0.05; spec.bump = 0.3; spec.env = 1.15;
  }
  paint_plates(P, spec) {
    const { ctx, gctx, R, base, accent } = P, W = this.W, H = this.H;
    this.tiles(P, 3, 6, 10, 12, 0.3, this.hex(accent));
    // Glow bleeds along a few random cracks inside plates.
    for (let i = 0; i < 8; i++) {
      let x = R() * W, y = R() * H; gctx.beginPath(); gctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 60; y += (R() - 0.5) * 50; gctx.lineTo(x, y); }
      gctx.strokeStyle = this.mix(accent, 0xffc060, 0.4); gctx.lineWidth = 2.4; gctx.stroke();
    }
    ctx.globalAlpha = 0.5; ctx.drawImage(P.gctx.canvas, 0, 0); ctx.globalAlpha = 1;
    spec.glow = 1.6; spec.roughness = 0.62; spec.bump = 1.4;
  }
  paint_crystal(P, spec) {
    const { ctx, gctx, R, base, accent } = P, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, this.shade(base, 0.9)); g.addColorStop(1, this.mix(base, accent, 0.25));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 26; i++) { // facets
      const x = R() * W, y = R() * H, s = 50 + R() * 140;
      ctx.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '10,0,40'},${0.04 + R() * 0.09})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + (R() - 0.5) * s); ctx.lineTo(x + (R() - 0.3) * s, y + s); ctx.closePath(); ctx.fill();
    } });
    gctx.lineCap = 'round';
    this.wrap(P.gctx, () => { for (let i = 0; i < 16; i++) {
      const x = R() * W, y = R() * H, l = 120 + R() * 260, a = (R() - 0.5) * 0.9;
      gctx.strokeStyle = R() < 0.6 ? this.hex(accent) : '#ff7ad8'; gctx.lineWidth = 1.5 + R() * 2.2;
      gctx.beginPath(); gctx.moveTo(x, y); gctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gctx.stroke();
    } });
    ctx.globalAlpha = 0.45; ctx.drawImage(gctx.canvas, 0, 0); ctx.globalAlpha = 1;
    // Satin crystal keeps the facets and luminous seams without a mirror-like
    // white reflection down the lane at the chase camera's grazing angle.
    spec.glow = 1.0; spec.roughness = 0.48; spec.metalness = 0.08; spec.bump = 0.2; spec.env = 0.85;
  }
  paint_metal(P, spec) {
    const { ctx, hctx, gctx, R, base, accent } = P, W = this.W, H = this.H;
    ctx.fillStyle = this.shade(base, 0.55); ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#202020'; hctx.fillRect(0, 0, W, H);
    const rows = 2, rh = H / rows, pw = 256;
    for (let r = 0; r < rows; r++) for (let i = 0; i < W / pw; i++) {
      const x = i * pw + 4, y = r * rh + 4, f = 0.9 + R() * 0.2;
      const g = ctx.createLinearGradient(x, y, x, y + rh); g.addColorStop(0, this.shade(base, f * 1.12)); g.addColorStop(1, this.shade(base, f * 0.88));
      ctx.fillStyle = g; this.rrect(ctx, x, y, pw - 8, rh - 8, 6); ctx.fill();
      hctx.fillStyle = '#b0b0b0'; this.rrect(hctx, x, y, pw - 8, rh - 8, 6); hctx.fill();
      ctx.fillStyle = 'rgba(20,24,30,0.7)';
      for (const [rx, ry] of [[x + 12, y + 12], [x + pw - 20, y + 12], [x + 12, y + rh - 20], [x + pw - 20, y + rh - 20]]) { ctx.beginPath(); ctx.arc(rx, ry, 4, 0, 6.29); ctx.fill(); }
    }
    // Hazard chevrons hugging both edges.
    for (const x0 of [16, W - 46]) for (let y = -20; y < H; y += 42) {
      ctx.fillStyle = this.hex(accent); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 30, y + 20); ctx.lineTo(x0 + 30, y + 40); ctx.lineTo(x0, y + 20); ctx.fill();
      gctx.fillStyle = this.hex(accent); gctx.beginPath(); gctx.moveTo(x0, y); gctx.lineTo(x0 + 30, y + 20); gctx.lineTo(x0 + 30, y + 40); gctx.lineTo(x0, y + 20); gctx.fill();
    }
    spec.glow = 0.5; spec.roughness = 0.52; spec.metalness = 0.6; spec.bump = 1.0; spec.env = 1.0; // brushed, no white lane glare
  }
  paint_glass(P, spec) {
    const { ctx, gctx, R, base, accent } = P, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, this.mix(base, 0xbfe9ff, 0.3)); g.addColorStop(0.5, this.hex(base)); g.addColorStop(1, this.mix(base, 0xbfe9ff, 0.3));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    gctx.strokeStyle = this.hex(accent); gctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 128) for (const c of [ctx, gctx]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y <= H; y += 128) for (const c of [ctx, gctx]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    this.wrap(ctx, () => { for (let i = 0; i < 5; i++) { const x = R() * W; const s = ctx.createLinearGradient(x, 0, x + 140, H); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.13)'); s.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = s; ctx.fillRect(x, 0, 140, H); } });
    spec.glow = 0.8; spec.roughness = 0.26; spec.metalness = 0.2; spec.bump = 0; spec.env = 1.25; // glassy, not a mirror
  }
  paint_moon(P, spec) {
    const { ctx, hctx, R, base } = P, W = this.W, H = this.H;
    ctx.fillStyle = this.hex(base); ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#909090'; hctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 20; i++) {
      const x = R() * W, y = R() * H, r = 14 + R() * 46;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(0,0,10,0.26)'); g.addColorStop(0.82, 'rgba(0,0,10,0.16)'); g.addColorStop(0.9, 'rgba(255,255,255,0.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
      const hg = hctx.createRadialGradient(x, y, 0, x, y, r); hg.addColorStop(0, '#404040'); hg.addColorStop(0.85, '#606060'); hg.addColorStop(0.92, '#c0c0c0'); hg.addColorStop(1, '#909090');
      hctx.fillStyle = hg; hctx.beginPath(); hctx.arc(x, y, r, 0, 6.29); hctx.fill();
    } });
    spec.roughness = 0.95; spec.bump = 2.0;
  }
  paint_rainbow(P, spec) {
    const { ctx, gctx, R } = P, W = this.W, H = this.H, bands = 7;
    for (let i = 0; i < bands; i++) {
      const c = new this.T.Color().setHSL(i / bands, 0.72, 0.6), x = i * W / bands;
      ctx.fillStyle = '#' + c.getHexString();
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= H; y += 8) ctx.lineTo(x + Math.sin(y / H * 6.283) * 14, y);
      for (let y = H; y >= 0; y -= 8) ctx.lineTo(x + W / bands + Math.sin(y / H * 6.283) * 14, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const x = R() * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 30, H * 0.3, x - 30, H * 0.7, x, H); ctx.stroke(); }
    gctx.globalAlpha = 0.35; gctx.drawImage(ctx.canvas, 0, 0); gctx.globalAlpha = 1;
    spec.glow = 0.6; spec.roughness = 0.4; spec.bump = 0; spec.env = 1.2;
  }
  paint_marble(P, spec) {
    const { ctx, hctx, gctx, R, base, accent } = P, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, this.mix(base, 0xffffff, 0.2)); g.addColorStop(1, this.shade(base, 0.9));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 14; i++) {
      let x = R() * W, y = R() * H; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 9; k++) { x += (R() - 0.35) * 70; y += (R() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.strokeStyle = `rgba(90,80,70,${0.08 + R() * 0.16})`; ctx.lineWidth = 1 + R() * 2.2; ctx.stroke();
    } });
    for (const x of [W * 0.06, W * 0.5, W * 0.94]) for (const c of [ctx, gctx]) {
      c.strokeStyle = this.hex(accent); c.lineWidth = 6; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3;
    for (let x = 0; x <= W; x += 256) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    hctx.fillStyle = '#909090'; hctx.fillRect(0, 0, W, H);
    spec.glow = 0.5; spec.roughness = 0.42; spec.metalness = 0.05; spec.bump = 0.3; spec.env = 1.05; // polished, veins stay readable
  }
  paint_dots(P, spec) {
    const { ctx, hctx, R, base, accent } = P, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, this.shade(base, 1.05)); g.addColorStop(1, this.shade(base, 0.92));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, W, H);
    this.wrap(ctx, () => { for (let i = 0; i < 26; i++) {
      const x = R() * W, y = R() * H, r = 10 + R() * 28;
      ctx.fillStyle = R() < 0.5 ? this.mix(base, accent, 0.5) : this.mix(base, 0xffffff, 0.25);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
      hctx.fillStyle = '#b8b8b8'; hctx.beginPath(); hctx.arc(x, y, r, 0, 6.29); hctx.fill();
    } });
    spec.roughness = 0.62; spec.bump = 1.0; spec.env = 1.0;
  }
};
