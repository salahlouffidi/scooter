// SKY SCOOTER — LOUFFI EDITION
// Multi-Touch Input Manager with Independent Pointer Tracking & Desktop Keyboard
window.InputManager = class InputManager {
  constructor() {
    this.horizontalSteer = 0.0; // Normalized steer input [-1.0 ... 1.0]
    this.isBraking = false;
    this.isJumpPressed = false;
    this.jumpBufferTimer = 0.0;
    this.onPauseRequested = null;

    // Joystick state
    this.joystickPointerId = null;
    this.joystickStartX = 0;
    this.joystickCurrentX = 0;
    this.joystickRadius = 55; // Pixels radius
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

    // 1. Horizontal Joystick (Left Thumb Area)
    const onJoystickStart = (e) => {
      e.preventDefault();
      if (this.joystickPointerId !== null) return;
      this.joystickPointerId = e.pointerId;
      joystickArea.setPointerCapture(e.pointerId);
      const rect = joystickArea.getBoundingClientRect();
      this.joystickStartX = e.clientX;
      this.joystickCurrentX = e.clientX;
      if (joystickThumb) {
        joystickThumb.style.transform = 'translate(-50%, -50%)';
      }
    };

    const onJoystickMove = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      this.joystickCurrentX = e.clientX;
      const deltaX = this.joystickCurrentX - this.joystickStartX;
      const clampedDeltaX = Math.max(-this.joystickRadius, Math.min(this.joystickRadius, deltaX));

      if (joystickThumb) {
        joystickThumb.style.transform = `translate(calc(-50% + ${clampedDeltaX}px), -50%)`;
      }

      // Normalized steer [-1.0, 1.0] with deadzone
      const rawNormalized = clampedDeltaX / this.joystickRadius;
      if (Math.abs(rawNormalized) < this.joystickDeadZone) {
        this.horizontalSteer = 0.0;
      } else {
        const sign = Math.sign(rawNormalized);
        const scaled = (Math.abs(rawNormalized) - this.joystickDeadZone) / (1.0 - this.joystickDeadZone);
        this.horizontalSteer = sign * Math.min(1.0, scaled * this.steeringSensitivity);
      }
    };

    const onJoystickEnd = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.horizontalSteer = 0.0;
      if (joystickThumb) {
        joystickThumb.style.transform = 'translate(-50%, -50%)';
      }
    };

    joystickArea.addEventListener('pointerdown', onJoystickStart);
    window.addEventListener('pointermove', onJoystickMove);
    window.addEventListener('pointerup', onJoystickEnd);
    window.addEventListener('pointercancel', onJoystickEnd);

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
        this.isBraking = true;
      });
      btnBrake.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.isBraking = false;
      });
      btnBrake.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        this.isBraking = false;
      });
    }

    // Window lost focus reset
    window.addEventListener('blur', () => this.resetAll());
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
        this.isBraking = true;
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
        this.isBraking = false;
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
    this.isBraking = false;
    this.isJumpPressed = false;
    this.jumpBufferTimer = 0.0;
    this.keys = {};
    const joystickThumb = document.getElementById('joystick-thumb');
    if (joystickThumb) {
      joystickThumb.style.transform = 'translate(-50%, -50%)';
    }
  }
};
