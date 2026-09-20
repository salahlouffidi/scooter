// LOUFFI CITY RUSH — LOUFFI EDITION
// Procedural Track Generator, Continuous Spline & Segment Pooling
window.TrackGenerator = class TrackGenerator {
  constructor(scene, assetFactory, THREE) {
    this.scene = scene;
    this.factory = assetFactory;
    this.THREE = THREE;

    this.roundData = null;
    this.seed = 12345;
    this.rng = null;

    // Track segments & active pools
    this.activeSegments = [];
    this.activeCollectibles = [];
    this.activeObstacles = [];
    this.sceneryObjects = [];
    this.finishGate = null;

    this.segmentLength = 24.0;
    this.spawnAheadDistance = 160.0;
    this.recycleBehindDistance = 60.0;
    this.nextSpawnS = 0;

    // Road materials cache
    this.roadMaterial = null;
    this.railMaterial = null;
  }

  // Seeded PRNG (Mulberry32)
  initRNG(seed) {
    this.seed = seed;
    this.rngState = seed >>> 0;
    this.rng = () => {
      const s = this.rngState = (this.rngState + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  buildRound(roundData, seed = Date.now()) {
    this.roundData = roundData;
    this.initRNG(seed);
    this.clearAll();

    const THREE = this.THREE;
    this.roadMaterial = new THREE.MeshLambertMaterial({ color: roundData.roadColor || 0xd7ccc8 });
    this.railMaterial = new THREE.MeshLambertMaterial({ color: roundData.railColor || 0x81c784 });

    this.nextSpawnS = 0;
    // Initial segment spawn ahead
    while (this.nextSpawnS < this.spawnAheadDistance) {
      this.spawnNextSegment();
    }
  }

  // Converts track S (forward distance) to 3D world position
  getTrackPoint(s) {
    // Gentle procedural curve based on sine waves
    const curvature = 0.008;
    const curveAmp = 18.0;
    const x = Math.sin(s * curvature) * curveAmp;
    const y = 0.0;
    const z = s;
    return { x, y, z };
  }

  getTrackTangent(s) {
    const curvature = 0.008;
    const curveAmp = 18.0;
    const dx = Math.cos(s * curvature) * curveAmp * curvature;
    const dz = 1.0;
    const len = Math.sqrt(dx * dx + dz * dz);
    return { x: dx / len, y: 0, z: dz / len };
  }

  spawnNextSegment() {
    const THREE = this.THREE;
    const sStart = this.nextSpawnS;
    const sEnd = sStart + this.segmentLength;
    const roadWidth = this.roundData.roadWidth || 8.0;
    const isPastFinish = sStart >= this.roundData.length;

    // Check if this segment is a gap
    const isGap = !isPastFinish &&
                  this.roundData.features.hasGaps &&
                  sStart > this.roundData.firstSafeDistance &&
                  (Math.floor(sStart / 120) % 3 === 2) &&
                  ((sStart % 120) < this.segmentLength);

    const segGroup = new THREE.Group();
    segGroup.name = `segment_${sStart}`;
    segGroup.userData = { sStart, sEnd, isGap, openLanes: [-1, 0, 1] };

    const pStart = this.getTrackPoint(sStart);
    const pEnd = this.getTrackPoint(sEnd);
    const pMid = {
      x: (pStart.x + pEnd.x) / 2,
      y: (pStart.y + pEnd.y) / 2,
      z: (pStart.z + pEnd.z) / 2
    };

    const tangent = this.getTrackTangent((sStart + sEnd) / 2);
    const angleY = Math.atan2(tangent.x, tangent.z);

    segGroup.position.set(pMid.x, pMid.y, pMid.z);
    segGroup.rotation.y = angleY;

    if (!isGap) {
      // Standard road surface
      const roadGeo = new THREE.BoxGeometry(roadWidth, 0.4, this.segmentLength);
      const roadMesh = new THREE.Mesh(roadGeo, this.roadMaterial);
      roadMesh.position.y = -0.2;
      segGroup.add(roadMesh);

      // Stone curb rails on left and right
      const railGeo = new THREE.BoxGeometry(0.35, 0.5, this.segmentLength);
      const leftRail = new THREE.Mesh(railGeo, this.railMaterial);
      leftRail.position.set(-roadWidth / 2 + 0.17, 0.15, 0);
      segGroup.add(leftRail);

      const rightRail = new THREE.Mesh(railGeo, this.railMaterial);
      rightRail.position.set(roadWidth / 2 - 0.17, 0.15, 0);
      segGroup.add(rightRail);

      // Bridge support pillars extending into clouds
      if (sStart % (this.segmentLength * 2) === 0) {
        const pillarGeo = new THREE.CylinderGeometry(1.2, 1.6, 24, 8);
        const pillarMesh = new THREE.Mesh(pillarGeo, this.factory.materials.stoneDark);
        pillarMesh.position.set(0, -12, 0);
        segGroup.add(pillarMesh);
      }
    } else {
      // Gap section: clearly marked ramp / warning stripes at launch & landing
      const rampGeo = new THREE.BoxGeometry(roadWidth, 0.6, 4.0);
      const rampMat = new THREE.MeshLambertMaterial({ color: 0xffb300 }); // Yellow caution ramp
      const ramp = new THREE.Mesh(rampGeo, rampMat);
      ramp.position.set(0, 0.1, -this.segmentLength / 2 + 2.0);
      ramp.rotation.x = 0.15;
      segGroup.add(ramp);
    }

    this.scene.add(segGroup);
    this.activeSegments.push(segGroup);

    // Spawn gameplay elements (coins, obstacles, pickups, scenery)
    if (!isPastFinish) {
      this.populateSegment(sStart, sEnd, isGap, roadWidth, segGroup);
    } else if (sStart <= this.roundData.length + this.segmentLength && !this.finishGate) {
      // Spawn Finish Gate!
      this.finishGate = this.factory.createFinishGate(this.roundData.name);
      const finishP = this.getTrackPoint(this.roundData.length);
      const finishTan = this.getTrackTangent(this.roundData.length);
      this.finishGate.position.set(finishP.x, finishP.y, finishP.z);
      this.finishGate.rotation.y = Math.atan2(finishTan.x, finishTan.z);
      this.scene.add(this.finishGate);
    }

    this.nextSpawnS = sEnd;
  }

  populateSegment(sStart, sEnd, isGap, roadWidth, segGroup) {
    const isFirstSafe = sStart < (this.roundData.firstSafeDistance || 60);
    const lanes = [-roadWidth * 0.28, 0, roadWidth * 0.28]; // Left, Center, Right

    // 1. Coins Trails
    const coinPattern = Math.floor(this.rng() * 4);
    const laneIndex = Math.floor(this.rng() * 3);
    const coinLaneX = lanes[laneIndex];

    const coinCount = isGap ? 3 : 5;
    for (let c = 0; c < coinCount; c++) {
      const coinS = sStart + 4.0 + c * 3.5;
      const coinMesh = this.factory.createCoin();
      const p = this.getTrackPoint(coinS);
      const tan = this.getTrackTangent(coinS);
      const normal = { x: -tan.z, z: tan.x };

      const coinX = p.x + normal.x * coinLaneX;
      const coinY = isGap ? 2.2 : 1.1; // Higher jump arc if over gap
      const coinZ = p.z + normal.z * coinLaneX;

      coinMesh.position.set(coinX, coinY, coinZ);
      coinMesh.userData = { id: `coin_${coinS}`, s: coinS, x: coinX, y: coinY, z: coinZ, collected: false };
      this.scene.add(coinMesh);
      this.activeCollectibles.push(coinMesh);
    }

    // 2. Rare Gems (100 pts)
    if (this.rng() < 0.25) {
      const gemS = sStart + 12.0;
      const gemLane = lanes[(laneIndex + 1) % 3];
      const gemMesh = this.factory.createGem();
      const p = this.getTrackPoint(gemS);
      const tan = this.getTrackTangent(gemS);
      const normal = { x: -tan.z, z: tan.x };

      gemMesh.position.set(p.x + normal.x * gemLane, 1.3, p.z + normal.z * gemLane);
      gemMesh.userData = { id: `gem_${gemS}`, isGem: true, s: gemS, collected: false };
      this.scene.add(gemMesh);
      this.activeCollectibles.push(gemMesh);
    }

    // 3. Rare Power-ups (Shield, Magnet, Double, Heart, Overdrive)
    if (this.rng() < 0.16 && !isFirstSafe) {
      const powerupTypes = ['shield', 'magnet', 'double', 'heart', 'overdrive'];
      const chosenType = powerupTypes[Math.floor(this.rng() * powerupTypes.length)];
      const powS = sStart + 16.0;
      const powLane = lanes[(laneIndex + 2) % 3];
      const powMesh = this.factory.createPowerup(chosenType);
      const p = this.getTrackPoint(powS);
      const tan = this.getTrackTangent(powS);
      const normal = { x: -tan.z, z: tan.x };

      powMesh.position.set(p.x + normal.x * powLane, 1.4, p.z + normal.z * powLane);
      powMesh.userData = { id: `power_${powS}`, isPowerup: true, type: chosenType, s: powS, collected: false };
      this.scene.add(powMesh);
      this.activeCollectibles.push(powMesh);
    }

    // 4. Obstacles (Only outside safe zone and if not a gap)
    if (!isFirstSafe && !isGap) {
      // Leave at least one guaranteed open lane!
      const blockedLaneIndices = [];
      if (this.rng() < 0.65) {
        blockedLaneIndices.push((laneIndex + 1) % 3);
      }
      // If higher density, block a 2nd lane only if safe spacing exists
      if (this.rng() < 0.25) {
        blockedLaneIndices.push((laneIndex + 2) % 3);
      }

      blockedLaneIndices.forEach(idx => {
        const obsType = this.roundData.features.hasJumps && this.rng() < 0.5 ? 'barrier' : 'crate';
        const obsMesh = this.factory.createObstacle(obsType);
        const obsS = sStart + 12.0;
        const obsLaneX = lanes[idx];
        const p = this.getTrackPoint(obsS);
        const tan = this.getTrackTangent(obsS);
        const normal = { x: -tan.z, z: tan.x };

        obsMesh.position.set(p.x + normal.x * obsLaneX, 0, p.z + normal.z * obsLaneX);
        obsMesh.rotation.y = Math.atan2(tan.x, tan.z);
        obsMesh.userData = {
          id: `obs_${obsS}_${idx}`,
          s: obsS,
          laneX: obsLaneX,
          type: obsType,
          hit: false,
          isJumpable: obsType === 'barrier'
        };
        this.scene.add(obsMesh);
        this.activeObstacles.push(obsMesh);
      });
    }

    // 5. Scenery: Floating islands, Castle Towers, Trees, Clouds along road
    const side = this.rng() < 0.5 ? -1 : 1;
    const sceneryDist = roadWidth / 2 + 12.0 + this.rng() * 18.0;
    const pScenery = this.getTrackPoint(sStart + 12.0);
    const tanScenery = this.getTrackTangent(sStart + 12.0);
    const normalScenery = { x: -tanScenery.z, z: tanScenery.x };

    const posX = pScenery.x + normalScenery.x * sceneryDist * side;
    const posZ = pScenery.z + normalScenery.z * sceneryDist * side;

    if (this.rng() < 0.45) {
      // Floating Island
      const island = this.factory.createFloatingIsland(
        this.roundData.islandGrassColor,
        this.roundData.islandRockColor,
        6.0 + this.rng() * 5.0
      );
      island.position.set(posX, -2.0 - this.rng() * 6.0, posZ);
      this.scene.add(island);
      this.sceneryObjects.push(island);

      // Optional tower on island
      if (this.rng() < 0.35) {
        const tower = this.factory.createCastleTower(this.roundData.railColor);
        tower.position.set(posX, 1.0, posZ);
        this.scene.add(tower);
        this.sceneryObjects.push(tower);
      }
    }
  }

  update(playerS) {
    // 1. Spawn ahead
    while (this.nextSpawnS < playerS + this.spawnAheadDistance && this.nextSpawnS < this.roundData.length + 80.0) {
      this.spawnNextSegment();
    }

    // 2. Recycle behind
    const recycleThresholdS = playerS - this.recycleBehindDistance;

    // Segments
    for (let i = this.activeSegments.length - 1; i >= 0; i--) {
      const seg = this.activeSegments[i];
      if (seg.userData.sEnd < recycleThresholdS) {
        this.scene.remove(seg);
        this.activeSegments.splice(i, 1);
      }
    }

    // Collectibles
    for (let i = this.activeCollectibles.length - 1; i >= 0; i--) {
      const item = this.activeCollectibles[i];
      if (item.userData.s < recycleThresholdS || item.userData.collected) {
        this.scene.remove(item);
        this.activeCollectibles.splice(i, 1);
      }
    }

    // Obstacles
    for (let i = this.activeObstacles.length - 1; i >= 0; i--) {
      const obs = this.activeObstacles[i];
      if (obs.userData.s < recycleThresholdS) {
        this.scene.remove(obs);
        this.activeObstacles.splice(i, 1);
      }
    }

    // Scenery
    for (let i = this.sceneryObjects.length - 1; i >= 0; i--) {
      const obj = this.sceneryObjects[i];
      if (obj.position.z < recycleThresholdS) {
        this.scene.remove(obj);
        this.sceneryObjects.splice(i, 1);
      }
    }
  }

  clearAll() {
    this.activeSegments.forEach(s => this.scene.remove(s));
    this.activeSegments = [];
    this.activeCollectibles.forEach(c => this.scene.remove(c));
    this.activeCollectibles = [];
    this.activeObstacles.forEach(o => this.scene.remove(o));
    this.activeObstacles = [];
    this.sceneryObjects.forEach(sc => this.scene.remove(sc));
    this.sceneryObjects = [];
    if (this.finishGate) {
      this.scene.remove(this.finishGate);
      this.finishGate = null;
    }
  }
};
