// LOUFFI CITY RUSH — LOUFFI EDITION
// Genuine Online Machine Learning: Bounded Logistic-Regression Difficulty Model
window.AdaptiveDifficultyML = class AdaptiveDifficultyML {
  constructor() {
    this.FEATURE_COUNT = 10;
    this.STORAGE_KEY = 'skyscooter_ml_v1';
    this.learningRate = 0.04;
    this.l2Lambda = 0.002;
    this.maxGradient = 2.0;

    // Model parameters: 10 weights + 1 bias
    // Default prior weights: negative correlation with speed/density/hazards, positive with health/skill
    this.weights = new Float32Array(this.FEATURE_COUNT);
    this.bias = 0.8; // Initial positive bias: target ~0.7-0.8 success rate for reasonable play
    this.initDefaultWeights();

    // Replay buffer (max 256 examples)
    this.examples = [];
    this.maxExamples = 256;

    // Diagnostics & state tracking
    this.state = 'COLLECTING_DATA'; // 'COLLECTING_DATA' | 'LEARNING' | 'FALLBACK' | 'ADAPTIVE_OFF'
    this.movingPredictionError = 0.25;
    this.baselineError = 0.30;
    this.lastPredictedP = 0.80;
    this.lastActualLabel = 1;
    this.currentCandidate = 'balanced';
    this.windowDuration = 10.0; // 10 seconds of active simulation per challenge window

    this.load();
  }

  initDefaultWeights() {
    // Features:
    // 0: recentDamageRate (negative weight)
    // 1: recentJumpSuccess (positive weight)
    // 2: recentSteerCorrection (slight negative: frantic dodging)
    // 3: recentCollectionRate (positive: rider has margin to pick coins)
    // 4: currentHearts (positive)
    // 5: upcomingSpeed (negative)
    // 6: obstacleDensity (negative)
    // 7: minClearance (positive: more clearance -> higher clearance p)
    // 8: gapCount (negative)
    // 9: movingObstacleCount (negative)
    this.weights[0] = -1.2;
    this.weights[1] = 0.8;
    this.weights[2] = -0.3;
    this.weights[3] = 0.6;
    this.weights[4] = 0.9;
    this.weights[5] = -0.7;
    this.weights[6] = -1.1;
    this.weights[7] = 1.0;
    this.weights[8] = -0.8;
    this.weights[9] = -0.9;
    this.bias = 0.85;
  }

  predict(features) {
    let logit = this.bias;
    for (let i = 0; i < this.FEATURE_COUNT; i++) {
      logit += this.weights[i] * features[i];
    }
    // Clamp logit to [-10, 10] for numerical stability
    logit = Math.max(-10, Math.min(10, logit));
    return 1.0 / (1.0 + Math.exp(-logit));
  }

  recordWindowOutcome(featuresSnapshot, challengeParams, clearedWithoutDamage) {
    const label = clearedWithoutDamage ? 1 : 0;
    const prePrediction = this.predict(featuresSnapshot);
    this.lastPredictedP = prePrediction;
    this.lastActualLabel = label;

    // Track pre-update prediction error: |p - y|
    const error = Math.abs(prePrediction - label);
    this.movingPredictionError = 0.9 * this.movingPredictionError + 0.1 * error;

    // Check if adaptive mode is enabled
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { adaptiveDifficulty: true };
    if (!settings.adaptiveDifficulty) {
      this.state = 'ADAPTIVE_OFF';
      return;
    }

    // Add to training buffer
    this.examples.push({
      features: Array.from(featuresSnapshot),
      params: challengeParams,
      label: label,
      timestamp: Date.now()
    });

    if (this.examples.length > this.maxExamples) {
      this.examples.shift();
    }

    // Train on small batch outside critical render path
    this.trainBatch();
    this.save();
  }

  trainBatch() {
    // Check cold start: need at least 30 examples with both classes represented
    const successes = this.examples.filter(e => e.label === 1).length;
    const failures = this.examples.filter(e => e.label === 0).length;

    if (this.examples.length < 30 || successes === 0 || failures === 0) {
      this.state = 'COLLECTING_DATA';
      return;
    }

    // Sample mini-batch of 16 examples (or all if smaller)
    const batchSize = Math.min(16, this.examples.length);
    const gradWeights = new Float32Array(this.FEATURE_COUNT);
    let gradBias = 0.0;

    for (let b = 0; b < batchSize; b++) {
      const idx = Math.floor(Math.random() * this.examples.length);
      const ex = this.examples[idx];
      const p = this.predict(ex.features);
      const diff = p - ex.label;

      gradBias += diff;
      for (let i = 0; i < this.FEATURE_COUNT; i++) {
        gradWeights[i] += diff * ex.features[i] + this.l2Lambda * this.weights[i];
      }
    }

    gradBias /= batchSize;
    for (let i = 0; i < this.FEATURE_COUNT; i++) {
      gradWeights[i] /= batchSize;
      // Gradient clipping
      const clippedGrad = Math.max(-this.maxGradient, Math.min(this.maxGradient, gradWeights[i]));
      const nextWeight = this.weights[i] - this.learningRate * clippedGrad;
      if (Number.isFinite(nextWeight)) {
        this.weights[i] = Math.max(-5.0, Math.min(5.0, nextWeight));
      }
    }

    const clippedBiasGrad = Math.max(-this.maxGradient, Math.min(this.maxGradient, gradBias));
    const nextBias = this.bias - this.learningRate * clippedBiasGrad;
    if (Number.isFinite(nextBias)) {
      this.bias = Math.max(-3.0, Math.min(3.0, nextBias));
    }

    this.state = 'LEARNING';
  }

  // Sample and select candidate difficulty for next track window
  // Runs reachability FIRST, then scores with model, targeting p ~ 0.80
  selectCandidate(baseParams, currentRiderState, reachabilityValidator) {
    const settings = window.GameStorage ? window.GameStorage.getSettings() : { adaptiveDifficulty: true };
    if (!settings.adaptiveDifficulty || this.state !== 'LEARNING') {
      return {
        name: 'designer_fixed',
        speedMultiplier: 1.0,
        obstacleDensityMultiplier: 1.0,
        spacingMultiplier: 1.0,
        movingTrafficChance: 0.42,
        magicPickupChance: 0.12,
        propulsorChance: 0.08,
        predictedP: 0.80
      };
    }

    // 3 difficulty candidates within the round's hard bounds
    const candidates = [
      { name: 'mild', speedMult: 0.95, densityMult: 0.8, spacingMult: 1.25 },
      { name: 'balanced', speedMult: 1.0, densityMult: 1.0, spacingMult: 1.0 },
      { name: 'spicy', speedMult: 1.05, densityMult: 1.15, spacingMult: 0.85 }
    ];

    let bestCandidate = {name:'safe_fallback',speedMultiplier:.95,obstacleDensityMultiplier:.8,spacingMultiplier:1.25,movingTrafficChance:.28,magicPickupChance:.16,propulsorChance:.12,predictedP:null};
    let minDiffFromTarget = 999;
    const targetP = 0.80;

    for (const cand of candidates) {
      // 1. PHYSICAL REACHABILITY TEST FIRST
      const testSpeed = baseParams.baseSpeed * cand.speedMult;
      const isPhysicallyReachable = reachabilityValidator.validateWindow(
        testSpeed,
        cand.densityMult,
        cand.spacingMult,
        baseParams.roadWidth,
        baseParams.features
      );

      if (!isPhysicallyReachable) {
        continue; // REJECT UNREACHABLE CANDIDATE! Safety constraint overrides model
      }

      // 2. Feature vector for candidate
      const candidateFeatures = this.extractFeatures(currentRiderState, testSpeed, cand, baseParams);
      const predictedP = this.predict(candidateFeatures);
      const diff = Math.abs(predictedP - targetP);

      if (diff < minDiffFromTarget) {
        minDiffFromTarget = diff;
        // Let the learned clearance probability shape the visual traffic mix:
        // confident riders see more moving cars; struggling riders receive
        // more magical recovery items and calmer traffic.
        const movingTrafficChance = predictedP < .68 ? .24 : predictedP > .86 ? .62 : .42;
        const magicPickupChance = predictedP < .68 ? .18 : predictedP > .86 ? .09 : .12;
        const propulsorChance = predictedP < .68 ? .13 : predictedP > .86 ? .06 : .08;
        bestCandidate = {
          name: cand.name,
          speedMultiplier: cand.speedMult,
          obstacleDensityMultiplier: cand.densityMult,
          spacingMultiplier: cand.spacingMult,
          movingTrafficChance,
          magicPickupChance,
          propulsorChance,
          predictedP: predictedP
        };
      }
    }

    this.currentCandidate = bestCandidate.name;
    return bestCandidate;
  }

  extractFeatures(riderState, candidateSpeed, candidate, baseParams) {
    const f = new Float32Array(this.FEATURE_COUNT);
    // 0: recent damage rate [0..1]
    f[0] = Math.min(1.0, (riderState.recentDamageCount || 0) / 3.0);
    // 1: recent jump success rate [0..1]
    f[1] = riderState.jumpAttempts > 0 ? (riderState.jumpSuccesses / riderState.jumpAttempts) : 0.8;
    // 2: steering correction rate [0..1]
    f[2] = Math.min(1.0, (riderState.steerCorrections || 0) / 20.0);
    // 3: normalized collection rate [0..1]
    f[3] = Math.min(1.0, (riderState.coinsCollectedInWindow || 0) / 12.0);
    // 4: current hearts [0..1]
    f[4] = Math.max(0.0, Math.min(1.0, (riderState.hearts ?? 3) / 3.0));
    // 5: upcoming speed [0..1] (normalized from 6 to 16 m/s)
    f[5] = Math.max(0.0, Math.min(1.0, (candidateSpeed - 6) / 10.0));
    // 6: obstacle density [0..1]
    f[6] = Math.max(0.0, Math.min(1.0, (candidate.densityMult ?? candidate.obstacleDensityMultiplier ?? 1) * 0.5));
    // 7: minimum clearance [0..1]
    const clearance = (baseParams.roadWidth || 8.0) * (candidate.spacingMult || 1.0) / 10.0;
    f[7] = Math.max(0.0, Math.min(1.0, clearance));
    // 8: gap count [0..1]
    f[8] = baseParams.features && baseParams.features.hasGaps ? 0.33 : 0.0;
    // 9: moving obstacle count [0..1]
    f[9] = baseParams.features && baseParams.features.movingObstacles ? 0.4 : 0.0;

    return f;
  }

  save() {
    try {
      const data = {
        weights: Array.from(this.weights),
        bias: this.bias,
        movingPredictionError: this.movingPredictionError,
        examplesCount: this.examples.length,
        examples: this.examples,
        version: 1
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.version === 1 && data.weights && data.weights.length === this.FEATURE_COUNT && data.weights.every(Number.isFinite) && Number.isFinite(data.bias)) {
        for (let i = 0; i < this.FEATURE_COUNT; i++) {
          this.weights[i] = data.weights[i];
        }
        this.bias = data.bias;
        this.movingPredictionError = data.movingPredictionError || 0.25;
        this.examples=(data.examples||[]).filter(e=>Array.isArray(e.features)&&e.features.length===10&&e.features.every(Number.isFinite)&&(e.label===0||e.label===1)).slice(-256);
        if(this.examples.length>=30&&this.examples.some(e=>e.label===0)&&this.examples.some(e=>e.label===1))this.state='LEARNING';
      }
    } catch (e) {
      console.warn('Could not load ML model, using safe defaults:', e);
      this.initDefaultWeights();
    }
  }

  reset() {
    this.initDefaultWeights();
    this.examples = [];
    this.state = 'COLLECTING_DATA';
    this.movingPredictionError = 0.25;
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}
  }

  // Self-test / Unit verification for math & gradient descent
  runSanityCheck() {
    const testModel = new AdaptiveDifficultyML();
    const initialP = testModel.predict(new Float32Array(10).fill(0.5));

    // Train on 20 positive examples (player cleared challenge easily)
    for (let i = 0; i < 20; i++) {
      testModel.examples.push({
        features: new Array(10).fill(0.5),
        label: 1
      });
    }
    // And 10 negative examples to meet cold start criteria
    for (let i = 0; i < 10; i++) {
      testModel.examples.push({
        features: new Array(10).fill(0.5),
        label: 0
      });
    }

    testModel.trainBatch();
    const postP = testModel.predict(new Float32Array(10).fill(0.5));

    return {
      success: Number.isFinite(initialP) && Number.isFinite(postP),
      initialP: initialP,
      postP: postP,
      finiteWeights: Array.from(testModel.weights).every(w => Number.isFinite(w)),
      finiteBias: Number.isFinite(testModel.bias)
    };
  }
};
