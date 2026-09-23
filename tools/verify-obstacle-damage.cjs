// Real generated meshes -> swept controller collisions -> production health/scoring handler.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = global; global.THREE = require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage = {data: {}, getItem(k) {return this.data[k] || null;}, setItem(k,v) {this.data[k]=v;}, removeItem(k) {delete this.data[k];}};
const root = path.resolve(__dirname, '../app/src/main/assets/game');
global.fetch = async () => ({ok: true, arrayBuffer: async () => {const b = fs.readFileSync(root + '/models/louffi-world.glb'); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
for (const name of ['visualKit','kitLoader','storage','rounds','arcadeEffects','reachability','assetFactory','trackGenerator']) require(root + '/js/' + name + '.js');
const BaseTrack = TrackGenerator;
for (const name of ['biomeArt','cityArt','enhancedTrack','controller','game','runSession']) require(root + '/js/' + name + '.js');
const types = ['crate','barrier','bollard','traffic_cone','construction_barrier','barrel','car','taxi','van','bus','roadroller','gate'];
const validBounds = o => {const c=o.userData.collision; assert(c && ['halfWidth','halfLength','top'].every(k=>Number.isFinite(c[k])&&c[k]>0), `${o.userData.type}: missing collision bounds`);};

(async () => {
  await loadLouffiKit(); assert.equal(louffiAssetStatus,'GLB loaded');
  const factory = new AssetFactory(THREE), track = new TrackGenerator(new THREE.Scene(),factory,THREE);
  const rider = new RiderController(factory.createRiderWithScooter(),track);
  const input = {horizontalSteer:0,verticalSteer:0,isBraking:false,isJumpHeld:false,consumeJump:()=>false};
  const events = [], labels = [];
  const game = Object.assign(Object.create(SkyScooterGame.prototype),{
    riderCtrl:rider,trackGen:track,currentRoundId:1,isEndless:false,currentRunTxId:'obstacle_test',
    hasActiveRun:true,mlWindowTimer:0,mlWindowFeaturesSnapshot:null,
    showFloatingLabel:text=>labels.push(text),vibrate(){},arcadeEffects:{burst(){}},
    triggerGameOver(){this.state='GAME_OVER';this.hasActiveRun=false;}
  });
  function freshScore(score=300) {
    Object.assign(game,{state:'PLAYING',hearts:3,maxHearts:3,score,obstaclePenaltyScore:0,
      distanceScore:0,coinScore:0,gemScore:0,jumpScore:0,consecutiveCoins:12,coinMultiplier:2,
      coinsCollectedThisRun:0,totalSpawnedCoinsEstimate:50,mlWindowHadDamage:false,hasActiveRun:true});
    events.length=0;labels.length=0;input.horizontalSteer=0;
  }
  const onEvent=(e,p)=>{events.push(e);game.onGameplayEvent(e,p);};
  function tick(count=1,dt=1/120) {
    for(let i=0;i<count;i++){rider.update(dt,input,20,track.roundData.roadWidth,onEvent);track.simulationTime+=dt;track.updateMovingObjects();}
  }
  function front(o,score=300) {
    validBounds(o);o.userData.hit=false;o.userData.roofAwarded=false;track.activeObstacles=[o];track.activeCollectibles=[];
    rider.reset(o.userData.s-o.userData.collision.halfLength-.95,28);rider.laneX=o.userData.laneX;rider.updateMeshTransform();freshScore(score);
  }
  function lostOnce(label,expectedScore=250) {
    assert.equal(game.hearts,2,label+' costs one heart');assert.equal(game.score,expectedScore,label+' loses points');
    assert.equal(events.filter(e=>e==='hit_obstacle').length,1,label+' generates one damage event');
    assert.equal(game.coinMultiplier,1);assert.equal(game.consecutiveCoins,0);assert(game.mlWindowHadDamage);
  }
  let generated=0,moving=0;
  for(const round of ROUNDS_DATA) {
    track.buildRound(round,123);track.update(240,1.2);
    const obstacles=[...track.activeObstacles];assert(obstacles.length,round.name+' has hazards');
    for(const o of obstacles){front(o);tick(24);lostOnce(round.name+' '+o.userData.type);generated++;if(o.userData.isMoving)moving++;}
    // Resume must reconstruct collision bounds, preserve prior hits, and retain deducted score.
    const savedTrack=JSON.parse(JSON.stringify(track.captureState()));
    const restored=new TrackGenerator(new THREE.Scene(),factory,THREE);restored.restoreState(round,savedTrack);
    restored.activeObstacles.forEach(validBounds);restored.clearAll();
  }
  assert(moving>0,'moving hazards were exercised');
  const baseTrack=new BaseTrack(new THREE.Scene(),factory,THREE);baseTrack.buildRound(ROUNDS_DATA[0],123);baseTrack.update(300);
  assert(baseTrack.activeObstacles.length);baseTrack.activeObstacles.forEach(validBounds);baseTrack.clearAll();
  track.buildRound(ROUNDS_DATA[0],123);track.activeSegments=[];track.activeCollectibles=[];
  track.getTrackPoint=s=>({x:0,y:0,z:s});track.getTrackGrade=()=>0;track.getTrackTangent=()=>({x:0,y:0,z:1});
  const make=type=>{const o=factory.createObstacle(type);Object.assign(o.userData,{id:type+'_20',s:20,laneX:0,type,hit:false});o.position.set(0,0,20);return o;};
  for(const useGLB of [true,false]) {
    const kit=global.louffiKit;if(!useGLB)global.louffiKit=null;
    // A fresh factory prevents its GLB crate cache from hiding fallback coverage.
    const f=new AssetFactory(THREE);
    for(const type of types){
      const o=f.createObstacle(type);Object.assign(o.userData,{id:type+'_20',s:20,laneX:0,type,hit:false});
      front(o);rider.applyPowerup('overdrive');tick(12,.06);lostOnce(type+' turbo front');
      assert(rider.s<20-o.userData.collision.halfLength-.39,'no tunneling through '+type);
      tick(300);lostOnce(type+' held contact');
      front(o);rider.s=20;rider.laneX=o.userData.collision.halfWidth+.37;rider.forwardSpeed=0;rider.lateralVelocity=-9;input.horizontalSteer=-1;
      tick(2);lostOnce(type+' side');
      front(o);rider.s=20;rider.forwardSpeed=0;rider.y=o.userData.collision.top+.1;rider.verticalVelocity=-2;rider.isGrounded=false;
      let supported=false;for(let i=0;i<10;i++){tick();supported ||= rider.supportId===o.userData.id;}
      lostOnce(type+' top');assert(supported,'solid support after landing on '+type);
      assert.equal(game.jumpScore,0,'contact cannot earn a clear-jump reward');
      front(o);rider.applyPowerup('shield');tick(30);assert.equal(game.hearts,3);assert.equal(game.score,300);assert(!rider.activeShield);assert(events.includes('shield_absorbed'));
      front(o);rider.applyPowerup('magic_fruit');tick(30);assert.equal(game.hearts,3);assert.equal(game.score,300);assert.equal(rider.faultGuardCharges,1);assert(events.includes('magic_fault_guard'));
    }
    global.louffiKit=kit;
  }
  const o=make('crate');front(o,20);tick(24);lostOnce('low score',0);assert.equal(game.obstaclePenaltyScore,20);
  front(o,0);tick(24);lostOnce('zero score',0);assert.equal(game.obstaclePenaltyScore,0);
  front(o);rider.y=5;rider.isGrounded=false;tick(40);assert.equal(game.hearts,3);assert(!events.includes('hit_obstacle'));assert.equal(game.jumpScore,50,'fully clearing an obstacle still earns a bonus');
  front(o);rider.applyPowerup('antigravity');tick(24);lostOnce('grounded antigravity');
  front(o);rider.applyPowerup('propulsor');tick(24);assert.equal(game.hearts,3);assert(!events.includes('hit_obstacle'),'high flight clears the obstacle');
  front(o);game.hearts=1;tick(24);assert.equal(game.hearts,0);assert.equal(game.score,250);assert.equal(game.state,'GAME_OVER');
  game.onGameplayEvent('coin',rider.mesh.position);game.onGameplayEvent('heart_pickup');game.onGameplayEvent('hit_obstacle');
  assert.equal(game.score,250);assert.equal(game.hearts,0,'terminal state cannot lose extra hearts or collect rewards');
  // Use an authored section so this is a valid, reconstructable saved game.
  delete track.getTrackPoint;delete track.getTrackGrade;delete track.getTrackTangent;
  track.buildRound(ROUNDS_DATA[0],123);track.update(240);
  const savedObstacle=track.activeObstacles.find(o=>!o.userData.isMoving);
  front(savedObstacle);tick(24);
  assert(game.saveActiveRun());const saved=GameStorage.getRun();assert.equal(saved.stats.score,250);assert.equal(saved.stats.obstaclePenaltyScore,50);
  track.restoreState(ROUNDS_DATA[0],saved.track);rider.restoreState(saved.rider);
  const restoredObstacle=track.activeObstacles.find(o=>o.userData.id===savedObstacle.userData.id);
  assert(restoredObstacle?.userData.hit,'the hit obstacle is reconstructed with its damage already charged');
  tick(300);lostOnce('resumed contact');
  console.log(`PASS obstacle damage: ${generated} generated hazards across all 16 worlds (${moving} moving), base generator, all ${types.length} GLB/fallback types, front/side/top/turbo hits, one-hit protection, shield/guard, clean jumps, hover/flight, score floor, terminal state and save persistence.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
