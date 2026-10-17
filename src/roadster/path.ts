import * as THREE from "three";
import PATH from "./path.json";
import { smooth } from "./timeline";

/**
 * The Roadster's state at any world time, from the sampled path (scripts/generate-roadster-path.py):
 * where it is and how it's turned, what it feels (the specific force in its own frame), its wheels,
 * suspension, wings, canopy, fans, thrusters and brake lights; the driver's head as the g's push it, and
 * where he's looking; the coffee.
 */

const RATE = PATH.rate as number;
const N = PATH.n as number;
export const PCUE = PATH.cues as unknown as Record<string, number> & { splashes: number[] };
export const LINEUP = PATH.lineup as { name: string; z: number; w: number; h: number; l: number }[];
export const RAMP = PATH.ramp as { entryZ: number; r1: number; lv: number; r2: number; top: number; x: number };
export const LANES = PATH.lanes as { a: number; b: number; startB: number };
export const THRUSTERS = (PATH.thrusters as { at: number[]; dir: number[] }[]).map((t) => ({
  at: new THREE.Vector3(...(t.at as [number, number, number])),
  dir: new THREE.Vector3(...(t.dir as [number, number, number])).normalize(),
}));
export const H_CM = PATH.hcm as number;

const P = PATH.p as number[];
const Q = PATH.q as number[];
const F = PATH.f as number[];
const W = PATH.w as number[];
const HEAD = PATH.head as number[];
const TILT = PATH.tilt as number[];
const THR = PATH.thr as number[];
const LOOK = PATH.look as [number, number, number][];

export type CarState = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  speed: number;
  /** specific force in the car frame (m/s^2): what the driver feels (1 g up when parked) */
  f: THREE.Vector3;
  /** angular velocity in the car frame (rad/s) */
  w: THREE.Vector3;
  spin: number;
  steer: number;
  susp: number;
  wing: number;
  canopy: number;
  fan: number;
  brake: number;
  thr: number[];
  alt: number;
  /** the head pushed about by the g's (car frame, metres) */
  head: THREE.Vector3;
  /** where he looks (degrees: yaw left +, pitch up +) */
  yaw: number;
  pitch: number;
  /** the coffee: the surface's lean (radians about x and z) and how far the blob has floated up */
  tilt: [number, number];
  float: number;
  creep: number;
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const v3 = (arr: number[], i: number, j: number, k: number) =>
  new THREE.Vector3(lerp(arr[3 * i], arr[3 * j], k), lerp(arr[3 * i + 1], arr[3 * j + 1], k), lerp(arr[3 * i + 2], arr[3 * j + 2], k));
const s1 = (arr: number[], i: number, j: number, k: number) => lerp(arr[i], arr[j], k);

const lookAt = (t: number): [number, number] => {
  if (t <= LOOK[0][0]) return [LOOK[0][1], LOOK[0][2]];
  for (let n = 0; n < LOOK.length - 1; n++) {
    const [ta, ya, pa] = LOOK[n];
    const [tb, yb, pb] = LOOK[n + 1];
    if (t >= ta && t <= tb) {
      const k = smooth(ta, tb, t);
      return [lerp(ya, yb, k), lerp(pa, pb, k)];
    }
  }
  const l = LOOK[LOOK.length - 1];
  return [l[1], l[2]];
};

const cache = new Map<number, CarState>();

export const carAt = (w: number): CarState => {
  const key = Math.round(w * 100000);
  const hit = cache.get(key);
  if (hit) return hit;
  const x = Math.max(0, Math.min(N - 1.0001, w * RATE));
  const i = Math.floor(x);
  const j = i + 1;
  const k = x - i;
  const qa = new THREE.Quaternion(Q[4 * i], Q[4 * i + 1], Q[4 * i + 2], Q[4 * i + 3]);
  const qb = new THREE.Quaternion(Q[4 * j], Q[4 * j + 1], Q[4 * j + 2], Q[4 * j + 3]);
  const thr: number[] = [];
  for (let n = 0; n < 10; n++) thr.push(lerp(THR[10 * i + n], THR[10 * j + n], k));
  const [yaw, pitch] = lookAt(w);
  const st: CarState = {
    pos: v3(P, i, j, k),
    quat: qa.slerp(qb, k),
    speed: s1(PATH.speed as number[], i, j, k),
    f: v3(F, i, j, k),
    w: v3(W, i, j, k),
    spin: s1(PATH.spin as number[], i, j, k),
    steer: s1(PATH.steer as number[], i, j, k),
    susp: s1(PATH.susp as number[], i, j, k),
    wing: s1(PATH.wing as number[], i, j, k),
    canopy: s1(PATH.canopy as number[], i, j, k),
    fan: s1(PATH.fan as number[], i, j, k),
    brake: s1(PATH.brake as number[], i, j, k),
    thr,
    alt: s1(PATH.alt as number[], i, j, k),
    head: v3(HEAD, i, j, k),
    yaw,
    pitch,
    tilt: [lerp(TILT[2 * i], TILT[2 * j], k), lerp(TILT[2 * i + 1], TILT[2 * j + 1], k)],
    float: s1(PATH.float as number[], i, j, k),
    creep: s1(PATH.creep as number[], i, j, k),
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, st);
  return st;
};

/** A thruster's state over a stretch of world time (for the plumes): its intensity at time t. */
export const thrusterAt = (n: number, w: number) => {
  const x = Math.max(0, Math.min(N - 1.0001, w * RATE));
  const i = Math.floor(x);
  const k = x - i;
  return lerp(THR[10 * i + n], THR[10 * (i + 1) + n], k);
};

/** The car's world matrix at world time w (cheap: for emitting particles along the past path). */
export const carMatrixAt = (w: number, out = new THREE.Matrix4()) => {
  const x = Math.max(0, Math.min(N - 1.0001, w * RATE));
  const i = Math.floor(x);
  const j = i + 1;
  const k = x - i;
  _qa.set(Q[4 * i], Q[4 * i + 1], Q[4 * i + 2], Q[4 * i + 3]);
  _qb.set(Q[4 * j], Q[4 * j + 1], Q[4 * j + 2], Q[4 * j + 3]);
  _qa.slerp(_qb, k);
  _p.set(lerp(P[3 * i], P[3 * j], k), lerp(P[3 * i + 1], P[3 * j + 1], k), lerp(P[3 * i + 2], P[3 * j + 2], k));
  return out.compose(_p, _qa, _one);
};
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

/** The car's velocity at world time w (finite difference). */
export const carVelAt = (w: number, out = new THREE.Vector3()) => {
  const a = carAt(w - 0.008).pos;
  const b = carAt(w + 0.008).pos;
  return out.copy(b).sub(a).multiplyScalar(1 / 0.016);
};
