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
const bulletPose = (v: number): Pose => {
  const seg = SEGS.find((s) => s.name === "bullet")!;
  const u = clamp((v - seg.v0) / (seg.v1 - seg.v0));
  const w = seg.w0;
  const st = carAt(w);
  const eye = seated(w);
  const com = st.pos.clone().add(V3(0, 1, 0).applyQuaternion(st.quat).multiplyScalar(0.48));
  // the orbit: a circle round the car a little above it, looking down past it at the lineup
  const R = 9.6;
  const a0 = Math.atan2(eye.pos.z - com.z, eye.pos.x - com.x);
  const a1 = a0 + deg(160);
  const orbitAt = (a: number) => com.clone().add(V3(Math.cos(a) * R, 3.4 + 1.0 * Math.sin((a - a0) * 1.2), Math.sin(a) * R));
  // out through the canopy, round, and back in
  const out = smoother(u / 0.26);
  const round = smoother((u - 0.2) / 0.58);
  const back = smoother((u - 0.8) / 0.2);
  let pos: THREE.Vector3;
  if (u < 0.2) pos = eye.pos.clone().lerp(orbitAt(a0), out);
  else if (u < 0.8) pos = orbitAt(lerp(a0, a1, round));
  else pos = orbitAt(a1).lerp(eye.pos, back);
  if (u >= 0.2 && u < 0.26) pos = pos.clone().lerp(eye.pos.clone().lerp(orbitAt(a0), out), 1 - (u - 0.2) / 0.06);
  const orbit = look(pos, com.clone().add(V3(0, -1.6, 0)), 42);
  let quat: THREE.Quaternion;
  if (u < 0.22) quat = eye.quat.clone().slerp(orbit.quat, smoother(u / 0.22));
  else if (u < 0.82) quat = orbit.quat;
  else quat = orbit.quat.clone().slerp(eye.quat, smoother((u - 0.82) / 0.18));
  const fov = u < 0.26 ? lerp(POV_FOV, 40, out) : u > 0.8 ? lerp(40, POV_FOV, back) : 40;
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
