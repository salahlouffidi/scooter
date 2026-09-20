// Reference-inspired modular bridge art and bounded, physically checked generation.
window.TrackGenerator = class EnhancedTrack extends window.TrackGenerator {
  constructor(...args){
    super(...args);const T=this.THREE;
    this.boxGeometry=new T.BoxGeometry(1,1,1);
    this.stone=new T.MeshStandardMaterial({color:0xd9c6a5,roughness:.93});
    this.wood=new T.MeshStandardMaterial({color:0xa56e36,roughness:.8});
    this.darkWood=new T.MeshStandardMaterial({color:0x754f34,roughness:.85});
    this.pavers=[0xe3d0ad,0xdbc4a1,0xd1b997].map(color=>new T.MeshStandardMaterial({color,roughness:.94}));
    this.validator=new window.ReachabilityValidator();this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1};
    this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs=new Set();
  }
  buildRound(round,seed=Date.now()){
    this.difficulty={speedMultiplier:1,obstacleDensityMultiplier:1};this.totalCoins=0;this.lastSafeLane=0;this.collectedIDs.clear();
    super.buildRound(round,seed);
  }
  setDifficulty(c){this.difficulty={speedMultiplier:Math.max(.9,Math.min(1.1,c.speedMultiplier||1)),obstacleDensityMultiplier:Math.max(.65,Math.min(1.15,c.obstacleDensityMultiplier||1))};}
  speedMultiplierAt(s){return this.activeSegments.find(g=>s>=g.userData.sStart&&s<g.userData.sEnd)?.userData.speedMultiplier||1;}
  getTrackPoint(s){const p=super.getTrackPoint(s);p.y=4.5*(Math.cos(s*Math.PI/95)-1);return p;}
  getTrackGrade(s){return -4.5*Math.PI/95*Math.sin(s*Math.PI/95);}
  frame(s,lateral=0,y=0){const p=this.getTrackPoint(s),t=this.getTrackTangent(s);return {x:p.x-t.z*lateral,y:p.y+y,z:p.z+t.x*lateral};}
  addBox(g,mat,s,lateral,y,w,h,len){const p=this.frame(s,lateral,y),m=new this.THREE.Mesh(this.boxGeometry,mat);m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(s).x,this.getTrackTangent(s).z);m.rotation.order="YXZ";m.rotation.x=-Math.atan(this.getTrackGrade(s));m.scale.set(w,h,len);m.receiveShadow=true;m.castShadow=true;g.add(m);return m;}
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
        const p=this.frame(at,(col-1.5)*(w/4),.015),o=new T.Object3D();o.position.set(p.x,p.y,p.z);o.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);o.rotation.order="YXZ";o.rotation.x=-Math.atan(this.getTrackGrade(at));o.scale.set(w/4-.06,.06,1.43);o.updateMatrix();transforms.push(o.matrix);
      }
      const tiles=new T.InstancedMesh(this.boxGeometry,this.pavers[shade],transforms.length);transforms.forEach((m,i)=>tiles.setMatrixAt(i,m));tiles.receiveShadow=true;g.add(tiles);
    }
    for(const side of [-1,1]){
      for(let i=0;i<6;i++){const at=s+i*4+2;this.addBox(g,this.wood,at,side*(w/2-.17),.77,.25,.24,4.05);this.addBox(g,this.darkWood,at,side*(w/2-.17),.34,.17,.14,4.05);}
      for(let i=0;i<6;i++)this.addBox(g,this.wood,s+i*4,side*(w/2-.17),.52,.34,1.05,.34);
    }
    if(gap)this.addBox(g,this.wood,s+9.9,0,.07,w,.05,.7);
    this.populateSegment(s,s+24,gap,w,g);
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
    if(!safe&&!gap)for(let i=0;i<3;i++)if(i!==safeIndex&&this.rng()<.65*this.difficulty.obstacleDensityMultiplier)hazards.push({laneX:lanes[i],type:this.roundData.features.hasJumps&&this.rng()<.45?'barrier':'crate'});
    const plan={roadWidth:w,speed:window.ScooterTuning.maxSpeed,minSpeed:this.roundData.baseSpeed*.9*window.ScooterTuning.cruiseMultiplier*window.ScooterTuning.brakeFactor,length:24,previousLane:this.lastSafeLane,safeLane,hazards,gapWidth:gap?2.4:0};
    if(!this.validator.validateLayout(plan))hazards.length=0;this.lastSafeLane=safeLane;
    for(const h of hazards){const m=this.factory.createObstacle(h.type),at=s+18,p=this.frame(at,h.laneX);m.position.set(p.x,p.y,p.z);m.rotation.y=Math.atan2(this.getTrackTangent(at).x,this.getTrackTangent(at).z);m.userData={id:`obs_${at}_${h.laneX}`,s:at,laneX:h.laneX,type:h.type,hit:false,isJumpable:h.type==='barrier'};m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(m);this.activeObstacles.push(m);}
    if(s<this.roundData.length){
      for(let i=0;i<5;i++){const at=s+3+i*4;if(gap&&at>s+9&&at<s+15)continue;this.addItem(this.factory.createCoin(),at,safeLane,1.05,{id:`coin_${at}`});this.totalCoins++;}
      if(!gap&&s%96===24){this.addItem(this.factory.createPowerup('overdrive'),s+7,safeLane,1.25,{id:`boost_${s}`,isPowerup:true,type:'overdrive'});}
      else if(!gap&&!safe&&this.rng()<.25){const type=['shield','magnet','double','heart','overdrive'][Math.floor(this.rng()*5)];this.addItem(this.factory.createPowerup(type),s+7,safeLane,1.25,{id:`power_${s}`,isPowerup:true,type});}
      if(!gap&&this.rng()<.16)this.addItem(this.factory.createGem(),s+9,safeLane,1.15,{id:`gem_${s}`,isGem:true});
    }
    for(const side of [-1,1]){
      const at=s+10+this.rng()*8,offset=side*(w/2+9+this.rng()*5),p=this.frame(at,offset,-3-this.rng()*2);
      const island=this.factory.createFloatingIsland(null,null,5.5+this.rng()*2);island.position.set(p.x,p.y,p.z);this.addScenery(island,s);
      if((Math.floor(s/24)+(side>0?1:0))%3===0){const castle=this.factory.createCastleTower();castle.scale.setScalar(.7);castle.position.set(p.x,p.y+1,p.z);this.addScenery(castle,s);}
      if(window.louffiKit){
        const fall=window.louffiKit.getObjectByName('Waterfall').clone(true);fall.position.set(p.x-side*4.5,p.y+.3,p.z-1);fall.rotation.y=Math.PI/2;this.addScenery(fall,s);
        const cloud=window.louffiKit.getObjectByName('Cloud').clone(true);cloud.position.set(p.x+side*24,12+this.rng()*9,p.z+20);cloud.scale.setScalar(.9+this.rng()*.6);this.addScenery(cloud,s);
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
