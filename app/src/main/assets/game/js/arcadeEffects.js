// Shared tuning keeps controls and generated-route validation in agreement.
window.ScooterTuning = Object.freeze({
  testAllRounds: true, cruiseMultiplier: 1.25, boostMultiplier: 1.55,
  maxSpeed: 28, lateralSpeed: 9, brakeFactor: .65
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

// Fixed particle pools: two draw calls, no new geometry during play.
window.ArcadeEffects = class ArcadeEffects {
  constructor(scene, T) {
    this.T = T; this.cursor = 0; this.emission = 0;
    this.root = new T.Group(); scene.add(this.root);
    this.pool = Array.from({length: 80}, () => ({life: 0, maxLife: 1, p: new T.Vector3(), v: new T.Vector3(), spin: 0}));
    this.stars = new T.InstancedMesh(window.createScooterStar(T, .18), new T.MeshBasicMaterial({color: 0xffdd55, side: T.DoubleSide, depthWrite: false}), this.pool.length);
    this.stars.instanceMatrix.setUsage(T.DynamicDrawUsage); this.stars.frustumCulled = false;
    this.root.add(this.stars); this.dummy = new T.Object3D();
    this.linesArray = new Float32Array(48 * 6);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(this.linesArray, 3).setUsage(T.DynamicDrawUsage));
    this.wind = new T.LineSegments(geometry, new T.LineBasicMaterial({color: 0xc5f7ff, transparent: true, opacity: .65, depthWrite: false}));
    this.wind.frustumCulled = false; this.root.add(this.wind); this.time = 0; this.reset();
  }
  reset() {
    this.pool.forEach(p => p.life = 0); this.emission = 0; this.root.visible = false;
    this.stars.count = 0; this.wind.geometry.setDrawRange(0, 0);
  }
  burst(position, count = 16) {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor++ % this.pool.length], a = i * 2.39996;
      p.p.copy(position); p.p.y += .8; p.v.set(Math.cos(a) * 2.4, 1.5 + Math.random() * 2, Math.sin(a) * 2.4);
      p.life = p.maxLife = .55 + Math.random() * .35; p.spin = a;
    }
  }
  update(dt, rider, track, settings, playing) {
    this.root.visible = playing;
    if (!playing) return;
    this.time += dt;
    const T = this.T, tan = track.getTrackTangent(rider.s), pos = rider.mesh.position;
    const rush = Math.max(rider.activeOverdrive ? 1 : 0, rider.downhillIntensity || 0);
    const count = settings.reducedMotion ? 0 : (settings.graphicsQuality === 'low' ? 16 : 48);
    this.wind.material.opacity = .12 + rush * .65;
    this.wind.material.color.set(rider.activeOverdrive ? 0xffe9a0 : 0xc5f7ff);
    for (let i = 0; i < count; i++) {
      const cycle = (this.time * (1.4 + rush) + i * .618) % 1;
      const behind = .5 + cycle * (6 + rush * 5), angle = i * 2.39996;
      const side = Math.cos(angle) * (1.2 + (i % 3) * .45), height = .65 + (Math.sin(angle) + 1) * .9;
      const x = pos.x - tan.x * behind - tan.z * side, y = pos.y + height, z = pos.z - tan.z * behind + tan.x * side;
      const length = .45 + rush * 1.8, j = i * 6;
      this.linesArray.set([x, y, z, x - tan.x * length, y + .03, z - tan.z * length], j);
    }
    this.wind.geometry.setDrawRange(0, count * 2); this.wind.geometry.attributes.position.needsUpdate = true;
    if (rider.activeOverdrive && !settings.reducedMotion) {
      this.emission += dt * 22;
      while (this.emission >= 1) { this.burst(pos, 1); this.emission--; }
    }
    let visible = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) continue;
      p.p.addScaledVector(p.v, dt); p.v.y -= dt * 3;
      this.dummy.position.copy(p.p); this.dummy.rotation.set(0, this.time * 2 + p.spin, this.time * 4 + p.spin);
      this.dummy.scale.setScalar(Math.min(1, p.life / p.maxLife * 2)); this.dummy.updateMatrix();
      this.stars.setMatrixAt(visible++, this.dummy.matrix);
    }
    this.stars.count = visible; this.stars.instanceMatrix.needsUpdate = true;
  }
};
