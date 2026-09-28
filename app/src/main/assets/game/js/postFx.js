// SKY SCOOTER — LOUFFI EDITION
// Cinematic post-processing: HDR scene target (MSAA), dual-filter bloom, neutral
// tone mapping, per-world colour grade, vignette, radial speed blur, chromatic
// aberration, speed streaks and dithering. three.min.js ships without the
// examples/jsm EffectComposer, so the pipeline is self-contained and small.
//
// Falls back gracefully: if the GPU cannot render to half-float targets the
// pipeline degrades (MSAA off -> LDR target -> disabled) and the game renders
// exactly like before. Nothing here touches gameplay state.
window.PostFX = class PostFX {
  constructor(renderer, THREE) {
    this.renderer = renderer;
    this.T = THREE;
    this.supported = false;
    this.enabled = false;
    this.tier = 'high';
    this.renderScale = 1;
    this.msaa = 0;
    this.bloomLevels = 5;
    this.hdr = true;
    this.time = 0;
    this.canvasSize = new THREE.Vector2(1, 1);
    this.rtSize = new THREE.Vector2(1, 1);
    this.mips = [];
    this.rtScene = null;
    this.lastError = '';
    this.sceneInfo = { calls: 0, triangles: 0 };

    const C = THREE.Color;
    // Live (smoothed) grade values and the preset they are easing toward.
    this.state = {
      exposure: 1.0, bloom: 0.45, threshold: 1.0, knee: 0.6, saturation: 1.1, contrast: 1.08, vignette: 0.32,
      bloomTint: new C(1, 1, 1), temp: new C(1, 1, 1), shadowTint: new C(0, 0, 0), highlightTint: new C(0, 0, 0),
      vignetteColor: new C(0, 0, 0), grain: 0.018, ca: 0, speed: 0, speedLines: 0, flash: 0, warn: 0, flashColor: new C(1, 0.12, 0.1),
      lift: 0.0, god: 0.35, godLive: 0, sunUV: new C(0.5, 0.8, 0)
    };
    this.target = this.cloneState(this.state);
    this.features = { blur: true, ca: true, lines: true, grain: true, rays: true };
    this.impulseCA = 0;
    this.build();
    this.detect();
  }

  cloneState(s) {
    const out = {};
    for (const k of Object.keys(s)) out[k] = s[k] && s[k].isColor ? s[k].clone() : s[k];
    return out;
  }

  // ---------- Capability detection (real framebuffer completeness tests) ----------
  detect() {
    const r = this.renderer, gl = r.getContext();
    this.gl = gl;
    const ext = r.extensions;
    this.isGL2 = !!r.capabilities.isWebGL2;
    const floatRT = this.isGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.maxSamples = this.isGL2 ? (r.capabilities.maxSamples || 0) : 0;
    this.hdr = !!floatRT;
    this.supported = this.isGL2;
  }

  // Try to allocate + bind a target with the requested configuration.
  tryTarget(w, h, type, samples) {
    const T = this.T, r = this.renderer, gl = this.gl;
    let rt = null;
    try {
      while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
      rt = new T.WebGLRenderTarget(w, h, {
        type, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false,
        depthBuffer: true, stencilBuffer: false, samples, colorSpace: T.LinearSRGBColorSpace
      });
      r.setRenderTarget(rt);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER), err = gl.getError();
      r.setRenderTarget(null);
      if (status === gl.FRAMEBUFFER_COMPLETE && err === gl.NO_ERROR) return rt;
      this.lastError = `fbo status ${status} err ${err} type ${type} samples ${samples}`;
    } catch (e) {
      this.lastError = String(e && e.message || e);
      try { r.setRenderTarget(null); } catch (_) { /* ignore */ }
    }
    if (rt) rt.dispose();
    return null;
  }

  // ---------- Shaders ----------
  build() {
    const T = this.T;
    const tri = new T.BufferGeometry();
    tri.setAttribute('position', new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new T.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.fsScene = new T.Scene();
    this.fsScene.add(this.quad);
    this.fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mk = (fragmentShader, uniforms, extra = {}) => new T.ShaderMaterial({
      vertexShader: vert, fragmentShader, uniforms, depthTest: false, depthWrite: false, transparent: false,
      toneMapped: false, ...extra
    });

    this.matPrefilter = mk(`
      uniform sampler2D tSource; uniform vec2 uHalfPixel; uniform float uThreshold; uniform float uKnee;
      varying vec2 vUv;
      vec3 prefilter(vec3 c){
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        return c * contrib;
      }
      float karis(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
      void main(){
        // 4 bilinear taps (2x2 box) with Karis weighting so single hot pixels cannot flicker.
        vec3 a = texture2D(tSource, vUv + vec2(-uHalfPixel.x, -uHalfPixel.y)).rgb;
        vec3 b = texture2D(tSource, vUv + vec2( uHalfPixel.x, -uHalfPixel.y)).rgb;
        vec3 c = texture2D(tSource, vUv + vec2(-uHalfPixel.x,  uHalfPixel.y)).rgb;
        vec3 d = texture2D(tSource, vUv + vec2( uHalfPixel.x,  uHalfPixel.y)).rgb;
        a = prefilter(a); b = prefilter(b); c = prefilter(c); d = prefilter(d);
        float wa = karis(a), wb = karis(b), wc = karis(c), wd = karis(d);
        vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
        gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);
      }`, {
      tSource: { value: null }, uHalfPixel: { value: new T.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 }
    });

    this.matDown = mk(`
      uniform sampler2D tSource; uniform vec2 uHalfPixel; varying vec2 vUv;
      void main(){
        vec3 s = texture2D(tSource, vUv).rgb * 4.0;
        s += texture2D(tSource, vUv - uHalfPixel).rgb;
        s += texture2D(tSource, vUv + uHalfPixel).rgb;
        s += texture2D(tSource, vUv + vec2(uHalfPixel.x, -uHalfPixel.y)).rgb;
        s += texture2D(tSource, vUv - vec2(uHalfPixel.x, -uHalfPixel.y)).rgb;
        gl_FragColor = vec4(s / 8.0, 1.0);
      }`, { tSource: { value: null }, uHalfPixel: { value: new T.Vector2() } });

    this.matUp = mk(`
      uniform sampler2D tSource; uniform vec2 uHalfPixel; uniform float uWeight; varying vec2 vUv;
      void main(){
        vec2 h = uHalfPixel;
        vec3 s = texture2D(tSource, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
        s += texture2D(tSource, vUv + vec2(-h.x,  h.y)).rgb * 2.0;
        s += texture2D(tSource, vUv + vec2(0.0,  h.y * 2.0)).rgb;
        s += texture2D(tSource, vUv + vec2( h.x,  h.y)).rgb * 2.0;
        s += texture2D(tSource, vUv + vec2( h.x * 2.0, 0.0)).rgb;
        s += texture2D(tSource, vUv + vec2( h.x, -h.y)).rgb * 2.0;
        s += texture2D(tSource, vUv + vec2(0.0, -h.y * 2.0)).rgb;
        s += texture2D(tSource, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
        gl_FragColor = vec4(s / 12.0 * uWeight, 1.0);
      }`, { tSource: { value: null }, uHalfPixel: { value: new T.Vector2() }, uWeight: { value: 1 } },
    { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor });

    this.matComposite = mk(`
      uniform sampler2D tScene; uniform sampler2D tBloom;
      uniform vec2 uResolution; uniform float uTime;
      uniform float uExposure, uBloom, uSaturation, uContrast, uVignette, uGrain, uCA, uSpeed, uSpeedLines, uFlash, uLift;
      uniform vec3 uBloomTint, uTemp, uShadowTint, uHighlightTint, uVignetteColor, uFlashColor;
      uniform vec2 uCenter;
      uniform float uUseBloom; uniform vec2 uSunUV; uniform float uGod;
      varying vec2 vUv;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      // Khronos PBR Neutral: identity below ~0.76, smooth hue-preserving shoulder above.
      vec3 neutralTone(vec3 color){
        const float startCompression = 0.8 - 0.04; const float desaturation = 0.15;
        float x = min(color.r, min(color.g, color.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        color -= offset;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < startCompression) return color;
        const float d = 1.0 - startCompression;
        float newPeak = 1.0 - d * d / (peak + d - startCompression);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
        return mix(color, newPeak * vec3(1.0), g);
      }
      vec3 toSRGB(vec3 c){
        c = clamp(c, 0.0, 1.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      // Edge-directed AA for tiers without MSAA (FXAA 1.0 on tone-mapped samples, bloom folded in).
      uniform float uFxaa; uniform vec2 uTexel;
      vec3 tmSample(vec2 p, vec3 bloom){ return neutralTone(max((texture2D(tScene, p).rgb + bloom) * uExposure, vec3(0.0))); }
      vec3 fxaa(vec2 uv, vec3 bloom){
        vec3 nw = tmSample(uv + vec2(-1.0, -1.0) * uTexel, bloom), ne = tmSample(uv + vec2(1.0, -1.0) * uTexel, bloom);
        vec3 sw = tmSample(uv + vec2(-1.0, 1.0) * uTexel, bloom), se = tmSample(uv + vec2(1.0, 1.0) * uTexel, bloom);
        vec3 m = tmSample(uv, bloom);
        float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(m);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
        float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
        float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
        dir = clamp(dir * rcp, vec2(-6.0), vec2(6.0)) * uTexel;
        vec3 a = 0.5 * (tmSample(uv + dir * (1.0 / 3.0 - 0.5), bloom) + tmSample(uv + dir * (2.0 / 3.0 - 0.5), bloom));
        vec3 b = a * 0.5 + 0.25 * (tmSample(uv + dir * -0.5, bloom) + tmSample(uv + dir * 0.5, bloom));
        float lB = luma(b);
        return (lB < lMin || lB > lMax) ? a : b;
      }

      void main(){
        vec2 uv = vUv;
        float aspect = uResolution.x / uResolution.y;
        vec2 d = uv - uCenter;
        float r = length(d * vec2(aspect, 1.0));
        vec3 col;
        if (uSpeed > 0.002) {
          // Radial zoom blur that leaves the rider (centre) crisp.
          float amt = uSpeed * 0.075 * smoothstep(0.10, 0.85, r);
          col = vec3(0.0); float ws = 0.0;
          for (int i = 0; i < 6; i++) {
            float t = float(i) / 5.0; float w = 1.0 - t * 0.55;
            col += texture2D(tScene, uv - d * amt * t).rgb * w; ws += w;
          }
          col /= ws;
        } else {
          col = texture2D(tScene, uv).rgb;
        }
        if (uCA > 0.0005) {
          vec2 o = d * uCA * (0.4 + r);
          col.r = texture2D(tScene, uv - o).r;
          col.b = texture2D(tScene, uv + o).b;
        }
        vec3 bloomC = uUseBloom > 0.5 ? texture2D(tBloom, uv).rgb * uBloom * uBloomTint : vec3(0.0);
        // Crepuscular rays: radially smear the bright (sun) pixels toward the sun; trees and
        // islands are dark in the bloom buffer, so the rays are naturally cut by them.
        if (uGod > 0.004 && uUseBloom > 0.5) {
          vec2 toSun = uSunUV - uv;
          float falloff = 1.0 - smoothstep(0.0, 1.25, length(toSun * vec2(aspect, 1.0)));
          vec2 stepv = toSun * 0.085;
          vec2 sp = uv; float wgt = 1.0; vec3 rays = vec3(0.0);
          for (int i = 0; i < 10; i++) { sp += stepv; rays += texture2D(tBloom, sp).rgb * wgt; wgt *= 0.9; }
          // Keep the rider (screen centre, lower half) free of the veil so the hero always reads.
          float clearZone = smoothstep(0.10, 0.34, length((uv - uCenter) * vec2(aspect, 1.0)));
          bloomC += rays * uGod * falloff * clearZone * 0.06 * uBloomTint;
        }
        vec3 c;
        if (uFxaa > 0.5 && uSpeed < 0.002 && uCA < 0.0005) {
          c = toSRGB(fxaa(uv, bloomC));
        } else {
          col += bloomC;
          col *= uExposure;
          col = neutralTone(max(col, vec3(0.0)));
          c = toSRGB(col);
        }

        // Grade in display space.
        c *= uTemp;
        float l = luma(c);
        c += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighlightTint * smoothstep(0.45, 1.0, l);
        c = c + uLift * (1.0 - c);
        c = mix(vec3(0.5), c, uContrast);
        // S-curve gives punch without clipping.
        c = mix(c, c * c * (3.0 - 2.0 * c), clamp((uContrast - 1.0) * 1.6, 0.0, 0.5));
        l = luma(c);
        float sat = luma(abs(c - l));
        c = mix(vec3(l), c, uSaturation + (1.0 - clamp(sat * 3.0, 0.0, 1.0)) * (uSaturation - 1.0) * 0.35);

        // Speed streaks: thin radial lines that grow with turbo/downhill.
        if (uSpeedLines > 0.01) {
          float ang = atan(d.y, d.x);
          float cell = floor(ang * 46.0);
          float n = hash(vec2(cell, floor(uTime * 22.0)));
          float n2 = hash(vec2(cell * 1.7, floor(uTime * 11.0)));
          float line = smoothstep(0.86, 1.0, n) * smoothstep(0.35 - 0.2 * n2, 0.95, r);
          c += line * uSpeedLines * 0.42;
        }

        // Vignette + damage flash.
        float v = smoothstep(0.35, 1.05, r);
        c = mix(c, uVignetteColor, v * uVignette);
        c = mix(c, uFlashColor, uFlash * smoothstep(0.25, 1.0, r) * 0.85);

        // Dither / film grain (also removes 8-bit banding in dark sky gradients).
        c += (hash(uv * uResolution + fract(uTime * 7.31)) - 0.5) * uGrain;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null }, uResolution: { value: new T.Vector2(1, 1) }, uTime: { value: 0 },
      uExposure: { value: 1 }, uBloom: { value: 0.4 }, uSaturation: { value: 1 }, uContrast: { value: 1 },
      uVignette: { value: 0.3 }, uGrain: { value: 0.015 }, uCA: { value: 0 }, uSpeed: { value: 0 }, uSpeedLines: { value: 0 },
      uFlash: { value: 0 }, uLift: { value: 0 }, uBloomTint: { value: new T.Color(1, 1, 1) }, uTemp: { value: new T.Color(1, 1, 1) },
      uShadowTint: { value: new T.Color(0, 0, 0) }, uHighlightTint: { value: new T.Color(0, 0, 0) },
      uVignetteColor: { value: new T.Color(0, 0, 0) }, uFlashColor: { value: new T.Color(1, 0.1, 0.1) },
      uCenter: { value: new T.Vector2(0.5, 0.42) }, uUseBloom: { value: 1 }, uFxaa: { value: 0 }, uTexel: { value: new T.Vector2(1, 1) }, uSunUV: { value: new T.Vector2(0.5, 0.8) }, uGod: { value: 0 }
    });
  }

  // ---------- Configuration ----------
  // tier: 'off' | 'medium' | 'high'. Returns the tier actually achieved.
  configure(tier, canvasW, canvasH, scale = 1) {
    const cfg = { off: null, low: null, medium: { msaa: 0, levels: 4 }, high: { msaa: 4, levels: 5 } }[tier];
    this.tier = tier;
    this.renderScale = scale;
    this.canvasSize.set(canvasW, canvasH);
    if (!cfg || !this.supported) { this.disposeTargets(); this.enabled = false; return 'off'; }
    this.wantMsaa = Math.min(cfg.msaa, this.maxSamples);
    this.bloomLevels = cfg.levels;
    this.disposeTargets(); // a tier change must rebuild the MSAA level and bloom chain
    this.allocate();
    return this.enabled ? tier : 'off';
  }

  allocate() {
    const T = this.T;
    const w = Math.max(16, Math.round(this.canvasSize.x * this.renderScale));
    const h = Math.max(16, Math.round(this.canvasSize.y * this.renderScale));
    if (this.rtScene && this.rtSize.x === w && this.rtSize.y === h && this.rtScene.samples === this.msaa && this.enabled) return;
    this.disposeTargets();
    const attempts = [];
    if (this.hdr) {
      if (this.wantMsaa > 0) attempts.push([T.HalfFloatType, this.wantMsaa]);
      attempts.push([T.HalfFloatType, 0]);
    }
    if (this.wantMsaa > 0) attempts.push([T.UnsignedByteType, this.wantMsaa]);
    attempts.push([T.UnsignedByteType, 0]);
    let rt = null, chosen = null;
    for (const [type, samples] of attempts) {
      rt = this.tryTarget(w, h, type, samples);
      if (rt) { chosen = { type, samples }; break; }
    }
    if (!rt) { this.enabled = false; this.supported = false; return; }
    this.rtScene = rt;
    this.rtSize.set(w, h);
    this.msaa = chosen.samples;
    this.rtType = chosen.type;
    // Bloom chain. Half-float when available, otherwise 8-bit (still functional).
    const mipType = chosen.type;
    let mw = Math.max(8, w >> 1), mh = Math.max(8, h >> 1);
    this.mips = [];
    for (let i = 0; i < this.bloomLevels && mw >= 8 && mh >= 8; i++) {
      const mrt = new T.WebGLRenderTarget(mw, mh, {
        type: mipType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false,
        depthBuffer: false, stencilBuffer: false, colorSpace: T.LinearSRGBColorSpace
      });
      this.mips.push({ rt: mrt, w: mw, h: mh });
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
    this.enabled = true;
  }

  resize(canvasW, canvasH) {
    this.canvasSize.set(canvasW, canvasH);
    if (this.tier === 'off' || this.tier === 'low' || !this.supported) return;
    this.allocate();
  }

  setRenderScale(scale) {
    scale = Math.max(0.4, Math.min(1, scale));
    if (Math.abs(scale - this.renderScale) < 0.01) return false;
    this.renderScale = scale;
    if (this.enabled) this.allocate();
    return true;
  }

  disposeTargets() {
    if (this.rtScene) this.rtScene.dispose();
    this.rtScene = null;
    this.mips.forEach(m => m.rt.dispose());
    this.mips = [];
    this.enabled = false;
  }

  dispose() {
    this.disposeTargets();
    for (const m of [this.matPrefilter, this.matDown, this.matUp, this.matComposite]) m.dispose();
    this.quad.geometry.dispose();
  }

  // ---------- Grade presets ----------
  // Values are targets; the live state eases toward them so world changes cross-fade.
  static presetFor(theme) {
    const base = { exposure: 1.02, bloom: 0.42, threshold: 0.95, knee: 0.55, saturation: 1.12, contrast: 1.1, vignette: 0.30,
      temp: [1.02, 1.0, 0.97], shadow: [0.0, 0.01, 0.03], highlight: [0.03, 0.02, 0.0], bloomTint: [1, 0.96, 0.9], vignetteColor: [0.02, 0.04, 0.08], lift: 0.0, god: 0.26 };
    const P = {
      garden:       { ...base },
      desert:       { ...base, god: 0.3, exposure: 0.93, temp: [1.06, 1.0, 0.9], saturation: 1.16, highlight: [0.05, 0.025, 0.0], bloom: 0.36, shadow: [0.03, 0.0, 0.01], vignetteColor: [0.08, 0.03, 0.0] },
      forest:       { ...base, temp: [0.98, 1.03, 0.98], shadow: [0.0, 0.03, 0.02], saturation: 1.14, vignette: 0.36, vignetteColor: [0.0, 0.05, 0.03] },
      castle_bridge:{ ...base, temp: [1.0, 1.0, 1.02], contrast: 1.12 },
      waterfalls:   { ...base, temp: [0.97, 1.02, 1.05], saturation: 1.15, bloom: 0.5 },
      crystal:      { ...base, god: 0.14, temp: [1.0, 0.97, 1.06], shadow: [0.03, 0.0, 0.07], highlight: [0.03, 0.0, 0.05], saturation: 1.2, bloom: 0.58, threshold: 0.9, contrast: 1.14, vignette: 0.4, vignetteColor: [0.05, 0.0, 0.1] },
      snow:         { ...base, god: 0.16, temp: [0.97, 1.0, 1.06], saturation: 1.04, exposure: 0.9, bloom: 0.22, threshold: 1.15, lift: 0.0, shadow: [0.0, 0.02, 0.05] },
      volcano:      { ...base, god: 0.5, temp: [1.08, 0.97, 0.9], shadow: [0.06, 0.0, 0.0], highlight: [0.06, 0.02, 0.0], saturation: 1.18, contrast: 1.18, bloom: 0.7, threshold: 0.85, vignette: 0.45, vignetteColor: [0.1, 0.0, 0.0] },
      mushroom:     { ...base, temp: [1.02, 1.0, 1.02], saturation: 1.2, bloom: 0.55, shadow: [0.04, 0.0, 0.05] },
      temple:       { ...base, god: 0.4, exposure: 0.96, temp: [1.06, 1.02, 0.92], saturation: 1.1, highlight: [0.05, 0.03, 0.0], vignette: 0.36, vignetteColor: [0.06, 0.03, 0.0] },
      sunset:       { ...base, god: 0.7, temp: [1.09, 0.99, 0.9], saturation: 1.2, bloom: 0.62, threshold: 0.85, highlight: [0.06, 0.02, 0.01], shadow: [0.04, 0.0, 0.04], vignette: 0.38, vignetteColor: [0.1, 0.02, 0.04] },
      workshop:     { ...base, temp: [1.03, 1.0, 0.96], saturation: 1.05, contrast: 1.14, bloom: 0.5 },
      storm:        { ...base, god: 0.0, temp: [0.96, 1.0, 1.05], saturation: 0.98, contrast: 1.16, exposure: 0.98, vignette: 0.5, bloom: 0.5, shadow: [0.0, 0.02, 0.05], vignetteColor: [0.0, 0.02, 0.06] },
      moon:         { ...base, god: 0.22, temp: [0.96, 0.98, 1.08], saturation: 1.12, bloom: 0.85, threshold: 0.75, contrast: 1.16, vignette: 0.46, shadow: [0.02, 0.02, 0.08], highlight: [0.02, 0.03, 0.06], vignetteColor: [0.02, 0.02, 0.08], exposure: 1.05 },
      rapids:       { ...base, temp: [1.0, 1.0, 1.02], saturation: 1.22, bloom: 0.6 },
      grand_run:    { ...base, god: 0.16, exposure: 0.84, saturation: 1.15, bloom: 0.34, threshold: 1.1, contrast: 1.14 }
    };
    return P[theme] || P.garden;
  }

  applyPreset(theme, immediate = false) {
    const p = PostFX.presetFor(theme), t = this.target;
    t.exposure = p.exposure; t.bloom = p.bloom; t.threshold = p.threshold; t.knee = p.knee;
    t.saturation = p.saturation; t.contrast = p.contrast; t.vignette = p.vignette; t.lift = p.lift || 0; t.god = p.god;
    t.temp.setRGB(...p.temp); t.shadowTint.setRGB(...p.shadow); t.highlightTint.setRGB(...p.highlight);
    t.bloomTint.setRGB(...p.bloomTint); t.vignetteColor.setRGB(...p.vignetteColor);
    if (immediate) this.snapState();
  }

  snapState() {
    for (const k of Object.keys(this.target)) {
      const v = this.target[k];
      if (v && v.isColor) this.state[k].copy(v); else if (typeof v === 'number') this.state[k] = v;
    }
  }

  // Transient game feedback ------------------------------------------------
  flash(amount = 0.8) { this.state.flash = Math.max(this.state.flash, amount); this.impulseCA = Math.max(this.impulseCA, amount * 0.9); }
  kick(amount = 0.5) { this.impulseCA = Math.max(this.impulseCA, amount); }

  // fx = { speed:0..1, lines:0..1 } set every frame by the game.
  update(dt, fx = {}) {
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    const s = this.state, t = this.target, k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['exposure', 'bloom', 'threshold', 'knee', 'saturation', 'contrast', 'vignette', 'lift', 'god']) s[key] += (t[key] - s[key]) * k;
    for (const key of ['bloomTint', 'temp', 'shadowTint', 'highlightTint', 'vignetteColor']) s[key].lerp(t[key], k);
    const fast = 1 - Math.exp(-dt * 6);
    s.speed += ((fx.speed || 0) - s.speed) * fast;
    s.speedLines += ((fx.lines || 0) - s.speedLines) * fast;
    s.warn += ((fx.warn || 0) - s.warn) * fast;
    s.godLive += ((fx.god || 0) - s.godLive) * fast;
    if (fx.sunUV) { s.sunUV.r = fx.sunUV[0]; s.sunUV.g = fx.sunUV[1]; }
    s.flash = Math.max(0, s.flash - dt * 2.4);
    this.impulseCA = Math.max(0, this.impulseCA - dt * 3.0);
    s.ca = (fx.ca || 0) + this.impulseCA * 0.012;
  }

  // ---------- Rendering ----------
  pass(material, target) {
    const r = this.renderer;
    this.quad.material = material;
    r.setRenderTarget(target);
    r.render(this.fsScene, this.fsCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled || !this.rtScene) { r.render(scene, camera); return; }
    const info = r.info, prevAuto = info.autoReset;
    info.autoReset = false; info.reset();
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    this.sceneInfo.calls = info.render.calls; this.sceneInfo.triangles = info.render.triangles;

    const s = this.state, mips = this.mips, f = this.features;
    const useBloom = mips.length > 1 && s.bloom > 0.005;
    let bloomTex = null;
    if (useBloom) {
      const m0 = mips[0], pre = this.matPrefilter;
      pre.uniforms.tSource.value = this.rtScene.texture;
      pre.uniforms.uHalfPixel.value.set(0.5 / this.rtSize.x, 0.5 / this.rtSize.y);
      pre.uniforms.uThreshold.value = s.threshold; pre.uniforms.uKnee.value = s.knee;
      this.pass(pre, m0.rt);
      for (let i = 1; i < mips.length; i++) {
        const prev = mips[i - 1];
        this.matDown.uniforms.tSource.value = prev.rt.texture;
        this.matDown.uniforms.uHalfPixel.value.set(0.5 / prev.w, 0.5 / prev.h);
        this.pass(this.matDown, mips[i].rt);
      }
      r.autoClear = false;
      for (let i = mips.length - 2; i >= 0; i--) {
        const lower = mips[i + 1];
        this.matUp.uniforms.tSource.value = lower.rt.texture;
        this.matUp.uniforms.uHalfPixel.value.set(0.5 / lower.w, 0.5 / lower.h);
        this.matUp.uniforms.uWeight.value = i === 0 ? 0.9 : 1.05;
        this.pass(this.matUp, mips[i].rt);
      }
      r.autoClear = true;
      bloomTex = mips[0].rt.texture;
    }

    const u = this.matComposite.uniforms;
    u.tScene.value = this.rtScene.texture; u.tBloom.value = bloomTex; u.uUseBloom.value = useBloom ? 1 : 0;
    u.uResolution.value.set(this.canvasSize.x, this.canvasSize.y); u.uTime.value = this.time;
    u.uSunUV.value.set(s.sunUV.r, s.sunUV.g); u.uGod.value = this.features.rays === false ? 0 : s.god * s.godLive;
    u.uFxaa.value = this.msaa === 0 ? 1 : 0; u.uTexel.value.set(1 / this.rtSize.x, 1 / this.rtSize.y);
    u.uExposure.value = s.exposure * (this.baseExposure || 1); u.uBloom.value = s.bloom; u.uBloomTint.value.copy(s.bloomTint);
    u.uSaturation.value = s.saturation; u.uContrast.value = s.contrast; u.uLift.value = s.lift;
    u.uTemp.value.copy(s.temp); u.uShadowTint.value.copy(s.shadowTint); u.uHighlightTint.value.copy(s.highlightTint);
    u.uVignette.value = s.vignette; u.uVignetteColor.value.copy(s.vignetteColor);
    u.uFlash.value = Math.max(s.flash, s.warn * 0.24); u.uFlashColor.value.copy(s.flashColor);
    u.uGrain.value = f.grain ? s.grain : 0.004;
    u.uCA.value = f.ca ? s.ca : 0; u.uSpeed.value = f.blur ? s.speed : 0; u.uSpeedLines.value = f.lines ? s.speedLines : 0;
    this.pass(this.matComposite, null);
    info.autoReset = prevAuto;
  }
};
