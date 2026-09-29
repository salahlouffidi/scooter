// SKY SCOOTER — LOUFFI EDITION
// Third-person chase camera. Frame-rate independent smoothing, speed-driven FOV and
// pull-back, banking roll into turns, softened jump follow, a landing-impact spring
// and a cinematic run-in during the countdown. Reduced Motion pins the classic
// rigid follow (no roll, no FOV drift, no shake).
window.GameCamera = class GameCamera {
  constructor(camera, THREE) {
    this.camera = camera;
    this.THREE = THREE;

    // Rig offsets relative to the rider. The chase position sits ~11% closer than the
    // original 2.8 m / 6.1 m rig (Louffi and the scooter read ~10% larger). The height is
    // kept almost unchanged on purpose: lowering it would let the rider's head hide more of
    // the road ahead. lookUpOffset is solved so the view pitch stays exactly the original
    // one ((height - lookUp) / (distance + lookAhead) = 1.6 / 16.1): same horizon, same angle.
    this.zoom = 0.89;                       // also scales the speed/turbo/flight pull-back
    this.heightOffset = 2.78;
    this.distanceBehind = 5.42;
    this.lookAheadDistance = 10.0;
    this.lookUpOffset = this.heightOffset - (2.8 - 1.2) * (this.distanceBehind + this.lookAheadDistance) / (6.1 + 10.0);
    // Keep the route visually anchored: the rider may travel to the edge of the road while
    // the camera follows only a small fraction sideways.
    this.lateralFollow = 0.16;
    this.lookLateralFollow = 0.08;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.isInitialized = false;

    this.baseFov = 60;
    this.shakeIntensity = 0;
    this.shakeTimer = 0;

    // Feel state
    this.speedBlend = 0;
    this.boostBlend = 0;
    this.roll = 0;
    this.pitchLead = 0;
    this.dip = 0;
    this.dipVel = 0;
    this.airBlend = 0;
    this.intro = null;
  }

  shake(intensity = 0.22, duration = 0.28) {
    this.shakeIntensity = Math.min(0.5, (this.shakeIntensity || 0) + intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  // Landing thud: a damped spring pushes the camera down for a moment.
  impact(power = 0.5) {
    this.dipVel -= 2.2 + power * 6.5;
  }

  // Cinematic run-in: wide, low and offset, easing into the chase position.
  startIntro(duration = 2.6) {
    this.intro = { t: 0, dur: duration, snap: true }; // first frame starts in the wide pose
  }

  reset(riderMesh, trackGen) {
    this.shakeIntensity = 0;
    this.shakeTimer = 0;
    this.speedBlend = 0; this.boostBlend = 0; this.roll = 0; this.dip = 0; this.dipVel = 0; this.airBlend = 0;
    this.intro = null;
    const p = riderMesh.position;
    const tan = trackGen.getTrackTangent(riderMesh.position.z);
    const center = trackGen.getTrackPoint(riderMesh.position.z);
    const normal = {x: -tan.z, z: tan.x};
    const anchorX = center.x + (p.x - center.x) * this.lateralFollow;
    const anchorZ = center.z + (p.z - center.z) * this.lateralFollow;

    this.currentPosition.set(
      anchorX - tan.x * this.distanceBehind,
      p.y + this.heightOffset,
      anchorZ - tan.z * this.distanceBehind
    );
    this.currentLookAt.set(
      center.x + normal.x * (p.x - center.x) * this.lookLateralFollow + tan.x * this.lookAheadDistance,
      trackGen.getTrackPoint(riderMesh.position.z + this.lookAheadDistance).y + this.lookUpOffset,
      center.z + normal.z * (p.z - center.z) * this.lookLateralFollow + tan.z * this.lookAheadDistance
    );

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.isInitialized = true;
  }

  update(dt, riderMesh, trackGen, isOverdrive, settings, rider) {
    const reduced = !!(settings && settings.reducedMotion);
    const p = riderMesh.position;
    const tan = trackGen.getTrackTangent(riderMesh.position.z);
    const center = trackGen.getTrackPoint(riderMesh.position.z);
    const normal = {x: -tan.z, z: tan.x};

    if (!this.isInitialized) {
      this.reset(riderMesh, trackGen);
      return;
    }

    // ---- Feel signals ----
    const tuning = window.ScooterTuning || { maxSpeed: 28 };
    const speed = rider ? rider.forwardSpeed : 12;
    const speed01 = Math.max(0, Math.min(1, (speed - 8) / (tuning.maxSpeed - 8)));
    const flying = rider && (rider.activeSkyFlight || rider.isGliding);
    const kSlow = 1 - Math.exp(-dt * 2.4);
    this.speedBlend += (speed01 - this.speedBlend) * kSlow;
    this.boostBlend += ((isOverdrive ? 1 : 0) - this.boostBlend) * (1 - Math.exp(-dt * 3.0));
    const groundY = center.y;
    const height = Math.max(0, p.y - groundY);                       // metres above the road
    this.airBlend += ((height > 0.35 ? 1 : 0) - this.airBlend) * (1 - Math.exp(-dt * 6));

    // ---- Rig ----
    const z = this.zoom;
    const dist = this.distanceBehind + (reduced ? 0 : (this.speedBlend * 1.0 + this.boostBlend * 0.7 + (flying ? 0.6 : 0)) * z);
    let camHeight = this.heightOffset + (reduced ? 0 : this.speedBlend * 0.22 * z);
    let lateralShift = 0, introK = 1;
    if (this.intro && !reduced) {
      this.intro.t += dt;
      const t = Math.min(1, this.intro.t / this.intro.dur);
      introK = 1 - Math.pow(1 - t, 3);                                // ease-out cubic
      if (t >= 1) this.intro = null;
      camHeight += (1 - introK) * -0.9 * z;
      lateralShift = (1 - introK) * 3.4 * z;
    } else if (this.intro) this.intro = null;
    const introDist = (1 - introK) * 3.6 * z;

    // The camera follows only ~60% of a jump: height reads without losing the road ahead.
    // Very high hops (antigravity apex, sky flight) are followed a little more so the
    // closer camera never cuts off Louffi's head at the top of the frame.
    const hi = reduced ? 0 : Math.max(0, Math.min(1, (height - 1.5) / 4.5));
    const highK = hi * hi * (3 - 2 * hi);
    const followY = groundY + height * (reduced ? 1.0 : 0.62 + 0.09 * highK);
    const anchorX = center.x + (p.x - center.x) * this.lateralFollow;
    const anchorZ = center.z + (p.z - center.z) * this.lateralFollow;

    this.targetPos.set(
      anchorX - tan.x * (dist + introDist) + normal.x * lateralShift,
      followY + camHeight,
      anchorZ - tan.z * (dist + introDist) + normal.z * lateralShift
    );
    this.targetLook.set(
      center.x + normal.x * (p.x - center.x) * this.lookLateralFollow + tan.x * this.lookAheadDistance,
      trackGen.getTrackPoint(riderMesh.position.z + this.lookAheadDistance).y + this.lookUpOffset + height * (reduced ? 1.0 : 0.5 + 0.07 * highK),
      center.z + normal.z * (p.z - center.z) * this.lookLateralFollow + tan.z * this.lookAheadDistance
    );

    // ---- Smoothing (exponential: identical feel at 30, 60 or 120 fps) ----
    if (this.intro && this.intro.snap) {
      // The run-in begins exactly at its wide pose instead of swinging out from the chase pose.
      this.intro.snap = false;
      this.currentPosition.copy(this.targetPos);
      this.currentLookAt.copy(this.targetLook);
      this.camera.fov = this.baseFov + 12;
      this.camera.updateProjectionMatrix();
    } else if (reduced) {
      this.currentPosition.copy(this.targetPos);
      this.currentLookAt.copy(this.targetLook);
    } else {
      const kh = 1 - Math.exp(-dt * 9), kv = 1 - Math.exp(-dt * 6.5), kl = 1 - Math.exp(-dt * 10);
      this.currentPosition.x += (this.targetPos.x - this.currentPosition.x) * kh;
      this.currentPosition.z += (this.targetPos.z - this.currentPosition.z) * kh;
      this.currentPosition.y += (this.targetPos.y - this.currentPosition.y) * kv;
      this.currentLookAt.lerp(this.targetLook, kl);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    // ---- Banking roll: the horizon tilts slightly into the turn ----
    const lat = rider ? rider.lateralVelocity : 0;
    const targetRoll = reduced ? 0 : Math.max(-0.05, Math.min(0.05, -lat * 0.0042));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.roll) > 1e-4) this.camera.rotateZ(this.roll);

    // ---- Landing impact spring ----
    if (!reduced) {
      this.dipVel += (-140 * this.dip - 15 * this.dipVel) * dt;
      this.dip += this.dipVel * dt;
      this.dip = Math.max(-0.7, Math.min(0.3, this.dip));
      this.camera.position.y += this.dip;
    } else { this.dip = 0; this.dipVel = 0; }

    // ---- Impact trauma shake (disabled in reduced-motion mode) ----
    if (this.shakeTimer > 0 && !reduced) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = Math.max(0, this.shakeTimer / 0.28);
      const amp = this.shakeIntensity * decay;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp * 0.7;
    }

    // ---- FOV: opens up with speed, turbo and flight ----
    let targetFov = this.baseFov;
    if (!reduced) targetFov += this.speedBlend * 6 + this.boostBlend * 7 + (flying ? 3 : 0) + (1 - introK) * 12;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 5));
      this.camera.updateProjectionMatrix();
    }
  }
};
