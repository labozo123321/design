import * as THREE from "three";
import { EVENTS, LAY, M, T, clampF } from "./timeline";
import { NUDGES } from "./show";

/**
 * Where the camera is, frame by frame. Shared by the 3D rig and the 2D overlay (which pins comic words
 * to things in the scene), so both agree exactly.
 *
 *  - Cold open (until the rewind): a third-person shot of you, the ball, getting smacked by the jackpot
 *    bumper; it freezes on the frame ("yep. that's me.") and slowly pushes in.
 *  - Everywhere else: ball-cam, from the middle of the ball looking where it's going (track.json), with
 *    the plunger pulling you back before the launch, a kick of shake on every hit, and the lens widening
 *    with speed.
 */

const R = LAY.R;
const FPS = 30;
/** The pinball time when you drain (for the trough and the trapdoor). */
export const TAU_DRAIN = T.tau[clampF(Math.round(M.drain * FPS))];

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Video time for flashes and jolts: frozen in the freeze frame, nothing during the rewind. */
export const fxTime = (t: number) =>
  t < M.freeze ? t : t < M.rewind[0] ? M.freeze : t < M.rewind[1] ? -100 : t;

/** When the player starts pulling the plunger (after the "15 seconds earlier" card). */
export const PULL_START = M.plunge + 1.5;

/** How far the plunger is pulled back (0..1): slowly, a wobble at full stretch, then let go. */
export const plungerPull = (t: number) => {
  if (t < PULL_START || t >= M.launch) return 0;
  if (t < M.launch - 1.2) return Math.min(1, (t - PULL_START) / 1.9) ** 0.8;
  return 1 + 0.03 * Math.sin(t * 40) * (t - (M.launch - 1.2));
};

/** How far the ball sits back from its track position in the shooter lane (table y, negative = back). */
export const plungeOffset = (frame: number) => {
  const t = frame / FPS;
  if (t < M.rewind[1]) return 0;
  if (t < M.launch) return -0.035 * plungerPull(t);
  const tau = T.tau[clampF(frame)];
  return tau < 0.028 ? -0.035 * (1 - tau / 0.028) : 0;
};

/** The plunger tip's front face (table y): it rides behind the ball until it's spent. */
export const plungerTip = (frame: number) => {
  const p = T.you[clampF(frame)];
  const y = -p[2] + plungeOffset(frame);
  const inLane = p[0] > LAY.laneX && p[1] > 0;
  return inLane ? Math.min(0.0605, y - R - 0.0005) : 0.0605;
};

/** The trapdoor in the shooter lane: open (0..1) while the trough's eject brings you up through it. */
export const flapOpen = (frame: number) => {
  const t = frame / FPS;
  if (t < M.drain) return 0;
  const u = T.tau[clampF(frame)] - TAU_DRAIN;
  return smooth(5.86, 5.97, u) * (1 - smooth(6.31, 6.4, u));
};

/* ------------------------------------------------------------------ */
/* shakes                                                               */
/* ------------------------------------------------------------------ */

type Kick = { t: number; amp: number; tau: number; f: number };

const MAIN = EVENTS.filter((e) => !(e as { cold?: boolean }).cold);
const COLD = EVENTS.filter((e) => (e as { cold?: boolean }).cold);
const kickOf = (e: (typeof EVENTS)[number]): Kick | null => {
  const mine = e.ball === "you";
  const sp = (e as { speed?: number }).speed ?? 1;
  switch (e.kind) {
    case "bumper":
      return mine ? { t: e.t, amp: 0.05, tau: 0.16, f: 9 } : null;
    case "sling_L":
    case "sling_R":
      return mine ? { t: e.t, amp: 0.04, tau: 0.14, f: 10 } : null;
    case "flipper_L":
    case "flipper_R":
      return mine ? { t: e.t, amp: 0.05, tau: 0.18, f: 8 } : null;
    case "launch":
      return mine ? { t: e.t, amp: 0.05, tau: 0.25, f: 7 } : null;
    case "drop":
      return mine ? { t: e.t, amp: 0.03, tau: 0.12, f: 11 } : null;
    case "clack":
      return mine ? { t: e.t, amp: Math.min(0.03, 0.012 * sp), tau: 0.1, f: 12 } : null;
    case "ballhit":
      return { t: e.t, amp: 0.035, tau: 0.14, f: 10 };
    case "chomp":
      return { t: e.t, amp: 0.07, tau: 0.3, f: 6 };
    case "burp":
      return { t: e.t, amp: 0.06, tau: 0.45, f: 5 };
    case "ramp_in":
      return { t: e.t, amp: 0.02, tau: 0.2, f: 8 };
    case "tilt":
      return { t: e.t, amp: 0.08, tau: 0.5, f: 7 };
    default:
      return null;
  }
};
const KICKS: Kick[] = [
  ...MAIN.map(kickOf).filter((k): k is Kick => !!k),
  // the player shoving the machine before the tilt, the drain's thunk, the eject
  ...NUDGES.map((t) => ({ t, amp: 0.06, tau: 0.35, f: 6 })),
  { t: M.drain + 0.5, amp: 0.05, tau: 0.25, f: 9 },
];
const COLD_KICKS: Kick[] = COLD.map(kickOf).filter((k): k is Kick => !!k);

