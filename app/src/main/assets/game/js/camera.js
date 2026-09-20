// LOUFFI CITY RUSH — LOUFFI EDITION
// Smooth Third-Person Follow Camera with Accessibility & Reduced Motion Support
window.GameCamera = class GameCamera {
  constructor(camera, THREE) {
    this.camera = camera;
    this.THREE = THREE;

    // Default target offsets relative to rider
    this.heightOffset = 2.8;
    this.distanceBehind = 6.1;
    this.lookAheadDistance = 10.0;
    this.lookUpOffset = 1.2;
    // Keep the bridge visually anchored. The rider may travel to the edge of
    // the road, while the camera follows only a small fraction sideways.
    this.lateralFollow = 0.16;
    this.lookLateralFollow = 0.08;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.isInitialized = false;

    this.baseFov = 60;
  }

  reset(riderMesh, trackGen) {
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

  update(dt, riderMesh, trackGen, isOverdrive, settings) {
    const p = riderMesh.position;
    const tan = trackGen.getTrackTangent(riderMesh.position.z);
    const center = trackGen.getTrackPoint(riderMesh.position.z);
    const normal = {x: -tan.z, z: tan.x};
    const anchorX = center.x + (p.x - center.x) * this.lateralFollow;
    const anchorZ = center.z + (p.z - center.z) * this.lateralFollow;

    const targetPos = new this.THREE.Vector3(
      anchorX - tan.x * this.distanceBehind,
      p.y + this.heightOffset,
      anchorZ - tan.z * this.distanceBehind
    );

    const targetLookAt = new this.THREE.Vector3(
      center.x + normal.x * (p.x - center.x) * this.lookLateralFollow + tan.x * this.lookAheadDistance,
      trackGen.getTrackPoint(riderMesh.position.z + this.lookAheadDistance).y + this.lookUpOffset,
      center.z + normal.z * (p.z - center.z) * this.lookLateralFollow + tan.z * this.lookAheadDistance
    );

    if (!this.isInitialized) {
      this.reset(riderMesh, trackGen);
      return;
    }

    // Smooth Lerp tracking
    const lerpSpeed = settings.reducedMotion ? 1.0 : Math.min(1.0, dt * 8.0);
    this.currentPosition.lerp(targetPos, lerpSpeed);
    this.currentLookAt.lerp(targetLookAt, lerpSpeed);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    // FOV dynamics during Overdrive (disabled in reduced-motion mode)
    const targetFov = (isOverdrive && !settings.reducedMotion) ? 66 : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 5.0);
      this.camera.updateProjectionMatrix();
    }
  }
};
