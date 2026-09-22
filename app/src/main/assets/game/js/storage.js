// LOUFFI CITY RUSH — LOUFFI EDITION
// Data Persistence & Transaction Safety
window.GameStorage = {
  KEYS: {
    SETTINGS: 'skyscooter_settings_v1',
    PROGRESS: 'skyscooter_progress_v1',
    WALLET: 'skyscooter_wallet_v1',
    TRANSACTIONS: 'skyscooter_tx_v1',
    ML_WEIGHTS: 'skyscooter_ml_v1',
    ACTIVE_RUN: 'skyscooter_active_run_v1'
  },

  defaultSettings: {
    music: true,
    sfx: true,
    vibration: true,
    steeringSensitivity: 1.0,
    graphicsQuality: 'high', // 'low', 'medium', 'high'
    reducedMotion: false,
    adaptiveDifficulty: true,
    language: 'en'
  },

  defaultProgress: {
    highestUnlockedRound: 1,
    bestScores: {}, // roundNumber -> number
    stars: {},      // roundNumber -> number (1, 2, 3)
    adaptiveBestScores: {}, // separate records for adaptive mode
    endlessHighScore: 0
  },

  defaultWallet: {
    totalCoins: 0,
    selectedSkin: 'default_red',
    unlockedSkins: ['default_red', 'sky_blue', 'gold_champion']
  },

  getSettings() {
    try {
      const raw = localStorage.getItem(this.KEYS.SETTINGS);
      if (!raw) return { ...this.defaultSettings };
      const parsed = JSON.parse(raw);
      return { ...this.defaultSettings, ...parsed };
    } catch (e) {
      console.warn('Corrupted settings, returning default:', e);
      return { ...this.defaultSettings };
    }
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  getProgress() {
    try {
      const raw = localStorage.getItem(this.KEYS.PROGRESS);
      if (!raw) return JSON.parse(JSON.stringify(this.defaultProgress));
      const parsed = JSON.parse(raw);
      if (!parsed.highestUnlockedRound || parsed.highestUnlockedRound < 1) {
        parsed.highestUnlockedRound = 1;
      }
      return {
        highestUnlockedRound: Math.max(1, parsed.highestUnlockedRound),
        bestScores: parsed.bestScores || {},
        stars: parsed.stars || {},
        adaptiveBestScores: parsed.adaptiveBestScores || {},
        endlessHighScore: parsed.endlessHighScore || 0
      };
    } catch (e) {
      console.warn('Corrupted progress, returning default:', e);
      return JSON.parse(JSON.stringify(this.defaultProgress));
    }
  },

  saveProgress(progress) {
    try {
      localStorage.setItem(this.KEYS.PROGRESS, JSON.stringify(progress));
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  },

  unlockRound(roundNumber) {
    const progress = this.getProgress();
    if (roundNumber > progress.highestUnlockedRound && roundNumber <= 16) {
      progress.highestUnlockedRound = roundNumber;
      this.saveProgress(progress);
    }
    return progress.highestUnlockedRound;
  },

  recordRoundResult(roundNumber, score, starsEarned, isAdaptive, runTxId) {
    // Idempotent check
    if (this.hasProcessedTx(runTxId)) {
      return this.getProgress();
    }
    this.markTxProcessed(runTxId);

    const progress = this.getProgress();
    const scoreMap = isAdaptive ? progress.adaptiveBestScores : progress.bestScores;
    const currentBest = scoreMap[roundNumber] || 0;
    if (score > currentBest) {
      scoreMap[roundNumber] = score;
    }
    const currentStars = progress.stars[roundNumber] || 0;
    if (starsEarned > currentStars) {
      progress.stars[roundNumber] = starsEarned;
    }

    // Permanently unlock next round if completed
    if (roundNumber < 16) {
      progress.highestUnlockedRound = Math.max(progress.highestUnlockedRound, roundNumber + 1);
    } else if (roundNumber === 16) {
      progress.highestUnlockedRound = 16;
    }

    this.saveProgress(progress);
    return progress;
  },

  recordEndlessScore(score, isAdaptive) {
    const progress = this.getProgress();
    if (score > (progress.endlessHighScore || 0)) {
      progress.endlessHighScore = score;
      this.saveProgress(progress);
    }
  },

  getWallet() {
    try {
      const raw = localStorage.getItem(this.KEYS.WALLET);
      if (!raw) return { ...this.defaultWallet };
      return { ...this.defaultWallet, ...JSON.parse(raw) };
    } catch (e) {
      return { ...this.defaultWallet };
    }
  },

  addCoins(coinsAmount, runTxId) {
    if (coinsAmount <= 0) return this.getWallet().totalCoins;
    if (runTxId && this.hasProcessedTx(`coin_${runTxId}`)) {
      return this.getWallet().totalCoins;
    }
    if (runTxId) {
      this.markTxProcessed(`coin_${runTxId}`);
    }

    const wallet = this.getWallet();
    wallet.totalCoins = Math.max(0, (wallet.totalCoins || 0) + coinsAmount);
    try {
      localStorage.setItem(this.KEYS.WALLET, JSON.stringify(wallet));
    } catch (e) {}
    return wallet.totalCoins;
  },

  hasProcessedTx(txId) {
    if (!txId) return false;
    try {
      const raw = localStorage.getItem(this.KEYS.TRANSACTIONS);
      const txs = raw ? JSON.parse(raw) : [];
      return txs.includes(txId);
    } catch (e) {
      return false;
    }
  },

  markTxProcessed(txId) {
    if (!txId) return;
    try {
      const raw = localStorage.getItem(this.KEYS.TRANSACTIONS);
      let txs = raw ? JSON.parse(raw) : [];
      if (!txs.includes(txId)) {
        txs.push(txId);
        if (txs.length > 200) txs = txs.slice(-100);
        localStorage.setItem(this.KEYS.TRANSACTIONS, JSON.stringify(txs));
      }
    } catch (e) {}
  },

  resetProgress() {
    this.clearRun();
    const fresh = JSON.parse(JSON.stringify(this.defaultProgress));
    this.saveProgress(fresh);
    return fresh;
  },

  // Keep the legacy keys so renaming the game never erases a player's saves.
  getRun() {
    const candidates = [];
    try { candidates.push(localStorage.getItem(this.KEYS.ACTIVE_RUN)); } catch (_) {}
    try { candidates.push(window.AndroidBridge?.readRunSnapshot?.()); } catch (_) {}
    const valid = [];
    for (const raw of candidates) {
      try {
        const s = JSON.parse(raw);
        if (![1, 2].includes(s?.version) || !Number.isInteger(s.roundId) || s.roundId < 1 || s.roundId > 16) continue;
        if (!s.runId || this.hasProcessedTx(s.runId) || this.hasProcessedTx(`coin_${s.runId}`)) continue;
        if (!s.rider || !Number.isFinite(s.rider.s) || s.rider.s < 0 || !Number.isFinite(s.stats?.hearts) || s.stats.hearts <= 0) continue;
        if (!s.track?.segments?.length || s.track.segments.length > 20) continue;
        if (!Number.isFinite(s.track.seed) || !Number.isFinite(s.track.rngState)) continue;
        valid.push(s);
      } catch (_) { /* An interrupted or older save must not prevent boot. */ }
    }
    return valid.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0))[0] || null;
  },

  saveRun(snapshot) {
    const raw = JSON.stringify(snapshot);
    let saved = false;
    try { localStorage.setItem(this.KEYS.ACTIVE_RUN, raw); saved = true; } catch (_) {}
    try { if (window.AndroidBridge?.writeRunSnapshot) saved = !!window.AndroidBridge.writeRunSnapshot(raw) || saved; } catch (_) {}
    return saved;
  },

  clearRun() {
    try { localStorage.removeItem(this.KEYS.ACTIVE_RUN); } catch (_) {}
    try { window.AndroidBridge?.clearRunSnapshot?.(); } catch (_) {}
  }
};
