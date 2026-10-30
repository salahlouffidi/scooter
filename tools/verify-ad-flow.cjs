// Exercise real game methods with simulated native callbacks; never request ads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    disabled: false, textContent: '', innerText: '',
    classList: {
      hidden: false,
      add(name) { if (name === 'hidden') this.hidden = true; },
      remove(name) { if (name === 'hidden') this.hidden = false; },
      toggle(name, enabled) { if (name === 'hidden') this.hidden = !!enabled; },
      contains(name) { return name === 'hidden' && this.hidden; }
    }
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
let interstitialIds = [], rewardedIds = [], saves = 0;
Object.assign(g, {
  state: 'PLAYING', revivesUsed: 0, hearts: 0, score: 12,
  currentRoundId: 1, coinsCollectedThisRun: 3,
  cancelCountdown() {}, notifyAndroidState() {}, hideAllScreens() {},
  saveActiveRun() { saves++; }, vibrate() {}, input: { resetAll() {} },
  mlWindowFeaturesSnapshot: null, currentRunTxId: 'run_test_1',
  adRequestSequence: 0, rewardedRequestPending: false,
  waitingForGameOverInterstitial: false, gameOverInterstitialShown: false,
  activeInterstitialRequestId: null, activeRewardedRequestId: null
});
context.window.GameStorage = { clearRun() {}, addCoins() {}, getProgress: () => ({ bestScores: {} }) };
context.window.AndroidBridge = {
  showInterstitial(id) {
    assert.equal(element('game-over-modal').classList.hidden, false, 'Game Over is visible before the native request');
    interstitialIds.push(id);
  },
  showRewardedRevive(id) { rewardedIds.push(id); }
};

// Game Over UI is available before native receives or completes the interstitial request.
element('game-over-modal').classList.add('hidden');
g.triggerGameOver();
assert.equal(interstitialIds.length, 1);
const interstitialId = interstitialIds[0];
assert(Number.isSafeInteger(interstitialId) && interstitialId > 0);
assert.equal(element('game-over-modal').classList.hidden, false);
assert.equal(g.waitingForGameOverInterstitial, true);
assert.equal(g.activeInterstitialRequestId, interstitialId);
g.requestRewardedRevive();
assert.equal(rewardedIds.length, 0, 'revive waits for the interstitial request to finish');
g.onInterstitialClosed(interstitialId + 1);
assert.equal(g.waitingForGameOverInterstitial, true, 'stale interstitial callback is ignored');
g.onInterstitialClosed(interstitialId);
assert.equal(g.waitingForGameOverInterstitial, false);
assert.equal(g.activeInterstitialRequestId, null);

g.requestRewardedRevive();
g.requestRewardedRevive();
assert.equal(rewardedIds.length, 1, 'double tap cannot request another ad');
const cancelledRewardId = rewardedIds[0];
assert.equal(g.activeRewardedRequestId, cancelledRewardId);
g.onRewardedAdNotCompleted(cancelledRewardId + 1);
assert.equal(g.rewardedRequestPending, true, 'stale rewarded callback is ignored');
g.onRewardedAdNotCompleted(cancelledRewardId);
assert.equal(g.hearts, 0, 'early dismissal earns no heart');
assert.equal(g.revivesUsed, 0);
assert.equal(element('btn-go-revive').disabled, false);

g.requestRewardedRevive();
const earnedRewardId = rewardedIds[1];
g.onRewardedReviveEarned(earnedRewardId);
assert.equal(g.hearts, 1);
assert.equal(g.state, 'PLAYING');
assert.equal(g.revivesUsed, 1);
assert.equal(saves, 1);
g.onRewardedReviveEarned(earnedRewardId);
assert.equal(saves, 1, 'duplicate callback cannot award another revive');

// Late callbacks during active play cannot affect the revived run.
g.onInterstitialClosed(interstitialId);
g.onRewardedAdUnavailable(earnedRewardId);
assert.equal(g.state, 'PLAYING');
assert.equal(g.hearts, 1);
assert.equal(g.revivesUsed, 1);
g.triggerGameOver();
g.requestRewardedRevive();
assert.equal(interstitialIds.length, 1, 'second loss cannot display another interstitial');
assert.equal(rewardedIds.length, 2, 'second loss cannot request a second revive');
assert.equal(element('btn-go-revive').disabled, true);

