import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, mat, rand } from "../roadster/materials";
import { brass } from "../home/materials";
import { PUPPY_BED } from "./props/house";

/**
 * Moose, the family beagle: a tricolour beagle (black saddle; tan head, ears, shoulders and thighs; a white
 * blaze, muzzle, bib, belly, legs and tail tip) in a red collar with a brass tag. Built at its feet facing -z.
 *
 * The body is one smooth surface: a signed-distance model (ellipsoids and round cones, smooth-unioned, eye
 * sockets carved) meshed once per variant with surface nets, coloured per vertex from the coat pattern, and
 * skinned on the CPU every frame with dual quaternions to a 26-bone rig (pelvis, four spine bones, two neck
 * bones, the head; scapula/arm/forearm/pastern/paw and thigh/gaskin/metatarsus/paw). Lying poses squash the
 * body onto the floor (a soft clamp, so nothing ever goes through it) and anchor the lowest point to it. The
 * ears are leather flaps hung from the skull and draped by a small stateless solver (gravity, the head's exact
 * SDF, the floor and the rest of the body); the tail is a tapered tube on its own chain; the eyes have lids that
 * blink and close; the nose has nostrils; the paws have pads; the collar is skinned with the neck.
 * Fur: a fine strand texture mapped triplanar in rest space (so it sticks to the skin) for colour and bump,
 * with a soft sheen.
 *
 * Usage: <Beagle at={V3(x, 0, z)} yaw={a} pose={{ kind: "trot", phase, t }} />. yaw turns it about y (0 faces
 * -z, +pi/2 faces -x). For the puppy curled in Moose's bed pass `inBed` and the bed's own position as `at`.
 */

// ================================================================================================ pose API
export type BeaglePoseKind = "curl" | "lie" | "flop" | "trot" | "stand";
export type BeaglePose = {
  kind: BeaglePoseKind;
  /** a second pose to blend toward, and how far (0..1); e.g. trot -> stand -> flop */
  to?: BeaglePoseKind;
  mix?: number;
  /** seconds: breathing, auto-blinks, idle ear and tail motion */
  t?: number;
  /** trot: the gait phase in strides (one full diagonal-pair cycle = 1). Move `at` forward by
   * BEAGLE.stride(puppy) per stride so the planted paws stay put. */
  phase?: number;
  /** eyelids 0 open .. 1 shut. Default: auto-blinks while awake, 1 for curl, 0.55 for flop. */
  blink?: number;
  /** one ear folded back inside-out over the head (0..1), showing its pink inside; which ear (+1 its right) */
  earFlip?: number;
  earFlipSide?: 1 | -1;
  /** lie: 0 chin down on its forepaws .. 1 head up */
  headUp?: number;
  /** radians: turn (+ to its left), tilt (+ toward its left shoulder), nod (+ nose up) */
  headTurn?: number;
  headTilt?: number;
  headNod?: number;
  /** flop: how far the head rolls from cheek-on-the-floor (0) to the top of the head facing up (1) */
  faceUp?: number;
  /** tail wag 0..1 (stand / lie / trot) */
  wag?: number;
  /** breathing amount (default 1) */
  breathe?: number;
};
export type BeagleProps = {
  at: THREE.Vector3;
  yaw: number;
  pose: BeaglePose;
  puppy?: boolean;
  /** lying in Moose's round PuppyBed placed at `at` (the dog settles into its dished cushion, centred) */
  inBed?: boolean;
  /** the surface under the dog: world height at world (x, z); default flat at at.y */
  ground?: (x: number, z: number) => number;
  /** the eyes' tiny catchlights (0 off .. 1) */
  glint?: number;
};

