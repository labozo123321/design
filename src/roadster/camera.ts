import * as THREE from "three";
import { carAt, PCUE, type CarState } from "./path";
import { CUE, FPS, SEGS, segAt, smooth, smoother, vnoise, wAt, clamp, lerp, type Seg } from "./timeline";
import { EYE } from "./Cockpit";

/**
 * Where the camera is, frame by frame:
 *  - pov: his eyes. The walk up to the car (a step's bob, the head on the car), over the sill and down into
 *    the seat; then the head in the car: pushed about by the g's (a spring in path.json), looking where he
 *    looks (at the coffee, the starter, up through the canopy at the ground when he's upside down), the
 *    road's buzz, the landings' jolts.
 *  - replay: a phone held up in the crowd, following the car up the ramp (late, a little shaky, zoomed).
 *  - bullet: the world stopped at the top of the jump: out through the canopy, round the car upside down
 *    above the Semi, and back in.
 */

export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

export const look = (pos: THREE.Vector3, at: THREE.Vector3, fov: number, roll = 0, up = V3(0, 1, 0)): Pose => {
  const m = new THREE.Matrix4().lookAt(pos, at, up);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), roll));
  return { pos: pos.clone(), quat: q, fov };
};

export const POV_FOV = 76;

/** The seated head in the car frame: position and rotation (yaw/pitch from where he looks, the g's). */
export const headInCar = (st: CarState, w: number) => {
  const p = EYE.clone().add(st.head);
  // looking down at the console, he leans in toward it
  const lean = Math.max(0, Math.min(1, (-st.yaw - 12) / 16)) * Math.max(0, Math.min(1, (-st.pitch - 12) / 16));
  p.add(new THREE.Vector3(0.07, -0.05, -0.05).multiplyScalar(lean));
  // the road's buzz on the ground (more with speed), nothing in the air
  const buzz = st.pos.y < 0.03 ? Math.min(1, st.speed / 25) : 0;
  p.x += vnoise(w * 31, 1) * 0.0012 * buzz;
  p.y += vnoise(w * 37, 2) * 0.0018 * buzz;
  // breathing, at rest
  p.y += Math.sin(w * 1.6) * 0.0012;
  const yaw = deg(st.yaw) + vnoise(w * 0.7, 3) * deg(0.6);
  const pitch = deg(st.pitch) + st.head.z * 2.2 + vnoise(w * 0.6, 4) * deg(0.4) + vnoise(w * 29, 5) * deg(0.12) * buzz;
  const roll = -st.head.x * 2.4 + vnoise(w * 23, 6) * deg(0.1) * buzz;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
  return { p, q };
};

/** The reveal's snap zoom: when he's caught, the picture punches in on his face (and lets go at the thumbs-up). */
export const revealZoom = (w: number) => {
  const c = PCUE.creep0;
  return smooth(c + 2.68, c + 2.86, w) * (1 - smooth(c + 4.3, c + 4.75, w));
};

/** The seated camera in the world. */
const seated = (w: number): Pose => {
  const st = carAt(w);
  const h = headInCar(st, w);
  const pos = h.p.clone().applyQuaternion(st.quat).add(st.pos);
  const quat = st.quat.clone().multiply(h.q);
  return { pos, quat, fov: lerp(POV_FOV, 40, revealZoom(w)) };
};

// ------------------------------------------------------------------------------- the walk to the car
const WALK_FROM = V3(-4.7, 1.66, 8.4);
const WALK_TO = V3(-1.9, 1.66, 1.05);
const STEP_HZ = 1.85;

/** Walking up (world 0..walk1), then over the sill and into the seat (walk1..seated). Body yaw (for the cup
 * hand) comes with it. */
