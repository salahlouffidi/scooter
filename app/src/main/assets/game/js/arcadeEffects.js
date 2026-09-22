// Shared tuning keeps controls and generated-route validation in agreement.
window.ScooterTuning = Object.freeze({
  testAllRounds: true, cruiseMultiplier: 1.25, boostMultiplier: 1.55,
  maxSpeed: 28, lateralSpeed: 9, brakeFactor: .65, jumpVelocity: 10.5, gravity: 22,
  antigravityDuration: 8, antigravityGravity: .22, antigravitySteer: 1.45,
  antigravityResponse: 38, glideFallSpeed: 1.4, hoverHeight: .32
});

window.createScooterStar = function(T, radius = .5) {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 ? .45 : 1);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new T.ShapeGeometry(shape);
};

// Powered-flight exhaust: world-space smoke in one draw call and two layered jets.
window.FlightExhaust = class FlightExhaust {
  constructor(parent, T) {
    this.T = T; this.root = new T.Group(); this.root.name = 'flightNitro'; parent.add(this.root);
    this.pool = Array.from({length: 64}, () => ({life: 0, maxLife: 1, radius: .2, p: new T.Vector3(), v: new T.Vector3(), boost: 0}));
    this.positions = new Float32Array(this.pool.length * 3);
    this.sizes = new Float32Array(this.pool.length); this.opacities = new Float32Array(this.pool.length);
    const geometry = new T.BufferGeometry();
    for (const [name, array, size] of [['position', this.positions, 3], ['smokeSize', this.sizes, 1], ['smokeOpacity', this.opacities, 1]])
      geometry.setAttribute(name, new T.BufferAttribute(array, size).setUsage(T.DynamicDrawUsage));
    const material = new T.ShaderMaterial({
      uniforms: {pixelHeight: {value: 720}}, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `
        attribute float smokeSize;
        attribute float smokeOpacity;
        uniform float pixelHeight;
        varying float opacity;
        void main() {
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          opacity = smokeOpacity;
          gl_PointSize = clamp(smokeSize * pixelHeight * projectionMatrix[1][1] / max(0.1, -p.z), 1.0, 128.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        varying float opacity;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r = dot(uv, uv);
          float cloud = exp(-r * 2.6) * (1.0 - smoothstep(0.55, 1.0, r));
          float alpha = cloud * opacity;
          if (alpha < 0.003) discard;
          vec3 tint = mix(vec3(0.17, 0.22, 0.34), vec3(0.65, 0.69, 0.82), 0.65 - uv.y * 0.2);
          gl_FragColor = vec4(tint, alpha);
          ${T.ShaderChunk.colorspace_fragment ? '#include <colorspace_fragment>' : '#include <encodings_fragment>'}
        }`
    });
    this.smoke = new T.Points(geometry, material); this.smoke.name = 'flightNitroSmoke';
    this.smoke.frustumCulled = false; this.root.add(this.smoke);
    const viewport = new T.Vector2();
    this.smoke.onBeforeRender = renderer => { renderer.getDrawingBufferSize(viewport); material.uniforms.pixelHeight.value = viewport.y; };
    const flameGeometry = new T.ConeGeometry(.16, 1, 10);
    flameGeometry.rotateX(-Math.PI / 2); flameGeometry.translate(0, 0, -.5);
    this.flames = []; this.cores = [];
    for (const color of [0x637dff, 0xa76bff]) {
      const flame = new T.Mesh(flameGeometry, new T.MeshBasicMaterial({color, transparent: true, opacity: .8, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}));
      const core = new T.Mesh(flameGeometry, new T.MeshBasicMaterial({color: 0xaff7ff, transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}));
      this.flames.push(flame); this.cores.push(core); this.root.add(flame, core);
    }
    this.previous = new T.Vector3(); this.origin = new T.Vector3(); this.cursor = 0;
    this.reset();
  }
  reset() {
    this.pool.forEach(p => { p.life = 0; });
    this.intensity = 0; this.emission = 0; this.time = 0; this.hasPrevious = false;
    this.smoke.geometry.setDrawRange(0, 0); this.root.visible = false;
    for (const f of [...this.flames, ...this.cores]) f.visible = false;
  }
  isFlying(rider) {
    return !!(rider.activeSkyFlight || rider.isGliding || (rider.activeAntigravity && !rider.isGrounded));
  }
  emit(rider, quality, blend) {
    const p = this.pool[this.cursor++ % this.pool.length], boost = rider.activeOverdrive ? 1 : 0;
    this.origin.copy(this.previous).lerp(rider.mesh.position, blend);
    p.p.set(this.cursor % 2 ? -.18 : .18, .28, -1.35).applyQuaternion(rider.mesh.quaternion).add(this.origin);
    p.v.set((Math.random() - .5) * .5, .4 + Math.random() * .25, -1.4 - boost * 1.3).applyQuaternion(rider.mesh.quaternion);
    p.life = p.maxLife = (quality === 'low' ? .8 : 1.1) + boost * .3;
    p.radius = .19 + Math.random() * .09; p.boost = boost;
  }
  update(dt, rider, settings) {
    if (settings.reducedMotion) { this.reset(); return false; }
    dt = Math.max(0, Math.min(dt, .06));
    const position = rider.mesh.position;
    // Respawns/teleports start a new trail instead of drawing smoke across the map.
    if (this.hasPrevious && this.previous.distanceToSquared(position) > 64) this.reset();
    if (!this.hasPrevious) { this.previous.copy(position); this.hasPrevious = true; }
    this.time += dt;
    const flying = this.isFlying(rider), boost = rider.activeOverdrive ? 1 : 0;
    const target = flying ? 1 + boost * .45 : 0;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt * 12));
    if (this.intensity < .005) this.intensity = 0;
    const visible = this.intensity > .02, flicker = .94 + Math.sin(this.time * 26) * .06;
    for (let i = 0; i < this.flames.length; i++) {
      const flame = this.flames[i], core = this.cores[i];
      flame.visible = core.visible = visible;
      if (!visible) continue;
      flame.position.set(i === 0 ? -.18 : .18, .28, -.86).applyQuaternion(rider.mesh.quaternion).add(position);
      flame.quaternion.copy(rider.mesh.quaternion); core.position.copy(flame.position); core.quaternion.copy(flame.quaternion);
      const strength = Math.min(1, this.intensity);
      flame.scale.setScalar(.8 + this.intensity * .15); flame.scale.z = (.6 + this.intensity * .85) * flicker;
      core.scale.set(.42, .42, flame.scale.z * .65);
      flame.material.opacity = strength * .7; core.material.opacity = strength * .95;
    }
    if (flying) {
      const quality = settings.graphicsQuality;
      const rate = (quality === 'low' ? 8 : quality === 'medium' ? 18 : 26) * (1 + boost * .45);
      this.emission += dt * rate;
      const count = Math.floor(this.emission);
      for (let i = 0; i < count; i++) this.emit(rider, quality, (i + 1) / count);
      this.emission -= count;
    } else this.emission = 0;
    this.previous.copy(position);
    let count = 0;
    for (const p of this.pool) {
      p.life -= dt; if (p.life <= 0) continue;
      p.p.addScaledVector(p.v, dt); p.v.y += dt * .15;
      const age = 1 - p.life / p.maxLife;
      p.p.toArray(this.positions, count * 3);
      this.sizes[count] = p.radius + age * (.9 + p.boost * .18);
      this.opacities[count++] = Math.min(1, age * 12) * Math.pow(1 - age, 1.2) * (.65 + p.boost * .08);
    }
    this.smoke.geometry.setDrawRange(0, count);
    for (const attribute of Object.values(this.smoke.geometry.attributes)) attribute.needsUpdate = true;
    this.root.visible = visible || count > 0;
    return visible;
  }
};

