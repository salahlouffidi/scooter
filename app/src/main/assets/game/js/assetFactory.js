// LOUFFI CITY RUSH — LOUFFI EDITION
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
      this[name]=(...args)=>{const key=JSON.stringify(args);if(!cache.has(key)){
        const object=build(...args);
        if(name==='createObstacle'){
          object.updateMatrixWorld(true);
          const b=new THREE.Box3().setFromObject(object);
          object.userData.collision={halfWidth:Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),
            halfLength:Math.max(Math.abs(b.min.z),Math.abs(b.max.z)),top:b.max.y};
        }
        cache.set(key,object);
      }return cache.get(key).clone(true);};
    }
  }

  initSharedMaterials() {
    const THREE = this.THREE;
    // Core shared materials for performance and low-poly aesthetic
    this.materials.riderRed = new THREE.MeshLambertMaterial({ color: 0xd32f2f }); // Red hoodie & helmet
    this.materials.riderDark = new THREE.MeshLambertMaterial({ color: 0x212121 }); // Visor, joints, pants
    this.materials.riderSkin = new THREE.MeshLambertMaterial({ color: 0xffcc80 }); // Skin tone
    this.materials.riderShoe = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White sneakers

    this.materials.scooterMetal = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.55, roughness: 0.35 });
    this.materials.scooterDeck = new THREE.MeshLambertMaterial({ color: 0x37474f });
    this.materials.scooterTire = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this.materials.scooterGrip = new THREE.MeshLambertMaterial({ color: 0x263238 });

    this.materials.goldCoin = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.35,
      roughness: 0.25,
      emissive: 0x664400
    });

    this.materials.gem = new THREE.MeshStandardMaterial({
      color: 0xba68c8,
      metalness: 0.15,
      roughness: 0.15,
      emissive: 0x7b1fa2
    });

    this.materials.crate = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    this.materials.stone = new THREE.MeshLambertMaterial({ color: 0x90a4ae });
    this.materials.stoneDark = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    this.materials.wood = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    this.materials.vehicleYellow = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: .62, metalness: .08 });
    this.materials.vehicleBlue = new THREE.MeshStandardMaterial({ color: 0x315e9b, roughness: .58, metalness: .12 });
    this.materials.vehicleWhite = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: .68, metalness: .05 });
    this.materials.vehicleGlass = new THREE.MeshStandardMaterial({ color: 0x17354f, roughness: .2, metalness: .35, emissive: 0x081522, emissiveIntensity: .35 });
    this.materials.vehicleTire = new THREE.MeshLambertMaterial({ color: 0x20252b });
    this.materials.warningOrange = new THREE.MeshStandardMaterial({ color: 0xf07832, roughness: .7 });
    this.materials.warningWhite = new THREE.MeshStandardMaterial({ color: 0xfff1d0, roughness: .8 });
    this.materials.warningRed = new THREE.MeshStandardMaterial({ color: 0xc93b42, roughness: .72 });
    this.materials.streetMetal = new THREE.MeshStandardMaterial({ color: 0x68747d, roughness: .5, metalness: .48 });

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

    this.materials.magicFruitPowerup = new THREE.MeshStandardMaterial({
      color: 0xff5fc8,
      emissive: 0xff1e9a,
      emissiveIntensity: .65,
      metalness: .2,
      roughness: .22
    });

    this.materials.propulsorPowerup = new THREE.MeshStandardMaterial({
      color: 0x65efff,
      emissive: 0x0aa8ff,
      emissiveIntensity: .85,
      metalness: .55,
      roughness: .16
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
      // A gold star marks the five-second turbo pickup.
      const geo = window.createScooterStar(THREE, .65);
      const material = this.materials.overdrivePowerup.clone();
      material.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geo, material);
      group.add(mesh);
    } else if (type === 'magic_fruit') {
      // A glowing fruit grants speed and two protected faults.
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(.48, 10, 8), this.materials.magicFruitPowerup);
      fruit.scale.set(.9, 1.12, .9); group.add(fruit);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.16, .42, 6), this.materials.overdrivePowerup);
      leaf.position.set(.12, .5, 0); leaf.rotation.z = -.45; group.add(leaf);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.7, .045, 8, 24), this.materials.magicFruitPowerup);
      ring.rotation.x = Math.PI / 2; group.add(ring);
    } else if (type === 'propulsor') {
      // A sky-lift ring with a bright core and three flame petals.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.68, .12, 8, 24), this.materials.propulsorPowerup);
      ring.rotation.x = Math.PI / 2; group.add(ring);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(.38, 0), this.materials.propulsorPowerup);
      group.add(core);
      for (let i = 0; i < 3; i++) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(.12, .55, 6), this.materials.warningWhite);
        const a = i * Math.PI * 2 / 3; flame.position.set(Math.cos(a) * .4, -.52, Math.sin(a) * .4); flame.rotation.x = Math.PI; group.add(flame);
      }
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
  createObstacle(type, city = '') {
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
    } else if (type === 'bollard') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.22, .27, .95, 10), this.materials.streetMetal);
      post.position.y = .475; group.add(post);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.235, .235, .13, 10), this.materials.warningRed);
      band.position.y = .68; group.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .08, 10), this.materials.warningWhite);
      cap.position.y = .97; group.add(cap);
    } else if (type === 'traffic_cone') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.38, .42, .12, 10), this.materials.warningWhite);
      base.position.y = .06; group.add(base);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.29, .68, 10), this.materials.warningOrange);
      cone.position.y = .42; group.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.22, .25, .1, 10), this.materials.warningWhite);
      band.position.y = .51; group.add(band);
    } else if (type === 'construction_barrier') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.5, .22, .45), this.materials.warningOrange);
      base.position.y = .11; group.add(base);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.35, .72, .18), this.materials.warningOrange);
      rail.position.y = .58; group.add(rail);
      for (let i = -1; i <= 1; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(.34, .64, .2), i % 2 ? this.materials.warningWhite : this.materials.warningRed);
        stripe.position.set(i * .7, .58, -.11); stripe.rotation.z = i ? (i > 0 ? -.35 : .35) : 0; group.add(stripe);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), this.materials.warningRed);
      lamp.position.set(0, .98, 0); group.add(lamp);
    } else if (type === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.45, .5, .85, 12), this.materials.warningOrange);
      barrel.position.y = .43; group.add(barrel);
      for (const y of [.24, .64]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .055, 6, 16), this.materials.warningWhite);
        ring.rotation.x = Math.PI / 2; ring.position.y = y; group.add(ring);
      }
    } else if (type === 'car' || type === 'taxi' || type === 'van' || type === 'bus') {
      const bus = type === 'bus', compact = type === 'car' || type === 'taxi';
      const bodyMat = bus ? (city==='London'?this.materials.warningRed:this.materials.vehicleBlue) : (type === 'taxi' ? this.materials.vehicleYellow : compact ? this.materials.vehicleWhite : this.materials.vehicleYellow);
      const width = bus ? 2.45 : compact ? 1.85 : 2.15, height = bus ? 1.5 : compact ? 1.0 : 1.22, length = bus ? 4.15 : compact ? 2.65 : 3.25;
      // Bevels catch the directional light, making traffic readable at speed.
      const softBox=(w,h,d,r=.1)=>{
        const shape=new THREE.Shape(),ww=w-2*r,hh=h-2*r;
        shape.moveTo(-ww/2,-hh/2);shape.lineTo(ww/2,-hh/2);shape.lineTo(ww/2,hh/2);shape.lineTo(-ww/2,hh/2);shape.closePath();
        const geo=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});
        geo.translate(0,0,-d/2+r);geo.computeVertexNormals();return geo;
      };
      const body = new THREE.Mesh(softBox(width, height, length), bodyMat);
      body.position.y = bus ? .82 : compact ? .58 : .7; group.add(body);
      const roof = new THREE.Mesh(softBox(width - .2, .32, length - (bus ? .6 : .55),.065), bodyMat);
      roof.position.y = bus ? 1.67 : compact ? 1.18 : 1.45; group.add(roof);
      const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(bus ? 1.9 : compact ? 1.35 : 1.55, bus ? .42 : compact ? .32 : .42, .06), this.materials.vehicleGlass);
      frontGlass.position.set(0, bus ? 1.29 : compact ? .91 : 1.1, bus ? 2.08 : compact ? 1.36 : 1.66); group.add(frontGlass);
      const rearGlass = frontGlass.clone(); rearGlass.position.z = bus ? -2.08 : compact ? -1.36 : -1.66; group.add(rearGlass);
      for (const side of [-1, 1]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(.055, bus ? .52 : compact ? .34 : .42, bus ? 2.5 : compact ? 1.55 : 1.65), this.materials.vehicleGlass);
        window.position.set(side * (bus ? 1.25 : compact ? .94 : 1.1), bus ? 1.22 : compact ? .9 : 1.08, 0); group.add(window);
      }
      const wheelRadius = bus ? .38 : compact ? .28 : .32, wheelHalf = bus ? 1.23 : compact ? .94 : 1.08, wheelZ = bus ? 1.35 : compact ? .78 : .95;
      const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, .2, 12); wheelGeo.rotateZ(Math.PI / 2);
      for (const x of [-1, 1]) for (const z of [-wheelZ, wheelZ]) {
        const wheel = new THREE.Mesh(wheelGeo, this.materials.vehicleTire); wheel.position.set(x * wheelHalf, .28, z); group.add(wheel);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius*.54,wheelRadius*.54,.22,12),this.materials.scooterMetal);
        hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);group.add(hub);
      }
      const headlightMat = new THREE.MeshStandardMaterial({color:0xfff1b0,emissive:0xffc34e,emissiveIntensity:.8});
      for (const x of [-.62, .62]) { const light = new THREE.Mesh(new THREE.BoxGeometry(.24,.16,.06), headlightMat); light.position.set(x,bus? .7:compact ? .54:.68,bus?2.1:compact ? 1.4:1.67); group.add(light); }
      for(const sign of [-1,1]){
        const bumper=new THREE.Mesh(softBox(width-.12,.14,.15,.025),this.materials.streetMetal);bumper.position.set(0,.32,sign*(length/2+.025));group.add(bumper);
        const plate=new THREE.Mesh(new THREE.BoxGeometry(.48,.13,.022),this.materials.warningWhite);plate.position.set(0,.5,sign*(length/2+.09));group.add(plate);
        const rear=new THREE.Mesh(new THREE.BoxGeometry(.23,.18,.05),this.materials.warningRed);rear.position.set(sign*(width/2-.2),.65,-length/2-.055);group.add(rear);
        const mirror=new THREE.Mesh(softBox(.17,.13,.25,.025),bodyMat);mirror.position.set(sign*(width/2+.09),compact?.94:1.15,length*.24);group.add(mirror);
        const handle=new THREE.Mesh(new THREE.BoxGeometry(.035,.06,.23),this.materials.scooterMetal);handle.position.set(sign*(width/2+.015),.72,-.2);group.add(handle);
      }
    } else if (type === 'roadroller') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, .85, 2.1), this.materials.warningOrange);
      frame.position.y = .85; group.add(frame);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.0, 1.0), this.materials.vehicleGlass);
      cab.position.set(0, 1.7, -.35); group.add(cab);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(.78, .78, 2.0, 14), this.materials.streetMetal);
      drum.rotation.z = Math.PI / 2; drum.position.set(0, .72, 1.0); group.add(drum);
      const rearGeo = new THREE.CylinderGeometry(.4, .4, .65, 12); rearGeo.rotateZ(Math.PI / 2);
      for (const x of [-.72, .72]) { const wheel = new THREE.Mesh(rearGeo, this.materials.vehicleTire); wheel.position.set(x,.48,-.82); group.add(wheel); }
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
