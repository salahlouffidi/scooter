// Exercise real game methods with simulated native callbacks; never request ads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    disabled: false, textContent: '', innerText: '',
    classList: { add() {}, remove() {}, toggle() {} }
  });
  return elements.get(id);
};
const context = {
  window: {}, document: { getElementById: element },
  performance: { now: () => 1234 }, console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/game/js/game.js'), 'utf8'), context);
const proto = context.window.SkyScooterGame.prototype;
const g = Object.create(proto);
let interstitials = 0, rewards = 0, saves = 0;
Object.assign(g, {
  state: 'PLAYING', revivesUsed: 0, hearts: 0, score: 12,
  currentRoundId: 1, coinsCollectedThisRun: 3,
  cancelCountdown() {}, notifyAndroidState() {}, hideAllScreens() {},
  saveActiveRun() { saves++; }, vibrate() {}, input: { resetAll() {} }
});
context.window.GameStorage = { clearRun() {}, addCoins() {}, getProgress: () => ({bestScores:{}}) };
context.window.AndroidBridge = {
  showInterstitial() { interstitials++; },
  showRewardedRevive() { rewards++; }
};
g.triggerGameOver();
assert.equal(interstitials, 1);
assert.equal(g.waitingForGameOverInterstitial, true);
g.onInterstitialClosed();
assert.equal(g.waitingForGameOverInterstitial, false);
g.requestRewardedRevive();
g.requestRewardedRevive();
assert.equal(rewards, 1, 'double tap cannot request another ad');
g.onRewardedAdNotCompleted();
assert.equal(g.hearts, 0, 'early dismissal earns no heart');
assert.equal(g.revivesUsed, 0);
assert.equal(element('btn-go-revive').disabled, false);
g.requestRewardedRevive();
g.onRewardedReviveEarned();
assert.equal(g.hearts, 1);
assert.equal(g.state, 'PLAYING');
assert.equal(g.revivesUsed, 1);
assert.equal(saves, 1);
g.onRewardedReviveEarned();
assert.equal(saves, 1, 'duplicate callback cannot award another revive');
g.triggerGameOver();
assert.equal(interstitials, 1, 'second loss cannot show another interstitial');
g.requestRewardedRevive();
assert.equal(rewards, 2, 'second loss cannot request a second revive');
// Offline bridge failure must fall back to usable Game Over / revive controls.
g.state = 'PLAYING'; g.gameOverInterstitialShown = false; g.revivesUsed = 0;
context.window.AndroidBridge = {
  showInterstitial() { throw new Error('bridge unavailable'); },
  showRewardedRevive() { throw new Error('bridge unavailable'); }
};
g.triggerGameOver();
assert.equal(g.waitingForGameOverInterstitial, false);
g.requestRewardedRevive();
assert.equal(g.rewardedRequestPending, false);
assert.equal(element('btn-go-revive').disabled, false);
console.log('PASS: interstitial dismissal/failure, reward completion/cancellation, duplicate callbacks/taps, one revive per run and unavailable bridge. Native SDK/phone tests remain pending.');
