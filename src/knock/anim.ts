import * as THREE from "three";
import { KNOCKS, type Knock, type Side } from "./script";

/** Small animation helpers: keyed tracks, pulses, the knock's hand motion. */

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const smoother = (k: number) => {
  const x = clamp(k);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const vnoise = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 101), hash(i + 1 + seed * 101), u) * 2 - 1;
};

/** A keyed number: [time, value] pairs, eased between (holds outside). */
export const track = (t: number, keys: [number, number][], ease: (k: number) => number = smoother) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) return t1 > t0 ? lerp(v0, v1, ease((t - t0) / (t1 - t0))) : v1;
  }
  return keys[keys.length - 1][1];
};
/** A keyed vector. */
export const trackV = (t: number, keys: [number, THREE.Vector3][], ease: (k: number) => number = smoother) => {
  if (t <= keys[0][0]) return keys[0][1].clone();
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) return t1 > t0 ? v0.clone().lerp(v1, ease((t - t0) / (t1 - t0))) : v1.clone();
  }
  return keys[keys.length - 1][1].clone();
};
/** 0 → 1 → 0 over [a, b], held at 1 between in and out ramps. */
export const window01 = (t: number, a: number, b: number, rin = 0.25, rout = 0.25) => smooth(a, a + rin, t) * (1 - smooth(b - rout, b, t));

/** The knocks of one side in a window (by time). */
export const knocksOf = (side: Side, t0: number, t1: number): Knock[] => KNOCKS.filter((k) => k.side === side && k.t >= t0 && k.t <= t1);

/** How far the knuckles are from the wall (m) during a run of knocks: back a few centimetres between
 * strikes, at the wall at each knock, a small recoil after; and how much the arm is raised (0..1). */
export const knockMotion = (t: number, ks: Knock[], raise = 0.35, lower = 0.5) => {
  if (!ks.length) return { up: 0, gap: 0.05, hit: 0 };
  const first = ks[0].t;
  const last = ks[ks.length - 1].t;
  const up = smooth(first - raise - 0.1, first - 0.1, t) * (1 - smooth(last + 0.15, last + 0.15 + lower, t));
  let gap = 0.045;
  let hit = 0;
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    const prev = i > 0 ? ks[i - 1].t : first - 0.4;
    const next = i < ks.length - 1 ? ks[i + 1].t : last + 0.4;
    const span = Math.min(k.t - prev, next - k.t, 0.3);
    const amp = Math.min(0.04, span * 0.14);
    const d = t - k.t;
    if (d > -span / 2 && d < span / 2) {
      // strike in, a little recoil out
      const g = d < 0 ? amp * (-d / (span / 2)) ** 0.7 : amp * 0.7 * (d / (span / 2)) ** 0.8;
      gap = Math.min(gap, g);
      hit = Math.max(hit, Math.exp(-Math.abs(d) / 0.03));
    }
  }
  return { up, gap, hit };
};

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
