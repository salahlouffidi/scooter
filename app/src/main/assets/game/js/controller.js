// LOUFFI CITY RUSH — LOUFFI EDITION
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
    this.GRAVITY = window.ScooterTuning.gravity;
    this.JUMP_VELOCITY = window.ScooterTuning.jumpVelocity;
    this.supportId = null;
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
    this.activeMagicRush = false;
    this.magicRushTimer = 0.0;
    this.faultGuardCharges = 0;
    this.activeSkyFlight = false;
    this.skyFlightTimer = 0.0;
    this.skyFlightDuration = 3.6;
    this.activeAntigravity = false;
    this.antigravityTimer = 0;
    this.hoverOffset = 0;
    this.isGliding = false;
    this.reducedMotion = false;

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
    this.supportId = null;

    this.activeShield = false;
    this.activeMagnet = false;
    this.activeDouble = false;
    this.activeOverdrive = false;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.doubleTimer = 0;
    this.overdriveTimer = 0;
    this.activeMagicRush = false;
    this.magicRushTimer = 0;
    this.faultGuardCharges = 0;
    this.activeSkyFlight = false;
    this.skyFlightTimer = 0;
    this.activeAntigravity = false;
    this.antigravityTimer = 0;
    this.hoverOffset = 0;
    this.isGliding = false;

    this.furthestS = s;
    this.lastCheckpointS = s;
    this.recentDamageCount=0;this.jumpAttempts=0;this.jumpSuccesses=0;this.steerCorrections=0;this.coinsCollectedInWindow=0;
    this.updateProceduralAnimations(0);
    this.updateMeshTransform();
  }

  respawnAtCheckpoint() {
    this.supportId = null;
    this.trackGen.restoreCheckpoint?.(this.lastCheckpointS);
    this.s = this.lastCheckpointS;
    this.laneX = 0.0;
    this.y = this.hoverOffset;
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
    // Small physics steps keep roof landings and solid fronts reliable at turbo speed.
    const steps=Math.max(1,Math.ceil(Math.min(dt,.06)*120));
    for(let i=0;i<steps;i++) this.step(Math.min(dt,.06)/steps,input,baseSpeed,roadWidth,onEvent);
  }

  step(dt, input, baseSpeed, roadWidth, onEvent) {
    const previous={s:this.s,laneX:this.laneX,y:this.y};
    const oldHover = this.hoverOffset;
    if (this.activeAntigravity) {
      this.antigravityTimer = Math.max(0, this.antigravityTimer - dt);
      this.activeAntigravity = this.antigravityTimer > 0;
      if (!this.activeAntigravity && onEvent) onEvent('antigravity_end');
    }
    const hoverTarget = this.activeAntigravity ? window.ScooterTuning.hoverHeight : 0;
    this.hoverOffset += (hoverTarget - this.hoverOffset) * (1 - Math.exp(-28 * dt));
    if (Math.abs(this.hoverOffset - hoverTarget) < .0001) this.hoverOffset = hoverTarget;
    // Lift only the supported rider. Airborne height is continuous on pickup/expiry.
    if (this.isGrounded && !this.supportId) this.y += this.hoverOffset - oldHover;
    if(this.supportId && this.isGrounded){
      const support=this.trackGen.activeObstacles.find(o=>o.userData.id===this.supportId);
      const c=support?.userData.collision;
      if(!c || Math.abs(this.s-support.userData.s)>c.halfLength+.15 || Math.abs(this.laneX-support.userData.laneX)>c.halfWidth+.15){
        this.supportId=null;this.isGrounded=false;this.verticalVelocity=0;
      } else this.y=this.trackGen.getTrackPoint(support.userData.s).y+c.top-this.trackGen.getTrackPoint(this.s).y+this.hoverOffset;
    }
    // 1. Update timers
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
      this.isInvulnerable = this.invulnerableTimer > 0;
      // Visual blink effect when invulnerable
      this.mesh.visible = this.activeSkyFlight || Math.floor(this.invulnerableTimer * 12) % 2 === 0;
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
    if (this.magicRushTimer > 0) {
      this.magicRushTimer -= dt;
      if (this.magicRushTimer <= 0) {
        this.magicRushTimer = 0;
        this.activeMagicRush = false;
        this.faultGuardCharges = 0;
      }
    }
    if (this.activeSkyFlight) {
      this.skyFlightTimer = Math.max(0, this.skyFlightTimer - dt);
    }

    // 2. Forward speed calculation (with overdrive, joystick up acceleration,
    // and joystick down/back braking). Down never reverses the scooter: it
    // simply reduces forward speed so the runner remains safe and readable.
    const tuning = window.ScooterTuning;
    const grade = this.trackGen.getTrackGrade(this.s);
    this.downhillIntensity = Math.min(1, Math.max(0, -grade / .14));
    const surface=this.trackGen.surfaceAt?.(this.s)||'normal';
    const surfaceSpeed=surface==='sand'?.72:surface==='lava'?.9:surface==='rapids'?1.08:1;
    let targetSpeed = (baseSpeed * tuning.cruiseMultiplier + this.downhillIntensity * 4.5) * surfaceSpeed;
    if (this.activeOverdrive) {
      targetSpeed *= tuning.boostMultiplier;
    }
    const verticalInput = Math.max(-1, Math.min(1, Number(input.verticalSteer) || 0));
    if (verticalInput > 0) {
      // A forward stick push gives a compact, controllable acceleration burst.
      targetSpeed += verticalInput * Math.max(2.5, tuning.maxSpeed * .2);
    }
    targetSpeed = Math.min(tuning.maxSpeed, targetSpeed);
    const brakeInput = Math.max(0, -verticalInput);
    const brakeActive = !!input.isBraking || brakeInput > .05;
    if (brakeActive) {
      const brakeAmount = input.isBraking && brakeInput < .05 ? 1 : Math.max(.18, brakeInput);
      targetSpeed *= 1 - (1 - tuning.brakeFactor) * brakeAmount;
    }
    this.forwardSpeed += (targetSpeed - this.forwardSpeed) * (1 - Math.exp(-dt * (brakeActive ? 14 : verticalInput > .05 ? 12 : 8)));

    // 3. Lateral Steering
    const steerInput = Math.max(-1, Math.min(1, input.horizontalSteer));
    const slippery=surface==='ice';
    const gust=(surface==='wind'||surface==='rapids') ? Math.sin((this.s+this.trackGen.simulationTime*8)*.11)*.22 : 0;
    if (Math.abs(steerInput) > 0.05) {
      if(Math.sign(steerInput)!==this.previousSteerSign)this.steerCorrections++;
      this.previousSteerSign=Math.sign(steerInput);
      const lateralSpeed = this.MAX_LATERAL_SPEED * (this.activeAntigravity ? tuning.antigravitySteer : 1);
      const response = this.activeAntigravity ? tuning.antigravityResponse : (slippery ? 8 : 22);
      this.lateralVelocity += (steerInput * lateralSpeed - this.lateralVelocity) * (1 - Math.exp(-response * dt));
    } else {
      // Lateral drag to smoothly stop steering without snapping back to center
      this.lateralVelocity *= Math.exp(-(slippery?5:30) * dt);
    }
    this.lateralVelocity += gust * dt * 5;

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

    const jumpPressed = input.consumeJump();
    if (jumpPressed && !this.activeSkyFlight) {
      this.jumpAttempts++;
      if (this.isGrounded || this.coyoteTimer > 0) {
        this.verticalVelocity = this.JUMP_VELOCITY * (surface==='moon' ? 1.18 : 1);
        this.isGrounded = false;
        this.supportId = null;
        this.coyoteTimer = 0;
        this.jumpSuccesses++;
        if (onEvent) onEvent('jump');
      }
    }

    this.isGliding = false;
    if (this.activeSkyFlight) {
      const progress = 1 - this.skyFlightTimer / Math.max(.1, this.skyFlightDuration);
      if (this.skyFlightTimer <= 0) {
        this.activeSkyFlight = false;
        this.y = 1.25;
        this.verticalVelocity = -4.5;
        this.isGrounded = false;
        if (onEvent) onEvent('sky_return');
      } else {
        // Hold a graceful arc above traffic, then descend back to the city.
        this.y = 3.1 + Math.sin(Math.min(1, progress) * Math.PI) * 2.1;
        this.verticalVelocity = 0;
        this.isGrounded = false;
      }
    } else if (!this.isGrounded) {
      this.verticalVelocity -= this.GRAVITY * (this.activeAntigravity ? tuning.antigravityGravity : (surface==='moon' ? .58 : 1)) * dt;
      if (this.activeAntigravity && input.isJumpHeld && this.verticalVelocity < 0) {
        this.verticalVelocity = Math.max(-tuning.glideFallSpeed, this.verticalVelocity);
        this.isGliding = true;
      }
      this.y += this.verticalVelocity * dt;

      if (this.y <= this.hoverOffset) {
        this.y = this.hoverOffset;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        this.isGliding = false;
      }
    }

    // 5. Advance Forward Distance (Swept simulation substep)
    const prevS = this.s;
    this.s += this.forwardSpeed * dt;

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
      if (this.consumeFaultGuard(onEvent)) {
        this.respawnAtCheckpoint();
        return;
      }
      if (onEvent) onEvent('fall');
      this.respawnAtCheckpoint();
      return;
    }

    // 8. Swept Collisions: Collectibles & Obstacles
    this.checkCollisions(prevS, this.s, onEvent, previous);
    this.furthestS=Math.max(this.furthestS,this.s);

    // 9. Procedural 3D Mesh Animations
    this.updateProceduralAnimations(dt);

    // 10. Update 3D World Transform
    this.updateMeshTransform();
  }

  checkCollisions(s0, s1, onEvent, previous = {s:s0,laneX:this.laneX,y:this.y}) {
    this.resolveSolids(previous,onEvent);
    s1=this.s;
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

  }

  resolveSolids(previous,onEvent){
    let support=null;
    for(const obs of this.trackGen.activeObstacles){
      const d=obs.userData,c=d.collision;
      if(!c)continue;
      const halfS=c.halfLength+.4,halfX=c.halfWidth+.32;
      const minS=d.s-halfS,maxS=d.s+halfS,minX=d.laneX-halfX,maxX=d.laneX+halfX;
      const ds=this.s-previous.s,dx=this.laneX-previous.laneX;
      const slab=(p,v,min,max)=>Math.abs(v)<1e-9?(p>=min&&p<=max?[-Infinity,Infinity]:[Infinity,-Infinity]):
        [Math.min((min-p)/v,(max-p)/v),Math.max((min-p)/v,(max-p)/v)];
      const zs=slab(previous.s,ds,minS,maxS),xs=slab(previous.laneX,dx,minX,maxX);
      const enter=Math.max(0,zs[0],xs[0]),leave=Math.min(1,zs[1],xs[1]);
      if(enter>leave)continue;
      const top=this.trackGen.getTrackPoint(d.s).y+c.top;
      const foot0=this.trackGen.getTrackPoint(previous.s).y+previous.y;
      const foot1=this.trackGen.getTrackPoint(this.s).y+this.y;
      const footEntry=foot0+(foot1-foot0)*enter;
      const onFootprint=this.s>=minS&&this.s<=maxS&&this.laneX>=minX&&this.laneX<=maxX;
      if(this.activeSkyFlight || footEntry>=top-.035){
        if(onFootprint && foot1<=top+this.hoverOffset+.04 && (this.verticalVelocity<=0 || this.supportId===d.id)){
          this.y=top-this.trackGen.getTrackPoint(this.s).y+this.hoverOffset;this.verticalVelocity=0;this.isGrounded=true;this.isGliding=false;support=d.id;
          if(!d.roofAwarded){d.roofAwarded=true;if(onEvent)onEvent('roof_landing');}
        } else if(!d.roofAwarded && this.s>d.s+c.halfLength){
          d.roofAwarded=true;if(onEvent)onEvent('jump_challenge');
        }
        continue;
      }
      // A shield prevents damage, never solidity. Resolve the contact outside
      // the body so the scooter cannot disappear through an invulnerable car.
      if(zs[0]>=xs[0])this.s=ds>=0?minS-.015:maxS+.015;
      else {this.laneX=dx>=0?minX-.015:maxX+.015;this.lateralVelocity=0;}
      if(!d.hit && !this.isInvulnerable){
        d.hit=true;this.recentDamageCount++;
        if(this.activeShield){this.activeShield=false;this.shieldTimer=0;this.grantInvulnerability(1.2);if(onEvent)onEvent('shield_absorbed');}
        else if(!this.consumeFaultGuard(onEvent)){this.forwardSpeed*=.4;this.grantInvulnerability(1.5);if(onEvent)onEvent('hit_obstacle');}
      }
    }
    if(this.supportId && !support && this.isGrounded){this.isGrounded=false;this.verticalVelocity=0;}
    this.supportId=support;
  }

  captureState(){
    const saved={supportId:this.supportId};
    for(const key of ['s','laneX','y','forwardSpeed','lateralVelocity','verticalVelocity','isGrounded','coyoteTimer',
      'invulnerableTimer','isInvulnerable','wobbleTimer','activeShield','shieldTimer','activeMagnet','magnetTimer',
      'activeDouble','doubleTimer','activeOverdrive','overdriveTimer','activeMagicRush','magicRushTimer','faultGuardCharges',
      'activeSkyFlight','skyFlightTimer','skyFlightDuration','furthestS','lastCheckpointS','recentDamageCount',
      'activeAntigravity','antigravityTimer','hoverOffset','isGliding',
      'jumpAttempts','jumpSuccesses','steerCorrections','coinsCollectedInWindow','leanAngle','downhillIntensity','wheelRotation','idleTime']) saved[key]=this[key];
    return saved;
  }
  restoreState(saved){
    this.reset();
    for(const key of Object.keys(this.captureState()))if(typeof saved[key]==='boolean'||Number.isFinite(saved[key]))this[key]=saved[key];
    this.supportId=typeof saved.supportId==='string'?saved.supportId:null;
    this.updateProceduralAnimations(0);
    this.updateMeshTransform();
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
      this.overdriveTimer = Math.max(this.overdriveTimer, 5.0);
    } else if (type === 'magic_fruit') {
      this.activeMagicRush = true;
      this.magicRushTimer = 10.0;
      this.faultGuardCharges = 2;
      this.activeOverdrive = true;
      this.overdriveTimer = Math.max(this.overdriveTimer, 10.0);
      if (onEvent) onEvent('magic_fruit');
    } else if (type === 'antigravity') {
      this.activeAntigravity = true;
      this.antigravityTimer = window.ScooterTuning.antigravityDuration;
      if (onEvent) onEvent('antigravity_launch');
    } else if (type === 'propulsor') {
      this.activeSkyFlight = true;
      this.skyFlightDuration = 3.6;
      this.skyFlightTimer = this.skyFlightDuration;
      this.y = 1.0;
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.activeOverdrive = true;
      this.overdriveTimer = Math.max(this.overdriveTimer, this.skyFlightDuration);
      this.grantInvulnerability(this.skyFlightDuration);
      if (onEvent) onEvent('sky_launch');
    } else if (type === 'heart') {
      if (onEvent) onEvent('heart_pickup');
    }
    if (onEvent) onEvent('powerup', type);
  }

  consumeFaultGuard(onEvent) {
    if (this.faultGuardCharges <= 0) return false;
    this.faultGuardCharges--;
    this.grantInvulnerability(.9);
    if (onEvent) onEvent('magic_fault_guard', this.faultGuardCharges);
    return true;
  }

  updateProceduralAnimations(dt) {
    // 1. Wheel spin based on forward travel
    this.wheelRotation += (this.forwardSpeed * dt) / 0.18;
    if (this.mesh.userData.frontWheel) {
      this.mesh.userData.frontWheel.rotation.order = 'ZYX';
      this.mesh.userData.frontWheel.rotation.x = this.wheelRotation;
      this.mesh.userData.frontWheel.rotation.z = this.hoverOffset / window.ScooterTuning.hoverHeight * Math.PI / 2;
    }
    if (this.mesh.userData.backWheel) {
      this.mesh.userData.backWheel.rotation.order = 'ZYX';
      this.mesh.userData.backWheel.rotation.x = this.wheelRotation;
      this.mesh.userData.backWheel.rotation.z = -this.hoverOffset / window.ScooterTuning.hoverHeight * Math.PI / 2;
    }
    const ring = this.mesh.userData.hoverRing;
    if (ring) {
      const blend = this.hoverOffset / window.ScooterTuning.hoverHeight;
      const pulse = this.reducedMotion ? 1 : .9 + Math.sin(this.idleTime * 1.6) * .1;
      ring.visible = blend > .01;
      ring.scale.setScalar(this.reducedMotion ? 1 : 1 + Math.sin(this.idleTime) * .035);
      for (const part of ring.children) part.material.opacity = part.userData.baseOpacity * blend * pulse;
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
    this.mesh.userData.riderTail?.updatePose(dt, this);
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
