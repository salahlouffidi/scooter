// Automated Unit & Integration Tests for Antigravity, Agile Controls, and Hover/Glider mechanics
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
global.window = global;
global.THREE = require('../app/src/main/assets/game/lib/three.min.js');
global.localStorage = {data:{}, getItem(k){return this.data[k]||null}, setItem(k,v){this.data[k]=v}, removeItem(k){delete this.data[k]}};
const base = path.resolve(__dirname, '../app/src/main/assets/game');
global.fetch = async() => ({ ok: true, arrayBuffer: async() => { const b = fs.readFileSync(base + '/models/louffi-world.glb'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });

// Load all scooter modules sequentially
['visualKit', 'kitLoader', 'storage', 'rounds', 'arcadeEffects', 'reachability', 'adaptiveML', 'assetFactory', 'trackGenerator', 'biomeArt', 'cityArt', 'enhancedTrack', 'controller'].forEach(n => require(base + '/js/' + n + '.js'));

(async () => {
  await loadLouffiKit();
  assert.equal(louffiAssetStatus, 'GLB loaded');

  const scene = new THREE.Scene();
  const factory = new AssetFactory(THREE);
  const track = new TrackGenerator(scene, factory, THREE);
  track.buildRound(ROUNDS_DATA[0], 42);

  const riderMesh = factory.createRiderWithScooter();
  const rider = new RiderController(riderMesh, track);

  console.log('--- STARTING ANTIGRAVITY UNIT TESTS ---');

  // 1. Initial State Check
  assert.equal(rider.activeAntigravity, false, 'Initially antigravity should be disabled');
  assert.equal(rider.antigravityTimer, 0.0, 'Initially antigravity timer should be zero');

  // 2. Power-up Application Check
  const mockOnEvent = [];
  rider.applyPowerup('antigravity', (ev) => mockOnEvent.push(ev));
  assert.equal(rider.activeAntigravity, true, 'Antigravity must be active after applying powerup');
  assert.equal(rider.antigravityTimer, 8.0, 'Antigravity duration must be set to 8.0 seconds');
  assert(mockOnEvent.includes('antigravity_launch'), 'antigravity_launch event should be emitted');

  // 3. Grounded Hover Elevation Animation Check
  // In antigravity mode, grounded rider must float/hover above y = 0
  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  rider.update(0.016, { horizontalSteer: 0, isJumpPressed: false, consumeJump: () => false }, 10, 8);
  assert(rider.y > 0.1, `Airborne/hover offset must be active while grounded in antigravity mode (current height: ${rider.y})`);

  // 4. Moon Gravity & Jumping Ascent Check
  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  let jumped = true;
  const inputWithJump = {
    horizontalSteer: 0,
    isJumpPressed: false,
    consumeJump() { const r = jumped; jumped = false; return r; }
  };
  // Perform first jump frame
  rider.update(0.016, inputWithJump, 10, 8);
  assert.equal(rider.isGrounded, false, 'Rider must become airborne after jumping');
  const launchVerticalVelocity = rider.verticalVelocity;

  // Let's update and measure the descent
  // Antigravity (moon gravity) is 22% of ScooterTuning.gravity
  const antiGravityStrength = ScooterTuning.gravity * 0.22;
  rider.update(0.1, { horizontalSteer: 0, isJumpPressed: false, consumeJump: () => false }, 10, 8);
  // Velocity after 0.1s should be roughly: launchVerticalVelocity - antiGravityStrength * 0.1
  const expectedVelocity = launchVerticalVelocity - antiGravityStrength * 0.1;
  assert(Math.abs(rider.verticalVelocity - expectedVelocity) < 0.2, `Descent must align with moon gravity (expected: ${expectedVelocity}, actual: ${rider.verticalVelocity})`);

  // 5. Glider Descend (Space/Jump held) Cap Check
  // If in air and jump is held (isJumpPressed is true), the downward vertical velocity must be capped at -1.4 m/s
  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  let jumpTrigger = true;
  rider.update(0.016, { horizontalSteer: 0, isJumpPressed: true, consumeJump: () => { const r = jumpTrigger; jumpTrigger = false; return r; } }, 10, 8);
  assert.equal(rider.isGrounded, false);
  
  // Set high negative velocity to trigger cap
  rider.verticalVelocity = -5.0;
  rider.update(0.016, { horizontalSteer: 0, isJumpPressed: true, consumeJump: () => false }, 10, 8);
  assert(rider.verticalVelocity >= -1.45, `Vertical downward velocity must be capped for glider mechanics while holding jump (current: ${rider.verticalVelocity})`);

  // 6. Agile/Flexible Steering Responsiveness Check
  // Lateral steering speeds should be higher (1.45x) in antigravity
  rider.reset(0, 10.0);
  rider.update(0.016, { horizontalSteer: 1, isJumpPressed: false, consumeJump: () => false }, 10, 8);
  const normalSteerVelocity = rider.lateralVelocity;

  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  rider.update(0.016, { horizontalSteer: 1, isJumpPressed: false, consumeJump: () => false }, 10, 8);
  const antiSteerVelocity = rider.lateralVelocity;
  assert(antiSteerVelocity > normalSteerVelocity, `Steering responsiveness must be enhanced during antigravity (normal: ${normalSteerVelocity}, antigravity: ${antiSteerVelocity})`);

  // 7. Wheel Rotation & Hover pad Procedural Animation Check
  // Wheels should rotate sideways (z != 0) during antigravity procedural animation
  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  rider.update(0.05, { horizontalSteer: 0, isJumpPressed: false, consumeJump: () => false }, 10, 8);
  assert(Math.abs(rider.mesh.userData.frontWheel.rotation.z) > 0.05, 'Wheels must rotate outwards (z != 0) during antigravity');
  assert(Math.abs(rider.mesh.userData.backWheel.rotation.z) > 0.05, 'Wheels must rotate outwards (z != 0) during antigravity');

  // 8. State Capture & Restoration Check
  rider.reset(0, 10.0);
  rider.applyPowerup('antigravity');
  rider.antigravityTimer = 5.23;
  const captured = rider.captureState();
  
  // Create another rider and restore state
  const rider2 = new RiderController(factory.createRiderWithScooter(), track);
  rider2.restoreState(captured);
  assert.equal(rider2.activeAntigravity, true, 'Restored state must preserve active antigravity flag');
  assert.equal(rider2.antigravityTimer, 5.23, 'Restored state must preserve exact antigravity timer');

  console.log('--- ALL ANTIGRAVITY TESTS PASSED COMPLETELY ---');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