// ============================================================================================ small maths
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const frac = (x: number) => x - Math.floor(x);
/** piecewise-linear lookup in sorted [x, y] pairs */
const pw = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return pts[pts.length - 1][1];
};
const hashI = (i: number, j: number, k: number, s: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
/** smooth value noise in [-1, 1] */
const vnoise = (x: number, y: number, z: number, s = 0) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) r += (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w) * hashI(xi + dx, yi + dy, zi + dz, s);
  return r * 2 - 1;
};
const fbm = (x: number, y: number, z: number, s = 0) => vnoise(x, y, z, s) * 0.65 + vnoise(x * 2.1 + 3.1, y * 2.1, z * 2.1, s + 1) * 0.35;
const Q = (pitch = 0, yaw = 0, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
const QA = (axis: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(axis, a);
const X_AX = V(1, 0, 0);
const Z_AX = V(0, 0, 1);
const UP = V(0, 1, 0);

// =============================================================================================== anatomy
type Variant = { s: number; leg: number; len: number; girth: number; legGirth: number; head: number; muzzle: number; paw: number; ear: number; eye: number; pup: number; h: number };
const ADULT: Variant = { s: 1, leg: 1, len: 1, girth: 1, legGirth: 1, head: 1.07, muzzle: 1, paw: 1, ear: 1, eye: 1, pup: 0, h: 0.0038 };
const PUPPY: Variant = { s: 0.6, leg: 0.8, len: 0.9, girth: 1.12, legGirth: 1.2, head: 1.32, muzzle: 0.6, paw: 1.34, ear: 1.14, eye: 1.16, pup: 1, h: 0.0027 };

// bones
const PEL = 0;
const HEAD = 7;
const N2 = 6;
const NB = 26;
/** first bone of each leg: FL (scap, arm, fore, past, paw), FR, HL (thigh, gaskin, meta, paw), HR */
const LEG_BASE = [8, 13, 18, 22];
const LEG_SIDE = [-1, 1, -1, 1];
const PARENT = [-1, 0, 1, 2, 3, 4, 5, 6, 4, 8, 9, 10, 11, 4, 13, 14, 15, 16, 0, 18, 19, 20, 0, 22, 23, 24];

type Prim = {
  kind: 0 | 1 | 2; // ellipsoid, round cone, subtracted sphere
  part: string;
  region: 0 | 1 | 2; // body, head, muzzle (for the coat pattern's coordinates)
  bind: number; // bone, or -1 the torso chain (by z), -2 the neck chain, -3 nothing (subtractions)
  side: number;
  k: number;
  cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; m: number[] | null;
  ax: number; ay: number; az: number; bx: number; by: number; bz: number; ra: number; rb: number;
  bax: number; bay: number; baz: number; l2: number; rr: number; a2: number; il2: number;
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  breathe: number;
};
const blankPrim = (): Prim => ({ kind: 0, part: "", region: 0, bind: -3, side: 0, k: 0, cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1, m: null, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, ra: 0, rb: 0, bax: 0, bay: 0, baz: 0, l2: 1, rr: 0, a2: 1, il2: 1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, breathe: 0 });

const sdPrim = (P: Prim, x: number, y: number, z: number) => {
  if (P.kind === 1) {
    const pax = x - P.ax;
    const pay = y - P.ay;
    const paz = z - P.az;
    const yy = pax * P.bax + pay * P.bay + paz * P.baz;
    const zz = yy - P.l2;
    const qx = pax * P.l2 - P.bax * yy;
    const qy = pay * P.l2 - P.bay * yy;
    const qz = paz * P.l2 - P.baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * P.l2;
    const z2 = zz * zz * P.l2;
    const k = Math.sign(P.rr) * P.rr * P.rr * x2;
    if (Math.sign(zz) * P.a2 * z2 > k) return Math.sqrt(x2 + z2) * P.il2 - P.rb;
    if (Math.sign(yy) * P.a2 * y2 < k) return Math.sqrt(x2 + y2) * P.il2 - P.ra;
    return (Math.sqrt(x2 * P.a2 * P.il2) + yy * P.rr) * P.il2 - P.ra;
  }
  let dx = x - P.cx;
  let dy = y - P.cy;
  let dz = z - P.cz;
  if (P.m) {
    const m = P.m;
    const a = m[0] * dx + m[1] * dy + m[2] * dz;
    const b = m[3] * dx + m[4] * dy + m[5] * dz;
    const c = m[6] * dx + m[7] * dy + m[8] * dz;
    dx = a;
    dy = b;
    dz = c;
  }
  const ux = dx / P.rx;
  const uy = dy / P.ry;
  const uz = dz / P.rz;
  const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const vx = ux / P.rx;
  const vy = uy / P.ry;
  const vz = uz / P.rz;
  const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
  return k1 < 1e-12 ? -Math.min(P.rx, P.ry, P.rz) : (k0 * (k0 - 1)) / k1;
};
/** the union (smooth), with the subtractions last; prims whose padded box misses the point are skipped */
const sdfAt = (prims: Prim[], x: number, y: number, z: number) => {
  let d = 1e3;
  for (let i = 0; i < prims.length; i++) {
    const P = prims[i];
    if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1 || z < P.z0 || z > P.z1) continue;
    const di = sdPrim(P, x, y, z);
    d = P.kind === 2 ? -smin(-d, di, P.k) : smin(d, di, P.k);
  }
  return d;
};
const gradAt = (prims: Prim[], x: number, y: number, z: number, e: number, out: THREE.Vector3) =>
  out.set(sdfAt(prims, x + e, y, z) - sdfAt(prims, x - e, y, z), sdfAt(prims, x, y + e, z) - sdfAt(prims, x, y - e, z), sdfAt(prims, x, y, z + e) - sdfAt(prims, x, y, z - e)).multiplyScalar(1 / (2 * e));

type LegJ = { pts: THREE.Vector3[]; toes: THREE.Vector3[]; toeR: number; pad: { c: THREE.Vector3; r: THREE.Vector3 }; digit: THREE.Vector3; pawC: THREE.Vector3; pawR: THREE.Vector3 };
type Joints = {
  pivots: THREE.Vector3[];
  legs: LegJ[];
  neckA: THREE.Vector3;
  neckB: THREE.Vector3;
  head: THREE.Vector3;
  chestBottom: number;
  tailRoot: THREE.Vector3;
  tail: { len: number; r0: number; r1: number };
  eyes: { c: THREE.Vector3; gaze: THREE.Vector3; r: number }[];
  ears: { root: THREE.Vector3; dir: THREE.Vector3; nrm: THREE.Vector3; len: number; wid: number; th: number; cup: number }[];
  nose: { c: THREE.Vector3; r: THREE.Vector3 };
  collar: { c: THREE.Vector3; axis: THREE.Vector3; w: number; th: number };
  lip: THREE.Vector3[][];
  /** canonical (adult) coordinates from variant ones, by region */
  canon: (p: THREE.Vector3, region: number) => THREE.Vector3;
  zStop: number;
  stride: number;
};

/** The variant's prims and joints. Coordinates are written for the adult (metres, feet at y = 0, facing -z)
 * and mapped: legs shortened below 0.2 m, the body lengthened/thickened, the head scaled about the atlas with
 * the muzzle shortened from the stop, the paws scaled about their centres, then everything by s. */
const anatomy = (v: Variant) => {
  const s = v.s;
  const YB = 0.2;
  const Y = (y: number) => (y < YB ? y * v.leg : y - YB * (1 - v.leg));
  const Yinv = (y: number) => (y < YB * v.leg ? y / v.leg : y + YB * (1 - v.leg));
  const B = (x: number, y: number, z: number) => V(x * v.girth * s, Y(y) * s, z * v.len * s);
  const HC = V(0, 0.44, -0.255);
  const H = B(HC.x, HC.y, HC.z);
  const ZS = -0.335 - HC.z;
  const Hd = (x: number, y: number, z: number, muz = false) => {
    let dz = z - HC.z;
    if (muz && dz < ZS) dz = ZS + (dz - ZS) * v.muzzle;
    return H.clone().add(V(x, y - HC.y, dz).multiplyScalar(v.head * s));
  };
  const canon = (p: THREE.Vector3, region: number) => {
    if (region === 0) return V(p.x / (v.girth * s), Yinv(p.y / s), p.z / (v.len * s));
    const d = p.clone().sub(H).divideScalar(v.head * s);
    if (region === 2 && d.z < ZS) d.z = ZS + (d.z - ZS) / v.muzzle;
    return d.add(HC);
  };
  const prims: Prim[] = [];
  const ell = (part: string, c: THREE.Vector3, r: THREE.Vector3, k: number, bind: number, region: 0 | 1 | 2 = 0, rot?: THREE.Euler, side = 0, breathe = 0) => {
    const P = blankPrim();
    Object.assign(P, { kind: 0, part, region, bind, side, k, cx: c.x, cy: c.y, cz: c.z, rx: r.x, ry: r.y, rz: r.z, breathe });
    if (rot) {
      const m = new THREE.Matrix4().makeRotationFromEuler(rot).invert().elements;
      P.m = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
    }
    const R = Math.max(r.x, r.y, r.z);
    Object.assign(P, { x0: c.x - R, x1: c.x + R, y0: c.y - R, y1: c.y + R, z0: c.z - R, z1: c.z + R });
    prims.push(P);
    return P;
  };
  const cone = (part: string, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, k: number, bind: number, region: 0 | 1 | 2 = 0, side = 0) => {
    const P = blankPrim();
    const ba = b.clone().sub(a);
    const l2 = ba.lengthSq();
    const rr = ra - rb;
    Object.assign(P, { kind: 1, part, region, bind, side, k, ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, ra, rb, bax: ba.x, bay: ba.y, baz: ba.z, l2, rr, a2: l2 - rr * rr, il2: 1 / l2 });
    const R = Math.max(ra, rb);
    Object.assign(P, { x0: Math.min(a.x, b.x) - R, x1: Math.max(a.x, b.x) + R, y0: Math.min(a.y, b.y) - R, y1: Math.max(a.y, b.y) + R, z0: Math.min(a.z, b.z) - R, z1: Math.max(a.z, b.z) + R });
    prims.push(P);
    return P;
  };
  const T = (rx: number, ry: number, rz: number) => V(rx * v.girth, ry * v.girth, rz * v.len).multiplyScalar(s);
  const hs = v.head * s;
  const HR = (rx: number, ry: number, rz: number) => V(rx, ry, rz).multiplyScalar(hs);
  const ls = v.legGirth * s;
  const ps = v.paw * s;

  // ---- spine pivots
  const pivots: THREE.Vector3[] = new Array(NB);
  pivots[0] = B(0, 0.305, 0.165);
  pivots[1] = B(0, 0.312, 0.095);
  pivots[2] = B(0, 0.318, 0.02);
  pivots[3] = B(0, 0.325, -0.055);
  pivots[4] = B(0, 0.33, -0.125);
  pivots[5] = B(0, 0.345, -0.175);
  pivots[6] = B(0, 0.395, -0.225);
  pivots[7] = H.clone();

  // ---- torso (bound along the spine by z), the neck (along its own axis)
  const rib = ell("rib", B(0, 0.268, -0.07), T(0.087, 0.098, 0.13), 0, -1, 0, undefined, 0, 1);
  ell("chest", B(0, 0.258, -0.158), T(0.068, 0.074, 0.06), 0.045, -1, 0, undefined, 0, 0.6);
  ell("withers", B(0, 0.318, -0.118), T(0.056, 0.048, 0.07), 0.035, -1);
  ell("loin", B(0, 0.292, 0.06), T(0.072, 0.066, 0.115), 0.05, -1, 0, undefined, 0, 0.8);
  ell("croup", B(0, 0.29, 0.162), T(0.074, 0.068, 0.08), 0.045, -1);
  const neckA = B(0, 0.305, -0.15);
  const neckB = B(0, 0.425, -0.245);
  cone("neck", neckA, neckB, 0.062 * v.girth * s, 0.046 * v.girth * s * lerp(1, 1.1, v.pup), 0.04 * s, -2);
  ell("throat", B(0, 0.36, -0.212), V(0.046, 0.05, 0.042).multiplyScalar(v.girth * s), 0.035 * s, -2);

  // ---- head (rigid to the head bone)
  const kh = hs;
  ell("skull", Hd(0, 0.478, -0.287), HR(0.05, 0.047, 0.066).multiply(V(1, 1, lerp(1, 0.92, v.pup))), 0.03 * kh, HEAD, 1);
  ell("occiput", Hd(0, 0.497, -0.248), HR(0.024, 0.02, 0.026), 0.02 * kh, HEAD, 1);
  for (const sd of [-1, 1]) {
    ell("cheek", Hd(sd * 0.027, 0.452, -0.312), HR(0.03, 0.03, 0.042), 0.02 * kh, HEAD, 1, undefined, sd);
    ell("brow", Hd(sd * 0.024, 0.494, -0.327), HR(0.019, 0.012, 0.017), 0.012 * kh, HEAD, 1, undefined, sd);
  }
  const muzTip = Hd(0, 0.451, -0.392, true);
  cone("muzzle", Hd(0, 0.458, -0.333, true), muzTip, 0.031 * hs, 0.026 * hs, 0.02 * kh, HEAD, 2);
  for (const sd of [-1, 1]) ell("flew", Hd(sd * 0.017, 0.432, -0.37, true), HR(0.021, 0.022, 0.036 * lerp(1, 0.8, v.pup)), 0.016 * kh, HEAD, 2, undefined, sd);
  cone("jaw", Hd(0, 0.432, -0.3), Hd(0, 0.423, -0.378, true), 0.027 * hs, 0.016 * hs, 0.016 * kh, HEAD, 2);

  // ---- legs
  const legs: LegJ[] = [];
  for (let li = 0; li < 4; li++) {
    const sd = LEG_SIDE[li];
    const front = li < 2;
    const b0 = LEG_BASE[li];
    const pts: THREE.Vector3[] = [];
    const pawRy = 0.018 * ps;
    if (front) {
      const x = sd * 0.06;
      pts.push(B(sd * 0.055, 0.335, -0.11), B(x, 0.27, -0.172), B(x, 0.172, -0.108), B(x, 0.058, -0.118));
      const pz = B(x, 0, -0.128);
      pts.push(V(pz.x, pawRy * 1.35, pz.z));
    } else {
      const x = sd * 0.064;
      pts.push(B(x, 0.288, 0.152), B(x, 0.182, 0.108), B(x, 0.085, 0.192));
      const pz = B(x, 0, 0.172);
      pts.push(V(pz.x, pawRy * 1.35, pz.z));
    }
    pts.forEach((p, i) => (pivots[b0 + i] = p));
    const pw0 = pts[pts.length - 1];
    let fore: number;
    if (front) {
      const [, Sh, El, Wr] = pts;
      cone("arm", Sh, El, 0.042 * ls, 0.03 * ls, 0.03 * s, b0 + 1, 0, sd);
      cone("fore", El, Wr, 0.025 * ls, 0.0185 * ls, 0.016 * s, b0 + 2, 0, sd);
      ell("elbow", El.clone().add(V(0, 0.004, 0.012).multiplyScalar(s)), V(0.021, 0.021, 0.021).multiplyScalar(ls), 0.012 * s, b0 + 2, 0, undefined, sd);
      cone("past", Wr, pw0, 0.0185 * ls, Math.min(0.0175 * ls, pawRy * 1.05), 0.01 * s, b0 + 3, 0, sd);
      fore = 1;
    } else {
      const [Hp, St, Hk] = pts;
      cone("thigh", Hp, St, 0.054 * ls, 0.034 * ls, 0.035 * s, b0, 0, sd);
      ell("ham", B(sd * 0.061, 0.248, 0.19), V(0.038, 0.062, 0.042).multiplyScalar(ls), 0.03 * s, b0, 0, undefined, sd);
      cone("gaskin", St, Hk, 0.03 * ls, 0.0175 * ls, 0.02 * s, b0 + 1, 0, sd);
      ell("hock", Hk.clone().add(V(0, 0.006, 0.014).multiplyScalar(s)), V(0.0145, 0.0145, 0.0145).multiplyScalar(ls), 0.01 * s, b0 + 2, 0, undefined, sd);
      cone("meta", Hk, pw0, 0.0165 * ls, Math.min(0.016 * ls, pawRy * 1.05), 0.01 * s, b0 + 2, 0, sd);
      fore = 0;
    }
    const pawBone = b0 + (front ? 4 : 3);
    const pawC = V(pw0.x, pawRy, pw0.z - (front ? 0.014 : 0.012) * ps);
    const pawR = V(fore ? 0.024 : 0.023, 0.018, fore ? 0.03 : 0.029).multiplyScalar(ps);
    ell("paw", pawC, pawR, 0.012 * s, pawBone, 0, undefined, sd);
    const toeR = 0.0095 * ps;
    const toes: THREE.Vector3[] = [];
    for (const [dx, dz] of [
      [-0.015, 0.005],
      [-0.0052, 0],
      [0.0052, 0],
      [0.015, 0.005],
    ]) {
      const c = V(pw0.x + dx * ps, toeR, pawC.z - pawR.z * 0.72 + dz * ps);
      toes.push(c);
      ell("toe", c, V(toeR, toeR, toeR * 1.08), 0.006 * s, pawBone, 0, undefined, sd);
    }
    legs.push({
      pts,
      toes,
      toeR,
      pawC,
      pawR,
      pad: { c: V(pawC.x, 0.0042 * ps, pawC.z + 0.006 * ps), r: V(0.0135, 0.0052, 0.0115).multiplyScalar(ps) },
      digit: V(0.0068, 0.0044, 0.0074).multiplyScalar(ps),
    });
  }

  // ---- eyes (carved sockets) and the rest of the head's landmarks
  const eyes = [-1, 1].map((sd) => {
    const gaze = V(sd * 0.33, 0.1, -1).normalize();
    const r = 0.0122 * hs * v.eye;
    return { c: Hd(sd * 0.0295, 0.4805, -0.3325).addScaledVector(gaze, r * 0.12), gaze, r };
  });
  for (const e of eyes) {
    const P = ell("socket", e.c, V(1, 1, 1).multiplyScalar(e.r * 1.06), 0.006 * kh, -3, 1);
    P.kind = 2;
  }
  // subtractions last
  prims.sort((a, b) => (a.kind === 2 ? 1 : 0) - (b.kind === 2 ? 1 : 0));
  // pad the boxes by blend radius and the meshing band
  const pad = 0.03 * s;
  for (const P of prims) {
    const m = P.k + pad;
    P.x0 -= m;
    P.y0 -= m;
    P.z0 -= m;
    P.x1 += m;
    P.y1 += m;
    P.z1 += m;
  }
  const J: Joints = {
    pivots,
    legs,
    neckA,
    neckB,
    head: H,
    chestBottom: rib.cy - rib.ry,
    tailRoot: B(0, 0.333, 0.212),
    tail: { len: 0.235 * s * lerp(1, 0.95, v.pup), r0: 0.023 * s * lerp(1, 1.12, v.pup), r1: 0.0095 * s * lerp(1, 1.2, v.pup) },
    eyes,
    ears: [-1, 1].map((sd) => ({
      root: Hd(sd * 0.045, 0.489, -0.278),
      dir: V(sd * 0.62, -0.76, -0.14).normalize(),
      nrm: V(sd * 0.76, 0.62, 0).normalize(),
      len: 0.13 * hs * v.ear,
      wid: 0.084 * hs * v.ear,
      th: 0.0042 * hs,
      cup: 0.008 * hs,
    })),
    nose: { c: muzTip.clone().add(V(0, 0.005, -0.0195).multiplyScalar(hs)), r: HR(0.0215, 0.0158, 0.0138) },
    collar: { c: neckA.clone().lerp(neckB, 0.42), axis: neckB.clone().sub(neckA).normalize(), w: 0.017 * s * lerp(1, 1.05, v.pup), th: 0.0042 * s },
    lip: [-1, 1].map((sd) => [Hd(sd * 0.013, 0.419, -0.4, true), Hd(sd * 0.02, 0.4165, -0.386, true), Hd(sd * 0.025, 0.4175, -0.366, true), Hd(sd * 0.0285, 0.4225, -0.345, true)]),
    canon,
    zStop: Hd(0, 0.45, -0.335).z,
    stride: 0.42 * s * v.len * lerp(1, 0.95, v.pup),
  };
  return { prims, J };
};

// ================================================================================================ mesher
type MeshOut = { pos: Float32Array; nrm: Float32Array; index: Uint32Array };
/** Surface nets over the SDF in a narrow band: a coarse pass marks where the surface can be, the fine grid
 * is evaluated only there; one vertex per crossing cell (averaged edge crossings, projected onto the
 * surface), a quad across every crossing edge (split on the shorter diagonal). */
const surfaceNets = (prims: Prim[], h: number): MeshOut => {
  let bx0 = 1e9;
  let by0 = 1e9;
  let bz0 = 1e9;
  let bx1 = -1e9;
  let by1 = -1e9;
  let bz1 = -1e9;
  for (const P of prims) {
    if (P.kind === 2) continue;
    bx0 = Math.min(bx0, P.x0);
    by0 = Math.min(by0, P.y0);
    bz0 = Math.min(bz0, P.z0);
    bx1 = Math.max(bx1, P.x1);
    by1 = Math.max(by1, P.y1);
    bz1 = Math.max(bz1, P.z1);
  }
  const nx = Math.ceil((bx1 - bx0) / h) + 1;
  const ny = Math.ceil((by1 - by0) / h) + 1;
  const nz = Math.ceil((bz1 - bz0) / h) + 1;
  const C = 4;
  const cnx = Math.ceil((nx - 1) / C) + 1;
  const cny = Math.ceil((ny - 1) / C) + 1;
  const cnz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++)
    for (let j = 0; j < cny; j++)
      for (let i = 0; i < cnx; i++) coarse[i + cnx * (j + cny * k)] = sdfAt(prims, bx0 + i * C * h, by0 + j * C * h, bz0 + k * C * h);
  const ccx = cnx - 1;
  const ccy = cny - 1;
  const ccz = cnz - 1;
  const near0 = new Uint8Array(ccx * ccy * ccz);
  const band = C * h * Math.sqrt(3) * 1.6;
  for (let k = 0; k < ccz; k++)
    for (let j = 0; j < ccy; j++)
      for (let i = 0; i < ccx; i++) {
        let m = 1e9;
        for (let c = 0; c < 8; c++) m = Math.min(m, Math.abs(coarse[i + (c & 1) + cnx * (j + ((c >> 1) & 1) + cny * (k + ((c >> 2) & 1)))]));
        if (m < band) near0[i + ccx * (j + ccy * k)] = 1;
      }
  // dilate by one coarse cell
  const near = new Uint8Array(near0.length);
  for (let k = 0; k < ccz; k++)
    for (let j = 0; j < ccy; j++)
      for (let i = 0; i < ccx; i++) {
        if (!near0[i + ccx * (j + ccy * k)]) continue;
        for (let dk = -1; dk <= 1; dk++)
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const a = i + di;
              const b = j + dj;
              const c = k + dk;
              if (a >= 0 && b >= 0 && c >= 0 && a < ccx && b < ccy && c < ccz) near[a + ccx * (b + ccy * c)] = 1;
            }
      }
  const F = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const ck = Math.min((k / C) | 0, ccz - 1);
    const fk = k / C - ck;
    for (let j = 0; j < ny; j++) {
      const cj = Math.min((j / C) | 0, ccy - 1);
      const fj = j / C - cj;
      for (let i = 0; i < nx; i++) {
        const ci = Math.min((i / C) | 0, ccx - 1);
        const id = i + nx * (j + ny * k);
        if (near[ci + ccx * (cj + ccy * ck)]) {
          F[id] = sdfAt(prims, bx0 + i * h, by0 + j * h, bz0 + k * h);
        } else {
          const fi = i / C - ci;
          let val = 0;
          for (let c = 0; c < 8; c++) {
            const ox = c & 1;
            const oy = (c >> 1) & 1;
            const oz = (c >> 2) & 1;
            val += (ox ? fi : 1 - fi) * (oy ? fj : 1 - fj) * (oz ? fk : 1 - fk) * coarse[ci + ox + cnx * (cj + oy + cny * (ck + oz))];
          }
          F[id] = val;
        }
      }
    }
  }
  // vertices
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = F[i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + ((c >> 2) & 1)))];
          corner[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellV[i + (nx - 1) * (j + (ny - 1) * k)] = pos.length / 3;
        pos.push(bx0 + (i + sx / n) * h, by0 + (j + sy / n) * h, bz0 + (k + sz / n) * h);
      }
  // faces
  const idx: number[] = [];
  const cv = (i: number, j: number, k: number) => cellV[i + (nx - 1) * (j + (ny - 1) * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac < dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = F[i + nx * (j + ny * k)] < 0;
        if (v0 !== F[i + 1 + nx * (j + ny * k)] < 0 && i < nx - 1) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !v0);
        if (v0 !== F[i + nx * (j + 1 + ny * k)] < 0) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), !v0);
        if (v0 !== F[i + nx * (j + ny * (k + 1))] < 0) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !v0);
      }
  // project onto the surface, normals from the gradient
  const P = new Float32Array(pos);
  const N = new Float32Array(P.length);
  const g = V();
  const e = h * 0.25;
  for (let vi = 0; vi < P.length / 3; vi++) {
    let x = P[vi * 3];
    let y = P[vi * 3 + 1];
    let z = P[vi * 3 + 2];
    for (let it = 0; it < 3; it++) {
      const d = sdfAt(prims, x, y, z);
      gradAt(prims, x, y, z, e, g);
      const l2 = Math.max(1e-8, g.lengthSq());
      const st = clamp(d / l2, -h, h);
      x -= g.x * st;
      y -= g.y * st;
      z -= g.z * st;
    }
    gradAt(prims, x, y, z, e, g).normalize();
    P[vi * 3] = x;
    P[vi * 3 + 1] = y;
    P[vi * 3 + 2] = z;
    N[vi * 3] = g.x;
    N[vi * 3 + 1] = g.y;
    N[vi * 3 + 2] = g.z;
  }
  // make the winding agree with the gradient (outward)
  let agree = 0;
  for (let t = 0; t < idx.length; t += 3 * 17) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = P[b] - P[a];
    const uy = P[b + 1] - P[a + 1];
    const uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a];
    const wy = P[c + 1] - P[a + 1];
    const wz = P[c + 2] - P[a + 2];
    agree += (uy * wz - uz * wy) * N[a] + (uz * wx - ux * wz) * N[a + 1] + (ux * wy - uy * wx) * N[a + 2];
  }
  const index = new Uint32Array(idx);
  if (agree < 0) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  return { pos: P, nrm: N, index };
};

