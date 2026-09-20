// Real geometry, asset-loading, generator and ML checks without a browser/GPU.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
global.window=global;global.THREE=require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage={data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};
const base=path.resolve(__dirname,'../app/src/main/assets/game');
global.fetch=async()=>({ok:true,arrayBuffer:async()=>{const b=fs.readFileSync(base+'/models/louffi-world.glb');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
['visualKit','kitLoader','storage','rounds','arcadeEffects','reachability','adaptiveML','assetFactory','trackGenerator','enhancedTrack','controller'].forEach(n=>require(base+'/js/'+n+'.js'));
(async()=>{
 await loadLouffiKit();assert.equal(louffiAssetStatus,'GLB loaded');
 for(const n of ['RiderScooter','Island','Castle','Tree','Cloud','Waterfall','Crate'])assert(louffiKit.getObjectByName(n),n);
 louffiKit.traverse(m=>{if(m.isMesh){assert(m.geometry.attributes.position.array.every(Number.isFinite));assert(m.geometry.attributes.normal.array.every(Number.isFinite));}});
 const scene=new THREE.Scene(),factory=new AssetFactory(THREE),track=new TrackGenerator(scene,factory,THREE);
 const validator=new ReachabilityValidator();
 assert(!validator.validateLayout({gapWidth:20,speed:14.85,length:24,roadWidth:8,previousLane:0,safeLane:0,hazards:[]}));
 let gapCount=0;
 for(const round of ROUNDS_DATA){
  track.buildRound(round,123);
  track.setDifficulty({speedMultiplier:1.05,obstacleDensityMultiplier:1.15});
  for(let s=0;s<round.length;s+=24){track.update(s);for(const seg of track.activeSegments){if(seg.userData.isGap){assert.equal(Math.round((seg.userData.gapEnd-seg.userData.gapStart)*10),24);gapCount++;}}}
  assert(track.activeSegments.length<14);assert(track.sceneryObjects.length<100);assert(track.totalCoins>0);
 }
 track.buildRound(ROUNDS_DATA[2],55);track.setDifficulty({speedMultiplier:1.05,obstacleDensityMultiplier:1.15});track.update(240);
 assert(track.activeSegments.some(s=>s.userData.speedMultiplier===1.05));
 const rider=new RiderController(factory.createRiderWithScooter(),track);
 track.buildRound(ROUNDS_DATA[2],55);track.update(96);
 const gap=track.activeSegments.find(x=>x.userData.isGap).userData;
 rider.reset(gap.gapStart-1,7.5);let jump=true,falls=0;
 const input={horizontalSteer:0,isBraking:true,consumeJump(){const r=jump;jump=false;return r;}};
 for(let i=0;i<90;i++)rider.update(1/120,input,10,8,e=>{if(e==='fall')falls++;});
 assert.equal(falls,0,'2.4m gap clears at braking speed');assert(rider.s>gap.gapEnd);
 // Responsive steering, release/reversal, slope-relative pickups and bounded turbo.
 track.buildRound(ROUNDS_DATA[0],55);track.activeObstacles=[];
 const controls={horizontalSteer:1,isBraking:false,consumeJump:()=>false};
 rider.reset(0,12.5);
 for(let i=0;i<12;i++)rider.update(1/120,controls,10,8);
 assert(rider.lateralVelocity>7.8,'full steering response within 100ms');
 controls.horizontalSteer=-1;
 for(let i=0;i<12;i++)rider.update(1/120,controls,10,8);
 assert(rider.lateralVelocity < -6.8,'rapid direction reversal');
 controls.horizontalSteer=0;
 for(let i=0;i<24;i++)rider.update(1/120,controls,10,8);
 assert(Math.abs(rider.lateralVelocity)<.03,'release stops sideways drift');
 rider.reset(40,12.5);for(let i=0;i<60;i++)rider.update(1/120,controls,10,8);
 assert(rider.forwardSpeed>16,'downhill accelerates');
 rider.applyPowerup('overdrive');for(let i=0;i<60;i++)rider.update(1/120,controls,10,8);
 assert(rider.forwardSpeed>23 && rider.forwardSpeed<=ScooterTuning.maxSpeed);
 controls.isBraking=true;for(let i=0;i<60;i++)rider.update(1/120,controls,10,8);
 assert(rider.forwardSpeed<19,'brake works during turbo');controls.isBraking=false;
 const item=track.activeCollectibles.find(m=>m.userData.s===31&&m.userData.type==='overdrive');
 assert(item,'early guaranteed turbo pickup');
 rider.reset(31,12.5);rider.laneX=item.userData.laneX;rider.updateMeshTransform();
 rider.checkCollisions(30,32);assert(item.userData.collected&&rider.activeOverdrive,'collect pickup on slope');
 assert(Math.abs(rider.mesh.position.y-track.getTrackPoint(31).y)<.001);
 const fx=new ArcadeEffects(scene,THREE);fx.burst(rider.mesh.position,32);
 fx.update(1/60,rider,track,{graphicsQuality:'high'},true);assert(fx.stars.count>0);assert.equal(fx.wind.geometry.drawRange.count,96);
 fx.update(1/60,rider,track,{reducedMotion:true},true);assert.equal(fx.wind.geometry.drawRange.count,0);
 fx.reset();assert.equal(fx.stars.count,0);assert(!fx.root.visible);
 const ml=new AdaptiveDifficultyML();assert.equal(ml.selectCandidate(ROUNDS_DATA[0],{hearts:3},validator).speedMultiplier,1);
 const features=new Array(10).fill(.5);for(let i=0;i<32;i++)ml.examples.push({features,label:i%4?1:0});
 const before=Array.from(ml.weights);ml.trainBatch();assert(ml.weights.some((v,i)=>v!==before[i]));ml.save();assert.equal(new AdaptiveDifficultyML().examples.length,32);
 const chosen=ml.selectCandidate(ROUNDS_DATA[0],{hearts:3},validator);assert(Number.isFinite(chosen.speedMultiplier));
 GameStorage.saveSettings({adaptiveDifficulty:false});const disabled=Array.from(ml.weights);ml.recordWindowOutcome(features,{},true);assert.deepEqual(Array.from(ml.weights),disabled);
 console.log('PASS: GLB parsing/geometry, seven named assets, 16 rounds, bounded active objects, responsive steering/reversal/release, downhill/turbo/brake speeds, sloped pickups, pooled effects/reduced motion, jump physics, ML training/persistence/OFF. Gap checks:',gapCount);
})().catch(e=>{console.error(e);process.exitCode=1;});
