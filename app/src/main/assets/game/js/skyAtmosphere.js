// SKY SCOOTER — LOUFFI EDITION
// Dynamic sky atmosphere: gradient dome, sun/moon glow, stars,
// drifting low-poly cloud sprites and distant floating islands.
window.SkyAtmosphere = class SkyAtmosphere {
  constructor(scene, THREE, factory, trackGen) {
    this.scene = scene;
    this.THREE = THREE;
    this.factory = factory;
    this.trackGen = trackGen;

    this.time = 0;
    this.quality = 'high';
    this.roundData = null;
    this.isNight = false;

    this.dome = null;
    this.domeGroup = new THREE.Group();
    this.domeGroup.name = 'skyDome';
    this.cloudSprites = [];
    this.cloudMaterials = [];
    this.distantItems = [];
    this.sunSprite = null;
    this.sunWorld = null;

    this.buildDome();
    this.buildClouds();
    this.buildDistantScenery();
    this.buildSunSprite();
    this.scene.add(this.domeGroup);
    this.scene.add(this.sunSprite);
  }

  // --- Sky Dome (always follows the camera, rotates very slowly) ---
  buildDome() {
    const T = this.THREE;
    const geo = new T.SphereGeometry(430, 24, 12);
    const mat = new T.MeshBasicMaterial({
      side: T.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false
    });
    this.dome = new T.Mesh(geo, mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.domeGroup.add(this.dome);
  }

  // --- Soft canvas cloud sprites (cheap, style-consistent at distance) ---
  makeCloudTexture(variant) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const blobsByVariant = [
      [[55, 68, 42], [100, 54, 34], [150, 62, 46], [200, 76, 30], [125, 84, 38], [170, 88, 28]],
      [[45, 74, 38], [95, 66, 44], [140, 58, 32], [185, 70, 40], [115, 90, 30], [165, 96, 34]],
      [[60, 58, 40], [110, 70, 36], [160, 56, 42], [205, 70, 26], [135, 78, 40], [185, 84, 32]]
    ];
    const blobs = blobsByVariant[variant % blobsByVariant.length];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
    }
    const tex = new this.THREE.CanvasTexture(c);
    if (this.THREE.SRGBColorSpace !== undefined) tex.colorSpace = this.THREE.SRGBColorSpace;
    return tex;
  }

  buildClouds() {
    const T = this.THREE;
    for (let v = 0; v < 3; v++) {
      const tex = this.makeCloudTexture(v);
      const mat = new T.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        fog: true
      });
      this.cloudMaterials.push(mat);
    }

    for (let i = 0; i < 8; i++) {
      const mat = this.cloudMaterials[i % this.cloudMaterials.length];
      const sprite = new T.Sprite(mat);
      sprite.userData = {
        z: Math.random() * 420,
        lateral: (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 55),
        height: 26 + Math.random() * 26,
        speed: 0.4 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        scaleX: 32 + Math.random() * 20,
        scaleY: 15 + Math.random() * 9
      };
      sprite.scale.set(sprite.userData.scaleX, sprite.userData.scaleY, 1);
      this.scene.add(sprite);
      this.cloudSprites.push(sprite);
    }
  }

  // --- Distant floating islands (recycled around the player) ---
  buildDistantScenery() {
    const configs = [
      { z: 40,  lat: -58,  y: -12, scale: 2.2, tower: false },
      { z: 110, lat: 68,   y: -16, scale: 2.6, tower: true },
      { z: 180, lat: -80,  y: -14, scale: 2.2, tower: false },
      { z: 250, lat: 92,   y: -18, scale: 2.9, tower: false },
      { z: 90,  lat: -135, y: -27, scale: 4.2, tower: false },
      { z: 210, lat: 152,  y: -32, scale: 4.6, tower: false },
      { z: 330, lat: -175, y: -36, scale: 5.0, tower: false }
    ];

    for (const cfg of configs) {
      const island = this.trackGen.biomeArt.create(this.roundData || window.ROUNDS_DATA[0]);
      island.scale.setScalar(cfg.scale * .65);
      island.position.set(0, cfg.y, cfg.z);
      island.userData = {
        z: cfg.z,
        lateral: cfg.lat,
        height: cfg.y,
        phase: Math.random() * Math.PI * 2,
        tower: cfg.tower,
        isFar: cfg.scale >= 3.5
      };
      island.traverse(m => {
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });

      this.scene.add(island);
      this.distantItems.push(island);
    }
  }

  clearDistantScenery() {
    for (const item of this.distantItems) this.scene.remove(item);
    this.distantItems = [];
  }

  // --- Per-round atmosphere ---
  applyRound(roundData) {
    this.cloudSprites.forEach((sprite, i) => { sprite.userData.z = i * 45 - 20; });
    this.roundData = roundData;
    const T = this.THREE;
    const sky = new T.Color(roundData.skyColor);
    const fog = new T.Color(roundData.fogColor);
    const hsl = {};
    sky.getHSL(hsl);
    this.isNight = ['neon', 'moon'].includes(roundData.theme);
    const theme = roundData.theme || '';

    // Rebuild the dome gradient with round colors.
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      let top, mid;
      if (this.isNight) {
        top = sky.clone().multiplyScalar(0.5);
        mid = sky.clone().multiplyScalar(0.82);
      } else if (theme === 'storm') {
        top = sky.clone().multiplyScalar(0.72);
        mid = sky.clone().multiplyScalar(0.9);
      } else {
        top = sky.clone().multiplyScalar(0.68);
        mid = sky.clone();
      }
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#' + top.getHexString());
      grad.addColorStop(0.52, '#' + mid.getHexString());
      grad.addColorStop(1, '#' + fog.getHexString());
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      if (this.isNight) this.drawStars(ctx);

      // Soft haze just above the horizon gives depth.
      const haze = ctx.createLinearGradient(0, 210, 0, 300);
      haze.addColorStop(0, 'rgba(255,255,255,0)');
      haze.addColorStop(1, `rgba(${Math.round(fog.r * 255)},${Math.round(fog.g * 255)},${Math.round(fog.b * 255)},0.35)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 200, 1024, 110);
    }

    const tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace !== undefined) tex.colorSpace = T.SRGBColorSpace;
    if (this.dome.material.map) this.dome.material.map.dispose();
    this.dome.material.map = tex;
    this.dome.material.needsUpdate = true;

    this.tintClouds(theme);
    this.configureSun(theme);
    this.clearDistantScenery();
    this.buildDistantScenery();
    this.setQuality(this.quality);
  }

  // World-space sun/moon sprite that stays ahead of the camera.
  buildSunSprite() {
    const T = this.THREE;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.12, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace !== undefined) tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    this.sunSprite = new T.Sprite(mat);
    this.sunSprite.visible = false;
    this.sunSprite.renderOrder = -5;
  }

  configureSun(theme) {
    if (!this.sunSprite) return;
    if (theme === 'storm') {
      this.sunSprite.visible = false;
      this.sunWorld = null;
      return;
    }
    if (this.isNight) {
      this.sunSprite.material.color.set(0xdfe9ff);
      this.sunSprite.material.opacity = 0.9;
      this.sunSprite.scale.set(110, 110, 1);
      this.sunWorld = { lateral: -60, height: 100, distance: 420 };
    } else if (theme === 'sunset' || theme === 'volcano' || theme === 'desert') {
      this.sunSprite.material.color.set(0xffc98a);
      this.sunSprite.material.opacity = 1.0;
      this.sunSprite.scale.set(300, 300, 1);
      this.sunWorld = { lateral: 0, height: 42, distance: 520 };
    } else {
      this.sunSprite.material.color.set(0xfff6d8);
      this.sunSprite.material.opacity = 1.0;
      this.sunSprite.scale.set(230, 230, 1);
      this.sunWorld = { lateral: 30, height: 105, distance: 450 };
    }
    this.sunSprite.visible = true;
  }

  drawStars(ctx) {
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * 1024;
      const y = 25 + Math.random() * 215;
      const radius = 0.4 + Math.random() * 1.3;
      const alpha = 0.35 + Math.random() * 0.6;
      const blueish = Math.random() < 0.3;
      ctx.fillStyle = blueish
        ? `rgba(180,205,255,${alpha})`
        : `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  tintClouds(theme) {
    let colors;
    let opacity = 0.88;
    if (this.isNight) {
      colors = [0x8fa8d8, 0x7d8fb8, 0xa0b4e0];
      opacity = 0.7;
    } else if (theme === 'sunset' || theme === 'volcano' || theme === 'desert') {
      colors = [0xffdcc0, 0xffcfa8, 0xffe2cc];
      opacity = 0.85;
    } else if (theme === 'storm') {
      colors = [0xc8d2da, 0xb7c4cd, 0xd2dbe1];
      opacity = 0.92;
    } else {
      colors = [0xffffff, 0xf4f9ff, 0xfff3e0];
      opacity = 0.88;
    }
    this.cloudMaterials.forEach((m, i) => {
      m.color.set(colors[i % colors.length]);
      m.opacity = opacity;
    });
  }

  setQuality(quality) {
    this.quality = quality;
    const showExtras = quality !== 'low';
    this.cloudSprites.forEach(s => { s.visible = showExtras; });
    this.distantItems.forEach(o => { o.visible = showExtras; });
  }

  update(playerPos, dt) {
    if (!playerPos) return;
    this.time += dt;

    // Dome follows the camera and drifts slowly for a living sky.
    this.domeGroup.position.set(playerPos.x * 0.25, 0, playerPos.z);
    this.domeGroup.rotation.y = this.time * 0.004;

    // Sun/moon sprite stays ahead of the focus point.
    if (this.sunSprite && this.sunSprite.visible && this.sunWorld) {
      this.sunSprite.position.set(
        playerPos.x + this.sunWorld.lateral,
        this.sunWorld.height,
        playerPos.z + this.sunWorld.distance
      );
    }

    // Drifting clouds recycle behind the player and stay near the corridor.
    for (const sprite of this.cloudSprites) {
      const u = sprite.userData;
      if (u.z < playerPos.z - 70) {
        u.z += 440;
        u.lateral = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 55);
        u.height = 26 + Math.random() * 26;
      }
      const roadX = this.trackGen.getTrackPoint(u.z).x;
      sprite.position.set(
        roadX + u.lateral + Math.sin(this.time * 0.04 + u.phase) * 3,
        u.height,
        u.z
      );
    }

    // Distant islands recycle behind and bob very slightly.
    for (const item of this.distantItems) {
      const u = item.userData;
      if (u.z < playerPos.z - 90) u.z += 440;
      const roadX = this.trackGen.getTrackPoint(u.z).x;
      item.position.set(
        roadX + u.lateral,
        u.height + Math.sin(this.time * 0.15 + u.phase) * 0.6,
        u.z
      );
    }
  }
};
