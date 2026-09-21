// Original, reusable scenery for each world. Static meshes are merged by material
// once per theme, then cloned; road hazards and collision rules stay independent.
window.BiomeArt = class BiomeArt {
  constructor(T) {
    this.T = T; this.cache = new Map(); this.materials = new Map();
    this.geometry = {
      box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(1, 10, 7),
      cone: new T.ConeGeometry(1, 1, 8), cylinder: new T.CylinderGeometry(1, 1, 1, 10),
      roof: new T.ConeGeometry(1, 1, 4),
      crystal: new T.OctahedronGeometry(1), ring: new T.TorusGeometry(1, .12, 6, 24),
      arch: new T.TorusGeometry(1, .1, 6, 24, Math.PI)
    };
  }
  material(color, glow = false) {
    const key = `${color}/${glow}`;
    if (!this.materials.has(key)) this.materials.set(key, new this.T.MeshStandardMaterial({
      color, roughness: .8, emissive: glow ? color : 0x000000, emissiveIntensity: glow ? .65 : 0
    }));
    return this.materials.get(key);
  }
  create(round) {
    const theme = round.theme;
    if (!this.cache.has(theme)) this.cache.set(theme, this.build(round));
    return this.cache.get(theme).clone(true);
  }
  portal(round) {
    const key=`portal_${round.theme}`,T=this.T;
    if(!this.cache.has(key)){
      const g=new T.Group(), rainbow=round.theme==='rainbow';
      const colors=rainbow?[0xff8fba,0xffbd79,0xffe796,0x9ae1a9,0x8acffe,0xb7a5f7]:[round.railColor];
      colors.forEach((color,i)=>{
        const m=new T.Mesh(this.geometry.arch,this.material(color,true));
        const radius=round.roadWidth/2+1.5+i*.3;
        m.scale.set(radius,radius,1);m.position.y=1;g.add(m);
      });
      g.name=`portal_${round.theme}`;this.cache.set(key,this.merge(g));
    }
    return this.cache.get(key).clone(true);
  }
  build(round) {
    const T = this.T, g = new T.Group(), theme = round.theme;
    g.name = `world_${theme}`; g.userData.biome = theme;
    const part = (kind, color, x, y, z, sx, sy, sz, glow = false, rz = 0) => {
      const m = new T.Mesh(this.geometry[kind], this.material(color, glow));
      m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.z=rz; g.add(m); return m;
    };
    const box = (c,x,y,z,w,h,d,glow=false) => part('box',c,x,y,z,w,h,d,glow);
    const orb = (c,x,y,z,r,glow=false) => part('sphere',c,x,y,z,r,r,r,glow);
    const pillar = (c,x,y,z,r,h) => part('cylinder',c,x,y,z,r,h,r);
    const tree = (x,z,h=6,snow=false) => {
      pillar(0x805236,x,h*.45,z,.45,h*.9);
      for(let k=0;k<3;k++) part('cone',snow?0xe9faff:0x237b55,x,h*.55+k*1.4,z,2.5-k*.5,3.5,2.5-k*.5);
    };
    const tower = (x,z,h,c=0xcac4e6,roof=0x8864d7) => {
      pillar(c,x,h/2,z,1.5,h);part('cone',roof,x,h+1.3,z,2,2.6,2);
      box(0xffe69c,x,h*.65,z-1.5,.5,1.3,.12,true);
    };
    // Theme-colored floating land: no green grass baked into every world.
    const tops={desert:0xeab875,crystal:0x6658a1,snow:0xf2fbff,sunset:0xbd8768,neon:0x20234c,
      workshop:0x628694,storm:0x829bc9,volcano:0x524066,moon:0x555d9c,citadel:0x789080,rainbow:0xe9bdf3,grand_run:0xffedba};
    const top=tops[theme]??round.islandGrassColor;
    part('cone',round.islandRockColor,0,-3,0,6,6,5,false,Math.PI);
    part('cylinder',top,0,.1,0,6,.7,5);
    switch(theme) {
      case 'garden':
        for(const [x,z] of [[-2,-1],[2,2]]){pillar(0x8a6448,x,2,z,.45,4);orb(0x6ac76a,x,4.7,z,2.2);orb(0xa1e677,x+1,5.1,z,1.3);}
        part('arch',0xffa9d1,0,1,0,3,4,1); 
        for(let i=0;i<9;i++){const a=i*2.4,x=Math.cos(a)*4,z=Math.sin(a)*3;pillar(0x4e9b60,x,.6,z,.08,1);orb(i%2?0xffbcdf:0xffe07f,x,1.2,z,.45);}
        break;
      case 'castle_bridge':
        tower(-3,0,7);tower(3,0,9);box(0xcac4e6,0,2,0,5,3,2);
        part('arch',0xf5e4c4,0,3,-1.2,2,2,1);
        for(let i=-2;i<=2;i++)box(0xcac4e6,i,4,0,.65,1,2);
        break;
      case 'waterfalls':
        box(0x4c8294,0,3,1,8,6,5);box(0x86dcb4,0,6,1,8,.5,5);
        for(let i=0;i<4;i++){box(i%2?0x97f3ff:0x4bcde9,-3+i*2,-2,-1.6,1.4,16,.25,true);box(0xd1ffff,-3+i*2,-9.8,-1.6,1.8,.25,1);}
        part('arch',0x8cdae1,0,6,1,3,3,1);orb(0xd5faff,0,-9,-1,1.1);
        break;
      case 'forest':
        pillar(0x72513b,0,7,0,1.1,14);
        for(let i=0;i<5;i++){const a=i*1.26;orb(i%2?0x64b47c:0x368568,Math.cos(a)*3,12+i%2,Math.sin(a)*3,3.3);}
        for(const x of [-3,3]){pillar(0xffe8c1,x,1,0,.25,2);part('sphere',0xff99b6,x,2.3,0,1.4,.65,1.4);orb(0xfff2ba,x,2.8,-.3,.25,true);}
        break;
      case 'desert':
        part('cone',0xf5ce8b,0,3,1,4.7,6,4.7);
        for(const x of [-4,4]){pillar(0xeac494,x,2,-2,.7,4);orb(0x72d5b0,x,4.5,-2,.65,true);}
        box(0xf9db9e,0,4.3,-2,9,.7,1.1);part('ring',0xffdd74,0,6,-2,1.1,1.1,1.1,true);
        break;
      case 'crystal':
        for(let i=0;i<7;i++){const a=i*2.4;part('crystal',i%2?0x78f2ff:0xda9eff,Math.cos(a)*3,2+i%3,Math.sin(a)*3,1,3+i%3,1,true,i*.14);}
        part('arch',0x574c8c,0,0,2,5.5,9,3);orb(0xf3baff,0,7,0,.75,true);
        break;
      case 'snow':
        part('cone',0x84acd2,0,5,1,5,10,4);part('cone',0xf4fbff,0,8.2,1,2.2,3.8,1.8);
        tree(-3,-2,5,true);tree(3,-1,4,true);
        orb(0xffffff,0,1,-3,.8);orb(0xffffff,0,2.1,-3,.55);part('cone',0xffaf71,0,2.1,-3.6,.15,.5,.15,false,Math.PI/2);
        break;
      case 'sunset':
        box(0x785576,0,1,0,8,1.6,3);pillar(0xf6d89c,0,5,0,.15,8);
        part('cone',0xffe5ae,1.4,5,0,2.8,5,.12);box(0xf39ec0,-2.4,4,0,2,3,.15);
        tower(4,2,7,0xfdf1df,0xf49ba7);orb(0xffe090,4,7,2,.65,true);
        break;
      case 'neon':
        for(let i=-1;i<=1;i++){const h=9+(i+1)*3;box(0x283558,i*3,h/2,0,2.4,h,3);for(let j=1;j<h;j+=2)box(i%2?0xff8ade:0x6bf1ed,i*3,j,-1.55,1.8,.3,.12,true);}
        part('ring',0xfe9bdf,0,15,-2,2.5,2.5,1,true);
        break;
      case 'workshop':
        for(const x of [-2.5,2.5]){pillar(0x5c819a,x,3,1,1.1,6);part('ring',0xffd173,x,4,-.4,2,2,1);for(let i=0;i<8;i++){const a=i*Math.PI/4;const tooth=box(0xffd173,x+Math.cos(a)*2,4+Math.sin(a)*2,-.4,.8,.8,.6);tooth.rotation.z=a;}}
        box(0x83d7cb,0,8,1,9,.8,.8);pillar(0xffd173,-4,4,1,.3,8);orb(0xf7c0de,3,9,1,1.2);
        break;
      case 'storm':
        for(let i=0;i<5;i++)part('sphere',i%2?0xaaaee2:0xc6ceee,(i-2)*1.9,6+i%2,0,2.4,1.5,2);
        for(const x of [-2,2]){part('box',0xffe897,x,3.6,-1,.35,2,.3,true,-.4);part('box',0xffe897,x+.5,2,-1,.35,2,.3,true,.4);}
        for(let i=0;i<7;i++)part('crystal',0x93e7ff,(i-3)*1.1,1.5+i%2,-2,.12,.6,.12,true);
        break;
      case 'volcano':
        part('cone',0x705678,0,4,0,5,8,5);part('cylinder',0xffa776,0,7.3,0,1.2,.25,1.2,true);
        for(let i=0;i<4;i++){const a=i*Math.PI/2;part('box',0xffbb73,Math.cos(a)*1.9,4.8,Math.sin(a)*1.9,.45,5,.4,true,.24);}
        for(let i=0;i<4;i++)orb(0xffd3ac,Math.sin(i*2)*1.1,9+i*1.1,0,.5+i*.15,true);
        break;
      case 'moon':
        part('ring',0xfff2b8,0,7,0,2.6,2.6,1,true);orb(0x8ba6eb,-3,2,1,1.4);
        for(let i=0;i<5;i++){const a=i*2.4,x=Math.cos(a)*3,z=Math.sin(a)*3;pillar(0xb4bbef,x,1.2,z,.13,2.4);part('sphere',0x9cf3e9,x,2.5,z,1,.4,1,true);}
        part('ring',0xb9b9e4,2,.6,-2,1.4,.4,1.4);
        break;
      case 'citadel':
        box(0x6d88a3,0,3,1,9,6,3);tower(-4,1,10,0x7793ad,0x6298ab);tower(4,1,10,0x7793ad,0x6298ab);
        for(const x of [-2,0,2]){pillar(0xd9deb9,x,3,-1,.3,6);box(0xb79add,x,4,-1.4,.8,2.5,.12);}
        part('arch',0xffdc8a,0,6,0,3,3,1,true);
        break;
      case 'rainbow':
        [0xff8fba,0xffbd79,0xffe796,0x9ae1a9,0x8acffe,0xb7a5f7].forEach((c,i)=>part('arch',c,0,.5,0,5.5-i*.45,6-i*.45,1,true));
        for(const x of [-4,4]){orb(0xffedf8,x,1.4,0,1.5);orb(0xffedf8,x+1,1,0,1.2);}
        break;
      case 'grand_run':
        box(0xffedc6,0,3,1,7,6,4);tower(-3,0,9,0xffedc6,0xffce68);tower(3,0,9,0xffedc6,0xffce68);tower(0,2,13,0xffedc6,0xffce68);
        part('ring',0xffdb79,0,10,-1,2,2,1,true);
        for(const x of [-5,5]){pillar(0xffe18e,x,4,-1,.12,8);box(0xf3a1c6,x+.7,7,-1,1.5,1.1,.12);}
        break;
    }
    return this.merge(g);
  }
  // A small, modular sky-neighborhood used to break up the repeated island rhythm.
  // It is intentionally made from the same low-poly language as the authored biomes,
  // but gives the camera believable foreground depth: homes, terraces, lamps, trees,
  // bridges and a readable silhouette that changes every few road segments.
  cluster(round, variant = 0) {
    const T = this.T, theme = round.theme, v = ((variant % 3) + 3) % 3;
    const key = `cluster_${theme}_${v}`;
    if (this.cache.has(key)) return this.cache.get(key).clone(true);
    const g = new T.Group(); g.name = `sky_neighborhood_${theme}_${v}`; g.userData.biome = theme;
    const shade = (value, factor) => {
      const c = new T.Color(value); c.multiplyScalar(factor); return c.getHex();
    };
    const decorByTheme = {
      garden: 0xffa9d1, castle_bridge: 0xb28bea, waterfalls: 0x7de7f1,
      forest: 0xffb98b, desert: 0xffdf83, crystal: 0xaedfff,
      snow: 0xdff7ff, sunset: 0xff9ebd, neon: 0xff82ee,
      workshop: 0xffd173, storm: 0xe3c8ff, volcano: 0xffa176,
      moon: 0xb4c7ff, citadel: 0xffdc9a, rainbow: 0xffc4e8,
      grand_run: 0xffd77c
    };
    const p = {
      wall: shade(round.roadColor, 1.16), wallShade: shade(round.roadColor, .78),
      roof: round.railColor, roofDark: shade(round.railColor, .66),
      ground: round.islandGrassColor, rock: round.islandRockColor,
      trunk: shade(round.islandRockColor, 1.18), leaf: shade(round.islandGrassColor, 1.18),
      leafDark: shade(round.islandGrassColor, .72), decor: decorByTheme[theme] || round.railColor,
      light: shade(round.ambientLight, .9), path: shade(round.roadColor, .93)
    };
    const part = (kind, color, x, y, z, sx, sy, sz, glow = false, rz = 0) => {
      const m = new T.Mesh(this.geometry[kind], this.material(color, glow));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; g.add(m); return m;
    };
    const box = (c, x, y, z, w, h, d, glow = false) => part('box', c, x, y, z, w, h, d, glow);
    const orb = (c, x, y, z, r, glow = false) => part('sphere', c, x, y, z, r, r, r, glow);
    const pillar = (c, x, y, z, r, h) => part('cylinder', c, x, y, z, r, h, r);
    const addTree = (x, z, h = 4.8) => {
      pillar(p.trunk, x, h * .24, z, .28, h * .72);
      orb(p.leafDark, x, h * .63, z, 1.4);
      orb(p.leaf, x - .58, h * .78, z + .18, 1.1);
      orb(p.leaf, x + .58, h * .77, z - .2, 1.02);
    };
    const addLamp = (x, z, h = 3.3) => {
      pillar(p.trunk, x, h * .45, z, .09, h);
      box(p.light, x, h + .08, z, .34, .23, .34, true);
      orb(p.decor, x, h + .08, z, .18, true);
    };
    const addHouse = (x, z, scale = 1) => {
      box(p.wall, x, 1.05 * scale, z, 2.8 * scale, 2.1 * scale, 2.35 * scale);
      const roof = part('roof', p.roof, x, 2.56 * scale, z, 2.02 * scale, 1.48 * scale, 1.72 * scale);
      roof.rotation.y = Math.PI / 4;
      box(p.wallShade, x, .68 * scale, z - 1.22 * scale, .62 * scale, .92 * scale, .08 * scale);
      box(p.light, x - .72 * scale, 1.28 * scale, z - 1.21 * scale, .48 * scale, .58 * scale, .08 * scale, true);
      box(p.light, x + .72 * scale, 1.28 * scale, z - 1.21 * scale, .48 * scale, .58 * scale, .08 * scale, true);
      box(p.decor, x, 2.12 * scale, z - 1.25 * scale, 2.85 * scale, .12 * scale, .1 * scale, true);
      box(p.roofDark, x + .78 * scale, 3.42 * scale, z, .25 * scale, .78 * scale, .25 * scale);
    };
    const addFence = (x, z, length = 4) => {
      box(p.roofDark, x, .62, z, length, .14, .1);
      box(p.roofDark, x, 1.02, z, length, .11, .1);
      for (let i = -1; i <= 1; i++) box(p.trunk, x + i * (length / 2.2), .72, z, .12, 1.15, .14);
    };
    // Shared floating terrace: the platform gives silhouettes a believable place to sit.
    part('cone', p.rock, 0, -2.7, 0, 5.35, 4.6, 4.3, false, Math.PI);
    part('cylinder', p.ground, 0, -.52, 0, 5.05, .48, 4.05);
    box(p.ground, 0, -.25, 0, 8.8, .22, 6.35);
    box(p.path, 0, -.1, -2.6, 7.1, .12, .35);

    if (v === 0) {
      addHouse(-1.45, .75, .92); addHouse(2.0, 1.25, .7);
      addTree(-3.1, -1.0, 4.8); addTree(3.45, -1.35, 3.9);
      addFence(-.1, -1.62, 5.8); addLamp(-3.8, -2.25); addLamp(3.8, -2.25, 2.8);
      box(p.decor, 0, .08, -2.6, 2.2, .08, .12, true);
    } else if (v === 1) {
      // A garden terrace reads as a little destination while the rider stays centered.
      for (const x of [-3.1, 3.1]) { pillar(p.trunk, x, 1.75, .55, .16, 3.5); pillar(p.trunk, x, 1.75, 2.25, .16, 3.5); }
      box(p.roof, 0, 3.48, 1.4, 6.55, .22, 2.35);
      addTree(-3.5, -1.15, 4.2); addTree(3.35, -1.1, 4.7);
      for (let i = 0; i < 7; i++) {
        const x = -3.2 + i * 1.05;
        pillar(p.leafDark, x, .28, -2.0, .07, .55);
        orb(i % 2 ? p.decor : p.light, x, .72, -2.0, .25, true);
      }
      part('ring', p.decor, 0, .32, 1.1, 1.15, .35, 1.15, true);
      orb(p.light, 0, .72, 1.1, .35, true);
      addLamp(-4.0, -2.55, 3.0); addLamp(4.0, -2.55, 3.0);
      box(p.path, 0, .02, 1.05, 1.15, .08, 3.4);
    } else {
      // Landmark terrace: an arch / bridge silhouette gives each stretch a visual target.
      pillar(p.wallShade, -3.15, 1.42, .5, .58, 2.85); pillar(p.wallShade, 3.15, 1.42, .5, .58, 2.85);
      const arch = part('arch', p.decor, 0, 2.05, .45, 3.5, 3.8, .72, true); arch.rotation.y = Math.PI;
      box(p.path, 0, .1, -1.75, 6.8, .22, 1.7);
      addTree(-3.75, -1.55, 3.8); addTree(3.8, -1.4, 4.2);
      for (let i = 0; i < 4; i++) {
        part(theme === 'waterfalls' ? 'box' : 'crystal', theme === 'waterfalls' ? p.decor : p.light,
          -1.7 + i * 1.15, .45 + (i % 2) * .2, 1.95, .42, theme === 'waterfalls' ? 2.2 : 1.15, .42, true);
      }
      addLamp(-4.05, -2.45, 3.1); addLamp(4.05, -2.45, 3.1);
      box(p.roofDark, 0, .82, 2.85, 6.9, .16, .12);
    }
    const merged = this.merge(g); this.cache.set(key, merged); return merged.clone(true);
  }
  // City/coastal roadside set dressing.  This is scenery only; gameplay
  // obstacles are generated by AssetFactory so collision rules stay explicit.
  cityBlock(round, variant = 0) {
    const T = this.T, theme = round.theme, cityStyle = round.cityStyle || theme, v = ((variant % 3) + 3) % 3;
    const key = `city_${theme}_${cityStyle}_${v}`;
    if (this.cache.has(key)) return this.cache.get(key).clone(true);
    const g = new T.Group(); g.name = `city_block_${theme}_${v}`; g.userData.biome = theme;
    const shade = (value, factor) => { const c = new T.Color(value); c.multiplyScalar(factor); return c.getHex(); };
    const accentByTheme = {
      garden: 0xffa9d1, castle_bridge: 0xb28bea, waterfalls: 0x7de7f1,
      forest: 0xffb98b, desert: 0xffdf83, crystal: 0xaedfff,
      snow: 0xdff7ff, sunset: 0xff9ebd, neon: 0xff82ee,
      workshop: 0xffd173, storm: 0xe3c8ff, volcano: 0xffa176,
      moon: 0xb4c7ff, citadel: 0xffdc9a, rainbow: 0xffc4e8,
      grand_run: 0xffd77c
    };
    const p = {
      wall: shade(round.roadColor, 1.2), wallDark: shade(round.roadColor, .72),
      rail: round.railColor, railDark: shade(round.railColor, .55),
      rock: round.islandRockColor, ground: round.islandGrassColor,
      accent: accentByTheme[theme] || round.railColor,
      light: shade(round.ambientLight, .9), stripe: 0xfff2cf
    };
    const part = (kind, color, x, y, z, sx, sy, sz, glow = false, rz = 0) => {
      const m = new T.Mesh(this.geometry[kind], this.material(color, glow));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; g.add(m); return m;
    };
    const box = (c, x, y, z, w, h, d, glow = false) => part('box', c, x, y, z, w, h, d, glow);
    const pillar = (c, x, y, z, r, h) => part('cylinder', c, x, y, z, r, h, r);
    const orb = (c, x, y, z, r, glow = false) => part('sphere', c, x, y, z, r, r, r, glow);
    const lamp = (x, z, side = 1, h = 5.7) => {
      pillar(p.railDark, x, h * .5, z, .1, h);
      box(p.railDark, x + side * .55, h - .18, z, 1.05, .11, .11);
      box(p.light, x + side * 1.02, h - .18, z, .34, .24, .38, true);
      orb(p.accent, x + side * 1.02, h - .18, z, .15, true);
    };
    const guardrail = (x, z, length = 7) => {
      box(p.railDark, x, 1.0, z, .14, 1.05, length);
      box(p.rail, x, 1.35, z, .18, .18, length);
      for (let i = -2; i <= 2; i++) pillar(p.railDark, x, .57, z + i * (length / 4.4), .1, 1.15);
    };
    const windows = (x, z, w, h, d) => {
      for (let row = 0; row < Math.max(1, Math.floor(h / 1.2)); row++) {
        for (let col = -1; col <= 1; col++) {
          const wx = x + col * Math.min(.72, w * .23);
          box(p.light, wx, 1.15 + row * 1.15, z - d / 2 - .04, .36, .48, .07, true);
        }
      }
    };
    const building = (x, z, w, h, d) => {
      box(p.wall, x, h / 2, z, w, h, d);
      box(p.accent, x, h + .1, z, w + .15, .12, d + .15, true);
      windows(x, z, w, h, d);
      box(p.wallDark, x, .58, z - d / 2 - .05, .6, 1.15, .1);
    };
    const utilityPylon = (x, z) => {
      pillar(p.railDark, x, 3.4, z, .12, 6.8);
      box(p.railDark, x, 5.4, z, 3.4, .12, .12);
      box(p.railDark, x - 1.25, 4.25, z, 1.9, .1, .1);
      box(p.railDark, x + 1.25, 4.25, z, 1.9, .1, .1);
      box(p.railDark, x - 1.75, 3.25, z, 1.05, .09, .09);
      box(p.railDark, x + 1.75, 3.25, z, 1.05, .09, .09);
    };

    // A shallow terrace keeps the city props grounded on a floating world.
    part('cone', p.rock, 0, -2.6, 0, 5.2, 4.4, 4.2, false, Math.PI);
    part('cylinder', p.ground, 0, -.48, 0, 4.9, .42, 3.9);
    box(p.ground, 0, -.22, 0, 8.6, .2, 6.1);

    if (v === 0) {
      // Coastal bend: lamps + guardrails + pylon silhouette, matching the reference.
      guardrail(-3.9, -1.1, 6.4); guardrail(3.9, -.4, 5.5);
      lamp(-3.0, -1.9, 1); lamp(2.85, -.3, -1); lamp(-1.1, 2.0, 1);
      utilityPylon(3.15, 2.4);
      building(-.8, .8, 2.9, 3.6, 2.2);
      box(p.accent, -.8, 3.95, -.35, 1.2, .16, .16, true);
    } else if (v === 1) {
      // Small city frontage: stacked apartments, lamps and a billboard.
      building(-2.0, .7, 2.6, 4.6, 2.5); building(1.55, 1.1, 2.2, 3.3, 2.2);
      lamp(-3.85, -1.8, 1); lamp(3.75, -1.25, -1);
      box(p.railDark, 0, .34, -2.4, 7.4, .16, .18);
      pillar(p.railDark, 2.9, 1.4, -2.35, .1, 2.8);
      box(p.accent, 2.9, 2.85, -2.35, 1.55, .95, .1, true);
      box(p.stripe, 2.9, 2.85, -2.42, 1.1, .12, .05, true);
    } else {
      // Construction edge: warehouse, warning lamps and scaffold silhouette.
      building(1.1, .9, 3.5, 2.8, 2.8);
      for (const x of [-3.3, -1.8]) { pillar(p.railDark, x, 2.4, .8, .1, 4.8); box(p.railDark, x, 4.75, .8, 1.7, .1, .1); }
      for (let i = 0; i < 5; i++) {
        const x = -3.8 + i * 1.7;
        pillar(p.accent, x, .4, -2.0, .09, .8);
        box(i % 2 ? p.stripe : p.accent, x, .85, -2.0, .75, .14, .18, true);
      }
      lamp(3.75, -2.1, -1, 4.6); utilityPylon(-3.25, 2.3);
    }

    // City signature silhouettes. These are intentionally simple low-poly
    // cues rather than exact landmarks, so each round feels like a different
    // destination without requiring a large asset pack.
    const torii = (x, z, red = 0xd94b5b) => {
      pillar(red, x - 1.05, 1.35, z, .13, 2.7); pillar(red, x + 1.05, 1.35, z, .13, 2.7);
      box(red, x, 2.72, z, 2.7, .22, .2); box(red, x, 2.35, z, 2.25, .16, .18);
    };
    const dome = (x, z, color = 0x78b7d8) => {
      orb(color, x, 2.2, z, 1.15); part('cone', color, x, 3.05, z, 1.2, .85, 1.2); orb(p.accent, x, 3.78, z, .16, true);
    };
    const signature = () => {
      switch (cityStyle) {
        case 'japan':
        case 'japan_snow':
          torii(0, 2.5, cityStyle === 'japan_snow' ? 0xc84c5b : 0xe4565b);
          for (const x of [-2.5, 2.5]) { pillar(0x6e3540, x, 1.2, 2.2, .08, 2.4); orb(0xffd36b, x, 2.45, 2.2, .22, true); }
          break;
        case 'japan_neon':
          for (const x of [-2.25, 2.25]) { box(0x27345f, x, 2.7, 1.9, 1.6, 5.4, 1.5); for (let y = 1.1; y < 5; y += 1.25) box(x < 0 ? 0x62f0ff : 0xff82ee, x, y, 1.1, 1.15, .18, .08, true); }
          torii(0, 2.55, 0x6d5cff);
          break;
        case 'london':
          pillar(0xc9b9a6, 0, 2.6, 2.25, .55, 5.2); box(0xd8c8b5, 0, 5.4, 2.25, 1.35, .55, 1.35);
          part('ring', 0xf3cc70, 0, 3.7, 1.55, .58, .58, .18, true); part('cone', 0x6c7189, 0, 6.25, 2.25, .8, 1.2, .8);
          break;
        case 'tropical':
          for (const x of [-2.6, 2.4]) { pillar(0x8b5b3c, x, 2.1, 1.4, .13, 4.2); for (let i = 0; i < 5; i++) orb(0x42b879, x + Math.cos(i * 1.25) * .75, 4.35 + Math.sin(i * 1.25) * .35, 1.4, .72); }
          box(0x46c9d4, 0, .04, 2.5, 7.4, .06, .45, true);
          break;
        case 'pacific':
          for (const x of [-2.7, 2.7]) { pillar(0x6b7782, x, 2.4, 2, .12, 4.8); part('cone', 0x4c8a63, x, 5.5, 2, 1.45, 2.7, 1.45); }
          box(0x8fc9d6, 0, 4.65, 2, 5.8, .13, .13, true);
          break;
        case 'bazaar':
          dome(-2.25, 2.1, 0xe0b06d); dome(2.25, 2.1, 0xc98b7a);
          box(p.accent, 0, .35, 2.5, 5.4, .14, .15, true);
          break;
        case 'europe':
          for (const x of [-2.35, 2.35]) { pillar(0x7d8fb2, x, 2.9, 2.2, .65, 5.8); part('roof', 0x9b82c8, x, 6.35, 2.2, .9, 1.6, .9); }
          break;
        case 'coastal':
          pillar(0xe9d9b1, 0, 2.2, 2.2, .12, 4.4); part('cone', 0xf5a3b8, 1.05, 3.4, 2.2, 1.15, 2.2, .18); part('cone', 0x8fd7e8, -1.05, 3.2, 2.2, 1.0, 1.9, .16);
          break;
        case 'canals':
          box(0x5abed4, 0, .05, 2.2, 7.0, .08, .75, true); part('arch', 0xe0a96d, 0, 1.05, 2.2, 2.3, 1.6, .7);
          break;
        case 'skyscraper':
          for (const [x, h, c] of [[-2.55, 8, 0x596b9f], [0, 10, 0x52627f], [2.55, 7, 0x6c79aa]]) { box(c, x, h / 2, 2.4, 1.65, h, 1.45); for (let y = 1; y < h - .3; y += 1.2) box(0x9ee7f4, x, y, 1.65, 1.0, .16, .08, true); }
          break;
        case 'volcanic':
          part('cone', 0x5f4659, 0, 3.3, 2.1, 2.4, 6.6, 2.4); orb(0xffa068, 0, 6.65, 2.1, .48, true); orb(0xffd07d, 1.4, 3.6, 2.2, .28, true);
          break;
        case 'romantic':
          pillar(0xa9b0c8, 0, 3.4, 2.2, .16, 6.8); for (const y of [1.2, 2.1, 3.0, 3.9, 4.8]) box(0xc9d2e8, 0, y, 2.2, 1.6 - y * .18, .16, .18); part('ring', 0xffd994, 0, 6.9, 2.2, .38, .38, .15, true);
          break;
        case 'mediterranean':
          for (const x of [-2.5, 0, 2.5]) pillar(0xffd7a3, x, 1.8, 2.2, .22, 3.6); part('arch', 0xff9dbd, 0, 2.6, 2.2, 3.9, 2.6, .55, true);
          break;
        case 'grand':
          for (const x of [-2.7, 2.7]) { pillar(0xffe1a1, x, 2.8, 2.2, .25, 5.6); box(0xf39ec0, x, 5.35, 2.2, 1.0, .7, .1, true); }
          break;
      }
    };
    signature();
    const merged = this.merge(g); this.cache.set(key, merged); return merged.clone(true);
  }
  merge(source) {
    // Bake transforms and merge by material, preserving shared cached geometry.
    source.updateMatrixWorld(true);
    const batches = new Map(), out = new this.T.Group();
    out.name=source.name;out.userData={...source.userData};
    source.traverse(m=>{
      if(!m.isMesh)return;
      const geo=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone());geo.applyMatrix4(m.matrixWorld);
      if(!batches.has(m.material))batches.set(m.material,{positions:[],normals:[]});
      const b=batches.get(m.material);b.positions.push(...geo.attributes.position.array);b.normals.push(...geo.attributes.normal.array);geo.dispose();
    });
    for(const [material,b] of batches){
      const geo=new this.T.BufferGeometry();geo.setAttribute('position',new this.T.Float32BufferAttribute(b.positions,3));geo.setAttribute('normal',new this.T.Float32BufferAttribute(b.normals,3));geo.computeBoundingSphere();
      const m=new this.T.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;out.add(m);
    }
    return out;
  }
};