// A new menu/run reset invalidates old IDs before the next Game Over.
g.resetAdRequestState();
g.state = 'PLAYING';
g.hearts = 0;
g.revivesUsed = 0;
g.score = 24;
g.gameOverInterstitialShown = false;
g.triggerGameOver();
const newInterstitialId = interstitialIds[1];
assert(newInterstitialId > interstitialId);
assert.equal(g.waitingForGameOverInterstitial, true);
g.onRewardedReviveEarned(earnedRewardId);
assert.equal(g.state, 'GAME_OVER', 'old reward callback cannot revive a new Game Over');
g.onInterstitialClosed(newInterstitialId);
g.requestRewardedRevive();
const unavailableRewardId = rewardedIds[2];
g.onRewardedAdUnavailable(unavailableRewardId);
assert.equal(g.rewardedRequestPending, false);
assert.equal(element('btn-go-revive').disabled, false);
assert.equal(element('btn-go-revive').textContent, 'Ad unavailable, try again');
assert.equal(g.hearts, 0, 'unavailable ad earns no heart');
assert.equal(g.revivesUsed, 0);
// A native bridge exception cannot hide Game Over or leave revive disabled.
g.resetAdRequestState();
g.state = 'PLAYING';
context.window.AndroidBridge = {
  showInterstitial() { throw new Error('bridge unavailable'); },
  showRewardedRevive() { throw new Error('bridge unavailable'); }
};
g.triggerGameOver();
assert.equal(g.waitingForGameOverInterstitial, false);
assert.equal(element('game-over-modal').classList.hidden, false);
g.requestRewardedRevive();
assert.equal(g.rewardedRequestPending, false);
assert.equal(element('btn-go-revive').disabled, false);
assert.equal(element('btn-go-revive').textContent, 'Ad unavailable, try again');
console.log('PASS: immediate Game Over UI, request IDs, stale/duplicate callbacks, interstitial gating, unavailable messaging, and exactly-one revive reward.');

// Exercise the actual saved-run methods, not a synthetic serialization helper.
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/src/main/assets/game/js/runSession.js'), 'utf8'), context);
let savedRun;
context.window.GameStorage.saveRun = snapshot => { savedRun = snapshot; return true; };
context.window.GameStorage.getRun = () => savedRun;
context.window.ROUNDS_DATA = [{ id: 1, name: 'test', baseSpeed: 10 }];
const resumed = Object.create(proto);
Object.assign(resumed, {
  state: 'PLAYING', hasActiveRun: true, revivesUsed: 1, hearts: 1,
  currentRoundId: 1, currentRunTxId: 'test-revived-run', isEndless: false,
  input: { resetAll() {} }, arcadeEffects: { reset() {} },
  riderCtrl: { captureState: () => ({}), restoreState() {}, mesh: {} },
  trackGen: { captureState: () => ({}), restoreState() {} },
  gameCam: { reset() {} }, ml: { extractFeatures: () => [] },
  cancelCountdown() {}, applyRoundAtmosphere() {}, hideAllScreens() {},
  updateHUD() {}, resume() { this.state = 'PLAYING'; }
});
assert.equal(resumed.saveActiveRun(), true);
assert.equal(savedRun.stats.revivesUsed, 1, 'save retains the earned revive');
resumed.revivesUsed = 0;
resumed.rewardedRequestPending = true;
resumed.activeRewardedRequestId = 99;
resumed.continueSavedRun();
assert.equal(resumed.revivesUsed, 1, 'recreation does not grant a second revive');
assert.equal(resumed.hearts, 1);
assert.equal(resumed.gameOverInterstitialShown, true);
assert.equal(resumed.rewardedRequestPending, false);
assert.equal(resumed.activeRewardedRequestId, null);
// A pre-fix save has no revive metadata; it must not inherit another run's limit.
delete savedRun.stats.revivesUsed;
resumed.continueSavedRun();
assert.equal(resumed.revivesUsed, 0);
console.log('PASS: actual saved-run serialization/restoration retains one-heart, one-revive usage and clears stale requests; legacy saves remain compatible.');
