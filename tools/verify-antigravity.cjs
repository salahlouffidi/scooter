// Exercise the shipped GLB, real pickups, physics and effects without a GPU.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
global.window = global;
global.THREE = require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage = {getItem: () => null, setItem() {}};
const base = path.resolve(__dirname, '../app/src/main/assets/game');
global.fetch = async () => ({ok: true, arrayBuffer: async () => {
  const b = fs.readFileSync(base + '/models/louffi-world.glb');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}});
for (const name of ['visualKit','kitLoader','storage','rounds','arcadeEffects','reachability',
  'assetFactory','trackGenerator','biomeArt','cityArt','enhancedTrack','controller']) require(base + '/js/' + name + '.js');
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

(async () => {
  await loadLouffiKit(); assert.equal(louffiAssetStatus, 'GLB loaded');
  const scene = new THREE.Scene(), factory = new AssetFactory(THREE), track = new TrackGenerator(scene, factory, THREE);
  for (const round of ROUNDS_DATA) {
    track.buildRound(round, 42);
    const pickup = track.activeCollectibles.find(p => p.userData.type === 'antigravity' && p.userData.s === 61);
    assert(pickup, `city ${round.id} has an early hover pickup`);
    track.update(0, .5);
    const a = pickup.getObjectByName('antigravityOuterRing'), b = pickup.getObjectByName('antigravityInnerRing');
    assert(a.rotation.y > 0 && b.rotation.y < 0, 'gyroscope rings counterrotate');
  }
  const rider = new RiderController(factory.createRiderWithScooter(), track);
  const input = {horizontalSteer: 0, verticalSteer: 0, isBraking: false, isJumpHeld: false, consumeJump: () => false};
  const events = [], event = e => events.push(e);
  const step = (n = 1, dt = 1 / 120) => { for (let i = 0; i < n; i++) rider.update(dt, input, 10, 9, event); };
  const pickup = track.activeCollectibles.find(p => p.userData.type === 'antigravity');
  rider.reset(pickup.userData.s, 12.5); rider.laneX = pickup.userData.laneX; rider.updateMeshTransform();
  rider.checkCollisions(rider.s - .1, rider.s + .1, event);
  assert(pickup.userData.collected && rider.activeAntigravity, 'real pickup activates hover');
  assert.equal(rider.antigravityTimer, 8); assert(events.includes('antigravity_launch'));
  track.update(rider.s, 0);
  const restoredTrack = new TrackGenerator(new THREE.Scene(), factory, THREE);
  restoredTrack.restoreState(track.roundData, JSON.parse(JSON.stringify(track.captureState())));
  assert(!restoredTrack.activeCollectibles.some(p => p.userData.id === pickup.userData.id), 'collected hover pickup stays gone after Resume');

  // Isolate dynamics on a flat road, then exercise real car bounds separately.
  track.getTrackPoint = s => ({x: 0, y: 0, z: s});
  track.getTrackGrade = () => 0; track.getTrackTangent = () => ({x: 0, y: 0, z: 1});
  track.activeObstacles = []; track.activeCollectibles = []; track.activeSegments = [];
  rider.reset(); assert.equal(rider.activeAntigravity, false); assert.equal(rider.antigravityTimer, 0);
  rider.applyPowerup('antigravity', event); step(1, .016);
  assert(rider.y > .1 && rider.y < .33, 'physical hover lifts the scooter above the road');
  step(60);
  assert(rider.mesh.userData.hoverRing.visible);
  for (const key of ['frontWheel','backWheel']) assert(Math.abs(rider.mesh.userData[key].rotation.z) > 1.5, 'GLB wheels fold sideways');
  let jump = true; input.consumeJump = () => { const value = jump; jump = false; return value; };
  step(); assert(!rider.isGrounded && rider.verticalVelocity > 0);
  const v0 = rider.verticalVelocity;
  step(12); // .1 seconds in actual substeps; update() intentionally caps a stalled frame at .06.
  near(v0 - rider.verticalVelocity, 22 * .22 * .1, 'moon gravity is 22%');
  rider.y = 5; rider.verticalVelocity = -5; input.isJumpHeld = true; step(12);
  near(rider.verticalVelocity, -1.4, 'held Jump caps glider fall speed'); assert(rider.isGliding);
  input.isJumpHeld = false; step(12); assert(rider.verticalVelocity < -1.8 && !rider.isGliding, 'release resumes descent');

  rider.reset(); input.horizontalSteer = 1; step(1, .016); const normalSteer = rider.lateralVelocity;
  rider.reset(); rider.applyPowerup('antigravity'); step(1, .016);
  assert(rider.lateralVelocity > normalSteer * 1.9, 'hover steering responds faster');
  step(30); assert(rider.lateralVelocity > 12.9, 'hover reaches 1.45x lateral speed');
  step(60); assert(rider.laneX <= 9 * .45, 'hover remains within road bounds');
  input.horizontalSteer = -1; step(12); assert(rider.lateralVelocity < -12, 'hover reversal is responsive');
  input.horizontalSteer = 0;

  for (const type of ['car','taxi','van','bus','roadroller','traffic_cone']) {
    const car = factory.createObstacle(type);
    car.userData = {...car.userData, id: type, s: 20, laneX: 0, hit: false}; track.activeObstacles = [car];
    rider.reset(14 - car.userData.collision.halfLength, 28); rider.applyPowerup('antigravity'); rider.applyPowerup('overdrive');
    step(90);
    assert(rider.s < 20 - car.userData.collision.halfLength - .39, `${type}: hover and turbo cannot pass through the body`);
    rider.reset(20, 12); rider.applyPowerup('antigravity'); rider.hoverOffset = .32;
    rider.y = car.userData.collision.top + .5; rider.verticalVelocity = -5; rider.isGrounded = false;
    step(8);
    assert.equal(rider.supportId, type, `${type}: glide lands on the actual roof`);
    near(rider.y, car.userData.collision.top + .32, 'hover above the supported roof');
    rider.antigravityTimer = .01; step(15);
    assert(rider.y >= car.userData.collision.top, 'expiration cannot sink through a roof');
  }
  track.activeObstacles = [];
  rider.reset(); rider.applyPowerup('antigravity'); rider.applyPowerup('propulsor');
  step(180); assert(rider.activeSkyFlight && rider.y > 3);
  step(270); assert(!rider.activeSkyFlight && rider.activeAntigravity, 'Sky Lift returns to hover with the remaining timer');
  assert(rider.y >= .32 && rider.y < 3);
  rider.y = 4; rider.isGrounded = false; rider.verticalVelocity = -1.4; input.isJumpHeld = true;
  rider.antigravityTimer = .01; step(12);
  assert(!rider.activeAntigravity && !rider.isGliding && rider.verticalVelocity < -3, 'expiry restores full gravity even with Jump held');
  assert(rider.y > 3, 'expiry does not teleport an airborne rider to the road');
  input.isJumpHeld = false; step(150); assert.equal(rider.y, 0); assert(!rider.mesh.userData.hoverRing.visible);
  assert.equal(rider.mesh.userData.frontWheel.rotation.z, 0, 'wheels return to normal');
  rider.reset(); rider.applyPowerup('antigravity'); step(60);
  track.activeSegments = [{userData: {isGap: true, gapStart: 0, gapEnd: 200}}];
  events.length = 0; step(15); assert(!events.includes('fall'), 'powered hover crosses a gap');
  rider.antigravityTimer = .01; step(20); assert(events.includes('fall'), 'expired hover cannot float over a gap indefinitely');
  track.activeSegments = [];

  rider.reset(); rider.applyPowerup('antigravity'); step(30);
  rider.antigravityTimer = 5.23;
  const state = JSON.parse(JSON.stringify(rider.captureState()));
  const restored = new RiderController(factory.createRiderWithScooter(), track); restored.restoreState(state);
  assert.deepEqual(restored.captureState(), state, 'hover physics survives save/restore exactly');
  assert(restored.mesh.userData.hoverRing.visible, 'saved hover appearance restores before simulation');
  const legacy = {...state}; for (const key of ['activeAntigravity','antigravityTimer','hoverOffset','isGliding']) delete legacy[key];
  restored.restoreState(legacy); assert(!restored.activeAntigravity && restored.hoverOffset === 0, 'older saves default to normal gravity');
  rider.applyPowerup('antigravity'); assert.equal(rider.antigravityTimer, 8, 'repeat pickup refreshes without unbounded stacking');

  const fx = new ArcadeEffects(scene, THREE), high = {graphicsQuality: 'high'};
  for (let i = 0; i < 30; i++) fx.update(1 / 60, rider, track, high, true);
  const trails = fx.pool.filter(p => p.life > 0 && p.trail);
  assert(trails.length >= 4 && trails.every(p => p.hover && p.color.b > p.color.g), 'purple sparkles emit without turbo');
  assert.equal(fx.wind.material.color.getHex(), 0xc18aff);
  assert(fx.flames.every(f => !f.visible), 'hover alone does not pretend to be turbo');
  const time = fx.time; fx.update(1, rider, track, high, false); assert.equal(fx.time, time);
  fx.update(.016, rider, track, {...high, reducedMotion: true}, true);
  assert.equal(fx.wind.geometry.drawRange.count, 0); assert(!fx.pool.some(p => p.trail && p.life > 0));
  rider.reducedMotion = true; step(60); const ring = rider.mesh.userData.hoverRing;
  const opacity = ring.children[0].material.opacity; step(30);
  near(ring.children[0].material.opacity, opacity, 'Reduced Motion keeps a steady hover indicator');
  assert.equal(ring.scale.x, 1);
  // Also cover the code-generated fallback rider used if GLB loading fails.
  global.louffiKit = null;
  const fallback = new RiderController(factory.createRiderWithScooter(), track);
  fallback.applyPowerup('antigravity'); fallback.update(.05, input, 10, 9);
  assert(fallback.mesh.userData.hoverRing.visible && fallback.mesh.userData.frontWheel.rotation.z > .5);
  console.log('PASS antigravity: 16 city pickups, gyroscope, collection persistence, hover, 22% gravity, hold/release glide, responsive steering, solid traffic/roofs, expiry/gaps, Sky Lift coexistence, save/legacy state, purple effects, Reduced Motion and GLB/fallback wheels.');
})().catch(e => {console.error(e); process.exitCode = 1;});
