// SKY SCOOTER — LOUFFI EDITION
// Input manager: floating / fixed thumb-stick, big right-hand jump zone, tilt steering,
// keyboard and gamepad. Every source is reduced to the same four outputs the rider
// controller reads: horizontalSteer, verticalSteer, isBraking and the jump buffer/hold.
//
// Design notes
//  * Independent pointers: the stick, the jump zone and the brake button each own one
//    pointer id, so two thumbs (plus a third finger on brake) never interfere.
//  * Response curve: a small dead zone, an expo blend for fine control near the centre
//    and full output slightly before the rim. The vertical axis has a larger dead zone so
//    steering never accidentally accelerates or brakes.
//  * The floating base follows the thumb when it is dragged past the rim, so overshooting
//    never requires a long drag back.
window.InputManager = class InputManager {
  constructor() {
    // ---- Outputs read by RiderController ----
    this.horizontalSteer = 0.0; // [-1 .. 1]  right positive
    this.verticalSteer = 0.0;   // [-1 .. 1]  up (accelerate) positive, down (brake) negative
    this.isBraking = false;
    this.buttonBraking = false;
    this.isJumpPressed = false;
    this.jumpPointerId = null;
    this.jumpBufferTimer = 0.0;
    this.onPauseRequested = null;
    this.onHaptic = null;

    // ---- Stick state ----
    this.joystickPointerId = null;
    this.brakePointerId = null;
    this.originX = 0; this.originY = 0;   // base centre in client px
    this.thumbX = 0; this.thumbY = 0;     // thumb offset from origin (px, clamped to radius)
    this.stickSteer = 0; this.stickAccel = 0;
    this.radius = 52;
    this.baseSize = 132;

    // ---- Tunables (settings) ----
    this.scheme = 'floating';   // 'floating' | 'fixed' | 'tilt'
    this.stickScale = 1.0;
    this.stickOpacity = 0.85;
    this.leftHanded = false;
    this.steeringSensitivity = 1.0;
    this.tiltSensitivity = 1.0;
    this.follow = true;
    this.deadX = 0.07;
    this.deadY = 0.24;
    this.expo = 0.26;
    this.joystickDeadZone = 0.12; // kept for API compatibility (brake threshold)
    this.brakeThreshold = 0.12;

    // ---- Keyboard / gamepad / tilt ----
    this.keys = {};
    this.padSteer = 0; this.padAccel = 0; this.padJumpHeld = false; this.padBrake = false; this.padStartPrev = false;
    this.tilt = { active: false, value: 0, neutral: null, map: null, raw: 0, samples: 0 };

    this.initTouch();
    this.initKeyboard();
    this.initTilt();
  }

  // ---------- Settings ----------
  updateSensitivity(val) {
    this.steeringSensitivity = Math.max(0.4, Math.min(2.0, val || 1.0));
  }

  applySettings(s = {}) {
    if (s.steeringSensitivity) this.updateSensitivity(s.steeringSensitivity);
    this.scheme = ['floating', 'fixed', 'tilt'].includes(s.controlScheme) ? s.controlScheme : 'floating';
    this.stickScale = Math.max(0.7, Math.min(1.5, Number(s.stickSize) || 1));
    this.stickOpacity = Math.max(0.25, Math.min(1, Number(s.stickOpacity) || 0.85));
    this.leftHanded = !!s.leftHanded;
    this.tiltSensitivity = Math.max(0.5, Math.min(2, Number(s.tiltSensitivity) || 1));
    this.follow = s.stickFollow !== false;
    const root = document.body;
    if (root) {
      root.classList.toggle('left-handed', this.leftHanded);
      root.dataset.scheme = this.scheme;
      root.style.setProperty('--stick-opacity', String(this.stickOpacity));
    }
    this.layoutStick();
    this.tilt.active = this.scheme === 'tilt';
    if (this.tilt.active) this.calibrateTilt();
    this.resetAll();
  }

  // Stick geometry scales with the shortest screen edge so it feels the same on any phone.
  layoutStick() {
    const short = Math.min(window.innerWidth || 800, window.innerHeight || 450);
    this.baseSize = Math.max(112, Math.min(158, short * 0.34)) * this.stickScale;
    this.radius = this.baseSize * 0.4;
    const root = document.body;
    if (root) root.style.setProperty('--stick-size', `${this.baseSize.toFixed(1)}px`);
  }

  // ---------- Response curve ----------
  shape(v, dead) {
    const a = Math.abs(v);
    if (a <= dead) return 0;
    const t = Math.min(1, (a - dead) / (0.94 - dead));
    return Math.sign(v) * ((1 - this.expo) * t + this.expo * t * t * t);
  }

  applyStick() {
    const nx = this.thumbX / this.radius, ny = -this.thumbY / this.radius;
    this.stickSteer = Math.max(-1, Math.min(1, this.shape(nx, this.deadX) * this.steeringSensitivity));
    this.stickAccel = this.shape(ny, this.deadY);
    this.solve(0, true);
    // Visuals: thumb position and direction highlight (pure CSS via custom properties).
    const zone = this.zone;
    if (zone) {
      this.thumb.style.transform = `translate3d(calc(-50% + ${this.thumbX.toFixed(1)}px), calc(-50% + ${this.thumbY.toFixed(1)}px), 0)`;
      const mag = Math.min(1, Math.hypot(nx, ny));
      zone.style.setProperty('--mag', mag.toFixed(2));
      zone.dataset.dir = mag < 0.15 ? 'none' : Math.abs(nx) > Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : (ny > 0 ? 'up' : 'down');
    }
  }

  // Combine every source into the final outputs. dt = 0 applies the values immediately.
  solve(dt, instant = false) {
    let x = 0, y = 0;
    const kbX = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    const kbY = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    if (kbX) x = kbX * this.steeringSensitivity;
    else if (this.tilt.active && this.tilt.map !== null) x = this.tilt.value * this.tiltSensitivity + this.stickSteer * 0.5;
    else if (this.joystickPointerId !== null) x = this.stickSteer;
    else x = this.padSteer * this.steeringSensitivity;
    if (kbY) y = kbY;
    else if (this.joystickPointerId !== null) y = this.stickAccel;
    else y = this.padAccel;
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    if (instant || dt <= 0 || kbX) this.horizontalSteer = x;
    else {
      // ~20 ms time constant removes touch-sampling jitter without adding perceptible lag.
      this.horizontalSteer += (x - this.horizontalSteer) * (1 - Math.exp(-dt * 50));
      if (Math.abs(this.horizontalSteer) < 0.004 && x === 0) this.horizontalSteer = 0;
    }
    this.verticalSteer = y;
    this.refreshBrakeState();
  }

  // ---------- Touch ----------
  initTouch() {
    const $ = id => document.getElementById(id);
    const zone = this.zone = $('joystick-zone');
    this.base = $('joystick-base');
    this.thumb = $('joystick-thumb');
    const jumpZone = $('jump-zone'), btnJump = $('btn-jump'), btnBrake = $('btn-brake');
    if (!zone) return;
    this.layoutStick();
    const prevent = e => e.preventDefault();
    for (const el of [zone, jumpZone, btnJump, btnBrake]) el?.addEventListener('contextmenu', prevent);
    for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, prevent, { passive: false });

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // The zone never moves during a drag: measure once per touch instead of forcing layout on every move.
    let cachedRect = null;
    const zoneRect = () => cachedRect || (cachedRect = zone.getBoundingClientRect());

    // ---- 1. Thumb-stick ----
    const positionBase = () => {
      if (!this.base) return;
      const r = zoneRect();
      if (this.scheme === 'fixed') { this.base.style.transform = ''; return; }
      this.base.style.transform = `translate3d(${(this.originX - r.left - this.baseSize / 2).toFixed(1)}px, ${(this.originY - r.top - this.baseSize / 2).toFixed(1)}px, 0)`;
    };
    const onStickStart = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
      this.layoutStick();
      cachedRect = null;
      const r = zoneRect();
      if (this.scheme === 'fixed') {
        const b = this.base.getBoundingClientRect();
        this.originX = b.left + b.width / 2; this.originY = b.top + b.height / 2;
      } else {
        // Base appears under the thumb, clamped so it never leaves the zone.
        const m = this.baseSize / 2 + 6;
        this.originX = clamp(e.clientX, r.left + m, Math.max(r.left + m, r.right - m));
        this.originY = clamp(e.clientY, r.top + m, Math.max(r.top + m, r.bottom - m));
        positionBase();
      }
      zone.classList.add('active');
      this.onHaptic?.('stick');
      this.moveStick(e.clientX, e.clientY);
    };
    const onStickMove = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      // Use the newest coalesced sample for the lowest steering latency.
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const last = list && list.length ? list[list.length - 1] : e;
      this.moveStick(last.clientX, last.clientY);
    };
    const onStickEnd = (e) => {
      // lostpointercapture is asynchronous: only the pointer that owns the stick may end it.
      if (this.joystickPointerId === null || e.pointerId !== this.joystickPointerId) return;
      this.releaseStick();
    };
    this.moveStick = (cx, cy) => {
      let dx = cx - this.originX, dy = cy - this.originY;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) {
        if (this.follow && this.scheme !== 'fixed') {
          // Drag the base along so the thumb rests on the rim instead of drifting away.
          const excess = len - this.radius;
          this.originX += (dx / len) * excess; this.originY += (dy / len) * excess;
          const r = zoneRect(), m = this.baseSize / 2 + 6;
          this.originX = clamp(this.originX, r.left + m, Math.max(r.left + m, r.right - m));
          this.originY = clamp(this.originY, r.top + m, Math.max(r.top + m, r.bottom - m));
          positionBase();
          dx = cx - this.originX; dy = cy - this.originY;
        }
        const l2 = Math.hypot(dx, dy) || 1, k = Math.min(1, this.radius / l2);
        dx *= k; dy *= k;
      }
      this.thumbX = dx; this.thumbY = dy;
      this.applyStick();
    };
    this.releaseStick = () => {
      const id = this.joystickPointerId;
      this.joystickPointerId = null;
      if (id !== null) { try { if (zone.hasPointerCapture?.(id)) zone.releasePointerCapture(id); } catch (_) { /* gone */ } }
      this.thumbX = 0; this.thumbY = 0; this.stickSteer = 0; this.stickAccel = 0;
      zone.classList.remove('active');
      zone.dataset.dir = 'none';
      zone.style.setProperty('--mag', '0');
      if (this.thumb) this.thumb.style.transform = 'translate3d(-50%, -50%, 0)';
      if (this.base) this.base.style.transform = '';
      this.solve(0, true);
    };
    zone.addEventListener('pointerdown', onStickStart);
    window.addEventListener('pointermove', onStickMove);
    if ('onpointerrawupdate' in window) window.addEventListener('pointerrawupdate', onStickMove);
    window.addEventListener('pointerup', onStickEnd);
    window.addEventListener('pointercancel', onStickEnd);
    zone.addEventListener('lostpointercapture', onStickEnd);

    // ---- 2. Jump: the whole right-hand zone is the button; hold to glide ----
    const setPressed = (el, on) => el?.classList.toggle('pressed', on);
    if (jumpZone) {
      jumpZone.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('#btn-brake')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        if (this.jumpPointerId !== null) return;
        this.jumpPointerId = e.pointerId;
        try { jumpZone.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
        this.triggerJump();
        setPressed(btnJump, true);
        this.onHaptic?.('jump');
      });
      const releaseJump = (e) => {
        if (this.jumpPointerId === null || e.pointerId !== this.jumpPointerId) return;
        this.jumpPointerId = null;
        this.isJumpPressed = !!this.keys.Space;
        setPressed(btnJump, false);
      };
      window.addEventListener('pointerup', releaseJump);
      window.addEventListener('pointercancel', releaseJump);
      jumpZone.addEventListener('lostpointercapture', releaseJump);
    }

    // ---- 3. Brake button (own pointer, never triggers jump) ----
    if (btnBrake) {
      btnBrake.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { btnBrake.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
        this.brakePointerId = e.pointerId;
        this.buttonBraking = true;
        setPressed(btnBrake, true);
        this.onHaptic?.('brake');
        this.refreshBrakeState();
      });
      const releaseBrake = (e) => {
        if (this.brakePointerId === null || e.pointerId !== this.brakePointerId) return;
        this.brakePointerId = null;
        this.buttonBraking = false;
        setPressed(btnBrake, false);
        this.refreshBrakeState();
      };
      window.addEventListener('pointerup', releaseBrake);
      window.addEventListener('pointercancel', releaseBrake);
      btnBrake.addEventListener('lostpointercapture', releaseBrake);
    }

    // Losing focus (app switch, notification shade) must release everything.
    window.addEventListener('blur', () => this.resetAll());
    window.addEventListener('resize', () => { this.layoutStick(); cachedRect = null; });
  }

  refreshBrakeState() {
    const keyboardBrake = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
    this.isBraking = this.buttonBraking || keyboardBrake || this.padBrake || this.verticalSteer < -this.brakeThreshold;
  }

  triggerJump() {
    this.isJumpPressed = true;
    this.jumpBufferTimer = 0.22; // 220 ms jump buffering
  }

  // A held button is independent of the one-shot jump buffer. Consuming a jump never
  // releases the glider, and holding never triggers another jump.
  get isJumpHeld() {
    return this.jumpPointerId !== null || !!this.keys.Space || this.padJumpHeld;
  }

  // ---------- Keyboard ----------
  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const wasDown = !!this.keys[e.code];
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!wasDown && !e.repeat) this.triggerJump();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.refreshBrakeState();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (!e.repeat && this.onPauseRequested) this.onPauseRequested();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        this.isJumpPressed = this.jumpPointerId !== null;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.refreshBrakeState();
      }
    });
  }

  // ---------- Tilt steering (steering-wheel style) ----------
  // The phone is treated like a wheel: rotating it clockwise steers right. The gravity
  // vector is projected onto the screen plane; the screen mapping is auto-detected from
  // which of the four rotations puts "up" on the screen's up axis, so it works in either
  // landscape orientation without trusting platform angle conventions.
  initTilt() {
    window.addEventListener('devicemotion', (e) => {
      if (!this.tilt.active) return;
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      const t = this.tilt, dx = g.x, dy = g.y;
      if (Math.hypot(dx, dy) < 2.5) return; // phone lying flat: no usable roll
      if (t.map === null) {
        // Candidate screen-space (sx, sy) for each rotation; pick the one with sy most upward.
        const cands = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]];
        let best = 0;
        cands.forEach((c, i) => { if (c[1] > cands[best][1]) best = i; });
        t.map = best;
      }
      const c = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]][t.map];
      const roll = -Math.atan2(c[0], c[1]); // clockwise rotation -> positive
      if (t.neutral === null) { t.neutral = roll; t.samples = 0; }
      t.raw += (roll - t.raw) * 0.35;
      const rel = t.raw - t.neutral;
      const deg = rel * 180 / Math.PI;
      const dead = 2.0, full = 24;
      const a = Math.max(0, Math.abs(deg) - dead) / (full - dead);
      t.value = Math.max(-1, Math.min(1, Math.sign(deg) * (0.8 * Math.min(1, a) + 0.2 * Math.pow(Math.min(1, a), 3))));
      this.solve(0, true);
    });
  }

  // Take the current phone pose as "straight ahead".
  calibrateTilt() {
    this.tilt.neutral = null; this.tilt.map = null; this.tilt.value = 0; this.tilt.raw = 0;
  }

  // ---------- Gamepad ----------
  pollGamepad() {
    let pad = null;
    try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of list) if (p && p.connected) { pad = p; break; } } catch (_) { /* blocked */ }
    if (!pad) { this.padSteer = 0; this.padAccel = 0; this.padJumpHeld = false; this.padBrake = false; return; }
    const dz = (v) => Math.abs(v) < 0.14 ? 0 : Math.sign(v) * (Math.abs(v) - 0.14) / 0.86;
    this.padSteer = dz(pad.axes[0] || 0) + ((pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0));
    this.padAccel = -dz(pad.axes[1] || 0) + ((pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0));
    this.padSteer = Math.max(-1, Math.min(1, this.padSteer)); this.padAccel = Math.max(-1, Math.min(1, this.padAccel));
    const jump = !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
    if (jump && !this.padJumpHeld) this.triggerJump();
    this.padJumpHeld = jump;
    this.padBrake = !!(pad.buttons[1]?.pressed || pad.buttons[6]?.pressed);
    const start = !!pad.buttons[9]?.pressed;
    if (start && !this.padStartPrev && this.onPauseRequested) this.onPauseRequested();
    this.padStartPrev = start;
  }

  update(dt) {
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;
    this.pollGamepad();
    this.solve(dt, false);
  }

  consumeJump() {
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = 0;
      return true;
    }
    return false;
  }

  resetAll() {
    const jumpPointerId = this.jumpPointerId;
    this.jumpPointerId = null;
    const jumpZone = document.getElementById('jump-zone'), jumpButton = document.getElementById('btn-jump');
    for (const el of [jumpZone, jumpButton]) {
      try { if (jumpPointerId !== null && el?.hasPointerCapture?.(jumpPointerId)) el.releasePointerCapture(jumpPointerId); } catch (_) { /* gone */ }
    }
    jumpButton?.classList.remove('pressed');
    document.getElementById('btn-brake')?.classList.remove('pressed');
    this.brakePointerId = null;
    if (this.joystickPointerId !== null || this.thumbX || this.thumbY) this.releaseStick?.();
    this.joystickPointerId = null;
    this.horizontalSteer = 0.0;
    this.verticalSteer = 0.0;
    this.stickSteer = 0; this.stickAccel = 0;
    this.buttonBraking = false;
    this.isBraking = false;
    this.isJumpPressed = false;
    this.jumpBufferTimer = 0.0;
    this.padJumpHeld = false; this.padBrake = false;
    this.tilt.value = 0;
    this.keys = {};
    const joystickArea = this.zone;
    if (joystickArea) { joystickArea.classList.remove('active'); joystickArea.dataset.dir = 'none'; }
    if (this.thumb) this.thumb.style.transform = 'translate3d(-50%, -50%, 0)';
    if (this.base) this.base.style.transform = '';
  }
};
