/* Native AdMob only. Ordinary browser previews never fabricate ads or rewards. */
(() => {
  const native = () => window.ScooterAdsNative;
  let status = { available: !!native(), rewardedReady: false, privacyRequired: false };
  let pending = null, serial = 0, busy = false, claimedRun = null;
  const resultState = () => ['GAME_OVER', 'ROUND_COMPLETE'].includes(window.gameInstance?.state);
  const message = text => document.querySelectorAll('.ads-message').forEach(el => { el.textContent = text; });
  function refresh() {
    const run = window.gameInstance?.currentRunTxId;
    document.querySelectorAll('.rewarded-ad-button').forEach(button => {
      button.classList.toggle('hidden', !status.available);
      button.disabled = busy || !status.rewardedReady || claimedRun === run;
      button.textContent = claimedRun === run ? 'BONUS COLLECTED' : 'WATCH AD · +50 COINS';
    });
    const privacy = document.getElementById('btn-privacy-options');
    if (privacy) {
      privacy.classList.toggle('hidden', !status.privacyRequired);
      privacy.disabled = busy;
    }
    document.body.classList.toggle('ad-busy', busy);
  }
  function request(method) {
    return new Promise(resolve => {
      if (!native()?.[method] || pending) return resolve({status:'unavailable', earned:false});
      const id = 'ad_' + Date.now() + '_' + (++serial);
      pending = {id, resolve};
      try { native()[method](id); }
      catch (_) { pending = null; resolve({status:'failed', earned:false}); }
    });
  }
  function lock() {
    busy = true;
    window.gameInstance?.input?.resetAll();
    window.GameAudio?.stopMusic();
    window.GameAudio?.ctx?.suspend().catch(() => {});
    refresh();
  }
  function unlock() { busy = false; refresh(); }
  window.ScooterAds = {
    onStatus(value) { status = value; refresh(); },
    onResult(value) {
      if (!pending || pending.id !== value.id) return;
      const { resolve } = pending;
      pending = null;
      resolve(value);
    },
    setInsets(value) {
      for (const [name, short] of [['top','t'],['right','r'],['bottom','b'],['left','l']]) {
        const pixels = Math.max(0, Number(value[name]) || 0);
        document.documentElement.style.setProperty('--native-safe-' + short, pixels + 'px');
      }
    },
    refresh,
    async reward() {
      const game = window.gameInstance;
      if (busy || !resultState() || !status.rewardedReady || !game?.currentRunTxId || claimedRun === game.currentRunTxId) return;
      const run = game.currentRunTxId;
      lock();
      try {
        const result = await request('showRewarded');
        // Only the SDK's earned callback authorizes this one transaction per run.
        if (result.earned === true) {
          claimedRun = run;
          window.GameStorage.addCoins(50, 'ad_bonus_' + run);
          game.updateStatsDisplay?.();
          message('50 bonus coins collected.');
        } else message(result.status === 'closed' ? 'Ad closed without a reward.' : 'Ad unavailable. You can keep playing.');
      } finally { unlock(); }
    },
    async transition(continueGame) {
      if (busy) return;
      if (!resultState() || !native()) { continueGame(); return; }
      lock();
      try { await request('showInterstitial'); }
      finally { unlock(); }
      // A backgrounded activity must not start a hidden countdown.
      if (document.hidden) {
        const resume = () => {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', resume);
          continueGame();
        };
        document.addEventListener('visibilitychange', resume);
      } else continueGame();
    },
    async privacy() {
      if (busy || !status.privacyRequired) return;
      lock();
      try {
        const result = await request('showPrivacyOptions');
        const el = document.getElementById('privacy-message');
        if (el) el.textContent = result.status === 'closed' ? 'Privacy choices updated.' : 'Privacy options unavailable. Please try again.';
      } finally { unlock(); }
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rewarded-ad-button').forEach(button => button.addEventListener('click', () => window.ScooterAds.reward()));
    document.getElementById('btn-privacy-options')?.addEventListener('click', () => window.ScooterAds.privacy());
    refresh();
    native()?.requestStatus();
    // Recheck availability after transient connectivity failures; native loads are throttled.
    if (native()) setInterval(() => { if (!document.hidden && !busy) native()?.requestStatus(); }, 15000);
  });
})();
