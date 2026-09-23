const assert=require('node:assert/strict'),path=require('node:path');
global.window=global;global.THREE=require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage={data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};
const base=path.resolve(__dirname,'../app/src/main/assets/game/js');
for(const n of ['storage','rounds','arcadeEffects','reachability','camera','assetFactory','trackGenerator','biomeArt','cityArt','enhancedTrack','controller'])require(`${base}/${n}.js`);
const scene=new THREE.Scene(),factory=new AssetFactory(THREE),track=new TrackGenerator(scene,factory,THREE);
track.buildRound(ROUNDS_DATA[1],917);
const picked=track.activeCollectibles[0];picked.userData.collected=true;
track.setDifficulty({speedMultiplier:1.05,obstacleDensityMultiplier:.8,movingTrafficChance:.6});track.update(270,1.7);
const saved=JSON.parse(JSON.stringify(track.captureState()));
const layout=t=>t.activeObstacles.map(o=>({...o.userData}));
const initial=layout(track),copy=new TrackGenerator(new THREE.Scene(),factory,THREE);copy.restoreState(ROUNDS_DATA[1],saved);
assert.deepEqual(layout(copy),initial,'visible layout and motion phases restored');
assert.equal(copy.simulationTime,track.simulationTime);assert.equal(copy.totalCoins,track.totalCoins);
assert(copy.collectedIDs.has(picked.userData.id));
track.update(390,.7);copy.update(390,.7);assert.deepEqual(layout(copy),layout(track),'future RNG and ML difficulty resume exactly');

// Isolate an actual factory car on a flat road; test visible roof height, not a guessed hit radius.
track.getTrackPoint=s=>({x:0,y:0,z:s});track.getTrackGrade=()=>0;track.getTrackTangent=()=>({x:0,y:0,z:1});
track.activeSegments=[];track.activeCollectibles=[];
function obstacle(type,s=12){const o=factory.createObstacle(type);o.userData={...o.userData,id:`${type}_${s}`,s,laneX:0,type,hit:false};o.position.set(0,0,s);return o;}
let car=obstacle('car');track.activeObstacles=[car];
const rider=new RiderController(factory.createRiderWithScooter(),track);
let jump=false;const input={horizontalSteer:0,verticalSteer:0,isBraking:false,consumeJump(){const p=jump;jump=false;return p;}};
const events=[];const event=e=>events.push(e);
rider.reset(9,12.5);for(let i=0;i<300;i++)rider.update(1/120,input,10,9,event);
assert(rider.s<12-car.userData.collision.halfLength-.39,'solid car stops forward penetration even after damage immunity expires');
assert.equal(events.filter(e=>e==='hit_obstacle').length,1,'one collision cannot drain every heart');
input.horizontalSteer=1;for(let i=0;i<50;i++)rider.update(1/120,input,10,9,event);
assert(rider.s>12,'steering frees the rider from a solid front');input.horizontalSteer=0;

car=obstacle('car');track.activeObstacles=[car];rider.reset(2,12.5);jump=true;events.length=0;
let landed=false;
for(let i=0;i<200;i++){
 rider.update(1/120,input,10,9,event);
 if(rider.supportId){landed=true;assert(Math.abs(rider.y-car.userData.collision.top)<1e-6,'wheels rest on mesh roof');}
}
assert(landed,'descending jump lands on the car roof');
assert.equal(events.filter(e=>e==='hit_obstacle').length,1,'landing on an obstacle counts as one hit');
assert(!events.includes('jump_challenge'),'touching the roof cannot award a clean-jump bonus');
assert(rider.s>14&&rider.y===0,'rider drops back to the road after leaving roof');

for(const type of ['crate','car','taxi','van','bus','roadroller']){
 const o=obstacle(type,20);track.activeObstacles=[o];rider.reset(17-o.userData.collision.halfLength,28);rider.applyPowerup('overdrive');events.length=0;
 for(let i=0;i<20;i++)rider.update(.06,input,20,9,event);
 assert(rider.s<20-o.userData.collision.halfLength-.39,`${type}: no turbo tunneling`);
 rider.reset(20,12);rider.y=o.userData.collision.top+.1;rider.verticalVelocity=-2;rider.isGrounded=false;events.length=0;
 for(let i=0;i<5;i++)rider.update(1/120,input,10,9,event);
 assert.equal(rider.supportId,o.userData.id,`${type}: roof supports landing`);
 const state=JSON.parse(JSON.stringify(rider.captureState()));const other=new RiderController(factory.createRiderWithScooter(),track);other.restoreState(state);
 assert.deepEqual(other.captureState(),state,'airborne/roof and power-up state survives serialization');
}
const session={version:1,roundId:2,runId:'test_run',stats:{hearts:2,score:420},rider:rider.captureState(),track:saved};
GameStorage.saveRun(session);assert.equal(GameStorage.getRun().runId,'test_run');assert.equal(GameStorage.getRun().stats.score,420);GameStorage.clearRun();assert.equal(GameStorage.getRun(),null);
localStorage.setItem(GameStorage.KEYS.ACTIVE_RUN,'{broken');assert.equal(GameStorage.getRun(),null);

