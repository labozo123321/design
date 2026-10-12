import * as THREE from "three";
import { NFRAMES, NROW, frameAt, rowS, vAt } from "./track";

/**
 * Things that swing: computed once for the whole ride, frame by frame in order, so every frame of the
 * render agrees (Remotion renders frames in any order).
 *
 * In a row's frame (x right, y up, z back), what you feel is the specific force f = a - g (the seat
 * pushing you); loose things fall along -f, and the air streams back at the train's speed. The dangling
 * legs are damped pendulums from the knees; the pigtails and ponytails are chains of points (Verlet) hung
 * from the head, pulled by -f, dragged by the wind (with a little turbulence), kept off the head.
 */

const FPS = 30;
const G = 9.81;

/** The specific force on row r at a frame, in the row's frame (x right, y up, z back), in m/s^2. */
const feltCache: THREE.Vector3[][] = [];
export const feltLocal = (frame: number, r: number) => {
  if (!feltCache[r]) feltCache[r] = [];
  const f = Math.max(1, Math.min(NFRAMES - 2, Math.round(frame)));
  const hit = feltCache[r][f];
  if (hit) return hit;
  const dt = 1 / FPS;
  const p0 = frameAt(rowS(f - 1, r)).P;
  const fr = frameAt(rowS(f, r));
  const p2 = frameAt(rowS(f + 1, r)).P;
  const a = p0.clone().add(p2).addScaledVector(fr.P, -2).multiplyScalar(1 / (dt * dt));
  const spec = a.add(new THREE.Vector3(0, G, 0));
  const out = new THREE.Vector3(spec.dot(fr.R), spec.dot(fr.U), -spec.dot(fr.T));
  // the finite difference is noisy where the speed steps; clamp to what a coaster can do
  out.clampLength(0, 6 * G);
  feltCache[r][f] = out;
  return out;
};

/** Felt force, smoothed over a few frames (bodies and hair don't feel single-frame spikes). */
export const feltSmooth = (frame: number, r: number) => {
  const acc = new THREE.Vector3();
  let w = 0;
  for (let k = -3; k <= 3; k++) {
    const wk = Math.exp(-(k * k) / 4);
    acc.addScaledVector(feltLocal(frame + k, r), wk);
    w += wk;
  }
  return acc.multiplyScalar(1 / w);
};

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const tnoise = (t: number, hz: number, seed: number) => {
  const x = t * hz;
  const i = Math.floor(x);
  const k = x - i;
  const u = k * k * (3 - 2 * k);
  return hash(i + seed * 17.3) * (1 - u) + hash(i + 1 + seed * 17.3) * u - 0.5;
};

/* ------------------------------------------------------------------ */
/* Legs                                                                 */
/* ------------------------------------------------------------------ */

export type LegState = { knee: number; splay: number };
const legCache: Record<string, LegState[]> = {};

/**
 * The knee angle of a dangling leg over the whole ride (0 = shin straight down from the knee in the seat's
 * frame, + = swung forward). Driven by where -f points in the y-z plane, the wind, and damping.
 */
export const legSwing = (r: number, seed: number, len = 0.42): LegState[] => {
  const key = `${r}-${seed}-${len}`;
  if (legCache[key]) return legCache[key];
  const out: LegState[] = [];
  let a = 0.15;
  let w = 0;
  let b = 0;
  let wb = 0;
  const sub = 8;
  const dt = 1 / FPS / sub;
  for (let f = 0; f < NFRAMES; f++) {
    const fl = feltSmooth(f, r);
    const v = vAt(f);
    for (let k = 0; k < sub; k++) {
      // the pendulum's "down" is -f; the angle of -f in the y-z plane from straight down
      const gy = -fl.y;
      const gz = -fl.z;
      const gmag = Math.max(0.5, Math.hypot(gy, gz));
      const target = Math.atan2(-gz, -gy);
      // wind pushes the shin back (toward +z, i.e. a negative swing), more with speed
      const wind = 0.0035 * v * v * (1 + 0.3 * tnoise(f / FPS + k * dt, 3, seed));
      const torque = -(gmag / len) * Math.sin(a - target) * 1.0 - wind * Math.cos(a) / len - 3.2 * w;
      w += torque * dt;
      a += w * dt;
      // the knee stops it swinging past straight-ish forward or folding under the seat
      if (a > 1.25) {
        a = 1.25;
        w = Math.min(0, w);
      }
      if (a < -0.95) {
        a = -0.95;
        w = Math.max(0, w);
      }
      // a little sideways sway from the lateral force
      const tb = Math.atan2(-fl.x, gmag) * 0.6;
      wb += (-(gmag / len) * Math.sin(b - tb) - 2.6 * wb) * dt;
      b += wb * dt;
    }
    out.push({ knee: a, splay: Math.max(-0.4, Math.min(0.4, b)) });
  }
  legCache[key] = out;
  return out;
};

