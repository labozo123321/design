import * as THREE from "three";
import { CUE, FPS, HER_SEAT, SEATS, YOUR_SEAT, frameAt, gAt, sAt, vAt, type Frame } from "./track";

/**
 * The maths the picture shares: the sun, the video's beats, and the camera (your eyes, in the front row of
 * the train, third seat from the left; your little sister is on your right).
 *
 * The camera rides the track frame of the front row and adds what your head does: where you look (keyed
 * below, relative to the seat), how the g's push it (sinking into the seat at the bottom of the drop, lifting
 * against the restraint in the airtime, sideways in the turns, forward on the brakes) and the rattle of the
 * wheels, which grows with speed.
 */

export { FPS };

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Golden hour: the sun 13 degrees up, 20 degrees south of west (ahead of you, left, at the hold). */
export const SUN = new THREE.Vector3(-0.915, 0.225, 0.333).normalize();

/** The video: the ride, then the cut to the exit and the ride photo. */
export const RIDE_END = Math.round((CUE.brakes + 2.4) * FPS) / FPS;
export const ENDING = 10.0;
export const DURATION = Math.round((RIDE_END + ENDING) * FPS);

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

/* ------------------------------------------------------------------ */
/* The beats                                                            */
/* ------------------------------------------------------------------ */

export const BEAT = {
  /** the restraint comes down and locks */
  lock: 0.55,
  dispatch: CUE.dispatch,
  chain: CUE.chain,
  liftTop: CUE.liftTop,
  hold: CUE.holdStart,
  /** she blows a bubble while you hang over the drop... */
  bubble: [CUE.holdStart + 0.7, CUE.release] as [number, number],
  /** ...and it pops when the brake lets go */
  release: CUE.release,
  over: CUE.over,
  tunnel: [CUE.tunnel0, CUE.tunnel1] as [number, number],
  immTop: CUE.immTop,
  splash: [CUE.splash0, CUE.splash1] as [number, number],
  zr: [CUE.zrRoll, CUE.zr1] as [number, number],
  hop: CUE.hopTop,
  brakes: CUE.brakes,
  /** the on-ride camera fires as you come out of the drop */
  photo: CUE.vertical + 1.2,
};

/* ------------------------------------------------------------------ */
/* Where you look (relative to the seat): yaw + to the right, pitch + up */
/* ------------------------------------------------------------------ */

const H = CUE.holdStart;
const R0 = CUE.release;
const LOOK: [number, number, number][] = [
  // the station: down at the restraint coming down, then at her
  [0.0, 0.12, -0.72],
  [0.55, 0.08, -0.66],
  [1.0, 1.42, -0.32],
  [1.9, 1.46, -0.3],
  [2.6, 0.02, -0.04],
  [CUE.chain - 0.4, -0.04, -0.02],
  // the lift: up the track, her, then down over the side
  [CUE.chain + 2.6, 0.0, 0.16],
  [CUE.chain + 3.6, 0.04, 0.12],
  [CUE.chain + 4.3, 1.45, -0.24],
  [CUE.chain + 6.0, 1.42, -0.26],
  [CUE.chain + 6.9, -0.78, -0.92],
  [CUE.chain + 9.3, -0.72, -1.0],
  [CUE.chain + 10.2, 0.0, 0.12],
  [CUE.liftTop - 2.2, 0.0, 0.04],
  // over the top and round the turnaround: the park, then the sunset
  [CUE.liftTop - 0.6, -0.1, -0.02],
  [CUE.liftTop + 1.6, 0.42, -0.06],
  [H - 3.6, 0.48, -0.06],
  [H - 2.2, 0.0, -0.24],
  [H - 0.6, 0.0, -0.55],
  // the hold: straight down; at her (the bubble); down again
  [H + 0.1, 0.02, -0.82],
  [H + 0.6, 0.04, -0.84],
  [H + 1.05, 1.44, -0.22],
  [R0 - 1.15, 1.42, -0.24],
  [R0 - 0.55, 0.02, -0.8],
  [R0, 0.0, -0.82],
  // the drop
  [CUE.over, 0.0, -0.62],
  [CUE.over + 1.6, 0.0, -0.28],
  [CUE.tunnel0, 0.0, 0.0],
  // the Immelmann: at her upside down
  [CUE.immTop - 0.6, 0.02, 0.04],
  [CUE.immTop - 0.05, 1.38, -0.2],
  [CUE.immTop + 0.75, 1.36, -0.2],
  [CUE.imm1 - 0.1, 0.0, 0.0],
  // into the diving turn (right)
  [CUE.dive0 + 1.4, 0.22, -0.06],
  [CUE.splash0 - 0.6, 0.0, -0.04],
  // the splash, then her, soaked
  [CUE.splash1 + 0.1, 0.0, -0.02],
  [CUE.splash1 + 0.55, 1.4, -0.22],
  [CUE.zrRoll - 0.3, 1.38, -0.22],
  [CUE.zrRoll + 0.15, 0.0, 0.0],
  // the zero-g roll, the swoop (right), the hop
  [CUE.zr1, 0.0, 0.0],
  [CUE.swoop0 + 1.0, 0.24, -0.04],
  [CUE.swoop1 - 0.5, 0.06, 0.0],
  [CUE.hopTop, 0.0, 0.08],
  [CUE.brakes - 0.3, 0.0, 0.0],
  // the brakes: she turns to you
  [CUE.brakes + 0.5, 1.42, -0.22],
  [RIDE_END, 1.45, -0.22],
];
const YAW = pchip(LOOK.map(([t, y]) => [t, y]));
const PITCH = pchip(LOOK.map(([t, , p]) => [t, p]));

