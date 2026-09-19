// SKY SCOOTER — LOUFFI EDITION
// Pure Web Audio API Sound Synthesizer & Music Engine (Zero External Audio Files)
window.GameAudio = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  isMusicPlaying: false,
  musicTimer: null,
  musicStep: 0,
  chordIndex: 0,

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);

      this.updateVolumes();
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  updateVolumes() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { music: true, sfx: true };
    if (this.musicGain) {
      this.musicGain.gain.setValueAtTime(settings.music ? 0.22 : 0.0, this.ctx.currentTime);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(settings.sfx ? 0.5 : 0.0, this.ctx.currentTime);
    }
  },

  playCoin() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.06); // E6

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.26);
  },

  playGem() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);
      gain.gain.setValueAtTime(0.25, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.21);
    });
  },

  playJump() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.21);
  },

  playDamage() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    // Low punch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.29);
  },

  playShield() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.3);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.36);
  },

  playPowerup() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const chord = [440, 554.37, 659.25, 880];
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);
      gain.gain.setValueAtTime(0.3, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.3);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.32);
    });
  },

  playFinish() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const chords = [
      [523.25, 659.25, 783.99], // C
      [587.33, 739.99, 880.00], // D
      [659.25, 830.61, 987.77], // E
      [783.99, 987.77, 1174.66, 1567.98] // G high
    ];
    chords.forEach((chord, step) => {
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + step * 0.18);
        gain.gain.setValueAtTime(0.2, t + step * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, t + step * 0.18 + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t + step * 0.18);
        osc.stop(t + step * 0.18 + 0.45);
      });
    });
  },

  playClick() {
    if (!this.ctx) return;
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { sfx: true };
    if (!settings.sfx) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.04);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.06);
  },

  // Synthesized melodic background loop: upbeat sky adventure
  startMusic() {
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { music: true };
    if (!settings.music || this.isMusicPlaying) return;
    this.resume();
    if (!this.ctx) return;

    this.isMusicPlaying = true;
    this.updateVolumes();

    // Scale notes: C major / A minor pentatonic sky groove
    const progression = [
      { bass: 130.81, arpeggios: [261.63, 329.63, 392.00, 523.25] }, // C
      { bass: 174.61, arpeggios: [349.23, 440.00, 523.25, 698.46] }, // F
      { bass: 110.00, arpeggios: [220.00, 261.63, 329.63, 440.00] }, // Am
      { bass: 196.00, arpeggios: [392.00, 493.88, 587.33, 783.99] }  // G
    ];

    let currentMeasure = 0;
    let step = 0;

    const playBeat = () => {
      if (!this.isMusicPlaying || !this.ctx) return;
      const t = this.ctx.currentTime;
      const chord = progression[currentMeasure % progression.length];

      // Bass note on downbeats
      if (step === 0 || step === 4) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(chord.bass, t);
        bassGain.gain.setValueAtTime(0.18, t);
        bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(t);
        bassOsc.stop(t + 0.36);
      }

      // Melody arpeggio
      const noteFreq = chord.arpeggios[step % chord.arpeggios.length];
      const melOsc = this.ctx.createOscillator();
      const melGain = this.ctx.createGain();
      melOsc.type = 'sine';
      melOsc.frequency.setValueAtTime(noteFreq, t);
      melGain.gain.setValueAtTime(0.12, t);
      melGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      melOsc.connect(melGain);
      melGain.connect(this.musicGain);
      melOsc.start(t);
      melOsc.stop(t + 0.18);

      step++;
      if (step >= 8) {
        step = 0;
        currentMeasure++;
      }

      this.musicTimer = setTimeout(playBeat, 180);
    };

    playBeat();
  },

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
};