/* ------------------------------------------------------------------ */
/* Hair chains                                                          */
/* ------------------------------------------------------------------ */

export type ChainSpec = {
  /** the root in head space, and the direction the hair leaves the head (head space) */
  root: THREE.Vector3;
  out: THREE.Vector3;
  length: number;
  nodes: number;
  stiff: number;
  seed: number;
};

/** A head pose in the row frame at a frame: position and rotation. */
export type HeadPose = (frame: number) => { pos: THREE.Vector3; quat: THREE.Quaternion };

const chainCache: Record<string, THREE.Vector3[][]> = {};

/**
 * Simulates a chain over the whole ride; returns, per frame, its points in HEAD space (root first).
 * The head's own motion (turning, nodding) drags the root; -f, wind and drag do the rest.
 */
export const hairChain = (key: string, r: number, spec: ChainSpec, head: HeadPose): THREE.Vector3[][] => {
  if (chainCache[key]) return chainCache[key];
  const n = spec.nodes;
  const seg = spec.length / (n - 1);
  const sub = 12;
  const dt = 1 / FPS / sub;
  // initial: hanging straight down from the root
  const h0 = head(0);
  const rootW = () => spec.root.clone().applyQuaternion(h0.quat).add(h0.pos);
  const pts: THREE.Vector3[] = [];
  const prev: THREE.Vector3[] = [];
  const outW0 = spec.out.clone().applyQuaternion(h0.quat);
  for (let i = 0; i < n; i++) {
    const p = rootW().addScaledVector(outW0, seg * Math.min(i, 1)).add(new THREE.Vector3(0, -seg * Math.max(0, i - 1), 0));
    pts.push(p);
    prev.push(p.clone());
  }
  const result: THREE.Vector3[][] = [];
  const tmp = new THREE.Vector3();
  let hp = h0;
  for (let f = 0; f < NFRAMES; f++) {
    const fl = feltSmooth(f, r);
    const v = vAt(f);
    const hNext = head(f);
    for (let k = 0; k < sub; k++) {
      const u = (k + 1) / sub;
      const pos = hp.pos.clone().lerp(hNext.pos, u);
      const quat = hp.quat.clone().slerp(hNext.quat, u);
      const root = spec.root.clone().applyQuaternion(quat).add(pos);
      const outDir = spec.out.clone().applyQuaternion(quat);
      const t = f / FPS + u / FPS;
      // the air: streaming back past the train, gusting and swirling a little
      const air = new THREE.Vector3(
        v * 0.18 * tnoise(t, 2.3, spec.seed),
        v * 0.12 * tnoise(t, 1.7, spec.seed + 5),
        v * (1 + 0.15 * tnoise(t, 4.1, spec.seed + 9)),
      );
      for (let i = 1; i < n; i++) {
        const p = pts[i];
        const vel = tmp.copy(p).sub(prev[i]).multiplyScalar(1 / dt);
        const rel = air.clone().sub(vel);
        const drag = rel.multiplyScalar(0.11 * Math.min(25, rel.length()) * (0.6 + 0.4 * (i / n)) + 0.6);
        const acc = fl.clone().negate().add(drag);
        const next = p.clone().multiplyScalar(2).sub(prev[i]).addScaledVector(acc, dt * dt);
        // damping
        next.lerp(p, 0.012);
        prev[i].copy(p);
        p.copy(next);
      }
      pts[0].copy(root);
      prev[0].copy(root);
      // the first link leaves the head along its direction (the hair tie holds it)
      const want1 = root.clone().addScaledVector(outDir, seg);
      pts[1].lerp(want1, spec.stiff);
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < n; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const d = b.clone().sub(a);
          const L = d.length() || 1e-6;
          const corr = d.multiplyScalar((L - seg) / L);
          if (i === 1) b.sub(corr);
          else {
            a.addScaledVector(corr, 0.5);
            b.addScaledVector(corr, -0.5);
          }
        }
        // keep clear of the head (a sphere round it) and of the seat back behind it
        for (let i = 2; i < n; i++) {
          const d = pts[i].clone().sub(pos);
          const R = 0.115;
          if (d.length() < R) pts[i].copy(pos).addScaledVector(d.normalize(), R);
          if (pts[i].z > 0.32) pts[i].z = 0.32;
        }
      }
    }
    hp = hNext;
    // store in head space
    const inv = hNext.quat.clone().invert();
    result.push(pts.map((p) => p.clone().sub(hNext.pos).applyQuaternion(inv)));
  }
  chainCache[key] = result;
  return result;
};

export { NROW };
