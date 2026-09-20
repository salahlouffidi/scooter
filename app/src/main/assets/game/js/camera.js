// SKY SCOOTER — LOUFFI EDITION
// Smooth Third-Person Follow Camera with Accessibility & Reduced Motion Support
window.GameCamera = class GameCamera {
  constructor(camera, THREE) {
    this.camera = camera;
    this.THREE = THREE;

    // Default target offsets relative to rider
    this.heightOffset = 3.2;
    this.distanceBehind = 6.5;
    this.lookAheadDistance = 10.0;
    this.lookUpOffset = 1.2;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.isInitialized = false;

    this.baseFov = 60;
  }

  reset(riderMesh, trackGen) {
    const p = riderMesh.position;
    const tan = trackGen.getTrackTangent(riderMesh.position.z);

    this.currentPosition.set(
      p.x - tan.x * this.distanceBehind,
      p.y + this.heightOffset,
      p.z - tan.z * this.distanceBehind
    );
    this.currentLookAt.set(
      p.x + tan.x * this.lookAheadDistance,
      trackGen.getTrackPoint(riderMesh.position.z + this.lookAheadDistance).y + this.lookUpOffset,
      p.z + tan.z * this.lookAheadDistance
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

    const targetPos = new this.THREE.Vector3(
      p.x - tan.x * this.distanceBehind,
      p.y + this.heightOffset,
      p.z - tan.z * this.distanceBehind
    );

    const targetLookAt = new this.THREE.Vector3(
      p.x + tan.x * this.lookAheadDistance,
      trackGen.getTrackPoint(riderMesh.position.z + this.lookAheadDistance).y + this.lookUpOffset,
      p.z + tan.z * this.lookAheadDistance
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
    const targetFov = (isOverdrive && !settings.reducedMotion) ? 72 : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 5.0);
      this.camera.updateProjectionMatrix();
    }
  }
};
