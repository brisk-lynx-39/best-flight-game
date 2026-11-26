// The game's rules and state, with no drawing and no browser in it: the Kestrel
// K-2 bush plane, its flight model, the valley it flies over, the six-ring
// courier course, fuel, scoring, landings and crashes. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. Nothing here allocates after
// createWorld returns.

import { FIELD, FUEL, PLANE, RINGS, RUNWAY, SCORE, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_LOW = 8;
export const EVENT_FUEL_EMPTY = 16;

export const PHASE_GROUND = 'ground';
export const PHASE_FLYING = 'flying';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

/** Distance from a point to the runway centreline, in metres. */
function runwayOffset(x, z) {
  return Math.abs(x - RUNWAY.x);
}

export function createWorld(random) {
  // --- The valley, built once from the seed: fields, a river, a lake, a town,
  // a forest belt, hills on the horizon and drifting clouds. Every feature is
  // a flat quad or blob on the ground plane (y = 0) or a puff in the sky.
  const fields = [];
  const fieldColours = ['fieldA', 'fieldB', 'fieldC', 'fieldD'];
  for (let i = 0; i < 90; i += 1) {
    const cx = -1600 + random() * 3200;
    const cz = -400 + random() * 2600;
    // Keep the runway clear: no field may cross the strip.
    if (Math.abs(cx) < 120 && cz > -500 && cz < 700) continue;
    const w = 90 + random() * 180;
    const d = 70 + random() * 140;
    fields.push({
      x: cx - w / 2, z: cz - d / 2, w, d,
      colour: fieldColours[i % fieldColours.length],
      rot: (random() - 0.5) * 0.6,
    });
  }
  const trees = [];
  for (let i = 0; i < 260; i += 1) {
    const x = -1700 + random() * 3400;
    const z = -500 + random() * 2800;
    if (Math.abs(x) < 90 && z > -450 && z < 650) continue;
    trees.push({ x, z, s: 6 + random() * 9 });
  }
  // The river winds north through the valley; the lake sits east of the strip.
  const river = [];
  for (let z = -600; z <= 2400; z += 120) {
    river.push({ x: -1050 + Math.sin(z * 0.0011) * 260 + Math.sin(z * 0.0031) * 60, z });
  }
  const lake = { x: 1150, z: 1750, rx: 260, rz: 180 };
  // Millbrook town: a grid of houses west of the runway, and a taller mill.
  const houses = [];
  for (let i = 0; i < 46; i += 1) {
    houses.push({
      x: -1250 + (i % 8) * 55 + (random() - 0.5) * 18,
      z: 250 + Math.floor(i / 8) * 55 + (random() - 0.5) * 18,
      w: 22 + random() * 10, d: 18 + random() * 10,
      h: 8 + random() * 9, rot: (random() - 0.5) * 0.3,
    });
  }
  const mill = { x: -1180, z: 240, w: 40, d: 30, h: 42 };
  // Low hills ring the valley far out; clouds drift above it.
  const hills = [];
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * TWO_PI + random() * 0.3;
    hills.push({ x: Math.sin(a) * 2600, z: Math.cos(a) * 2600, rx: 500 + random() * 500, h: 180 + random() * 160 });
  }
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: -2000 + random() * 4000,
      y: 260 + random() * 220,
      z: -600 + random() * 3200,
      s: 60 + random() * 130,
      drift: 2 + random() * 3,
    });
  }
  // The windsock and two hangars beside the strip.
  const hangars = [
    { x: -70, z: -80, w: 46, d: 34, h: 16 },
    { x: -70, z: -140, w: 40, d: 30, h: 14 },
  ];

  const plane = {
    x: 0, y: 0, z: -RUNWAY.length / 2 + 40,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0, vy: 0,
  };
  const rings = RINGS.map((ring) => ({ ...ring, done: false }));
  const state = {
    plane, rings, fields, trees, river, lake, houses, mill, hills, clouds, hangars,
    phase: PHASE_GROUND,
    score: 0, ringsDone: 0, elapsed: 0, fuel: FUEL.start,
    message: '', messageTime: 0,
    landingSink: 0, landingQuality: '',
    fuelWarned: false, fuelEmptyAnnounced: false,
    airborne: false, groundSpeed: 0,
  };

  function reset() {
    plane.x = 0;
    plane.y = 0;
    plane.z = -RUNWAY.length / 2 + 40;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.vy = 0;
    for (const ring of rings) ring.done = false;
    state.phase = PHASE_GROUND;
    state.score = 0;
    state.ringsDone = 0;
    state.elapsed = 0;
    state.fuel = FUEL.start;
    state.message = 'Line up on Runway 36 — full throttle to take off.';
    state.messageTime = 6;
    state.landingSink = 0;
    state.landingQuality = '';
    state.fuelWarned = false;
    state.fuelEmptyAnnounced = false;
    state.airborne = false;
    state.groundSpeed = 0;
  }

  function say(text, seconds) {
    state.message = text;
    state.messageTime = seconds;
  }

  function nextRing() {
    for (const ring of rings) if (!ring.done) return ring;
    return null;
  }

  function land(sink) {
    state.landingSink = sink;
    state.phase = PHASE_LANDED;
    const allRings = state.ringsDone === rings.length;
    let bonus = allRings ? SCORE.landing : SCORE.earlyLanding;
    if (sink <= SCORE.smoothSink) {
      bonus += SCORE.smoothBonus;
      state.landingQuality = 'Butter-smooth touchdown.';
    } else {
      state.landingQuality = 'Down safe — a firm one.';
    }
    const timeBonus = Math.max(0, Math.round((SCORE.parSeconds - state.elapsed) * SCORE.timePointPerSecond));
    state.score += bonus + timeBonus;
    say(
      allRings
        ? `Course complete — landed! +${bonus} landing, +${timeBonus} time bonus.`
        : `Landed early with ${state.ringsDone} of ${rings.length} rings. +${bonus} landing, +${timeBonus} time bonus.`,
      8,
    );
    return EVENT_LANDED;
  }

  function crash(reason) {
    state.phase = PHASE_CRASHED;
    say(reason, 10);
    return EVENT_CRASHED;
  }

  /**
   * One fixed step. `pitchIn` is -1..1 (negative pulls the nose up),
   * `rollIn` is -1..1 (negative banks left), `throttleIn` is -1..1.
   * With `harmless` set (the title screen's backdrop) the plane flies but
   * nothing scores and nothing crashes.
   */
  function step(dt, pitchIn, rollIn, throttleIn, wheel, harmless) {
    let events = 0;
    if (state.phase === PHASE_LANDED || state.phase === PHASE_CRASHED) return events;
    // The clock runs once the run starts: rolling for takeoff, or in the air.
    if (state.phase === PHASE_FLYING || plane.speed > 1) state.elapsed += dt;
    if (state.messageTime > 0) state.messageTime -= dt;

    // Throttle: keys, wheel notches, and fuel starvation.
    if (state.fuel <= 0) {
      plane.throttle = 0;
      if (!state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        say('Fuel empty — gliding. Put her down on the strip.', 8);
        events |= EVENT_FUEL_EMPTY;
      }
    } else {
      plane.throttle = clamp(plane.throttle + throttleIn * PLANE.throttleRate * dt + wheel * 0.08, 0, 1);
    }
    state.fuel = Math.max(0, state.fuel - plane.throttle * FUEL.drainPerSecond * dt);
    if (state.fuel < 20 && !state.fuelWarned) {
      state.fuelWarned = true;
      say('Fuel low — head for the runway.', 6);
      events |= EVENT_FUEL_LOW;
    }

    // Attitude follows the stick, easing back toward level when released.
    const targetPitch = clamp(pitchIn * PLANE.maxPitch, -PLANE.maxPitch, PLANE.maxPitch);
    const targetRoll = clamp(rollIn * PLANE.maxRoll, -PLANE.maxRoll, PLANE.maxRoll);
    plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * dt * 2.4, PLANE.pitchRate * dt * 2.4);
    plane.roll += clamp(targetRoll - plane.roll, -PLANE.rollRate * dt * 2.2, PLANE.rollRate * dt * 2.2);
    if (pitchIn === 0) plane.pitch += (0 - plane.pitch) * 0.5 * dt;
    if (rollIn === 0) plane.roll += (0 - plane.roll) * 0.8 * dt;

    // Speed chases the throttle; drag grows with the square of speed.
    const targetSpeed = plane.throttle * PLANE.maxSpeed;
    const accel = targetSpeed > plane.speed ? 9 : 13;
    plane.speed += clamp(targetSpeed - plane.speed, -accel * dt, accel * dt);

    // The bank turns the nose; the turn tightens with speed. Parked, she stays put.
    // Banking right (positive roll) turns the nose right, toward larger headings.
    const turnFactor = plane.speed < 2 ? 0 : clamp(plane.speed / PLANE.maxSpeed, 0.25, 1);
    plane.heading = wrapAngle(plane.heading + Math.sin(plane.roll) * PLANE.turnRate * turnFactor * dt);

    // Vertical speed: pitch and power lift the nose, gravity pulls it down.
    // Cutting the throttle settles the plane at a gentle sink, so a level
    // approach with the power off is a landing, not a stall.
    const flying = plane.speed > PLANE.stallSpeed;
    let vy = 0;
    if (state.phase === PHASE_FLYING || (state.phase === PHASE_GROUND && plane.speed > PLANE.rotateSpeed && plane.pitch < -0.05)) {
      if (state.phase === PHASE_GROUND) {
        state.phase = PHASE_FLYING;
        state.airborne = true;
        if (!harmless) say('Airborne! Fly the rings in order — gold ring next.', 5);
      }
      if (flying) {
        vy = Math.sin(-plane.pitch) * plane.speed - (1 - plane.throttle) * 3;
        vy = clamp(vy, -PLANE.sink * 1.6, PLANE.climb * 1.6);
      } else {
        vy = -PLANE.sink;
      }
    }
    plane.vy = vy;
    // Energy: a climb spends speed, a descent buys a little back.
    if (vy > 0) plane.speed = Math.max(0, plane.speed - vy * 0.15 * dt);
    else if (vy < 0) plane.speed = Math.min(PLANE.maxSpeed, plane.speed - vy * 0.08 * dt);
    plane.y += vy * dt;

    // Move along the heading; the nose dips a little with the climb.
    const forwardX = Math.sin(plane.heading);
    const forwardZ = Math.cos(plane.heading);
    plane.x += forwardX * plane.speed * dt;
    plane.z += forwardZ * plane.speed * dt;
    state.groundSpeed = plane.speed;
    state.airborne = state.phase === PHASE_FLYING;

    // Clouds drift slowly east.
    for (const cloud of clouds) {
      cloud.x += cloud.drift * dt;
      if (cloud.x > 2200) cloud.x = -2200;
    }

    // Stay inside the valley: a soft wall turns the plane back.
    const radius = Math.hypot(plane.x, plane.z);
    if (radius > 2300) {
      plane.heading = wrapAngle(Math.atan2(-plane.x, -plane.z));
      say('Edge of the valley — turned back toward the strip.', 4);
    }

    // Rings: fly through the hoop to collect it.
    if (state.phase === PHASE_FLYING && !harmless) {
      const ring = nextRing();
      if (ring) {
        const dx = plane.x - ring.x;
        const dy = plane.y - ring.y;
        const dz = plane.z - ring.z;
        if (Math.hypot(dx, dy, dz) < ring.r) {
          ring.done = true;
          state.ringsDone += 1;
          state.score += SCORE.ring;
          events |= EVENT_RING;
          const following = nextRing();
          say(
            following
              ? `Ring ${state.ringsDone} of ${rings.length}! +${SCORE.ring} — next ring ahead.`
              : `Last ring! +${SCORE.ring} — bring her home to Runway 36.`,
            4,
          );
        }
      }
    }

    // Ground contact.
    if (plane.y <= 0) {
      plane.y = 0;
      const sink = -vy;
      const onStrip = runwayOffset(plane.x, plane.z) <= RUNWAY.landHalfWidth
        && plane.z >= -RUNWAY.length / 2 - 40 && plane.z <= RUNWAY.length / 2 + 40;
      const aligned = Math.abs(wrapAngle(plane.heading)) < 0.45 || Math.abs(wrapAngle(plane.heading - Math.PI)) < 0.45;
      const gentle = sink <= RUNWAY.maxSink;
      const level = Math.abs(plane.roll) < 0.5;
      if (state.phase === PHASE_FLYING) {
        if (onStrip && aligned && gentle && level) {
          if (!harmless) return events | land(sink);
          plane.speed *= 0.94;
        } else if (!harmless) {
          if (!onStrip) return events | crash('Off the strip — the Kestrel is in the fields. The courier run is over.');
          if (!gentle) return events | crash('Too hard on the wheels — the landing gear folded. The courier run is over.');
          if (!aligned) return events | crash('Landed sideways across the strip. The courier run is over.');
          return events | crash('A wing caught the ground on touchdown. The courier run is over.');
        }
        plane.speed *= 0.94;
      } else {
        // Still rolling on the ground: light rolling drag, keep her on the strip.
        // Only a coasting plane ever fully stops — a powered one must keep
        // the speed each step adds, or she could never get rolling.
        plane.speed *= 1 - 0.06 * dt;
        if (plane.speed < 0.5 && plane.throttle < 0.05) plane.speed = 0;
        if (!onStrip && plane.speed > 12 && !harmless) {
          return events | crash('Ran off the runway into the grass. The courier run is over.');
        }
      }
      plane.vy = 0;
    }
    return events;
  }

  reset();
  return { state, reset, step, nextRing, say };
}
