// SKY SCOOTER — LOUFFI EDITION
// Professional Combo & Achievement System
window.ComboSystem = class ComboSystem {
  constructor() {
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboDuration = 3.0; // seconds
    this.comboMultiplier = 1.0;
    this.maxCombo = 0;
    this.achievements = [];
    this.unlockedAchievements = new Set();
  }

  // Track consecutive successful actions
  addCombo(points = 1) {
    this.comboCount += points;
    this.comboTimer = this.comboDuration;
    
    // Update multiplier based on combo
    if (this.comboCount <= 5) this.comboMultiplier = 1.0;
    else if (this.comboCount <= 10) this.comboMultiplier = 1.5;
    else if (this.comboCount <= 20) this.comboMultiplier = 2.0;
    else if (this.comboCount <= 30) this.comboMultiplier = 3.0;
    else this.comboMultiplier = 5.0;

    if (this.comboCount > this.maxCombo) {
      this.maxCombo = this.comboCount;
    }
  }

  // Break combo on failure
  breakCombo() {
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1.0;
  }

  // Check for combo milestones
  getComboReward() {
    const rewards = {
      5: 100,
      10: 250,
      15: 500,
      20: 1000,
      25: 2500,
      30: 5000
    };

    for (const [combo, reward] of Object.entries(rewards)) {
      if (this.comboCount === parseInt(combo)) {
        return reward;
      }
    }
    return 0;
  }

  update(deltaTime) {
    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
    } else if (this.comboCount > 0) {
      this.breakCombo();
    }
  }
};

window.AchievementSystem = class AchievementSystem {
  constructor() {
    this.achievements = [
      { id: 'first_coin', name: 'Coin Collector', desc: 'Collect your first coin', icon: '🪙' },
      { id: 'combo_5', name: 'On Fire!', desc: 'Reach a 5x combo', icon: '🔥' },
      { id: 'combo_10', name: 'Unstoppable!', desc: 'Reach a 10x combo', icon: '⚡' },
      { id: 'shield_pro', name: 'Protected', desc: 'Use shield power-up 5 times', icon: '🛡️' },
      { id: 'magnet_master', name: 'Magnet Master', desc: 'Collect 100 coins with magnet', icon: '🧲' },
      { id: 'perfect_round', name: 'Perfect!', desc: 'Complete round without damage', icon: '✨' },
      { id: 'speedster', name: 'Speedster', desc: 'Reach max speed in Overdrive', icon: '🚀' },
      { id: 'gem_collector', name: 'Gem Hoarder', desc: 'Collect 50 gems', icon: '💎' },
      { id: 'all_rounds', name: 'Champion', desc: 'Complete all 16 rounds', icon: '🏆' },
      { id: 'endless_king', name: 'Endless King', desc: 'Survive 10 minutes in Endless Mode', icon: '👑' }
    ];
    this.unlockedAchievements = new Set();
    this.loadUnlocked();
  }

  unlock(achievementId) {
    if (!this.unlockedAchievements.has(achievementId)) {
      this.unlockedAchievements.add(achievementId);
      this.saveUnlocked();
      return true;
    }
    return false;
  }

  isUnlocked(achievementId) {
    return this.unlockedAchievements.has(achievementId);
  }

  getUnlockedCount() {
    return this.unlockedAchievements.size;
  }

  getTotalCount() {
    return this.achievements.length;
  }

  saveUnlocked() {
    const data = Array.from(this.unlockedAchievements);
    localStorage.setItem('skyScooter_achievements', JSON.stringify(data));
  }

  loadUnlocked() {
    const data = localStorage.getItem('skyScooter_achievements');
    if (data) {
      this.unlockedAchievements = new Set(JSON.parse(data));
    }
  }

  getAchievementById(id) {
    return this.achievements.find(a => a.id === id);
  }
};

window.LeaderboardSystem = class LeaderboardSystem {
  constructor() {
    this.leaderboard = [];
    this.playerStats = {
      totalScore: 0,
      totalCoins: 0,
      totalDistance: 0,
      highestRound: 1,
      gamesPlayed: 0,
      totalPlayTime: 0,
      bestScores: {} // roundId -> score
    };
    this.loadStats();
  }

  recordRun(roundId, score, coinsCollected, distance) {
    this.leaderboard.push({
      roundId,
      score,
      coinsCollected,
      distance,
      timestamp: Date.now()
    });

    // Keep only top 100 entries per round
    const roundRuns = this.leaderboard.filter(r => r.roundId === roundId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);
    
    this.leaderboard = this.leaderboard.filter(r => r.roundId !== roundId)
      .concat(roundRuns);

    // Update stats
    this.playerStats.totalScore += score;
    this.playerStats.totalCoins += coinsCollected;
    this.playerStats.totalDistance += distance;
    this.playerStats.gamesPlayed++;

    if (!this.playerStats.bestScores[roundId] || score > this.playerStats.bestScores[roundId]) {
      this.playerStats.bestScores[roundId] = score;
    }

    this.saveStats();
  }

  getTopScores(roundId, limit = 10) {
    return this.leaderboard
      .filter(r => r.roundId === roundId)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  saveStats() {
    localStorage.setItem('skyScooter_playerStats', JSON.stringify(this.playerStats));
    localStorage.setItem('skyScooter_leaderboard', JSON.stringify(this.leaderboard));
  }

  loadStats() {
    const stats = localStorage.getItem('skyScooter_playerStats');
    if (stats) {
      this.playerStats = JSON.parse(stats);
    }
    const lb = localStorage.getItem('skyScooter_leaderboard');
    if (lb) {
      this.leaderboard = JSON.parse(lb);
    }
  }

  getPlayerRank(roundId, score) {
    const scores = this.getTopScores(roundId, 1000);
    return scores.findIndex(r => r.score === score) + 1;
  }
};