/** Lens: wide, a little wider with speed, a slow push in over the drop. */
const FOV_BASE = 76;

export type Cam = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number; f: Frame };

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Smooth noise in time (value noise at rate hz). */
const tnoise = (t: number, hz: number, seed: number) => {
  const x = t * hz;
  const i = Math.floor(x);
  const k = x - i;
  const u = k * k * (3 - 2 * k);
  return hash(i + seed * 101.3) * (1 - u) + hash(i + 1 + seed * 101.3) * u - 0.5;
};

/** The g's, eased (the body takes a moment to sink or lift). */
const gSmooth = (frame: number) => {
  let n = 0;
  let l = 0;
  let t = 0;
  let w = 0;
  for (let k = 0; k < 6; k++) {
    const g = gAt(frame - k);
    const wk = Math.exp(-k * 0.55);
    n += g.n * wk;
    l += g.l * wk;
    t += g.t * wk;
    w += wk;
  }
  return { n: n / w, l: l / w, t: t / w };
};

/** Where you look at time u: yaw (+ right) and pitch (+ up), relative to the seat. */
export const lookAt = (u: number) => ({ yaw: YAW(u), pitch: PITCH(u) });

/** Your eyes at a (possibly fractional) frame. */
export const camAt = (frame: number): Cam => {
  const u = frame / FPS;
  const f = frameAt(sAt(frame));
  const v = vAt(frame);
  const g = gSmooth(frame);
  const look = lookAt(u);
  // the head, pushed by the g's (clamped to what the restraint allows)
  const gn = clamp(g.n, -1.2, 4.5);
  const sink = clamp(-0.012 * (gn - 1), -0.03, 0.04);
  const side = clamp(0.035 * g.l, -0.04, 0.04);
  const fwd = clamp(-0.03 * g.t, -0.03, 0.05);
  // rattle: grows with speed; a slow sway on the lift
  const rat = 0.0016 * Math.min(1, v / 30) + 0.0004 * smooth(0.5, 3, v);
  const yaw = look.yaw + tnoise(u, 11, 1) * rat * 1.4 + tnoise(u, 0.7, 2) * 0.01;
  const pitch =
    look.pitch +
    clamp(-0.022 * (gn - 1), -0.07, 0.05) +
    tnoise(u, 13, 3) * rat * 2 +
    tnoise(u, 0.6, 4) * 0.008;
  const roll = clamp(0.05 * g.l, -0.06, 0.06) + tnoise(u, 9, 5) * rat;
  // neck pivot above the chest; the eyes sit up and forward of it and swing with the head
  const neck = f.P.clone()
    .addScaledVector(f.R, SEATS[YOUR_SEAT] + side)
    .addScaledVector(f.U, 0.27 + sink)
    .addScaledVector(f.T, -0.02 + fwd);
  const seatQ = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate()),
  );
  const headQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -yaw, roll, "YXZ"));
  const quat = seatQ.clone().multiply(headQ);
  const eye = new THREE.Vector3(0, 0.12, -0.085).applyQuaternion(quat);
  const pos = neck.add(eye);
  // the lens: wider with speed, pushed in over the drop while you hang there
  const hang = smooth(CUE.holdStart - 0.8, CUE.holdStart + 0.6, u) * (1 - smooth(CUE.release, CUE.release + 0.4, u));
  const fov = FOV_BASE + 9 * smooth(8, 32, v) - 9 * hang;
  return { pos, quat, fov, f };
};

/** Your sister's head (for the look-at tests): where her eyes are. */
export const herEyesAt = (frame: number) => {
  const f = frameAt(sAt(frame));
  return f.P.clone().addScaledVector(f.R, SEATS[HER_SEAT]).addScaledVector(f.U, 0.39);
};
