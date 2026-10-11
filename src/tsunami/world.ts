import * as THREE from "three";
import CUES from "./cues.json";

/**
 * The ending: out of nowhere, a beach at golden hour. A last wave washes over your feet, then the sea pulls
 * back (and keeps going), a white line shows on the horizon, everyone runs, and a wall of water comes in.
 * Cut to black.
 *
 * Pure maths shared by the scene: the ground, the sea surface, the wave, the camera and everybody's moves.
 * World units are metres; you stand at the water's edge near the origin, the sea is out toward -z, +x is on
 * your right. `u` is seconds since the cut to the beach.
 */

export const FPS = 30;
/** The hard cut to black. */
export const CUT = CUES.cut;
export const DUR = CUES.dur;
export const FRAMES = Math.round(DUR * FPS);
export const EYE = 1.62;
export const YOU = { x: 0, z: -0.8 };

/** Golden hour: the sun 14 degrees up over the sea, 34 degrees to your right (just out of frame). */
export const SUN = new THREE.Vector3(0.5426, 0.2419, -0.8044).normalize();
export const SUN_ELEV = Math.asin(SUN.y);

/** The beats of the ending (shared with the soundtrack, scripts/generate-pinball-audio.py). */
export const CUE = {
  /** a wave breaks just off the beach and its wash runs up over your feet */
  swash: CUES.swash as [number, number],
  /** ... it runs back out, and the whole sea goes with it */
  backwash: CUES.backwash as [number, number],
  pull: CUES.pull as [number, number],
  /** the zoom on the horizon; the white line shows from 8.9 */
  zoom: CUES.zoom as [number, number],
  line: CUES.line,
  /** everyone runs; you turn round, then back */
  run: CUES.run,
  turn: CUES.turn as [number, number],
  back: CUES.back as [number, number],
  cut: CUES.cut,
};

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const softplus = (x: number) => (x > 30 ? x : Math.log1p(Math.exp(x)));
/** 0 below a, slope 1 above it, rounded over width w. */
const ramp = (x: number, a: number, w: number) => w * softplus((x - a) / w);

/* ------------------------------------------------------------------ */
/* Noise                                                                */
/* ------------------------------------------------------------------ */

