// SKY SCOOTER — LOUFFI EDITION
// Global material upgrade. Patches three's Standard/Lambert/Physical shaders once (via
// the prototype hook) so every existing material - GLB kit, procedural props, road
// slabs - gains: sun-scattering atmospheric fog, height haze, a soft sky-tinted
// fresnel rim, subtle world-space colour variation and an optional curved horizon.
// Shared uniforms mean one update per frame regardless of material count.
window.SceneFx = (function () {
  const T = window.THREE;
  const U = {
    uSunDirView: { value: new T.Vector3(0, 0.4, -1) },
    uSunColor: { value: new T.Color(1.0, 0.86, 0.62) },
    uSunScatter: { value: 0.45 },
    uRimColor: { value: new T.Color(0.55, 0.78, 1.0) },
    uRimStrength: { value: 0.3 },
    uDetail: { value: 0.1 },
    uCurve: { value: 0.0002 },
    uCurveStart: { value: 10.0 },
    uFogBase: { value: -6.0 },
    uFogFall: { value: 0.05 },
    uHeightFog: { value: 0.7 }
  };
  const enabled = { curve: true, detail: true, rim: true, fog: true };

  const uniformDecl = `
    uniform vec3 uSunDirView; uniform vec3 uSunColor; uniform float uSunScatter;
    uniform vec3 uRimColor; uniform float uRimStrength; uniform float uDetail;
    uniform float uCurve; uniform float uCurveStart; uniform float uFogBase; uniform float uFogFall; uniform float uHeightFog;
    varying vec3 vFxWorld;
  `;
  const noiseFn = `
    float fxHash(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
    float fxNoise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
  `;

  function patch(shader) {
    if (this.userData && this.userData.noFx) return;
    Object.assign(shader.uniforms, U);
    // ---- vertex: world position varying + curved horizon ----
    let vs = shader.vertexShader;
    vs = vs.replace('void main() {', uniformDecl + 'void main() {');
    const projectChunk = T.ShaderChunk.project_vertex;
    if (vs.includes('#include <project_vertex>') && projectChunk.includes('mvPosition = modelViewMatrix * mvPosition;')) {
      const curved = projectChunk.replace('mvPosition = modelViewMatrix * mvPosition;', `
        vFxWorld = (modelMatrix * mvPosition).xyz;
        mvPosition = modelViewMatrix * mvPosition;
        float fxDepth = max(0.0, -mvPosition.z - uCurveStart);
        mvPosition.y -= fxDepth * fxDepth * uCurve;`);
      vs = vs.replace('#include <project_vertex>', curved);
    }
    shader.vertexShader = vs;
    // ---- fragment ----
    let fs = shader.fragmentShader;
    fs = fs.replace('void main() {', uniformDecl + noiseFn + 'void main() {');
    if (fs.includes('#include <color_fragment>')) {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        #ifndef FX_NO_DETAIL
        { float fxn = fxNoise(vFxWorld.xz * 0.21 + vFxWorld.y * 0.13) * 0.65 + fxNoise(vFxWorld.xz * 0.9 - vFxWorld.y * 0.4) * 0.35;
          diffuseColor.rgb *= 1.0 + (fxn - 0.5) * uDetail; }
        #endif`);
    }
    if (fs.includes('#include <lights_fragment_end>')) {
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #ifdef FX_DIRECT_SPEC
          reflectedLight.directSpecular *= float(FX_DIRECT_SPEC);
        #endif`);
    }
    if (fs.includes('#include <opaque_fragment>')) {
      fs = fs.replace('#include <opaque_fragment>', `
        { vec3 fxV = normalize(vViewPosition);
          float fxF = pow(1.0 - clamp(dot(normal, fxV), 0.0, 1.0), 3.0);
          float fxL = clamp(dot(normal, uSunDirView) * 0.5 + 0.65, 0.0, 1.0);
          outgoingLight += uRimColor * (fxF * uRimStrength * fxL); }
        #include <opaque_fragment>`);
    }
    if (fs.includes('#include <fog_fragment>')) {
      fs = fs.replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          vec3 fxRay = -normalize(vViewPosition);
          float fxSun = pow(clamp(dot(fxRay, uSunDirView), 0.0, 1.0), 5.0);
          float fxLow = 1.0 - exp(-max(uFogBase - vFxWorld.y, 0.0) * uFogFall);
          fogFactor = clamp(1.0 - (1.0 - fogFactor) * (1.0 - fxLow * uHeightFog), 0.0, 1.0);
          vec3 fxFog = mix(fogColor, uSunColor, fxSun * uSunScatter * (0.35 + 0.65 * fogFactor));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fxFog, fogFactor);
        #endif`);
    }
    shader.fragmentShader = fs;
  }

  function cacheKey() { return this.userData && this.userData.noFx ? 'fx0' : 'fx4'; }
  for (const M of [T.MeshStandardMaterial, T.MeshLambertMaterial, T.MeshPhysicalMaterial]) {
    M.prototype.onBeforeCompile = patch;
    M.prototype.customProgramCacheKey = cacheKey;
  }

  const tmp = new T.Vector3();
  const api = {
    uniforms: U,
    // Sun direction comes from the visible sun sprite so haze glows where the sun actually is.
    update(camera, sunPos) {
      if (!sunPos) return;
      tmp.subVectors(sunPos, camera.position).normalize();
      tmp.transformDirection(camera.matrixWorldInverse);
      U.uSunDirView.value.copy(tmp);
    },
    setWorld(round, game) {
      const theme = round.theme || '';
      const warm = ['sunset', 'volcano', 'desert', 'temple'].includes(theme);
      const night = ['moon', 'neon'].includes(theme);
      const storm = theme === 'storm';
      U.uSunColor.value.set(night ? 0xa9c1ff : warm ? 0xffb066 : storm ? 0xcfe4ff : 0xffe4a8);
      U.uSunScatter.value = night ? 0.12 : storm ? 0.08 : warm ? 0.16 : 0.14; // low: haze must not wash out the road
      U.uRimColor.value.set(night ? 0x7f98ff : warm ? 0xffa46d : 0x9fd6ff);
      U.uRimStrength.value = night ? 0.38 : storm ? 0.2 : 0.24;
      U.uFogBase.value = -5.0;
      U.uHeightFog.value = storm ? 0.9 : 0.7;
    },
    setCurve(k) { U.uCurve.value = k; },
    enabled
  };
  return api;
})();
