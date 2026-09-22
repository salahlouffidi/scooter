// Reference-inspired modular bridge art and bounded, physically checked generation.
window.TrackGenerator = class EnhancedTrack extends window.TrackGenerator {
  constructor(...args){
    super(...args);const T=this.THREE;
    this.biomeArt = new window.BiomeArt(T);
    this.cityArt = new window.CityArt(T);
    this.boxGeometry=new T.BoxGeometry(1,1,1);
    this.stone=new T.MeshStandardMaterial({color:0xd9c6a5,roughness:.93});
    this.wood=new T.MeshStandardMaterial({color:0xa56e36,roughness:.8});
    this.darkWood=new T.MeshStandardMaterial({color:0x754f34,roughness:.85});
    this.pavers=[0xe3d0ad,0xdbc4a1,0xd1b997].map(color=>new T.MeshStandardMaterial({color,roughness:.94}));
    // A readable city-street layer keeps the foreground from looking like a
    // placeholder bridge, while the round-specific floating world remains in
    // the skyline and roadside scenery.
    this.cityRoad=this.cityArt.asphalt();
    this.routeSurface=new T.MeshStandardMaterial({color:0xd7ccc8,roughness:.92});
    this.routeEdge=new T.MeshStandardMaterial({color:0x81c784,roughness:.86});
    this.routeAccent=new T.MeshStandardMaterial({color:0xffd36b,emissive:0x000000,roughness:.7});
    this.routeHazard=new T.MeshStandardMaterial({color:0xff7043,emissive:0x000000,roughness:.72});
    this.routeWater=new T.MeshStandardMaterial({color:0x67d9e8,emissive:0x0b5e69,emissiveIntensity:.25,transparent:true,opacity:.88,roughness:.35});
    this.routeSurfaceByStyle={};
    this.citySidewalk=new T.MeshStandardMaterial({color:0x818b96,roughness:.9});
    this.cityRail=new T.MeshStandardMaterial({color:0x334552,roughness:.65,metalness:.35});
    this.cityRailDark=new T.MeshStandardMaterial({color:0x202d38,roughness:.72,metalness:.4});
    this.cityMark=new T.MeshStandardMaterial({color:0xe8e7d8,roughness:.85});
    this.cityPavers=[0x56616c,0x606b76,0x4f5a65].map(color=>new T.MeshStandardMaterial({color,roughness:.93}));
    this.validator=new window.ReachabilityValidator();this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1,movingTrafficChance:.42,magicPickupChance:.12,propulsorChance:.08};
    this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs=new Set();this.simulationTime=0;
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
    const roadTones={
      garden:0x50636b,castle_bridge:0x4f5964,waterfalls:0x4b6872,forest:0x52675d,
      desert:0x716453,crystal:0x4c5870,snow:0x687681,sunset:0x6a565c,
      neon:0x303b59,workshop:0x535e67,storm:0x344650,volcano:0x614743,
      moon:0x424b64,citadel:0x4d6068,rainbow:0x59627a,grand_run:0x4c596e
    };
    const routeTones={garden_path:0x9f8a70,sand_dunes:0xd7a85d,jungle_roots:0x6b492f,mountain_bridge:0x8e949c,canyon_ledges:0x667a82,crystal_floor:0x4e4b74,glacier_ice:0x9adce9,lava_plates:0x3f3544,mushroom_bounce:0x79566b,temple_stone:0x8d806b,island_crossings:0x8f665c,clockwork_belts:0x4f5b63,storm_skyway:0x6f8e9e,moon_rocks:0x555e91,rainbow_rapids:0x667493,sky_arena:0xcfc1ad};
    this.routeSurface.color.set(routeTones[round.routeStyle]||round.roadColor);
    this.routeEdge.color.set(round.routeStyle==='glacier_ice'?0xdffaff:round.railColor);
    this.routeAccent.color.set(round.routeStyle==='lava_plates'?0xff7a45:round.routeStyle==='crystal_floor'?0x9af4ff:round.routeStyle==='storm_skyway'?0x8be7ff:0xffd36b);
    this.routeHazard.color.set(round.routeStyle==='lava_plates'?0xff5b2f:round.routeStyle==='glacier_ice'?0x45bde8:0xff7043);
    this.cityRoad.color.set(round.roadColor);
    this.citySidewalk.color.set(round.theme==='snow'?0xb7c4ca:0x818b96);
    this.cityRail.color.set(round.theme==='neon'?0x3a5a79:0x334552);
    this.cityRailDark.color.set(round.theme==='neon'?0x1a2a42:0x202d38);
    this.cityMark.color.set(['neon','crystal','moon'].includes(round.theme)?0x71efff:0xf5cf68);
    this.cityMark.emissive.set(['neon','crystal','moon'].includes(round.theme)?0x0b6a7b:0x6b4f16);
    this.cityMark.emissiveIntensity=['neon','crystal','moon'].includes(round.theme)?.34:.12;
    this.cityMark.color.set(0xeee9d7);this.cityMark.emissive.set(0);this.cityMark.emissiveIntensity=0;
    this.cityPavers.forEach((m,i)=>m.color.set(this.cityRoad.color).multiplyScalar(.91+i*.045));
    this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1,movingTrafficChance:.42,magicPickupChance:.12,propulsorChance:.08};this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs.clear();this.simulationTime=0;
    super.buildRound(round,seed);
  }
  setDifficulty(c){this.difficulty={
    speedMultiplier:Math.max(.9,Math.min(1.1,c.speedMultiplier||1)),
    obstacleDensityMultiplier:Math.max(.65,Math.min(1.15,c.obstacleDensityMultiplier||1)),
    movingTrafficChance:Math.max(.18,Math.min(.72,c.movingTrafficChance??this.difficulty.movingTrafficChance??.42)),
    magicPickupChance:Math.max(.06,Math.min(.24,c.magicPickupChance??this.difficulty.magicPickupChance??.12)),
    propulsorChance:Math.max(.04,Math.min(.18,c.propulsorChance??this.difficulty.propulsorChance??.08))
  };}
  speedMultiplierAt(s){return this.activeSegments.find(g=>s>=g.userData.sStart&&s<g.userData.sEnd)?.userData.speedMultiplier||1;}
  surfaceAt(s){return this.activeSegments.find(g=>s>=g.userData.sStart&&s<g.userData.sEnd)?.userData.surface||'normal';}
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
    return this.spawnAuthoredSegment();
  }
  spawnAuthoredSegment(){
    const T=this.THREE,s=this.nextSpawnS,w=this.roundData.roadWidth,g=new T.Group(),style=this.roundData.routeStyle;
    const gap=!!this.roundData.features.hasGaps&&s>this.roundData.firstSafeDistance&&s%144===96;
    const surface=(this.roundData.challenge==='sand'&&s%72===24)?'sand':this.roundData.challenge==='ice'?'ice':this.roundData.challenge==='wind'?'wind':this.roundData.challenge==='lava'?'lava':this.roundData.challenge==='low_gravity'?'moon':this.roundData.challenge==='boost_glide'?'rapids':'normal';
    g.userData={sStart:s,sEnd:s+24,isGap:gap,gapStart:s+10.8,gapEnd:s+13.2,speedMultiplier:this.difficulty.speedMultiplier,densityMult:this.difficulty.obstacleDensityMultiplier,surface,routeStyle:style,generation:{s,rngState:this.rngState,lastSafeLane:this.lastSafeLane,difficulty:{...this.difficulty}}};
    this.scene.add(g);this.activeSegments.push(g);
    for(let i=0;i<12;i++){
      const mid=s+i*2+1;if(gap&&mid>s+10&&mid<s+14)continue;
      this.addBox(g,this.routeSurface,mid,0,-.27,w,.5,2.05);
      if(style==='sand_dunes'&&i%3===0)this.addBox(g,this.routeAccent,mid,-w*.26,.02,w*.34,.035,1.7,true);
      if(style==='glacier_ice'&&i%2===0)this.addBox(g,this.routeAccent,mid,(i%4<2?-1:1)*w*.25,.02,.08,.025,1.8,true);
      if(style==='lava_plates'&&i%4===1)this.addBox(g,this.routeHazard,mid,0,.03,w*.32,.06,.42,true);
      if(style==='clockwork_belts'&&i%3===1)this.addBox(g,this.routeAccent,mid,0,.04,.28,.08,1.8,true);
    }
    if(gap){this.addBox(g,this.routeEdge,s+10.4,0,-.27,w,.5,.8);this.addBox(g,this.routeEdge,s+13.6,0,-.27,w,.5,.8);this.addBox(g,this.routeAccent,s+9.8,0,.05,w,.06,.4,true);}
    if(style==='storm_skyway'||style==='rainbow_rapids')for(const side of [-1,1])this.addBox(g,this.routeAccent,s+8,side*(w/2+.55),.9,.12,.12,2.6,true,side*.35);
    this.populateAuthoredSegment(s,s+24,gap,w,g);
    for(const side of [-1,1]){
      const art=this.biomeArt.create(this.roundData),p=this.frame(s+12,side*(w/2+7),0);
      art.position.set(p.x,p.y,p.z);art.scale.setScalar(style==='sky_arena'?1.3:1.0);art.rotation.y=Math.atan2(this.getTrackTangent(s+12).x,this.getTrackTangent(s+12).z)+(side>0?Math.PI:0);this.addScenery(art,s);
    }
    if(s%72===24&&['garden_path','crystal_floor','moon_rocks','rainbow_rapids','sky_arena'].includes(style)){
      const portal=this.biomeArt.portal(this.roundData),p=this.frame(s+12);portal.position.set(p.x,p.y,p.z);portal.rotation.y=Math.atan2(this.getTrackTangent(s+12).x,this.getTrackTangent(s+12).z);this.addScenery(portal,s);
    }
    if(!this.finishGate&&s+24>=this.roundData.length){this.finishGate=this.factory.createFinishGate(this.roundData.name);const p=this.frame(this.roundData.length);this.finishGate.position.set(p.x,p.y,p.z);this.scene.add(this.finishGate);}
    const batches=new Map();for(const m of [...g.children])if(m.isMesh&&!m.isInstancedMesh){m.updateMatrix();const list=batches.get(m.material)||[];list.push(m.matrix.clone());batches.set(m.material,list);g.remove(m);}for(const [material,matrices] of batches){const batch=new T.InstancedMesh(this.boxGeometry,material,matrices.length);matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.castShadow=true;batch.receiveShadow=true;g.add(batch);}
    this.nextSpawnS=s+24;
  }
  populateAuthoredSegment(s,end,gap,w,g){
    const safe=s<this.roundData.firstSafeDistance||s>=this.roundData.length,lanes=[-w*.28,0,w*.28];
    const possible=[0,1,2].filter(i=>Math.abs(lanes[i]-this.lastSafeLane)<=4.5);const safeIndex=possible[Math.floor(this.rng()*possible.length)],safeLane=lanes[safeIndex],hazards=[];
    const special=this.roundData.challenge;
    if(!safe&&!gap)for(let i=0;i<3;i++)if(i!==safeIndex&&this.rng()<.62*this.difficulty.obstacleDensityMultiplier){
      const jumpable=['logs','boulders','ledge_jumps','moving_crystals','bounce','timed_traps','machinery','final_mix'].includes(special);
      hazards.push({laneX:lanes[i],type:jumpable&&this.rng()<.5?'barrier':(special==='lava'?'barrel':'crate')});
    }
    const plan={roadWidth:w,speed:window.ScooterTuning.maxSpeed,minSpeed:this.roundData.baseSpeed*.9*window.ScooterTuning.cruiseMultiplier*window.ScooterTuning.brakeFactor,length:24,previousLane:this.lastSafeLane,safeLane,hazards,gapWidth:gap?2.4:0};
    if(!this.validator.validateLayout(plan))hazards.length=0;this.lastSafeLane=safeLane;
    for(const h of hazards){const m=this.factory.createObstacle(h.type),at=s+18,p=this.frame(at,h.laneX);m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);m.userData={id:`obs_${at}_${h.laneX}`,s:at,laneX:h.laneX,type:h.type,hit:false,isJumpable:h.type==='barrier',isMoving:this.roundData.features.movingObstacles&&special!=='logs',baseLaneX:h.laneX,motionPhase:this.rng()*Math.PI*2,motionRate:.7,motionAmplitude:special==='moving_crystals'?.5:.25};m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(m);this.activeObstacles.push(m);}
    if(s<this.roundData.length){
      for(let i=0;i<5;i++){const at=s+3+i*4;if(gap&&at>s+9&&at<s+15)continue;this.addItem(this.factory.createCoin(),at,safeLane,['bounce','ledge_jumps','boost_glide'].includes(special)?1.7:1.05,{id:`coin_${at}`});this.totalCoins++;}
      // Preserve the official antigravity onboarding pickup at the same
      // authored distance across every round, independent of ML tuning.
      if(s===48)this.addItem(this.factory.createPowerup('antigravity'),61,safeLane,1.35,{id:'antigravity_61',isPowerup:true,type:'antigravity'});
      if(!gap&&s%96===24)this.addItem(this.factory.createPowerup('overdrive'),s+7,safeLane,1.25,{id:`boost_${s}`,isPowerup:true,type:'overdrive'});
      else if(!gap&&!safe&&this.rng()<.25){const type=['shield','magnet','double','heart','overdrive','magic_fruit','propulsor'][Math.floor(this.rng()*7)];this.addItem(this.factory.createPowerup(type),s+7,safeLane,1.25,{id:`power_${s}`,isPowerup:true,type});}
      if(!gap&&!safe&&this.rng()<this.difficulty.magicPickupChance)this.addItem(this.factory.createPowerup('magic_fruit'),s+11,safeLane,1.25,{id:`fruit_${s}`,isPowerup:true,type:'magic_fruit'});
      if(!gap&&!safe&&this.rng()<this.difficulty.propulsorChance)this.addItem(this.factory.createPowerup('propulsor'),s+15,safeLane,1.35,{id:`lift_${s}`,isPowerup:true,type:'propulsor'});
      if(!gap&&this.rng()<.16)this.addItem(this.factory.createGem(),s+9,safeLane,1.15,{id:`gem_${s}`,isGem:true});
    }
  }
  /* Legacy city generator retained below for save compatibility; unreachable. */
  legacySpawnNextSegment(){
    const T=this.THREE,s=this.nextSpawnS,w=this.roundData.roadWidth,g=new T.Group();
    const street=this.cityRoad,sidewalk=this.citySidewalk,rail=this.cityRail,railDark=this.cityRailDark;
    const gap=!!this.roundData.features.hasGaps&&s>this.roundData.firstSafeDistance&&s%144===96;
    g.userData={sStart:s,sEnd:s+24,isGap:gap,gapStart:s+10.8,gapEnd:s+13.2,speedMultiplier:this.difficulty.speedMultiplier,densityMult:this.difficulty.obstacleDensityMultiplier,
      generation:{s,rngState:this.rngState,lastSafeLane:this.lastSafeLane,difficulty:{...this.difficulty}}};
    this.scene.add(g);this.activeSegments.push(g);
    for(let i=0;i<12;i++){
      const mid=s+i*2+1;if(gap&&mid>s+10&&mid<s+14)continue;
      this.addBox(g,street,mid,0,-.27,w,.5,2.05);
      // Short dashed center lines make the route read as a city street even
      // when the surrounding biome is magical, snowy, or volcanic.
      if(!gap&&(i%3!==2)&&s%96!==48){
        this.addBox(g,this.cityMark,mid,-w/6,.003,.09,.014,1.95);
        this.addBox(g,this.cityMark,mid,w/6,.003,.09,.014,1.95);
      }
      for(const sideSign of [-1,1]){
        this.addBox(g,sidewalk,mid,sideSign*(w/2+1.7),-.02,3.4,.38,2.06);
        this.addBox(g,this.picketMat,mid,sideSign*(w/2+.06),.03,.16,.32,2.02);
        this.addBox(g,sidewalk,mid,sideSign*(w/2+10),-1.9,17,3,2.1);
        if(i%2===0)this.addBox(g,this.cityMark,mid,sideSign*(w/2-.18),.003,.08,.014,1.8);
      }
    }
    if(gap){this.addBox(g,street,s+10.4,0,-.27,w,.5,.8);this.addBox(g,street,s+13.6,0,-.27,w,.5,.8);}
    // Junctions and crossings replace bridge planks and continuous guardrails.
    if(s%96===48&&!gap){
      this.addBox(g,street,s+8,0,-.012,w+36,.018,8);
      for(const offset of [3.5,12.5])for(let n=0;n<Math.floor(w/.9);n++)
        this.addBox(g,this.cityMark,s+offset,-w/2+.5+n*.9,.008,.5,.025,2.2);
      const lights=this.cityArt.intersection(this.roundData),p=this.frame(s+13,0);
      lights.position.set(p.x,p.y,p.z);lights.rotation.y=Math.atan2(this.getTrackTangent(s+13).x,this.getTrackTangent(s+13).z);this.addScenery(lights,s);
    }
    if(gap)this.addBox(g,this.cityMark,s+9.9,0,.035,w,.05,.35);
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
    return this.populateAuthoredSegment(s,end,gap,w,g);
    /* legacy city population retained for save compatibility; unreachable */
    const safe=s<this.roundData.firstSafeDistance||s>=this.roundData.length,lanes=[-w*.28,0,w*.28];
    const possible=[0,1,2].filter(i=>Math.abs(lanes[i]-this.lastSafeLane)<=4.5);
    const safeIndex=possible[Math.floor(this.rng()*possible.length)],safeLane=lanes[safeIndex],hazards=[];
    const urbanThemes=['castle_bridge','waterfalls','sunset','neon','workshop','storm','citadel','grand_run'];
    const cityRound=!!this.roundData.city;
    const cityPool=(cityRound||urbanThemes.includes(this.roundData.theme))
      ? ['car','taxi','van','bus','bollard','construction_barrier','roadroller']
      : ['traffic_cone','barrel','bollard','construction_barrier'];
    if(!safe&&!gap)for(let i=0;i<3;i++)if(i!==safeIndex&&this.rng()<.65*this.difficulty.obstacleDensityMultiplier){
      const cityChance=(cityRound||urbanThemes.includes(this.roundData.theme))?.72:.34;
      const useCity=this.rng()<cityChance;
      const type=useCity
        ? cityPool[Math.floor(this.rng()*cityPool.length)]
        : (this.roundData.features.hasJumps&&this.rng()<.45?'barrier':'crate');
      hazards.push({laneX:lanes[i],type});
    }
    const plan={roadWidth:w,speed:window.ScooterTuning.maxSpeed,minSpeed:this.roundData.baseSpeed*.9*window.ScooterTuning.cruiseMultiplier*window.ScooterTuning.brakeFactor,length:24,previousLane:this.lastSafeLane,safeLane,hazards,gapWidth:gap?2.4:0};
    if(!this.validator.validateLayout(plan))hazards.length=0;this.lastSafeLane=safeLane;
    for(const h of hazards){
      const m=this.factory.createObstacle(h.type,this.roundData.city),at=s+18,p=this.frame(at,h.laneX);
      m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);
      const movingTraffic=!!this.roundData.city&&['car','taxi','van','bus','roadroller'].includes(h.type)&&this.rng()<this.difficulty.movingTrafficChance;
      m.userData={...m.userData,id:`obs_${at}_${h.laneX}`,s:at,laneX:h.laneX,type:h.type,hit:false,
        isJumpable:['barrier','traffic_cone','construction_barrier'].includes(h.type),isCityObstacle:!['barrier','crate'].includes(h.type),
        isMoving:movingTraffic,baseLaneX:h.laneX,motionPhase:this.rng()*Math.PI*2,motionRate:.65+this.rng()*.35,motionAmplitude:movingTraffic?.38:0};
      m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(m);this.activeObstacles.push(m);
    }
    if(s<this.roundData.length){
      for(let i=0;i<5;i++){const at=s+3+i*4;if(gap&&at>s+9&&at<s+15)continue;this.addItem(this.factory.createCoin(),at,safeLane,1.05,{id:`coin_${at}`});this.totalCoins++;}
      if(!gap&&s%96===24){this.addItem(this.factory.createPowerup('overdrive'),s+7,safeLane,1.25,{id:`boost_${s}`,isPowerup:true,type:'overdrive'});}
      else if(!gap&&!safe&&this.rng()<.25){const type=['shield','magnet','double','heart','overdrive','magic_fruit','propulsor'][Math.floor(this.rng()*7)];this.addItem(this.factory.createPowerup(type),s+7,safeLane,1.25,{id:`power_${s}`,isPowerup:true,type});}
      if(!gap&&!safe&&this.rng()<this.difficulty.magicPickupChance)this.addItem(this.factory.createPowerup('magic_fruit'),s+11,safeLane,1.25,{id:`fruit_${s}`,isPowerup:true,type:'magic_fruit'});
      if(!gap&&!safe&&this.rng()<this.difficulty.propulsorChance)this.addItem(this.factory.createPowerup('propulsor'),s+15,safeLane,1.35,{id:`lift_${s}`,isPowerup:true,type:'propulsor'});
      if(!gap&&this.rng()<.16)this.addItem(this.factory.createGem(),s+9,safeLane,1.15,{id:`gem_${s}`,isGem:true});
      // Start at 61m in each city, in the validated safe lane. No extra RNG
      // calls: restoring an older run keeps its original obstacle sequence.
      if(!gap&&s%192===48)this.addItem(this.factory.createPowerup('antigravity'),s+13,safeLane,1.3,{id:`hover_${s}`,isPowerup:true,type:'antigravity'});
    }
    // Street walls on both sides enclose the playable route. Cross streets give
    // brief skyline reveals; the destination landmark is large enough to read.
    for(const side of [-1,1]){
      if(s%96!==48){
        const district=this.cityArt.district(this.roundData,(Math.floor(s/24)+(side>0?1:0))%3);
        const cp=this.frame(s+12,side*(w/2),0);
        district.position.set(cp.x,cp.y,cp.z);
        // frame lateral points to -X; local positive X always points away from the road.
        district.rotation.y=Math.atan2(this.getTrackTangent(s+12).x,this.getTrackTangent(s+12).z)+(side>0?Math.PI:0);
        this.addScenery(district,s);
      }
      if(s%192===48){
        const landmark=this.cityArt.landmark(this.roundData),p=this.frame(s+25,side*(w/2+23),-1);
        landmark.position.set(p.x,p.y,p.z);landmark.rotation.y=Math.atan2(this.getTrackTangent(s+25).x,this.getTrackTangent(s+25).z);
        this.addScenery(landmark,s);
      }
      if(s%96===72){
        const island=this.biomeArt.create(this.roundData),p=this.frame(s+12,side*(w/2+42),5);
        island.position.set(p.x,p.y,p.z);island.scale.setScalar(1.25);this.addScenery(island,s);
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
  captureState(){
    for(const m of this.activeCollectibles)if(m.userData.collected)this.collectedIDs.add(m.userData.id);
    return {seed:this.seed,rngState:this.rngState,nextSpawnS:this.nextSpawnS,lastSafeLane:this.lastSafeLane,
      difficulty:{...this.difficulty},totalCoins:this.totalCoins,simulationTime:this.simulationTime,
      segments:this.activeSegments.map(g=>g.userData.generation),collectedIDs:[...this.collectedIDs],
      obstacles:this.activeObstacles.map(o=>({id:o.userData.id,hit:o.userData.hit,roofAwarded:o.userData.roofAwarded}))};
  }
  restoreState(round,saved){
    this.buildRound(round,saved.seed);this.clearAll();
    this.collectedIDs=new Set(saved.collectedIDs||[]);
    for(const record of saved.segments){
      this.nextSpawnS=record.s;this.rngState=record.rngState;this.lastSafeLane=record.lastSafeLane;
      this.setDifficulty(record.difficulty);this.spawnNextSegment();
    }
    this.rngState=saved.rngState;this.nextSpawnS=saved.nextSpawnS;this.lastSafeLane=saved.lastSafeLane;
    this.setDifficulty(saved.difficulty);this.totalCoins=saved.totalCoins;
    this.simulationTime=saved.simulationTime||0;
    const states=new Map((saved.obstacles||[]).map(o=>[o.id,o]));
    for(const obs of this.activeObstacles)Object.assign(obs.userData,states.get(obs.userData.id)||{});
    this.updateMovingObjects();
  }
  update(s,dt=0){
    this.simulationTime+=dt;
    for(const m of this.activeCollectibles)if(m.userData.collected)this.collectedIDs.add(m.userData.id);
    const threshold=s-this.recycleBehindDistance;
    for(const g of this.activeSegments)if(g.userData.sEnd<threshold)g.traverse(m=>{if(m.isInstancedMesh)m.dispose();});
    super.update(s);
    this.updateMovingObjects();
  }
  updateMovingObjects(){
    const t=this.simulationTime;
    this.activeCollectibles.forEach(m=>{
      m.rotation.y=t*1.7;m.position.y=m.userData.baseY+Math.sin(t*2+m.userData.s)*.1;
      if(m.userData.type==='antigravity'){
        m.getObjectByName('antigravityOuterRing').rotation.y=t*2.6;
        m.getObjectByName('antigravityInnerRing').rotation.y=-t*3.4;
      }
    });
    // Traffic breathes and drifts within its own lane, creating a moving city
    // without invalidating the validator's guaranteed safe lane.
    for(const obs of this.activeObstacles){
      if(!obs.userData.isMoving)continue;
      const lane=obs.userData.baseLaneX+Math.sin(t*obs.userData.motionRate+obs.userData.motionPhase)*obs.userData.motionAmplitude;
      const p=this.frame(obs.userData.s,lane,0);
      obs.position.set(p.x,p.y,p.z);obs.rotation.y=Math.atan2(this.getTrackTangent(obs.userData.s).x,this.getTrackTangent(obs.userData.s).z);
      obs.userData.laneX=lane;
    }
    for(const city of this.sceneryObjects){
      if(!city.userData.dynamicCity)continue;
      city.position.y=city.userData.baseY+Math.sin(t*.75+city.userData.motionPhase)*.1;
      city.rotation.y=city.userData.baseRotationY+Math.sin(t*.42+city.userData.motionPhase)*.012;
    }
  }
  clearAll(){this.activeSegments.forEach(g=>g.traverse(m=>{if(m.isInstancedMesh)m.dispose();}));super.clearAll();}
};
