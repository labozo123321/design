/**
 * The plaza crowd for the POV piece.
 *
 * - Every walker gets a looping route planned so its straight legs keep clear of every prop.
 * - Everyone is simulated together: separation steering plus hard (position-based) constraints, so
 *   nobody ever overlaps a prop, another person, or the viewer.
 * - Jumps and low-gravity bounding hops are only taken when the whole arc lands somewhere clear.
 * - At zero g everyone lifts off; floaters collide in 3D with props, lamp heads, tree canopies,
 *   each other and the viewer, and the updraft carries them up.
 *
 * Integrated from t = 0 at 60 Hz, cached per frame, deterministic.
 */
import { random } from "remotion";
import { FOUNTAIN, TREES } from "../whatif/sim";
import { T, gravity, updraft } from "./timeline";

const G0 = 9.81;
const FPS = 30;
const SUB = 2;
const DT = 1 / (FPS * SUB);
const R = 0.42; // body radius incl. swinging arms and striding feet
const EYE = 1.68;

/* ------------------------------------------------------------------ */
/* Obstacles                                                            */
/* ------------------------------------------------------------------ */

export type Ob = { x: number; z: number; r?: number; hx?: number; hz?: number; top: number; name: string };
export const LAMPS: [number, number][] = [
  [-20, 6],
  [-2, -9],
  [12, -10],
  [16, 4],
  [-14, 18],
  [6, 20],
  [-28, -8],
];
export const BENCHES = [-14, -4, 4, 14];
export const OBSTACLES: Ob[] = [
  { name: "fountain", x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.rim + 0.45, top: 2.7 },
  { name: "cart", x: 3, z: 13, hx: 1.15, hz: 0.7, top: 6 },
  { name: "subway", x: 8, z: -2, hx: 2.05, hz: 3.05, top: 1.1 },
  ...BENCHES.map((x) => ({ name: "bench", x, z: -11.4, hx: 1.33, hz: 0.38, top: 0.6 })),
  ...LAMPS.map(([x, z]) => ({ name: "lamp", x, z, r: 0.14, top: 5.4 })),
  ...TREES.map((t) => ({ name: "trunk", x: t.x, z: t.z, r: 0.34 * t.s, top: 3.3 * t.s })),
  { name: "flag", x: -1, z: -9, r: 0.1, top: 7.2 },
  { name: "sign", x: 15, z: -3, r: 0.1, top: 3.3 },
];
/** 3D blobs above the footprints: tree canopies and lamp globes. */
export const SPHERES = [
  ...TREES.map((t) => ({ x: t.x, y: 4.5 * t.s, z: t.z, r: 2.55 * t.s })),
  ...LAMPS.map(([x, z]) => ({ x, y: 4.95, z, r: 0.42 })),
];
/** Walkable plaza: the road starts at x = 17.5, the river railing is at z = -12.7. */
export const BOUNDS = { x0: -31, x1: 16.4, z0: -12.0, z1: 29 };

