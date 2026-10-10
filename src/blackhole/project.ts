import { Cam } from "./timeline";

export type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Where you see something that a hovering observer sees in direction n, moving at velocity beta. */
export const aberrate = (n: V3, beta: V3): V3 => {
  const b2 = dot(beta, beta);
  if (b2 < 1e-12) return n;
  const b = Math.sqrt(b2);
  const bh: V3 = [beta[0] / b, beta[1] / b, beta[2] / b];
  const g = 1 / Math.sqrt(1 - b2);
  const nb = dot(n, bh);
  const den = g * (1 + dot(beta, n));
  return norm([
    (n[0] + (g - 1) * nb * bh[0] + g * beta[0]) / den,
    (n[1] + (g - 1) * nb * bh[1] + g * beta[1]) / den,
    (n[2] + (g - 1) * nb * bh[2] + g * beta[2]) / den,
  ]);
};

/** A world direction on the 1080 x 1920 screen (null when it's behind you). */
export const toScreen = (dir: V3, cam: Cam, w = 1080, h = 1920) => {
  const f = norm(cam.fwd);
  const r = norm(cross(f, cam.up));
  const u = cross(r, f);
  const z = dot(dir, f);
  if (z <= 1e-4) return null;
  const F = h / 2 / Math.tan((cam.fov * Math.PI) / 180 / 2);
  return { x: w / 2 + (dot(dir, r) / z) * F, y: h / 2 - (dot(dir, u) / z) * F };
};

/** The direction straight out, away from the hole: the centre of the dot of sky when you hover just above. */
export const skyCentre = (cam: Cam): V3 => aberrate(norm(cam.pos), cam.beta);
