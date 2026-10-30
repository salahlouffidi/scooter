// Compare captured evidence, not estimated phone performance.
// Usage: node tools/compare-visual-review.cjs <before/scenes.json> <after/scenes.json>
const fs = require('node:fs');
const assert = require('node:assert/strict');
const before = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const after = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
assert.equal(after.length, before.length);
const counters = ['sceneCalls', 'sceneTriangles', 'textures', 'geometries'];
const rows = [];
for (const a of after) {
  const b = before.find(x => x.name === a.name);
  assert(b, a.name);
  for (const key of ['round', 'tier', 'seed', 's', 'viewport', 'reducedMotion', 'post', 'renderScale', 'camera', 'lightPositions', 'rider', 'trackHash']) {
    assert(Object.hasOwn(a, key) && Object.hasOwn(b, key), `${a.name}: required ${key} metadata`);
    assert.deepEqual(a[key], b[key], `${a.name}: matching ${key}`);
  }
  for (const selector of Object.keys(b.hud)) {
    for (const key of ['x', 'y', 'width', 'height', 'text']) assert.deepEqual(a.hud[selector][key], b.hud[selector][key], `${a.name}: unchanged ${selector} ${key}`);
  }
  for (const key of counters) assert.equal(a[key], b[key], `${a.name}: no added ${key}`);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  rows.push({ scene: a.name, match: true, ...Object.fromEntries(counters.map(k => [k, { before: b[k], after: a[k], delta: a[k] - b[k] }])) });
}
console.log(JSON.stringify({ renderer: after[0].renderer, phoneTested: false, timingMeasured: false, comparisons: rows }, null, 2));