export const sdf = (o: Ob, x: number, z: number) => {
  if (o.r !== undefined) return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx!;
  const dz = Math.abs(z - o.z) - o.hz!;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
};
const grad = (o: Ob, x: number, z: number): [number, number] => {
  const e = 1e-3;
  const gx = (sdf(o, x + e, z) - sdf(o, x - e, z)) / (2 * e);
  const gz = (sdf(o, x, z + e) - sdf(o, x, z - e)) / (2 * e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
};
const boundsDist = (x: number, z: number) =>
  Math.min(x - BOUNDS.x0, BOUNDS.x1 - x, z - BOUNDS.z0, BOUNDS.z1 - z);
export const clearance = (x: number, z: number) => {
  let c = boundsDist(x, z);
  for (const o of OBSTACLES) c = Math.min(c, sdf(o, x, z));
  return c;
};

/** The viewer's walking route (from the camera track), so groups and benches sit away from it. */
const ROUTE_PTS: [number, number][] = [];
for (let f = 0; f < T.floatAt; f += 6) ROUTE_PTS.push([T.x[f], T.z[f]]);
const routeDist = (x: number, z: number) => Math.min(...ROUTE_PTS.map(([a, b]) => Math.hypot(x - a, z - b)));

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

export type Role = "walk" | "group" | "sit" | "photo";
export type Spec = {
  i: number;
  role: Role;
  kid: boolean;
  height: number;
  speed: number;
  jumpEvery: number; // 0 = never on purpose
  v0: number;
  route: [number, number][];
  start: [number, number];
  face0: number; // initial / fixed heading
  liftAt: number; // zero-g lift-off time for people who are not moving
  seed: number;
};

const r01 = (k: string) => random(`crowd-${k}`);

const planRoute = (i: number, near: boolean): [number, number][] => {
  for (let attempt = 0; attempt < 3000; attempt++) {
    const n = 3 + Math.floor(r01(`${i}-n-${attempt}`) * 2);
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 80; tries++) {
        const x = BOUNDS.x0 + (BOUNDS.x1 - BOUNDS.x0) * r01(`${i}-${attempt}-${k}-${tries}-x`);
        const z = BOUNDS.z0 + (BOUNDS.z1 - BOUNDS.z0) * r01(`${i}-${attempt}-${k}-${tries}-z`);
        if (clearance(x, z) > 1.15 && (!near || (routeDist(x, z) > 2.5 && routeDist(x, z) < 9))) {
          pts.push([x, z]);
          break;
        }
      }
    }
    if (pts.length < n) continue;
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[(k + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4 || len > 22) ok = false;
      for (let s = 0; s <= len && ok; s += 0.2) {
        const u = s / len;
        if (clearance(ax + (bx - ax) * u, az + (bz - az) * u) < 0.95) ok = false;
      }
    }
    if (ok) return pts;
  }
  throw new Error(`crowd: no route for ${i}`);
};

const pickSpot = (
  key: string,
  minClear: number,
  minRoute: number,
  avoid: [number, number][],
  minAvoid: number,
): [number, number] => {
  for (let k = 0; k < 4000; k++) {
    const x = BOUNDS.x0 + 2 + (BOUNDS.x1 - BOUNDS.x0 - 4) * r01(`${key}-${k}-x`);
    const z = BOUNDS.z0 + 2 + (BOUNDS.z1 - BOUNDS.z0 - 4) * r01(`${key}-${k}-z`);
    if (clearance(x, z) < minClear || routeDist(x, z) < minRoute) continue;
    if (avoid.some(([a, b]) => Math.hypot(x - a, z - b) < minAvoid)) continue;
    return [x, z];
  }
  throw new Error(`crowd: no spot for ${key}`);
};