// ======================================================================================== coat pattern
const lin = (hex: string) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const COL = {
  white: lin("#EEE7DB"),
  cream: lin("#E6D6BE"),
  tan: lin("#A9622B"),
  tanLight: lin("#BE7C3F"),
  tanPup: lin("#8C4C1F"),
  black: lin("#1B1613"),
  ear: lin("#A9622B"),
  earPup: lin("#8A4A1E"),
  earEdge: lin("#6A3A1A"),
  pink: lin("#D9998A"),
  lid: lin("#2A1C16"),
};
type RGB = number[];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The colour of a prim's part at a canonical (adult) point with its canonical normal. */
const coatAt = (part: string, side: number, p: THREE.Vector3, n: THREE.Vector3, pup: number): RGB => {
  const n1 = fbm(p.x * 30 + 11, p.y * 30, p.z * 30, 3);
  const n2 = fbm(p.x * 70, p.y * 70 + 5, p.z * 70, 7);
  const tan = mix3(COL.tan, COL.tanPup, pup);
  const tanL = mix3(COL.tanLight, COL.tanPup, pup * 0.7);
  const tick = sstep(0.42, 0.62, fbm(p.x * 160, p.y * 160, p.z * 160, 9)) * 0.28;
  const lowerLeg = ["fore", "elbow", "past", "paw", "toe", "gaskin", "hock", "meta"].includes(part);
  if (lowerLeg) {
    // white legs; a tan wash on the back of the gaskin near the stifle; faint ticking
    let c = COL.white;
    if (part === "gaskin") c = mix3(c, tanL, 0.75 * sstep(0.13, 0.17, p.y + 0.01 * n1) * sstep(-0.2, 0.4, n.z));
    if (part === "elbow" || part === "fore") c = mix3(c, tanL, 0.6 * sstep(0.15, 0.175, p.y + 0.008 * n1) * sstep(0.2, 0.7, n.x * side));
    return mix3(c, tanL, tick);
  }
  if (["skull", "occiput", "cheek", "brow", "muzzle", "flew", "jaw"].includes(part)) {
    // tan head; white blaze up the forehead, white muzzle and chin; freckles on the muzzle
    let c = part === "cheek" ? mix3(tan, tanL, 0.5) : tan;
    const w = pw(
      [
        [-0.345, 0.017],
        [-0.33, 0.0105],
        [-0.3, 0.0062],
        [-0.27, 0.0038],
        [-0.25, 0.0022],
      ],
      p.z,
    );
    const blaze = (1 - sstep(w - 0.0022, w + 0.0022, Math.abs(p.x) + 0.0015 * n2)) * sstep(0.462, 0.474, p.y) * (1 - sstep(-0.262, -0.248, p.z));
    const muz = sstep(-0.338, -0.352, p.z + 0.004 * n1 - 0.0025 * Math.abs(p.x) * 10 * sstep(0.45, 0.47, p.y));
    const chin = sstep(0.444, 0.432, p.y + 0.003 * n1) * sstep(-0.27, -0.31, p.z);
    const throat = sstep(0.43, 0.415, p.y + 0.004 * n1);
    const wh = Math.max(blaze, muz, chin, throat);
    c = mix3(c, COL.white, wh);
    const fr = sstep(0.5, 0.75, fbm(p.x * 260, p.y * 260, p.z * 260, 21)) * muz * sstep(0.445, 0.43, p.y) * 0.35;
    return mix3(c, tanL, fr);
  }
  // body
  const z = p.z;
  const y = p.y;
  let c = tan;
  // white underside, bib and inner legs
  const yW = pw(
    [
      [-0.25, 0.2],
      [-0.06, 0.212],
      [0.06, 0.252],
      [0.15, 0.242],
      [0.26, 0.22],
    ],
    z,
  );
  let white = 1 - sstep(yW - 0.008, yW + 0.008, y + 0.012 * n1);
  if (part === "neck" || part === "throat" || part === "chest" || part === "rib") {
    const fwd = -n.z * 0.85 - n.y * 0.45;
    white = Math.max(white, sstep(0.18, 0.4, fwd + 0.1 * n1) * sstep(-0.11, -0.16, z));
  }
  if (part === "arm") white = Math.max(white, sstep(0.25, 0.6, -n.z + 0.1 * n1), sstep(0.1, 0.5, -n.x * side), 1 - sstep(0.19, 0.215, y + 0.01 * n1));
  if (part === "thigh" || part === "ham") white = Math.max(white, sstep(0.0, 0.5, -n.x * side + 0.1 * n1), 1 - sstep(0.185, 0.21, y + 0.01 * n1));
  c = mix3(c, COL.white, white);
  // the black saddle (bigger on the puppy)
  const ySad = pw(
    [
      [-0.16, 0.335],
      [-0.12, 0.293],
      [-0.05, 0.262],
      [0.05, 0.257],
      [0.14, 0.27],
      [0.22, 0.3],
    ],
    z,
  ) - 0.018 * pup;
  const zF = -0.128 - 0.28 * (0.355 - y) - 0.02 * pup;
  const zR = 0.216 + 0.25 * (0.335 - y) + 0.012 * pup;
  let sad = sstep(ySad - 0.007, ySad + 0.007, y + 0.014 * n1) * sstep(zF - 0.006, zF + 0.006, z + 0.01 * n2) * (1 - sstep(zR - 0.006, zR + 0.006, z + 0.01 * n2));
  if (part === "arm" || part === "thigh" || part === "ham") sad *= sstep(0.27, 0.3, y);
  return mix3(c, COL.black, sad);
};

// =========================================================================================== static rig
type Static = {
  v: Variant;
  J: Joints;
  headPrims: Prim[];
  nFur: number;
  nAll: number;
  rest: Float32Array;
  restN: Float32Array;
  bi: Uint8Array;
  bw: Float32Array;
  breathe: Float32Array;
  headMask: Uint8Array;
  attrs: { color: THREE.BufferAttribute; uv: THREE.BufferAttribute; restPos: THREE.BufferAttribute; restNrm: THREE.BufferAttribute; index: THREE.BufferAttribute };
  groups: [number, number, number][];
  collarTagVert: number;
  restUp: THREE.Vector3[];
  earIndex: THREE.BufferAttribute;
  earUv: THREE.BufferAttribute;
  earColor: THREE.BufferAttribute;
  earGroups: [number, number, number][];
  tailIndex: THREE.BufferAttribute;
  tailUv: THREE.BufferAttribute;
  tailColor: THREE.BufferAttribute;
  eyeGeo: THREE.BufferGeometry;
  tagGeo: THREE.BufferGeometry;
  ringGeo: THREE.BufferGeometry;
};
const EAR_N = 15;
const EAR_M = 9;
const TAIL_N = 16;
const TAIL_R = 10;

type Piece = { pos: number[]; nrm: number[]; uv: number[]; col: number[]; bone: number[]; w: number[]; idx: number[] };
const newPiece = (): Piece => ({ pos: [], nrm: [], uv: [], col: [], bone: [], w: [], idx: [] });

