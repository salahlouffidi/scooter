// SKY SCOOTER — LOUFFI EDITION
// Gameplay HUD controller. Keeps DOM writes to a minimum (only changed values touch the
// document), tweens the score, animates hearts/combo and manages power-up timer chips.
window.HudController = class HudController {
  constructor(game) {
    this.g = game;
    const $ = id => document.getElementById(id);
    this.el = {
      hearts: $('hud-hearts-val'), heartsBox: $('hud-hearts'), score: $('hud-score-val'), mult: $('hud-multiplier-val'), status: $('hud-status'),
      progress: $('hud-progress-fill'), power: $('hud-powerups'), speed: $('hud-speed'), num: $('spd-num'), fill: $('spd-fill'), mode: $('spd-mode')
    };
    const T = window.ScooterTuning;
    // key, css class, icon, label, active(), time(), max
    this.defs = [
      { key: 'antigravity', cls: 'antigravity', icon: 'i-orbit', label: 'ANTIGRAVITY', active: r => r.activeAntigravity, time: r => r.antigravityTimer, max: T.antigravityDuration, decimals: 1,
        hint: r => (r.isGliding ? 'GLIDING' : 'HOLD JUMP TO GLIDE') },
      { key: 'shield', cls: 'shield', icon: 'i-shield', label: 'SHIELD', active: r => r.activeShield, time: r => r.shieldTimer, max: 10 },
      { key: 'magnet', cls: 'magnet', icon: 'i-magnet', label: 'MAGNET', active: r => r.activeMagnet, time: r => r.magnetTimer, max: 8 },
      { key: 'double', cls: 'double', icon: 'i-coin', label: '2X COINS', active: r => r.activeDouble, time: r => r.doubleTimer, max: 8 },
      { key: 'overdrive', cls: 'overdrive', icon: 'i-bolt', label: 'OVERDRIVE', active: r => r.activeOverdrive, time: r => r.overdriveTimer, max: 5 },
      { key: 'magic', cls: 'magic', icon: 'i-fruit', label: 'MAGIC GUARD', active: r => r.activeMagicRush, time: r => r.magicRushTimer, max: 10,
        extra: r => `${r.faultGuardCharges}/2` },
      { key: 'sky', cls: 'sky-lift', icon: 'i-rocket', label: 'SKY LIFT', active: r => r.activeSkyFlight, time: r => r.skyFlightTimer, max: 3.6, decimals: 1 }
    ];
    this.chips = new Map();
    this.reset();
  }

  reset() {
    this.shownScore = this.g.score || 0;
    this.lastHearts = -1; this.lastMult = 1; this.cache = {};
    this.scoreFeedbackTime = 0; this.noticeTime = 0;
    this.el.score?.classList.remove('hud-score-gain', 'hud-score-penalty');
    if (this.el.status) this.el.status.textContent = '';
    this.chips.forEach(c => c.node.remove());
    this.chips.clear();
    if (this.el.score) this.el.score.textContent = `${Math.floor(this.shownScore)}`;
  }

  snapScore() {
    this.shownScore = Number.isFinite(this.g.score) ? this.g.score : 0;
    const value = Math.floor(this.shownScore);
    if (this.el.score) this.el.score.textContent = `${value}`;
    this.cache.score = value;
  }

  // One bounded HUD cue, even for a whole row of magnet pickups. Never project text
  // into the playfield or create an animation/timer for every collected coin.
  scoreChanged(kind = 'gain') {
    this.snapScore();
    this.scoreFeedbackTime = 0.45;
    this.el.score?.classList.toggle('hud-score-gain', kind === 'gain');
    this.el.score?.classList.toggle('hud-score-penalty', kind === 'loss');
  }

  notice(text) {
    if (this.el.status) this.el.status.textContent = text;
    this.noticeTime = 1.8;
  }

  // True when the value differs from what the DOM already shows (no closures on the hot path).
  changed(key, value) {
    if (this.cache[key] === value) return false;
    this.cache[key] = value;
    return true;
  }

  update(dt) {
    const g = this.g, r = g.riderCtrl, el = this.el;
    if (!r) return;
    const elapsed = Math.max(0, dt || 0);
    if (this.scoreFeedbackTime > 0) {
      this.scoreFeedbackTime = Math.max(0, this.scoreFeedbackTime - elapsed);
      if (!this.scoreFeedbackTime) el.score?.classList.remove('hud-score-gain', 'hud-score-penalty');
    }
    if (this.noticeTime > 0) {
      this.noticeTime = Math.max(0, this.noticeTime - elapsed);
      if (!this.noticeTime && el.status) el.status.textContent = '';
    }

    // Score: quick count-up so pickups feel rewarding but the number is never stale.
    const target = Number.isFinite(g.score) ? g.score : 0;
    if (dt <= 0 || Math.abs(target - this.shownScore) < 1 || target < this.shownScore) this.shownScore = target;
    else this.shownScore += (target - this.shownScore) * Math.min(1, dt * 14);
    const scoreText = Math.floor(this.shownScore + 0.001);
    if (this.changed('score', scoreText) && el.score) el.score.textContent = `${scoreText}`;

    // Hearts: filled/empty state with a pop on every change.
    const hearts = Math.max(0, g.hearts);
    if (hearts !== this.lastHearts) {
      const list = el.hearts ? el.hearts.children : [];
      for (let i = 0; i < list.length; i++) {
        const node = list[i], full = i < hearts;
        const changed = this.lastHearts >= 0 && node.classList.contains('full') !== full;
        node.classList.toggle('full', full);
        if (changed) { node.classList.remove('pop'); void node.getBoundingClientRect(); node.classList.add('pop'); }
      }
      el.heartsBox?.classList.toggle('danger', hearts === 1);
      this.lastHearts = hearts;
    }

    // Combo multiplier
    const mult = g.coinMultiplier * (r.activeDouble ? 2 : 1);
    if (this.changed('mult', mult) && el.mult) {
      el.mult.textContent = `x${mult}`;
      if (mult > this.lastMult) { el.mult.classList.remove('up'); void el.mult.offsetWidth; el.mult.classList.add('up'); }
      this.lastMult = mult;
    }

    // Progress
    if (el.progress && g.trackGen.roundData) {
      const pct = Math.min(100, Math.max(0, (r.s / g.trackGen.roundData.length) * 100));
      const rounded = Math.round(pct * 10) / 10;
      if (this.changed('progress', rounded)) el.progress.style.width = `${rounded}%`;
    }

    // Speed read-out
    if (el.speed) {
      const kmh = Math.round(r.forwardSpeed * 3.6);
      const mode = r.activeOverdrive ? '★ STAR TURBO' : r.downhillIntensity > 0.4 ? '↓ DOWNHILL RUSH' : 'SKY CRUISE';
      if (this.changed('kmh', kmh) && el.num) el.num.textContent = `${kmh}`;
      const bar = Math.round(Math.min(1, r.forwardSpeed / window.ScooterTuning.maxSpeed) * 50) * 2;
      if (this.changed('spdw', bar) && el.fill) el.fill.style.width = `${bar}%`;
      if (this.changed('mode', mode) && el.mode) el.mode.textContent = mode;
      const turbo = r.activeOverdrive, down = !turbo && r.downhillIntensity > 0.4;
      if (this.changed('turbo', turbo)) el.speed.classList.toggle('turbo', turbo);
      if (this.changed('down', down)) el.speed.classList.toggle('downhill', down);
    }

    const glide = !!r.activeAntigravity;
    if (this.changed('glide', glide)) document.body.classList.toggle('glide-ready', glide);
    this.updateChips(r);
  }

  updateChips(r) {
    const power = this.el.power;
    if (!power) return;
    let anchor = null;
    for (const def of this.defs) {
      const on = !!def.active(r);
      let chip = this.chips.get(def.key);
      if (!on) { if (chip) { chip.node.remove(); this.chips.delete(def.key); } continue; }
      const time = Math.max(0, def.time(r) || 0);
      if (!chip) {
        const node = document.createElement('span');
        node.className = `powerup-badge ${def.cls}`;
        node.innerHTML = `<span class="chip-ring"><svg class="ico"><use href="#${def.icon}"/></svg></span>` +
          `<span class="chip-text"><b>${def.label}</b><i></i>${def.hint ? '<small></small>' : ''}</span>`;
        chip = { node, time: node.querySelector('i'), hint: node.querySelector('small'), max: Math.max(def.max, time), text: '', hintText: '' };
        this.chips.set(def.key, chip);
        // Keep a stable visual order regardless of activation order.
        power.insertBefore(node, anchor ? anchor.nextSibling : power.firstChild);
      }
      if (time > chip.max) chip.max = time;
      const label = (def.extra ? def.extra(r) + ' · ' : '') + (def.decimals ? time.toFixed(def.decimals) : Math.ceil(time)) + 's';
      if (label !== chip.text) {
        chip.text = label; chip.time.textContent = label;
        chip.node.setAttribute('aria-label', `${def.label}: ${label}`);
        chip.node.title = def.label;
      }
      chip.node.style.setProperty('--p', Math.max(0, Math.min(1, time / chip.max)).toFixed(3));
      if (def.hint) {
        const h = def.hint(r);
        if (h !== chip.hintText) { chip.hintText = h; chip.hint.textContent = h; }
      }
      anchor = chip.node;
    }
  }
};
