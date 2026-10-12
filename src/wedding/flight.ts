import * as THREE from "three";
import FLIGHT from "./flight.json";

/**
 * The flight (scripts/generate-wedding-path.py): per video frame, the world time, the drone's camera and
 * body, the ring box on its ribbon; the layout of the lawn, the ceremony and the tent; the moments.
 */

type Frame = { w: number; p: number[]; q: number[]; fov: number; bt: number[]; box: number[]; speed: number; fpv: number };
type V3 = [number, number, number];

export const FPS = FLIGHT.fps;
const F = FLIGHT.frames as Frame[];
export const NFRAMES = F.length;
export const DURATION = NFRAMES;
export const L = FLIGHT.layout as unknown as {
  sun: V3;
  lake: { shore: number };
  arch: { z: number; half: number; h: number };
  aisle: { z0: number; z1: number; half: number };
  groom: V3;
  bride: V3;
  officiant: V3;
  kid: V3;
  dog: V3;
  droneStart: V3;
  tent: { x0: number; x1: number; z0: number; z1: number; eave: number; ridge: number };
  tables: [number, number][];
  tableR: number;
  danceFloor: { x0: number; x1: number; z0: number; z1: number };
  chandelier: V3;
  dj: { booth: [number, number]; at: V3 };
  towerTable: [number, number];
  tower: { at: V3; tiers: number; pitch: number; h: number };
  cakeTable: [number, number];
  cake: { at: V3; tiers: [number, number][] };
  pourer: V3;
  baker: V3;
  waiterOut: V3;
  dogEnd: V3;
  dogChair: V3;
  chairs: [number, number][];
  guests: { row: number; side: number; seat: number; at: V3; nearest: [number, number] }[];
};
/** Moments, in video seconds and in world seconds. */
export const CUE = FLIGHT.cues as Record<string, number>;
export const CUE_W = FLIGHT.cuesW as Record<string, number>;
export const RIBBON = FLIGHT.ribbon as number;
export const SUN = new THREE.Vector3(...L.sun).normalize();

const at = (frame: number) => F[Math.max(0, Math.min(NFRAMES - 1, Math.round(frame)))];
const lerpF = (frame: number, pick: (f: Frame) => number) => {
  const f = Math.max(0, Math.min(NFRAMES - 1, frame));
  const i = Math.floor(f);
  const k = f - i;
  const a = pick(F[i]);
  return k > 0 && i + 1 < NFRAMES ? a + (pick(F[i + 1]) - a) * k : a;
};

/** World time at a video frame. */
export const wAt = (frame: number) => lerpF(frame, (f) => f.w);
export const speedAt = (frame: number) => at(frame).speed;
export const fpvAt = (frame: number) => at(frame).fpv;

export type Cam = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number };
export const camAt = (frame: number): Cam => {
  const f = at(frame);
  return { pos: new THREE.Vector3(...(f.p as V3)), quat: new THREE.Quaternion(...(f.q as [number, number, number, number])), fov: f.fov };
};
/** The drone body's tilt (pitch, roll) from its accelerations. */
export const bodyTiltAt = (frame: number) => at(frame).bt;
export const boxAt = (frame: number) => new THREE.Vector3(...(at(frame).box as V3));

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const span = (u: number, a: number, b: number, e = 0.25) => smooth(a - e, a + e, u) * (1 - smooth(b - e, b + e, u));
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Monotone cubic through keys (t, v): no overshoot. */
export const pchip = (keys: [number, number][]) => {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = ys.slice(1).map((y, i) => (y - ys[i]) / h[i]);
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
};

/** Deterministic hash and smooth value noise. */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const vnoise = (t: number, seed: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i + seed * 17.3) * 2 - 1;
  const b = hash(i + 1 + seed * 17.3) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
};

/** The video frame (fractional) at a world time. */
export const frameOfW = (w: number) => {
  let lo = 0;
  let hi = NFRAMES - 1;
  if (w <= F[0].w) return 0;
  if (w >= F[hi].w) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (F[mid].w <= w) lo = mid;
    else hi = mid;
  }
  const a = F[lo].w;
  const b = F[hi].w;
  return lo + (b > a ? (w - a) / (b - a) : 0);
};
/** Where the drone is at a world time. */
export const droneAtW = (w: number) => {
  const f = frameOfW(w);
  const i = Math.floor(f);
  const k = f - i;
  const a = F[i].p;
  const b = F[Math.min(NFRAMES - 1, i + 1)].p;
  return new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
};
export const boxAtW = (w: number) => {
  const f = Math.round(frameOfW(w));
  return new THREE.Vector3(...(F[f].box as V3));
};