export const SPECS: Spec[] = (() => {
  const out: Spec[] = [];
  let i = 0;
  // walkers
  for (let w = 0; w < 30; w++, i++) {
    const kid = r01(`${i}-kid`) < 0.27;
    const route = planRoute(i, w < 14);
    out.push({
      i,
      role: "walk",
      kid,
      height: kid ? 1.12 + r01(`${i}-h`) * 0.25 : 1.6 + r01(`${i}-h`) * 0.3,
      speed: kid ? 1.35 + r01(`${i}-s`) * 0.4 : 1.1 + r01(`${i}-s`) * 0.35,
      jumpEvery: kid ? 1.8 + r01(`${i}-j`) * 1.4 : r01(`${i}-jj`) < 0.4 ? 4 + r01(`${i}-j`) * 3 : 0,
      v0: kid ? 2.4 + r01(`${i}-v`) * 0.3 : 2.6 + r01(`${i}-v`) * 0.3,
      route,
      start: route[0],
      face0: 0,
      liftAt: 32 + r01(`${i}-lift`) * 1.5,
      seed: r01(`${i}-seed`) * 1000,
    });
  }
  // two groups chatting
  const groups: [number, number][] = [];
  for (let gi = 0; gi < 2; gi++) {
    const c = pickSpot(`group${gi}`, 2.6, 3.4, groups, 7);
    groups.push(c);
    const n = gi === 0 ? 3 : 2;
    for (let m = 0; m < n; m++, i++) {
      const a = (m / n) * Math.PI * 2 + r01(`${i}-ga`) * 0.4;
      const x = c[0] + Math.cos(a) * 0.68;
      const z = c[1] + Math.sin(a) * 0.68;
      out.push({
        i,
        role: "group",
        kid: false,
        height: 1.58 + r01(`${i}-h`) * 0.3,
        speed: 0,
        jumpEvery: 0,
        v0: 2.5,
        route: [[x, z]],
        start: [x, z],
        face0: Math.atan2(c[0] - x, c[1] - z),
        liftAt: 31.6 + r01(`${i}-lift`) * 2.2,
        seed: r01(`${i}-seed`) * 1000,
      });
    }
  }
  // three people on the benches, facing the plaza
  for (const [k, bx] of [-14, 4, 14].entries()) {
    const x = bx + (k % 2 ? -0.55 : 0.5);
    out.push({
      i,
      role: "sit",
      kid: false,
      height: 1.6 + r01(`${i}-h`) * 0.28,
      speed: 0,
      jumpEvery: 0,
      v0: 0,
      route: [[x, -11.4]],
      start: [x, -11.4],
      face0: 0,
      liftAt: 32.2 + r01(`${i}-lift`) * 2.5,
      seed: r01(`${i}-seed`) * 1000,
    });
    i++;
  }
  // someone filming the fountain on their phone
  {
    const spot = pickSpot("photo", 1.6, 3.0, groups, 5);
    out.push({
      i,
      role: "photo",
      kid: false,
      height: 1.7,
      speed: 0,
      jumpEvery: 0,
      v0: 0,
      route: [spot],
      start: spot,
      face0: Math.atan2(FOUNTAIN.x - spot[0], FOUNTAIN.z - spot[1]),
      liftAt: 32.6,
      seed: r01(`${i}-seed`) * 1000,
    });
    i++;
  }
  return out;
})();
export const N_PEOPLE = SPECS.length;

/* ------------------------------------------------------------------ */
/* Simulation                                                           */
/* ------------------------------------------------------------------ */

export type PState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  phase: number;
  wp: number;
  air: boolean;
  free: boolean;
  freeAt: number;
  tx: number; // tumble
  ty: number;
  tz: number;
  sx: number; // tumble spin rates
  sy: number;
  sz: number;
  landAt: number;
  impact: number;
  nextJump: number;
  jumpAt: number; // when the current hop/jump started
  jumpKind: number; // 0 none, 1 jump, 2 bounding hop
  speed: number;
};

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Would a ballistic hop from here land (and pass) only over clear ground? Conservative on g. */
const arcClear = (x: number, z: number, vx: number, vz: number, vy: number, g: number) => {
  const gp = Math.max(0.3, g * 0.72);
  const tt = (2 * vy) / gp;
  for (let k = 1; k <= 12; k++) {
    const u = (k / 12) * tt;
    const px = x + vx * u;
    const pz = z + vz * u;
    const py = vy * u - 0.5 * gp * u * u;
    if (boundsDist(px, pz) < 0.45) return false;
    for (const o of OBSTACLES) if (o.top > py - 0.1 && sdf(o, px, pz) < 0.6) return false;
  }
  return true;
};

const camAtStep = (step: number) => {
  const f = Math.min(T.frames - 1, Math.floor(step / SUB));
  return { x: T.x[f], y: T.y[f], z: T.z[f] };
};

const initState = (sp: Spec): PState => {
  let x = sp.start[0];
  let z = sp.start[1];
  let wp = 1 % sp.route.length;
  if (sp.role === "walk") {
    // start somewhere along the loop
    const n = sp.route.length;
    const seg = Math.floor(r01(`${sp.i}-startseg`) * n);
    const u = r01(`${sp.i}-startu`);
    const a = sp.route[seg];
    const b = sp.route[(seg + 1) % n];
    x = a[0] + (b[0] - a[0]) * u;
    z = a[1] + (b[1] - a[1]) * u;
    wp = (seg + 1) % n;
  }
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: sp.role === "walk" ? Math.atan2(sp.route[wp][0] - x, sp.route[wp][1] - z) : sp.face0,
    phase: r01(`${sp.i}-phase`) * Math.PI * 2,
    wp,
    air: false,
    free: false,
    freeAt: 1e9,
    tx: 0,
    ty: 0,
    tz: 0,
    sx: 0,
    sy: 0,
    sz: 0,
    landAt: -10,
    impact: 0,
    nextJump: sp.jumpEvery ? 2 + r01(`${sp.i}-nj`) * sp.jumpEvery : 1e9,
    jumpAt: -10,
    jumpKind: 0,
    speed: 0,
  };
};

