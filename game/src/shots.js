// The screenshot scenes behind ?shot=rings|takeoff|landing. Each one sets the
// Kestrel up in a real situation and flies it forward with a simple autopilot —
// throttle up, nose toward the next ring, wings level on the way home — so the
// frame is what a short game really looks like and the same seed always gives
// the same frame.

import { PLANE, RINGS, STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED, PHASE_FLYING, PHASE_GROUND } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * Steer toward a target point: bank toward the heading error, pitch toward the
 * altitude error, throttle up when slow. Returns [pitchIn, rollIn, throttleIn].
 */
function autopilotTo(plane, target, wantSpeed) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const wantHeading = Math.atan2(dx, dz);
  const headingError = wrapAngle(wantHeading - plane.heading);
  const rollIn = clamp(headingError * 1.6, -1, 1);
  const altError = target.y - plane.y;
  const pitchIn = clamp(-altError * 0.02 - plane.pitch * 2, -1, 1);
  const throttleIn = plane.speed < wantSpeed ? 1 : plane.speed > wantSpeed + 6 ? -1 : 0;
  return [pitchIn, rollIn, throttleIn];
}

function autopilotHome(plane) {
  // Fly back to the strip and line up on its heading for the landing.
  return autopilotTo(plane, { x: 0, y: 90, z: -700 }, 55);
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. Any unknown name stages the title scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  const plane = state.plane;
  world.reset();
  if (name === 'takeoff') {
    // Rolling down Runway 36 at rotation speed, nose just coming up.
    plane.throttle = 1;
    for (let i = 0; i < 9 / STEP; i += 1) {
      world.step(STEP, i > 7.5 / STEP ? -0.6 : 0, 0, 1, 0, true);
    }
    return { screen: SCREEN_PLAY, best: 0, bestTime: 0 };
  }
  if (name === 'landing') {
    // A full run: take off, fly all six rings, come home and land.
    plane.throttle = 1;
    let steps = 0;
    const maxSteps = 420 / STEP;
    while (steps < maxSteps) {
      let input;
      if (state.phase === PHASE_GROUND) {
        input = [-0.7, 0, 1];
      } else if (state.ringsDone < RINGS.length) {
        const ring = state.rings[state.ringsDone];
        input = autopilotTo(plane, ring, 58);
      } else {
        input = autopilotHome(plane);
        // Over the threshold, cut the throttle and flare.
        if (Math.abs(plane.x) < 60 && plane.z > -700 && plane.z < 200 && plane.y < 60) {
          input = [0.5, clamp(-plane.roll * 2, -1, 1), -1];
        }
      }
      const events = world.step(STEP, input[0], input[1], input[2], 0, false);
      steps += 1;
      if (events & (EVENT_LANDED | EVENT_CRASHED)) break;
    }
    const over = state.phase === PHASE_CRASHED;
    return { screen: over ? SCREEN_PLAY : SCREEN_OVER, best: state.score, bestTime: state.elapsed };
  }
  // Default: 'rings' — mid-course, chasing the second ring over the river valley.
  plane.throttle = 1;
  let steps = 0;
  const maxSteps = 120 / STEP;
  while (steps < maxSteps) {
    let input;
    if (state.phase === PHASE_GROUND) {
      input = [-0.7, 0, 1];
    } else {
      const ring = state.rings[Math.min(state.ringsDone, RINGS.length - 1)];
      input = autopilotTo(plane, ring, 58);
    }
    world.step(STEP, input[0], input[1], input[2], 0, false);
    steps += 1;
    if (state.ringsDone >= 2 && plane.y > 60) break;
  }
  return { screen: SCREEN_PLAY, best: state.score, bestTime: 0 };
}