const buildStatic = (v: Variant): Static => {
  const { prims, J } = anatomy(v);
  const s = v.s;
  const m = surfaceNets(prims, v.h);
  const nFur = m.pos.length / 3;
  const solid = prims.filter((P) => P.kind !== 2);
  const headPrims = prims.filter((P) => P.region !== 0);
  // ---- chain parameters for the torso (by z) and the neck (along its axis)
  const pv = J.pivots;
  const tc = [pv[0].z, (pv[1].z + pv[2].z) / 2, (pv[2].z + pv[3].z) / 2, (pv[3].z + pv[4].z) / 2, (pv[4].z + pv[5].z) / 2];
  const nA = J.neckA;
  const nAx = J.neckB.clone().sub(nA);
  const nL2 = nAx.lengthSq();
  const proj = (p: THREE.Vector3) => p.clone().sub(nA).dot(nAx) / nL2;
  const tN = [proj(pv[4]), proj(pv[5]), proj(pv[6]), proj(pv[7])];
  const nc = [(tN[0] + tN[1]) / 2, (tN[1] + tN[2]) / 2, (tN[2] + tN[3]) / 2, tN[3] + 0.12];
  const chainW = (bind: number, p: THREE.Vector3, acc: Float32Array, w: number) => {
    if (bind >= 0) {
      acc[bind] += w;
      return;
    }
    if (bind === -1) {
      const z = p.z;
      if (z >= tc[0]) acc[0] += w;
      else if (z <= tc[4]) acc[4] += w;
      else
        for (let i = 0; i < 4; i++)
          if (z <= tc[i] && z >= tc[i + 1]) {
            const f = (tc[i] - z) / (tc[i] - tc[i + 1]);
            acc[i] += w * (1 - f);
            acc[i + 1] += w * f;
          }
      return;
    }
    const t = proj(p);
    const bones = [4, 5, 6, 7];
    if (t <= nc[0]) acc[4] += w;
    else if (t >= nc[3]) acc[7] += w;
    else
      for (let i = 0; i < 3; i++)
        if (t >= nc[i] && t <= nc[i + 1]) {
          const f = (t - nc[i]) / (nc[i + 1] - nc[i]);
          acc[bones[i]] += w * (1 - f);
          acc[bones[i + 1]] += w * f;
        }
  };
  const sigma = 0.0055 * s;
  const acc = new Float32Array(NB);
  const dists = new Float32Array(solid.length);
  /** skin weights (top 4), the coat colour, breathing weight and head membership at a rest point */
  const skinAt = (p: THREE.Vector3, n: THREE.Vector3) => {
    acc.fill(0);
    let dmin = 1e9;
    for (let i = 0; i < solid.length; i++) {
      dists[i] = sdPrim(solid[i], p.x, p.y, p.z);
      dmin = Math.min(dmin, dists[i]);
    }
    let col = [0, 0, 0];
    let wsum = 0;
    let br = 0;
    for (let i = 0; i < solid.length; i++) {
      const dd = dists[i] - dmin;
      if (dd > sigma * 7) continue;
      const w = Math.exp(-dd / sigma);
      const P = solid[i];
      chainW(P.bind, p, acc, w);
      const cp = J.canon(p, P.region);
      const c = coatAt(P.part, P.side, cp, n, v.pup);
      col = [col[0] + c[0] * w, col[1] + c[1] * w, col[2] + c[2] * w];
      br += P.breathe * w;
      wsum += w;
    }
    // top four bones
    const order = Array.from(acc.keys()).sort((a, b) => acc[b] - acc[a]).slice(0, 4);
    const tot = order.reduce((q, b) => q + acc[b], 0) || 1;
    return {
      bones: order,
      w: order.map((b) => acc[b] / tot),
      col: col.map((c) => c / wsum),
      breathe: (br / wsum) * sstep(0.05, -0.6, n.y) * 0.8 + (br / wsum) * 0.2,
      head: (acc[HEAD] + acc[N2] * 0.6) / tot > 0.5 ? 1 : 0,
    };
  };

  // ---- the fur body
  const pieces: { p: Piece; group: number }[] = [];
  const fur = newPiece();
  const tp = V();
  const tn = V();
  const breatheArr: number[] = [];
  const headArr: number[] = [];
  for (let i = 0; i < nFur; i++) {
    tp.fromArray(m.pos, i * 3);
    tn.fromArray(m.nrm, i * 3);
    const r = skinAt(tp, tn);
    fur.pos.push(tp.x, tp.y, tp.z);
    fur.nrm.push(tn.x, tn.y, tn.z);
    fur.uv.push(0, 0);
    fur.col.push(...r.col);
    fur.bone.push(...r.bones);
    fur.w.push(...r.w);
    breatheArr.push(r.breathe);
    headArr.push(r.head);
  }
  fur.idx = Array.from(m.index);
  pieces.push({ p: fur, group: 0 });

  /** a rigid piece bound to one bone */
  const rigid = (g: THREE.BufferGeometry, bone: number, color: RGB, group: number) => {
    const p = newPiece();
    const pa = g.attributes.position as THREE.BufferAttribute;
    const na = g.attributes.normal as THREE.BufferAttribute;
    const ua = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pa.count; i++) {
      p.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      p.nrm.push(na.getX(i), na.getY(i), na.getZ(i));
      p.uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      p.col.push(...color);
      p.bone.push(bone, 0, 0, 0);
      p.w.push(1, 0, 0, 0);
    }
    const ix = g.index ? Array.from(g.index.array) : Array.from({ length: pa.count }, (_, i) => i);
    p.idx = ix;
    pieces.push({ p, group });
    return p;
  };

  // ---- pads (the large pad and four toe pads per paw), bound to the paw bones
  J.legs.forEach((L, li) => {
    const pawBone = LEG_BASE[li] + (li < 2 ? 4 : 3);
    const sph = new THREE.SphereGeometry(1, 14, 8);
    const g1 = sph.clone().scale(L.pad.r.x, L.pad.r.y, L.pad.r.z).translate(L.pad.c.x, L.pad.c.y, L.pad.c.z);
    rigid(g1, pawBone, COL.lid, 1);
    for (const t of L.toes) {
      const g2 = sph.clone().scale(L.digit.x, L.digit.y, L.digit.z).translate(t.x, L.digit.y * 0.82, t.z + L.toeR * 0.05);
      rigid(g2, pawBone, COL.lid, 1);
    }
  });

  // ---- the nose: broad, flat-fronted, with nostrils and a groove
  {
    const g = new THREE.SphereGeometry(1, 36, 26);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      let x = pa.getX(i);
      let y = pa.getY(i);
      let z = pa.getZ(i);
      // flatten the front (-z) and the underside a little, widen the top
      if (z < -0.55) z = -0.55 + (z + 0.55) * 0.45;
      if (y < -0.6) y = -0.6 + (y + 0.6) * 0.5;
      x *= 1 + 0.12 * y;
      // nostrils: comma-shaped dips on the front, flaring out and down
      for (const sd of [-1, 1]) {
        const ux = (x - sd * 0.42) / 0.2;
        const uy = (y + 0.08 + 0.25 * (x * sd - 0.42)) / 0.3;
        const dip = Math.exp(-(ux * ux + uy * uy) * 1.6) * sstep(-0.2, -0.6, z);
        z += dip * 0.32;
      }
      // the groove down the middle of the lower front
      z += Math.exp(-((x / 0.07) ** 2)) * sstep(0.0, -0.6, y) * sstep(-0.2, -0.6, z) * 0.12;
      pa.setXYZ(i, x, y, z);
    }
    g.scale(J.nose.r.x, J.nose.r.y, J.nose.r.z);
    g.translate(J.nose.c.x, J.nose.c.y, J.nose.c.z);
    g.computeVertexNormals();
    rigid(g, HEAD, COL.black, 2);
  }

  // ---- the mouth line: a fine dark crease along the lips, projected onto the head
  for (const pts of J.lip) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const samples: THREE.Vector3[] = [];
    const gv = V();
    for (let i = 0; i <= 28; i++) {
      const q = curve.getPoint(i / 28);
      for (let it = 0; it < 4; it++) {
        const d = sdfAt(headPrims, q.x, q.y, q.z);
        gradAt(headPrims, q.x, q.y, q.z, 0.0005 * s, gv).normalize();
        q.addScaledVector(gv, -d - 0.00035 * s);
      }
      samples.push(q);
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples), 40, 0.0008 * s * v.head, 6, false);
    rigid(tube, HEAD, COL.lid, 4);
  }

  // ---- the collar: a band following the neck's own cross-section, skinned like the skin under it
  let collarTagVert = 0;
  {
    const C = J.collar;
    const ax = C.axis;
    const e1 = V(1, 0, 0);
    const e2 = ax.clone().cross(e1).normalize();
    const NS = 64;
    const offs = [-0.5, -0.25, 0, 0.25, 0.5];
    const rad: number[][] = [];
    for (let a = 0; a < NS; a++) {
      const th = (a / NS) * Math.PI * 2;
      const dir = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      rad.push(
        offs.map((o) => {
          const c0 = C.c.clone().addScaledVector(ax, o * C.w);
          let lo = 0;
          let hi = 0.15 * s;
          for (let it = 0; it < 30; it++) {
            const mid = (lo + hi) / 2;
            const q = c0.clone().addScaledVector(dir, mid);
            if (sdfAt(prims, q.x, q.y, q.z) < 0) lo = mid;
            else hi = mid;
          }
          return lo;
        }),
      );
    }
    // the profile: inner face on the fur (a hair proud), rounded outer edges
    const prof: [number, number][] = [];
    const PR = 10;
    for (let i = 0; i <= PR; i++) {
      const ang = (i / PR) * Math.PI;
      prof.push([-Math.cos(ang), Math.sin(ang)]); // across (-1..1), out (0..1)
    }
    const p = newPiece();
    const rows = NS + 1;
    for (let a = 0; a <= NS; a++) {
      const aa = a % NS;
      const th = (aa / NS) * Math.PI * 2;
      const dir = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      for (let i = 0; i <= PR + 1; i++) {
        // PR+1 profile points over the top, then back along the inner face
        const [u, o] = i <= PR ? prof[i] : [-1, 0];
        const across = u * 0.5;
        // the fur radius under this point (interpolated across the band)
        const fu = (across + 0.5) * (offs.length - 1);
        const i0 = Math.min(offs.length - 2, Math.floor(fu));
        const r0 = lerp(rad[aa][i0], rad[aa][i0 + 1], fu - i0);
        const round = Math.min(1, o * 2.2);
        const r = r0 + 0.0004 * s + C.th * (0.25 + 0.75 * round) * (i <= PR ? 1 : 0) * (i === 0 || i === PR ? 0.25 : 1);
        const q = C.c.clone().addScaledVector(ax, across * C.w * (i <= PR ? 1 : 1)).addScaledVector(dir, r);
        p.pos.push(q.x, q.y, q.z);
        p.nrm.push(dir.x, dir.y, dir.z);
        p.uv.push((a / NS) * 2 * Math.PI * r0 / (0.03 * s), i / (PR + 1));
        p.col.push(1, 1, 1);
        const surf = C.c.clone().addScaledVector(ax, across * C.w).addScaledVector(dir, r0);
        const sk = skinAt(surf, dir);
        p.bone.push(...sk.bones);
        p.w.push(...sk.w);
      }
    }
    const cols = PR + 2;
    for (let a = 0; a < NS; a++)
      for (let i = 0; i < cols; i++) {
        const i1 = (i + 1) % cols;
        const A = a * cols + i;
        const Bq = (a + 1) * cols + i;
        const Cq = (a + 1) * cols + i1;
        const D = a * cols + i1;
        p.idx.push(A, Bq, Cq, A, Cq, D);
      }
    void rows;
    // the tag hangs from the bottom-front of the band: the angle whose direction is most down-forward
    let best = 0;
    let bestV = -1e9;
    for (let a = 0; a < NS; a++) {
      const th = (a / NS) * Math.PI * 2;
      const dir = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      const sc = -dir.y * 0.6 - dir.z * 0.8;
      if (sc > bestV) {
        bestV = sc;
        best = a;
      }
    }
    pieces.push({ p, group: 3 });
    collarTagVert = -1 - (best * cols + Math.round(PR / 2)); // resolved to a global index below
  }

  // ---- merge
  let nAll = 0;
  for (const { p } of pieces) nAll += p.pos.length / 3;
  const rest = new Float32Array(nAll * 3);
  const restN = new Float32Array(nAll * 3);
  const uv = new Float32Array(nAll * 2);
  const color = new Float32Array(nAll * 3);
  const bi = new Uint8Array(nAll * 4);
  const bw = new Float32Array(nAll * 4);
  const breathe = new Float32Array(nAll);
  const headMask = new Uint8Array(nAll);
  const index: number[] = [];
  const groups: [number, number, number][] = [];
  let off = 0;
  for (const { p, group } of pieces) {
    const n = p.pos.length / 3;
    rest.set(p.pos, off * 3);
    restN.set(p.nrm, off * 3);
    uv.set(p.uv, off * 2);
    color.set(p.col, off * 3);
    bi.set(p.bone, off * 4);
    bw.set(p.w, off * 4);
    const start = index.length;
    for (const k of p.idx) index.push(k + off);
    const last = groups[groups.length - 1];
    if (last && last[2] === group && last[0] + last[1] === start) last[1] += p.idx.length;
    else groups.push([start, p.idx.length, group]);
    if (group === 3 && collarTagVert < 0) collarTagVert = off + (-1 - collarTagVert);
    off += n;
  }
  breathe.set(breatheArr, 0);
  headMask.set(headArr, 0);
  for (let i = nFur; i < nAll; i++) {
    const b = bi[i * 4];
    headMask[i] = b === HEAD ? 1 : 0;
  }

  // ---- ears: static index/uv/colour (positions are solved per frame)
  const earIdx: number[] = [];
  const earUvA: number[] = [];
  const earCol: number[] = [];
  const earGroups: [number, number, number][] = [];
  const NM = EAR_N * EAR_M;
  for (let surf = 0; surf < 2; surf++) {
    const start = earIdx.length;
    for (let i = 0; i < EAR_N; i++)
      for (let j = 0; j < EAR_M; j++) {
        const sv = i / (EAR_N - 1);
        const u = j / (EAR_M - 1);
        earUvA.push(u, sv);
        const edge = Math.max(Math.abs(u * 2 - 1) ** 3, sv ** 6);
        if (surf === 0) {
          const base = mix3(COL.ear, COL.earPup, v.pup);
          earCol.push(...mix3(base, COL.earEdge, 0.45 * sstep(0.55, 1, edge)));
        } else {
          // pink skin in the middle near the root, fading to tan hair at the edges and the tip
          const pinkness = (1 - sstep(0.25, 0.85, Math.abs(u * 2 - 1))) * (1 - sstep(0.35, 0.95, sv));
          earCol.push(...mix3(mix3(COL.ear, COL.tanLight, 0.35), COL.pink, pinkness));
        }
      }
    const o = surf * NM;
    for (let i = 0; i < EAR_N - 1; i++)
      for (let j = 0; j < EAR_M - 1; j++) {
        const a = o + i * EAR_M + j;
        const b = a + EAR_M;
        const c = a + 1;
        const d = b + 1;
        if (surf === 0) earIdx.push(a, c, b, c, d, b);
        else earIdx.push(a, b, c, c, b, d);
      }
    earGroups.push([start, earIdx.length - start, surf]);
  }
  // the rim: duplicated perimeter vertices (outer, inner) joined by a strip
  const perim: [number, number][] = [];
  for (let i = 0; i < EAR_N; i++) perim.push([i, 0]);
  for (let j = 1; j < EAR_M; j++) perim.push([EAR_N - 1, j]);
  for (let i = EAR_N - 2; i >= 0; i--) perim.push([i, EAR_M - 1]);
  for (let j = EAR_M - 2; j >= 1; j--) perim.push([0, j]);
  {
    const start = earIdx.length;
    const o = 2 * NM;
    perim.forEach(([i, j], k) => {
      earUvA.push(k / perim.length, 0, k / perim.length, 1);
      const c = mix3(COL.earEdge, COL.ear, 0.3);
      earCol.push(...c, ...c);
      void i;
      void j;
    });
    for (let k = 0; k < perim.length; k++) {
      const k1 = (k + 1) % perim.length;
      const a = o + k * 2;
      const b = o + k1 * 2;
      earIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    earGroups.push([start, earIdx.length - start, 2]);
  }

  // ---- tail: static index/uv/colour (black on top, a white flag at the tip, tan under the root)
  const tailIdx: number[] = [];
  const tailUvA: number[] = [];
  const tailCol: number[] = [];
  for (let i = 0; i < TAIL_N; i++)
    for (let r = 0; r <= TAIL_R; r++) {
      const sv = i / (TAIL_N - 1);
      const ang = (r / TAIL_R) * Math.PI * 2;
      tailUvA.push(r / TAIL_R, sv * 4);
      const top = Math.cos(ang); // +1 on top
      const n1 = vnoise(r * 0.7, i * 0.5, 0, 31);
      const tipWhite = sstep(0.68, 0.76, sv + 0.025 * n1);
      const blackTop = sstep(-0.8, -0.45, top + 0.15 * n1);
      let c = mix3(mix3(COL.tan, COL.tanPup, v.pup), COL.black, blackTop * (1 - sstep(0.6, 0.7, sv)) * sstep(-0.02, 0.06, sv));
      c = mix3(c, COL.white, Math.max(tipWhite, (1 - sstep(-0.95, -0.7, top)) * sstep(0.3, 0.45, sv) * 0.9));
      tailCol.push(...c);
    }
  // the tip cap vertex
  tailUvA.push(0.5, 4);
  tailCol.push(...COL.white);
  for (let i = 0; i < TAIL_N - 1; i++)
    for (let r = 0; r < TAIL_R; r++) {
      const a = i * (TAIL_R + 1) + r;
      const b = a + TAIL_R + 1;
      tailIdx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const tip = TAIL_N * (TAIL_R + 1);
  for (let r = 0; r < TAIL_R; r++) {
    const a = (TAIL_N - 1) * (TAIL_R + 1) + r;
    tailIdx.push(a, tip, a + 1);
  }

  // ---- eyes, tag, ring
  const eyeR = J.eyes[0].r;
  const eyeGeo = new THREE.SphereGeometry(eyeR, 28, 20).rotateX(-Math.PI / 2);
  const tagR = 0.0105 * s * lerp(1, 1.25, v.pup);
  const tagGeo = new THREE.CylinderGeometry(tagR, tagR, 0.0016 * s, 28, 1).rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.0042 * s, 0.0009 * s, 6, 18);

  const BA = (a: ArrayLike<number>, n: number) => new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), n);
  return {
    v,
    J,
    headPrims,
    nFur,
    nAll,
    rest,
    restN,
    bi,
    bw,
    breathe,
    headMask,
    attrs: { color: BA(color, 3), uv: BA(uv, 2), restPos: BA(rest, 3), restNrm: BA(restN, 3), index: new THREE.BufferAttribute(new Uint32Array(index), 1) },
    groups,
    collarTagVert,
    restUp: J.legs.map((L, li) => (li < 2 ? L.pts[3].clone().sub(L.pts[4]) : L.pts[2].clone().sub(L.pts[3])).normalize()),
    earIndex: new THREE.BufferAttribute(new Uint32Array(earIdx), 1),
    earUv: BA(earUvA, 2),
    earColor: BA(earCol, 3),
    earGroups,
    tailIndex: new THREE.BufferAttribute(new Uint32Array(tailIdx), 1),
    tailUv: BA(tailUvA, 2),
    tailColor: BA(tailCol, 3),
    eyeGeo,
    tagGeo,
    ringGeo,
  };
};
const statics: Partial<Record<"adult" | "puppy", Static>> = {};
const getStatic = (puppy: boolean) => (statics[puppy ? "puppy" : "adult"] ??= buildStatic(puppy ? PUPPY : ADULT));

// ============================================================================================ materials
const furTex = () =>
  canvasTex(
    "beagle-fur-strands",
    512,
    512,
    (g, w, h) => {
      const r = rand(4242);
      g.fillStyle = "rgb(205,205,205)";
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 9000; k++) {
        const x = r() * w;
        const y = r() * h;
        const len = 26 + r() * 46;
        const ang = Math.PI / 2 + (r() - 0.5) * 0.3;
        const l = Math.round(140 + r() * 115);
        g.strokeStyle = `rgba(${l},${l},${l},${0.3 + r() * 0.45})`;
        g.lineWidth = 0.9 + r() * 1.4;
        const bend = (r() - 0.5) * 6;
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            if (x + ox < -80 || x + ox > w + 80 || y + oy < -80 || y + oy > h + 80) continue;
            g.beginPath();
            g.moveTo(x + ox, y + oy);
            g.quadraticCurveTo(x + ox + Math.cos(ang) * len * 0.5 + bend, y + oy + Math.sin(ang) * len * 0.5, x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
            g.stroke();
          }
      }
    },
    [1, 1],
    false,
  );
