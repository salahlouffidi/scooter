// SKY SCOOTER — LOUFFI EDITION
// Grounding effects for the rider: a height-aware contact shadow, a state-coloured
// underglow, and a fixed pool of soft dust puffs for take-off, landing and hard turns.
// Purely visual: reads controller state, never writes to it.

// Height of the surface the current draw call renders into, in pixels (point-size maths).
window.viewportPixelHeight = function (renderer, out) {
  const rt = renderer.getRenderTarget();
  if (rt) return rt.height;
  renderer.getDrawingBufferSize(out);
  return out.y;
};

window.SoftParticles = class SoftParticles {
  constructor(parent, T, count = 64) {
    this.T = T;
    this.count = count;
    this.pool = Array.from({ length: count }, () => ({
      life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.2, grow: 1, r: 1, g: 1, b: 1, a: 0.5, drag: 1.5, rise: 0
    }));
    this.positions = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.colors = new Float32Array(count * 4);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('pSize', new T.BufferAttribute(this.sizes, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('pColor', new T.BufferAttribute(this.colors, 4).setUsage(T.DynamicDrawUsage));
    const material = new T.ShaderMaterial({
      uniforms: { pixelHeight: { value: 720 } }, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `
        attribute float pSize; attribute vec4 pColor; uniform float pixelHeight; varying vec4 vColor;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vColor = pColor;
          gl_PointSize = clamp(pSize * pixelHeight * projectionMatrix[1][1] / max(0.1, -mv.z), 1.0, 160.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){
          vec2 uv = gl_PointCoord * 2.0 - 1.0; float r = dot(uv, uv);
          float a = exp(-r * 2.8) * (1.0 - smoothstep(0.6, 1.0, r)) * vColor.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor.rgb, a);
        }`
    });
    this.points = new T.Points(g, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'softParticles';
    const v = new T.Vector2();
    this.points.onBeforeRender = renderer => { material.uniforms.pixelHeight.value = window.viewportPixelHeight(renderer, v); };
    parent.add(this.points);
    this.cursor = 0;
    this.reset();
  }
  reset() { this.pool.forEach(p => { p.life = 0; }); this.points.geometry.setDrawRange(0, 0); }
  emit(x, y, z, vx, vy, vz, size, grow, life, color, alpha, rise = 0.2) {
    const p = this.pool[this.cursor++ % this.count];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.grow = grow; p.life = p.max = life;
    p.r = color.r; p.g = color.g; p.b = color.b; p.a = alpha; p.rise = rise;
  }
  update(dt) {
    let n = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-dt * 2.2);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.rise * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const age = 1 - p.life / p.max;
      this.positions[n * 3] = p.x; this.positions[n * 3 + 1] = p.y; this.positions[n * 3 + 2] = p.z;
      this.sizes[n] = p.size * (1 + age * p.grow);
      this.colors[n * 4] = p.r; this.colors[n * 4 + 1] = p.g; this.colors[n * 4 + 2] = p.b;
      this.colors[n * 4 + 3] = p.a * Math.min(1, age * 10) * Math.pow(1 - age, 1.4);
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const a of Object.values(g.attributes)) a.needsUpdate = true;
    return n;
  }
};

window.RiderFx = class RiderFx {
  constructor(scene, T) {
    this.T = T;
    this.root = new T.Group();
    this.root.name = 'riderFx';
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    const tex = (inner, outer) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.55, outer); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    };
    const blobGeo = new T.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
    this.blob = new T.Mesh(blobGeo, new T.MeshBasicMaterial({
      map: tex('rgba(0,0,0,0.9)', 'rgba(0,0,0,0.45)'), transparent: true, depthWrite: false, opacity: 0.4, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    this.blob.scale.set(1.35, 1, 2.5); this.blob.renderOrder = 1;
    this.glow = new T.Mesh(blobGeo, new T.MeshBasicMaterial({
      map: tex('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)'), transparent: true, depthWrite: false, opacity: 0.4,
      blending: T.AdditiveBlending, fog: false, toneMapped: false, color: 0x39d5ff,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
    }));
    this.glow.scale.set(1.6, 1, 3.0); this.glow.renderOrder = 2;
    this.root.add(this.blob, this.glow);
    this.dust = new window.SoftParticles(scene, T, 72);
    this.tmpColor = new T.Color();
    this.dustColor = new T.Color(0xe9dfd0).lerp(new T.Color(0x9aa6b3), 0.25);
    this.back = new T.Vector3();
    this.glowColor = new T.Color(0x39d5ff);
    this.wasGrounded = true; this.fallSpeed = 0; this.skid = 0; this.time = 0;
    this.onLand = null; this.onTakeoff = null;
    this.root.visible = false;
  }

  reset() {
    this.wasGrounded = true; this.fallSpeed = 0; this.skid = 0;
    this.dust.reset();
  }

  update(dt, rider, track, settings, visible) {
    this.root.visible = visible;
    this.dust.update(dt);
    if (!visible) return;
    const T = this.T, mesh = rider.mesh, quiet = !!settings.reducedMotion;
    this.time += dt;

    // Ground under the rider: road surface, or the roof of the obstacle being ridden on.
    const road = track.getTrackPoint(rider.s).y;
    const ground = rider.supportId ? mesh.position.y - rider.hoverOffset : road;
    const h = Math.max(0, mesh.position.y - ground);
    this.root.position.set(mesh.position.x, ground + 0.045, mesh.position.z);
    this.root.rotation.y = mesh.rotation.y; this.root.rotation.x = mesh.rotation.x;

    // Contact shadow: tighter and darker near the ground, gone in high flight.
    const shadowTier = settings.graphicsQuality === 'low' ? 1.0 : 0.55;
    const s = 1 - Math.min(0.5, h / 8);
    this.blob.scale.set(1.35 * s, 1, 2.5 * s);
    this.blob.material.opacity = 0.42 * shadowTier * Math.max(0, 1 - h / 6.5);

    // Underglow colour follows the scooter's state.
    let target = 0x39d5ff, power = 0.3;
    if (rider.activeSkyFlight) { target = 0x72f5ff; power = 0.75; }
    else if (rider.activeAntigravity) { target = 0xb46bff; power = 0.7; }
    else if (rider.activeOverdrive) { target = 0xff9a2e; power = 0.85; }
    else if (rider.activeShield) { target = 0x25e6ff; power = 0.55; }
    else if (rider.downhillIntensity > 0.4) { target = 0x6affb0; power = 0.45; }
    this.tmpColor.set(target);
    this.glowColor.lerp(this.tmpColor, 1 - Math.exp(-dt * 8));
    const pulse = quiet ? 1 : 0.9 + Math.sin(this.time * 7) * 0.1;
    // Kept below the bloom threshold and a little tighter than the deck, so it tints the road
    // under the scooter without haloing the wheels (a bright additive blob made them look soft).
    this.glow.material.color.copy(this.glowColor).multiplyScalar(1.1 * pulse);
    this.glow.material.opacity = power * Math.max(0, 1 - h / 5);
    this.glow.scale.set(1.6 * s, 1, 3.0 * s + Math.min(1.2, rider.forwardSpeed * 0.035));

    if (quiet) { this.wasGrounded = rider.isGrounded; return; }

    // Take-off / landing dust.
    const dustColor = this.dustColor;
    if (!rider.isGrounded) this.fallSpeed = Math.max(this.fallSpeed, -rider.verticalVelocity);
    if (this.wasGrounded && !rider.isGrounded && rider.verticalVelocity > 2.5) {
      this.ring(mesh, ground, 6, 0.9, 0.7, dustColor, 0.32);
      if (this.onTakeoff) this.onTakeoff();
    }
    if (!this.wasGrounded && rider.isGrounded) {
      if (this.fallSpeed > 2.2) {
        const power = Math.min(1, this.fallSpeed / 12);
        this.ring(mesh, ground, 10 + Math.round(power * 8), 1.6 + power * 2.2, 0.95, dustColor, 0.5);
        if (this.onLand) this.onLand(power, this.fallSpeed);
      }
      this.fallSpeed = 0;
    }
    this.wasGrounded = rider.isGrounded;

    // Skid dust when carving hard on the ground.
    this.skid += dt;
    if (rider.isGrounded && Math.abs(rider.lateralVelocity) > 5.2 && this.skid > 0.07 && settings.graphicsQuality !== 'low') {
      this.skid = 0;
      const back = this.back.set(0, 0, -0.65).applyQuaternion(mesh.quaternion);
      this.dust.emit(mesh.position.x + back.x, ground + 0.12, mesh.position.z + back.z,
        -Math.sign(rider.lateralVelocity) * 0.6, 0.15, -0.8, 0.28, 2.4, 0.55, dustColor, 0.34);
    }
  }

  // Expanding ring of puffs around the wheels.
  ring(mesh, ground, count, speed, size, color, alpha) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4, sp = speed * (0.7 + Math.random() * 0.6);
      this.dust.emit(mesh.position.x + Math.cos(a) * 0.3, ground + 0.1, mesh.position.z + Math.sin(a) * 0.3,
        Math.cos(a) * sp, 0.25 + Math.random() * 0.4, Math.sin(a) * sp, size * (0.28 + Math.random() * 0.2), 2.6, 0.5 + Math.random() * 0.35, color, alpha);
    }
  }
};
