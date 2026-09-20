// SKY SCOOTER — LOUFFI EDITION
// Procedural 3D Asset Factory & Modular Mesh Generator (Zero External 3D Models Needed)
window.AssetFactory = class AssetFactory {
  constructor(THREE) {
    this.THREE = THREE;
    this.materials = {};
    this.geometries = {};
    this.initSharedMaterials();
    // Reuse geometry/materials for streamed items instead of allocating every spawn.
    for(const name of ['createCoin','createGem','createPowerup','createObstacle']){
      const build=this[name].bind(this),cache=new Map();
      this[name]=(...args)=>{const key=JSON.stringify(args);if(!cache.has(key))cache.set(key,build(...args));return cache.get(key).clone(true);};
    }
  }

  initSharedMaterials() {
    const THREE = this.THREE;
    // Core shared materials for performance and low-poly aesthetic
    this.materials.riderRed = new THREE.MeshLambertMaterial({ color: 0xd32f2f }); // Red hoodie & helmet
    this.materials.riderDark = new THREE.MeshLambertMaterial({ color: 0x212121 }); // Visor, joints, pants
    this.materials.riderSkin = new THREE.MeshLambertMaterial({ color: 0xffcc80 }); // Skin tone
    this.materials.riderShoe = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White sneakers

    this.materials.scooterMetal = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.8, roughness: 0.3 });
    this.materials.scooterDeck = new THREE.MeshLambertMaterial({ color: 0x37474f });
    this.materials.scooterTire = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this.materials.scooterGrip = new THREE.MeshLambertMaterial({ color: 0x263238 });

    this.materials.goldCoin = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x332200
    });

    this.materials.gem = new THREE.MeshStandardMaterial({
      color: 0xba68c8,
      metalness: 0.4,
      roughness: 0.1,
      emissive: 0x4a148c
    });

    this.materials.crate = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    this.materials.stone = new THREE.MeshLambertMaterial({ color: 0x90a4ae });
    this.materials.stoneDark = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    this.materials.wood = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });

    this.materials.shieldPowerup = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.75,
      metalness: 0.5,
      roughness: 0.1,
      emissive: 0x00838f
    });

    this.materials.magnetPowerup = new THREE.MeshStandardMaterial({
      color: 0xe53935,
      metalness: 0.6,
      roughness: 0.3
    });

    this.materials.doublePowerup = new THREE.MeshStandardMaterial({
      color: 0xffb300,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x553300
    });

    this.materials.overdrivePowerup = new THREE.MeshStandardMaterial({
      color: 0xffeb3b,
      emissive: 0xffa000,
      metalness: 0.8,
      roughness: 0.1
    });

    this.materials.heartPowerup = new THREE.MeshLambertMaterial({
      color: 0xff1744,
      emissive: 0x550011
    });

    this.materials.cloud = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92
    });

    this.materials.water = new THREE.MeshStandardMaterial({
      color: 0x00b0ff,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
      metalness: 0.1
    });
  }

  // Creates the iconic Adult Rider in Red Hoodie + Helmet with Scooter
  createRiderWithScooter() {
    if (window.louffiKit) {
      const root = window.louffiKit.getObjectByName('RiderScooter').clone(true);
      root.userData = {};
      ['scooter','rider','frontWheel','backWheel','headGroup','leftLeg','rightLeg'].forEach(name => root.userData[name] = root.getObjectByName(name));
      return root;
    }
    const THREE = this.THREE;
    const root = new THREE.Group();
    root.name = 'playerRoot';

    // 1. Scooter Group
    const scooter = new THREE.Group();
    scooter.name = 'scooter';

    // Deck (long, thin, beveled box)
    const deckGeo = new THREE.BoxGeometry(0.5, 0.08, 1.4);
    const deckMesh = new THREE.Mesh(deckGeo, this.materials.scooterDeck);
    deckMesh.position.set(0, 0.22, 0);
    scooter.add(deckMesh);

    // Grip tape strip
    const gripGeo = new THREE.BoxGeometry(0.42, 0.02, 1.2);
    const gripMesh = new THREE.Mesh(gripGeo, this.materials.scooterGrip);
    gripMesh.position.set(0, 0.27, 0);
    scooter.add(gripMesh);

    // Wheels (Front & Back)
    const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const frontWheel = new THREE.Mesh(wheelGeo, this.materials.scooterTire);
    frontWheel.position.set(0, 0.18, 0.65);
    scooter.add(frontWheel);

    const backWheel = new THREE.Mesh(wheelGeo, this.materials.scooterTire);
    backWheel.position.set(0, 0.18, -0.65);
    scooter.add(backWheel);

    // Steering Column & Fork
    const columnGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.25, 8);
    const columnMesh = new THREE.Mesh(columnGeo, this.materials.scooterMetal);
    columnMesh.position.set(0, 0.85, 0.62);
    columnMesh.rotation.x = -0.12; // slight sporty rake
    scooter.add(columnMesh);

    // Handlebars
    const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8);
    barGeo.rotateZ(Math.PI / 2);
    const barMesh = new THREE.Mesh(barGeo, this.materials.scooterMetal);
    barMesh.position.set(0, 1.45, 0.55);
    scooter.add(barMesh);

    // Handlebar Grips (left and right)
    const gripHandleGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8);
    gripHandleGeo.rotateZ(Math.PI / 2);
    const leftGrip = new THREE.Mesh(gripHandleGeo, this.materials.scooterGrip);
    leftGrip.position.set(-0.32, 1.45, 0.55);
    scooter.add(leftGrip);
    const rightGrip = new THREE.Mesh(gripHandleGeo, this.materials.scooterGrip);
    rightGrip.position.set(0.32, 1.45, 0.55);
    scooter.add(rightGrip);

    root.add(scooter);

    // 2. Rider Group (Adult in Red Hoodie + Helmet)
    const rider = new THREE.Group();
    rider.name = 'rider';

    // Torso (Red Hoodie)
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.7, 0.35);
    const torsoMesh = new THREE.Mesh(torsoGeo, this.materials.riderRed);
    torsoMesh.position.set(0, 1.25, 0.1);
    torsoMesh.rotation.x = 0.15; // athletic forward lean
    rider.add(torsoMesh);

    // Hoodie pocket / front pouch accent
    const pocketGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const pocketMesh = new THREE.Mesh(pocketGeo, this.materials.riderRed);
    pocketMesh.position.set(0, 1.15, 0.26);
    rider.add(pocketMesh);

    // Head with Red Helmet
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.85, 0.22);

    // Helmet (Sphere/Box hybrid)
    const helmetGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const helmetMesh = new THREE.Mesh(helmetGeo, this.materials.riderRed);
    headGroup.add(helmetMesh);

    // Dark Visor / Goggles
    const visorGeo = new THREE.BoxGeometry(0.32, 0.12, 0.18);
    const visorMesh = new THREE.Mesh(visorGeo, this.materials.riderDark);
    visorMesh.position.set(0, 0.02, 0.14);
    headGroup.add(visorMesh);

    rider.add(headGroup);

    // Arms (Holding handlebars)
    // Left Arm
    const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8);
    const leftArm = new THREE.Mesh(armGeo, this.materials.riderRed);
    leftArm.position.set(-0.35, 1.45, 0.35);
    leftArm.rotation.set(0.9, -0.2, -0.4);
    rider.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(armGeo, this.materials.riderRed);
    rightArm.position.set(0.35, 1.45, 0.35);
    rightArm.rotation.set(0.9, 0.2, 0.4);
    rider.add(rightArm);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, this.materials.riderDark);
    leftHand.position.set(-0.32, 1.45, 0.55);
    rider.add(leftHand);

    const rightHand = new THREE.Mesh(handGeo, this.materials.riderDark);
    rightHand.position.set(0.32, 1.45, 0.55);
    rider.add(rightHand);

    // Legs & Feet (Pants & Shoes on Deck)
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.75, 8);
    // Front foot (stands forward on deck)
    const leftLeg = new THREE.Mesh(legGeo, this.materials.riderDark);
    leftLeg.position.set(-0.12, 0.65, 0.15);
    leftLeg.rotation.x = 0.1;
    rider.add(leftLeg);

    const shoeGeo = new THREE.BoxGeometry(0.16, 0.12, 0.32);
    const leftShoe = new THREE.Mesh(shoeGeo, this.materials.riderShoe);
    leftShoe.position.set(-0.12, 0.32, 0.25);
    rider.add(leftShoe);

    // Back foot (kicking/standing stance)
    const rightLeg = new THREE.Mesh(legGeo, this.materials.riderDark);
    rightLeg.position.set(0.12, 0.65, -0.2);
    rightLeg.rotation.x = -0.15;
    rider.add(rightLeg);

    const rightShoe = new THREE.Mesh(shoeGeo, this.materials.riderShoe);
    rightShoe.position.set(0.12, 0.32, -0.28);
    rider.add(rightShoe);

    root.add(rider);

    // Store references for procedural animation
    root.userData = {
      scooter: scooter,
      rider: rider,
      frontWheel: frontWheel,
      backWheel: backWheel,
      headGroup: headGroup,
      leftLeg: leftLeg,
      rightLeg: rightLeg
    };

    return root;
  }

  // Procedural Gold Coin
  createCoin() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'coin';

    const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 14);
    coinGeo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(coinGeo, this.materials.goldCoin);
    group.add(mesh);

    // Star / inner bevel accent
    const innerGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 6);
    innerGeo.rotateZ(Math.PI / 2);
    const innerMesh = new THREE.Mesh(innerGeo, this.materials.goldCoin);
    group.add(innerMesh);

    return group;
  }

  // Procedural 3D Gem (Octahedron crystal)
  createGem() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'gem';

    const gemGeo = new THREE.OctahedronGeometry(0.5, 0);
    const mesh = new THREE.Mesh(gemGeo, this.materials.gem);
    group.add(mesh);

    return group;
  }

  // Power-up mesh based on type
  createPowerup(type) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = `powerup_${type}`;

    if (type === 'shield') {
      const sphereGeo = new THREE.SphereGeometry(0.5, 12, 12);
      const mesh = new THREE.Mesh(sphereGeo, this.materials.shieldPowerup);
      group.add(mesh);
      const ringGeo = new THREE.TorusGeometry(0.65, 0.05, 8, 24);
      const ring = new THREE.Mesh(ringGeo, this.materials.shieldPowerup);
      group.add(ring);
    } else if (type === 'magnet') {
      const ringGeo = new THREE.TorusGeometry(0.45, 0.12, 8, 16, Math.PI);
      const mesh = new THREE.Mesh(ringGeo, this.materials.magnetPowerup);
      mesh.rotation.z = Math.PI;
      group.add(mesh);
    } else if (type === 'double') {
      const geo = new THREE.IcosahedronGeometry(0.5, 0);
      const mesh = new THREE.Mesh(geo, this.materials.doublePowerup);
      group.add(mesh);
    } else if (type === 'overdrive') {
      // Lightning bolt icon
      const geo = new THREE.ConeGeometry(0.3, 0.9, 4);
      geo.rotateZ(Math.PI);
      const mesh = new THREE.Mesh(geo, this.materials.overdrivePowerup);
      group.add(mesh);
    } else if (type === 'heart') {
      // Heart shape with spheres + cone
      const hGroup = new THREE.Group();
      const sGeo = new THREE.SphereGeometry(0.24, 8, 8);
      const leftS = new THREE.Mesh(sGeo, this.materials.heartPowerup);
      leftS.position.set(-0.16, 0.16, 0);
      hGroup.add(leftS);
      const rightS = new THREE.Mesh(sGeo, this.materials.heartPowerup);
      rightS.position.set(0.16, 0.16, 0);
      hGroup.add(rightS);
      const cGeo = new THREE.ConeGeometry(0.38, 0.6, 8);
      cGeo.rotateZ(Math.PI);
      const cone = new THREE.Mesh(cGeo, this.materials.heartPowerup);
      cone.position.set(0, -0.15, 0);
      hGroup.add(cone);
      group.add(hGroup);
    }

    return group;
  }

  // Obstacle mesh
  createObstacle(type) {
    if (type === 'crate' && window.louffiKit) return window.louffiKit.getObjectByName('Crate').clone(true);
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = `obstacle_${type}`;

    if (type === 'crate') {
      const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      const mesh = new THREE.Mesh(geo, this.materials.crate);
      mesh.position.y = 0.6;
      group.add(mesh);
    } else if (type === 'barrier') {
      // Low stone jump barrier (0.75m high, jumpable)
      const geo = new THREE.BoxGeometry(2.4, 0.75, 0.4);
      const mesh = new THREE.Mesh(geo, this.materials.stoneDark);
      mesh.position.y = 0.375;
      group.add(mesh);
      // Warning yellow stripes
      const stripeGeo = new THREE.BoxGeometry(2.2, 0.15, 0.42);
      const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffeb3b });
      const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
      stripeMesh.position.y = 0.55;
      group.add(stripeMesh);
    } else if (type === 'gate') {
      // Tall barrier that must be dodged left/right
      const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 8);
      const leftPost = new THREE.Mesh(postGeo, this.materials.stone);
      leftPost.position.set(-1.1, 1.25, 0);
      group.add(leftPost);
      const rightPost = new THREE.Mesh(postGeo, this.materials.stone);
      rightPost.position.set(1.1, 1.25, 0);
      group.add(rightPost);
      const barGeo = new THREE.BoxGeometry(2.4, 0.5, 0.2);
      const bar = new THREE.Mesh(barGeo, this.materials.wood);
      bar.position.set(0, 1.8, 0);
      group.add(bar);
    } else {
      const geo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
      const mesh = new THREE.Mesh(geo, this.materials.stone);
      mesh.position.y = 0.5;
      group.add(mesh);
    }

    return group;
  }

  // Castle Tower for scenery
  createCastleTower(colorHex) {
    if (window.louffiKit) return window.louffiKit.getObjectByName('Castle').clone(true);
    const THREE = this.THREE;
    const group = new THREE.Group();

    const towerGeo = new THREE.CylinderGeometry(2.2, 2.6, 12, 10);
    const towerMat = new THREE.MeshLambertMaterial({ color: colorHex || 0x78909c });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.y = 6;
    group.add(tower);

    // Conical Roof
    const roofGeo = new THREE.ConeGeometry(2.8, 5.0, 10);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xd32f2f }); // Red castle roof
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 14.5;
    group.add(roof);

    return group;
  }

  // Floating Island for background scenery
  createFloatingIsland(grassColorHex, rockColorHex, radius = 6.0) {
    if (window.louffiKit) {
      const island=window.louffiKit.getObjectByName('Island').clone(true);
      island.scale.setScalar(radius/5); return island;
    }
    const THREE = this.THREE;
    const group = new THREE.Group();

    // Island rock underside (inverted cone/hemisphere)
    const rockGeo = new THREE.ConeGeometry(radius, radius * 1.6, 7);
    rockGeo.rotateX(Math.PI);
    const rockMat = new THREE.MeshLambertMaterial({ color: rockColorHex || 0x5d4037 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = -radius * 0.8;
    group.add(rock);

    // Island green grass top
    const grassGeo = new THREE.CylinderGeometry(radius * 1.05, radius, 1.0, 7);
    const grassMat = new THREE.MeshLambertMaterial({ color: grassColorHex || 0x4caf50 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.position.y = 0.5;
    group.add(grass);

    return group;
  }

  // Low-poly Tree
  createTree() {
    if (window.louffiKit) return window.louffiKit.getObjectByName('Tree').clone(true);
    const THREE = this.THREE;
    const group = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.9;
    group.add(trunk);

    // Pine Foliage
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    for (let i = 0; i < 3; i++) {
      const coneGeo = new THREE.ConeGeometry(1.4 - i * 0.3, 1.6, 6);
      const cone = new THREE.Mesh(coneGeo, foliageMat);
      cone.position.y = 2.0 + i * 0.9;
      group.add(cone);
    }

    return group;
  }

  // Finish Gate
  createFinishGate(roundName) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'finishGate';

    // Left & Right Pillars
    const pillarGeo = new THREE.BoxGeometry(1.2, 7.0, 1.2);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xffd700 }); // Golden victory pillars
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-4.5, 3.5, 0);
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(4.5, 3.5, 0);
    group.add(rightPillar);

    // Cross Arch
    const archGeo = new THREE.BoxGeometry(10.2, 1.4, 1.0);
    const arch = new THREE.Mesh(archGeo, pillarMat);
    arch.position.set(0, 6.8, 0);
    group.add(arch);

    // Checkered Banner
    const bannerGeo = new THREE.PlaneGeometry(8.5, 1.2);
    const bannerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 5.2, 0);
    group.add(banner);

    return group;
  }
};
