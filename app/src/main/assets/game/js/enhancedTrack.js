// Reference-inspired modular bridge art and bounded, physically checked generation.
window.TrackGenerator = class EnhancedTrack extends window.TrackGenerator {
  constructor(...args){
    super(...args);const T=this.THREE;
    this.biomeArt = new window.BiomeArt(T);
    this.boxGeometry=new T.BoxGeometry(1,1,1);
    this.stone=new T.MeshStandardMaterial({color:0xd9c6a5,roughness:.93});
    this.wood=new T.MeshStandardMaterial({color:0xa56e36,roughness:.8});
    this.darkWood=new T.MeshStandardMaterial({color:0x754f34,roughness:.85});
    this.pavers=[0xe3d0ad,0xdbc4a1,0xd1b997].map(color=>new T.MeshStandardMaterial({color,roughness:.94}));
    this.validator=new window.ReachabilityValidator();this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1};
    this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs=new Set();
    // Roadside charm geometry: a light summer-city layer that complements the
    // larger biome landmarks without adding runtime assets.
    this.picketGeo=new T.BoxGeometry(1,1,1);
    this.picketMat=new T.MeshStandardMaterial({color:0xf7efe2,roughness:.85});
    this.flowerGeo=new T.SphereGeometry(1,6,5);
    this.flowerA=new T.MeshStandardMaterial({color:0xff8fba,roughness:.7});
    this.flowerB=new T.MeshStandardMaterial({color:0xffe796,roughness:.7});
    this.lampPoleGeo=new T.CylinderGeometry(1,1,1,6);
    this.lampPoleMat=new T.MeshStandardMaterial({color:0x3b4650,roughness:.6,metalness:.4});
    this.lampHeadGeo=new T.SphereGeometry(1,7,5);
    this.lampGlow=new T.MeshStandardMaterial({color:0xffd88a,emissive:0xffc96b,emissiveIntensity:.8,roughness:.4});
    this.trunkGeo=new T.CylinderGeometry(1,1,1,6);
    this.trunkMat=new T.MeshStandardMaterial({color:0x7a5233,roughness:.9});
    this.canopyGeo=new T.SphereGeometry(1,7,5);
    this.canopyMat=new T.MeshStandardMaterial({color:0x4f9d5f,roughness:.85});
  }
  buildRound(round,seed=Date.now()){
    this.stone.color.set(round.roadColor);
    this.wood.color.set(round.railColor);
    this.darkWood.color.set(round.railColor).multiplyScalar(.6);
    this.pavers.forEach((m,i)=>{m.color.set(round.roadColor).multiplyScalar(.9+i*.07);});
    const luminous=['crystal','neon','moon','rainbow','grand_run'].includes(round.theme);
    this.wood.emissive.set(luminous?round.railColor:0);this.wood.emissiveIntensity=luminous?.45:0;
    const cozy=['garden','castle_bridge','citadel','sunset','rainbow','grand_run','waterfalls'].includes(round.theme);
    const canopyColors={forest:0x2f7d4d,desert:0x8a9a4b,sunset:0x4f7d5f,rainbow:0x69b06a,citadel:0x4a7d5c,waterfalls:0x3d8b6a,grand_run:0x4f9d5f};
    this.canopyMat.color.set(canopyColors[round.theme]||0x4f9d5f);
    this.trunkMat.color.set(round.theme==='snow'?0x8a7a6a:0x7a5233);
    this.picketMat.color.set(cozy?0xf7efe2:0xcfc5b8);
    this.lampGlow.emissiveIntensity=['neon','moon'].includes(round.theme)?1.6:.8;
    this.flowerA.color.set((round.theme==='sunset'||round.theme==='volcano')?0xffb37a:0xff8fba);
    this.flowerB.color.set(round.theme==='citadel'?0xffe08a:0xffe796);
    this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1};this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs.clear();
    super.buildRound(round,seed);
  }
  setDifficulty(c){this.difficulty={speedMultiplier:Math.max(.9,Math.min(1.1,c.speedMultiplier||1)),obstacleDensityMultiplier:Math.max(.65,Math.min(1.15,c.obstacleDensityMultiplier||1))};}
  speedMultiplierAt(s){return this.activeSegments.find(g=>s>=g.userData.sStart&&s<g.userData.sEnd)?.userData.speedMultiplier||1;}
  getTrackPoint(s){const p=super.getTrackPoint(s);p.y=4.5*(Math.cos(s*Math.PI/95)-1);return p;}
  getTrackGrade(s){return -4.5*Math.PI/95*Math.sin(s*Math.PI/95);}
  frame(s,lateral=0,y=0){const p=this.getTrackPoint(s),t=this.getTrackTangent(s);return {x:p.x-t.z*lateral,y:p.y+y,z:p.z+t.x*lateral};}
  addBox(g,mat,s,lateral,y,w,h,len){const p=this.frame(s,lateral,y),m=new this.THREE.Mesh(this.boxGeometry,mat);m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(s).x,this.getTrackTangent(s).z);m.rotation.order="YXZ";m.rotation.x=-Math.atan(this.getTrackGrade(s));m.scale.set(w,h,len);m.receiveShadow=true;m.castShadow=true;g.add(m);return m;}
  addInstanced(g,geo,mat,items){
    const T=this.THREE,im=new T.InstancedMesh(geo,mat,items.length);
    const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),pos=new T.Vector3(),sc=new T.Vector3();
    items.forEach((it,i)=>{
      const p=this.frame(it.s,it.lateral,it.y);
      pos.set(p.x,p.y,p.z);
      e.set(it.pitch||0,Math.atan2(this.getTrackTangent(it.s).x,this.getTrackTangent(it.s).z),0);
      q.setFromEuler(e);sc.set(it.sx,it.sy,it.sz);m4.compose(pos,q,sc);im.setMatrixAt(i,m4);
    });
    im.castShadow=true;im.receiveShadow=true;g.add(im);return im;
  }
  addCharm(g,s,w,gap){
    if(gap)return;
    const theme=this.roundData.theme;
    const cozy=['garden','castle_bridge','citadel','sunset','rainbow','grand_run','waterfalls'].includes(theme);
    const leafy=['garden','forest','castle_bridge','citadel','sunset','rainbow','grand_run','waterfalls'].includes(theme);
    if(cozy&&s%24===0)this.addPicketFence(g,s,w,((s/24)%2===0)?1:-1);
    if(cozy&&s%48===24)this.addFlowers(g,s,w,((s/48)%2===0)?-1:1);
    if(s%48===24)this.addLamp(g,s,w,((s/48)%2===0)?1:-1);
    if(leafy&&s%72===48)this.addCanopyTree(g,s,w,((s/72)%2===0)?-1:1);
  }
  addPicketFence(g,s,w,side){
    const items=[];const grade=-Math.atan(this.getTrackGrade(s+11));
    for(let i=0;i<12;i++)items.push({s:s+1+i*1.9,lateral:side*(w/2+.45),y:.78,sx:.09,sy:1.15,sz:.06});
    items.push({s:s+11.5,lateral:side*(w/2+.45),y:.42,sx:.07,sy:.08,sz:21,pitch:grade});
    items.push({s:s+11.5,lateral:side*(w/2+.45),y:.9,sx:.07,sy:.08,sz:21,pitch:grade});
    this.addInstanced(g,this.picketGeo,this.picketMat,items);
  }
  addFlowers(g,s,w,side){
    const a=[],b=[];
    for(let i=0;i<5;i++){const at=s+4+i*4,it={s:at,lateral:side*(w/2-.17),y:.92,sx:.16,sy:.14,sz:.16};(i%2?b:a).push(it);}
    this.addInstanced(g,this.flowerGeo,this.flowerA,a);this.addInstanced(g,this.flowerGeo,this.flowerB,b);
  }
  addLamp(g,s,w,side){
    this.addInstanced(g,this.lampPoleGeo,this.lampPoleMat,[{s:s+2,lateral:side*(w/2+.95),y:1.7,sx:.09,sy:3.4,sz:.09}]);
    this.addInstanced(g,this.lampHeadGeo,this.lampGlow,[{s:s+2,lateral:side*(w/2+.95),y:3.5,sx:.3,sy:.3,sz:.3}]);
  }
  addCanopyTree(g,s,w,side){
    this.addInstanced(g,this.trunkGeo,this.trunkMat,[{s:s+4,lateral:side*(w/2+1.7),y:2,sx:.16,sy:4,sz:.16}]);
    this.addInstanced(g,this.canopyGeo,this.canopyMat,[
      {s:s+4,lateral:side*(w/2+.9),y:6,sx:2.5,sy:1.7,sz:2.5},
      {s:s+4,lateral:side*(w/2+2.7),y:4.9,sx:1.8,sy:1.4,sz:1.8},
      {s:s+4,lateral:side*(w/2+.2),y:6.9,sx:1.4,sy:1.2,sz:1.4}
    ]);
  }
  spawnNextSegment(){
    const T=this.THREE,s=this.nextSpawnS,w=this.roundData.roadWidth,g=new T.Group();
    const gap=!!this.roundData.features.hasGaps&&s>this.roundData.firstSafeDistance&&s%144===96;
    g.userData={sStart:s,sEnd:s+24,isGap:gap,gapStart:s+10.8,gapEnd:s+13.2,speedMultiplier:this.difficulty.speedMultiplier,densityMult:this.difficulty.obstacleDensityMultiplier};
    this.scene.add(g);this.activeSegments.push(g);
    for(let i=0;i<12;i++){const mid=s+i*2+1;if(gap&&mid>s+10&&mid<s+14)continue;this.addBox(g,this.stone,mid,0,-.27,w,.5,2.05);}
    if(gap){this.addBox(g,this.stone,s+10.4,0,-.27,w,.5,.8);this.addBox(g,this.stone,s+13.6,0,-.27,w,.5,.8);}
    for(let shade=0;shade<3;shade++){
      const transforms=[];
      for(let row=0;row<16;row++)for(let col=0;col<4;col++){
        if((row+col)%3!==shade)continue;const at=s+row*1.5+.75;if(gap&&at>s+10&&at<s+14)continue;
        const planks=['forest','sunset','workshop'].includes(this.roundData.theme);
        if(planks&&col!==0)continue;
        const p=this.frame(at,planks?0:(col-1.5)*(w/4),.015),o=new T.Object3D();o.position.set(p.x,p.y,p.z);o.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);o.rotation.order="YXZ";o.rotation.x=-Math.atan(this.getTrackGrade(at));o.scale.set(planks?w-.15:w/4-.06,.06,1.43);o.updateMatrix();transforms.push(o.matrix);
      }
      const tiles=new T.InstancedMesh(this.boxGeometry,this.pavers[shade],transforms.length);transforms.forEach((m,i)=>tiles.setMatrixAt(i,m));tiles.receiveShadow=true;g.add(tiles);
    }
    for(const side of [-1,1]){
      for(let i=0;i<6;i++){const at=s+i*4+2;this.addBox(g,this.wood,at,side*(w/2-.17),.77,.25,.24,4.05);this.addBox(g,this.darkWood,at,side*(w/2-.17),.34,.17,.14,4.05);}
      for(let i=0;i<6;i++)this.addBox(g,this.wood,s+i*4,side*(w/2-.17),.52,.34,1.05,.34);
    }
    if(gap)this.addBox(g,this.wood,s+9.9,0,.07,w,.05,.7);
    this.addCharm(g,s,w,gap);
    this.populateSegment(s,s+24,gap,w,g);
    if(s%72===24&&['garden','crystal','moon','rainbow','grand_run'].includes(this.roundData.theme)){
      const portal=this.biomeArt.portal(this.roundData),p=this.frame(s+12);
      portal.position.set(p.x,p.y,p.z);portal.rotation.y=Math.atan2(this.getTrackTangent(s+12).x,this.getTrackTangent(s+12).z);this.addScenery(portal,s);
    }
    // Batch bridge blocks/rails by material (shared cube geometry).
    const batches=new Map();
    for(const m of [...g.children])if(m.isMesh&&!m.isInstancedMesh){m.updateMatrix();const list=batches.get(m.material)||[];list.push(m.matrix.clone());batches.set(m.material,list);g.remove(m);}
    for(const [material,matrices] of batches){const batch=new T.InstancedMesh(this.boxGeometry,material,matrices.length);matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.castShadow=true;batch.receiveShadow=true;g.add(batch);}
    if(!this.finishGate&&s+24>=this.roundData.length){this.finishGate=this.factory.createFinishGate(this.roundData.name);const p=this.frame(this.roundData.length);this.finishGate.position.set(p.x,p.y,p.z);this.scene.add(this.finishGate);}
    this.nextSpawnS=s+24;
  }
  populateSegment(s,end,gap,w,g){
    const safe=s<this.roundData.firstSafeDistance||s>=this.roundData.length,lanes=[-w*.28,0,w*.28];
    const possible=[0,1,2].filter(i=>Math.abs(lanes[i]-this.lastSafeLane)<=4.5);
    const safeIndex=possible[Math.floor(this.rng()*possible.length)],safeLane=lanes[safeIndex],hazards=[];
    const urbanThemes=['castle_bridge','waterfalls','sunset','neon','workshop','storm','citadel','grand_run'];
    const cityPool=urbanThemes.includes(this.roundData.theme)
      ? ['van','bus','bollard','construction_barrier','roadroller']
      : ['traffic_cone','barrel','bollard','construction_barrier'];
    if(!safe&&!gap)for(let i=0;i<3;i++)if(i!==safeIndex&&this.rng()<.65*this.difficulty.obstacleDensityMultiplier){
      const cityChance=urbanThemes.includes(this.roundData.theme)?.72:.34;
      const useCity=this.rng()<cityChance;
      const type=useCity
        ? cityPool[Math.floor(this.rng()*cityPool.length)]
        : (this.roundData.features.hasJumps&&this.rng()<.45?'barrier':'crate');
      hazards.push({laneX:lanes[i],type});
    }
    const plan={roadWidth:w,speed:window.ScooterTuning.maxSpeed,minSpeed:this.roundData.baseSpeed*.9*window.ScooterTuning.cruiseMultiplier*window.ScooterTuning.brakeFactor,length:24,previousLane:this.lastSafeLane,safeLane,hazards,gapWidth:gap?2.4:0};
    if(!this.validator.validateLayout(plan))hazards.length=0;this.lastSafeLane=safeLane;
    for(const h of hazards){
      const m=this.factory.createObstacle(h.type),at=s+18,p=this.frame(at,h.laneX);
      m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);
      m.userData={id:`obs_${at}_${h.laneX}`,s:at,laneX:h.laneX,type:h.type,hit:false,
        isJumpable:['barrier','traffic_cone','construction_barrier'].includes(h.type),isCityObstacle:!['barrier','crate'].includes(h.type)};
      m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(m);this.activeObstacles.push(m);
    }
    if(s<this.roundData.length){
      for(let i=0;i<5;i++){const at=s+3+i*4;if(gap&&at>s+9&&at<s+15)continue;this.addItem(this.factory.createCoin(),at,safeLane,1.05,{id:`coin_${at}`});this.totalCoins++;}
      if(!gap&&s%96===24){this.addItem(this.factory.createPowerup('overdrive'),s+7,safeLane,1.25,{id:`boost_${s}`,isPowerup:true,type:'overdrive'});}
      else if(!gap&&!safe&&this.rng()<.25){const type=['shield','magnet','double','heart','overdrive'][Math.floor(this.rng()*5)];this.addItem(this.factory.createPowerup(type),s+7,safeLane,1.25,{id:`power_${s}`,isPowerup:true,type});}
      if(!gap&&this.rng()<.16)this.addItem(this.factory.createGem(),s+9,safeLane,1.15,{id:`gem_${s}`,isGem:true});
    }
    for(const side of [-1,1]){
      const at=s+10+this.rng()*8,offset=side*(w/2+9+this.rng()*5),p=this.frame(at,offset,-3-this.rng()*2);
      const island=this.biomeArt.create(this.roundData);island.position.set(p.x,p.y,p.z);
      island.scale.setScalar(.8+this.rng()*.35);island.rotation.y=side*.25;this.addScenery(island,s);
      // Every other stretch gets a denser foreground landmark.  These modular
      // terraces make the world feel connected instead of repeating empty islands.
      if(s%48===0){
        const variant=(Math.floor(s/48)+(side>0?1:0))%3;
        const landmark=this.biomeArt.cluster(this.roundData,variant);
        const lp=this.frame(s+12+(side>0?2:-2),side*(w/2+13.5),-1.25-this.rng()*.75);
        landmark.position.set(lp.x,lp.y,lp.z);
        landmark.scale.setScalar(.86+this.rng()*.1);
        landmark.rotation.y=side*.08;
        this.addScenery(landmark,s);
      }
      // A larger city/coastal landmark arrives less often so it reads as a
      // destination: utility pylon, lamps, guardrails and small buildings.
      if(s%96===48&&side===((Math.floor(s/96)%2)?1:-1)){
        const city=this.biomeArt.cityBlock(this.roundData,Math.floor(s/96)%3);
        const cp=this.frame(s+12,side*(w/2+16.0),-1.35-this.rng()*.55);
        city.position.set(cp.x,cp.y,cp.z);city.scale.setScalar(.78+this.rng()*.08);city.rotation.y=side*.06;
        this.addScenery(city,s);
      }
    }
  }
  addItem(m,s,laneX,y,extra){const p=this.frame(s,laneX,y);m.position.set(p.x,p.y,p.z);m.userData={...extra,s,laneX,collected:this.collectedIDs.has(extra.id),baseY:p.y};if(!m.userData.collected){this.scene.add(m);this.activeCollectibles.push(m);}}
  addScenery(m,s){m.userData.s=s;this.scene.add(m);this.sceneryObjects.push(m);}
  restoreCheckpoint(s){
    // Rebuild from the seed when the checkpoint lies behind recycled sections.
    if(s>=(this.activeSegments[0]?.userData.sStart||0))return;
    for(const m of this.activeCollectibles)if(m.userData.collected)this.collectedIDs.add(m.userData.id);
    const ids=new Set(this.collectedIDs),round=this.roundData,seed=this.seed;
    this.clearAll();this.initRNG(seed);this.roundData=round;this.nextSpawnS=0;this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs=ids;
    while(this.nextSpawnS<s+this.spawnAheadDistance)this.spawnNextSegment();
  }
  update(s){
    for(const m of this.activeCollectibles)if(m.userData.collected)this.collectedIDs.add(m.userData.id);
    const threshold=s-this.recycleBehindDistance;
    for(const g of this.activeSegments)if(g.userData.sEnd<threshold)g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});
    super.update(s);
    const t=performance.now()*.001;
    this.activeCollectibles.forEach(m=>{m.rotation.y=t*1.7;m.position.y=m.userData.baseY+Math.sin(t*2+m.userData.s)*.1;});
  }
  clearAll(){this.activeSegments.forEach(g=>g.traverse(m=>{if(m.isInstancedMesh)m.dispose();}));super.clearAll();}
};
