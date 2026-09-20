// SKY SCOOTER — LOUFFI EDITION
// Professional Particle Effects & Visual Polish System
window.ParticleEffects = class ParticleEffects {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.particles = [];
  }

  // Coin collection burst effect
  createCoinBurst(position, count = 12) {
    const geometry = new this.THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    
    for (let i = 0; i < count; i++) {
      positions.push(position.x, position.y, position.z);
      const angle = (i / count) * Math.PI * 2;
      const speed = 15 + Math.random() * 10;
      velocities.push(
        Math.cos(angle) * speed,
        3 + Math.random() * 2,
        Math.sin(angle) * speed
      );
    }

    geometry.setAttribute('position', new this.THREE.BufferAttribute(new Float32Array(positions), 3));
    const material = new this.THREE.PointsMaterial({
      size: 0.5,
      color: 0xffeb3b,
      emissive: 0xffeb3b,
      sizeAttenuation: true
    });

    const points = new this.THREE.Points(geometry, material);
    this.scene.add(points);

    this.particles.push({
      mesh: points,
      velocities: velocities,
      life: 1.0,
      maxLife: 1.0,
      type: 'coin'
    });
  }

  // Power-up activation glow effect
  createPowerupGlow(position) {
    const geometry = new this.THREE.IcosahedronGeometry(1.5, 4);
    const material = new this.THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.8,
      wireframe: false,
      transparent: true,
      opacity: 0.6
    });
    
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.particles.push({
      mesh: mesh,
      life: 0.8,
      maxLife: 0.8,
      type: 'glow',
      scale: 1.0
    });
  }

  // Impact/collision flash effect
  createImpactFlash(position) {
    const geometry = new this.THREE.SphereGeometry(2, 8, 8);
    const material = new this.THREE.MeshBasicMaterial({
      color: 0xff5252,
      emissive: 0xff5252,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9
    });

    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.particles.push({
      mesh: mesh,
      life: 0.3,
      maxLife: 0.3,
      type: 'impact'
    });
  }

  // Score popup floating text effect
  createScorePopup(position, score) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffeb3b';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`+${score}`, 128, 80);

    const texture = new this.THREE.CanvasTexture(canvas);
    const geometry = new this.THREE.PlaneGeometry(3, 1.5);
    const material = new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: true
    });

    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y += 3;
    this.scene.add(mesh);

    this.particles.push({
      mesh: mesh,
      life: 1.2,
      maxLife: 1.2,
      type: 'text'
    });
  }

  // Overdrive speed rush effect
  createSpeedRushTrail(position) {
    const count = 8;
    const geometry = new this.THREE.BufferGeometry();
    const positions = [];
    
    for (let i = 0; i < count; i++) {
      positions.push(
        position.x + (Math.random() - 0.5) * 4,
        position.y + (Math.random() - 0.5) * 2,
        position.z + (Math.random() - 0.5) * 4
      );
    }

    geometry.setAttribute('position', new this.THREE.BufferAttribute(new Float32Array(positions), 3));
    const material = new this.THREE.PointsMaterial({
      size: 1.2,
      color: 0xff6e40,
      emissive: 0xff6e40,
      sizeAttenuation: true
    });

    const points = new this.THREE.Points(geometry, material);
    this.scene.add(points);

    this.particles.push({
      mesh: points,
      life: 0.6,
      maxLife: 0.6,
      type: 'trail'
    });
  }

  update(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;

      if (p.type === 'coin') {
        const positions = p.mesh.geometry.attributes.position.array;
        for (let j = 0; j < p.velocities.length; j += 3) {
          positions[j] += p.velocities[j] * deltaTime;
          positions[j + 1] += p.velocities[j + 1] * deltaTime - 9.8 * deltaTime;
          positions[j + 2] += p.velocities[j + 2] * deltaTime;
        }
        p.mesh.geometry.attributes.position.needsUpdate = true;
        p.mesh.material.opacity = p.life / p.maxLife;
      } else if (p.type === 'glow') {
        p.scale = 1 + (1 - p.life / p.maxLife) * 2;
        p.mesh.scale.setScalar(p.scale);
        p.mesh.material.opacity = p.life / p.maxLife;
      } else if (p.type === 'impact') {
        p.mesh.scale.setScalar(1 + (1 - p.life / p.maxLife) * 3);
        p.mesh.material.opacity = p.life / p.maxLife;
      } else if (p.type === 'text') {
        p.mesh.position.y += deltaTime * 2;
        p.mesh.material.opacity = p.life / p.maxLife;
      } else if (p.type === 'trail') {
        p.mesh.material.opacity = p.life / p.maxLife;
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    this.particles = [];
  }
};
