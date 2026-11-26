// Keyboard and pointer input. Held keys give throttle, pitch and roll; one-shot
// presses (start or restart, pause, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted
// twice. The mouse steers like a stick: where the pointer sits from the centre
// of the screen banks and pitches the aircraft, and the wheel sets throttle.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  let pitchUp = false;
  let pitchDown = false;
  let rollLeft = false;
  let rollRight = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  /** Pointer offset from the centre of the canvas, -1..1 each way; 0 when idle. */
  const stick = { x: 0, y: 0, active: false };

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (ROLL_LEFT.has(event.code)) rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) rollRight = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (ROLL_LEFT.has(event.code)) rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) rollRight = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    pitchUp = false;
    pitchDown = false;
    rollLeft = false;
    rollRight = false;
    throttleUp = false;
    throttleDown = false;
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    stick.active = true;
    updateStick(event);
  });
  target.addEventListener('pointermove', (event) => {
    if (stick.active) updateStick(event);
  });
  target.addEventListener('pointerup', () => {
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
  });
  target.addEventListener('wheel', (event) => {
    // Wheel up opens the throttle, wheel down closes it; handled as a nudge.
    stick.wheel = (stick.wheel || 0) + (event.deltaY < 0 ? 1 : -1);
    event.preventDefault();
  }, { passive: false });

  function updateStick(event) {
    const rect = target.getBoundingClientRect();
    stick.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    stick.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
  }

  return {
    /** -1..1: nose up is negative stick y, nose down positive; keys add to it. */
    pitch() {
      const keys = (pitchUp ? -1 : 0) + (pitchDown ? 1 : 0);
      const stickPitch = stick.active ? stick.y : 0;
      return Math.max(-1, Math.min(1, keys + stickPitch));
    },
    /** -1..1: left is negative, right positive; keys add to the stick. */
    roll() {
      const keys = (rollLeft ? -1 : 0) + (rollRight ? 1 : 0);
      const stickRoll = stick.active ? stick.x : 0;
      return Math.max(-1, Math.min(1, keys + stickRoll));
    },
    /** -1..1: throttle up is positive, down negative. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** Whole wheel notches since the last call: positive opens the throttle. */
    takeWheel() {
      const taken = stick.wheel || 0;
      stick.wheel = 0;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