const TRIPLANAR = /* glsl */ `
uniform sampler2D furTex;
uniform float furScale;
uniform float furBump;
varying vec3 vRest;
varying vec3 vRestN;
float furSample() {
  vec3 n = normalize(vRestN);
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 p = vRest * furScale;
  float hx = texture2D(furTex, vec2(p.y, p.z)).r;
  float hy = texture2D(furTex, vec2(p.x, p.z)).r;
  float hz = texture2D(furTex, vec2(p.x, p.y)).r;
  return hx * w.x + hy * w.y + hz * w.z;
}
vec3 perturbFur(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;
const furMat = (key: string, scale: number) =>
  mat(`beagle-fur-${key}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, sheen: 0.55, sheenRoughness: 0.42, sheenColor: new THREE.Color("#CDB79A"), specularIntensity: 0.35 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.furTex = { value: furTex() };
      sh.uniforms.furScale = { value: scale };
      sh.uniforms.furBump = { value: 1.6 };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 restPos;\nattribute vec3 restNrm;\nvarying vec3 vRest;\nvarying vec3 vRestN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = restPos;\nvRestN = restNrm;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + TRIPLANAR)
        .replace("#include <color_fragment>", "#include <color_fragment>\nfloat furH = furSample();\ndiffuseColor.rgb *= mix(0.8, 1.1, furH);")
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n{ vec2 dH = vec2(dFdx(furH), dFdy(furH)) * furBump * 0.02; normal = perturbFur(-vViewPosition, normal, dH, faceDirection); }");
    };
    m.customProgramCacheKey = () => `beagle-fur-${key}`;
    return m;
  });
const strandMap = () => {
  const t = furTex().clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  t.needsUpdate = true;
  return t;
};
const padMat = () => mat("beagle-pad", () => new THREE.MeshStandardMaterial({ color: "#4A3B37", roughness: 0.72 }));
const noseTex = () =>
  canvasTex(
    "beagle-nose",
    256,
    256,
    (g, w, h) => {
      const r = rand(77);
      g.fillStyle = "rgb(128,128,128)";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 1.5 + r() * 3.5;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, "rgba(255,255,255,0.55)");
        grd.addColorStop(1, "rgba(128,128,128,0)");
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    },
    [1, 1],
    false,
  );
const noseMat = () => mat("beagle-nose", () => new THREE.MeshPhysicalMaterial({ color: "#151110", roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, bumpMap: noseTex(), bumpScale: 0.6 }));
const collarTex = () =>
  canvasTex(
    "beagle-collar",
    256,
    64,
    (g, w, h) => {
      g.fillStyle = "#B51F2A";
      g.fillRect(0, 0, w, h);
      // nylon weave
      for (let x = 0; x < w; x += 3) {
        g.fillStyle = `rgba(0,0,0,${x % 6 === 0 ? 0.1 : 0.04})`;
        g.fillRect(x, 0, 1.5, h);
      }
      for (let y = 0; y < h; y += 3) {
        g.fillStyle = "rgba(255,255,255,0.04)";
        g.fillRect(0, y, w, 1);
      }
      // stitch lines near both edges (the profile runs edge to edge over the top: v 0.1 and 0.9 of the face)
      g.fillStyle = "rgba(255,225,215,0.55)";
      for (const yy of [0.2, 0.75]) for (let x = 0; x < w; x += 9) g.fillRect(x, yy * h, 5, 1.6);
    },
    [1, 1],
  );
const collarMat = () => mat("beagle-collar", () => new THREE.MeshPhysicalMaterial({ map: collarTex(), roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#FF8C8C") }));
const lipMat = () => mat("beagle-lip", () => new THREE.MeshStandardMaterial({ color: "#4A342B", roughness: 0.6 }));
const earMats = (pup: number) => [
  mat(`beagle-earOut-${pup}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, map: strandMap(), roughness: 0.62, sheen: 0.6, sheenRoughness: 0.42, sheenColor: new THREE.Color("#D8B48C"), side: THREE.DoubleSide })),
  mat(`beagle-earIn-${pup}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color("#F2C2B4"), side: THREE.DoubleSide })),
  mat(`beagle-earRim-${pup}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.65, sheen: 0.5, sheenColor: new THREE.Color("#D8B48C"), side: THREE.DoubleSide })),
];
const tailMat = () =>
  mat("beagle-tail", () => {
    const t = strandMap();
    t.repeat.set(0.6, 1);
    return new THREE.MeshPhysicalMaterial({ vertexColors: true, map: t, roughness: 0.6, sheen: 0.55, sheenRoughness: 0.42, sheenColor: new THREE.Color("#CDB79A") });
  });
const irisTex = () =>
  canvasTex("beagle-iris", 256, 256, (g, w, h) => {
    // u around the gaze axis, v from the front pole: pupil, iris, a dark limbal ring, the brownish sclera
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x += 2) {
        const streak = 0.5 + 0.5 * Math.sin(x * 0.55 + Math.sin(x * 0.13) * 3);
        let c: [number, number, number];
        if (v < 0.075) c = [6, 4, 3];
        else if (v < 0.27) {
          const k = (v - 0.075) / 0.195;
          const base = lerp(52, 34, k);
          c = [base + 14 * streak + 18 * (1 - k), base * 0.62 + 6 * streak + 8 * (1 - k), base * 0.36 + 2 * streak];
        } else if (v < 0.3) c = [18, 11, 7];
        else c = [118, 92, 76];
        g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        g.fillRect(x, y, 2, 1);
      }
    }
  });
const eyeMat = () => mat("beagle-eye", () => new THREE.MeshPhysicalMaterial({ map: irisTex(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.8 }));
const lidMat = (pup: number) => mat(`beagle-lid-${pup}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color("#CDB79A") }));
const glintMat = () => mat("beagle-glint", () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.2, 1.1), transparent: true, depthWrite: false }));

// ================================================================================================ posing
type Xf = { q: THREE.Quaternion; t: THREE.Vector3 };
const xfApply = (X: Xf, p: THREE.Vector3, out = V()) => out.copy(p).applyQuaternion(X.q).add(X.t);
const xfInv = (X: Xf, p: THREE.Vector3, out = V()) => out.copy(p).sub(X.t).applyQuaternion(X.q.clone().invert());
type LegIK = { paw: THREE.Vector3; up: THREE.Vector3; fwd: THREE.Vector3 };
type LegSpec = { ik?: LegIK; fk?: number[]; spread: number; scap?: number };
type TailSpec = { up: number; side: number; curl: number; sideCurl: number; droop: number };
type Spec = {
  rootPos: THREE.Vector3;
  rootRot: THREE.Quaternion;
  spine: THREE.Quaternion[]; // bones 1..7
  legs: LegSpec[];
  tail: TailSpec;
  earFlip: [number, number];
  earLift: [number, number];
  earSwing: number;
  blink: number;
  breathe: number;
  breathRate: number;
  sink: number;
};
type Solved = { local: THREE.Quaternion[]; rootPos: THREE.Vector3; rootRot: THREE.Quaternion; tail: TailSpec; earFlip: [number, number]; earLift: [number, number]; earSwing: number; blink: number; breathe: number; breathRate: number; sink: number };

const ang2 = (dy: number, dz: number) => Math.atan2(dz, dy);
const fkSpine = (S: Static, rootPos: THREE.Vector3, rootRot: THREE.Quaternion, local: THREE.Quaternion[], out: Xf[], upto = NB) => {
  const pv = S.J.pivots;
  out[0] = { q: rootRot.clone(), t: rootPos.clone().sub(pv[0].clone().applyQuaternion(rootRot)) };
  for (let b = 1; b < upto; b++) {
    const pa = out[PARENT[b]];
    const L = local[b];
    const q = pa.q.clone().multiply(L);
    const t = pv[b].clone().sub(pv[b].clone().applyQuaternion(L)).applyQuaternion(pa.q).add(pa.t);
    out[b] = { q, t };
  }
  return out;
};

/** Solve one leg into local rotations: 2-bone IK to the wrist (front, elbow back) or hock (hind, stifle
 * forward), with the scapula following the swing, then the pastern/metatarsus and the paw to their given
 * directions; or plain angles (fk). */