export const walkPose = (w: number): Pose & { bodyYaw: number; bob: number } => {
  const T1 = PCUE.walk1;
  const T2 = PCUE.seated;
  const car = carAt(w);
  if (w <= T1) {
    const k = smoother(w / T1);
    const pos = WALK_FROM.clone().lerp(WALK_TO, k);
    // the step's bob and sway (fading as he slows to a stop)
    const gait = Math.min(1, w / 0.4) * (1 - smooth(T1 - 0.5, T1, w));
    const ph = w * STEP_HZ * Math.PI * 2;
    pos.y += Math.abs(Math.sin(ph / 2)) * 0.03 * gait - 0.015 * gait;
    pos.x += Math.sin(ph / 2) * 0.012 * gait;
    // looking at the car: its tail and canopy first, then down into the cockpit
    const at = V3(0.3, 0.65, -1.2).lerp(V3(-0.2, 0.62, -0.25), smooth(0.8, T1, w));
    const p = look(pos, at, lerp(58, 62, k), Math.sin(ph / 2) * deg(0.6) * gait);
    const dir = at.clone().sub(pos);
    return { ...p, bodyYaw: Math.atan2(-dir.x, -dir.z), bob: gait };
  }
  // over the sill and down: a curve from beside the door to his eyes in the seat
  const k = smoother((w - T1) / (T2 - T1));
  const seatEye = seated(T2);
  const mid = V3(-1.15, 1.58, 0.42);
  const a = WALK_TO.clone().lerp(mid, Math.min(1, k * 1.6));
  const pos = a.lerp(seatEye.pos, smooth(0.35, 1, k));
  // a bump as he drops in
  pos.y -= Math.sin(Math.PI * smooth(0.55, 1, k)) * 0.04;
  const qa = look(WALK_TO, V3(-0.2, 0.62, -0.25), 62).quat;
  const quat = qa.clone().slerp(seatEye.quat, smoother(smooth(0.15, 1, k)));
  void car;
  return { pos, quat, fov: lerp(62, POV_FOV, smooth(0.3, 1, k)), bodyYaw: 0, bob: 0 };
};

// --------------------------------------------------------------------------------- the phone replay
const PHONE_AT = V3(-29.1, 1.63, -47.5);
const replayPose = (w: number, v: number): Pose => {
  // following the car with a lag (a person tracking it), a little shake, the zoom easing in
  const lagW = w - 0.12;
  const c = carAt(lagW);
  const at = c.pos.clone().add(V3(0, 0.6, 0));
  // early on, framing the top of the ramp
  const pos = PHONE_AT.clone().add(V3(vnoise(v * 3.1, 11) * 0.012, vnoise(v * 2.7, 12) * 0.01, vnoise(v * 2.3, 13) * 0.008));
  at.add(V3(vnoise(v * 1.7, 14) * 0.18, vnoise(v * 1.9, 15) * 0.14, 0));
  const zoom = 1 - smooth(CUE.replay, CUE.replay + 1.2, v) * 0.35;
  return look(pos, at, 36 * zoom, vnoise(v * 0.9, 16) * deg(1.5));
};

