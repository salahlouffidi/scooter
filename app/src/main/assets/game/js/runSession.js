// Durable active-run state, separate from completed scores and wallet rewards.
Object.assign(window.SkyScooterGame.prototype, {
  initSession() {
    this.hasActiveRun = false;
    this.autosaveTimer = 0;
    this.backgrounded = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onAppBackground();
      else this.onAppForeground();
    });
    window.addEventListener('pagehide', () => this.onAppBackground());
    window.addEventListener('pageshow', () => this.onAppForeground());
    window.addEventListener('blur', () => this.onAppBackground());
    window.addEventListener('focus', () => this.onAppForeground());
    // Android may recreate the WebView after memory pressure. The saved run
    // stays paused until the player explicitly resumes it.
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();this.onAppBackground();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  },

  saveActiveRun() {
    if (!this.hasActiveRun || !['PLAYING','PAUSED','COUNTDOWN'].includes(this.state)) return false;
    const stats = {};
    for (const key of ['hearts','score','distanceScore','coinScore','gemScore','jumpScore','obstaclePenaltyScore',
      'consecutiveCoins','coinMultiplier','coinsCollectedThisRun','totalSpawnedCoinsEstimate']) stats[key] = this[key];
    return window.GameStorage.saveRun({version:2,layoutVersion:2,savedAt:Date.now(),roundId:this.currentRoundId,
      isEndless:this.isEndless,runId:this.currentRunTxId,stats,rider:this.riderCtrl.captureState(),
      track:this.trackGen.captureState(),ml:{timer:this.mlWindowTimer,hadDamage:this.mlWindowHadDamage,
        features:this.mlWindowFeaturesSnapshot ? Array.from(this.mlWindowFeaturesSnapshot) : null}});
  },

  refreshContinueButton() {
    const saved = window.GameStorage.getRun(), button = document.getElementById('btn-menu-continue');
    if (!button) return;
    button.classList.toggle('hidden', !saved);
    if (saved) {
    const world = window.ROUNDS_DATA.find(r=>r.id===saved.roundId)?.name || 'Sky Tour';
      button.textContent = `RESUME · ${world} · ${Math.floor(saved.rider.s)} m`;
    }
  },

  continueSavedRun() {
    const saved = window.GameStorage.getRun();
    if (!saved) { this.refreshContinueButton(); return; }
    // Older saves predate penalty tracking; keep their existing score and default the new counter.
    this.obstaclePenaltyScore = 0;
    const round = saved.isEndless ? {...window.ROUNDS_DATA[15],id:99,name:'Endless Sky Tour',length:999999,baseSpeed:12}
      : window.ROUNDS_DATA.find(r=>r.id===saved.roundId);
    if(saved.version!==2 || saved.layoutVersion!==2){
      // The authored world layouts changed. Preserve score, health, coins and
      // run identity, but deliberately restart at the last safe checkpoint on
      // the new route instead of restoring stale city geometry.
      this.cancelCountdown();this.input.resetAll();this.arcadeEffects.reset();
      this.currentRoundId=saved.roundId;this.isEndless=!!saved.isEndless;this.currentRunTxId=saved.runId;
      for(const [key,value] of Object.entries(saved.stats||{}))if(Number.isFinite(value))this[key]=value;
      const checkpoint=Math.max(0,Math.min(Number(saved.rider?.lastCheckpointS)||0,(round.length||999999)-80));
      this.applyRoundAtmosphere(round);this.trackGen.buildRound(round,saved.track?.seed||Date.now());
      this.riderCtrl.reset(checkpoint,round.baseSpeed*window.ScooterTuning.cruiseMultiplier);this.riderCtrl.lastCheckpointS=checkpoint;
      this.gameCam.reset(this.riderCtrl.mesh,this.trackGen);this.hasActiveRun=true;this.autosaveTimer=0;this.state='PAUSED';
      document.getElementById('hud-world').textContent=`${saved.isEndless?'∞':round.id} · ${round.name}`;
      this.hideAllScreens();this.updateHUD();this.saveActiveRun();this.showFloatingLabel('WORLD MAP UPDATED · CHECKPOINT RESTORED',this.riderCtrl.mesh.position,'#ffe082');this.resume();return;
    }
    this.cancelCountdown();this.input.resetAll();this.arcadeEffects.reset();
    this.currentRoundId=saved.roundId;this.isEndless=saved.isEndless;this.currentRunTxId=saved.runId;
    for (const [key,value] of Object.entries(saved.stats)) if (Number.isFinite(value)) this[key]=value;
    this.applyRoundAtmosphere(round);this.trackGen.restoreState(round,saved.track);
    this.riderCtrl.restoreState(saved.rider);this.gameCam.reset(this.riderCtrl.mesh,this.trackGen);
    this.mlWindowTimer=saved.ml?.timer||0;this.mlWindowHadDamage=!!saved.ml?.hadDamage;
    this.mlWindowFeaturesSnapshot=saved.ml?.features ? new Float32Array(saved.ml.features) :
      this.ml.extractFeatures(this.riderCtrl,round.baseSpeed,{densityMult:1,spacingMult:1},round);
    this.hasActiveRun=true;this.autosaveTimer=0;this.state='PAUSED';
    document.getElementById('hud-world').textContent=`${saved.isEndless?'∞':round.id} · ${round.name}`;
    this.hideAllScreens();this.updateHUD();this.resume();
  },

  cancelCountdown() {
    if(this.countdownTimer)clearInterval(this.countdownTimer);
    this.countdownTimer=null;
    document.getElementById('countdown-display')?.classList.add('hidden');
  },

  onAppBackground() {
    this.backgrounded=true;
    this.pause();this.input?.resetAll();this.saveActiveRun();
    window.GameAudio?.stopMusic();
    window.GameAudio?.ctx?.suspend().catch(()=>{});
  },

  onAppForeground() {
    this.backgrounded=false;this.lastTime=performance.now();this.input?.resetAll();
    // Do not resume from a system lifecycle callback or start a hidden countdown.
  }
});