const shakeAt = (te: number, cold: boolean) => {
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  for (const k of cold ? COLD_KICKS : KICKS) {
    const d = te - k.t;
    if (d < 0 || d > k.tau * 6) continue;
    const e = 0.7 * k.amp * Math.exp(-d / k.tau);
    const w = 2 * Math.PI * k.f * d;
    yaw += e * Math.sin(w + k.t * 7.1);
    pitch += e * 0.8 * Math.sin(w * 1.13 + k.t * 3.3 + 1.0);
    roll += e * 1.4 * Math.sin(w * 0.87 + k.t * 5.7 + 2.0);
  }
  return { yaw, pitch, roll };
};

/** How hard things are hitting right now (0..1+), for punch-ins and the overlay's flashes. */
export const impactAt = (frame: number) => {
  const t = frame / FPS;
  const te = fxTime(t);
  let s = 0;
  for (const k of t < M.rewind[1] ? COLD_KICKS : KICKS) {
    const d = te - k.t;
    if (d < 0 || d > 1.5) continue;
    s += (k.amp / 0.05) * Math.exp(-d / 0.12);
  }
  return s;
};

/* ------------------------------------------------------------------ */
/* the pose                                                             */
/* ------------------------------------------------------------------ */

/** How fast the world streams past in video terms (m per video second), smoothed over 0.4 s. */
const STREAM = (() => {
  const raw = T.speed.map((sp, f) => sp * Math.abs(T.rate[f] ?? 1));
  return raw.map((_, f) => {
    let s = 0;
    let n = 0;
    for (let k = -6; k <= 6; k++) {
      const v = raw[Math.max(0, Math.min(raw.length - 1, f + k))];
      const w = 1 - Math.abs(k) / 7;
      s += v * w;
      n += w;
    }
    return s / n;
  });
})();

export type Pose = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  /** The cold open's outside view (you can see yourself). */
  third: boolean;
  /** Where you (the ball) are. */
  ball: THREE.Vector3;
};

const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** The third-person camera of the cold open: low, down-table of the jackpot bumper, pushing in. */
const coldCamera = (t: number, ball: THREE.Vector3) => {
  const bump = (LAY.bumpers as [number, number][])[1];
  const u = smooth(0, M.freeze, t);
  const pos = new THREE.Vector3(0.396 + 0.004 * u, 0.03 - 0.003 * u, -(0.586 + 0.014 * u));
  const target = ball
    .clone()
    .multiplyScalar(0.62)
    .add(new THREE.Vector3(bump[0], 0.026, -bump[1]).multiplyScalar(0.38));
  // the freeze frame: a slow push in
  const z = smooth(M.freeze, M.rewind[0], t);
  const fov = 74 - 12 * z;
  return { pos, target, fov };
};

export const poseAt = (frame: number): Pose => {
  const f = clampF(frame);
  const t = frame / FPS;
  const te = fxTime(t);
  const p = T.you[f];
  const ball = new THREE.Vector3(p[0], p[1], p[2] - plungeOffset(frame));
  if (t < M.rewind[0]) {
    const c = coldCamera(t, ball);
    const shake = shakeAt(te, true);
    tmpM.lookAt(c.pos, c.target, UP);
    const quat = new THREE.Quaternion().setFromRotationMatrix(tmpM);
    const e = new THREE.Euler(shake.pitch * 0.5, shake.yaw * 0.5, shake.roll * 0.5, "YXZ");
    quat.multiply(new THREE.Quaternion().setFromEuler(e));
    return { pos: c.pos, quat, fov: c.fov, third: true, ball };
  }
  const d = T.fwd[f];
  const target = ball.clone().add(new THREE.Vector3(d[0], d[1], d[2]));
  tmpM.lookAt(ball, target, UP);
  const quat = new THREE.Quaternion().setFromRotationMatrix(tmpM);
  const shake = shakeAt(te, false);
  const e = new THREE.Euler(shake.pitch, shake.yaw, shake.roll, "YXZ");
  quat.multiply(new THREE.Quaternion().setFromEuler(e));
  // the lens: wider the faster you go (in video terms: how fast the world streams past), punched in on
  // impacts
  const fov = 80 + 12 * Math.min(1, STREAM[f] / 2.2) - 3 * Math.min(1, impactAt(frame));
  return { pos: ball, quat, fov, third: false, ball };
};