const states: PState[][] = [];
let cur: PState[] | null = null;
let curStep = 0;

const clone = (s: PState[]) => s.map((p) => ({ ...p }));

const move = (P: PState[], n: number) => {
  const t = n * DT;
  const gf = gravity(t);
  const g = G0 * gf;
  const up = updraft(t);
  const cam = camAtStep(n);
  const camFeet = cam.y - EYE;

  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const sp = SPECS[i];
    const k = sp.height / 1.78;
    const onGround = !p.air && !p.free;

    // ---- zero g: anyone still on the ground drifts off at their own moment
    if (onGround && t >= sp.liftAt && gf <= 0.001) {
      p.air = true;
      p.free = true;
      p.freeAt = t;
      p.vy = 0.22 + r01(`${i}-liftv`) * 0.35;
      p.vx *= 0.5;
      p.vz *= 0.5;
      p.sx = (r01(`${i}-sx`) - 0.5) * 0.5;
      p.sy = (r01(`${i}-sy`) - 0.5) * 0.6;
      p.sz = (r01(`${i}-sz`) - 0.5) * 0.4;
    }

    if (p.free) {
      p.vy += (up - g) * DT;
      p.vx *= 1 - 0.04 * DT;
      p.vz *= 1 - 0.04 * DT;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.z += p.vz * DT;
      p.tx += p.sx * DT;
      p.ty += p.sy * DT;
      p.tz += p.sz * DT;
      continue;
    }

    if (sp.role === "walk" && onGround) {
      // steer to the next waypoint
      const [wx, wz] = sp.route[p.wp];
      let dx = wx - p.x;
      let dz = wz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        p.wp = (p.wp + 1) % sp.route.length;
      }
      dx /= d || 1;
      dz /= d || 1;
      const bound = 1 + 0.55 * Math.max(0, (0.45 - gf) / 0.45); // people bound faster at low g
      let ax = dx * sp.speed * bound;
      let az = dz * sp.speed * bound;
      // separation from people and the viewer
      for (let j = 0; j < P.length; j++) {
        if (j === i) continue;
        const q = P[j];
        if (Math.abs(q.y - p.y) > 1.6) continue;
        const ex = p.x - q.x;
        const ez = p.z - q.z;
        const e = Math.hypot(ex, ez);
        if (e < 1.4 && e > 1e-4) {
          ax += (ex / e) * (1.4 - e) * 2.2;
          az += (ez / e) * (1.4 - e) * 2.2;
        }
      }
      if (camFeet < p.y + 1.7) {
        const ex = p.x - cam.x;
        const ez = p.z - cam.z;
        const e = Math.hypot(ex, ez);
        if (e < 2.8 && e > 1e-4) {
          ax += (ex / e) * (2.8 - e) * 2.6;
          az += (ez / e) * (2.8 - e) * 2.6;
        }
      }
      // keep off props
      for (const o of OBSTACLES) {
        const c = sdf(o, p.x, p.z);
        if (c < 1.2) {
          const [gx, gz] = grad(o, p.x, p.z);
          ax += gx * (1.2 - c) * 2.5;
          az += gz * (1.2 - c) * 2.5;
        }
      }
      const blend = Math.min(1, DT * 3.5);
      p.vx += (ax - p.vx) * blend;
      p.vz += (az - p.vz) * blend;
      const v = Math.hypot(p.vx, p.vz);
      const vmax = sp.speed * bound * 1.35;
      if (v > vmax) {
        p.vx *= vmax / v;
        p.vz *= vmax / v;
      }
    } else if (onGround) {
      p.vx = 0;
      p.vz = 0;
    }

    // ---- take-offs (planned jumps, low-g bounding), only when the arc is clear
    if (onGround && sp.role !== "sit" && sp.role !== "photo" && gf > 0.12) {
      const pre = p.phase;
      const v = Math.hypot(p.vx, p.vz);
      p.phase += (v * DT * Math.PI * 2) / (1.35 * k);
      let vy = 0;
      let kind = 0;
      if (t >= p.nextJump) {
        vy = sp.v0;
        kind = 1;
      } else if (
        sp.role === "walk" &&
        gf < 0.45 &&
        Math.floor(pre / Math.PI) !== Math.floor(p.phase / Math.PI)
      ) {
        vy = 0.35 + 1.05 * ((0.45 - gf) / 0.45);
        kind = 2;
      } else if (sp.role === "group" && gf < 0.6 && r01(`${i}-hop-${Math.floor(t * 2)}`) < 0.08) {
        vy = 1.2;
        kind = 1;
      }
      if (vy > 0) {
        if (arcClear(p.x, p.z, p.vx, p.vz, vy, g)) {
          p.vy = vy;
          p.air = true;
          p.jumpAt = t;
          p.jumpKind = kind;
        }
        if (kind === 1) p.nextJump = t + (sp.jumpEvery || 1e9);
      }
    } else if (onGround) {
      const v = Math.hypot(p.vx, p.vz);
      p.phase += (v * DT * Math.PI * 2) / (1.35 * k);
    }

    if (p.air) {
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      p.y += p.vy * DT;
      p.vy -= g * DT;
      if (p.y <= 0) {
        p.impact = -p.vy;
        p.y = 0;
        p.vy = 0;
        p.air = false;
        p.landAt = t;
        p.jumpKind = 0;
      }
      // the hop never comes back once gravity is gone
      if (gf <= 0.001 && p.vy > 0) {
        p.free = true;
        p.freeAt = t;
        p.sx = (r01(`${i}-sx`) - 0.5) * 0.5;
        p.sy = (r01(`${i}-sy`) - 0.5) * 0.6;
        p.sz = (r01(`${i}-sz`) - 0.5) * 0.4;
      }
    } else {
      p.x += p.vx * DT;
      p.z += p.vz * DT;
    }

    // heading follows the walking direction
    const v = Math.hypot(p.vx, p.vz);
    p.speed = v;
    if (sp.role === "walk" && v > 0.15 && !p.free) {
      const target = Math.atan2(p.vx, p.vz);
      p.heading += wrapAngle(target - p.heading) * Math.min(1, DT * 6);
    }
  }
};

