// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. A chase camera sits behind the Kestrel and looks
// along its heading; the valley is projected with a pinhole camera, the aircraft
// is drawn in screen space in front of it, and the HUD paints lit instruments
// over the top. Flat canvas shapes and text only — no images, no network.

import { CAMERA, FAR, FIELD, FOCAL, FONT, NEAR, PALETTE, RINGS, RUNWAY } from './config.js';
import { PHASE_CRASHED, PHASE_FLYING, PHASE_GROUND, PHASE_LANDED } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TWO_PI = Math.PI * 2;
const KNOTS = 1.94384; // m/s to knots
const FEET = 3.28084; // metres to feet

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function deg(radians) {
  return ((radians * 180) / Math.PI + 360) % 360;
}

function fmtTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  // --- Projection: a pinhole camera behind the plane, looking along its heading.
  // Returns screen x/y for a world point, or null when behind the camera.
  function makeProjector(plane, time) {
    const heading = plane.heading;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const camX = plane.x - sinH * CAMERA.behind;
    const camZ = plane.z - cosH * CAMERA.behind;
    const camY = plane.y + CAMERA.above;
    // The camera pitches with the plane, eased, so the horizon moves with climbs.
    const camPitch = plane.pitch * 0.55;
    const cosP = Math.cos(camPitch);
    const sinP = Math.sin(camPitch);
    const horizonY = FIELD.height * 0.52 - Math.tan(camPitch) * FOCAL * 0.62;
    const cx = FIELD.width / 2;
    function project(wx, wy, wz) {
      const dx = wx - camX;
      const dy = wy - camY;
      const dz = wz - camZ;
      // Rotate into camera space: forward, right, up (before pitch).
      const zc0 = dx * sinH + dz * cosH;
      const xc = dx * cosH - dz * sinH;
      const yc0 = dy;
      // Apply the camera pitch around the right axis.
      const zc = zc0 * cosP - yc0 * sinP;
      const yc = zc0 * sinP + yc0 * cosP;
      if (zc < NEAR) return null;
      const scale = FOCAL / zc;
      return { x: cx + xc * scale, y: horizonY - yc * scale, z: zc, s: scale };
    }
    return { project, horizonY, camX, camY, camZ, time };
  }

  function poly(points, fill) {
    if (points.length < 3) return;
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.fill();
  }

  function quad(project, x1, z1, x2, z2, fill, y) {
    const a = project(x1, y, z1);
    const b = project(x2, y, z1);
    const c = project(x2, y, z2);
    const d = project(x1, y, z2);
    if (!a || !b || !c || !d) return;
    poly([a, b, c, d], fill);
  }

  function rotatedQuad(project, cx, cz, w, d, rot, fill, y) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const corners = [
      [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
    ].map(([lx, lz]) => ({ x: cx + lx * cos - lz * sin, z: cz + lx * sin + lz * cos }));
    const pts = corners.map((p) => project(p.x, y, p.z));
    if (pts.some((p) => !p)) return;
    poly(pts, fill);
  }

  // --- Sky, ground and the valley.
  function drawSkyGround(projector, plane) {
    const horizonY = projector.horizonY;
    const sky = context.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.55, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, Math.max(0, horizonY));
    const ground = context.createLinearGradient(0, horizonY, 0, FIELD.height);
    ground.addColorStop(0, PALETTE.groundFar);
    ground.addColorStop(1, PALETTE.groundNear);
    context.fillStyle = ground;
    context.fillRect(0, Math.max(0, horizonY), FIELD.width, FIELD.height - Math.max(0, horizonY));
    // A pale haze band right at the horizon, so the ground reads far away.
    context.fillStyle = PALETTE.haze;
    context.globalAlpha = 0.45;
    context.fillRect(0, horizonY - 14, FIELD.width, 28);
    context.globalAlpha = 1;
    // Sun: high, warm, and always in the same place so the light reads.
    const sunX = FIELD.width * 0.78;
    const sunY = Math.min(horizonY - 120, 110);
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255, 246, 214, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 236, 180, 0.55)');
    glow.addColorStop(1, 'rgba(255, 236, 180, 0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 95, sunY - 95, 190, 190);
  }

  function drawHills(projector, state) {
    const { project } = projector;
    for (const hill of state.hills) {
      const top = project(hill.x, hill.h, hill.z);
      const left = project(hill.x - hill.rx, 0, hill.z);
      const right = project(hill.x + hill.rx, 0, hill.z);
      if (!top || !left || !right) continue;
      const width = right.x - left.x;
      if (width < 4) continue;
      context.fillStyle = '#6f8f7d';
      context.globalAlpha = 0.75;
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.quadraticCurveTo((left.x + top.x) / 2, top.y, top.x, top.y);
      context.quadraticCurveTo((right.x + top.x) / 2, top.y, right.x, right.y);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawTerrain(state, projector) {
    const { project } = projector;
    // Fields, far to near so nearer ones paint over farther ones.
    const sorted = state.fields.slice().sort((a, b) => {
      const da = Math.hypot(a.x - projector.camX, a.z - projector.camZ);
      const db = Math.hypot(b.x - projector.camX, b.z - projector.camZ);
      return db - da;
    });
    for (const field of sorted) {
      const dist = Math.hypot(field.x - projector.camX, field.z - projector.camZ);
      if (dist > FAR) continue;
      rotatedQuad(project, field.x, field.z, field.w, field.d, field.rot, PALETTE[field.colour], 0.4);
    }
    // The river: a chain of quads following its winding path.
    for (let i = 0; i < state.river.length - 1; i += 1) {
      const a = state.river[i];
      const b = state.river[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * 26;
      const nz = (dx / len) * 26;
      const pts = [project(a.x + nx, 0.5, a.z + nz), project(b.x + nx, 0.5, b.z + nz), project(b.x - nx, 0.5, b.z - nz), project(a.x - nx, 0.5, a.z - nz)];
      if (pts.some((p) => !p)) continue;
      poly(pts, PALETTE.river);
    }
    // The lake, east of the strip.
    const lake = state.lake;
    const lakePts = [];
    for (let i = 0; i <= 20; i += 1) {
      const a = (i / 20) * TWO_PI;
      lakePts.push(project(lake.x + Math.cos(a) * lake.rx, 0.5, lake.z + Math.sin(a) * lake.rz));
    }
    if (!lakePts.some((p) => !p)) poly(lakePts, PALETTE.lake);
    // Millbrook town: houses with roofs, plus the tall mill.
    for (const house of state.houses) {
      rotatedQuad(project, house.x, house.z, house.w, house.d, house.rot, PALETTE.townWall, 0.5);
      rotatedQuad(project, house.x, house.z, house.w * 0.7, house.d * 0.7, house.rot, PALETTE.townRoof, house.h);
    }
    rotatedQuad(project, state.mill.x, state.mill.z, state.mill.w, state.mill.d, 0, PALETTE.townWall, 0.5);
    rotatedQuad(project, state.mill.x, state.mill.z, state.mill.w * 0.7, state.mill.d * 0.7, 0, PALETTE.townRoof, state.mill.h);
    // Trees: small dark triangles standing on the ground.
    for (const tree of state.trees) {
      const dist = Math.hypot(tree.x - projector.camX, tree.z - projector.camZ);
      if (dist > 1400 || dist < 30) continue;
      const base = project(tree.x, 0, tree.z);
      const top = project(tree.x, tree.s, tree.z);
      if (!base || !top) continue;
      const w = Math.max(2, tree.s * base.s * 0.5);
      context.fillStyle = PALETTE.forest;
      context.beginPath();
      context.moveTo(top.x, top.y);
      context.lineTo(base.x - w, base.y);
      context.lineTo(base.x + w, base.y);
      context.closePath();
      context.fill();
    }
  }

  function drawRunway(state, projector) {
    const { project } = projector;
    const half = RUNWAY.width / 2;
    const z0 = RUNWAY.z - RUNWAY.length / 2;
    const z1 = RUNWAY.z + RUNWAY.length / 2;
    quad(project, RUNWAY.x - half, z0, RUNWAY.x + half, z1, PALETTE.runway, 0.6);
    // Centreline dashes and the threshold bars at each end.
    for (let z = z0 + 30; z < z1 - 20; z += 60) {
      quad(project, RUNWAY.x - 1.2, z, RUNWAY.x + 1.2, z + 26, PALETTE.runwayMark, 0.7);
    }
    for (const end of [z0 + 8, z1 - 26]) {
      quad(project, RUNWAY.x - half + 3, end, RUNWAY.x + half - 3, end + 10, PALETTE.runwayMark, 0.7);
    }
    // The big "36" at the southern threshold, drawn as two block digits.
    const digits = project(RUNWAY.x, 0.7, z0 + 60);
    if (digits && digits.z < 900) {
      context.fillStyle = PALETTE.runwayMark;
      context.font = `bold ${Math.max(10, digits.s * 26)}px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('36', digits.x, digits.y);
    }
    // Hangars and the windsock beside the strip.
    for (const hangar of state.hangars) {
      rotatedQuad(project, hangar.x, hangar.z, hangar.w, hangar.d, 0, '#7a8288', 0.5);
      rotatedQuad(project, hangar.x, hangar.z, hangar.w * 0.8, hangar.d * 0.8, 0, '#aab4ba', hangar.h);
    }
    const sockBase = project(48, 0, -60);
    const sockTop = project(48, 14, -60);
    if (sockBase && sockTop) {
      context.strokeStyle = '#c8ccd0';
      context.lineWidth = Math.max(1, sockBase.s * 1.2);
      context.beginPath();
      context.moveTo(sockBase.x, sockBase.y);
      context.lineTo(sockTop.x, sockTop.y);
      context.stroke();
      const wave = Math.sin(projector.time * 2.2) * 2;
      context.fillStyle = PALETTE.planeBody;
      context.beginPath();
      context.moveTo(sockTop.x, sockTop.y);
      context.lineTo(sockTop.x + 16, sockTop.y + 3 + wave);
      context.lineTo(sockTop.x, sockTop.y + 7);
      context.closePath();
      context.fill();
    }
  }

  function drawClouds(state, projector) {
    const { project } = projector;
    const sorted = state.clouds.slice().sort((a, b) => {
      const da = Math.hypot(a.x - projector.camX, a.z - projector.camZ);
      const db = Math.hypot(b.x - projector.camX, b.z - projector.camZ);
      return db - da;
    });
    for (const cloud of sorted) {
      const p = project(cloud.x, cloud.y, cloud.z);
      if (!p || p.z > FAR) continue;
      const r = cloud.s * p.s * 0.9;
      if (r < 3) continue;
      context.fillStyle = 'rgba(255, 255, 255, 0.88)';
      context.beginPath();
      context.ellipse(p.x, p.y, r, r * 0.42, 0, 0, TWO_PI);
      context.fill();
      context.beginPath();
      context.ellipse(p.x - r * 0.55, p.y + r * 0.1, r * 0.55, r * 0.3, 0, 0, TWO_PI);
      context.fill();
      context.beginPath();
      context.ellipse(p.x + r * 0.55, p.y + r * 0.08, r * 0.6, r * 0.32, 0, 0, TWO_PI);
      context.fill();
    }
  }

  function drawRings(state, projector, time) {
    const { project } = projector;
    for (let i = 0; i < state.rings.length; i += 1) {
      const ring = state.rings[i];
      const isNext = !ring.done && state.rings.slice(0, i).every((r) => r.done);
      const colour = ring.done ? PALETTE.ringDone : isNext ? PALETTE.ringNext : PALETTE.ringTodo;
      const centre = project(ring.x, ring.y, ring.z);
      if (!centre || centre.z > FAR) continue;
      // The hoop faces the pilot: its plane is square to the line from the
      // camera, so sample a circle around the centre in screen space scaled
      // by depth, then lift it into the world for the posts.
      const radius = ring.r * centre.s;
      if (radius < 2) continue;
      const pulse = isNext ? 1 + Math.sin(time * 4) * 0.08 : 1;
      context.strokeStyle = colour;
      context.lineWidth = Math.max(2, radius * 0.12 * pulse);
      context.globalAlpha = ring.done ? 0.55 : 0.95;
      context.beginPath();
      context.arc(centre.x, centre.y, radius * pulse, 0, TWO_PI);
      context.stroke();
      context.globalAlpha = 1;
      // A small beacon light on top of the next ring.
      if (isNext) {
        context.fillStyle = PALETTE.ringNext;
        context.beginPath();
        context.arc(centre.x, centre.y - radius * pulse, Math.max(3, radius * 0.1), 0, TWO_PI);
        context.fill();
        text(`${i + 1}`, centre.x, centre.y + radius * 0.35, Math.max(14, radius * 0.5), colour, 'center', '700 ');
      }
    }
  }

  // --- The Kestrel K-2, drawn in screen space in front of the camera.
  function drawPlane(state, time) {
    const plane = state.plane;
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.62 + plane.pitch * 60;
    const scale = 1;
    context.save();
    context.translate(cx, cy);
    context.rotate(plane.roll * 0.9);
    context.scale(scale, scale);
    const blink = Math.floor(time * 1.6) % 2 === 0;
    // Propeller disc: a translucent blur that spins with the throttle.
    const propSpeed = 0.25 + plane.throttle * 0.75;
    const propAlpha = 0.10 + propSpeed * 0.16;
    context.fillStyle = `rgba(40, 40, 44, ${propAlpha})`;
    context.beginPath();
    context.ellipse(0, -6, 7, 46, 0, 0, TWO_PI);
    context.fill();
    context.strokeStyle = 'rgba(30, 30, 34, 0.5)';
    context.lineWidth = 2;
    const blade = (time * (6 + plane.throttle * 26)) % Math.PI;
    context.beginPath();
    context.moveTo(-Math.sin(blade) * 44, -6 - Math.cos(blade) * 44);
    context.lineTo(Math.sin(blade) * 44, -6 + Math.cos(blade) * 44);
    context.stroke();
    // Tailplane and fin, behind the fuselage.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-14, -52);
    context.lineTo(-58, -72);
    context.lineTo(-52, -60);
    context.lineTo(-12, -44);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, -52);
    context.lineTo(58, -72);
    context.lineTo(52, -60);
    context.lineTo(12, -44);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(-4, -58);
    context.lineTo(-2, -96);
    context.lineTo(10, -96);
    context.lineTo(12, -58);
    context.closePath();
    context.fill();
    // Wings: broad, slightly swept, cream tips.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-16, -18);
    context.lineTo(-118, -34);
    context.lineTo(-112, -8);
    context.lineTo(-14, 6);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(16, -18);
    context.lineTo(118, -34);
    context.lineTo(112, -8);
    context.lineTo(14, 6);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(-118, -34);
    context.lineTo(-96, -31);
    context.lineTo(-92, -12);
    context.lineTo(-112, -8);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(118, -34);
    context.lineTo(96, -31);
    context.lineTo(92, -12);
    context.lineTo(112, -8);
    context.closePath();
    context.fill();
    // Fuselage: nose to tail, with a cream cheatline.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, -64);
    context.quadraticCurveTo(13, -58, 15, -34);
    context.lineTo(13, 34);
    context.quadraticCurveTo(10, 52, 0, 56);
    context.quadraticCurveTo(-10, 52, -13, 34);
    context.lineTo(-15, -34);
    context.quadraticCurveTo(-13, -58, 0, -64);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-14, -30, 28, 7);
    // Cockpit windows, lit from inside.
    context.fillStyle = PALETTE.planeGlass;
    context.beginPath();
    context.moveTo(-10, -46);
    context.lineTo(10, -46);
    context.lineTo(8, -28);
    context.lineTo(-8, -28);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.55)';
    context.fillRect(-8, -44, 4, 14);
    // Spinner and the registration on the flank.
    context.fillStyle = PALETTE.planeDark;
    context.beginPath();
    context.arc(0, -6, 7, 0, TWO_PI);
    context.fill();
    context.fillStyle = PALETTE.planeTrim;
    context.font = `700 11px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('N57SK', 0, 26);
    // Navigation lights: red port, green starboard, white tail blinking.
    context.fillStyle = '#ff4b3e';
    context.beginPath();
    context.arc(-116, -21, 4, 0, TWO_PI);
    context.fill();
    context.fillStyle = '#37e07a';
    context.beginPath();
    context.arc(116, -21, 4, 0, TWO_PI);
    context.fill();
    if (blink) {
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 54, 3.5, 0, TWO_PI);
      context.fill();
    }
    context.restore();
    // A soft shadow on the ground when low over the strip.
    if (plane.y < 60 && state.phase !== PHASE_CRASHED) {
      const shadow = 1 - plane.y / 60;
      context.fillStyle = `rgba(20, 30, 20, ${0.25 * shadow})`;
      context.beginPath();
      context.ellipse(cx, FIELD.height * 0.86, 90 * shadow + 20, 12 * shadow + 4, 0, 0, TWO_PI);
      context.fill();
    }
  }

  // --- The HUD: altitude, speed and heading always on, plus the instruments.
  function drawHud(state, best, bestTime) {
    const plane = state.plane;
    const altFt = Math.round(plane.y * FEET);
    const speedKt = Math.round(plane.speed * KNOTS);
    const headingDeg = Math.round(deg(plane.heading));
    context.textBaseline = 'top';
    // Top bar: three lit readouts.
    context.fillStyle = 'rgba(8, 18, 32, 0.55)';
    context.fillRect(0, 0, FIELD.width, 64);
    text(`ALT  ${altFt.toLocaleString('en-US')} ft`, 24, 18, 28, PALETTE.hudText, 'left', '700 ');
    text(`SPD  ${speedKt} kt`, FIELD.width / 2 - 170, 18, 28, PALETTE.hudText, 'left', '700 ');
    text(`HDG  ${String(headingDeg).padStart(3, '0')}°`, FIELD.width / 2 + 60, 18, 28, PALETTE.hudText, 'left', '700 ');
    // Compass strip under the top bar.
    const stripY = 74;
    context.fillStyle = 'rgba(8, 18, 32, 0.45)';
    context.fillRect(FIELD.width / 2 - 190, stripY - 6, 380, 30);
    for (let d = -60; d <= 60; d += 15) {
      const hd = (headingDeg + d + 360) % 360;
      const x = FIELD.width / 2 + d * 2.4;
      const label = hd === 0 ? 'N' : hd === 90 ? 'E' : hd === 180 ? 'S' : hd === 270 ? 'W' : String(hd);
      text(label, x, stripY, hd % 90 === 0 ? 17 : 13, hd % 90 === 0 ? PALETTE.hudText : PALETTE.hudDim, 'center', hd % 90 === 0 ? '700 ' : '');
    }
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(FIELD.width / 2, stripY - 8);
    context.lineTo(FIELD.width / 2 - 6, stripY - 18);
    context.lineTo(FIELD.width / 2 + 6, stripY - 18);
    context.closePath();
    context.fill();
    // Right block: score, rings, time, best.
    text(`SCORE ${state.score}`, FIELD.width - 24, 14, 24, PALETTE.hudText, 'right', '700 ');
    text(`RINGS ${state.ringsDone}/${state.rings.length}`, FIELD.width - 24, 40, 18, PALETTE.hudAmber, 'right', '700 ');
    text(`TIME ${fmtTime(state.elapsed)}`, FIELD.width - 24, 64, 18, PALETTE.hudText, 'right');
    text(`BEST ${best}  ·  ${bestTime ? fmtTime(bestTime) : '--:--'}`, FIELD.width - 24, 86, 15, PALETTE.hudDim, 'right');
    // Left block: artificial horizon dial and throttle + fuel bars.
    const dialX = 92;
    const dialY = 150;
    const dialR = 52;
    context.fillStyle = 'rgba(8, 18, 32, 0.6)';
    context.beginPath();
    context.arc(dialX, dialY, dialR + 6, 0, TWO_PI);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(dialX, dialY, dialR + 6, 0, TWO_PI);
    context.stroke();
    context.save();
    context.beginPath();
    context.arc(dialX, dialY, dialR, 0, TWO_PI);
    context.clip();
    context.translate(dialX, dialY);
    context.rotate(plane.roll);
    context.translate(0, plane.pitch * 120);
    context.fillStyle = '#3f7fc4';
    context.fillRect(-dialR, -dialR * 2, dialR * 2, dialR * 2);
    context.fillStyle = '#8a6a42';
    context.fillRect(-dialR, 0, dialR * 2, dialR * 2);
    context.fillStyle = '#ffffff';
    context.fillRect(-dialR, -1.5, dialR * 2, 3);
    context.restore();
    context.fillStyle = PALETTE.hudAmber;
    context.beginPath();
    context.moveTo(dialX - 16, dialY);
    context.lineTo(dialX + 16, dialY);
    context.lineTo(dialX, dialY + 8);
    context.closePath();
    context.fill();
    text('ATTITUDE', dialX, dialY + dialR + 12, 13, PALETTE.hudDim, 'center');
    // Throttle bar.
    const barX = 40;
    const barY = 250;
    text('THR', barX, barY - 22, 14, PALETTE.hudDim, 'left', '700 ');
    context.fillStyle = 'rgba(8, 18, 32, 0.6)';
    context.fillRect(barX, barY, 24, 120);
    const thrH = 120 * plane.throttle;
    context.fillStyle = plane.throttle > 0.85 ? PALETTE.hudAmber : PALETTE.hudGreen;
    context.fillRect(barX + 3, barY + 120 - thrH, 18, thrH);
    text(`${Math.round(plane.throttle * 100)}%`, barX + 32, barY + 48, 15, PALETTE.hudText, 'left');
    // Fuel bar.
    const fuelY = barY + 150;
    text('FUEL', barX, fuelY - 22, 14, PALETTE.hudDim, 'left', '700 ');
    context.fillStyle = 'rgba(8, 18, 32, 0.6)';
    context.fillRect(barX, fuelY, 24, 120);
    const fuelH = 120 * (state.fuel / 100);
    context.fillStyle = state.fuel < 20 ? PALETTE.hudRed : PALETTE.hudGreen;
    context.fillRect(barX + 3, fuelY + 120 - fuelH, 18, fuelH);
    text(`${Math.round(state.fuel)}%`, barX + 32, fuelY + 48, 15, state.fuel < 20 ? PALETTE.hudRed : PALETTE.hudText, 'left');
    // Next-ring pointer: a chevron at the screen edge toward the next ring.
    const next = state.rings.find((r) => !r.done);
    if (next && state.phase === PHASE_FLYING) {
      const dx = next.x - plane.x;
      const dz = next.z - plane.z;
      const dist = Math.hypot(dx, dz);
      const bearing = deg(Math.atan2(dx, dz));
      const rel = ((bearing - headingDeg + 540) % 360) - 180;
      const px = FIELD.width / 2 + clamp(rel * 4, -560, 560);
      const py = 132;
      context.fillStyle = PALETTE.ringNext;
      context.beginPath();
      context.moveTo(px, py - 10);
      context.lineTo(px - 12, py + 8);
      context.lineTo(px + 12, py + 8);
      context.closePath();
      context.fill();
      text(`RING ${state.ringsDone + 1} · ${Math.round(dist)} m`, px, py + 14, 15, PALETTE.ringNext, 'center', '700 ');
    }
    // The courier's message line, bottom centre.
    if (state.messageTime > 0 && state.message) {
      context.fillStyle = 'rgba(8, 18, 32, 0.6)';
      const w = context.measureText(state.message).width + 36;
      context.fillRect(FIELD.width / 2 - w / 2, FIELD.height - 52, w, 34);
      text(state.message, FIELD.width / 2, FIELD.height - 44, 17, PALETTE.hudText, 'center');
    }
    // Ground-mode hint: throttle and rotate cues.
    if (state.phase === PHASE_GROUND) {
      text('Hold SHIFT for full throttle — pull up (↑) past 55 kt to lift off', FIELD.width / 2, FIELD.height - 92, 17, PALETTE.hudAmber, 'center');
    }
    if (state.phase === PHASE_CRASHED) {
      text('Press R or Space to fly again', FIELD.width / 2, FIELD.height - 92, 17, PALETTE.hudRed, 'center', '700 ');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 66;
    const width = 640;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, accent || PALETTE.hudText, 'center', '700 ');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 128 + index * lineHeight, 21, PALETTE.hudDim, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.hudAmber, 'center', '700 ');
  }

  const TITLE_LINES = [
    'A bush-plane courier run over the valley of Millbrook.',
    'Take off from Runway 36, fly all six gold rings in order,',
    'then bring the Kestrel home and land on the strip.',
    'Watch the fuel — an empty tank only glides.',
    '↑ ↓ pitch · ← → bank · SHIFT / CTRL throttle · mouse steers too',
  ];

  function draw(state, screen, best, bestTime, time) {
    const plane = state.plane;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const projector = makeProjector(plane, time);
    drawSkyGround(projector, plane);
    drawHills(projector, state);
    drawTerrain(state, projector);
    drawRunway(state, projector);
    drawClouds(state, projector);
    drawRings(state, projector, time);
    drawPlane(state, time);
    if (screen === SCREEN_TITLE) {
      const lines = TITLE_LINES.slice();
      lines.push(`Best score ${best}${bestTime ? ` · best time ${fmtTime(bestTime)}` : ''}`);
      drawPanel('Ridgeline Courier', lines, 'Press Space or click to fly');
      return;
    }
    drawHud(state, best, bestTime);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The valley will wait for you.', 'M mutes the sound. R restarts the run.'], 'Press P to keep flying');
    } else if (screen === SCREEN_OVER) {
      const landed = state.phase === PHASE_LANDED;
      const lines = landed
        ? [
            `Score ${state.score}  ·  rings ${state.ringsDone} of ${state.rings.length}`,
            `Time ${fmtTime(state.elapsed)}  ·  best ${best}`,
            state.landingQuality || 'Down safe.',
            `Fuel left ${Math.round(state.fuel)}%`,
          ]
        : [
            `Score ${state.score}  ·  rings ${state.ringsDone} of ${state.rings.length}`,
            `Time ${fmtTime(state.elapsed)}  ·  best ${best}`,
            'The Kestrel will be patched up by morning.',
          ];
      drawPanel(
        landed ? 'Run complete' : 'Crashed',
        lines,
        'Press Space or R to fly again',
        landed ? PALETTE.hudGreen : PALETTE.hudRed,
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