const solveLeg = (S: Static, li: number, L: LegSpec, X: Xf[], local: THREE.Quaternion[]) => {
  const b0 = LEG_BASE[li];
  const sd = LEG_SIDE[li];
  const front = li < 2;
  const pts = S.J.legs[li].pts;
  const spreadQ = QA(Z_AX, sd * L.spread);
  if (L.fk || !L.ik) {
    const a = L.fk ?? [0, 0, 0, 0, 0];
    local[b0] = spreadQ.clone().multiply(QA(X_AX, a[0]));
    for (let i = 1; i < pts.length; i++) local[b0 + i] = QA(X_AX, a[i] ?? 0);
    return;
  }
  const att = X[front ? 4 : PEL];
  const qi = att.q.clone().invert();
  const ik = L.ik;
  const distal = front ? pts[3].distanceTo(pts[4]) : pts[2].distanceTo(pts[3]);
  const endW = ik.paw.clone().addScaledVector(ik.up, distal);
  const top = pts[0];
  const unspread = QA(Z_AX, -sd * L.spread);
  const toRest = (p: THREE.Vector3) => xfInv(att, p).sub(top).applyQuaternion(unspread).add(top);
  const E = toRest(endW);
  const up = ik.up.clone().applyQuaternion(qi).applyQuaternion(unspread);
  const fw = ik.fwd.clone().applyQuaternion(qi).applyQuaternion(unspread);
  let A: THREE.Vector3;
  let J1: THREE.Vector3;
  let J2: THREE.Vector3;
  let th0 = 0;
  if (front) {
    const [Sc, Sh, El, Wr] = pts;
    const swing = wrap(ang2(E.y - Sh.y, E.z - Sh.z) - ang2(Wr.y - Sh.y, Wr.z - Sh.z));
    th0 = (L.scap ?? 0.3) * swing;
    const c = Math.cos(th0);
    const s = Math.sin(th0);
    const dy = Sh.y - Sc.y;
    const dz = Sh.z - Sc.z;
    A = V(Sh.x, Sc.y + dy * c - dz * s, Sc.z + dy * s + dz * c);
    J1 = El;
    J2 = Wr;
    void Sh;
  } else {
    A = pts[0];
    J1 = pts[1];
    J2 = pts[2];
  }
  const R0 = front ? pts[1] : pts[0];
  const l1 = Math.hypot(J1.y - R0.y, J1.z - R0.z);
  const l2 = Math.hypot(J2.y - J1.y, J2.z - J1.z);
  let dy = E.y - A.y;
  let dz = E.z - A.z;
  const d0 = Math.hypot(dy, dz);
  const d = clamp(d0, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
  dy *= d / d0;
  dz *= d / d0;
  const tht = ang2(dy, dz);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const th1 = front ? tht - al : tht + al;
  const ey = A.y + l1 * Math.cos(th1);
  const ez = A.z + l1 * Math.sin(th1);
  const th2 = ang2(A.y + dy - ey, A.z + dz - ez);
  const r1 = ang2(J1.y - R0.y, J1.z - R0.z);
  const r2 = ang2(J2.y - J1.y, J2.z - J1.z);
  const D3 = front ? [pts[3], pts[4]] : [pts[2], pts[3]];
  const r3 = ang2(D3[1].y - D3[0].y, D3[1].z - D3[0].z);
  const th3 = ang2(-up.y, -up.z);
  const th4 = ang2(fw.y, fw.z);
  const r4 = ang2(0, -1);
  const d1 = wrap(th1 - r1);
  const d2 = wrap(th2 - r2);
  const d3 = wrap(th3 - r3);
  const d4 = wrap(th4 - r4);
  if (front) {
    local[b0] = spreadQ.clone().multiply(QA(X_AX, th0));
    local[b0 + 1] = QA(X_AX, d1 - th0);
    local[b0 + 2] = QA(X_AX, d2 - d1);
    local[b0 + 3] = QA(X_AX, d3 - d2);
    local[b0 + 4] = QA(X_AX, d4 - d3);
  } else {
    local[b0] = spreadQ.clone().multiply(QA(X_AX, d1));
    local[b0 + 1] = QA(X_AX, d2 - d1);
    local[b0 + 2] = QA(X_AX, d3 - d2);
    local[b0 + 3] = QA(X_AX, d4 - d3);
  }
};

const solveSpec = (S: Static, sp: Spec): Solved => {
  const local: THREE.Quaternion[] = Array.from({ length: NB }, () => new THREE.Quaternion());
  for (let i = 0; i < 7; i++) local[i + 1] = sp.spine[i].clone();
  const X: Xf[] = new Array(NB);
  fkSpine(S, sp.rootPos, sp.rootRot, local, X, 8);
  for (let li = 0; li < 4; li++) solveLeg(S, li, sp.legs[li], X, local);
  return { local, rootPos: sp.rootPos, rootRot: sp.rootRot, tail: sp.tail, earFlip: sp.earFlip, earLift: sp.earLift, earSwing: sp.earSwing, blink: sp.blink, breathe: sp.breathe, breathRate: sp.breathRate, sink: sp.sink };
};
const blendSolved = (a: Solved, b: Solved, k: number): Solved => {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const L = (x: number, y: number) => lerp(x, y, k);
  return {
    local: a.local.map((q, i) => q.clone().slerp(b.local[i], k)),
    rootPos: a.rootPos.clone().lerp(b.rootPos, k),
    rootRot: a.rootRot.clone().slerp(b.rootRot, k),
    tail: { up: L(a.tail.up, b.tail.up), side: L(a.tail.side, b.tail.side), curl: L(a.tail.curl, b.tail.curl), sideCurl: L(a.tail.sideCurl, b.tail.sideCurl), droop: L(a.tail.droop, b.tail.droop) },
    earFlip: [L(a.earFlip[0], b.earFlip[0]), L(a.earFlip[1], b.earFlip[1])],
    earLift: [L(a.earLift[0], b.earLift[0]), L(a.earLift[1], b.earLift[1])],
    earSwing: L(a.earSwing, b.earSwing),
    blink: L(a.blink, b.blink),
    breathe: L(a.breathe, b.breathe),
    breathRate: L(a.breathRate, b.breathRate),
    sink: L(a.sink, b.sink),
  };
};

const autoBlink = (t: number) => {
  const ph = frac((t + 0.7) / 3.7);
  return ph < 0.05 ? Math.sin((Math.PI * ph) / 0.05) : 0;
};

/** The pose's spec: root, spine, legs, tail, ears, lids. */
const specFor = (S: Static, kind: BeaglePoseKind, P: BeaglePose): Spec => {
  const J = S.J;
  const s = S.v.s;
  const pup = S.v.pup;
  const t = P.t ?? 0;
  const pv = J.pivots;
  const turn = P.headTurn ?? 0;
  const tilt = P.headTilt ?? 0;
  const nod = P.headNod ?? 0;
  const wag = P.wag ?? 0;
  const flipK = P.earFlip ?? 0;
  const flipSide = P.earFlipSide ?? 1;
  const earFlip: [number, number] = flipSide < 0 ? [flipK, 0] : [0, flipK];
  const restLeg = (li: number, dy = 0, dz = 0, upPitch = 0, pawPitch = 0): LegSpec => {
    const L = J.legs[li];
    const paw = L.pts[L.pts.length - 1].clone().add(V(0, dy, dz));
    return { ik: { paw, up: S.restUp[li].clone().applyAxisAngle(X_AX, upPitch), fwd: V(0, 0, -1).applyAxisAngle(X_AX, pawPitch) }, spread: 0 };
  };
  const awakeBlink = P.blink ?? autoBlink(t);
  const base: Spec = {
    rootPos: pv[0].clone(),
    rootRot: new THREE.Quaternion(),
    spine: [Q(), Q(), Q(), Q(), Q(-0.04), Q(0, turn * 0.4, tilt * 0.3), Q(0.1 + nod, turn * 0.6, tilt * 0.7)],
    legs: [0, 1, 2, 3].map((li) => restLeg(li)),
    tail: { up: 0.8, side: 0.25 * wag * Math.sin(t * 15), curl: 1.25, sideCurl: 0, droop: 0.04 },
    earFlip,
    earLift: [0, 0],
    earSwing: 0,
    blink: awakeBlink,
    breathe: P.breathe ?? 1,
    breathRate: lerp(0.85, 1.25, pup),
    sink: 0.003 * s,
  };
  if (kind === "stand") return base;
  if (kind === "trot") {
    const ph = P.phase ?? t * 1.8;
    const D = 0.5;
    const sweep = J.stride * D;
    const lift = [0.05, 0.05, 0.038, 0.038].map((x) => x * s * lerp(1, 0.9, pup));
    const offs = [0, 0.5, 0.52, 0.02];
    const legs = [0, 1, 2, 3].map((li) => {
      const front = li < 2;
      const p = frac(ph + offs[li]);
      let dz: number;
      let dy = 0;
      let a: number;
      let pa = 0;
      const zc = front ? -0.012 * s : 0.0;
      if (p < D) {
        const u = p / D;
        dz = zc - sweep / 2 + sweep * u;
        a = front ? lerp(0.22, -0.5, u) : lerp(0.15, -0.45, u);
      } else {
        const u = (p - D) / (1 - D);
        const e = u * u * (3 - 2 * u);
        dz = zc + sweep / 2 - sweep * e;
        dy = lift[li] * Math.sin(Math.PI * u) ** (front ? 0.85 : 1.1);
        const bump = Math.sin(Math.PI * Math.min(1, u * 1.15));
        a = front ? lerp(-0.5, 0.22, u) - 1.25 * bump : lerp(-0.45, 0.15, u) + 0.45 * bump;
        pa = front ? -1.1 * bump : -0.5 * bump;
      }
      return restLeg(li, dy, dz, a, pa);
    });
    const bob = 0.009 * s;
    const c2 = Math.cos(4 * Math.PI * (ph - D / 2));
    const s1 = Math.sin(2 * Math.PI * (ph - D / 2));
    return {
      ...base,
      rootPos: pv[0].clone().add(V(0, -0.006 * s - bob * (0.5 + 0.5 * c2), 0)),
      rootRot: Q(0.012 * Math.sin(4 * Math.PI * ph), 0.025 * s1, 0.03 * s1),
      spine: [Q(0, -0.012 * s1), Q(0, -0.012 * s1), Q(0, 0.01 * s1), Q(-0.01), Q(-0.1 + 0.02 * c2), Q(0.02, turn * 0.4 - 0.02 * s1, tilt * 0.3), Q(0.2 + nod - 0.03 * c2, turn * 0.6, tilt * 0.7 - 0.02 * s1)],
      legs,
      tail: { up: 0.85, side: 0.22 * Math.sin(2 * Math.PI * ph) + 0.3 * wag * Math.sin(t * 15), curl: 1.3, sideCurl: 0, droop: 0.03 },
      earLift: [0.22 * Math.sin(4 * Math.PI * (ph - D / 2) + 1.3) + 0.1, 0.22 * Math.sin(4 * Math.PI * (ph - D / 2) + 1.3) + 0.1].map((x) => x * lerp(1, 1.3, pup)) as [number, number],
      earSwing: -0.25,
    };
  }
  if (kind === "lie") {
    const h = P.headUp ?? 0;
    const drop = J.chestBottom + 0.004 * s;
    const rootPos = pv[0].clone().add(V(0, -drop, 0));
    const rootRot = Q(0.03);
    const spine = [Q(-0.03), Q(-0.02), Q(0), Q(0.02), Q(lerp(-0.42, 0.06, h)), Q(lerp(-0.46, -0.06, h), turn * 0.4, tilt * 0.3), Q(lerp(0.6, 0.14, h) + nod, turn * 0.6, tilt * 0.7)];
    const X: Xf[] = new Array(NB);
    const loc = Array.from({ length: NB }, () => new THREE.Quaternion());
    for (let i = 0; i < 7; i++) loc[i + 1] = spine[i];
    fkSpine(S, rootPos, rootRot, loc, X, 8);
    const legs: LegSpec[] = [0, 1, 2, 3].map((li) => {
      const sd = LEG_SIDE[li];
      const Lj = J.legs[li];
      if (li < 2) {
        const sh = xfApply(X[4], Lj.pts[1]);
        const wr = V(sh.x + sd * 0.012 * s, 0.02 * s * S.v.legGirth, sh.z - 0.018 * s);
        const up = V(0, 0.18, 1).normalize();
        const paw = wr.clone().addScaledVector(up, -Lj.pts[3].distanceTo(Lj.pts[4]));
        return { ik: { paw, up, fwd: V(0, -0.12, -1).normalize() }, spread: 0.1 };
      }
      const hp = xfApply(X[0], Lj.pts[0]);
      const hk = V(hp.x + sd * 0.04 * s, 0.017 * s * S.v.legGirth, hp.z + 0.05 * s);
      const up = V(0, 0.16, 1).normalize();
      const paw = hk.clone().addScaledVector(up, -Lj.pts[2].distanceTo(Lj.pts[3]));
      return { ik: { paw, up, fwd: V(0, -0.15, -1).normalize() }, spread: 0.32 };
    });
    return {
      ...base,
      rootPos,
      rootRot,
      spine,
      legs,
      tail: { up: -0.1, side: 0.3 + 0.3 * wag * Math.sin(t * 12), curl: 0, sideCurl: 1.2, droop: 1 },
      blink: P.blink ?? Math.max(awakeBlink, lerp(0.3, 0, h)),
      breathRate: lerp(0.7, 1.0, pup),
      sink: 0.009 * s,
    };
  }
  if (kind === "flop") {
    const f = P.faceUp ?? 0.5;
    const roll = 1.42;
    return {
      ...base,
      rootPos: pv[0].clone().add(V(0, -pv[0].y + 0.08 * s, 0)),
      rootRot: Q(0, 0, roll),
      spine: [Q(0.03), Q(0.03), Q(0.02), Q(0.02), Q(0.12), Q(0.08, turn * 0.4, -0.35 * f + tilt * 0.3), Q(-0.12 + nod, turn * 0.6, -0.85 * f + tilt * 0.7)],
      legs: [
        { fk: [0.05, 0.22, -0.05, 0.1, 0.3], spread: 0.05 },
        { fk: [0.15, 1.1, 0.4, -0.5, -0.2], spread: -0.45 },
        { fk: [-0.62, 0.38, -0.12, 0.3], spread: 0.05 },
        { fk: [0.28, -0.5, 0.45, 0.2], spread: -0.58 },
      ],
      tail: { up: 0.05, side: -0.1, curl: 0, sideCurl: 0.35, droop: 1 },
      earLift: [0, 0],
      blink: P.blink ?? 0.55,
      breathRate: lerp(0.55, 0.85, pup),
      sink: 0.01 * s,
    };
  }
  // curl: rolled onto its left side, the spine bent round in the floor's plane, legs tucked, nose to tail
  const rho = 1.15;
  const axis = V(Math.sin(rho), Math.cos(rho), 0).normalize();
  // the bend round in the floor's plane, plus a flex that straightens the neck's natural rise into line
  const bends = [0.42, 0.5, 0.52, 0.52, 0.52, 0.45, 0.3];
  const flex = [0, 0, 0, -0.25, -0.5, -0.3, 0.45];
  const spine = bends.map((b, i) => QA(axis, -b).multiply(Q(flex[i])));
  spine[6] = spine[6].clone().multiply(Q(nod, turn * 0.5, -0.55 + tilt));
  return {
    ...base,
    rootPos: pv[0].clone().add(V(0, -pv[0].y + 0.09 * s, 0)),
    rootRot: Q(0, 0, rho),
    spine,
    legs: [
      { fk: [0.1, 0.65, 1.55, -1.0, -0.3], spread: 0.0 },
      { fk: [0.05, 0.25, 2.1, -1.3, -0.3], spread: -0.95 },
      { fk: [1.05, -1.55, 1.3, 0.3], spread: 0.05 },
      { fk: [1.15, -1.65, 1.35, 0.3], spread: -0.1 },
    ],
    tail: { up: 0.0, side: 1.0, curl: 0, sideCurl: 3.2, droop: 1 },
    earLift: [0, 0],
    blink: P.blink ?? 1,
    breathRate: lerp(0.5, 0.75, pup),
    sink: 0.011 * s,
  };
};

// ============================================================================================ instance
type Inst = {
  body: THREE.BufferGeometry;
  pos: Float32Array;
  ears: THREE.BufferGeometry[];
  earPos: Float32Array[];
  tail: THREE.BufferGeometry;
  tailPos: Float32Array;
  lids: THREE.BufferGeometry[][];
  hash: { cell: number; x0: number; y0: number; z0: number; nx: number; ny: number; nz: number; start: Int32Array; items: Int32Array } | null;
};
const makeInst = (S: Static): Inst => {
  const body = new THREE.BufferGeometry();
  const pos = new Float32Array(S.rest);
  body.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  body.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(S.restN), 3).setUsage(THREE.DynamicDrawUsage));
  body.setAttribute("color", S.attrs.color);
  body.setAttribute("uv", S.attrs.uv);
  body.setAttribute("restPos", S.attrs.restPos);
  body.setAttribute("restNrm", S.attrs.restNrm);
  body.setIndex(S.attrs.index);
  for (const [st, ct, g] of S.groups) body.addGroup(st, ct, g);
  const nEar = 2 * EAR_N * EAR_M + 2 * (2 * (EAR_N - 1) + 2 * (EAR_M - 1));
  const ears: THREE.BufferGeometry[] = [];
  const earPos: Float32Array[] = [];
  for (let e = 0; e < 2; e++) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(nEar * 3);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", S.earUv);
    g.setAttribute("color", S.earColor);
    g.setIndex(S.earIndex);
    for (const [st, ct, gi] of S.earGroups) g.addGroup(st, ct, gi);
    ears.push(g);
    earPos.push(p);
  }
  const tail = new THREE.BufferGeometry();
  const tailPos = new Float32Array((TAIL_N * (TAIL_R + 1) + 1) * 3);
  tail.setAttribute("position", new THREE.BufferAttribute(tailPos, 3).setUsage(THREE.DynamicDrawUsage));
  tail.setAttribute("uv", S.tailUv);
  tail.setAttribute("color", S.tailColor);
  tail.setIndex(S.tailIndex);
  const lids = [0, 1].map(() => [0, 1].map(() => new THREE.BufferGeometry()));
  return { body, pos, ears, earPos, tail, tailPos, lids, hash: null };
};

/** dual-quaternion skinning of every body vertex, then breathing */
const skin = (S: Static, inst: Inst, X: Xf[], breath: number) => {
  const dq = new Float32Array(NB * 8);
  for (let b = 0; b < NB; b++) {
    const q = X[b].q;
    const t = X[b].t;
    const o = b * 8;
    dq[o] = q.x;
    dq[o + 1] = q.y;
    dq[o + 2] = q.z;
    dq[o + 3] = q.w;
    dq[o + 4] = 0.5 * (t.x * q.w + t.y * q.z - t.z * q.y);
    dq[o + 5] = 0.5 * (-t.x * q.z + t.y * q.w + t.z * q.x);
    dq[o + 6] = 0.5 * (t.x * q.y - t.y * q.x + t.z * q.w);
    dq[o + 7] = 0.5 * (-t.x * q.x - t.y * q.y - t.z * q.z);
  }
  const { rest, restN, bi, bw, breathe } = S;
  const out = inst.pos;
  for (let v = 0; v < S.nAll; v++) {
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let rw = 0;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let dw = 0;
    const b0 = bi[v * 4] * 8;
    for (let k = 0; k < 4; k++) {
      const w0 = bw[v * 4 + k];
      if (w0 <= 0) continue;
      const o = bi[v * 4 + k] * 8;
      const w = dq[o] * dq[b0] + dq[o + 1] * dq[b0 + 1] + dq[o + 2] * dq[b0 + 2] + dq[o + 3] * dq[b0 + 3] < 0 ? -w0 : w0;
      rx += w * dq[o];
      ry += w * dq[o + 1];
      rz += w * dq[o + 2];
      rw += w * dq[o + 3];
      dx += w * dq[o + 4];
      dy += w * dq[o + 5];
      dz += w * dq[o + 6];
      dw += w * dq[o + 7];
    }
    const il = 1 / Math.hypot(rx, ry, rz, rw);
    rx *= il;
    ry *= il;
    rz *= il;
    rw *= il;
    dx *= il;
    dy *= il;
    dz *= il;
    dw *= il;
    // translation = 2 * d * conj(r)
    const tx = 2 * (-dw * rx + dx * rw - dy * rz + dz * ry);
    const ty = 2 * (-dw * ry + dx * rz + dy * rw - dz * rx);
    const tz = 2 * (-dw * rz - dx * ry + dy * rx + dz * rw);
    // rotate the rest point and normal
    let px = rest[v * 3];
    let py = rest[v * 3 + 1];
    let pz = rest[v * 3 + 2];
    const b = breathe[v] * breath;
    if (b !== 0) {
      px += restN[v * 3] * b;
      py += restN[v * 3 + 1] * b;
      pz += restN[v * 3 + 2] * b;
    }
    const cx = ry * pz - rz * py + rw * px;
    const cy = rz * px - rx * pz + rw * py;
    const cz = rx * py - ry * px + rw * pz;
    out[v * 3] = px + 2 * (ry * cz - rz * cy) + tx;
    out[v * 3 + 1] = py + 2 * (rz * cx - rx * cz) + ty;
    out[v * 3 + 2] = pz + 2 * (rx * cy - ry * cx) + tz;
  }
};