/** Position-based constraints: props, canopies, the plaza edge, the viewer, each other. */
const constrain = (P: PState[], n: number, passes = 3) => {
  const cam = camAtStep(n);
  const camFeet = cam.y - EYE;
  // ---- hard constraints: props, each other, the viewer, the plaza edge (3 passes)
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const sp = SPECS[i];
      const k = sp.height / 1.78;
      const fixed = sp.role === "sit" && !p.free;
      // props: footprint constraints apply while the feet are below the prop's top
      for (const o of OBSTACLES) {
        if (sp.role === "sit" && o.name === "bench") continue; // they sit on it, and float up off it
        if (p.y > o.top) continue;
        const c = sdf(o, p.x, p.z);
        if (c < R) {
          const [gx, gz] = grad(o, p.x, p.z);
          p.x += gx * (R - c);
          p.z += gz * (R - c);
          const vn = p.vx * gx + p.vz * gz;
          if (vn < 0) {
            p.vx -= vn * gx;
            p.vz -= vn * gz;
          }
        }
      }
      // canopies and lamp globes (3D)
      const cy = p.y + 0.9 * k;
      for (const s of SPHERES) {
        const ex = p.x - s.x;
        const ey = cy - s.y;
        const ez = p.z - s.z;
        const e = Math.hypot(ex, ey, ez);
        const min = s.r + 0.5 * k;
        if (e < min && e > 1e-4) {
          const push = (min - e) / e;
          p.x += ex * push;
          p.z += ez * push;
          if (p.free) p.y += ey * push;
          const vn = (p.vx * ex + p.vy * ey + p.vz * ez) / e;
          if (vn < 0) {
            p.vx -= (vn * ex) / e;
            p.vz -= (vn * ez) / e;
            if (p.free) p.vy -= (vn * ey) / e;
          }
        }
      }
      // the plaza edge, for anyone low enough to touch the ground or the railing
      if (p.y < 1.3) {
        p.x = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, p.x));
        p.z = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, p.z));
      }
      // the viewer: a capsule from the feet to just above the eyes
      if (p.free) {
        const cy = p.y + 0.9 * k;
        const yy = Math.min(cam.y + 0.2, Math.max(camFeet, cy));
        const ex = p.x - cam.x;
        const ey = cy - yy;
        const ez = p.z - cam.z;
        const e = Math.hypot(ex, ey, ez);
        const min = 1.0;
        if (e < min) {
          const nx = e > 1e-4 ? ex / e : 0;
          const ny = e > 1e-4 ? ey / e : 1;
          const nz = e > 1e-4 ? ez / e : 0;
          p.x += nx * (min - e);
          p.y += ny * (min - e);
          p.z += nz * (min - e);
          const vn = p.vx * nx + p.vy * ny + p.vz * nz;
          if (vn < 0) {
            p.vx -= vn * nx;
            p.vy -= vn * ny;
            p.vz -= vn * nz;
          }
        }
      } else if (p.y + 1.75 * k > camFeet && p.y < cam.y + 0.2) {
        const ex = p.x - cam.x;
        const ez = p.z - cam.z;
        const e = Math.hypot(ex, ez);
        const min = 0.85;
        if (e < min) {
          const nx = e > 1e-4 ? ex / e : 1;
          const nz = e > 1e-4 ? ez / e : 0;
          p.x = cam.x + nx * min;
          p.z = cam.z + nz * min;
        }
      }
      // each other
      for (let j = i + 1; j < P.length; j++) {
        const q = P[j];
        const kq = SPECS[j].height / 1.78;
        const qFixed = SPECS[j].role === "sit" && !q.free;
        if (p.free || q.free) {
          const ex = p.x - q.x;
          const ey = p.y + 0.9 * k - (q.y + 0.9 * kq);
          const ez = p.z - q.z;
          const e = Math.hypot(ex, ey, ez);
          const min = 0.95 * Math.max(k, kq);
          if (e < min && e > 1e-4) {
            const push = (min - e) / e;
            const wp = fixed ? 0 : qFixed ? 1 : 0.5;
            const wq = 1 - wp;
            p.x += ex * push * wp;
            p.y += ey * push * wp * (p.free ? 1 : 0);
            p.z += ez * push * wp;
            q.x -= ex * push * wq;
            q.y -= ey * push * wq * (q.free ? 1 : 0);
            q.z -= ez * push * wq;
          }
        } else {
          if (Math.abs(p.y - q.y) > 1.5) continue;
          const ex = p.x - q.x;
          const ez = p.z - q.z;
          const e = Math.hypot(ex, ez);
          const min = 0.66;
          if (e < min) {
            const nx = e > 1e-4 ? ex / e : 1;
            const nz = e > 1e-4 ? ez / e : 0;
            const push = min - e;
            const wp = fixed ? 0 : qFixed ? 1 : 0.5;
            const wq = 1 - wp;
            p.x += nx * push * wp;
            p.z += nz * push * wp;
            q.x -= nx * push * wq;
            q.z -= nz * push * wq;
          }
        }
      }
      if (p.y < 0) p.y = 0;
    }
  }
};

/** Crowd state at a frame (sequential simulation, cached). */
export const crowdAt = (frame: number): PState[] => {
  const f = Math.max(0, Math.min(T.frames - 1, Math.round(frame)));
  if (states[f]) return states[f];
  if (!cur) {
    cur = SPECS.map(initState);
    curStep = 0;
    // settle the starting crowd so nobody begins inside anything
    constrain(cur, 0, 40);
    states[0] = clone(cur);
  }
  // resume from the latest cached frame at or before f
  let start = f;
  while (start > 0 && !states[start]) start--;
  if (curStep !== start * SUB) {
    cur = clone(states[start]);
    curStep = start * SUB;
  }
  for (let fr = start + 1; fr <= f; fr++) {
    for (let s2 = 0; s2 < SUB; s2++) {
      move(cur, curStep);
      constrain(cur, curStep);
      curStep++;
    }
    states[fr] = clone(cur);
  }
  return states[f];
};
