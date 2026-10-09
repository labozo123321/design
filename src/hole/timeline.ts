/**
 * POV · you jump into a hole through the Earth. 72 s at 30 fps, no narration.
 * scripts/generate-hole-path.py writes track.json: the per-frame camera, how far down the shaft you are
 * (`wall`, measured from the surface you're nearest: the near side until the centre, then the far side),
 * the set-piece positions along the shaft, and the real physics (depth, temperature, gravity, speed, time)
 * for the readouts. Picture and sound both read it.
 *
 * In the shaft the camera never goes more than CAM_DROP below the surface: past that the walls scroll by
 * instead. A point at world height y is `surfY(frame) - y` metres down the shaft.
 */
import TRACK from "./track.json";

export const T = TRACK;
export const HOLE_FPS = TRACK.fps;
export const HOLE_DURATION = TRACK.frames;
export const EV = TRACK.events;

/** The hole: axis, radius (where the plaza fountain used to be). Must match the generator. */
export const HX = -8;
export const HZ = 3;
export const HR = 4.4;
export const EYE = 1.7;
export const CAM_DROP = 80;
/** When you pass the centre (and the frame flips to the far side), and when you start the fall back in. */
export const T_CENTRE = 47.5;
export const T_DROP = 68.4;

const clampF = (frame: number) => Math.max(0, Math.min(T.frames - 1, Math.round(frame)));

export type Cam = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; fov: number };
export const camAt = (frame: number): Cam => {
  const f = clampF(frame);
  return {
    x: T.x[f],
    y: T.y[f],
    z: T.z[f],
    yaw: T.yaw[f],
    pitch: T.pitch[f],
    roll: T.roll[f],
    fov: T.fov[f],
  };
};

/** Which surface the shaft is measured from: 0 the city you jumped from, 1 the island on the far side. */
export const sideAt = (frame: number) => T.side[clampF(frame)];
/** How far down the shaft your feet are (m, visual scroll). */
export const wallAt = (frame: number) => T.wall[clampF(frame)];
/** World height of the surface you're nearest: 0 until you're CAM_DROP down, then it scrolls up. */
export const surfY = (frame: number) => Math.max(0, wallAt(frame) - CAM_DROP);
/** The walls' visual speed (m/s), for motion blur and streaks. */
export const visAt = (frame: number) => T.vis[clampF(frame)];

/** Wall coordinate (m) -> physical depth below that side's surface (km). */
export const depthAtWall = (side: number, w: number) => {
  const tab = side === 0 ? T.wallDepth.near : T.wallDepth.far;
  const n = tab.d.length;
  const x = ((w - tab.w0) / (tab.w1 - tab.w0)) * (n - 1);
  if (x <= 0) return tab.d[0];
  if (x >= n - 1) return tab.d[n - 1];
  const i = Math.floor(x);
  return tab.d[i] + (tab.d[i + 1] - tab.d[i]) * (x - i);
};

/** Physical depth (km) -> wall coordinate (m) on one side (the tables are monotonic). */
export const wallAtDepth = (side: number, km: number) => {
  const tab = side === 0 ? T.wallDepth.near : T.wallDepth.far;
  const d = tab.d;
  const n = d.length;
  if (km <= d[0]) return tab.w0;
  if (km >= d[n - 1]) {
    // flat tail (past the centre): the first sample that reaches it
    let i = n - 1;
    while (i > 0 && d[i - 1] >= km) i--;
    return tab.w0 + ((tab.w1 - tab.w0) * i) / (n - 1);
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid] < km) lo = mid;
    else hi = mid;
  }
  const u = (km - d[lo]) / Math.max(1e-9, d[hi] - d[lo]);
  return tab.w0 + ((tab.w1 - tab.w0) * (lo + u)) / (n - 1);
};

/**
 * Depth knots (km) the shaft shader interpolates between; every layer boundary is one of them, so the
 * rock changes exactly where the readout says it does.
 */
export const KNOT_KM = [
  0, 0.0006, 0.006, 0.03, 0.105, 0.3, 1, 3, 12, 20, 35, 100, 150, 220, 410, 660, 1200, 2000, 2890, 3500, 4500,
  5150, 5800, 6371,
];
const knotCache: number[][] = [];
/** The knots' wall coordinates for one side (strictly increasing; past the last one it's the centre). */
export const knotWalls = (side: number) => {
  if (!knotCache[side]) {
    const w = KNOT_KM.map((km) => wallAtDepth(side, km));
    for (let i = 1; i < w.length; i++) w[i] = Math.max(w[i], w[i - 1] + 0.01);
    knotCache[side] = w;
  }
  return knotCache[side];
};

/** Geotherm (deg C) by depth (km): the same keys the generator uses for the readout. */
const GEO: [number, number][] = [
  [0, 15],
  [4, 60],
  [12.3, 180],
  [35, 600],
  [100, 1300],
  [150, 1400],
  [410, 1500],
  [660, 1900],
  [2890, 3700],
  [2890.1, 4000],
  [5150, 5400],
  [6371, 5500],
];
export const tempAt = (km: number) => {
  if (km <= 0) return GEO[0][1];
  for (let i = 1; i < GEO.length; i++)
    if (km <= GEO[i][0]) {
      const [a, ta] = GEO[i - 1];
      const [b, tb] = GEO[i];
      return ta + ((tb - ta) * (km - a)) / (b - a);
    }
  return GEO[GEO.length - 1][1];
};
