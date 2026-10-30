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
    this.obstaclePenaltyScore = 0;
    this.obstaclePenalty = window.ScooterTuning.obstacleHitPenalty;
    this.consecutiveCoins = 0;
    this.coinMultiplier = 1;
    this.coinsCollectedThisRun = 0;
    this.totalSpawnedCoinsEstimate = 50;

    // Ad flow state
    this.revivesUsed = 0;
    this.rewardedRequestPending = false;
    this.waitingForGameOverInterstitial = false;
    this.gameOverInterstitialShown = false;
    this.adRequestSequence = 0;
    this.activeInterstitialRequestId = null;
    this.activeRewardedRequestId = null;

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
    this.arcadeEffects.setCamera(this.camera);
    this.riderFx = new window.RiderFx(this.scene, this.THREE);
    this.riderFx.onLand = (power) => {
      this.gameCam.impact(power);
      if (power > 0.3) this.vibrate(power > 0.7 ? [0, 18, 20, 12] : 14);
    };

    // Wire input pause callback
    this.input.onPauseRequested = () => {
      if (this.state === 'PLAYING') this.pause();
      else if (this.state === 'PAUSED') this.resume();
    };

    // Apply saved settings
    const settings = window.GameStorage.getSettings();
    this.input.applySettings(settings);
    this.input.onHaptic = (kind) => this.vibrate({ jump: 10, brake: 8, stick: 6 }[kind] || 8);
    this.hud = new window.HudController(this);
    this.applyGraphicsQuality();
    this.applyFpsCounter(settings);

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

    // Probe the GPU first: post-fx tiers render into an HDR target, so the canvas itself
    // needs no MSAA (saves memory bandwidth); only the direct low tier wants it.
    const profile = window.GraphicsManager.probe();
    const savedQuality = window.GameStorage.getSettings().graphicsQuality;
    const tier = ['low', 'medium', 'high'].includes(savedQuality) ? savedQuality : profile.tier;
    const options = { antialias: tier === 'low', alpha: false, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
    try {
      this.renderer = new THREE.WebGLRenderer(options);
    } catch (_) {
      this.renderer = new THREE.WebGLRenderer({ antialias: false, failIfMajorPerformanceCaveat: false });
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Lighting rig: warm key with shadows, sky/ground hemisphere fill and a cool rim
    // light from ahead that outlines the rider and props against the background.
    this.hemiLight = new THREE.HemisphereLight(0xc8eaff, 0xc4ad83, 1.0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff0da, 2.4);
    this.dirLight.position.set(20, 40, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    const sc = this.dirLight.shadow.camera;
    sc.near = 1; sc.far = 140; sc.left = -22; sc.right = 22; sc.top = 40; sc.bottom = -18;
    sc.updateProjectionMatrix();
    this.dirLight.shadow.bias = -0.0003;
    this.dirLight.shadow.normalBias = 0.05;
    this.scene.add(this.dirLight.target);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0x9fd8ff, 0.9);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight.target);
    this.scene.add(this.rimLight);

    this.gfx = new window.GraphicsManager(this);
    this.post = this.gfx.post;
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.gfx.resize();
  }

  applyGraphicsQuality() {
    if (!this.renderer || !this.gfx) return;
    this.gfx.apply(window.GameStorage.getSettings());
    document.body.classList.toggle('reduced-motion', !!window.GameStorage.getSettings().reducedMotion);
  }

  // Exposure lives in one place: the composite pass when post-fx is on, the renderer otherwise.
  applyExposure() {
    const e = this.roundExposure || 1.0;
    if (this.gfx?.postActive) {
      this.post.baseExposure = e;
      this.renderer.toneMappingExposure = 1.0;
    } else {
      this.post.baseExposure = 1.0;
      this.renderer.toneMappingExposure = e * 0.85;
    }
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

    // Key light: warm sun for day, amber for sunset, cool moon for night. Values target the
    // neutral HDR tone-mapper: most lit surfaces land in 0.3-0.9 so only highlights bloom.
    let dirColor, dirIntensity, hemiIntensity, exposure, rimColor, rimIntensity;
    if (isNight) {
      dirColor = new THREE.Color(0xaecbff);
      dirIntensity = 1.9; hemiIntensity = 1.15; exposure = 1.12;
      rimColor = new THREE.Color(0x86a4ff); rimIntensity = 1.3;
    } else if (isStorm) {
      dirColor = new THREE.Color(0xe8f4ff);
      dirIntensity = 1.7; hemiIntensity = 0.85; exposure = 1.0;
      rimColor = new THREE.Color(0x9fd9ff); rimIntensity = 1.0;
    } else if (isWarm) {
      // Keep the warm sky/rim, but avoid painting every nearby material orange.
      dirColor = new THREE.Color(0xffd8ad);
      dirIntensity = 2.3; hemiIntensity = 0.92; exposure = 1.0;
      rimColor = new THREE.Color(0xffa26b); rimIntensity = 1.2;
    } else {
      dirColor = new THREE.Color(0xfff0d6);
      dirIntensity = 2.35; hemiIntensity = 1.0; exposure = 1.0;
      rimColor = new THREE.Color(0xa6d8ff); rimIntensity = 0.95;
    }

    this.hemiLight.intensity = hemiIntensity;
    this.dirLight.color.copy(dirColor);
    this.dirLight.intensity = dirIntensity;
    this.rimLight.color.copy(rimColor);
    this.rimLight.intensity = rimIntensity;
    this.roundExposure = exposure;
    this.applyExposure();
    this.post.applyPreset(theme);
    window.SceneFx?.setWorld(roundData, this);
    this.applyEnvironment(roundData);

    if (this.sky) this.sky.applyRound(roundData);
  }

  applyEnvironment(round) {
    if(this.environmentCity===round.theme)return;
    // A small sky panorama produces soft material reflections without six
    // full-resolution scene captures every time the player changes world.
    const T=this.THREE,w=256,h=128,pixels=new Uint8Array(w*h*4);
    const top=new T.Color(round.skyColor),horizon=new T.Color(round.fogColor),ground=new T.Color(0x827462);
    for(let row=0;row<h;row++){
      const y=-Math.cos(row/(h-1)*Math.PI),c=y>0?horizon.clone().lerp(top,Math.pow(y,.55)):horizon.clone().lerp(ground,-y);
      for(let col=0;col<w;col++){const i=(row*w+col)*4;pixels[i]=Math.round(c.r*255);pixels[i+1]=Math.round(c.g*255);pixels[i+2]=Math.round(c.b*255);pixels[i+3]=255;}
    }
    const texture=new T.DataTexture(pixels,w,h);texture.mapping=T.EquirectangularReflectionMapping;texture.needsUpdate=true;
    const pmrem=new T.PMREMGenerator(this.renderer),map=pmrem.fromEquirectangular(texture);
    this.environmentMap?.dispose();this.environmentMap=map;this.scene.environment=map.texture;this.environmentCity=round.theme;
    texture.dispose();pmrem.dispose();
  }

  fogDensityFor(roundData) {
    const hsl = {};
    new this.THREE.Color(roundData.skyColor).getHSL(hsl);
    if (hsl.l < 0.35) return 0.004;
    if (roundData.theme === 'storm') return 0.009;
    // Warm worlds have bright, saturated fog: thinner so far hazards keep their contrast.
    if (['desert', 'temple', 'sunset', 'volcano'].includes(roundData.theme)) return 0.0048;
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
    this.resetAdRequestState();
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
    this.riderFx.reset();
    this.menuS = 0;
    this.camera.fov = 52; this.camera.updateProjectionMatrix();

    if (window.GameAudio) window.GameAudio.startMusic();
    this.notifyAndroidState('MENU');
  }

  startRound(roundId, isEndless = false, bypassProgression = false) {
    const progress = window.GameStorage.getProgress();
    const highest = progress.highestUnlockedRound || 1;
    if (!bypassProgression && !isEndless && roundId > highest) {
      console.warn(`Round ${roundId} is locked. Highest unlocked is ${highest}.`);
      return;
    }
    this.cancelCountdown();
    window.GameStorage.clearRun();
    this.hasActiveRun=true;this.autosaveTimer=0;
    this.input.resetAll();
    this.arcadeEffects.reset();
    this.riderFx.reset();
    this.currentRoundId = roundId;
    this.isEndless = isEndless;
    this.currentRunTxId = `run_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const roundData = isEndless
      ? { ...window.ROUNDS_DATA[15], id: 99, name: 'Endless Sky Tour', length: 999999, baseSpeed: 12 }
      : window.ROUNDS_DATA.find(r => r.id === roundId) || window.ROUNDS_DATA[0];

    // Reset scoring & health
    document.getElementById('hud-world').textContent = `${roundData.id === 99 ? '∞' : roundData.id} · ${roundData.name}`;
    this.hearts = 3;
    this.revivesUsed = 0;
    this.resetAdRequestState();
    this.score = 0;
    this.distanceScore = 0;
    this.coinScore = 0;
    this.gemScore = 0;
    this.jumpScore = 0;
    this.obstaclePenaltyScore = 0;
    this.consecutiveCoins = 0;
    this.coinMultiplier = 1;
    this.coinsCollectedThisRun = 0;
    this.totalSpawnedCoinsEstimate = Math.floor(roundData.length / 14);
    this.hud?.reset();

    // Apply Biome atmosphere (sky, fog, lighting)
    this.applyRoundAtmosphere(roundData);

    // Build track with seeded randomness
    const seed = Date.now();
    this.trackGen.buildRound(roundData, seed);

    // Reset rider
    this.riderCtrl.reset(0, roundData.baseSpeed * window.ScooterTuning.cruiseMultiplier);
    this.gameCam.reset(this.riderCtrl.mesh, this.trackGen);
    this.gameCam.startIntro(2.6);

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
        this.input.calibrateTilt?.();
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
    // An explicit Resume tap is the user's foreground acknowledgement. Clear
    // a stale blur flag, but never resume while the document is actually hidden.
    if (document.hidden) return;
    this.backgrounded = false;
    const pauseMenu = document.getElementById('pause-modal');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    this.startCountdown(); // Resume with smooth countdown
  }

  applyObstaclePenalty(amount = null, position = this.riderCtrl?.mesh?.position) {
    const penalty = amount ?? this.obstaclePenalty ?? window.ScooterTuning.obstacleHitPenalty;
    const currentScore = Number.isFinite(this.score) ? this.score : 0;
    const nextScore = Math.max(0, currentScore - penalty);
    const lostPoints = Math.max(0, currentScore - nextScore);
    this.score = nextScore;

    // Keep damage feedback in the score/heart HUD so hazards remain visible.
    this.hud?.scoreChanged('loss');
    return lostPoints;
  }

  // --- Gameplay Event Handler ---

  onGameplayEvent(eventType, param) {
    // A lethal hit ends rewards immediately, even within a physics substep.
    if (this.state === 'GAME_OVER') return;
    const settings = window.GameStorage.getSettings();

    // Post-fx feedback: a red flash on damage, a brief chromatic kick on pickups and guards.
    if (this.post && !settings.reducedMotion) {
      const react = { hit_obstacle: ['flash', 0.85], fall: ['flash', 1.0], shield_absorbed: ['kick', 0.5],
        magic_fault_guard: ['kick', 0.5], powerup: ['kick', 0.35], magic_fruit: ['kick', 0.6], sky_launch: ['kick', 0.7],
        antigravity_launch: ['kick', 0.5], checkpoint: ['kick', 0.3] }[eventType];
      if (react) this.post[react[0]](react[1]);
    }

    if (eventType === 'coin') {
      this.consecutiveCoins++;
      this.coinsCollectedThisRun++;
      // Combo multiplier: +1 every 10 consecutive coins up to x5
      this.coinMultiplier = Math.min(5, 1 + Math.floor(this.consecutiveCoins / 10));

      const doubleFactor = this.riderCtrl.activeDouble ? 2 : 1;
      const pts = 10 * this.coinMultiplier * doubleFactor;
      this.coinScore += pts;
      this.score += pts;

      this.hud?.scoreChanged();
      this.arcadeEffects.burst(param, settings.reducedMotion ? 2 : 6);
      if (window.GameAudio) window.GameAudio.playCoin();
      this.vibrate(18);
    } else if (eventType === 'gem') {
      const pts = 100;
      this.gemScore += pts;
      this.score += pts;
      this.hud?.scoreChanged();
      this.arcadeEffects.burst(param, settings.reducedMotion ? 3 : 18);
      if (window.GameAudio) window.GameAudio.playGem();
      this.vibrate(40);
    } else if (eventType === 'jump_challenge') {
      const pts = 50;
      this.jumpScore += pts;
      this.score += pts;
      this.hud?.scoreChanged();
      if (window.GameAudio) window.GameAudio.playGem();
    } else if (eventType === 'jump') {
      if (window.GameAudio) window.GameAudio.playJump();
    } else if (eventType === 'hit_obstacle') {
      this.mlWindowHadDamage = true;
      this.consecutiveCoins = 0; // breaks combo
      this.coinMultiplier = 1;
      const lostPoints = this.applyObstaclePenalty(this.obstaclePenalty, this.riderCtrl.mesh.position);
      this.hearts = Math.max(0, this.hearts - 1);
      this.obstaclePenaltyScore += lostPoints;
      if (this.arcadeEffects?.triggerScreenShake) {
        this.arcadeEffects.triggerScreenShake(0.18, 0.22);
      }
      if (this.arcadeEffects?.burst) {
        this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 3 : 12, 0xff5722);
      }
      if (window.GameAudio) window.GameAudio.playDamage();
      this.vibrate(100);

      if (this.hearts <= 0) {
        this.triggerGameOver();
      }
    } else if (eventType === 'shield_absorbed') {
      this.hud?.notice('SHIELD BLOCKED');
      if (window.GameAudio) window.GameAudio.playShield();
      this.vibrate(50);
    } else if (eventType === 'fall') {
      this.mlWindowHadDamage = true;
      this.consecutiveCoins = 0;
      this.coinMultiplier = 1;
      this.applyObstaclePenalty(70, this.riderCtrl.mesh.position);
      this.hearts--;
      if (this.arcadeEffects?.triggerScreenShake) {
        this.arcadeEffects.triggerScreenShake(0.24, 0.25);
      }
      if (window.GameAudio) window.GameAudio.playDamage();
      this.vibrate(120);

      if (this.hearts <= 0) {
        this.triggerGameOver();
      }
    } else if (eventType === 'heart_pickup') {
      if (this.hearts < this.maxHearts) {
        this.hearts++;
      } else {
        this.score += 50;
        this.hud?.scoreChanged();
      }
      if (window.GameAudio) window.GameAudio.playPowerup();
    } else if (eventType === 'powerup') {
      if (param === 'antigravity') return; // Dedicated launch effect below.
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 4 : 32);
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(35);
    } else if (eventType === 'magic_fruit') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 8 : 56);
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(70);
    } else if (eventType === 'magic_fault_guard') {
      this.hud?.notice('MAGIC GUARD BLOCKED');
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 3 : 18);
      if (window.GameAudio) window.GameAudio.playShield();
      this.vibrate(55);
    } else if (eventType === 'antigravity_launch') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 4 : 32, 0xc18aff);
      if (window.GameAudio) window.GameAudio.playPowerup();
      this.vibrate(45);
    } else if (eventType === 'antigravity_end') {
      this.hud?.notice('GRAVITY RESTORED');
    } else if (eventType === 'sky_launch') {
      this.arcadeEffects.burst(this.riderCtrl.mesh.position, settings.reducedMotion ? 8 : 64);
      if (window.GameAudio) window.GameAudio.playJump();
      this.vibrate(90);
    } else if (eventType === 'sky_return') {
      if (window.GameAudio) window.GameAudio.playFinish();
      this.vibrate(35);
    } else if (eventType === 'checkpoint') {
      this.hud?.notice('CHECKPOINT REACHED');
      if (window.GameAudio) window.GameAudio.playFinish();
      this.vibrate(45);
    }
  }

  // Haptics: a number is a single pulse, an array is an [pause, vibrate, pause, vibrate...] pattern.
  // Strength (0.5-1.5) scales pulse lengths; native builds map lengths to amplitude.
  vibrate(pattern) {
    const settings = window.GameStorage.getSettings();
    if (!settings.vibration) return;
    const k = Math.max(0.4, Math.min(1.6, Number(settings.hapticStrength) || 1));
    const scaled = Array.isArray(pattern) ? pattern.map((v, i) => (i % 2 ? Math.round(v * k) : v)) : Math.round(pattern * k);
    if (window.AndroidBridge) {
      try {
        if (Array.isArray(scaled) && window.AndroidBridge.vibratePattern) window.AndroidBridge.vibratePattern(JSON.stringify(scaled), k);
        else if (window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(Array.isArray(scaled) ? scaled.reduce((a, b) => a + b, 0) : scaled);
        return;
      } catch (e) { /* fall through to the web API */ }
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(scaled); } catch (e) { /* unsupported */ }
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
    if (this.state === 'GAME_OVER') return;

    this.hasActiveRun=false;window.GameStorage.clearRun();this.cancelCountdown();
    if(this.mlWindowFeaturesSnapshot && this.mlWindowTimer>0){
      this.ml.recordWindowOutcome(this.mlWindowFeaturesSnapshot,{speed:this.riderCtrl.forwardSpeed},false);
      this.mlWindowTimer=0;
    }
    this.state = 'GAME_OVER';
    this.notifyAndroidState('GAME_OVER');
    this.hideAllScreens();

    // Record coins to wallet. GameStorage uses the run transaction id so this stays idempotent.
    window.GameStorage.addCoins(this.coinsCollectedThisRun, this.currentRunTxId);

    this.showGameOverScreen();

    // Show one interstitial at the first Game Over of a run. The Game Over UI is
    // already usable while Android finishes the request (or reports no ad).
    if (!this.gameOverInterstitialShown &&
        window.AndroidBridge &&
        window.AndroidBridge.showInterstitial) {
      this.gameOverInterstitialShown = true;
      this.waitingForGameOverInterstitial = true;
      const requestId = ++this.adRequestSequence;
      this.activeInterstitialRequestId = requestId;
      try {
        window.AndroidBridge.showInterstitial(requestId);
      } catch (e) {
        this.waitingForGameOverInterstitial = false;
        this.activeInterstitialRequestId = null;
      }
    }
  }

  showGameOverScreen() {
    if (this.state !== 'GAME_OVER') return;

    const gameOverEl = document.getElementById('game-over-modal');
    if (gameOverEl) gameOverEl.classList.remove('hidden');

    document.getElementById('go-run-score').innerText = `${Math.floor(this.score)}`;
    const progress = window.GameStorage.getProgress();
    const best = progress.bestScores[this.currentRoundId] || 0;
    document.getElementById('go-best-score').innerText = `${Math.max(best, Math.floor(this.score))}`;

    const reviveButton = document.getElementById('btn-go-revive');
    if (reviveButton) {
      const available = this.revivesUsed < 1;
      reviveButton.classList.toggle('hidden', !available);
      reviveButton.disabled = !available;
      reviveButton.textContent = 'REVIVE · WATCH AD';
    }
  }

  resetAdRequestState() {
    this.rewardedRequestPending = false;
    this.waitingForGameOverInterstitial = false;
    this.gameOverInterstitialShown = false;
    this.activeInterstitialRequestId = null;
    this.activeRewardedRequestId = null;
  }

  isAdRequestCurrent(format, requestId) {
    if (this.state !== 'GAME_OVER' || !Number.isSafeInteger(requestId) || requestId <= 0) return false;
    if (format === 'interstitial') {
      return this.waitingForGameOverInterstitial && this.activeInterstitialRequestId === requestId;
    }
    if (format === 'rewarded') {
      return this.rewardedRequestPending && this.activeRewardedRequestId === requestId;
    }
    return false;
  }

  onInterstitialClosed(requestId) {
    if (!this.isAdRequestCurrent('interstitial', requestId)) return;
    this.waitingForGameOverInterstitial = false;
    this.activeInterstitialRequestId = null;
  }

  requestRewardedRevive() {
    if (this.state !== 'GAME_OVER' || this.revivesUsed >= 1 || this.rewardedRequestPending || this.waitingForGameOverInterstitial) return;

    this.rewardedRequestPending = true;
    const requestId = ++this.adRequestSequence;
    this.activeRewardedRequestId = requestId;
    const button = document.getElementById('btn-go-revive');
    if (button) {
      button.disabled = true;
      button.textContent = 'LOADING AD…';
    }

    if (window.AndroidBridge && window.AndroidBridge.showRewardedRevive) {
      try {
        window.AndroidBridge.showRewardedRevive(requestId);
        return;
      } catch (e) {}
    }

    this.onRewardedAdUnavailable(requestId);
  }

  onRewardedReviveEarned(requestId) {
    if (!this.isAdRequestCurrent('rewarded', requestId) || this.revivesUsed >= 1) return;

    this.rewardedRequestPending = false;
    this.activeRewardedRequestId = null;
    this.revivesUsed = 1;
    this.hearts = 1;
    this.hasActiveRun = true;

    this.hideAllScreens();
    const hud = document.getElementById('gameplay-hud');
    if (hud) hud.classList.remove('hidden');

    this.state = 'PLAYING';
    this.lastTime = performance.now();
    this.input.resetAll();
    this.notifyAndroidState('PLAYING');
    this.hud?.update(0);
    this.saveActiveRun();
    this.vibrate(80);
  }

  onRewardedAdUnavailable(requestId) {
    if (!this.isAdRequestCurrent('rewarded', requestId)) return;
    this.rewardedRequestPending = false;
    this.activeRewardedRequestId = null;
    const button = document.getElementById('btn-go-revive');
    if (button && this.revivesUsed < 1) {
      button.disabled = false;
      button.textContent = 'Ad unavailable, try again';
    }
  }

  onRewardedAdNotCompleted(requestId) {
    if (!this.isAdRequestCurrent('rewarded', requestId)) return;
    this.rewardedRequestPending = false;
    this.activeRewardedRequestId = null;
    const button = document.getElementById('btn-go-revive');
    if (button && this.revivesUsed < 1) {
      button.disabled = false;
      button.textContent = 'REVIVE · WATCH AD';
    }
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

    document.getElementById('rc-round-name').innerText = `World ${this.currentRoundId} · ${this.trackGen.roundData.name}`;
    document.getElementById('rc-total-score').innerText = `${Math.floor(this.score)}`;
    document.getElementById('rc-distance-pts').innerText = `+${Math.floor(this.distanceScore)}`;
    document.getElementById('rc-coin-pts').innerText = `+${Math.floor(this.coinScore)}`;
    document.getElementById('rc-gem-pts').innerText = `+${Math.floor(this.gemScore)}`;
    document.getElementById('rc-obstacle-penalty-pts').innerText = `-${Math.floor(this.obstaclePenaltyScore)}`;
    document.getElementById('rc-bonus-pts').innerText = `+${finishBonus} (Hearts: ${this.hearts})`;

    // Stars display
    const starsContainer = document.getElementById('rc-stars');
    if (starsContainer) {
      starsContainer.innerHTML = this.starMarkup(starsEarned);
    }

    // Next round button text
    const btnNext = document.getElementById('btn-next-round');
    if (btnNext) {
      if (this.currentRoundId >= 16) {
        btnNext.innerText = 'ENDLESS MODE';
      } else {
        btnNext.innerText = 'NEXT WORLD';
      }
    }
  }

  // --- Main Animation & Simulation Loop ---

  loop(timestamp) {
    requestAnimationFrame((t) => this.loop(t));

    // rAF timestamps are vsync-aligned and can precede a performance.now() taken in an earlier
    // task (countdown end, resume). A negative step would blow up the exponential smoothing.
    const rawDt = (timestamp - this.lastTime) / 1000.0;
    const dt = Math.max(0, Math.min(0.06, rawDt));
    this.lastTime = timestamp;

    // Track FPS
    this.fpsFrames++;
    if (timestamp - this.fpsLastTime >= 1000) {
      this.fps = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = timestamp;
      const fpsEl = document.getElementById('fps-counter');
      if (fpsEl && !fpsEl.classList.contains('hidden')) fpsEl.textContent = `${this.fps} FPS · ${Math.round(this.gfx.renderScale * 100)}%`;
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
      if (this.state === 'PLAYING' && newDistance > this.distanceScore) {
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

      this.hud.update(dt);
    } else if (this.state === 'MENU' || this.state === 'ROUND_SELECT') {
      this.updateMenuScene(this.backgrounded ? 0 : dt, timestamp);
    }

    // 2. Camera Update
    if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
      this.gameCam.update(dt, this.riderCtrl.mesh, this.trackGen, this.riderCtrl.activeOverdrive || this.riderCtrl.downhillIntensity > .65, settings, this.riderCtrl);
    }

    document.getElementById('hud-speed')?.classList.toggle('effects-paused', this.state !== 'PLAYING');
    this.arcadeEffects.update(dt, this.riderCtrl, this.trackGen, settings, this.state === 'PLAYING', this.camera);
    this.riderFx.update(this.state === 'PAUSED' ? 0 : dt, this.riderCtrl, this.trackGen, settings, ['PLAYING', 'COUNTDOWN', 'PAUSED'].includes(this.state));
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
    this.updateLights(this.trackGen.getTrackPoint(lightS));
    this.updatePostFx(dt, timestamp, settings);
    this.gfx.govern(rawDt, this.state === 'PLAYING');
    this.gfx.render(this.scene, this.camera);
  }

  // Key light and shadow frustum follow the rider. The light is snapped to the shadow
  // map's texel grid so shadow edges never shimmer while travelling at speed.
  updateLights(p) {
    const T = this.THREE, key = this.dirLight;
    this._lp = this._lp || { pos: new T.Vector3(), tgt: new T.Vector3(), dir: new T.Vector3(), right: new T.Vector3(), up: new T.Vector3() };
    const { pos, tgt, dir, right, up } = this._lp;
    tgt.set(p.x, p.y, p.z + 12);
    pos.set(p.x - 18, p.y + 35, p.z - 15);
    if (key.castShadow && this.gfx.shadowSize) {
      const texel = (key.shadow.camera.right - key.shadow.camera.left) / this.gfx.shadowSize;
      dir.subVectors(tgt, pos).normalize();
      right.crossVectors(dir, T.Object3D.DEFAULT_UP).normalize();
      up.crossVectors(right, dir).normalize();
      const sr = Math.round(tgt.dot(right) / texel) * texel - tgt.dot(right);
      const su = Math.round(tgt.dot(up) / texel) * texel - tgt.dot(up);
      tgt.addScaledVector(right, sr).addScaledVector(up, su);
      pos.addScaledVector(right, sr).addScaledVector(up, su);
    }
    key.position.copy(pos);
    key.target.position.copy(tgt);
    // The rim light shares the visible sun's direction so backlighting matches the sky.
    const sun = this.sky?.sunSprite;
    const sunPos = this._sunPos = this._sunPos || new T.Vector3();
    if (sun && sun.visible) sunPos.copy(sun.position);
    else sunPos.set(p.x + 20, p.y + 120, p.z + 400);
    const sd = this._sunDir = this._sunDir || new T.Vector3();
    sd.set(sunPos.x - p.x, sunPos.y - p.y, sunPos.z - p.z).normalize();
    this.rimLight.position.set(p.x + sd.x * 60, p.y + Math.max(8, sd.y * 60), p.z + sd.z * 60);
    this.rimLight.target.position.set(p.x, p.y + 1, p.z);
    window.SceneFx?.update(this.camera, sunPos);
  }

  // Feeds gameplay intensity into the post pipeline (speed blur/streaks, chromatic pulse).
  updatePostFx(dt, timestamp, settings) {
    const r = this.riderCtrl;
    let speed = 0, lines = 0, ca = 0;
    if (this.state === 'PLAYING' && r && !settings.reducedMotion) {
      const base = window.ScooterTuning.maxSpeed;
      const pace = Math.max(0, Math.min(1, (r.forwardSpeed - 14) / (base - 14)));
      speed = pace * 0.35;
      if (r.activeOverdrive) { speed = Math.max(speed, 0.55); lines = 0.75; ca = 0.0025; }
      if (r.activeSkyFlight) { speed = 0.85; lines = 1.0; ca = 0.004; }
      else if (r.isGliding) { speed = Math.max(speed, 0.4); lines = Math.max(lines, 0.35); }
      if (r.downhillIntensity > 0.4) { speed = Math.max(speed, 0.25 + r.downhillIntensity * 0.3); lines = Math.max(lines, 0.3); }
    }
    // A soft red pulse at the screen edge when one heart is left.
    const warn = (this.state === 'PLAYING' && this.hearts === 1 && !settings.reducedMotion) ? 0.5 + 0.5 * Math.sin(timestamp / 1000 * 5) : 0;
    // Sun position on screen drives the light shafts (only while the sun is in or near the view).
    let god = 0, sunUV = null;
    const sun = this.sky?.sunSprite;
    if (sun && sun.visible && this.gfx.postActive) {
      const v = this._sunNdc = this._sunNdc || new this.THREE.Vector3();
      v.copy(sun.position).project(this.camera);
      if (v.z < 1 && v.z > -1) {
        sunUV = [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
        const off = Math.max(Math.abs(v.x), Math.abs(v.y));
        god = Math.max(0, 1 - Math.max(0, off - 0.9) / 0.6);
      }
    }
    this.post.update(dt, { speed, lines, ca, warn, god, sunUV });
  }

  updateHUD() {
    this.hud?.update(0);
  }

  // Menu backdrop: a rider cruises the first world while the camera drifts alongside.
  updateMenuScene(dt, timestamp) {
    const round = this.trackGen.roundData;
    this.menuS = (this.menuS || 0) + dt * 7.5;
    if (round && this.menuS > round.length - 140) {
      this.trackGen.buildRound(window.ROUNDS_DATA[0], 42);
      this.menuS = 0;
    }
    const t = timestamp / 1000, s = this.menuS;
    this.trackGen.update(s, dt);
    // Pickups float in the road's way of the hero shot; the menu backdrop stays clean.
    for (const item of this.trackGen.activeCollectibles) item.visible = false;
    const rider = this.riderCtrl;
    rider.s = s + 12; rider.laneX = Math.sin(t * 0.55) * 1.7; rider.y = 0; rider.forwardSpeed = 11.5;
    rider.lateralVelocity = Math.cos(t * 0.55) * 0.55 * 1.7;
    rider.updateProceduralAnimations(dt);
    rider.updateMeshTransform();
    const tp = this.trackGen.getTrackPoint(s + 4), tan = this.trackGen.getTrackTangent(s + 4);
    const nx = -tan.z, nz = tan.x, side = 4.6 + Math.sin(t * 0.21) * 1.3, lift = 1.7 + Math.sin(t * 0.17) * 0.35;
    this.camera.position.set(tp.x + nx * side - tan.x * 1.5, tp.y + lift, tp.z + nz * side - tan.z * 1.5);
    const rp = rider.mesh.position;
    this.camera.lookAt(rp.x, rp.y + 0.95, rp.z); // rider sits between the title and the buttons
    if (Math.abs(this.camera.fov - 52) > 0.1) { this.camera.fov = 52; this.camera.updateProjectionMatrix(); }
  }

  applyFpsCounter(settings = window.GameStorage.getSettings()) {
    const el = document.getElementById('fps-counter');
    if (el) el.classList.toggle('hidden', !settings.showFps);
  }

  updateStatsDisplay() {
    const wallet = window.GameStorage.getWallet();
    const progress = window.GameStorage.getProgress();

    const coinsEl = document.getElementById('menu-total-coins');
    if (coinsEl) coinsEl.innerText = `${wallet.totalCoins || 0}`;

    const roundEl = document.getElementById('menu-highest-round');
    if (roundEl) roundEl.innerText = `${progress.highestUnlockedRound || 1} / 16`;

    let bestTotal = 0;
    Object.values(progress.bestScores).forEach(s => bestTotal = Math.max(bestTotal, s));
    const bestEl = document.getElementById('menu-best-score');
    if (bestEl) bestEl.innerText = `${bestTotal}`;
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
    // Every button and world card gets an instant click sound.
    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.btn, .btn-icon-pause, .round-card.unlocked')) window.GameAudio?.playClick?.();
    }, true);
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
    document.getElementById('btn-go-revive')?.addEventListener('click', () => {
      this.requestRewardedRevive();
    });

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

    this.wireSettingsForm();
  }

  starMarkup(n, total = 3) {
    let html = '';
    for (let i = 0; i < total; i++) html += `<svg class="ico${i < n ? '' : ' off'}"><use href="#i-star"/></svg>`;
    return html;
  }

  showRoundSelect() {
    const modal = document.getElementById('round-select-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const grid = document.getElementById('rounds-grid');
    grid.innerHTML = '';

    const progress = window.GameStorage.getProgress();
    const highest = progress.highestUnlockedRound || 1;
    const hex = (c) => '#' + new this.THREE.Color(c).getHexString();

    window.ROUNDS_DATA.forEach(round => {
      const isUnlocked = round.id <= highest;
      const card = document.createElement('div');
      card.className = `round-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.style.setProperty('--c1', hex(round.skyColor));
      card.style.setProperty('--c2', hex(round.railColor));

      const stars = progress.stars[round.id] || 0;
      const best = progress.bestScores[round.id] || 0;
      const kmh = Math.round(round.baseSpeed * window.ScooterTuning.cruiseMultiplier * 3.6);

      card.innerHTML = `
        <div class="rc-number">${round.id}</div>
        ${!isUnlocked ? '<div class="rc-lock-badge" aria-label="Locked"><svg class="ico lock"><use href="#i-lock"/></svg></div>' : ''}
        <div class="rc-title">${round.name}</div>
        <div class="rc-meta">${round.length}m · ${kmh} km/h</div>
        <div class="rc-foot">
          ${isUnlocked ? `<span class="rc-starrow">${this.starMarkup(stars)}</span><span class="rc-best">${best ? 'Best ' + best : ''}</span>`
            : `<span class="rc-locked-msg"><svg class="rc-lock-icon" aria-hidden="true"><use href="#i-lock"/></svg><span>Complete World ${round.id - 1}</span></span>`}
        </div>
      `;

      if (isUnlocked) {
        card.addEventListener('click', () => {
          modal.classList.add('hidden');
          this.startRound(round.id);
        });
      } else {
        card.addEventListener('click', () => {
          this.vibrate(30);
          window.GameAudio?.playClick?.();
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
    const set = (id, v, prop = 'value') => { const el = document.getElementById(id); if (el) el[prop] = v; };
    set('set-music', s.music, 'checked');
    set('set-sfx', s.sfx, 'checked');
    set('set-vibration', s.vibration, 'checked');
    set('set-sensitivity', s.steeringSensitivity);
    set('set-graphics', s.graphicsQuality);
    set('set-reduced-motion', s.reducedMotion, 'checked');
    set('set-adaptive', s.adaptiveDifficulty, 'checked');
    set('set-scheme', s.controlScheme);
    set('set-tilt-sensitivity', s.tiltSensitivity);
    set('set-stick-size', s.stickSize);
    set('set-stick-opacity', s.stickOpacity);
    set('set-left-handed', s.leftHanded, 'checked');
    set('set-haptic-strength', s.hapticStrength);
    set('set-postfx', s.postFx, 'checked');
    set('set-adaptive-res', s.adaptiveResolution, 'checked');
    set('set-show-fps', s.showFps, 'checked');

    const privacyOpt = document.getElementById('btn-privacy-options');
    if (privacyOpt) {
      const required = window.AndroidBridge?.isPrivacyOptionsRequired?.() || false;
      privacyOpt.classList.toggle('hidden', !required);
    }
  }

  wireSettingsForm() {
    const val = (id, fallback) => { const el = document.getElementById(id); return el ? el.value : fallback; };
    const chk = (id, fallback) => { const el = document.getElementById(id); return el ? el.checked : fallback; };
    const saveAndApply = () => {
      const previous = window.GameStorage.getSettings();
      const s = {
        ...previous,
        music: chk('set-music', true),
        sfx: chk('set-sfx', true),
        vibration: chk('set-vibration', true),
        steeringSensitivity: parseFloat(val('set-sensitivity', 1)),
        graphicsQuality: val('set-graphics', 'auto'),
        reducedMotion: chk('set-reduced-motion', false),
        adaptiveDifficulty: chk('set-adaptive', true),
        controlScheme: val('set-scheme', 'floating'),
        tiltSensitivity: parseFloat(val('set-tilt-sensitivity', 1)),
        stickSize: parseFloat(val('set-stick-size', 1)),
        stickOpacity: parseFloat(val('set-stick-opacity', 0.85)),
        leftHanded: chk('set-left-handed', false),
        hapticStrength: parseFloat(val('set-haptic-strength', 1)),
        postFx: chk('set-postfx', true),
        adaptiveResolution: chk('set-adaptive-res', true),
        showFps: chk('set-show-fps', false)
      };
      window.GameStorage.saveSettings(s);
      // Only rebuild what actually changed: dragging a stick-size slider must not reallocate
      // the HDR render targets, and a quality change must not reset the controls.
      const differs = (keys) => keys.some(k => previous[k] !== s[k]);
      if (differs(['controlScheme', 'steeringSensitivity', 'stickSize', 'stickOpacity', 'leftHanded', 'tiltSensitivity'])) this.input.applySettings(s);
      if (differs(['graphicsQuality', 'postFx', 'adaptiveResolution', 'reducedMotion'])) this.applyGraphicsQuality();
      this.applyFpsCounter(s);
      if (previous.hapticStrength !== s.hapticStrength) this.vibrate(24);
      if (window.GameAudio) window.GameAudio.updateVolumes();
    };

    ['set-music', 'set-sfx', 'set-vibration', 'set-sensitivity', 'set-graphics', 'set-reduced-motion', 'set-adaptive',
      'set-scheme', 'set-tilt-sensitivity', 'set-stick-size', 'set-stick-opacity', 'set-left-handed', 'set-haptic-strength',
      'set-postfx', 'set-adaptive-res', 'set-show-fps'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('change', saveAndApply);
      // Sliders preview live so stick size/opacity can be tuned by eye.
      if (el && el.type === 'range') el.addEventListener('input', saveAndApply);
    });

    document.getElementById('btn-privacy-policy')?.addEventListener('click', () => {
      if (window.AndroidBridge?.openPrivacyPolicy) {
        window.AndroidBridge.openPrivacyPolicy();
      } else {
        window.open('https://salahlouffidi.github.io/sky-scooter-privacy.html', '_blank');
      }
    });

    document.getElementById('btn-privacy-options')?.addEventListener('click', () => {
      window.AndroidBridge?.showPrivacyOptions?.();
    });

    document.getElementById('btn-reset-ml')?.addEventListener('click', () => {
      this.ml.reset();
      alert('Adaptive Machine Learning training weights have been reset.');
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