// Screen Shake Utility: low-intensity physical impulse for impact feedback without disrupting player control
window.ScreenShake = class ScreenShake {
  constructor(T) {
    this.T = T;
    this.intensity = 0;
    this.maxIntensity = 0.26; // Safe upper bound: prevents disruption of player steering
    this.duration = 0;
    this.timer = 0;
    this.offset = new T.Vector3();
    this.frequency = 36.0;
  }

  trigger(intensity = 0.16, duration = 0.22) {
    // Low-intensity impulse: immediate physical response without disorienting player
    const impulse = Math.min(this.maxIntensity, Math.max(0.04, intensity));
    this.intensity = Math.min(this.maxIntensity, Math.max(this.intensity * 0.4, impulse));
    this.duration = Math.max(0.08, duration);
    this.timer = this.duration;
  }

  reset() {
    this.intensity = 0;
    this.duration = 0;
    this.timer = 0;
    this.offset.set(0, 0, 0);
  }

  update(dt, settings = {}, camera = null) {
    if (this.timer <= 0 || settings.reducedMotion) {
      if (this.timer > 0 && settings.reducedMotion) {
        this.reset();
      }
      this.offset.set(0, 0, 0);
      return this.offset;
    }

    this.timer = Math.max(0, this.timer - dt);
    const progress = this.duration > 0 ? this.timer / this.duration : 0;
    // Smooth quadratic decay curve
    const decay = progress * progress;
    const amp = this.intensity * decay;

    // High-frequency low-amplitude oscillation
    const t = (this.duration - this.timer) * this.frequency;
    const ox = Math.sin(t * 1.35 + 0.4) * amp;
    const oy = Math.cos(t * 1.7) * (amp * 0.65);
    const oz = Math.sin(t * 0.85) * (amp * 0.3);

    this.offset.set(ox, oy, oz);

    if (camera && camera.position) {
      camera.position.add(this.offset);
    }

    return this.offset;
  }
};