// Gentle floating lights / snow crystals. One draw call; no flashing lightning.
window.WorldMagic = class WorldMagic {
  constructor(scene,T){
    this.T=T;this.time=0;this.dummy=new T.Object3D();
    this.mesh=new T.InstancedMesh(new T.OctahedronGeometry(.13),new T.MeshBasicMaterial({color:0xffffff}),40);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;scene.add(this.mesh);
  }
  update(dt,s,track,settings){
    if(!track.roundData)return;
    if(!settings.reducedMotion)this.time+=dt;
    const theme=track.roundData.theme;
    const colors=theme==='snow'?[0xffffff,0xc9f7ff]:theme==='volcano'?[0xffcc8a,0xff94ad]:theme==='forest'?[0xffe99a,0xb2ffb8]:theme==='moon'?[0xc1b8ff,0xb0ffff]:[0xffe5a1,0xb8fff1,0xffbde8];
    this.mesh.count=settings.graphicsQuality==='low'?12:40;
    const c=new this.T.Color();
    for(let i=0;i<this.mesh.count;i++){
      const at=s-8+(i*7.37)%95,side=i%2?1:-1;
      const p=track.frame(at,side*(track.roundData.roadWidth/2+1.5+(i%4)*1.5),2+(i%5)*1.2+Math.sin(this.time+i)*.6);
      this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(this.time*.2,i+this.time*.3,0);this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i,this.dummy.matrix);this.mesh.setColorAt(i,c.set(colors[i%colors.length]));
    }
    this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor.needsUpdate=true;
  }
};
