import * as THREE from "three";
import { V } from "./toon";

/** A camera for a moment: where it is, what it looks at, its lens. */
export type Cam = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; roll?: number; near?: number; far?: number };

export const camQuat = (c: Cam): THREE.Quaternion => {
  const m = new THREE.Matrix4().lookAt(c.pos, c.target, V(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (c.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), c.roll));
  return q;
};

/** The screen-space motion of the shot's subject between two moments, for the motion blur: a shift
 * (in UV) and a zoom (relative change of scale), scaled by the shutter. */
export const camBlur = (now: Cam, prev: Cam, shutter = 0.5, aspect = 1080 / 1920, ref?: THREE.Vector3): { dir: [number, number]; zoom: number } => {
  const proj = (c: Cam, p: THREE.Vector3) => {
    const cam = new THREE.PerspectiveCamera(c.fov, aspect, 0.05, 1000);
    cam.position.copy(c.pos);
    cam.quaternion.copy(camQuat(c));
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return p.clone().project(cam);
  };
  // with no static reference, only the camera's turn and zoom count (a subject the camera follows stays
  // sharp; the far world streaks)
  const far = ref ?? now.pos.clone().add(now.target.clone().sub(now.pos).normalize().multiplyScalar(500));
  const a = proj(now, far);
  const b = proj(prev, far);
  const dir: [number, number] = [((a.x - b.x) / 2) * shutter, ((a.y - b.y) / 2) * shutter];
  const tn = Math.tan(THREE.MathUtils.degToRad(now.fov / 2));
  const tp = Math.tan(THREE.MathUtils.degToRad(prev.fov / 2));
  const zoom = (ref ? (prev.pos.distanceTo(ref) * tp) / (now.pos.distanceTo(ref) * tn) - 1 : tp / tn - 1) * shutter;
  // keep it sane: anything faster is a cut
  const k = Math.min(1, 0.09 / Math.max(1e-6, Math.hypot(dir[0], dir[1])));
  return { dir: [dir[0] * k, dir[1] * k], zoom: Math.max(-0.12, Math.min(0.12, zoom)) };
};

/** Orbit: a camera on a circle round a target. yaw 0 = looking from +z; pitch up is positive. */
export const orbit = (target: THREE.Vector3, dist: number, yaw: number, pitch: number, fov = 35, roll = 0): Cam => ({
  pos: target.clone().add(V(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist)),
  target: target.clone(),
  fov,
  roll,
});

export const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.clone().lerp(b.pos, k),
  target: a.target.clone().lerp(b.target, k),
  fov: a.fov + (b.fov - a.fov) * k,
  roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * k,
  near: a.near ?? b.near,
  far: a.far ?? b.far,
});

/** Handheld-ish drift and shake: a few slow sines, deterministic. */
export const shake = (c: Cam, t: number, amp: number, freq = 1): Cam => {
  const n = (k: number, f: number) => Math.sin(t * f * freq + k) * 0.6 + Math.sin(t * f * 2.3 * freq + k * 1.7) * 0.4;
  const off = V(n(1.1, 1.3), n(2.7, 1.7), n(0.3, 1.1)).multiplyScalar(amp);
  return { ...c, pos: c.pos.clone().add(off), target: c.target.clone().add(off.clone().multiplyScalar(0.6)) };
};
