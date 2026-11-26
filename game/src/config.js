// Ridgeline Courier — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. World units are metres:
// x east, y altitude, z north. Heading 0 faces north (+z), 90 faces east (+x).

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Camera focal length in logical pixels for the pseudo-3D projection. */
export const FOCAL = 760;
/** How far behind and above the aircraft the chase camera sits, in metres. */
export const CAMERA = { behind: 26, above: 7.5 };
/** Closest a projected point may be before it is clipped, in metres. */
export const NEAR = 2;
/** How far the eye can see, in metres; features past it are not drawn. */
export const FAR = 5200;

export const PLANE = {
  /** Top speed at full throttle, m/s (~145 kt). */
  maxSpeed: 75,
  /** Speed below which the wing stops flying, m/s. */
  stallSpeed: 19,
  /** Speed at which the wheels leave the runway, m/s. */
  rotateSpeed: 30,
  /** Throttle change per second from a held key. */
  throttleRate: 0.55,
  /** Pitch change per second from a held key, radians. */
  pitchRate: 0.55,
  /** Roll change per second from a held key, radians. */
  rollRate: 1.5,
  /** Hardest the nose may point up or down, radians. */
  maxPitch: 0.42,
  /** Hardest the wings may bank, radians. */
  maxRoll: 1.05,
  /** How fast the nose follows the bank into a turn. */
  turnRate: 0.55,
  /** Climb the wing gives at full speed and level pitch, m/s. */
  climb: 7,
  /** Sink when stalled or throttled back, m/s. */
  sink: 9,
};

/** Fuel, in percent. Drains with throttle; empty means gliding only. */
export const FUEL = { start: 100, drainPerSecond: 0.55 };

/** The course: six rings over the valley, then home to the runway. */
export const RINGS = [
  { x: 0, y: 90, z: 900, r: 22 },
  { x: 520, y: 140, z: 1500, r: 22 },
  { x: 980, y: 110, z: 900, r: 20 },
  { x: 700, y: 190, z: 150, r: 22 },
  { x: -350, y: 130, z: 420, r: 20 },
  { x: -620, y: 100, z: 1250, r: 22 },
];

/** The home strip: centred on the origin, running north-south. */
export const RUNWAY = {
  x: 0,
  z: 0,
  length: 620,
  width: 26,
  heading: 0,
  /** Half-width of the strip the wheels must stay inside to count as a landing. */
  landHalfWidth: 22,
  /** Gentlest touchdown that still counts as a landing, m/s of sink. */
  maxSink: 4.5,
};

/** Scoring. */
export const SCORE = {
  ring: 500,
  /** Bonus for landing after every ring, before the time bonus. */
  landing: 1000,
  /** Bonus for landing early (rings missed), before the time bonus. */
  earlyLanding: 250,
  /** Time bonus: this many points per second under the par time. */
  parSeconds: 240,
  timePointPerSecond: 5,
  /** Smooth-touchdown bonus when the sink at touchdown is under this, m/s. */
  smoothSink: 2.0,
  smoothBonus: 300,
};

export const PALETTE = {
  backdrop: '#0b1526',
  skyTop: '#2f6fb4',
  skyMid: '#7fb2dd',
  skyLow: '#cfe6f2',
  haze: '#d8e8f0',
  groundFar: '#7d9b6a',
  groundNear: '#5d8148',
  fieldA: '#8aa860',
  fieldB: '#a8a05e',
  fieldC: '#6f9a55',
  fieldD: '#b5a06b',
  forest: '#3e6b34',
  road: '#5a5148',
  river: '#4f8fc4',
  lake: '#5b9bd0',
  townRoof: '#8a5f4a',
  townWall: '#cbb59a',
  runway: '#3c3f45',
  runwayMark: '#f2f0da',
  ringNext: '#ffc233',
  ringDone: '#7ddc8a',
  ringTodo: '#e8f4ff',
  planeBody: '#e8542f',
  planeTrim: '#f6f1e6',
  planeDark: '#33302c',
  planeGlass: '#9fd4e8',
  hudText: '#eef6ff',
  hudDim: '#a9c4d8',
  hudAmber: '#ffc233',
  hudGreen: '#7ddc8a',
  hudRed: '#ff6b5e',
  panel: 'rgba(10, 22, 38, 0.82)',
  panelEdge: '#3d6a92',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridgeline-courier.best';
/** Where the best landing time is kept between visits (this browser only). */
export const BEST_TIME_KEY = 'ridgeline-courier.best-time';