// Fixed particle pools and exhaust meshes; no new geometry during play.
window.ArcadeEffects = class ArcadeEffects {
  constructor(scene, T) {
    this.T = T; this.cursor = 0; this.emission = 0;
    this.camera = null;
    this.screenShake = new window.ScreenShake(T);
    this.root = new T.Group(); scene.add(this.root);
    this.pool = Array.from({length: 80}, () => ({life: 0, maxLife: 1, p: new T.Vector3(), v: new T.Vector3(), spin: 0, trail: false, color: new T.Color(0xffdd55)}));
    this.stars = new T.InstancedMesh(window.createScooterStar(T, .18), new T.MeshBasicMaterial({color: 0xffffff, side: T.DoubleSide, depthWrite: false}), this.pool.length);
    this.stars.setColorAt(0, this.pool[0].color);
    this.stars.instanceColor.setUsage(T.DynamicDrawUsage);
    this.stars.instanceMatrix.setUsage(T.DynamicDrawUsage); this.stars.frustumCulled = false;
    this.root.add(this.stars); this.dummy = new T.Object3D();
    this.linesArray = new Float32Array(48 * 6);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(this.linesArray, 3).setUsage(T.DynamicDrawUsage));
    this.wind = new T.LineSegments(geometry, new T.LineBasicMaterial({color: 0xc5f7ff, transparent: true, opacity: .65, depthWrite: false}));
    this.wind.frustumCulled = false; this.root.add(this.wind); this.time = 0;
    // The cone tip points along local -Z, behind the scooter. Copying the
    // rider quaternion keeps both exhausts attached during turns and jumps.
    const flameGeo = new T.ConeGeometry(.16, .65, 8);
    flameGeo.rotateX(-Math.PI / 2);
    this.flames = [0xffa030, 0xff7a1a].map(color => {
      const flame = new T.Mesh(flameGeo, new T.MeshBasicMaterial({color, transparent: true, opacity: .9, depthWrite: false}));
      this.root.add(flame); return flame;
    });
    this.flightExhaust = new window.FlightExhaust(this.root, T);
    this.reset();
  }
  setCamera(camera) {
    this.camera = camera;
  }
  triggerScreenShake(intensity = 0.16, duration = 0.22) {
    return this.screenShake.trigger(intensity, duration);
  }
  shake(intensity = 0.16, duration = 0.22) {
    return this.screenShake.trigger(intensity, duration);
  }
  getScreenShakeOffset() {
    return this.screenShake.offset;
  }
  reset() {
    this.pool.forEach(p => p.life = 0); this.emission = 0; this.time = 0; this.root.visible = false;
    this.flames.forEach(f => { f.visible = false; });
    this.stars.count = 0; this.wind.geometry.setDrawRange(0, 0);
    this.flightExhaust.reset();
    this.screenShake.reset();
  }
  burst(position, count = 16, color = 0xffdd55) {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor++ % this.pool.length], a = i * 2.39996;
      p.trail = false; p.hover = false; p.color.set(color);
      p.p.copy(position); p.p.y += .8; p.v.set(Math.cos(a) * 2.4, 1.5 + Math.random() * 2, Math.sin(a) * 2.4);
      p.life = p.maxLife = .55 + Math.random() * .35; p.spin = a;
    }
  }
  emitTrail(rider, flying = false) {
    const p = this.pool[this.cursor++ % this.pool.length];
    p.trail = true;
    p.hover = !!rider.activeAntigravity;
    p.p.set(0, .32, -1.3).applyQuaternion(rider.mesh.quaternion).add(rider.mesh.position);
    p.v.set(Math.sin(this.time * 17) * .35, p.hover ? .9 : .3, -.8).applyQuaternion(rider.mesh.quaternion);
    p.color.setHSL(p.hover ? .76 + Math.sin(this.time * 4) * .025 : flying ? .62 + Math.sin(this.time * 4) * .05 : (this.time * .45) % 1, .95, p.hover ? .75 : .62);
    p.life = p.maxLife = p.hover ? 1 : .8; p.spin = this.time * 8;
  }
  update(dt, rider, track, settings, playing, camera = this.camera) {
    const cam = camera || this.camera;
    this.screenShake.update(dt, settings, cam);
    this.root.visible = playing;
    if (!playing) { this.flames.forEach(f => { f.visible = false; }); this.flightExhaust.root.visible = false; return; }
    this.time += dt;
    const T = this.T, tan = track.getTrackTangent(rider.s), pos = rider.mesh.position;
    const rush = Math.max(rider.activeOverdrive ? 1 : 0, rider.activeSkyFlight ? 2 : 0, rider.activeAntigravity ? 1.2 : 0, rider.downhillIntensity || 0);
    const count = settings.reducedMotion ? 0 : (settings.graphicsQuality === 'low' ? 16 : 48);
    this.wind.material.opacity = .12 + rush * .65;
    this.wind.material.color.set(rider.activeAntigravity ? 0xc18aff : rider.activeSkyFlight ? 0x70f4ff : rider.activeOverdrive ? 0xffe9a0 : 0xc5f7ff);
    for (let i = 0; i < count; i++) {
      const cycle = (this.time * (1.4 + rush) + i * .618) % 1;
      const behind = .5 + cycle * (6 + rush * 5), angle = i * 2.39996;
      const side = Math.cos(angle) * (1.2 + (i % 3) * .45), height = .65 + (Math.sin(angle) + 1) * .9;
      const x = pos.x - tan.x * behind - tan.z * side, y = pos.y + height, z = pos.z - tan.z * behind + tan.x * side;
      const length = .45 + rush * 1.8, j = i * 6;
      this.linesArray.set([x, y, z, x - tan.x * length, y + .03, z - tan.z * length], j);
    }
    this.wind.geometry.setDrawRange(0, count * 2); this.wind.geometry.attributes.position.needsUpdate = true;
    const flightVisible = this.flightExhaust.update(dt, rider, settings);
    const boostOn = rider.activeOverdrive && !settings.reducedMotion;
    const turboOn = boostOn && !flightVisible;
    const flicker = .85 + Math.sin(this.time * 34) * .15;
    this.flames.forEach((flame, i) => {
      flame.visible = turboOn;
      if (!turboOn) return;
      flame.position.set(i === 0 ? -.18 : .18, .28, -.95).applyQuaternion(rider.mesh.quaternion).add(pos);
      flame.quaternion.copy(rider.mesh.quaternion);
      flame.scale.set(1, 1, flicker);
      flame.material.opacity = .75 + flicker * .2;
    });
    if (boostOn || flightVisible || (rider.activeAntigravity && !settings.reducedMotion)) {
      this.emission += dt * (settings.graphicsQuality === 'low' ? 5 : 10);
      while (this.emission >= 1) { this.emitTrail(rider, this.flightExhaust.isFlying(rider)); this.emission--; }
    } else {
      this.emission = 0;
    }
    let visible = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (settings.reducedMotion && p.trail) { p.life = 0; continue; }
      p.life -= dt; if (p.life <= 0) continue;
      p.p.addScaledVector(p.v, dt); p.v.y -= dt * (p.hover ? .15 : 3);
      this.dummy.position.copy(p.p); this.dummy.rotation.set(0, this.time * 2 + p.spin, this.time * 4 + p.spin);
      this.dummy.scale.setScalar(Math.min(1, p.life / p.maxLife * 2) * (p.trail ? .42 : 1)); this.dummy.updateMatrix();
      this.stars.setColorAt(visible, p.color);
      this.stars.setMatrixAt(visible++, this.dummy.matrix);
    }
    this.stars.count = visible; this.stars.instanceMatrix.needsUpdate = true; this.stars.instanceColor.needsUpdate = true;
  }
};