const bedGround = (x: number, z: number) => {
  // PuppyBed's dished cushion (top PUPPY_BED.cushionTop, 12 mm dip in the middle) and its bolster ring
  // (R 0.19, tube r 0.06 squashed 0.85, on a 22 mm base), as a height field about its centre
  const r = Math.hypot(x, z);
  const top = PUPPY_BED.cushionTop;
  const rc = 0.104;
  if (r < rc) return top - 0.012 + 0.012 * Math.sin((r / rc) * (Math.PI / 2));
  const R = 0.19;
  const tr = 0.06;
  const bol = Math.abs(r - R) < tr ? 0.022 + tr * 0.85 + 0.85 * Math.sqrt(tr * tr - (r - R) ** 2) - tr * 0.85 : 0;
  return Math.max(top, bol);
};

/** soft floor: below h0 above the ground a point is eased up so nothing goes through it */
const softClamp = (y: number, g: number, h0: number, eps: number) => {
  const d = y - g;
  if (d >= h0) return y;
  return g + eps + (h0 - eps) * Math.exp((d - h0) / (h0 - eps));
};

const buildHash = (inst: Inst, n: number, cell: number) => {
  const p = inst.pos;
  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, p[i * 3]);
    x1 = Math.max(x1, p[i * 3]);
    y0 = Math.min(y0, p[i * 3 + 1]);
    y1 = Math.max(y1, p[i * 3 + 1]);
    z0 = Math.min(z0, p[i * 3 + 2]);
    z1 = Math.max(z1, p[i * 3 + 2]);
  }
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const cid = new Int32Array(n);
  const start = new Int32Array(nx * ny * nz + 1);
  for (let i = 0; i < n; i++) {
    const c = ((p[i * 3] - x0) / cell | 0) + nx * (((p[i * 3 + 1] - y0) / cell | 0) + ny * ((p[i * 3 + 2] - z0) / cell | 0));
    cid[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < nx * ny * nz; c++) start[c + 1] += start[c];
  const fill = start.slice(0, nx * ny * nz);
  const items = new Int32Array(n);
  for (let i = 0; i < n; i++) items[fill[cid[i]]++] = i;
  inst.hash = { cell, x0, y0, z0, nx, ny, nz, start, items };
};
/** push a point out of the (deformed) body to `margin` along the nearest vertex's normal; returns the normal
 * used (or null). Head vertices can be skipped (the ears use the head's exact SDF instead). */
const pushOut = (S: Static, inst: Inst, nrm: Float32Array, p: THREE.Vector3, margin: number, skipHead: boolean, outN?: THREE.Vector3) => {
  const H = inst.hash;
  if (!H) return false;
  const ci = Math.floor((p.x - H.x0) / H.cell);
  const cj = Math.floor((p.y - H.y0) / H.cell);
  const ck = Math.floor((p.z - H.z0) / H.cell);
  let best = -1;
  let bd = 1e9;
  const pp = inst.pos;
  for (let k = ck - 1; k <= ck + 1; k++) {
    if (k < 0 || k >= H.nz) continue;
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (j < 0 || j >= H.ny) continue;
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || i >= H.nx) continue;
        const c = i + H.nx * (j + H.ny * k);
        for (let q = H.start[c]; q < H.start[c + 1]; q++) {
          const vi = H.items[q];
          if (skipHead && S.headMask[vi]) continue;
          const dx = p.x - pp[vi * 3];
          const dy = p.y - pp[vi * 3 + 1];
          const dz = p.z - pp[vi * 3 + 2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            best = vi;
          }
        }
      }
    }
  }
  if (best < 0) return false;
  const nx = nrm[best * 3];
  const ny = nrm[best * 3 + 1];
  const nz = nrm[best * 3 + 2];
  const sd = (p.x - pp[best * 3]) * nx + (p.y - pp[best * 3 + 1]) * ny + (p.z - pp[best * 3 + 2]) * nz;
  if (sd >= margin) return false;
  p.x += nx * (margin - sd);
  p.y += ny * (margin - sd);
  p.z += nz * (margin - sd);
  if (outN) outN.set(nx, ny, nz);
  return true;
};

type Frame = { X: Xf[]; ground: (x: number, z: number) => number; s: number };

/** the head's exact SDF in group space: push a point out to `margin`; returns the outward normal or null */
const pushHead = (S: Static, F: Frame, p: THREE.Vector3, margin: number, outN: THREE.Vector3) => {
  const Xh = F.X[HEAD];
  const r = xfInv(Xh, p);
  const d = sdfAt(S.headPrims, r.x, r.y, r.z);
  if (d >= margin) return false;
  const g = gradAt(S.headPrims, r.x, r.y, r.z, 0.0006 * F.s, V()).normalize();
  r.addScaledVector(g, margin - d);
  xfApply(Xh, r, p);
  outN.copy(g).applyQuaternion(Xh.q);
  return true;
};

/** Hang, drape and build one ear for the frame. */
const solveEar = (S: Static, inst: Inst, F: Frame, e: number, flip: number, lift: number, swing: number) => {
  const E = S.J.ears[e];
  const sd = e === 0 ? -1 : 1;
  const Xh = F.X[HEAD];
  const nrmB = inst.body.attributes.normal.array as Float32Array;
  // the root direction: hanging, then lifted / flipped back over the skull about the head's long axis
  const fwdR = V(0, 0, -1);
  const flipQ = QA(X_AX, flip * 0.55).multiply(QA(fwdR, -sd * (flip * 3.2 + lift)));
  const swingQ = QA(X_AX, swing);
  const d0 = E.dir.clone().applyQuaternion(flipQ).applyQuaternion(swingQ).applyQuaternion(Xh.q).normalize();
  const n0 = E.nrm.clone().applyQuaternion(flipQ).applyQuaternion(swingQ).applyQuaternion(Xh.q).normalize();
  const fwdW = fwdR.clone().applyQuaternion(Xh.q);
  const p0 = xfApply(Xh, E.root);
  const N = EAR_N;
  const l = E.len / (N - 1);
  const pts: THREE.Vector3[] = [p0.clone()];
  let dir = d0.clone();
  const down = V(0, -1, 0);
  const backW = V(0, 0, 1).applyQuaternion(Xh.q);
  /** turn a direction toward the floor by at most `a` (tipping backward if it points straight up) */
  const tip = (d: THREE.Vector3, a: number) => {
    const ang = d.angleTo(down);
    if (ang < 1e-4) return d;
    const axis = d.clone().cross(down);
    if (axis.lengthSq() < 1e-6) axis.copy(d).cross(backW);
    return d.clone().applyAxisAngle(axis.normalize(), Math.min(ang, a));
  };
  for (let i = 1; i < N; i++) {
    if (i >= 2) dir = tip(dir, 0.1 + 0.32 * (i / N));
    pts.push(pts[i - 1].clone().addScaledVector(dir, l));
  }
  const m = E.th * 0.5 + 0.0009 * F.s;
  const cn: (THREE.Vector3 | null)[] = new Array(N).fill(null);
  const tmpN = V();
  const collide = (q: THREE.Vector3, i: number) => {
    let hit: THREE.Vector3 | null = null;
    if (pushHead(S, F, q, m, tmpN)) hit = tmpN.clone();
    const g = F.ground(q.x, q.z);
    if (q.y < g + m) {
      q.y = g + m;
      hit = V(0, 1, 0);
    }
    if (pushOut(S, inst, nrmB, q, m, true, tmpN)) hit = tmpN.clone();
    if (hit) cn[i] = hit;
  };
  for (let it = 0; it < 6; it++) {
    for (let i = 2; i < N; i++) pts[i].addScaledVector(down, l * 0.22).addScaledVector(backW, l * 0.04);
    for (let i = 1; i < N; i++) collide(pts[i], i);
    // follow the leader, with a stiff root
    const d1 = pts[1].clone().sub(pts[0]).normalize().lerp(d0, 0.75).normalize();
    pts[1].copy(pts[0]).addScaledVector(d1, l);
    for (let i = 2; i < N; i++) {
      const dd = pts[i].clone().sub(pts[i - 1]);
      if (i === 2) dd.normalize().lerp(pts[1].clone().sub(pts[0]).normalize(), 0.35);
      pts[i].copy(pts[i - 1]).addScaledVector(dd.normalize(), l);
    }
  }
  cn.fill(null);
  for (let i = 1; i < N; i++) collide(pts[i], i);
  // frames: tangent; the face normal transported down the ear and laid onto whatever it rests on
  const T: THREE.Vector3[] = [];
  const Nn: THREE.Vector3[] = [];
  const Bn: THREE.Vector3[] = [];
  let nPrev = n0.clone();
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N - 1, i + 1)];
    const tg = b.clone().sub(a).normalize();
    let n = nPrev.clone().addScaledVector(tg, -nPrev.dot(tg));
    if (cn[i]) {
      const c = cn[i]!.clone();
      if (c.dot(n) < 0) c.negate();
      n.lerp(c, 0.65);
    }
    n = n.addScaledVector(tg, -n.dot(tg)).normalize();
    nPrev = n;
    T.push(tg);
    Nn.push(n);
    let bn = tg.clone().cross(n).normalize();
    if (i === 0 && bn.dot(fwdW) < 0) bn.negate();
    if (i > 0 && bn.dot(Bn[i - 1]) < 0) bn.negate();
    Bn.push(bn);
  }
  // the flap grid: a rounded leaf. Each column runs to its own length (shorter toward the edges) so the tip
  // is round; the width grows from the root fold and eases in toward the end; the edges cup toward the head
  const M = EAR_M;
  const at = (arr: THREE.Vector3[], sv: number) => {
    const f = clamp(sv, 0, 1) * (N - 1);
    const i0 = Math.min(N - 2, Math.floor(f));
    return arr[i0].clone().lerp(arr[i0 + 1], f - i0);
  };
  const mid: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const sv0 = i / (N - 1);
    for (let j = 0; j < M; j++) {
      const u = -1 + (2 * j) / (M - 1);
      const sv = sv0 * (1 - 0.24 * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
      const w = E.wid * (0.55 + 0.45 * Math.sin((Math.PI / 2) * Math.min(1, sv / 0.6))) * (1 - 0.22 * sstep(0.7, 1, sv));
      const b = at(Bn, sv).normalize();
      const n = at(Nn, sv).normalize();
      const q = at(pts, sv).addScaledVector(b, (u * w) / 2 + w * 0.06).addScaledVector(n, -E.cup * (1 - 0.55 * sv) * u * u);
      if (i >= 1) collide(q, i);
      mid.push(q);
    }
  }
  const out = inst.earPos[e];
  const NM = N * M;
  const nAt = V();
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const a = mid[Math.min(N - 1, i + 1) * M + j].clone().sub(mid[Math.max(0, i - 1) * M + j]);
      const b = mid[i * M + Math.min(M - 1, j + 1)].clone().sub(mid[i * M + Math.max(0, j - 1)]);
      nAt.copy(b).cross(a).normalize();
      if (nAt.dot(Nn[i]) < 0) nAt.negate();
      const sv = i / (N - 1);
      const u = -1 + (2 * j) / (M - 1);
      const th = E.th * (1 - 0.4 * sv) * (1 - 0.55 * u ** 4);
      const q = mid[i * M + j];
      const k = (i * M + j) * 3;
      out[k] = q.x + nAt.x * th * 0.5;
      out[k + 1] = q.y + nAt.y * th * 0.5;
      out[k + 2] = q.z + nAt.z * th * 0.5;
      out[NM * 3 + k] = q.x - nAt.x * th * 0.5;
      out[NM * 3 + k + 1] = q.y - nAt.y * th * 0.5;
      out[NM * 3 + k + 2] = q.z - nAt.z * th * 0.5;
    }
  // the rim copies
  const perim: [number, number][] = [];
  for (let i = 0; i < N; i++) perim.push([i, 0]);
  for (let j = 1; j < M; j++) perim.push([N - 1, j]);
  for (let i = N - 2; i >= 0; i--) perim.push([i, M - 1]);
  for (let j = M - 2; j >= 1; j--) perim.push([0, j]);
  perim.forEach(([i, j], k) => {
    const src = (i * M + j) * 3;
    const o = (2 * NM + k * 2) * 3;
    for (let c = 0; c < 3; c++) {
      out[o + c] = out[src + c];
      out[o + 3 + c] = out[NM * 3 + src + c];
    }
  });
  const g = inst.ears[e];
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
};

