// SKY SCOOTER — LOUFFI EDITION
// Kinematic Rider Controller, Physics, Procedural Animation & Swept Collisions
window.RiderController = class RiderController {
  constructor(riderMesh, trackGenerator) {
    this.mesh = riderMesh;
    this.trackGen = trackGenerator;

    // Track coordinates
    this.s = 0.0; // Distance along track (meters)
    this.laneX = 0.0; // Lateral offset from centerline (meters)
    this.y = 0.0; // Height above road surface (meters)

    // Velocities
    this.forwardSpeed = 8.0;
    this.lateralVelocity = 0.0;
    this.verticalVelocity = 0.0;

    // Physics constants
    this.GRAVITY = 22.0;
    this.JUMP_VELOCITY = 8.5;
    this.MAX_LATERAL_SPEED = window.ScooterTuning.lateralSpeed;
    this.LATERAL_ACCEL = 24.0;
    this.LATERAL_DRAG = 16.0;

    // State flags
    this.isGrounded = true;
    this.coyoteTimer = 0.0;
    this.coyoteDuration = 0.12; // 120ms coyote time
    this.invulnerableTimer = 0.0;
    this.isInvulnerable = false;
    this.wobbleTimer = 0.0;

    // Active powerups & effects
    this.activeShield = false;
    this.shieldTimer = 0.0;
    this.activeMagnet = false;
    this.magnetTimer = 0.0;
    this.activeDouble = false;
    this.doubleTimer = 0.0;
    this.activeOverdrive = false;
    this.overdriveTimer = 0.0;

    // Checkpoint & stats tracking
    this.furthestS = 0.0;
    this.lastCheckpointS = 0.0;
    this.recentDamageCount = 0;
    this.jumpAttempts = 0;
    this.jumpSuccesses = 0;
    this.steerCorrections = 0;
    this.coinsCollectedInWindow = 0;

    // Procedural animation state
    this.leanAngle = 0.0;
    this.downhillIntensity = 0;
    this.wheelRotation = 0.0;
    this.idleTime = 0.0;
  }

  reset(s = 0.0, speed = 8.0) {
    this.s = s;
    this.laneX = 0.0;
    this.y = 0.0;
    this.forwardSpeed = speed;
    this.lateralVelocity = 0.0;
    this.verticalVelocity = 0.0;
    this.isGrounded = true;
    this.coyoteTimer = 0.0;
    this.invulnerableTimer = 0.0;
    this.isInvulnerable = false;
    this.wobbleTimer = 0.0;
    this.leanAngle = 0.0;
    this.downhillIntensity = 0;
    this.previousSteerSign = 0;

    this.activeShield = false;
    this.activeMagnet = false;
    this.activeDouble = false;
    this.activeOverdrive = false;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.doubleTimer = 0;
    this.overdriveTimer = 0;

    this.furthestS = s;
    this.lastCheckpointS = s;
    this.recentDamageCount=0;this.jumpAttempts=0;this.jumpSuccesses=0;this.steerCorrections=0;this.coinsCollectedInWindow=0;
    this.updateMeshTransform();
  }

  respawnAtCheckpoint() {
    this.trackGen.restoreCheckpoint?.(this.lastCheckpointS);
    this.s = this.lastCheckpointS;
    this.laneX = 0.0;
    this.y = 0.5;
    this.verticalVelocity = 0.0;
    this.lateralVelocity = 0.0;
    this.isGrounded = true;
    this.grantInvulnerability(1.8);
    this.updateMeshTransform();
  }

  grantInvulnerability(seconds = 1.5) {
    this.invulnerableTimer = seconds;
    this.isInvulnerable = true;
    this.wobbleTimer = 0.4;
  }

  update(dt, input, baseSpeed, roadWidth, onEvent) {
    // 1. Update timers
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
      this.isInvulnerable = this.invulnerableTimer > 0;
      // Visual blink effect when invulnerable
      this.mesh.visible = Math.floor(this.invulnerableTimer * 12) % 2 === 0;
    } else {
      this.mesh.visible = true;
      this.isInvulnerable = false;
    }

    if (this.wobbleTimer > 0) {
      this.wobbleTimer -= dt;
    }

    // Powerup durations
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      this.activeShield = this.shieldTimer > 0;
    }
    if (this.magnetTimer > 0) {
      this.magnetTimer -= dt;
      this.activeMagnet = this.magnetTimer > 0;
    }
    if (this.doubleTimer > 0) {
      this.doubleTimer -= dt;
      this.activeDouble = this.doubleTimer > 0;
    }
    if (this.overdriveTimer > 0) {
      this.overdriveTimer -= dt;
      this.activeOverdrive = this.overdriveTimer > 0;
    }

    // 2. Forward speed calculation (with overdrive boost & brake)
    const tuning = window.ScooterTuning;
    const grade = this.trackGen.getTrackGrade(this.s);
    this.downhillIntensity = Math.min(1, Math.max(0, -grade / .14));
    let targetSpeed = baseSpeed * tuning.cruiseMultiplier + this.downhillIntensity * 4.5;
    if (this.activeOverdrive) {
      targetSpeed *= tuning.boostMultiplier;
    }
    targetSpeed = Math.min(tuning.maxSpeed, targetSpeed);
    if (input.isBraking) targetSpeed *= tuning.brakeFactor;
    this.forwardSpeed += (targetSpeed - this.forwardSpeed) * (1 - Math.exp(-dt * (input.isBraking ? 14 : 8)));

    // 3. Lateral Steering
    const steerInput = Math.max(-1, Math.min(1, input.horizontalSteer));
    if (Math.abs(steerInput) > 0.05) {
      if(Math.sign(steerInput)!==this.previousSteerSign)this.steerCorrections++;
      this.previousSteerSign=Math.sign(steerInput);
      this.lateralVelocity += (steerInput * this.MAX_LATERAL_SPEED - this.lateralVelocity) * (1 - Math.exp(-22 * dt));
    } else {
      // Lateral drag to smoothly stop steering without snapping back to center
      this.lateralVelocity *= Math.exp(-30 * dt);
    }

    this.laneX += this.lateralVelocity * dt;
    // Bound rider inside usable roadway
    const halfRoad = roadWidth * 0.45;
    this.laneX = Math.max(-halfRoad, Math.min(halfRoad, this.laneX));
    if (Math.abs(this.laneX) >= halfRoad && Math.sign(this.lateralVelocity) === Math.sign(this.laneX)) this.lateralVelocity = 0;

    // 4. Vertical Physics & Jump
    if (this.isGrounded) {
      this.coyoteTimer = this.coyoteDuration;
    } else {
      this.coyoteTimer -= dt;
    }

    if (input.consumeJump()) {
      this.jumpAttempts++;
      if (this.isGrounded || this.coyoteTimer > 0) {
        this.verticalVelocity = this.JUMP_VELOCITY;
        this.isGrounded = false;
        this.coyoteTimer = 0;
        this.jumpSuccesses++;
        if (onEvent) onEvent('jump');
      }
    }

    if (!this.isGrounded) {
      this.verticalVelocity -= this.GRAVITY * dt;
      this.y += this.verticalVelocity * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    }

    // 5. Advance Forward Distance (Swept simulation substep)
    const prevS = this.s;
    this.s += this.forwardSpeed * dt;
    if (this.s > this.furthestS) {
      this.furthestS = this.s;
    }

    // 6. Check Checkpoints (at ~1/3 and 2/3 of round length)
    const roundLen = this.trackGen.roundData.length;
    const cp1 = roundLen * 0.33;
    const cp2 = roundLen * 0.66;
    if (prevS < cp1 && this.s >= cp1) {
      this.lastCheckpointS = cp1;
      if (onEvent) onEvent('checkpoint');
    } else if (prevS < cp2 && this.s >= cp2) {
      this.lastCheckpointS = cp2;
      if (onEvent) onEvent('checkpoint');
    }

    // 7. Check Gaps / Falling hazards
    // If inside a gap segment and player is on the ground (y <= 0.05), fall!
    const currentSeg = this.trackGen.activeSegments.find(
      seg => seg.userData.isGap && this.s >= seg.userData.gapStart && this.s <= seg.userData.gapEnd
    );
    if (currentSeg && this.y <= 0.1) {
      // Fell into gap!
      this.recentDamageCount++;
      if (onEvent) onEvent('fall');
      this.respawnAtCheckpoint();
      return;
    }

    // 8. Swept Collisions: Collectibles & Obstacles
    this.checkCollisions(prevS, this.s, onEvent);

    // 9. Procedural 3D Mesh Animations
    this.updateProceduralAnimations(dt);

    // 10. Update 3D World Transform
    this.updateMeshTransform();
  }

  checkCollisions(s0, s1, onEvent) {
    // 1. Collectibles (Coins, Gems, Powerups)
    for (const item of this.trackGen.activeCollectibles) {
      if (item.userData.collected) continue;
      const itemS = item.userData.s;
      // Magnet attraction
      if (this.activeMagnet && Math.abs(itemS - this.s) < 18.0) {
        item.position.x += (this.mesh.position.x - item.position.x) * 0.18;
        item.position.y += (this.mesh.position.y + 1.0 - item.position.y) * 0.18;
        item.position.z += (this.mesh.position.z - item.position.z) * 0.18;
      }

      // Check distance to player
      const distToMesh = item.position.distanceTo(this.mesh.position.clone().add(new this.trackGen.THREE.Vector3(0, 1.0, 0)));
      const roadY = this.trackGen.getTrackPoint(itemS).y;
      if (distToMesh < 1.0 || (itemS >= s0 && itemS <= s1 && Math.abs(this.laneX - item.userData.laneX) < .8 && Math.abs(roadY+this.y+1-item.position.y)<1.0)) {
        item.userData.collected = true;
        this.trackGen.scene.remove(item);

        if (item.userData.isGem) {
          if (onEvent) onEvent('gem', item.position);
        } else if (item.userData.isPowerup) {
          this.applyPowerup(item.userData.type, onEvent);
        } else {
          this.coinsCollectedInWindow++;
          if (onEvent) onEvent('coin', item.position);
        }
      }
    }

    // 2. Obstacles
    if (this.isInvulnerable) return; // Invulnerability prevents multi-hits

    for (const obs of this.trackGen.activeObstacles) {
      if (obs.userData.hit) continue;
      const obsS = obs.userData.s;

      // Swept forward check
      if (obsS >= s0 - 0.5 && obsS <= s1 + 0.5) {
        // Lateral check
        const deltaX = Math.abs(this.laneX - obs.userData.laneX);
        if (deltaX < 1.3) {
          // If jumpable barrier and player is high enough in jump, clear it!
          if (obs.userData.isJumpable && this.y > 0.8) {
            // Cleared barrier successfully!
            obs.userData.hit = true;
            if (onEvent) onEvent('jump_challenge');
            continue;
          }

          // Hit obstacle!
          obs.userData.hit = true;
          this.recentDamageCount++;

          if (this.activeShield) {
            // Shield absorbs damage!
            this.activeShield = false;
            this.shieldTimer = 0;
            this.grantInvulnerability(1.2);
            if (onEvent) onEvent('shield_absorbed');
          } else {
            // Lose heart and slow briefly
            this.forwardSpeed *= 0.6;
            this.grantInvulnerability(1.5);
            if (onEvent) onEvent('hit_obstacle');
          }
          break;
        }
      }
    }
  }

  applyPowerup(type, onEvent) {
    if (type === 'shield') {
      this.activeShield = true;
      this.shieldTimer = 10.0;
    } else if (type === 'magnet') {
      this.activeMagnet = true;
      this.magnetTimer = 8.0;
    } else if (type === 'double') {
      this.activeDouble = true;
      this.doubleTimer = 8.0;
    } else if (type === 'overdrive') {
      this.activeOverdrive = true;
      this.overdriveTimer = 5.0;
    } else if (type === 'heart') {
      if (onEvent) onEvent('heart_pickup');
    }
    if (onEvent) onEvent('powerup', type);
  }

  updateProceduralAnimations(dt) {
    // 1. Wheel spin based on forward travel
    this.wheelRotation += (this.forwardSpeed * dt) / 0.18;
    if (this.mesh.userData.frontWheel) {
      this.mesh.userData.frontWheel.rotation.x = this.wheelRotation;
    }
    if (this.mesh.userData.backWheel) {
      this.mesh.userData.backWheel.rotation.x = this.wheelRotation;
    }

    // 2. Smooth Banking / Lean in turns
    const targetLean = -this.lateralVelocity * 0.045;
    this.leanAngle += (targetLean - this.leanAngle) * Math.min(1.0, dt * 10.0);
    this.mesh.rotation.z = this.leanAngle;

    // 3. Gentle Breathing Idle & Jump Compression
    this.idleTime += dt * 5.0;
    if (this.mesh.userData.rider) {
      let squash = 1.0;
      if (!this.isGrounded) {
        // Tuck slightly in air
        squash = 0.92;
      } else {
        // Idle breathing
        squash = 1.0 + Math.sin(this.idleTime) * 0.02;
      }
      this.mesh.userData.rider.scale.set(1.0, squash, 1.0);
    }
  }

  updateMeshTransform() {
    const p = this.trackGen.getTrackPoint(this.s);
    const tan = this.trackGen.getTrackTangent(this.s);
    const normal = { x: -tan.z, z: tan.x };

    // Position rider on track
    const worldX = p.x + normal.x * this.laneX;
    const worldY = p.y + this.y;
    const worldZ = p.z + normal.z * this.laneX;

    this.mesh.position.set(worldX, worldY, worldZ);
    this.mesh.rotation.y = Math.atan2(tan.x, tan.z);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.x = -Math.atan(this.trackGen.getTrackGrade(this.s));
  }
};
