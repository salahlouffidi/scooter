// Real geometry, asset-loading, generator and ML checks without a browser/GPU.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
global.window=global;global.THREE=require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage={data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};
const base=path.resolve(__dirname,'../app/src/main/assets/game');
global.fetch=async()=>({ok:true,arrayBuffer:async()=>{const b=fs.readFileSync(base+'/models/louffi-world.glb');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
['visualKit','kitLoader','storage','rounds','reachability','adaptiveML','assetFactory','trackGenerator','enhancedTrack','controller'].forEach(n=>require(base+'/js/'+n+'.js'));
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
 const ml=new AdaptiveDifficultyML();assert.equal(ml.selectCandidate(ROUNDS_DATA[0],{hearts:3},validator).speedMultiplier,1);
 const features=new Array(10).fill(.5);for(let i=0;i<32;i++)ml.examples.push({features,label:i%4?1:0});
 const before=Array.from(ml.weights);ml.trainBatch();assert(ml.weights.some((v,i)=>v!==before[i]));ml.save();assert.equal(new AdaptiveDifficultyML().examples.length,32);
 const chosen=ml.selectCandidate(ROUNDS_DATA[0],{hearts:3},validator);assert(Number.isFinite(chosen.speedMultiplier));
 GameStorage.saveSettings({adaptiveDifficulty:false});const disabled=Array.from(ml.weights);ml.recordWindowOutcome(features,{},true);assert.deepEqual(Array.from(ml.weights),disabled);
 console.log('PASS: GLB parsing/geometry, seven named assets, 16 rounds, bounded active objects, real speed application, jump physics, ML training/persistence/OFF. Gap checks:',gapCount);
})().catch(e=>{console.error(e);process.exitCode=1;});
