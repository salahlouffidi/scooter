// LOUFFI CITY RUSH — LOUFFI EDITION
// Multi-Touch Input Manager with Independent Pointer Tracking & Desktop Keyboard
window.InputManager = class InputManager {
  constructor() {
    this.horizontalSteer = 0.0; // Normalized left/right input [-1.0 ... 1.0]
    this.verticalSteer = 0.0; // Normalized up/down input: up +1, back/down -1
    this.isBraking = false;
    this.buttonBraking = false;
    this.isJumpPressed = false;
    this.jumpBufferTimer = 0.0;
    this.onPauseRequested = null;

    // Joystick state
    this.joystickPointerId = null;
    this.joystickStartX = 0;
    this.joystickCurrentX = 0;
    this.joystickStartY = 0;
    this.joystickCurrentY = 0;
    this.joystickRadius = 46; // Maximum travel in pixels on either axis
    this.joystickOriginOffsetX = 0;
    this.joystickOriginOffsetY = 0;
    this.joystickDeadZone = 0.12;
    this.steeringSensitivity = 1.0;

    // Keyboard state
    this.keys = {};

    this.initTouch();
    this.initKeyboard();
  }

  updateSensitivity(val) {
    this.steeringSensitivity = Math.max(0.4, Math.min(2.0, val || 1.0));
  }

  initTouch() {
    const joystickArea = document.getElementById('joystick-zone');
    const joystickThumb = document.getElementById('joystick-thumb');
    const btnJump = document.getElementById('btn-jump');
    const btnBrake = document.getElementById('btn-brake');

    if (!joystickArea) return;

    // 1. ArmaSnake-style four-way left-thumb analog stick. Up accelerates,
    // down/back brakes, and left/right steer. Jump and brake buttons remain
    // independent pointers so they can be pressed while the stick is held.
    const onJoystickStart = (e) => {
      e.preventDefault();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      joystickArea.setPointerCapture(e.pointerId);
      const rect = joystickArea.getBoundingClientRect();
      this.joystickRadius = Math.max(36, Math.min(52, rect.width * 0.5 - 24));
      this.joystickStartX = e.clientX;
      this.joystickCurrentX = e.clientX;
      this.joystickStartY = e.clientY;
      this.joystickCurrentY = e.clientY;
      this.joystickOriginOffsetX = Math.max(-this.joystickRadius, Math.min(this.joystickRadius,
        e.clientX - (rect.left + rect.width * 0.5)));
      this.joystickOriginOffsetY = Math.max(-this.joystickRadius, Math.min(this.joystickRadius,
        e.clientY - (rect.top + rect.height * 0.5)));
      const initialX = this.joystickOriginOffsetX;
      const initialY = this.joystickOriginOffsetY;
      joystickArea.classList.add('active');
      if (joystickThumb) {
        joystickThumb.style.transform = `translate(calc(-50% + ${initialX}px), calc(-50% + ${initialY}px))`;
      }
      this.setJoystickAxes(initialX, initialY);
    };

    const onJoystickMove = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      this.joystickCurrentX = e.clientX;
      this.joystickCurrentY = e.clientY;
      const deltaX = this.joystickCurrentX - this.joystickStartX + this.joystickOriginOffsetX;
      const deltaY = this.joystickCurrentY - this.joystickStartY + this.joystickOriginOffsetY;
      const clampedX = Math.max(-this.joystickRadius, Math.min(this.joystickRadius, deltaX));
      const clampedY = Math.max(-this.joystickRadius, Math.min(this.joystickRadius, deltaY));

      if (joystickThumb) {
        joystickThumb.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
      }
      this.setJoystickAxes(clampedX, clampedY);
    };

    const onJoystickEnd = (e) => {
      if (e.type !== 'lostpointercapture' && e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.horizontalSteer = 0.0;
      this.verticalSteer = 0.0;
      this.joystickOriginOffsetX = 0;
      this.joystickOriginOffsetY = 0;
      this.refreshBrakeState();
      joystickArea.classList.remove('active');
      if (joystickThumb) {
        joystickThumb.style.transform = 'translate(-50%, -50%)';
      }
    };

    joystickArea.addEventListener('pointerdown', onJoystickStart);
    window.addEventListener('pointermove', onJoystickMove);
    window.addEventListener('pointerup', onJoystickEnd);
    window.addEventListener('pointercancel', onJoystickEnd);
    joystickArea.addEventListener('lostpointercapture', onJoystickEnd);

    // 2. Jump Button (Independent Pointer)
    if (btnJump) {
      btnJump.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.triggerJump();
      });
      btnJump.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.isJumpPressed = false;
      });
    }

    // 3. Brake Button (Independent Pointer)
    if (btnBrake) {
      btnBrake.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btnBrake.setPointerCapture(e.pointerId);
        this.buttonBraking = true;
        this.refreshBrakeState();
      });
      btnBrake.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.buttonBraking = false;
        this.refreshBrakeState();
      });
      btnBrake.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this.buttonBraking = false;
        this.refreshBrakeState();
      });
    }

    // Window lost focus reset
    window.addEventListener('blur', () => this.resetAll());
  }

  setJoystickValue(offset) {
    // Normalized steer [-1.0, 1.0] with a small center dead zone.  The
    // dead-zone is scaled out so fine thumb movements still feel responsive.
    const rawNormalized = offset / Math.max(1, this.joystickRadius);
    if (Math.abs(rawNormalized) < this.joystickDeadZone) {
      this.horizontalSteer = 0.0;
      return;
    }
    const sign = Math.sign(rawNormalized);
    const scaled = (Math.abs(rawNormalized) - this.joystickDeadZone) / (1.0 - this.joystickDeadZone);
    this.horizontalSteer = sign * Math.min(1.0, scaled * this.steeringSensitivity);
  }

  setVerticalValue(offset) {
    // Screen Y is inverted: dragging up is positive forward input. A small
    // downward drag is treated as a proportional brake, not a reverse gear.
    const rawNormalized = offset / Math.max(1, this.joystickRadius);
    if (Math.abs(rawNormalized) < this.joystickDeadZone) {
      this.verticalSteer = 0.0;
    } else {
      const sign = Math.sign(rawNormalized);
      const scaled = (Math.abs(rawNormalized) - this.joystickDeadZone) / (1.0 - this.joystickDeadZone);
      this.verticalSteer = sign * Math.min(1.0, scaled);
    }
    this.refreshBrakeState();
  }

  setJoystickAxes(x, y) {
    this.setJoystickValue(x);
    this.setVerticalValue(-y);
  }

  refreshBrakeState() {
    const keyboardBrake = !!(this.keys['KeyS'] || this.keys['ArrowDown']);
    this.isBraking = this.buttonBraking || keyboardBrake || this.verticalSteer < -this.joystickDeadZone;
  }

  triggerJump() {
    this.isJumpPressed = true;
    this.jumpBufferTimer = 0.22; // 220ms jump buffering
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerJump();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.refreshBrakeState();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.onPauseRequested) this.onPauseRequested();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        this.isJumpPressed = false;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.refreshBrakeState();
      }
    });
  }

  update(dt) {
    // Jump buffer countdown
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
    }

    // If keyboard is used for steering
    let kbSteer = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kbSteer -= 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kbSteer += 1.0;

    if (kbSteer !== 0) {
      this.horizontalSteer = kbSteer * this.steeringSensitivity;
    } else if (this.joystickPointerId === null) {
      this.horizontalSteer = 0.0;
    }

    // Keyboard parity for desktop testing: W/Up accelerates, S/Down brakes.
    if (this.joystickPointerId === null) {
      let kbVertical = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) kbVertical += 1.0;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) kbVertical -= 1.0;
      this.verticalSteer = kbVertical;
    }
    this.refreshBrakeState();
  }

  consumeJump() {
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = 0;
      return true;
    }
    return false;
  }

  resetAll() {
    this.joystickPointerId = null;
    this.horizontalSteer = 0.0;
    this.verticalSteer = 0.0;
    this.joystickOriginOffsetX = 0;
    this.joystickOriginOffsetY = 0;
    this.buttonBraking = false;
    this.isBraking = false;
    this.isJumpPressed = false;
    this.jumpBufferTimer = 0.0;
    this.keys = {};
    const joystickThumb = document.getElementById('joystick-thumb');
    const joystickArea = document.getElementById('joystick-zone');
    if (joystickArea) joystickArea.classList.remove('active');
    if (joystickThumb) {
      joystickThumb.style.transform = 'translate(-50%, -50%)';
    }
  }
};
