// LOUFFI CITY RUSH — LOUFFI EDITION
// Main Game Engine, State Machine, HUD & Loop Coordinator
window.SkyScooterGame = class SkyScooterGame {
  constructor() {
    this.THREE = window.THREE;
    this.state = 'BOOT'; // BOOT, INTRO, MENU, ROUND_SELECT, HOW_TO_PLAY, SETTINGS, COUNTDOWN, PLAYING, PAUSED, ROUND_COMPLETE, GAME_OVER, ENDLESS
    this.currentRoundId = 1;
    this.isEndless = false;

    // Simulation & Scoring
    this.hearts = 3;
    this.maxHearts = 3;
    this.score = 0;
    this.distanceScore = 0;
    this.coinScore = 0;
    this.gemScore = 0;
    this.jumpScore = 0;
    this.consecutiveCoins = 0;
    this.coinMultiplier = 1;
    this.coinsCollectedThisRun = 0;
    this.totalSpawnedCoinsEstimate = 50;

    // Unique run ID for idempotent reward transactions
    this.currentRunTxId = '';

    // Machine Learning Window Tracker
    this.mlWindowTimer = 0.0;
    this.mlWindowFeaturesSnapshot = null;
    this.mlWindowHadDamage = false;

    // 3D Scene Core
    this.container = document.getElementById('canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.dirLight = null;
    this.hemiLight = null;
    this.sky = null;

    // Systems
    this.factory = null;
    this.trackGen = null;
    this.input = null;
    this.riderCtrl = null;
    this.gameCam = null;
    this.ml = null;
    this.validator = null;

    // Timing
    this.lastTime = 0;
    this.countdownSeconds = 3;
    this.countdownTimer = null;
    this.fps = 60;
    this.fpsFrames = 0;
    this.fpsLastTime = 0;

    this.init();
  }

  init() {
    this.initThree();
    this.factory = new window.AssetFactory(this.THREE);
    this.trackGen = new window.TrackGenerator(this.scene, this.factory, this.THREE);
    this.worldMagic = new window.WorldMagic(this.scene, this.THREE);
    this.sky = new window.SkyAtmosphere(this.scene, this.THREE, this.factory, this.trackGen);
    this.input = new window.InputManager();
    this.ml = new window.AdaptiveDifficultyML();
    this.validator = new window.ReachabilityValidator();

    // Create player rider with scooter
    const riderMesh = this.factory.createRiderWithScooter();
    this.scene.add(riderMesh);
    this.riderCtrl = new window.RiderController(riderMesh, this.trackGen);
    this.gameCam = new window.GameCamera(this.camera, this.THREE);
    this.arcadeEffects = new window.ArcadeEffects(this.scene, this.THREE);

    // Wire input pause callback
    this.input.onPauseRequested = () => {
      if (this.state === 'PLAYING') this.pause();
      else if (this.state === 'PAUSED') this.resume();
    };

    // Apply saved settings
    const settings = window.GameStorage.getSettings();
    this.input.updateSensitivity(settings.steeringSensitivity);
    this.applyGraphicsQuality(settings.graphicsQuality);

    this.initSession();
    this.initUI();
    this.showIntro();

    // Start loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initThree() {
    const THREE = this.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x4fc3f7);
    this.scene.fog = new THREE.FogExp2(0xb3e5fc, 0.006);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 800);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    this.hemiLight = new THREE.HemisphereLight(0xc8eaff, 0xc4ad83, 2.0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff0da, 2.5);
    this.dirLight.position.set(20, 40, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 150;
    Object.assign(this.dirLight.shadow.camera,{left:-25,right:25,top:35,bottom:-25});
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.04;
    this.scene.add(this.dirLight.target);
    this.scene.add(this.dirLight);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  applyGraphicsQuality(quality) {
    if (!this.renderer) return;
    if (quality === 'low') {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = false;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
      this.renderer.shadowMap.enabled = true;
    }
    if (this.sky) this.sky.setQuality(quality);
    if (this.container) this.container.classList.toggle('candy-grade', quality !== 'low');
    document.body.classList.toggle('reduced-motion', !!window.GameStorage.getSettings().reducedMotion);
  }

  applyRoundAtmosphere(roundData) {
    const THREE = this.THREE;
    const sky = new THREE.Color(roundData.skyColor);
    const fog = new THREE.Color(roundData.fogColor);
    const hsl = {};
    sky.getHSL(hsl);
    const isNight = ['neon', 'moon'].includes(roundData.theme);
    const theme = roundData.theme || '';
    const isWarm = theme === 'sunset' || theme === 'volcano' || theme === 'desert';
    const isStorm = theme === 'storm';

    this.scene.background = sky.clone();
    this.scene.fog = new THREE.FogExp2(fog, this.fogDensityFor(roundData));

    // Hemisphere fill uses the round's ambient tint, grounded by a cool/warm floor.
    const hemiSky = new THREE.Color(roundData.ambientLight || 0xffffff);
    const hemiGround = isNight ? new THREE.Color(0x1c2333) : new THREE.Color(0x8d6e63);
    this.hemiLight.color.copy(hemiSky);
    this.hemiLight.groundColor.copy(hemiGround);

    // Key light: warm sun for day, amber for sunset, cool moon for night.
    let dirColor, dirIntensity, hemiIntensity, exposure;
    if (isNight) {
      dirColor = new THREE.Color(0xaecbff);
      dirIntensity = 1.5;
      hemiIntensity = 1.45;
      exposure = 1.2;
    } else if (isStorm) {
      dirColor = new THREE.Color(0xe8f4ff);
      dirIntensity = 1.2;
      hemiIntensity = 0.8;
      exposure = 1.0;
    } else if (isWarm) {
      dirColor = new THREE.Color(0xffd0a0);
      dirIntensity = 1.9;
      hemiIntensity = 1.2;
      exposure = 1.2;
    } else {
      dirColor = new THREE.Color(0xfff2dc);
      dirIntensity = 2.2;
      hemiIntensity = 1.35;
      exposure = 1.25;
    }

    this.hemiLight.intensity = hemiIntensity;
    this.dirLight.color.copy(dirColor);
    this.dirLight.intensity = dirIntensity;
    this.renderer.toneMappingExposure = exposure;
    this.applyEnvironment(roundData);

    if (this.sky) this.sky.applyRound(roundData);
  }

  applyEnvironment(round) {
    if(this.environmentCity===round.city)return;
    // A small sky panorama produces soft material reflections without six
    // full-resolution scene captures every time the player changes city.
    const T=this.THREE,w=256,h=128,pixels=new Uint8Array(w*h*4);
    const top=new T.Color(round.skyColor),horizon=new T.Color(round.fogColor),ground=new T.Color(0x827462);
    for(let row=0;row<h;row++){
      const y=-Math.cos(row/(h-1)*Math.PI),c=y>0?horizon.clone().lerp(top,Math.pow(y,.55)):horizon.clone().lerp(ground,-y);
      for(let col=0;col<w;col++){const i=(row*w+col)*4;pixels[i]=Math.round(c.r*255);pixels[i+1]=Math.round(c.g*255);pixels[i+2]=Math.round(c.b*255);pixels[i+3]=255;}
    }
    const texture=new T.DataTexture(pixels,w,h);texture.mapping=T.EquirectangularReflectionMapping;texture.needsUpdate=true;
    const pmrem=new T.PMREMGenerator(this.renderer),map=pmrem.fromEquirectangular(texture);
    this.environmentMap?.dispose();this.environmentMap=map;this.scene.environment=map.texture;this.environmentCity=round.city;
    texture.dispose();pmrem.dispose();
  }

  fogDensityFor(roundData) {
    const hsl = {};
    new this.THREE.Color(roundData.skyColor).getHSL(hsl);
    if (hsl.l < 0.35) return 0.004;
    if (roundData.theme === 'storm') return 0.009;
    return 0.006;
  }

  // --- State Transitions ---

  showIntro() {
    this.state = 'INTRO';
    const introOverlay = document.getElementById('intro-overlay');
    if (introOverlay) {
      introOverlay.classList.remove('hidden');
      // Skippable on click / tap
      const skipIntro = () => {
        introOverlay.removeEventListener('click', skipIntro);
        introOverlay.classList.add('hidden');
        this.showMainMenu();
      };
      introOverlay.addEventListener('click', skipIntro);
      // Auto-advance after 3.2s
      setTimeout(() => {
        if (this.state === 'INTRO') skipIntro();
      }, 3200);
    } else {
      this.showMainMenu();
    }
  }

  showMainMenu() {
    this.saveActiveRun();
    this.hasActiveRun=false;
    this.cancelCountdown();
    this.input.resetAll();
    this.state = 'MENU';
    this.hideAllScreens();
    const menu = document.getElementById('main-menu');
    if (menu) menu.classList.remove('hidden');

    this.updateStatsDisplay();
    this.refreshContinueButton();

    // Prepare animated 3D background with Round 1 track
    const r1 = window.ROUNDS_DATA[0];
    this.trackGen.buildRound(r1, 42);
    this.applyRoundAtmosphere(r1);
    this.riderCtrl.reset(0, 0); // idle in menu

    if (window.GameAudio) window.GameAudio.startMusic();
    this.notifyAndroidState('MENU');
  }

  startRound(roundId, isEndless = false) {
    this.cancelCountdown();
    window.GameStorage.clearRun();
    this.hasActiveRun=true;this.autosaveTimer=0;
    this.input.resetAll();
    this.arcadeEffects.reset();
    this.currentRoundId = roundId;
    this.isEndless = isEndless;
    this.currentRunTxId = `run_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const roundData = isEndless
      ? { ...window.ROUNDS_DATA[15], id: 99, name: 'Endless City Tour', length: 999999, baseSpeed: 12 }
      : window.ROUNDS_DATA.find(r => r.id === roundId) || window.ROUNDS_DATA[0];

    // Reset scoring & health
    document.getElementById('hud-world').textContent = `${roundData.id === 99 ? '∞' : roundData.id} · ${roundData.name}`;
    this.hearts = 3;
    this.score = 0;
    this.distanceScore = 0;
    this.coinScore = 0;
    this.gemScore = 0;
    this.jumpScore = 0;
    this.consecutiveCoins = 0;
    this.coinMultiplier = 1;
    this.coinsCollectedThisRun = 0;
    this.totalSpawnedCoinsEstimate = Math.floor(roundData.length / 14);

    // Apply Biome atmosphere (sky, fog, lighting)
    this.applyRoundAtmosphere(roundData);

    // Build track with seeded randomness
    const seed = Date.now();
    this.trackGen.buildRound(roundData, seed);

    // Reset rider
    this.riderCtrl.reset(0, roundData.baseSpeed * window.ScooterTuning.cruiseMultiplier);
    this.gameCam.reset(this.riderCtrl.mesh, this.trackGen);

    // ML Challenge Window initialization
    this.mlWindowTimer = 0.0;
    this.mlWindowHadDamage = false;
    this.mlWindowFeaturesSnapshot = this.ml.extractFeatures(
      this.riderCtrl,
      roundData.baseSpeed,
      { densityMult: 1.0, spacingMult: 1.0 },
      roundData
    );

    this.hideAllScreens();
    this.startCountdown();
    this.saveActiveRun();
  }

  startCountdown() {
    this.cancelCountdown();this.input.resetAll();
    if (this.backgrounded || document.hidden) {this.state='PLAYING';this.pause();return;}
    window.GameAudio?.resume();window.GameAudio?.startMusic();
    this.state = 'COUNTDOWN';
    this.notifyAndroidState('COUNTDOWN');
    const countdownEl = document.getElementById('countdown-display');
    countdownEl.classList.remove('hidden');

    this.countdownSeconds = 3;
    countdownEl.innerText = '3';

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.state !== 'COUNTDOWN' || this.backgrounded || document.hidden) {this.pause();return;}
      this.countdownSeconds--;
      if (this.countdownSeconds > 0) {
        countdownEl.innerText = `${this.countdownSeconds}`;
        if (window.GameAudio) window.GameAudio.playClick();
      } else if (this.countdownSeconds === 0) {
        countdownEl.innerText = 'GO!';
        if (window.GameAudio) window.GameAudio.playJump();
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        countdownEl.classList.add('hidden');
        this.state = 'PLAYING';
        this.lastTime=performance.now();
        this.input.resetAll();
        this.notifyAndroidState('PLAYING');
        const hud = document.getElementById('gameplay-hud');
        if (hud) hud.classList.remove('hidden');
      }
    }, 800);
  }

  pause() {
    if (!['PLAYING','COUNTDOWN'].includes(this.state)) return;
    this.cancelCountdown();this.input.resetAll();
    this.state = 'PAUSED';
    this.notifyAndroidState('PAUSED');
    const pauseMenu = document.getElementById('pause-modal');
    if (pauseMenu) pauseMenu.classList.remove('hidden');
    document.getElementById('gameplay-hud')?.classList.remove('hidden');
    this.saveActiveRun();
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    if (this.backgrounded || document.hidden) return;
    const pauseMenu = document.getElementById('pause-modal');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    this.startCountdown(); // Resume with smooth countdown
  }

  // --- Gameplay Event Handler ---

  onGameplayEvent(eventType, param) {
    const settings = window.GameStorage.getSettings();

    if (eventType === 'coin') {
      this.consecutiveCoins++;
      this.coinsCollectedThisRun++;
      // Combo multiplier: +1 every 10 consecutive coins up to x5
      this.coinMultiplier = Math.min(5, 1 + Math.floor(this.consecutiveCoins / 10));

      const doubleFactor = this.riderCtrl.activeDouble ? 2 : 1;
      const pts = 10 * this.coinMultiplier * doubleFactor;
      this.coinScore += pts;
      this.score += pts;

      this.showFloatingLabel(`+${pts}`, param);
      this.arcadeEffects.burst(param, settings.reducedMotion ? 2 : 6);
      if (window.GameAudio) window.GameAudio.playCoin();
      this.vibrate(18);
    } else if (eventType === 'gem') {
      const pts = 100;
      this.gemScore += pts;
      this.score += pts;
      this.showFloatingLabel('+100 GEM!', param);
      this.arcadeEffects.burst(param, settings.reducedMotion ? 3 : 18);
      if (window.GameAudio) window.GameAudio.playGem();
      this.vibrate(40);
    } else if (eventType === 'jump_challenge' || eventType === 'roof_landing') {
      const pts = 50;
      this.jumpScore += pts;
      this.score += pts;
      this.showFloatingLabel(eventType==='roof_landing'?'+50 ROOFTOP RIDE!':'+50 JUMP CLEAR!', this.riderCtrl.mesh.position);
      if (window.GameAudio) window.GameAudio.playGem();
    } else if (eventType === 'jump') {
      if (window.GameAudio) window.GameAudio.playJump();
    } else if (eventType === 'hit_obstacle') {
      this.mlWindowHadDamage = true;
      this.consecutiveCoins = 0; // breaks combo
      this.coinMultiplier = 1;
      this.hearts--;
      this.showFloatingLabel('-1 HEART!', this.riderCtrl.mesh.position, '#f44336');
      if (window.GameAudio) window.GameAudio.playDamage();
      this.vibrate(100);

      if (this.hearts <= 0) {
        this.triggerGameOver();
      }
    } else if (eventType === 'shield_absorbed') {
      this.showFloatingLabel('SHIELD BLOCKED!', this.riderCtrl.mesh.position, '#00e5ff');
      if (window.GameAudio) window.GameAudio.playShield();
      this.vibrate(50);
    } else if (eventType === 'fall') {
      this.mlWindowHadDamage = true;
      this.consecutiveCoins = 0;
      this.coinMultiplier = 1;
      this.hearts--;
      this.showFloatingLabel('FELL! -1 HEART', this.riderCtrl.mesh.position, '#e91e63');
      if (window.GameAudio) window.GameAudio.playDamage();
      this.vibrate(120);

      if (this.hearts <= 0) {
        this.triggerGameOver();
      }
    } else if (eventType === 'heart_pickup') {
      if (this.hearts < this.maxHearts) {
        this.hearts++;
        this.showFloatingLabel('+1 HEART RESTORED!', this.riderCtrl.mesh.position, '#4caf50');
      } else {
        this.score += 50;
        this.showFloatingLabel('+50 MAX HEARTS BONUS!', this.riderCtrl.mesh.position, '#ffeb3b');
      }
      if (window.GameAudio) window.GameAudio.playPowerup();
    } else if (eventType === 'powerup') {
      if (param === 'antigravity') return; // Dedicated launch label/effect below.
      const name = param === 'overdrive' ? 'STAR TURBO · 5s' : String(param).toUpperCase();
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 4 : 32);
      this.showFloatingLabel(`${name}!`, this.riderCtrl.mesh.position, '#ffeb3b');
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(35);
    } else if (eventType === 'magic_fruit') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 8 : 56);
      this.showFloatingLabel('MAGIC FRUIT · 2 FAULT GUARDS!', this.riderCtrl.mesh.position, '#ff65d4');
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(70);
    } else if (eventType === 'magic_fault_guard') {
      this.showFloatingLabel(`MAGIC GUARD · ${param}/2 LEFT`, this.riderCtrl.mesh.position, '#ff8ce7');
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 3 : 18);
      if (window.GameAudio) window.GameAudio.playShield();
      this.vibrate(55);
    } else if (eventType === 'antigravity_launch') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 4 : 32, 0xc18aff);
      this.showFloatingLabel('ANTIGRAVITY · HOLD JUMP TO GLIDE', this.riderCtrl.mesh.position, '#dec1ff');
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(45);
    } else if (eventType === 'antigravity_end') {
      this.showFloatingLabel('GRAVITY RESTORED', this.riderCtrl.mesh.position, '#dec1ff');
    } else if (eventType === 'sky_launch') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 8 : 64);
      this.showFloatingLabel('SKY LAUNCH!', this.riderCtrl.mesh.position, '#72f5ff');
      if (window.GameAudio) window.GameAudio.playJump();
      this.vibrate(90);
    } else if (eventType === 'sky_return') {
      this.showFloatingLabel('CITY RETURN!', this.riderCtrl.mesh.position, '#72f5ff');
      if (window.GameAudio) window.GameAudio.playFinish();
      this.vibrate(35);
    } else if (eventType === 'checkpoint') {
      this.showFloatingLabel('CHECKPOINT REACHED!', this.riderCtrl.mesh.position, '#00e676');
      if (window.GameAudio) window.GameAudio.playFinish();
      this.vibrate(45);
    }
  }

  showFloatingLabel(text, position, color = '#ffd700') {
    const container = document.getElementById('floating-labels-layer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'floating-score-label';
    el.innerText = text;
    el.style.color = color;

    // Convert 3D world pos to screen coordinates
    if (position && this.camera) {
      const p = position.clone ? position.clone() : new this.THREE.Vector3(position.x, position.y + 1.2, position.z);
      p.project(this.camera);
      const x = (p.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(p.y * 0.5) + 0.5) * window.innerHeight;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    } else {
      el.style.left = '50%';
      el.style.top = '40%';
    }

    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1200);
  }

  vibrate(ms) {
    const settings = window.GameStorage.getSettings();
    if (!settings.vibration) return;

    // Android Native Bridge
    if (window.AndroidBridge && window.AndroidBridge.vibrate) {
      try {
        window.AndroidBridge.vibrate(ms);
      } catch (e) {}
    } else if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {}
    }
  }

  notifyAndroidState(stateName) {
    if (window.AndroidBridge && window.AndroidBridge.onGameStateChanged) {
      try {
        window.AndroidBridge.onGameStateChanged(stateName);
      } catch (e) {}
    }
  }

  triggerGameOver() {
    this.hasActiveRun=false;window.GameStorage.clearRun();this.cancelCountdown();
    if(this.mlWindowFeaturesSnapshot && this.mlWindowTimer>0){
      this.ml.recordWindowOutcome(this.mlWindowFeaturesSnapshot,{speed:this.riderCtrl.forwardSpeed},false);
      this.mlWindowTimer=0;
    }
    this.state = 'GAME_OVER';
    this.notifyAndroidState('GAME_OVER');
    this.hideAllScreens();

    const gameOverEl = document.getElementById('game-over-modal');
    if (gameOverEl) gameOverEl.classList.remove('hidden');

    document.getElementById('go-run-score').innerText = `${Math.floor(this.score)}`;
    const progress = window.GameStorage.getProgress();
    const best = progress.bestScores[this.currentRoundId] || 0;
    document.getElementById('go-best-score').innerText = `${Math.max(best, Math.floor(this.score))}`;

    // Record coins to wallet
    window.GameStorage.addCoins(this.coinsCollectedThisRun, this.currentRunTxId);
  }

  triggerRoundComplete() {
    this.hasActiveRun=false;window.GameStorage.clearRun();this.cancelCountdown();
    this.state = 'ROUND_COMPLETE';
    this.notifyAndroidState('ROUND_COMPLETE');
    this.hideAllScreens();

    if (window.GameAudio) window.GameAudio.playFinish();
    this.vibrate(150);

    // Scoring calculations
    const finishBonus = 500 + this.hearts * 200;
    this.score += finishBonus;

    // Calculate stars:
    // Star 1: Finished round
    // Star 2: Finished with >= 2 hearts
    // Star 3: Collected >= 70% of spawned coins
    let starsEarned = 1;
    if (this.hearts >= 2) starsEarned++;
    const collectionPercent = this.coinsCollectedThisRun / Math.max(1, this.trackGen.totalCoins);
    if (collectionPercent >= 0.7) starsEarned++;

    const isAdaptive = window.GameStorage.getSettings().adaptiveDifficulty;
    window.GameStorage.recordRoundResult(this.currentRoundId, Math.floor(this.score), starsEarned, isAdaptive, this.currentRunTxId);
    window.GameStorage.addCoins(this.coinsCollectedThisRun, this.currentRunTxId);

    const completeModal = document.getElementById('round-complete-modal');
    if (completeModal) completeModal.classList.remove('hidden');

    document.getElementById('rc-round-name').innerText = `Round ${this.currentRoundId}: ${this.trackGen.roundData.name}`;
    document.getElementById('rc-total-score').innerText = `${Math.floor(this.score)}`;
    document.getElementById('rc-distance-pts').innerText = `+${Math.floor(this.distanceScore)}`;
    document.getElementById('rc-coin-pts').innerText = `+${Math.floor(this.coinScore)}`;
    document.getElementById('rc-gem-pts').innerText = `+${Math.floor(this.gemScore)}`;
    document.getElementById('rc-bonus-pts').innerText = `+${finishBonus} (Hearts: ${this.hearts})`;

    // Stars display
    const starsContainer = document.getElementById('rc-stars');
    if (starsContainer) {
      starsContainer.innerHTML = '⭐'.repeat(starsEarned) + '☆'.repeat(3 - starsEarned);
    }

    // Next round button text
    const btnNext = document.getElementById('btn-next-round');
    if (btnNext) {
      if (this.currentRoundId >= 16) {
        btnNext.innerText = 'ENDLESS MODE';
      } else {
        btnNext.innerText = 'NEXT ROUND';
      }
    }
  }

  // --- Main Animation & Simulation Loop ---

  loop(timestamp) {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min(0.06, (timestamp - this.lastTime) / 1000.0);
    this.lastTime = timestamp;

    // Track FPS
    this.fpsFrames++;
    if (timestamp - this.fpsLastTime >= 1000) {
      this.fps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = timestamp;
      this.updateDevPanel();
    }

    const settings = window.GameStorage.getSettings();

    // 1. Process Gameplay Simulation
    if (this.state === 'PLAYING') {
      this.input.update(dt);
      this.riderCtrl.reducedMotion = !!settings.reducedMotion;

      const roundData = this.trackGen.roundData;
      this.riderCtrl.update(dt, this.input, roundData.baseSpeed * this.trackGen.speedMultiplierAt(this.riderCtrl.s), roundData.roadWidth, (ev, p) => this.onGameplayEvent(ev, p));

      // Distance score: 1 point per new forward meter
      const newDistance = Math.floor(this.riderCtrl.furthestS);
      if (newDistance > this.distanceScore) {
        const delta = newDistance - this.distanceScore;
        this.distanceScore = newDistance;
        this.score += delta;
      }

      // Update Track Generator & recycle
      this.trackGen.update(this.riderCtrl.s,dt);
      this.autosaveTimer+=dt;
      if(this.autosaveTimer>=2){this.autosaveTimer=0;this.saveActiveRun();}

      // Check finish gate reached
      if (this.state==='PLAYING' && this.riderCtrl.s >= roundData.length) {
        this.triggerRoundComplete();
      }

      // Machine Learning Challenge Window Update (Every 10 seconds of active play)
      this.mlWindowTimer += dt;
      if (this.mlWindowTimer >= this.ml.windowDuration) {
        this.ml.recordWindowOutcome(
          this.mlWindowFeaturesSnapshot,
          { speed: this.riderCtrl.forwardSpeed },
          !this.mlWindowHadDamage
        );
        this.mlWindowTimer = 0.0;
        this.mlWindowHadDamage = false;

        // Select candidate difficulty for future windows
        const riderState={...this.riderCtrl,hearts:this.hearts};
        const candidate = this.ml.selectCandidate(roundData, riderState, this.validator);
        this.trackGen.setDifficulty(candidate);
        // Snapshot the section the rider is actually entering, not a future candidate 160m away.
        const section=this.trackGen.activeSegments.find(g=>this.riderCtrl.s>=g.userData.sStart&&this.riderCtrl.s<g.userData.sEnd);
        this.mlWindowFeaturesSnapshot = this.ml.extractFeatures(riderState, this.riderCtrl.forwardSpeed, {densityMult:section?.userData.densityMult||1,spacingMult:1}, roundData);
        this.riderCtrl.recentDamageCount=0;
        this.riderCtrl.jumpAttempts=0;
        this.riderCtrl.jumpSuccesses=0;
        this.riderCtrl.steerCorrections=0;
        this.riderCtrl.coinsCollectedInWindow=0;
      }

      this.updateHUD();
    } else if (this.state === 'MENU' || this.state === 'ROUND_SELECT') {
      // Gentle menu background camera motion
      const menuS = (timestamp * 0.003) % 400;
      this.trackGen.update(menuS,this.backgrounded?0:dt);
      const tp = this.trackGen.getTrackPoint(menuS);
      this.camera.position.set(tp.x + 8, tp.y + 4, tp.z - 10);
      this.camera.lookAt(tp.x, tp.y + 1, tp.z + 10);
    }

    // 2. Camera Update
    if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
      this.gameCam.update(dt, this.riderCtrl.mesh, this.trackGen, this.riderCtrl.activeOverdrive || this.riderCtrl.downhillIntensity > .65, settings);
    }

    document.getElementById('hud-speed')?.classList.toggle('effects-paused', this.state !== 'PLAYING');
    this.arcadeEffects.update(dt, this.riderCtrl, this.trackGen, settings, this.state === 'PLAYING');
    const sceneryS=(this.state==='MENU'||this.state==='ROUND_SELECT')?this.camera.position.z:this.riderCtrl.s;
    this.worldMagic.update(this.state==='PAUSED'?0:dt,sceneryS,this.trackGen,settings);

    // Sky atmosphere follows the camera focus (menu camera or rider)
    if (this.sky) {
      const skyFocus = (this.state === 'MENU' || this.state === 'ROUND_SELECT')
        ? this.camera.position
        : (this.riderCtrl ? this.riderCtrl.mesh.position : null);
      this.sky.update(skyFocus, dt);
    }

    // 3. Render 3D Scene
    const lightS = this.riderCtrl ? this.riderCtrl.s : 0;
    const lightP = this.trackGen.getTrackPoint(lightS);
    this.dirLight.position.set(lightP.x-18,35,lightP.z-15);
    this.dirLight.target.position.set(lightP.x,0,lightP.z+12);
    this.renderer.render(this.scene, this.camera);
  }

  updateHUD() {
    const speed = document.getElementById('hud-speed');
    if (speed) {
      const rider = this.riderCtrl;
      speed.textContent = `${Math.round(rider.forwardSpeed * 3.6)} km/h · ${rider.activeOverdrive ? '★ STAR TURBO' : rider.downhillIntensity > .4 ? '↓ DOWNHILL RUSH' : 'CITY CRUISE'}`;
      speed.classList.toggle('turbo', rider.activeOverdrive);
      speed.classList.toggle('downhill', !rider.activeOverdrive && rider.downhillIntensity > .4);
    }
    // Score
    const scoreVal = document.getElementById('hud-score-val');
    if (scoreVal) scoreVal.innerText = `${Math.floor(this.score)}`;

    // Hearts
    const heartsVal = document.getElementById('hud-hearts-val');
    if (heartsVal) {
      heartsVal.innerHTML = '❤️'.repeat(Math.max(0, this.hearts)) + '🖤'.repeat(Math.max(0, 3 - this.hearts));
    }

    // Multiplier
    const multVal = document.getElementById('hud-multiplier-val');
    if (multVal) {
      const double = this.riderCtrl.activeDouble ? 2 : 1;
      const totalMult = this.coinMultiplier * double;
      multVal.innerText = `x${totalMult}`;
    }

    // Progress Bar
    const progBar = document.getElementById('hud-progress-fill');
    if (progBar && this.trackGen.roundData) {
      const pct = Math.min(100, Math.max(0, (this.riderCtrl.s / this.trackGen.roundData.length) * 100));
      progBar.style.width = `${pct}%`;
    }

    // Active Power-ups Bar
    const powBar = document.getElementById('hud-powerups');
    if (powBar) {
      let html = '';
      if (this.riderCtrl.activeAntigravity) {
        const hint = this.riderCtrl.isGliding ? 'GLIDING' : 'HOLD JUMP TO GLIDE';
        html += `<span class="powerup-badge antigravity">ANTIGRAVITY ${this.riderCtrl.antigravityTimer.toFixed(1)}s<small>${hint}</small></span>`;
      }
      if (this.riderCtrl.activeShield) {
        html += `<span class="powerup-badge shield">SHIELD ${Math.ceil(this.riderCtrl.shieldTimer)}s</span>`;
      }
      if (this.riderCtrl.activeMagnet) {
        html += `<span class="powerup-badge magnet">MAGNET ${Math.ceil(this.riderCtrl.magnetTimer)}s</span>`;
      }
      if (this.riderCtrl.activeDouble) {
        html += `<span class="powerup-badge double">2X COINS ${Math.ceil(this.riderCtrl.doubleTimer)}s</span>`;
      }
      if (this.riderCtrl.activeOverdrive) {
        html += `<span class="powerup-badge overdrive">OVERDRIVE ${Math.ceil(this.riderCtrl.overdriveTimer)}s</span>`;
      }
      if (this.riderCtrl.activeMagicRush) {
        html += `<span class="powerup-badge magic">MAGIC GUARD ${this.riderCtrl.faultGuardCharges}/2</span>`;
      }
      if (this.riderCtrl.activeSkyFlight) {
        html += `<span class="powerup-badge sky-lift">SKY LIFT ${this.riderCtrl.skyFlightTimer.toFixed(1)}s</span>`;
      }
      powBar.innerHTML = html;
    }
  }

  updateStatsDisplay() {
    const wallet = window.GameStorage.getWallet();
    const progress = window.GameStorage.getProgress();

    const coinsEl = document.getElementById('menu-total-coins');
    if (coinsEl) coinsEl.innerText = `${wallet.totalCoins || 0}`;

    const roundEl = document.getElementById('menu-highest-round');
    if (roundEl) roundEl.innerText = window.ScooterTuning.testAllRounds ? '16 / 16 · TEST ACCESS' : `${progress.highestUnlockedRound || 1} / 16`;

    let bestTotal = 0;
    Object.values(progress.bestScores).forEach(s => bestTotal = Math.max(bestTotal, s));
    const bestEl = document.getElementById('menu-best-score');
    if (bestEl) bestEl.innerText = `${bestTotal}`;
  }

  updateDevPanel() {
    const panel = document.getElementById('dev-panel');
    if (!panel || panel.classList.contains('hidden')) return;

    document.getElementById('dev-fps').innerText = `${this.fps}`;
    document.getElementById('dev-ml-state').innerText = `${this.ml.state}`;
    document.getElementById('dev-ml-examples').innerText = `${this.ml.examples.length}`;
    document.getElementById('dev-ml-predicted-p').innerText = `${(this.ml.lastPredictedP * 100).toFixed(1)}%`;
    document.getElementById('dev-ml-actual').innerText = `${this.ml.lastActualLabel === 1 ? 'Clean' : 'Damage'}`;
    document.getElementById('dev-ml-error').innerText = `${(this.ml.movingPredictionError).toFixed(3)}`;
    document.getElementById('dev-ml-candidate').innerText = `${this.ml.currentCandidate}`;
    document.getElementById('dev-track-seed').innerText = `${this.trackGen.seed}`;
  }

  hideAllScreens() {
    const screens = [
      'intro-overlay',
      'main-menu',
      'round-select-modal',
      'how-to-play-modal',
      'settings-modal',
      'gameplay-hud',
      'pause-modal',
      'game-over-modal',
      'round-complete-modal'
    ];
    screens.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  // --- UI Wiring ---

  initUI() {
    document.getElementById('btn-menu-continue')?.addEventListener('click',()=>this.continueSavedRun());
    // Main Menu Buttons
    document.getElementById('btn-menu-play')?.addEventListener('click', () => {
      const progress = window.GameStorage.getProgress();
      this.startRound(progress.highestUnlockedRound || 1);
    });

    document.getElementById('btn-menu-rounds')?.addEventListener('click', () => {
      this.showRoundSelect();
    });

    document.getElementById('btn-menu-how')?.addEventListener('click', () => {
      document.getElementById('how-to-play-modal')?.classList.remove('hidden');
    });

    document.getElementById('btn-menu-settings')?.addEventListener('click', () => {
      this.showSettings();
    });

    // Close Modals
    document.getElementById('btn-close-how')?.addEventListener('click', () => {
      document.getElementById('how-to-play-modal')?.classList.add('hidden');
    });

    document.getElementById('btn-close-rounds')?.addEventListener('click', () => {
      document.getElementById('round-select-modal')?.classList.add('hidden');
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      document.getElementById('settings-modal')?.classList.add('hidden');
    });

    // Pause & Resume
    document.getElementById('btn-hud-pause')?.addEventListener('click', () => {
      this.pause();
    });

    document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
      this.resume();
    });

    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      document.getElementById('pause-modal')?.classList.add('hidden');
      this.startRound(this.currentRoundId, this.isEndless);
    });

    document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
      this.showMainMenu();
    });

    // Game Over Buttons
    document.getElementById('btn-go-retry')?.addEventListener('click', () => {
      this.startRound(this.currentRoundId, this.isEndless);
    });

    document.getElementById('btn-go-menu')?.addEventListener('click', () => {
      this.showMainMenu();
    });

    // Round Complete Buttons
    document.getElementById('btn-next-round')?.addEventListener('click', () => {
      if (this.currentRoundId >= 16) {
        this.startRound(16, true); // Endless
      } else {
        this.startRound(this.currentRoundId + 1);
      }
    });

    document.getElementById('btn-rc-replay')?.addEventListener('click', () => {
      this.startRound(this.currentRoundId);
    });

    document.getElementById('btn-rc-menu')?.addEventListener('click', () => {
      this.showMainMenu();
    });

    // Developer Panel Toggle
    document.getElementById('btn-dev-toggle')?.addEventListener('click', () => {
      const dev = document.getElementById('dev-panel');
      if (dev) {
        dev.classList.toggle('hidden');
        this.updateDevPanel();
      }
    });

    this.wireSettingsForm();
  }

  showRoundSelect() {
    const modal = document.getElementById('round-select-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const grid = document.getElementById('rounds-grid');
    grid.innerHTML = '';

    const progress = window.GameStorage.getProgress();
    const highest = progress.highestUnlockedRound || 1;

    window.ROUNDS_DATA.forEach(round => {
      const isUnlocked = window.ScooterTuning.testAllRounds || round.id <= highest;
      const card = document.createElement('div');
      card.className = `round-card ${isUnlocked ? 'unlocked' : 'locked'}`;

      const stars = progress.stars[round.id] || 0;
      const starsDisplay = isUnlocked ? '⭐'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒';
      const best = progress.bestScores[round.id] || 0;

      card.innerHTML = `
        <div class="rc-number">Round ${round.id}</div>
        <div class="rc-title">${round.name}</div>
        <div class="rc-meta">${round.length}m • ${Math.round(round.baseSpeed * window.ScooterTuning.cruiseMultiplier * 3.6)} km/h cruise</div>
        <div class="rc-desc">${round.description}</div>
        <div class="rc-stars">${starsDisplay}</div>
        ${isUnlocked ? `<div class="rc-best">Best: ${best}</div>` : '<div class="rc-locked-msg">Locked</div>'}
      `;

      if (isUnlocked) {
        card.addEventListener('click', () => {
          modal.classList.add('hidden');
          this.startRound(round.id);
        });
      }

      grid.appendChild(card);
    });
  }

  showSettings() {
    this.pause();
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const s = window.GameStorage.getSettings();
    document.getElementById('set-music').checked = s.music;
    document.getElementById('set-sfx').checked = s.sfx;
    document.getElementById('set-vibration').checked = s.vibration;
    document.getElementById('set-sensitivity').value = s.steeringSensitivity;
    document.getElementById('set-graphics').value = s.graphicsQuality;
    document.getElementById('set-reduced-motion').checked = s.reducedMotion;
    document.getElementById('set-adaptive').checked = s.adaptiveDifficulty;
  }

  wireSettingsForm() {
    const saveAndApply = () => {
      const s = {
        music: document.getElementById('set-music').checked,
        sfx: document.getElementById('set-sfx').checked,
        vibration: document.getElementById('set-vibration').checked,
        steeringSensitivity: parseFloat(document.getElementById('set-sensitivity').value),
        graphicsQuality: document.getElementById('set-graphics').value,
        reducedMotion: document.getElementById('set-reduced-motion').checked,
        adaptiveDifficulty: document.getElementById('set-adaptive').checked
      };
      window.GameStorage.saveSettings(s);
      this.input.updateSensitivity(s.steeringSensitivity);
      this.applyGraphicsQuality(s.graphicsQuality);
      if (window.GameAudio) window.GameAudio.updateVolumes();
    };

    ['set-music', 'set-sfx', 'set-vibration', 'set-sensitivity', 'set-graphics', 'set-reduced-motion', 'set-adaptive'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', saveAndApply);
    });

    document.getElementById('btn-reset-ml')?.addEventListener('click', () => {
      this.ml.reset();
      alert('Adaptive Machine Learning training weights have been reset.');
      this.updateDevPanel();
    });

    document.getElementById('btn-reset-progress')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all unlocked rounds and campaign progress?')) {
        window.GameStorage.resetProgress();
        alert('Campaign progress reset.');
        this.updateStatsDisplay();
      }
    });
  }
};