// --------------------------------------------------------------------------------- the bullet time
/** A monotone curve through (x, y) knots, flat at both ends (Fritsch-Carlson). */
const easeThrough = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = ys.slice(1).map((y, i) => (y - ys[i]) / h[i]);
  const m = xs.map((_, i) => {
    if (i === 0 || i === n - 1 || d[i - 1] * d[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  });
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = clamp((x - xs[i]) / h[i]);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
};
const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const R2D = THREE.MathUtils.radToDeg;

/** Out of his window (the driver's side, the car's left: upside down, that's up and away from the Semi),
 * round the car's left side above the lineup with the crowd behind it, and back in through the same window.
 * The picture turns to the car on the way out, and rolls: upright for the orbit, then on round the same way
 * the car is rolling, so it's the car's barrel roll carried on, one whole turn, when he's back behind his eyes. */
const BULLET = {
  R: 10.0, // the orbit's radius, its height above the car, its sweep (round the car's left side, front to back)
  H: 3.0,
  a0: deg(-55),
  a1: deg(55),
  drop: 0.15, // looking at a point this far below the car: the Semi in the picture too
  fov: 48,
  uOut: 0.3, // the share of the time out of the window and round to the orbit; back in from uIn
  uIn: 0.7,
};
type BulletPath = {
  curve: THREE.CatmullRomCurve3;
  S: number;
  sAt: (u: number) => number;
  at: THREE.Vector3;
  eye: THREE.Euler;
  yawStart: number;
  yawEnd: number;
};
let bulletCache: BulletPath | null = null;
const bulletPath = (): BulletPath => {
  if (bulletCache) return bulletCache;
  const seg = SEGS.find((s) => s.name === "bullet")!;
  const w = seg.w0;
  const st = carAt(w);
  const eye = seated(w);
  const local = (x: number, y: number, z: number) => V3(x, y, z).applyQuaternion(st.quat).add(st.pos);
  const up = V3(0, 1, 0).applyQuaternion(st.quat);
  const com = st.pos.clone().addScaledVector(up, 0.48);
  const { R, H, a0, a1 } = BULLET;
  const orbit = (a: number) => com.clone().add(V3(Math.cos(a) * R, H, Math.sin(a) * R));
  const win = local(-1.35, 1.0, 0.1); // just outside his side glass
  const ring = [0, 0.25, 0.5, 0.75, 1].map((k) => orbit(lerp(a0, a1, k)));
  const pts = [eye.pos, win, local(-3.4, 1.6, -1.8), ...ring, local(-3.4, 1.6, 2.0), win, eye.pos];
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const per = 200;
  curve.arcLengthDivisions = per * (pts.length - 1);
  const lengths = curve.getLengths();
  const S = lengths[lengths.length - 1];
  const sOut = lengths[per * 3]; // where the orbit starts, and ends
  const sIn = lengths[per * 7];
  const sAt = easeThrough([0, BULLET.uOut, BULLET.uIn, 1], [0, sOut, sIn, S]);
  const at = com.clone().add(V3(0, -BULLET.drop, 0));
  const yawOf = (p: THREE.Vector3) => new THREE.Euler().setFromQuaternion(look(p, at, BULLET.fov).quat, "YXZ").y;
  bulletCache = {
    curve,
    S,
    sAt,
    at,
    eye: new THREE.Euler().setFromQuaternion(eye.quat, "YXZ"),
    yawStart: R2D(yawOf(ring[0])),
    yawEnd: R2D(yawOf(ring[4])),
  };
  return bulletCache;
};

const bulletPose = (v: number): Pose => {
  const seg = SEGS.find((s) => s.name === "bullet")!;
  const u = clamp((v - seg.v0) / (seg.v1 - seg.v0));
  const B = bulletPath();
  const pos = B.curve.getPointAt(clamp(B.sAt(u) / B.S));
  const t = new THREE.Euler().setFromQuaternion(look(pos, B.at, BULLET.fov).quat, "YXZ");
  const ty = R2D(t.y);
  const tp = R2D(t.x);
  const tr = R2D(t.z);
  const ey = R2D(B.eye.y);
  const ep = R2D(B.eye.x);
  const er = R2D(B.eye.z);
  let yaw: number;
  let pitch: number;
  let roll: number;
  let fov: number;
  if (u <= BULLET.uOut) {
    // turning to the car the way it is (the long way round, past it), rolling upright the way the car rolls
    const k = smoother(u / BULLET.uOut);
    const yt = B.yawStart + wrapDeg(ty - B.yawStart);
    const yawTo = ey + (((yt - ey) % 360) + 360) % 360;
    yaw = lerp(ey, yawTo, k);
    pitch = lerp(ep, tp, k);
    roll = lerp(er, er + ((((tr - er) % 360) + 360) % 360), k);
    fov = lerp(POV_FOV, BULLET.fov, k);
  } else if (u >= BULLET.uIn) {
    // back to his view, the roll carrying on round
    const k = smoother((u - BULLET.uIn) / (1 - BULLET.uIn));
    const yt = B.yawEnd + wrapDeg(ty - B.yawEnd);
    yaw = lerp(yt, yt + wrapDeg(ey - yt), k);
    pitch = lerp(tp, ep, k);
    roll = lerp(tr, tr + ((((er - tr) % 360) + 360) % 360), k);
    fov = lerp(BULLET.fov, POV_FOV, k);
  } else {
    yaw = ty;
    pitch = tp;
    roll = tr;
    fov = BULLET.fov;
  }
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(pitch), deg(yaw), deg(roll), "YXZ"));
  return { pos, quat, fov };
};

export type Shot = { pose: Pose; seg: Seg; w: number; inCar: boolean; walk?: ReturnType<typeof walkPose> };

export const shotAt = (frame: number): Shot => {
  const v = frame / FPS;
  const w = wAt(frame);
  const seg = segAt(frame);
  if (seg === "replay") return { pose: replayPose(w, v), seg, w, inCar: false };
  if (seg === "bullet") return { pose: bulletPose(v), seg, w, inCar: false };
  if (seg === "pov1" && w < PCUE.seated) {
    const walk = walkPose(w);
    return { pose: walk, seg, w, inCar: false, walk };
  }
  return { pose: seated(w), seg, w, inCar: true };
};
