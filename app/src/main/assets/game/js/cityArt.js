// LOUFFI CITY RUSH: cached street architecture and authored destination skylines.
// Geometry is merged by material; the same district is reused along the route.
window.CityArt = class CityArt {
  constructor(T) {
    this.T=T;this.cache=new Map();this.materials=new Map();this.labels=new Map();
    this.geo={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(1,1,1,12),
      sphere:new T.SphereGeometry(1,16,10),cone:new T.ConeGeometry(1,1,12),
      roof:new T.ConeGeometry(1,1,4),ring:new T.TorusGeometry(1,.045,8,48)};
    this.profiles={
      Kyoto:{walls:[0xe7ceac,0xf4e8d3,0xc98b6b],trim:0x443b3b,accent:0xb93240,leaf:0xf5a8bc,style:'japan',signs:['MATCHA','KYOTO','LOUFFI TEA'],sky:0xb4e7f1},
      London:{walls:[0xa55340,0xcbb4a0,0x9b8473],trim:0xeee3cc,accent:0x993336,leaf:0x548968,style:'london',signs:['CITY BOOKS','LONDON','UNDERGROUND'],sky:0xc2d8e5},
      Singapore:{walls:[0xf2e2c5,0x90b6ad,0xd9bca0],trim:0xf5ebd5,accent:0x148e94,leaf:0x489475,style:'tropical',signs:['GARDEN CAFE','SINGAPORE','LOUFFI'],sky:0xa7e5ee},
      Vancouver:{walls:[0xb4c9ce,0xd9c5a7,0x667f8c],trim:0x3b5663,accent:0xdf7c4a,leaf:0x48805e,style:'glass',signs:['COAST COFFEE','VANCOUVER','BIKE SHOP'],sky:0xb7dce7},
      Marrakech:{walls:[0xcc8267,0xe4a67c,0xc59471],trim:0xf5d8a7,accent:0x1f8b8c,leaf:0x6d9659,style:'bazaar',signs:['SOUK LOUFFI','MARRAKECH','ATELIER'],sky:0xf5d6b5},
      Prague:{walls:[0xd5b098,0xd6c3a5,0xadbbcc],trim:0xf4e4bd,accent:0x86435e,leaf:0x728f70,style:'gable',signs:['OLD TOWN','PRAHA','CRYSTAL CAFE'],sky:0xc6dcee},
      Sapporo:{walls:[0xa3b7bf,0xcbaf9e,0xdfe6e5],trim:0xf3f8fb,accent:0xbf455b,leaf:0xd7ece6,style:'snow',signs:['SNOW CAFE','SAPPORO','HOT RAMEN'],sky:0xcfebf3},
      'Rio de Janeiro':{walls:[0xf8c36c,0xd69ca9,0x86c7be],trim:0xffe9c1,accent:0x187d8a,leaf:0x599768,style:'tropical',signs:['PRAIA','RIO','CAFE LOUFFI'],sky:0xf0d5c3},
      Tokyo:{walls:[0x33495e,0x455473,0x3e3354],trim:0x91afbc,accent:0xfc609d,leaf:0x419088,style:'neon',signs:['TOKYO NIGHT','LOUFFI 24','RAMEN'],sky:0x788bae},
      Amsterdam:{walls:[0xb27658,0x82645a,0xc29379],trim:0xf3e7d2,accent:0x398c91,leaf:0x648d68,style:'canal',signs:['CANAL CAFE','AMSTERDAM','FIETS'],sky:0xb7dfe8},
      'New York':{walls:[0x967e6a,0x627c90,0xaf9580],trim:0xded5c8,accent:0xe8b650,leaf:0x548065,style:'metro',signs:['CITY DELI','NEW YORK','BROADWAY'],sky:0xb2c9d6},
      Naples:{walls:[0xe7bb90,0xd99578,0xf4cd9b],trim:0xf5e4c5,accent:0xb34342,leaf:0x619262,style:'coast',signs:['GELATO','NAPOLI','PIZZERIA'],sky:0xe7c5bd},
      Paris:{walls:[0xe5d5bd,0xcab9a3,0xebdfca],trim:0xf9eed9,accent:0x467e91,leaf:0x729885,style:'paris',signs:['BOULANGERIE','PARIS','CAFE LOUFFI'],sky:0xa6b7de},
      Istanbul:{walls:[0xd3b08e,0xc99882,0xd4c7ab],trim:0xf5e2bd,accent:0x38989b,leaf:0x65876c,style:'dome',signs:['BAZAAR','ISTANBUL','LOUFFI CAY'],sky:0xb2d6de},
      Barcelona:{walls:[0xe0bc8a,0xd5a28a,0xefd0a4],trim:0xfbe6ba,accent:0x249d9f,leaf:0x68a274,style:'mosaic',signs:['BARCELONA','LA RAMBLA','MOSAIC CAFE'],sky:0xb4e0ec},
      'LOUFFI City':{walls:[0xe7bd9e,0xbeb4d5,0x92bdb6],trim:0xffedc7,accent:0x438dbe,leaf:0x719d79,style:'grand',signs:['LOUFFI CITY','WORLD TOUR','RUSH CLUB'],sky:0xbce3ed}
    };
  }
  profile(round){return this.profiles[round.city]||this.profiles.Kyoto;}
  material(color,kind='stone'){
    const key=`${color}/${kind}`;
    if(!this.materials.has(key))this.materials.set(key,new this.T.MeshStandardMaterial({color,
      roughness:kind==='glass'?.2:kind==='metal'?.34:.83,metalness:kind==='glass'?.32:kind==='metal'?.55:0,
      emissive:kind==='light'?color:0,emissiveIntensity:kind==='light'?.55:0}));
    return this.materials.get(key);
  }
  part(g,kind,color,x,y,z,sx,sy,sz,materialKind='stone'){
    const m=new this.T.Mesh(this.geo[kind],this.material(color,materialKind));
    m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;
  }
  box(g,c,x,y,z,w,h,d,k){return this.part(g,'box',c,x,y,z,w,h,d,k);}
  rod(g,c,a,b,r=.065){
    const from=new this.T.Vector3(...a),to=new this.T.Vector3(...b),dir=to.clone().sub(from);
    const m=this.part(g,'cylinder',c,...from.clone().add(to).multiplyScalar(.5).toArray(),r,dir.length(),r,'metal');
    m.quaternion.setFromUnitVectors(new this.T.Vector3(0,1,0),dir.normalize());return m;
  }
  label(g,text,color,x,y,z,width=3,height=.6,rotation=-Math.PI/2){
    if(typeof document==='undefined')return;
    const key=text+color;
    if(!this.labels.has(key)){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
      const c=canvas.getContext('2d');c.fillStyle='#'+color.toString(16).padStart(6,'0');c.fillRect(0,0,512,96);
      c.strokeStyle='#f4ebd9';c.lineWidth=3;c.strokeRect(7,7,498,82);
      c.fillStyle='#fff7e7';c.textAlign='center';c.textBaseline='middle';c.font='bold 39px sans-serif';c.fillText(text,256,50,465);
      const map=new this.T.CanvasTexture(canvas);map.colorSpace=this.T.SRGBColorSpace;
      this.labels.set(key,new this.T.MeshStandardMaterial({map,roughness:.62,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.14}));
    }
    const plane=new this.T.Mesh(new this.T.PlaneGeometry(width,height),this.labels.get(key));
    plane.position.set(x,y,z);plane.rotation.y=rotation;g.add(plane);
  }
  tree(g,p,x,z,palm=false){
    this.part(g,'cylinder',0x765441,x,1.5,z,.13,3,.13);
    if(palm){for(let k=0;k<6;k++){const a=k*Math.PI/3;const leaf=this.part(g,'sphere',p.leaf,x+Math.sin(a)*.6,3.2,z+Math.cos(a)*.6,.42,.16,1.3);leaf.rotation.y=a;}}
    else for(let k=0;k<4;k++)this.part(g,'sphere',p.leaf,x+Math.sin(k*2)*.42,3.05+(k%2)*.4,z+Math.cos(k*2)*.4,.95,1.12,.95);
    this.box(g,0x716957,x,.18,z,1.25,.35,1.25);
  }
  district(round,variant=0){
    const key=`street_${round.id}_${variant}`;
    if(this.cache.has(key))return this.cache.get(key).clone(true);
    const g=new this.T.Group(),p=this.profile(round),T=this.T;
    g.name=`city_street_${round.city}_${variant}`;g.userData.city=round.city;
    const tall=['metro','neon','glass'].includes(p.style),japan=['japan','snow'].includes(p.style);
    // A real pavement frontage: façades start behind a continuous walkable-looking sidewalk.
    for(let i=0;i<3;i++){
      const z=-8+i*8,h=(tall?14:7)+(i+variant)%3*2.4,w=7.8,front=3.65;
      this.box(g,p.walls[(i+variant)%3],6.5,h/2+.15,z,5.7,h,w);
      this.box(g,0x7f8179,6.5,.45,z,5.85,.7,w+.05);
      this.box(g,p.trim,6.45,h+.2,z,5.95,.4,w+.13);
      const floors=Math.floor((h-3)/2.35);
      for(let floor=0;floor<floors;floor++){
        const y=4.35+floor*2.35;
        this.box(g,p.trim,front-.025,y-.91,z,.19,.11,w);
        for(let col=-1;col<=1;col++){
          const wz=z+col*2.2;
          this.box(g,p.trim,front-.09,y,wz,.15,1.63,1.47);
          this.box(g,p.style==='neon'?0x86bacb:0x385d70,front-.18,y,wz,.045,1.35,1.22,'glass');
          this.box(g,p.trim,front-.21,y,wz,.05,1.43,.07);
          this.box(g,p.trim,front-.21,y,wz,.05,.065,1.3);
          if(['paris','coast','mosaic','london','canal'].includes(p.style)){
            this.box(g,p.trim,front-.4,y-.88,wz,.8,.13,1.72);
            this.box(g,0x344953,front-.8,y-.52,wz,.06,.08,1.73,'metal');
            for(let n=-2;n<=2;n++)this.box(g,0x344953,front-.8,y-.7,wz+n*.32,.035,.43,.035,'metal');
          }
        }
      }
      // Ground-floor glass storefronts, doors, fascia and striped awnings.
      for(const sign of [-1,1]){
        this.box(g,0x244b5d,front-.1,1.36,z+sign*2.08,.08,1.92,2.65,'glass');
        this.box(g,p.trim,front-.14,.4,z+sign*2.08,.15,.15,2.8);
        this.box(g,p.trim,front-.14,2.3,z+sign*2.08,.15,.15,2.8);
      }
      this.box(g,p.trim,front-.08,1.35,z,.12,2.2,1.05);
      this.box(g,0x284956,front-.16,1.4,z,.07,1.96,.86,'glass');
      this.box(g,0xe0bc7d,front-.24,1.25,z-.23,.07,.32,.05,'metal');
      this.box(g,p.accent,front-.18,2.85,z,.18,.64,7.25);
      this.label(g,p.signs[(i+variant)%3],p.accent,front-.285,2.85,z,6,.53);
      for(let k=0;k<14;k++){
        const awn=this.box(g,k%2?p.trim:p.accent,front-.63,2.38,z-3.5+k*.53,1.2,.09,.54);
        awn.rotation.z=-.19;
        this.box(g,k%2?p.trim:p.accent,front-1.22,2.19,z-3.5+k*.53,.06,.28,.54);
      }
      if(japan){
        for(let n=0;n<2;n++){
          const roof=this.part(g,'roof',0x3b4f55,6.45,h+.8+n*.75,z,4.5-n*.55,1.15,5.9-n*.4);
          roof.rotation.y=Math.PI/4;
        }
        for(const n of [-1,1])this.part(g,'sphere',p.accent,front-.7,3.25,z+n*3,.23,.38,.23,'light');
      }else if(['paris','gable','canal','london','snow'].includes(p.style)){
        const roof=this.part(g,'roof',p.style==='snow'?0xf1f6f4:0x4f6472,6.5,h+1.1,z,4.1,2.1,5.5);roof.rotation.y=Math.PI/4;
        this.box(g,p.walls[0],7.5,h+1.1,z+2,1,2,1);
      }else if(['dome','bazaar'].includes(p.style)){
        this.part(g,'sphere',p.accent,6.5,h+.35,z,1.8,1.6,1.8);
        this.part(g,'cone',p.trim,6.5,h+2,z,.18,1.2,.18);
      }else{
        this.box(g,0x64767d,7.1,h+.7,z+1.5,1.5,.85,2.1);
        this.rod(g,0x506976,[7.8,h, z-2],[7.8,h+2,z-2],.05);
      }
      if(tall){
        this.box(g,p.accent,front-.45,6.7,z+3.3,.7,4.6,.44,'light');
        for(let n=0;n<4;n++)this.box(g,0xffefcd,front-.82,5.1+n*.9,z+3.3,.04,.35,.3,'light');
      }
      // Far blocks add layered skyline depth without more per-frame construction.
      const hh=h+4+(variant%2)*3;
      this.box(g,p.walls[(i+1)%3],14,hh/2-1,z+2,7,hh,7.7);
      for(let yy=3;yy<hh-1;yy+=2.5)this.box(g,0x6e94a2,10.45,yy,z+2,.04,.9,6,'glass');
    }
    for(const z of [-11.2,10.8]){
      this.part(g,'cylinder',0x314d57,1.1,2.7,z,.08,5.4,.08,'metal');
      this.rod(g,0x314d57,[1.1,5.35,z],[-.05,5.5,z],.075);
      this.box(g,0x304a55,-.1,5.45,z,.75,.18,.34,'metal');
      this.box(g,0xffe9be,-.1,5.34,z,.62,.035,.26,'light');
    }
    this.tree(g,p,1.5,-4.1,p.style==='tropical');this.tree(g,p,1.5,7.8,p.style==='tropical');
    this.box(g,0x936a48,1.7,.65,3.5,.66,.12,1.9);
    this.box(g,0x936a48,2,.95,3.5,.1,.6,1.9);
    for(const zz of [2.8,4.2])this.box(g,0x384d55,1.7,.34,zz,.5,.57,.08,'metal');
    // Utility cabinet and street-specific details: phones, bikes, lanterns, mosaics.
    if(p.style==='london'){
      this.box(g,0xb5333e,1.7,1.15,-8,1,2.3,1);this.box(g,0x7196a6,1.16,1.35,-8,.025,1.5,.7,'glass');
      this.box(g,0xf4e9da,1.15,2.16,-8,.025,.2,.78);this.part(g,'sphere',0xb5333e,1.7,2.3,-8,.54,.24,.54);
    } else if(p.style==='canal'){
      for(const zz of [-7,-5.7])this.part(g,'ring',0x2e444b,1.25,.65,zz,.5,.5,.5,'metal').rotation.y=Math.PI/2;
      this.rod(g,p.accent,[1.25,.65,-7],[1.25,1.1,-6.4]);this.rod(g,p.accent,[1.25,1.1,-6.4],[1.25,.65,-5.7]);
    } else if(p.style==='mosaic'){
      for(let n=0;n<6;n++)this.box(g,[0x44bccc,0xf6be66,0xee8b87][n%3],2,.4,-9+n*.34,.8,.4,.3);
    }
    const out=this.merge(g);this.cache.set(key,out);return out.clone(true);
  }
  landmark(round){
    const key=`landmark_${round.id}`;if(this.cache.has(key))return this.cache.get(key).clone(true);
    const g=new this.T.Group(),p=this.profile(round);g.name=`landmark_${round.city}`;
    const b=(c,x,y,z,w,h,d,k)=>this.box(g,c,x,y,z,w,h,d,k);
    const tower=(x,z,h,w=4,c=p.walls[0])=>{b(c,x,h/2,z,w,h,w);b(p.trim,x,h,z,w+1,.65,w+1);};
    if(round.city==='Paris'){
      for(const sx of [-1,1])for(const sz of [-1,1]){
        this.rod(g,0x786456,[sx*4,0,sz*4],[sx*.65,16,sz*.65],.32);
        for(let j=0;j<5;j++){
          const y=j*3,width=4-y*.21,next=4-(y+3)*.21;
          this.rod(g,0xb8976a,[sx*width,y,sz*width],[sx*next,y+3,-sz*next],.09);
        }
      }
      for(const [y,w] of [[5,6.5],[10,4.2],[16,2]])b(0xb9996b,0,y,0,w,.5,w);
      this.part(g,'cone',0xb9996b,0,18.5,0,.8,5,.8);
      this.rod(g,0xf6d996,[0,21,0],[0,24,0],.07);
    } else if(round.city==='London'){
      tower(0,0,17,4,0xb49e75);tower(0,0,4,5,0xc7b38d);
      for(const x of [-1.6,1.6])b(p.trim,x,11,-2.04,.25,11,.13);
      for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
        const face=new this.T.Group();face.rotation.y=angle;g.add(face);
        this.part(face,'cylinder',0xffeed0,0,14.5,-2.07,1.27,.1,1.27,'light').rotation.x=Math.PI/2;
        this.rod(face,0x3d424a,[0,14.5,-2.15],[0,15.37,-2.15],.055);
        this.rod(face,0x3d424a,[0,14.5,-2.15],[.67,14.18,-2.15],.07);
      }
      this.part(g,'roof',0x45666e,0,19,0,3,4,3).rotation.y=Math.PI/4;
      for(const x of [-2,2])for(const z of [-2,2])this.part(g,'cone',0xe4c995,x,18,z,.28,3,.28);
    } else if(['Kyoto','Sapporo','Tokyo'].includes(round.city)){
      const neon=round.city==='Tokyo';
      if(neon){for(let i=-1;i<=1;i++){tower(i*6,0,18+(i+1)*5,4,0x324963);for(let y=4;y<24;y+=3)b(i%2?0x66e9f1:0xf676b2,i*6,y,-2.05,3,.6,.1,'light');}}
      else for(let n=0;n<4;n++){
        const w=7-n*1.2;tower(0,0,3+n*3,w,0xc85646);
        const roof=this.part(g,'roof',round.city==='Sapporo'?0xf2f4ed:0x39545b,0,3.6+n*3,0,w*.87,1.7,w*.87);roof.rotation.y=Math.PI/4;
      }
      for(const x of [-4,4])this.part(g,'cylinder',0xbd3541,x,3,-5,.33,6,.33);
      b(0xd94d44,0,6,-5,10,.55,.55);b(0x3a4d55,0,6.5,-5,10.8,.3,.8);
    } else if(round.city==='Singapore'){
      for(const x of [-7,0,7])tower(x,0,18,3.8,0x658b9c);
      b(0xe2e7d5,0,18.7,0,22,1.6,5);b(0x56b9c4,0,19.65,0,17,.1,2.3,'glass');
      for(const x of [-7,0,7])this.tree(g,p,x,2,true);
    } else if(['Marrakech','Istanbul'].includes(round.city)){
      tower(0,0,10,8);this.part(g,'sphere',p.accent,0,10.2,0,4,3.3,4);
      for(const x of [-6,6]){tower(x,0,15,1.8);this.part(g,'cone',p.accent,x,16.4,0,1.3,3,1.3);}
    } else if(round.city==='New York'){
      for(const [y,w,h] of [[8,9,16],[18,6,7],[24,3.5,6]])b(0x73909e,0,y,0,w,h,w);
      this.rod(g,0xd8c4a1,[0,27,0],[0,34,0],.16);
      for(let y=2;y<23;y+=2)b(0xf6daa0,0,y,-4.55,7,.5,.08,'light');
    } else if(round.city==='Barcelona'){
      for(const [x,h] of [[-5,18],[-1.7,24],[1.7,24],[5,18]]){this.part(g,'cone',0xd7bb8c,x,h/2,0,1.45,h,1.45);this.part(g,'sphere',p.accent,x,h,0,.7,.7,.7);}
      b(p.walls[0],0,4,0,12,8,6);
    } else if(round.city==='Amsterdam'){
      tower(0,0,10,4);this.part(g,'cone',0x704e46,0,11.6,0,3,4,3);
      for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        const sail=b(0xd6c7a4,Math.cos(a)*3,8+Math.sin(a)*3,-3,6,.4,.22);sail.rotation.z=a;
      }
    } else if(round.city==='Rio de Janeiro'){
      this.part(g,'cone',0x729283,0,6,0,10,12,8);b(0xf0e7d1,0,14,0,1.5,7,1.5);
      b(0xf0e7d1,0,15,0,8,.9,1);this.part(g,'sphere',0xf0e7d1,0,18.1,0,.85,.85,.85);
    } else if(round.city==='Naples'){
      tower(-4,0,11,4);tower(4,0,11,4);b(0xcbab88,0,4,0,8,8,5);
      this.part(g,'cone',0x707d89,0,4,15,18,16,12);
    } else if(round.city==='Vancouver'){
      this.part(g,'cylinder',0x8ba6b4,0,12,0,.65,24,.65);this.part(g,'cylinder',0xafc9cd,0,22,0,4,2,4);
      this.part(g,'cone',0x7b98a7,0,23.6,0,4.7,2,4.7);
    } else if(round.city==='Prague'){
      for(const x of [-4,4]){tower(x,0,14,3);this.part(g,'roof',0x435767,x,16.5,0,2.7,5,2.7).rotation.y=Math.PI/4;}
      b(p.walls[0],0,4,0,7,8,5);
    } else {
      for(const [x,h] of [[-6,13],[0,22],[6,16]]){tower(x,0,h,4);this.part(g,'cone',p.accent,x,h+2,0,3,4,3);}
      this.part(g,'ring',0xffda89,0,16,-5,5,5,5,'light');
    }
    // An orbit emphasizes the magical world above otherwise grounded city streets.
    const orbit=this.part(g,'ring',0xadeafa,0,12,0,13,13,13,'light');orbit.rotation.x=Math.PI*.4;
    const out=this.merge(g);this.cache.set(key,out);return out.clone(true);
  }
  intersection(round){
    const key=`crossing_${round.id}`;if(this.cache.has(key))return this.cache.get(key).clone(true);
    const g=new this.T.Group(),w=round.roadWidth;
    for(const side of [-1,1]){
      const x=side*(w/2+1);
      this.part(g,'cylinder',0x344e57,x,2.7,0,.1,5.4,.1,'metal');
      this.box(g,0x344e57,side*w*.23,5.3,0,w*.57,.13,.13,'metal');
      this.box(g,0x203842,side*w*.28,4.9,0,.36,.8,.25);
      for(let k=0;k<3;k++)this.part(g,'sphere',k===2?0x75e9aa:0x4f635f,side*w*.28,5.13-k*.23,-.16,.09,.09,.04,k===2?'light':'stone');
    }
    const out=this.merge(g);this.cache.set(key,out);return out.clone(true);
  }
  asphalt(){
    const mat=this.material(0x586576);
    if(mat.map || typeof document==='undefined')return mat;
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),d=ctx.createImageData(256,256);
    let seed=3141;for(let i=0;i<d.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=125+(seed%35);d.data.set([v,v,v,255],i);}
    ctx.putImageData(d,0,0);ctx.strokeStyle='rgba(44,48,55,.22)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(60,0);ctx.lineTo(66,48);ctx.lineTo(53,95);ctx.lineTo(58,170);ctx.lineTo(69,256);ctx.stroke();
    const map=new this.T.CanvasTexture(c);map.wrapS=map.wrapT=this.T.RepeatWrapping;map.repeat.set(2,1);map.colorSpace=this.T.SRGBColorSpace;map.anisotropy=4;
    mat.map=map;mat.roughness=.91;mat.needsUpdate=true;return mat;
  }
  merge(g){
    g.updateMatrixWorld(true);const batches=new Map(),out=new this.T.Group();out.name=g.name;out.userData={...g.userData};
    g.traverse(m=>{if(!m.isMesh)return;const geo=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();geo.applyMatrix4(m.matrixWorld);
      if(!batches.has(m.material))batches.set(m.material,{p:[],n:[],uv:[]});const b=batches.get(m.material);
      b.p.push(...geo.attributes.position.array);b.n.push(...geo.attributes.normal.array);
      b.uv.push(...(geo.attributes.uv?.array||new Float32Array(geo.attributes.position.count*2)));geo.dispose();
    });
    for(const [mat,b]of batches){const geo=new this.T.BufferGeometry();geo.setAttribute('position',new this.T.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new this.T.Float32BufferAttribute(b.n,3));geo.setAttribute('uv',new this.T.Float32BufferAttribute(b.uv,2));geo.computeBoundingSphere();
      const m=new this.T.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;out.add(m);}
    return out;
  }
};
