// SKY SCOOTER — LOUFFI EDITION
// PaperRoute Delivery System (Inspired by @builtbysketch PaperRoute & classic arcade delivery)
// Handles rolled paper projectiles, curbside mailboxes, throw arc physics, and combo scoring.

window.PaperDeliverySystem = class PaperDeliverySystem {
  constructor(scene, assetFactory, THREE) {
    this.scene = scene;
    this.factory = assetFactory;
    this.THREE = THREE;

    // Delivery inventory & stats
    this.maxPapers = 15;
    this.papers = 10;
    this.deliveriesMade = 0;
    this.totalMailboxes = 0;
    this.deliveryStreak = 0;
    this.deliveryScore = 0;

    // Active entities
    this.activeMailboxes = [];
    this.activeProjectiles = [];

    // Shared geometry & materials for thrown papers
    this.paperGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8);
    this.paperGeo.rotateZ(Math.PI / 2);
    this.paperMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e6,
      roughness: 0.8,
      metalness: 0.05
    });
    this.bandMat = new THREE.MeshStandardMaterial({
      color: 0xd32f2f, // Red rubber band around rolled paper
      roughness: 0.4
    });
  }

  reset(totalEstimatedMailboxes = 8) {
    // Clean up old projectiles
    this.activeProjectiles.forEach(p => {
      if (p.mesh && p.mesh.parent) this.scene.remove(p.mesh);
    });
    this.activeProjectiles = [];

    // Clean up old mailboxes
    this.activeMailboxes.forEach(m => {
      if (m.mesh && m.mesh.parent) this.scene.remove(m.mesh);
    });
    this.activeMailboxes = [];

    this.papers = 10;
    this.deliveriesMade = 0;
    this.totalMailboxes = totalEstimatedMailboxes;
    this.deliveryStreak = 0;
    this.deliveryScore = 0;
  }

  addPapers(count) {
    this.papers = Math.min(this.maxPapers, this.papers + count);
  }

  createPaperMesh() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const roll = new THREE.Mesh(this.paperGeo, this.paperMat);
    roll.castShadow = true;
    group.add(roll);

    const bandGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.08, 8);
    bandGeo.rotateZ(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, this.bandMat);
    group.add(band);

    return group;
  }

  // Spawn curbside mailbox target along track
  spawnMailbox(s, side, roadWidth, trackPoint, trackTangent) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = `mailbox_${s}_${side}`;

    const curbDist = (roadWidth / 2) + 1.25;
    const normal = { x: -trackTangent.z, z: trackTangent.x };
    const posX = trackPoint.x + normal.x * (side * curbDist);
    const posY = trackPoint.y;
    const posZ = trackPoint.z + normal.z * (side * curbDist);

    // 1. Wooden post
    const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.1, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.9 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.55;
    post.castShadow = true;
    group.add(post);

    // 2. Mailbox box (curved top)
    const boxGeo = new THREE.BoxGeometry(0.35, 0.35, 0.6);
    const boxColor = (Math.abs(s * 13) % 2 === 0) ? 0x1976d2 : 0x37474f; // Blue or Charcoal
    const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, metalness: 0.6, roughness: 0.35 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 1.15, 0);
    box.castShadow = true;
    group.add(box);

    const topGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.6, 8, 1, false, 0, Math.PI);
    topGeo.rotateZ(Math.PI / 2);
    topGeo.rotateY(Math.PI / 2);
    const top = new THREE.Mesh(topGeo, boxMat);
    top.position.set(0, 1.32, 0);
    group.add(top);

    // 3. Red delivery flag (rotates up when delivered!)
    const flagGeo = new THREE.BoxGeometry(0.03, 0.28, 0.12);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4 });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(side * 0.2, 1.2, -0.15);
    flag.rotation.z = side > 0 ? 0.4 : -0.4;
    group.add(flag);

    // 4. Target highlight ring (glows when in range)
    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 6, 16);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.65
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.15, 0);
    group.add(ring);

    // Orientation: face the road
    const angleY = Math.atan2(trackTangent.x, trackTangent.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    group.position.set(posX, posY, posZ);
    group.rotation.y = angleY;

    this.scene.add(group);

    const mailboxData = {
      mesh: group,
      flagMesh: flag,
      ringMesh: ring,
      s: s,
      side: side,
      pos: new THREE.Vector3(posX, posY + 1.15, posZ),
      delivered: false,
      hitAnim: 0
    };

    this.activeMailboxes.push(mailboxData);
    this.totalMailboxes++;
    return mailboxData;
  }

  // Find the closest undelivered mailbox ahead of the rider
  findTargetMailbox(riderS, riderSide = 0, maxDistance = 35.0) {
    let closest = null;
    let closestDist = Infinity;

    for (const m of this.activeMailboxes) {
      if (m.delivered) continue;
      const distAhead = m.s - riderS;
      if (distAhead >= -2.0 && distAhead <= maxDistance) {
        // If side is specified (-1 or 1), prioritize that side
        if (riderSide !== 0 && m.side !== riderSide && distAhead > 8.0) continue;
        if (distAhead < closestDist) {
          closestDist = distAhead;
          closest = m;
        }
      }
    }
    return closest;
  }

  // Toss newspaper projectile
  throwPaper(rider, trackGen, direction = 0, onEvent = null) {
    if (this.papers <= 0) {
      if (onEvent) onEvent('paper_empty');
      return false;
    }

    this.papers--;
    const THREE = this.THREE;

    // Determine target side
    let targetSide = direction;
    const targetMailbox = this.findTargetMailbox(rider.s, direction);
    if (targetMailbox) {
      targetSide = targetMailbox.side;
    } else if (targetSide === 0) {
      targetSide = rider.laneX >= 0 ? 1 : -1;
    }

    const mesh = this.createPaperMesh();
    const riderPos = rider.mesh.position.clone();
    // Launch from rider hand height
    mesh.position.set(riderPos.x, riderPos.y + 1.1, riderPos.z);
    this.scene.add(mesh);

    const tan = trackGen.getTrackTangent(rider.s);
    const normal = new THREE.Vector3(-tan.z, 0, tan.x);

    // Initial toss velocity
    // Forward velocity matching scooter + toss
    const forwardSpeed = rider.forwardSpeed * 0.95;
    // Lateral velocity towards curbside target
    const lateralSpeed = targetSide * 16.0;
    // Upward velocity for smooth parabolic lob
    const verticalSpeed = 6.2;

    const vel = new THREE.Vector3(
      tan.x * forwardSpeed + normal.x * lateralSpeed,
      verticalSpeed,
      tan.z * forwardSpeed + normal.z * lateralSpeed
    );

    const projectile = {
      mesh: mesh,
      vel: vel,
      spinSpeed: 18.0 + Math.random() * 8.0,
      spinAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      life: 2.2,
      targetMailbox: targetMailbox,
      delivered: false
    };

    this.activeProjectiles.push(projectile);
    if (onEvent) onEvent('paper_toss', mesh.position);
    return true;
  }

  update(dt, rider, onEvent = null) {
    const THREE = this.THREE;
    const gravity = 20.0;

    // 1. Update active target highlight rings
    for (const m of this.activeMailboxes) {
      if (m.delivered) {
        m.ringMesh.visible = false;
        continue;
      }
      const dist = m.s - rider.s;
      if (dist > 0 && dist < 30.0) {
        m.ringMesh.visible = true;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
        m.ringMesh.material.opacity = 0.4 + pulse * 0.5;
        m.ringMesh.scale.setScalar(1.0 + pulse * 0.15);
      } else {
        m.ringMesh.visible = false;
      }

      // Animate flag popup if just hit
      if (m.hitAnim > 0) {
        m.hitAnim -= dt * 4.0;
        m.flagMesh.rotation.z = Math.min(1.5, m.flagMesh.rotation.z + dt * 10.0);
      }
    }

    // 2. Update projectiles
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.life -= dt;

      // Apply gravity
      p.vel.y -= gravity * dt;

      // Integrate position
      p.mesh.position.addScaledVector(p.vel, dt);

      // Spin
      p.mesh.rotateOnAxis(p.spinAxis, p.spinSpeed * dt);

      // Collision check against target mailbox
      let hit = false;
      for (const m of this.activeMailboxes) {
        if (m.delivered) continue;
        const dist = p.mesh.position.distanceTo(m.pos);
        if (dist < 1.45) {
          // DIRECT HIT! Successful delivery!
          m.delivered = true;
          m.hitAnim = 1.0;
          this.deliveriesMade++;
          this.deliveryStreak++;

          const basePts = 150;
          const streakBonus = (this.deliveryStreak - 1) * 50;
          const totalPts = basePts + streakBonus;
          this.deliveryScore += totalPts;

          if (onEvent) {
            onEvent('delivery_hit', {
              pos: m.pos,
              points: totalPts,
              streak: this.deliveryStreak,
              mailbox: m
            });
          }

          hit = true;
          break;
        }
      }

      // Ground collision or expire
      const groundY = rider.trackGen.getTrackPoint(rider.s).y - 0.2;
      if (hit || p.mesh.position.y <= groundY || p.life <= 0) {
        if (!hit && p.targetMailbox && !p.targetMailbox.delivered && p.mesh.position.y <= groundY) {
          // Missed throw
          this.deliveryStreak = 0;
          if (onEvent) onEvent('delivery_miss', p.mesh.position);
        }
        this.scene.remove(p.mesh);
        this.activeProjectiles.splice(i, 1);
      }
    }

    // 3. Recycle old mailboxes behind rider
    for (let i = this.activeMailboxes.length - 1; i >= 0; i--) {
      const m = this.activeMailboxes[i];
      if (m.s < rider.s - 60.0) {
        this.scene.remove(m.mesh);
        this.activeMailboxes.splice(i, 1);
      }
    }
  }
};
