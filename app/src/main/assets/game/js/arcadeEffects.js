// Shared tuning keeps controls and generated-route validation in agreement.
window.ScooterTuning = Object.freeze({
  testAllRounds: true, cruiseMultiplier: 1.25, boostMultiplier: 1.55,
  maxSpeed: 28, lateralSpeed: 9, brakeFactor: .65, jumpVelocity: 10.5, gravity: 22
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

// Fixed particle pools and two exhaust meshes; no new geometry during play.
window.ArcadeEffects = class ArcadeEffects {
  constructor(scene, T) {
    this.T = T; this.cursor = 0; this.emission = 0;
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
    this.reset();
  }
  reset() {
    this.pool.forEach(p => p.life = 0); this.emission = 0; this.time = 0; this.root.visible = false;
    this.flames.forEach(f => { f.visible = false; });
    this.stars.count = 0; this.wind.geometry.setDrawRange(0, 0);
  }
  burst(position, count = 16) {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor++ % this.pool.length], a = i * 2.39996;
      p.trail = false; p.color.set(0xffdd55);
      p.p.copy(position); p.p.y += .8; p.v.set(Math.cos(a) * 2.4, 1.5 + Math.random() * 2, Math.sin(a) * 2.4);
      p.life = p.maxLife = .55 + Math.random() * .35; p.spin = a;
    }
  }
  emitTrail(rider) {
    const p = this.pool[this.cursor++ % this.pool.length];
    p.trail = true;
    p.p.set(0, .32, -1.3).applyQuaternion(rider.mesh.quaternion).add(rider.mesh.position);
    p.v.set(Math.sin(this.time * 17) * .35, .3, -.8).applyQuaternion(rider.mesh.quaternion);
    p.color.setHSL((this.time * .45) % 1, .95, .62);
    p.life = p.maxLife = .8; p.spin = this.time * 8;
  }
  update(dt, rider, track, settings, playing) {
    this.root.visible = playing;
    if (!playing) { this.flames.forEach(f => { f.visible = false; }); return; }
    this.time += dt;
    const T = this.T, tan = track.getTrackTangent(rider.s), pos = rider.mesh.position;
    const rush = Math.max(rider.activeOverdrive ? 1 : 0, rider.activeSkyFlight ? 2 : 0, rider.downhillIntensity || 0);
    const count = settings.reducedMotion ? 0 : (settings.graphicsQuality === 'low' ? 16 : 48);
    this.wind.material.opacity = .12 + rush * .65;
    this.wind.material.color.set(rider.activeSkyFlight ? 0x70f4ff : rider.activeOverdrive ? 0xffe9a0 : 0xc5f7ff);
    for (let i = 0; i < count; i++) {
      const cycle = (this.time * (1.4 + rush) + i * .618) % 1;
      const behind = .5 + cycle * (6 + rush * 5), angle = i * 2.39996;
      const side = Math.cos(angle) * (1.2 + (i % 3) * .45), height = .65 + (Math.sin(angle) + 1) * .9;
      const x = pos.x - tan.x * behind - tan.z * side, y = pos.y + height, z = pos.z - tan.z * behind + tan.x * side;
      const length = .45 + rush * 1.8, j = i * 6;
      this.linesArray.set([x, y, z, x - tan.x * length, y + .03, z - tan.z * length], j);
    }
    this.wind.geometry.setDrawRange(0, count * 2); this.wind.geometry.attributes.position.needsUpdate = true;
    const turboOn = rider.activeOverdrive && !settings.reducedMotion;
    const flicker = .85 + Math.sin(this.time * 34) * .15;
    this.flames.forEach((flame, i) => {
      flame.visible = turboOn;
      if (!turboOn) return;
      flame.position.set(i === 0 ? -.18 : .18, .28, -.95).applyQuaternion(rider.mesh.quaternion).add(pos);
      flame.quaternion.copy(rider.mesh.quaternion);
      flame.scale.set(1, 1, flicker);
      flame.material.opacity = .75 + flicker * .2;
    });
    if (turboOn) {
      this.emission += dt * (settings.graphicsQuality === 'low' ? 5 : 10);
      while (this.emission >= 1) { this.emitTrail(rider); this.emission--; }
    } else {
      this.emission = 0;
    }
    let visible = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (settings.reducedMotion && p.trail) { p.life = 0; continue; }
      p.life -= dt; if (p.life <= 0) continue;
      p.p.addScaledVector(p.v, dt); p.v.y -= dt * 3;
      this.dummy.position.copy(p.p); this.dummy.rotation.set(0, this.time * 2 + p.spin, this.time * 4 + p.spin);
      this.dummy.scale.setScalar(Math.min(1, p.life / p.maxLife * 2) * (p.trail ? .42 : 1)); this.dummy.updateMatrix();
      this.stars.setColorAt(visible, p.color);
      this.stars.setMatrixAt(visible++, this.dummy.matrix);
    }
    this.stars.count = visible; this.stars.instanceMatrix.needsUpdate = true; this.stars.instanceColor.needsUpdate = true;
  }
};