/** The tail: a tapered tube on a chain from the croup, lifted / wagged / curled, drooped onto the floor. */
const solveTail = (S: Static, inst: Inst, F: Frame, tl: TailSpec, t: number) => {
  const J = S.J;
  const Xp = F.X[PEL];
  const N = TAIL_N;
  const l = J.tail.len / (N - 1);
  const nrmB = inst.body.attributes.normal.array as Float32Array;
  // the base direction in the pelvis' frame; the bends then happen in the world (so a lying dog's tail curves
  // along the floor): the curl about the horizontal axis across the tail (lifting it forward over the back),
  // the side curl about the vertical, gravity accumulated segment by segment
  let d = V(0, Math.sin(tl.up), Math.cos(tl.up)).applyQuaternion(Xp.q).applyAxisAngle(UP, tl.side).normalize();
  const pts: THREE.Vector3[] = [xfApply(Xp, J.tailRoot)];
  const sway = 0.04 * Math.sin(t * 1.3);
  const down = V(0, -1, 0);
  const latP = X_AX.clone().applyQuaternion(Xp.q);
  for (let i = 1; i < N; i++) {
    const lat = d.clone().cross(UP);
    if (lat.lengthSq() < 1e-4) lat.copy(latP).negate();
    lat.normalize();
    d.applyAxisAngle(lat, tl.curl / (N - 1)).applyAxisAngle(UP, (tl.sideCurl + sway) / (N - 1)).normalize();
    const k = tl.droop * (0.12 + 0.3 * (i / N));
    d.multiplyScalar(1 - k).addScaledVector(down, k).normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, l));
  }
  const radius = (sv: number) => lerp(J.tail.r0, J.tail.r1, sv ** 0.85) * (sv > 0.88 ? Math.sqrt(1 - 0.75 * ((sv - 0.88) / 0.12) ** 2) : 1);
  for (let it = 0; it < 4; it++) {
    for (let i = 2; i < N; i++) {
      const q = pts[i];
      const m = radius(i / (N - 1)) + 0.0012 * F.s;
      const g = F.ground(q.x, q.z);
      if (q.y < g + m) q.y = g + m;
      pushOut(S, inst, nrmB, q, m, false);
    }
    for (let i = 2; i < N; i++) {
      const dd = pts[i].clone().sub(pts[i - 1]).normalize();
      pts[i].copy(pts[i - 1]).addScaledVector(dd, l);
    }
  }
  for (let i = 2; i < N; i++) {
    const q = pts[i];
    const m = radius(i / (N - 1)) + 0.0012 * F.s;
    const g = F.ground(q.x, q.z);
    if (q.y < g + m) q.y = g + m;
  }
  // rings, with the "top" kept toward the pelvis' up
  const out = inst.tailPos;
  const upP = UP.clone().applyQuaternion(Xp.q);
  let prevN: THREE.Vector3 | null = null;
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N - 1, i + 1)];
    const tg = b.clone().sub(a).normalize();
    let nn: THREE.Vector3 = (prevN ?? upP).clone();
    nn.addScaledVector(tg, -nn.dot(tg));
    if (nn.lengthSq() < 1e-8) nn = V(1, 0, 0).addScaledVector(tg, -tg.x);
    nn.normalize();
    prevN = nn;
    const bn = tg.clone().cross(nn).normalize();
    const sv = i / (N - 1);
    const r = radius(sv);
    for (let k = 0; k <= TAIL_R; k++) {
      const ang = (k / TAIL_R) * Math.PI * 2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      // a fuller brush underneath
      const rr = r * (1 + 0.18 * Math.max(0, -c) * sstep(0.2, 0.6, sv));
      const o = (i * (TAIL_R + 1) + k) * 3;
      out[o] = pts[i].x + (nn.x * c + bn.x * sn) * rr;
      out[o + 1] = pts[i].y + (nn.y * c + bn.y * sn) * rr;
      out[o + 2] = pts[i].z + (nn.z * c + bn.z * sn) * rr;
    }
  }
  const last = pts[N - 1].clone().addScaledVector(pts[N - 1].clone().sub(pts[N - 2]).normalize(), radius(1) * 1.3);
  const o = N * (TAIL_R + 1) * 3;
  out[o] = last.x;
  out[o + 1] = last.y;
  out[o + 2] = last.z;
  inst.tail.attributes.position.needsUpdate = true;
  inst.tail.computeVertexNormals();
};

/** One eyelid band on a sphere about the eye (eye-local: -z the gaze): from its edge (elevation by azimuth)
 * round to well behind, as a thin solid with a dark margin. */
const lidGeo = (g: THREE.BufferGeometry, r: number, upper: boolean, edge: (a: number) => number) => {
  const NA = 16;
  const NE = 8;
  const A = (95 * Math.PI) / 180;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const lid = COL.lid;
  const fur = COL.tan;
  const shells = [r * 1.16, r * 1.03];
  for (let sh = 0; sh < 2; sh++)
    for (let i = 0; i <= NE; i++)
      for (let j = 0; j <= NA; j++) {
        const a = -A + (2 * A * j) / NA;
        const e0 = edge(a);
        const e1 = upper ? (118 * Math.PI) / 180 : (-118 * Math.PI) / 180;
        const k = i / NE;
        const e = lerp(e0, e1, k * k * 0.6 + k * 0.4);
        const R = shells[sh] * (i === 0 ? 0.985 : 1);
        pos.push(R * Math.sin(a) * Math.cos(e), R * Math.sin(e), -R * Math.cos(a) * Math.cos(e));
        col.push(...mix3(lid, fur, sstep(0.15, 1.1, i)));
      }
  const row = NA + 1;
  const off = (NE + 1) * row;
  for (let i = 0; i < NE; i++)
    for (let j = 0; j < NA; j++) {
      const a = i * row + j;
      const b = a + row;
      if (upper) idx.push(a, a + 1, b, a + 1, b + 1, b, off + a, off + b, off + a + 1, off + a + 1, off + b, off + b + 1);
      else idx.push(a, b, a + 1, a + 1, b, b + 1, off + a, off + a + 1, off + b, off + a + 1, off + b + 1, off + b);
    }
  // the margin strip joining the two shells along the edge
  for (let j = 0; j < NA; j++) {
    const a = j;
    const b = off + j;
    if (upper) idx.push(a, b, a + 1, a + 1, b, b + 1);
    else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
};

type Out = {
  eyes: { pos: THREE.Vector3; quat: THREE.Quaternion }[];
  tag: { pos: THREE.Vector3; quat: THREE.Quaternion };
  ring: { pos: THREE.Vector3; quat: THREE.Quaternion };
  blink: number;
};

const update = (S: Static, inst: Inst, props: BeagleProps): Out => {
  const { pose, at, yaw } = props;
  const s = S.v.s;
  const t = pose.t ?? 0;
  let sol = solveSpec(S, specFor(S, pose.kind, pose));
  if (pose.to && pose.mix !== undefined && pose.mix > 0) sol = blendSolved(sol, solveSpec(S, specFor(S, pose.to, pose)), clamp(pose.mix, 0, 1));
  const X: Xf[] = new Array(NB);
  fkSpine(S, sol.rootPos, sol.rootRot, sol.local, X);
  // breathing (the ribs and belly swell along their rest normals)
  const br = sol.breathe * 0.0024 * s * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * sol.breathRate));
  skin(S, inst, X, br);
  // the ground, in the group's frame
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const ground = props.inBed
    ? bedGround
    : props.ground
      ? (x: number, z: number) => props.ground!(at.x + cy * x + sy * z, at.z - sy * x + cy * z) - at.y
      : () => 0;
  const flat = !props.inBed && !props.ground;
  const p = inst.pos;
  const n = S.nAll;
  // in the bed: centre the footprint on the bed
  const off = V();
  if (props.inBed) {
    let mx = 0;
    let mz = 0;
    for (let i = 0; i < S.nFur; i++) {
      mx += p[i * 3];
      mz += p[i * 3 + 2];
    }
    off.set(-mx / S.nFur, 0, -mz / S.nFur);
  }
  // anchor the lowest point of the body (not the head) to the ground
  let lo = 1e9;
  for (let i = 0; i < S.nFur; i += 2) {
    if (S.headMask[i]) continue;
    const x = p[i * 3] + off.x;
    const z = p[i * 3 + 2] + off.z;
    lo = Math.min(lo, p[i * 3 + 1] - (flat ? 0 : ground(x, z)));
  }
  off.y = -sol.sink - lo;
  const h0 = 0.004 * s;
  const eps = 0.0004 * s;
  for (let i = 0; i < n; i++) {
    const x = (p[i * 3] += off.x);
    const z = (p[i * 3 + 2] += off.z);
    const y = p[i * 3 + 1] + off.y;
    p[i * 3 + 1] = softClamp(y, flat ? 0 : ground(x, z), h0, eps);
  }
  for (const x of X) x.t.add(off);
  const body = inst.body;
  body.attributes.position.needsUpdate = true;
  body.computeVertexNormals();
  body.attributes.normal.needsUpdate = true;
  buildHash(inst, n, 0.012 * s + 0.004);
  const F: Frame = { X, ground, s };
  // ears, tail
  for (let e = 0; e < 2; e++) solveEar(S, inst, F, e, sol.earFlip[e], sol.earLift[e], sol.earSwing);
  solveTail(S, inst, F, sol.tail, t);
  // eyes and lids
  const Xh = X[HEAD];
  const blink = clamp(sol.blink, 0, 1);
  const eyes = S.J.eyes.map((E, i) => {
    const z = E.gaze.clone().negate();
    const xA = UP.clone().cross(z).normalize();
    const yA = z.clone().cross(xA).normalize();
    const qE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, z));
    const deg = Math.PI / 180;
    // an almond opening: the lids meet at the corners; shut, the upper lid comes down over the lower
    const upE = (a: number) => lerp((27 + 5 * S.v.pup) * deg, -13 * deg, blink) - lerp((36 + 5 * S.v.pup) * deg, 2 * deg, blink) * (a / (95 * deg)) ** 2;
    const loE = (a: number) => lerp(-23 * deg, -11 * deg, blink) + lerp(14 * deg, 0, blink) * (a / (95 * deg)) ** 2;
    lidGeo(inst.lids[i][0], E.r, true, upE);
    lidGeo(inst.lids[i][1], E.r * 0.985, false, loE);
    return { pos: xfApply(Xh, E.c), quat: Xh.q.clone().multiply(qE) };
  });
  // the tag: from the bottom-front of the collar, lying flat on the fur, hanging toward the floor
  const tv = S.collarTagVert;
  const nrmB = body.attributes.normal.array as Float32Array;
  const ringAt = V(p[tv * 3], p[tv * 3 + 1], p[tv * 3 + 2]);
  const nr = V(nrmB[tv * 3], nrmB[tv * 3 + 1], nrmB[tv * 3 + 2]).normalize();
  let hang = V(0, -1, 0).addScaledVector(nr, -(-nr.y));
  if (hang.lengthSq() < 0.05) hang = S.J.collar.axis.clone().negate().applyQuaternion(X[5].q).addScaledVector(nr, 0);
  hang.addScaledVector(nr, -hang.dot(nr)).normalize();
  const ringR = 0.0042 * s;
  const tagR = 0.0105 * s * lerp(1, 1.25, S.v.pup);
  const ringC = ringAt.clone().addScaledVector(hang, ringR * 0.7).addScaledVector(nr, 0.0012 * s);
  const tagC = ringC.clone().addScaledVector(hang, ringR + tagR * 0.9).addScaledVector(nr, 0.0018 * s);
  for (let it = 0; it < 3; it++) {
    pushOut(S, inst, nrmB, tagC, 0.0016 * s, false);
    const g = ground(tagC.x, tagC.z);
    if (tagC.y < g + tagR + 0.001) tagC.y = g + tagR + 0.001;
  }
  const tz = nr.clone();
  const ty = tagC.clone().sub(ringC).normalize().negate();
  const tx = ty.clone().cross(tz).normalize();
  const tz2 = tx.clone().cross(ty).normalize();
  const tagQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tx, ty, tz2));
  const ringQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(nr.clone().cross(hang).normalize(), hang.clone().negate(), nr)).multiply(QA(UP, Math.PI / 2));
  return { eyes, tag: { pos: tagC, quat: tagQ }, ring: { pos: ringC, quat: ringQ }, blink };
};

// =========================================================================================== component
const bodyMats = (pup: boolean) => [furMat(pup ? "pup" : "adult", pup ? 26 : 20), padMat(), noseMat(), collarMat(), lipMat()];

/** Moose. Built at its feet facing -z; `at` is where its feet (or its bed) are, `yaw` turns it about y. */
export const Beagle: React.FC<BeagleProps> = (props) => {
  const puppy = !!props.puppy;
  const S = getStatic(puppy);
  const inst = useMemo(() => makeInst(S), [S]);
  const o = update(S, inst, props);
  const pup = S.v.pup;
  const glint = (props.glint ?? 1) * (1 - sstep(0.2, 0.6, o.blink));
  return (
    <group position={props.at} rotation={[0, props.yaw, 0]}>
      <mesh geometry={inst.body} material={bodyMats(puppy)} castShadow receiveShadow frustumCulled={false} />
      {inst.ears.map((g, i) => (
        <mesh key={`ear${i}`} geometry={g} material={earMats(pup)} castShadow receiveShadow frustumCulled={false} />
      ))}
      <mesh geometry={inst.tail} material={tailMat()} castShadow receiveShadow frustumCulled={false} />
      {o.eyes.map((e, i) => (
        <group key={`eye${i}`} position={e.pos} quaternion={e.quat}>
          <mesh geometry={S.eyeGeo} material={eyeMat()} />
          <mesh geometry={inst.lids[i][0]} material={lidMat(pup)} castShadow frustumCulled={false} />
          <mesh geometry={inst.lids[i][1]} material={lidMat(pup)} frustumCulled={false} />
          {glint > 0.01 ? (
            <mesh position={[-0.32 * S.J.eyes[i].r, 0.36 * S.J.eyes[i].r, -0.9 * S.J.eyes[i].r]} scale={S.J.eyes[i].r * 0.11 * glint} material={glintMat()}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          ) : null}
        </group>
      ))}
      <group position={o.ring.pos} quaternion={o.ring.quat}>
        <mesh geometry={S.ringGeo} material={brass()} castShadow />
      </group>
      <group position={o.tag.pos} quaternion={o.tag.quat}>
        <mesh geometry={S.tagGeo} material={brass()} castShadow />
      </group>
    </group>
  );
};

const boundsCache: Record<string, { x0: number; x1: number; z0: number; z1: number; top: number }> = {};
/** The space a pose takes up, in the dog's own frame (at its feet, facing -z; x + to its right), metres:
 * the extents of the body, ears and tail and the height of its highest point. Evaluated once per pose. */
export const beagleBounds = (kind: BeaglePoseKind, puppy = false, inBed = false) => {
  const key = `${kind}-${puppy}-${inBed}`;
  if (boundsCache[key]) return boundsCache[key];
  const S = getStatic(puppy);
  const inst = makeInst(S);
  update(S, inst, { at: V(), yaw: 0, pose: { kind, t: 0, phase: 0 }, puppy, inBed });
  const b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, top: -1e9 };
  const add = (a: Float32Array) => {
    for (let i = 0; i < a.length; i += 3) {
      b.x0 = Math.min(b.x0, a[i]);
      b.x1 = Math.max(b.x1, a[i]);
      b.top = Math.max(b.top, a[i + 1]);
      b.z0 = Math.min(b.z0, a[i + 2]);
      b.z1 = Math.max(b.z1, a[i + 2]);
    }
  };
  add(inst.pos);
  inst.earPos.forEach(add);
  add(inst.tailPos);
  return (boundsCache[key] = b);
};

/** Sizes and gait numbers for placing Moose. */
export const BEAGLE = {
  /** distance covered per trot stride (one full phase cycle), metres */
  stride: (puppy = false) => getStatic(puppy).J.stride,
  /** a natural trot cadence, strides per second (adult; the puppy's quicker) */
  cadence: (puppy = false) => (puppy ? 2.3 : 1.75),
  /** nose-to-rump length and withers height, metres (approximate) */
  length: (puppy = false) => (puppy ? 0.3 : 0.62),
  height: (puppy = false) => (puppy ? 0.2 : 0.36),
};