// Verify crate visual appearance, collision bounds, shadows and hazard markings
const crateObs = factory.createObstacle('crate');
assert(crateObs.userData.collision, 'crate has computed collision bounds');
assert(crateObs.userData.collision.halfWidth >= 0.55 && crateObs.userData.collision.halfWidth <= 0.65, 'crate halfWidth believable ~0.6m');
assert(crateObs.userData.collision.halfLength >= 0.55 && crateObs.userData.collision.halfLength <= 0.65, 'crate halfLength believable ~0.6m');
assert(crateObs.userData.collision.top >= 1.15 && crateObs.userData.collision.top <= 1.25, 'crate top height believable ~1.2m');
let crateMeshCount = 0, crateHasYellow = false, crateHasBlack = false, crateCastCount = 0;
crateObs.traverse(m => {
  if (m.isMesh) {
    crateMeshCount++;
    if (m.castShadow) crateCastCount++;
    const col = m.material?.color?.getHex();
    if (col === 0xffb300) crateHasYellow = true;
    if (col === 0x212121) crateHasBlack = true;
  }
});
assert(crateMeshCount >= 10, 'crate is a detailed road hazard with multiple structural panels');
assert.equal(crateCastCount, crateMeshCount, 'all crate components cast shadows');
assert(crateHasYellow && crateHasBlack, 'crate features high-visibility hazard warning stripes');

// Test procedural fallback crate (without louffiKit)
const savedKit = window.louffiKit;
window.louffiKit = null;
const proceduralCrate = new AssetFactory(THREE).createObstacle('crate');
window.louffiKit = savedKit;
assert(proceduralCrate.userData.collision, 'procedural fallback crate has collision bounds');
assert(proceduralCrate.userData.collision.halfWidth >= 0.55 && proceduralCrate.userData.collision.halfWidth <= 0.65, 'fallback crate width ~0.6m');
assert(proceduralCrate.userData.collision.top >= 1.15 && proceduralCrate.userData.collision.top <= 1.25, 'fallback crate top ~1.2m');

// Production scoring/combo/health coverage lives in verify-obstacle-damage.cjs.

const cam = new GameCamera(new THREE.PerspectiveCamera(), THREE);
cam.reset(rider.mesh, track);
cam.shake(0.24, 0.28);
assert(cam.shakeIntensity > 0 && cam.shakeTimer > 0, 'camera shake initializes with trauma');
cam.update(0.1, rider.mesh, track, false, {reducedMotion: false});
assert(cam.shakeTimer < 0.28, 'camera shake decays over time');
cam.update(0.1, rider.mesh, track, false, {reducedMotion: true});
cam.reset(rider.mesh, track);
assert.equal(cam.shakeTimer, 0, 'camera reset zeroes shake');

// Test ScreenShake utility in arcadeEffects.js
assert(window.ScreenShake, 'ScreenShake class exported on window');
const ss = new window.ScreenShake(THREE);
assert.equal(ss.offset.x, 0); assert.equal(ss.offset.y, 0); assert.equal(ss.offset.z, 0);
ss.trigger(0.18, 0.22);
assert(ss.intensity <= 0.26 && ss.intensity >= 0.16, 'screen shake applies low-intensity impulse');
assert.equal(ss.duration, 0.22, 'duration set accurately');
// Safe bounds test: large impulses must be bounded so player steering is never disrupted
ss.trigger(5.0, 2.0);
assert(ss.intensity <= 0.26, 'impulse strictly clamped at safe upper bound (maxIntensity <= 0.26)');
const testCam = new THREE.PerspectiveCamera();
testCam.position.set(0, 5, -10);
const prePos = testCam.position.clone();
ss.update(0.05, {reducedMotion: false}, testCam);
assert(!testCam.position.equals(prePos), 'screen shake displaces camera position');
assert(Math.abs(ss.offset.x) <= 0.26 && Math.abs(ss.offset.y) <= 0.26, 'displacement bounded within low-intensity limits');
// Accessibility check: reduced motion clears shake
ss.update(0.05, {reducedMotion: true}, testCam);
assert.equal(ss.offset.x, 0); assert.equal(ss.offset.y, 0); assert.equal(ss.offset.z, 0);

// ArcadeEffects integration test
const fxWithShake = new ArcadeEffects(scene, THREE);
fxWithShake.setCamera(testCam);
fxWithShake.triggerScreenShake(0.18, 0.22);
assert(fxWithShake.screenShake.timer > 0, 'arcadeEffects triggers screen shake');
fxWithShake.update(0.016, rider, track, {reducedMotion: false}, true, testCam);
assert(fxWithShake.screenShake.timer < 0.22, 'arcadeEffects updates screen shake');
fxWithShake.reset();
assert.equal(fxWithShake.screenShake.timer, 0, 'arcadeEffects reset zeroes screen shake');

console.log('PASS: durable layout/RNG/ML state, collected IDs, car body blocking, one-hit damage, steering escape, roof landing and exit, turbo collision sweeps, saved roof state, corrupted save recovery, camera shake & arcadeEffects ScreenShake utility.');