const hash2 = (i: number, j: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
/** Value noise in [0, 1], smooth. */
export const vnoise = (x: number, y: number) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
export const fbm = (x: number, y: number, oct = 4) => {
  let f = 0;
  let a = 0.5;
  let s = 1;
  for (let o = 0; o < oct; o++) {
    f += a * vnoise(x * s + o * 17.3, y * s - o * 9.1);
    a *= 0.5;
    s *= 2.03;
  }
  return f / (1 - Math.pow(0.5, oct));
};

/** Seeded PRNG (mulberry32). */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ------------------------------------------------------------------ */
/* The ground                                                           */
/* ------------------------------------------------------------------ */

/** A crescent bay: the shoreline (mean sea level) bends out to sea on both sides. */
export const shoreZ = (x: number) => -2.6 - 0.0006 * x * x;

/** The two headlands that close the bay, and an island out on the horizon. */
export const HEADS = [
  { x: -620, z: -330, r: 330, h: 74 },
  { x: 700, z: -420, r: 360, h: 92 },
];

const headland = (x: number, z: number) => {
  let y = -1e9;
  for (const hd of HEADS) {
    const r = Math.hypot((x - hd.x) / hd.r, (z - hd.z) / (hd.r * 0.82));
    if (r > 1.25) continue;
    const k = 1 - r * r;
    const top = k > 0 ? hd.h * Math.pow(k, 0.55) : k * 40;
    y = Math.max(y, top + (fbm(x / 70, z / 70, 3) - 0.5) * 18 * smooth(1.2, 0.5, r) - 4);
  }
  return y;
};

/** The reef: patches of rock on the sea floor (0 where there's sand). */
export const reefAt = (x: number, z: number) => {
  const d = z - shoreZ(x);
  if (d > -30 || d < -330) return 0;
  const n = vnoise(x / 36 + 7.3, z / 36 + 3.1) * 0.7 + vnoise(x / 13 + 1.7, z / 13 - 4.2) * 0.3;
  return Math.max(0, n - 0.6) * 4.2 * smooth(-30, -60, d);
};

/** Height of the ground (sand, sea floor, hills) at x, z. */
export const groundY = (x: number, z: number) => {
  const d = z - shoreZ(x);
  let y: number;
  if (d >= 0) {
    // beach face 1:25 up to a berm 40 m in, then the flat back beach; dunes and jungle hills behind
    y = 0.04 * d - 0.028 * ramp(d, 40, 5);
    const hill = ramp(d, 115, 25) * 0.13;
    y +=
      Math.min(hill, 34) * (0.75 + 0.5 * vnoise(x / 140, z / 140)) +
      (fbm(x / 60, z / 60, 3) - 0.5) * 6 * smooth(115, 260, d);
  } else {
    // 1:55 out to the shelf edge 260 m out, then down to the deep; a sandbar 72 m out
    y = d / 55 - 0.06 * ramp(-d, 260, 25) + 0.05 * ramp(-d, 520, 40);
    y += 0.55 * Math.exp(-(((d + 72) / 13) ** 2));
    y += ((vnoise(x / 18, z / 18) - 0.5) * 0.14 + (vnoise(x / 64, z / 64) - 0.5) * 0.3) * smooth(0, -18, d);
    y += reefAt(x, z);
  }
  // small dips and bumps in the sand everywhere
  y += (vnoise(x / 5.5, z / 5.5) - 0.5) * 0.035;
  const hl = headland(x, z);
  if (hl > y - 3) {
    // smooth max, so the headlands rise out of the beach and the sea floor without a crease
    const k = 3;
    y = Math.max(y, hl) + k * Math.log1p(Math.exp(-Math.abs(y - hl) / k));
  }
  return y;
};

/* ------------------------------------------------------------------ */
/* The sea                                                              */
/* ------------------------------------------------------------------ */

/** The last wash up the beach: metres above mean sea level. */
export const swashAt = (u: number) =>
  -0.04 + 0.17 * smooth(CUE.swash[0], CUE.swash[1], u) * (1 - smooth(CUE.backwash[0], CUE.backwash[1], u));

/** The sea going out: down 4 m by 9.8 s (the shoreline runs ~220 m out). */
export const drawAt = (u: number) => -4.0 * smooth(CUE.pull[0], CUE.pull[1], u);

/** How much swell is left: the sea goes eerily flat as it drains away. */
export const swellAt = (u: number) => 1 - 0.85 * smooth(CUE.pull[0], 6.5, u);

/** How far the foam on the shallows has been carried (m, shoreward +): up with the wash, out with the sea. */
export const flowAt = (u: number) => {
  // integral of the flow speed, closed form per segment
  const upV = 1.4;
  const a = clamp(u, CUE.swash[0], CUE.swash[1]) - CUE.swash[0];
  const out = Math.max(0, u - CUE.backwash[0]);
  return upV * a - (2.8 * out * out) / (1 + out * 0.35);
};

/** Monotone cubic through (t, v) keys (Fritsch-Carlson), clamped at the ends. */
export const pchip = (keys: [number, number][]) => {
  const n = keys.length;
  const t = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (t[i + 1] - t[i]) + (t[i] - t[i - 1]);
      const w2 = t[i + 1] - t[i] + 2 * (t[i] - t[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x: number) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const s = (x - t[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;
    return h00 * v[i] + h10 * h * m[i] + h01 * v[i + 1] + h11 * h * m[i + 1];
  };
};

/** How far the front of the wave is from you (m). It shows at 8.9 s, 2.4 km out. */
const DIST = pchip([
  [8.4, 2600],
  [8.9, 2400],
  [10.4, 1300],
  [11.0, 950],
  [12.6, 330],
  [13.1, 220],
  [14.0, 116],
  [15.0, 58],
  [15.6, 37],
  [16.2, 22],
  [17.0, 8],
]);

export type Wave = {
  /** distance of the front (m) */
  D: number;
  /** crest height above mean sea level (m), before the along-shore variation */
  hc: number;
  /** level ahead of the wave (the drawn-down sea) */
  L: number;
  /** 0..1: the wave rising out of the sea at first */
  appear: number;
};

export const waveAt = (u: number): Wave => {
  const D = DIST(u);
  const hc = 11 + 10 * smooth(2100, 160, D) + 6 * smooth(160, 28, D);
  return { D, hc, L: drawAt(u), appear: smooth(8.45, 9.4, u) };
};

/** The front's z along the shore (it leads a little in the middle of the bay). */
export const frontZ = (x: number, w: Wave) => YOU.z - w.D + 0.00004 * x * x + 2.5 * Math.sin(x / 71 + 2);
/** The crest height along the shore. */
export const crestH = (x: number, w: Wave) =>
  w.hc * (1 + 0.06 * Math.sin(x / 53 + 1.3) + 0.04 * Math.sin(x / 23 + 0.4));

export type WaterPt = { y: number; foam: number; face: number };

/**
 * The sea surface at (x, z): swell (fading as the sea drains), the wash up the beach, the drawn-down level,
 * and the wave: a steep concave face from the drawn-down sea up to the crest, a foaming crest, a long back.
 * `g` is the ground height there (for depth-limited swell and breaking).
 */
export const waterAt = (x: number, z: number, u: number, g: number, w: Wave, out: WaterPt) => {
  const L = w.L;
  // the swash only reaches the shallows
  const nearShore = smooth(-40, -6, z - shoreZ(x));
  let lvl = L + swashAt(u) * nearShore;
  // swell: depth-limited, breaking on the sandbar and the beach
  const depth0 = lvl - g;
  const sk = swellAt(u);
  let sw = 0;
  let crest = 0;
  const SW = SWELLS;
  for (let i = 0; i < SW.length; i++) {
    const s = SW[i];
    const ph = s.k * (s.dx * x + s.dz * z) - s.w * u + s.ph;
    const c = Math.cos(ph);
    sw += s.a * (c + 0.22 * Math.cos(2 * ph));
    if (i < 2) crest = Math.max(crest, c);
  }
  const shoal = smooth(0.0, 2.2, depth0);
  lvl += sw * sk * shoal;
  let foam = 0;
  // whitewater where the swell breaks over the bar and on the beach
  const brk = smooth(1.5, 0.55, depth0) * smooth(-0.05, 0.25, depth0);
  foam = Math.max(foam, brk * smooth(0.35, 0.95, crest) * sk);
  let face = 0;
  if (w.appear > 0) {
    const zf = frontZ(x, w);
    const s = z - zf; // shoreward of the front: + ahead of the wave, - behind
    const hc = crestH(x, w);
    const height = (hc - L) * w.appear;
    const fw = Math.max(4, 0.62 * height);
    if (s < 0) {
      if (s > -fw) {
        // the face, steepest at the top
        const q = -s / fw;
        lvl = Math.max(lvl, L + height * Math.pow(q, 1.6));
        face = q;
        // far out it reads as a white line breaking over a dark band; close in, a dark face under a white crest
        foam = Math.max(
          foam,
          smooth(0.55, 0.98, q) * 0.9,
          smooth(0.24, 0.0, q) * 0.9,
          0.9 * smooth(350, 900, w.D) * smooth(0.3, 0.55, q),
        );
      } else {
        // over the crest and down its long back
        const b = -s - fw;
        const back = L + height - (height - Math.max(0, 4 - L) * w.appear) * smooth(0, 150, b);
        lvl = Math.max(lvl, back);
        foam = Math.max(foam, Math.exp(-b / 32) * 0.95);
        face = b < 6 ? 1 : 0;
      }
    }
  }
  // a white edge where the water runs thin over the sand
  const depth = lvl - g;
  foam = Math.max(foam, smooth(0.1, 0.0, depth) * 0.85);
  out.y = lvl;
  out.foam = foam;
  out.face = face;
  return out;
};

type Swell = { a: number; k: number; w: number; dx: number; dz: number; ph: number };
const mk = (a: number, len: number, ang: number, ph: number): Swell => {
  const k = (Math.PI * 2) / len;
  return { a, k, w: Math.sqrt(9.81 * k), dx: Math.sin(ang), dz: Math.cos(ang), ph };
};
/** Waves rolling in toward the beach (+z). */
export const SWELLS: Swell[] = [
  mk(0.3, 52, 0.08, 0.3),
  mk(0.17, 27, -0.22, 1.7),
  mk(0.09, 13, 0.35, 4.1),
  mk(0.05, 6.5, -0.4, 2.2),
];

/** Water level at a point (for things that float or get stranded). */
export const levelAt = (x: number, z: number, u: number) => {
  const g = groundY(x, z);
  const p: WaterPt = { y: 0, foam: 0, face: 0 };
  waterAt(x, z, u, g, waveAt(u), p);
  return { y: p.y, g };
};

/** Where the water's edge is straight out in front of you (z), for things carried out with it. */
export const edgeZ = (x: number, u: number) => {
  const lvl = drawAt(u) + swashAt(u);
  // walk down the slope to where the ground drops under the level
  let z = 6;
  while (z > -400 && groundY(x, z) > lvl) z -= 0.25;
  return z;
};

/* ------------------------------------------------------------------ */
/* The wave's shadow                                                    */
/* ------------------------------------------------------------------ */

/** 0..1: how much of the sun the wave has covered, seen from where you stand. */
export const sunCover = (u: number) => {
  const w = waveAt(u);
  if (w.appear <= 0) return 0;
  const top = crestH(0, w);
  // the crest along the sun's bearing (the front is a straight line across the bay)
  const cosAz = Math.hypot(SUN.x, SUN.z) > 0 ? -SUN.z / Math.hypot(SUN.x, SUN.z) : 1;
  const run = (w.D + 0.62 * (top - w.L)) / Math.max(0.3, cosAz);
  const elev = Math.atan2(top - (groundY(YOU.x, YOU.z) + EYE), run);
  return smooth(SUN_ELEV - 0.012, SUN_ELEV + 0.03, elev);
};

/* ------------------------------------------------------------------ */
/* The camera                                                           */
/* ------------------------------------------------------------------ */

const YAW = pchip([
  [0, -0.1],
  [1.6, -0.06],
  [2.2, -0.02],
  [4.3, 0.0],
  [5.0, 0.3],
  [6.2, 0.42],
  [7.9, -0.3],
  [8.5, -0.06],
  [10.3, -0.05],
  [10.85, -0.07],
  [11.45, 2.62],
  [12.55, 2.72],
  [13.05, -0.16],
  [16.2, -0.12],
]);
const PITCH = pchip([
  [0, -0.27],
  [1.8, -0.3],
  [2.5, -1.3],
  [4.15, -1.28],
  [4.95, -0.16],
  [8.5, -0.05],
  [10.4, -0.02],
  [10.85, -0.06],
  [11.45, -0.1],
  [12.55, -0.07],
  [13.05, 0.04],
  [14.2, 0.08],
  [15.2, 0.12],
  [16.2, 0.16],
]);
const FOV = pchip([
  [0, 68],
  [8.4, 66],
  [10.3, 18],
  [10.85, 70],
  [13.05, 70],
  [16.2, 78],
]);

export type Cam = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; fov: number };

/** Handheld wobble: a few slow incommensurate sines. */
const wob = (u: number, k: number) =>
  Math.sin(u * 0.83 + k) * 0.6 + Math.sin(u * 1.37 + k * 2.1) * 0.3 + Math.sin(u * 2.9 + k * 3.7) * 0.1;
/** Fast shake for the rumble. */
const jit = (u: number, k: number) =>
  Math.sin(u * 37.1 + k) * 0.5 + Math.sin(u * 23.3 + k * 1.7) * 0.35 + Math.sin(u * 61.7 + k * 2.3) * 0.15;

/** How hard the ground shakes (0..1). */
export const rumbleAt = (u: number) => Math.pow(smooth(9.2, 16.2, u), 1.6);

export const camAt = (frame: number): Cam => {
  const u = frame / FPS;
  const r = rumbleAt(u);
  // a held breath through the zoom; shaking once it's coming
  const hand = 0.012 * (1 - 0.6 * smooth(8.4, 9.0, u) * (1 - smooth(10.3, 10.6, u)));
  const yaw = YAW(u) + wob(u, 1) * hand + jit(u, 2) * 0.012 * r;
  const pitch = PITCH(u) + wob(u, 4) * hand * 0.8 + jit(u, 5) * 0.014 * r;
  const roll = wob(u, 7) * 0.008 + jit(u, 9) * 0.01 * r;
  const g = groundY(YOU.x, YOU.z);
  // breathing, and the little bob of a step back as it comes
  const bob = Math.sin(u * 1.4) * 0.006 - 0.04 * smooth(12.9, 13.6, u);
  // looking down at your feet you lean over: the eyes go forward and down
  const bend = smooth(-0.45, -1.25, PITCH(u));
  return {
    x: YOU.x + wob(u, 11) * 0.01 - Math.sin(yaw) * 0.14 * bend,
    y: g + EYE + bob - 0.08 * bend,
    z: YOU.z + wob(u, 13) * 0.01 + 0.25 * smooth(12.9, 13.6, u) - Math.cos(yaw) * 0.14 * bend,
    yaw,
    pitch,
    roll,
    fov: FOV(u),
  };
};

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

export type Act = "stand" | "film" | "point" | "lie" | "wave2";
export type Key = { u: number; x: number; z: number };
export type Who = {
  name: string;
  kid?: boolean;
  female?: boolean;
  h: number;
  seed: number;
  act: Act;
  /** where they stand or the path they take (keys at times u) */
  path: Key[];
  /** which way they face when standing (rad, 0 = +z, pi = out to sea) */
  face: number;
  /** when they start pointing / staring in shock / running */
  point?: [number, number];
  shock?: number;
  run?: number;
  y?: number;
};

export const PEOPLE: Who[] = [
  // a kid paddling in the shallows; when the sea goes out he runs after it, then runs back past you
  {
    name: "kid",
    kid: true,
    h: 1.24,
    seed: 3,
    act: "stand",
    face: Math.PI - 0.25,
    path: [
      { u: 0, x: -1.9, z: -3.6 },
      { u: 5.0, x: -1.9, z: -3.6 },
      { u: 7.4, x: -3.0, z: -13.5 },
      { u: 8.6, x: -3.0, z: -13.5 },
      { u: 9.6, x: -3.9, z: -9.0 },
      { u: 11.0, x: -1.9, z: -0.6 },
      { u: 13.2, x: -0.8, z: 12.5 },
      { u: 16.6, x: -0.4, z: 30 },
    ],
    shock: 8.5,
    run: 8.6,
  },
  // a couple strolling along the water's edge, who stop and stare, wander out after the sea, then run
  // straight back at you and split round you
  {
    name: "her",
    female: true,
    h: 1.66,
    seed: 11,
    act: "stand",
    face: Math.PI + 0.1,
    path: [
      { u: 0, x: -7.9, z: -5.6 },
      { u: 4.3, x: -1.0, z: -5.6 },
      { u: 6.0, x: -1.0, z: -5.6 },
      { u: 8.2, x: -2.6, z: -10.6 },
      { u: 9.55, x: -2.6, z: -10.6 },
      { u: 11.5, x: -1.2, z: -0.4 },
      { u: 13.4, x: -0.2, z: 12 },
      { u: 16.6, x: 0.6, z: 31 },
    ],
    shock: 5.2,
    run: 9.55,
  },
  {
    name: "him",
    h: 1.82,
    seed: 12,
    act: "stand",
    face: Math.PI - 0.1,
    path: [
      { u: 0, x: -7.1, z: -5.3 },
      { u: 4.3, x: -0.2, z: -5.3 },
      { u: 6.0, x: -0.2, z: -5.3 },
      { u: 8.2, x: -1.7, z: -10.3 },
      { u: 9.65, x: -1.7, z: -10.3 },
      { u: 11.35, x: 1.3, z: -0.2 },
      { u: 13.3, x: 2.4, z: 12.4 },
      { u: 16.6, x: 3.6, z: 32 },
    ],
    shock: 5.0,
    run: 9.65,
  },
  // filming the sunset, then the sea, then the wave: he never stops filming
  {
    name: "filmer",
    h: 1.78,
    seed: 21,
    act: "film",
    face: Math.PI - 0.12,
    path: [{ u: 0, x: 2.3, z: -7.6 }],
  },
  // the one who points
  {
    name: "pointer",
    h: 1.74,
    seed: 31,
    act: "point",
    face: Math.PI + 0.15,
    point: [6.3, 9.0],
    path: [
      { u: 0, x: -3.4, z: -7.8 },
      { u: 9.2, x: -3.4, z: -7.8 },
      { u: 11.1, x: -4.6, z: 1.0 },
      { u: 13.0, x: -5.6, z: 12.8 },
      { u: 16.6, x: -6.4, z: 31 },
    ],
    shock: 6.0,
    run: 9.2,
  },
  // the lifeguard, up on the front of his tower, waving everyone in
  {
    name: "lifeguard",
    h: 1.84,
    seed: 41,
    act: "wave2",
    face: 2.59,
    path: [{ u: 0, x: -8.0, z: 12.19 }],
    y: 2.0,
    shock: 9.4,
  },
  // asleep on a towel, sunglasses on: misses the whole thing
  {
    name: "sleeper",
    female: true,
    h: 1.7,
    seed: 51,
    act: "lie",
    face: 0,
    path: [{ u: 0, x: -3.0, z: 8.6 }],
  },
  // people out on the sand flats, who run back in
  {
    name: "far1",
    h: 1.76,
    seed: 61,
    act: "stand",
    face: Math.PI,
    path: [
      { u: 0, x: -9, z: -6.8 },
      { u: 4.6, x: -9, z: -6.8 },
      { u: 9.0, x: -7, z: -19 },
      { u: 9.5, x: -7, z: -19 },
      { u: 16.6, x: -13, z: 18 },
    ],
    shock: 9.3,
    run: 9.5,
  },
  {
    name: "far2",
    female: true,
    h: 1.62,
    seed: 71,
    act: "stand",
    face: Math.PI + 0.2,
    path: [
      { u: 0, x: 8.5, z: -6.5 },
      { u: 4.8, x: 8.5, z: -6.5 },
      { u: 9.2, x: 6.0, z: -18 },
      { u: 9.6, x: 6.0, z: -18 },
      { u: 16.6, x: 4.8, z: 19 },
    ],
    shock: 9.4,
    run: 9.6,
  },
  {
    name: "far3",
    h: 1.8,
    seed: 81,
    act: "stand",
    face: Math.PI - 0.3,
    path: [
      { u: 0, x: 15, z: -7.5 },
      { u: 4.4, x: 15, z: -7.5 },
      { u: 9.0, x: 14, z: -19 },
      { u: 9.7, x: 14, z: -19 },
      { u: 16.6, x: 16, z: 12 },
    ],
    shock: 9.5,
    run: 9.7,
  },
  {
    name: "far4",
    kid: true,
    h: 1.38,
    seed: 91,
    act: "stand",
    face: Math.PI + 0.4,
    path: [
      { u: 0, x: -14, z: -6 },
      { u: 5.0, x: -14, z: -6 },
      { u: 9.0, x: -11, z: -16 },
      { u: 9.6, x: -11, z: -16 },
      { u: 16.6, x: -15.5, z: 14 },
    ],
    shock: 9.4,
    run: 9.6,
  },
];

const segLen = (keys: Key[], j: number) =>
  j < 0 || j >= keys.length - 1 ? 0 : Math.hypot(keys[j + 1].x - keys[j].x, keys[j + 1].z - keys[j].z);

/**
 * Position along a person's keyed path at time u, with speed and how far they've gone (for the stride).
 * Each leg is a trapezoid in speed: they speed up from a standstill and slow down into one, and carry
 * their speed straight into the next leg otherwise.
 */
export const pathAt = (keys: Key[], u: number) => {
  const n = keys.length;
  let dist = 0;
  if (n === 1 || u <= keys[0].u) return { x: keys[0].x, z: keys[0].z, vx: 0, vz: 0, dist };
  if (u >= keys[n - 1].u) {
    for (let j = 0; j < n - 1; j++) dist += segLen(keys, j);
    return { x: keys[n - 1].x, z: keys[n - 1].z, vx: 0, vz: 0, dist };
  }
  let i = 0;
  while (u > keys[i + 1].u) {
    dist += segLen(keys, i);
    i++;
  }
  const a = keys[i];
  const b = keys[i + 1];
  const len = segLen(keys, i);
  if (len < 0.01) return { x: a.x, z: a.z, vx: 0, vz: 0, dist };
  const span = b.u - a.u;
  const easeIn = segLen(keys, i - 1) < 0.01 ? Math.min(0.45, span / 3) : 0;
  const easeOut = segLen(keys, i + 1) < 0.01 ? Math.min(0.45, span / 3) : 0;
  const vmax = len / (span - easeIn / 2 - easeOut / 2);
  const t = u - a.u;
  let s: number;
  let v: number;
  if (t < easeIn) {
    s = (0.5 * vmax * t * t) / easeIn;
    v = (vmax * t) / easeIn;
  } else if (t > span - easeOut) {
    const r = span - t;
    s = len - (0.5 * vmax * r * r) / easeOut;
    v = (vmax * r) / easeOut;
  } else {
    s = vmax * (t - easeIn / 2);
    v = vmax;
  }
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  return { x: a.x + dx * s, z: a.z + dz * s, vx: dx * v, vz: dz * v, dist: dist + s };
};

/** Which way someone faces at u: where they're going when they move, `face` when they stand; turns ease. */
export const headingAt = (who: Who, u: number) => {
  let sx = 0;
  let sz = 0;
  for (let k = 0; k < 6; k++) {
    const p = pathAt(who.path, u - k * 0.07);
    const sp = Math.hypot(p.vx, p.vz);
    const h = sp > 0.3 ? Math.atan2(p.vx, p.vz) : who.face;
    sx += Math.sin(h);
    sz += Math.cos(h);
  }
  return Math.atan2(sx, sz);
};
