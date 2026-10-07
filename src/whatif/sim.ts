/**
 * Deterministic physics for the WhatIf plaza. Everything is integrated from t = 0 at 60 Hz under
 * g(t) = G0 · gravity(t), so any frame can be rendered on its own and always looks the same.
 */
import { random } from "remotion";
import { AIR_GONE, AIR_START, G0, ZERO_AT, gravity } from "./timeline";

const DT = 1 / 60;

/** Gravity curve and extras, so other pieces can reuse the plaza physics with their own schedule. */
export type Physics = { gravity: (t: number) => number; zeroAt: number; updraft?: (t: number) => number };
const DEFAULT: Physics = { gravity, zeroAt: ZERO_AT };

/* ------------------------------------------------------------------ */
/* People                                                               */
/* ------------------------------------------------------------------ */

export type PersonSpec = {
  a: [number, number];
  b: [number, number];
  speed: number;
  kid: boolean;
  jumper: number; // seconds between jumps, 0 = never jumps on purpose
  v0: number; // take-off speed, m/s
  shirt: string;
  pants: string;
  skin: string;
  phase: number;
};

const SHIRTS = [
  "#3E6FB0",
  "#C8453B",
  "#E2A93B",
  "#4E9A6A",
  "#7B5BA6",
  "#E07A5F",
  "#2F2F3A",
  "#F2F2F2",
  "#5DA9C9",
  "#B5654A",
];
const PANTS = ["#2E3440", "#4A5568", "#1F2A44", "#6B4F3A", "#3B3B3B"];
const SKIN = ["#F1C9A5", "#D9A37A", "#A8714D", "#7A4E33", "#E8B894"];

export const PEOPLE: PersonSpec[] = Array.from({ length: 30 }).map((_, i) => {
  const r = (k: string) => random(`p${i}${k}`);
  const kid = i % 4 === 0;
  // walkers criss-cross the plaza; a few stroll along the river railing
  const river = i % 7 === 3;
  const a: [number, number] = river ? [-26 + r("ax") * 20, -11.5] : [-20 + r("ax") * 40, -6 + r("az") * 24];
  const ang = r("ang") * Math.PI * 2;
  const len = 4 + r("len") * 12;
  const b: [number, number] = river
    ? [a[0] + 12 + r("bx") * 10, -11.5]
    : [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
  return {
    a,
    b,
    speed: kid ? 1.5 + r("s") * 0.6 : 0.9 + r("s") * 0.5,
    kid,
    jumper: kid ? 1.6 + r("j") * 1.2 : r("jj") > 0.55 ? 4 + r("j") * 3 : 0,
    v0: kid ? 2.5 + r("v") * 0.3 : 2.7 + r("v") * 0.3,
    shirt: SHIRTS[i % SHIRTS.length],
    pants: PANTS[i % PANTS.length],
    skin: SKIN[i % SKIN.length],
    phase: r("ph") * 10,
  };
});

export type PersonState = {
  x: number;
  y: number;
  z: number;
  heading: number;
  walk: number;
  tumble: number;
  airborne: boolean;
};

/** People: ping-pong walk, scheduled jumps, and at (near) zero g every step lifts them off for good. */
export const simPeople = (t: number, ph: Physics = DEFAULT): PersonState[] =>
  PEOPLE.map((p, i) => {
    const dx = p.b[0] - p.a[0];
    const dz = p.b[1] - p.a[1];
    const len = Math.hypot(dx, dz) || 1;
    let s = (p.phase * p.speed) % (2 * len); // distance along the ping-pong loop
    let y = 0;
    let vy = 0;
    let vxFree = 0;
    let vzFree = 0;
    let x = 0;
    let z = 0;
    let free = false; // left the ground for good (zero g)
    let nextJump = p.jumper ? 1 + random(`nj${i}`) * p.jumper : Infinity;
    let tumble = 0;
    let spin = 0;
    let heading = Math.atan2(dx, dz);
    let walk = p.phase;
    const pos = (ss: number): [number, number, number] => {
      const m = ss % (2 * len);
      const k = m < len ? m / len : 2 - m / len;
      return [p.a[0] + dx * k, p.a[1] + dz * k, m < len ? 1 : -1];
    };
    [x, z] = pos(s);
    for (let tt = 0; tt < t; tt += DT) {
      const g = G0 * ph.gravity(tt);
      if (free) {
        x += vxFree * DT;
        z += vzFree * DT;
        y += vy * DT;
        vy -= g * DT;
        vy += (ph.updraft?.(tt) ?? 0) * DT;
        tumble += spin * DT;
        continue;
      }
      const [nx, nz, dir] = pos(s + p.speed * DT);
      const vx = (nx - x) / DT;
      const vz = (nz - z) / DT;
      x = nx;
      z = nz;
      s += p.speed * DT;
      walk += p.speed * DT * 5.2;
      heading = Math.atan2(dx * dir, dz * dir);
      if (y > 0 || vy > 0) {
        y += vy * DT;
        vy -= g * DT;
        if (y <= 0) {
          y = 0;
          vy = 0;
        }
      } else if (tt >= nextJump) {
        vy = p.v0;
        nextJump = tt + p.jumper;
      } else if (ph.gravity(tt) < 0.03 && tt > ph.zeroAt - 2) {
        // a normal step with almost nothing pulling back: off they go
        vy = 0.25 + random(`f${i}`) * 0.45;
        free = true;
        vxFree = vx * 0.6;
        vzFree = vz * 0.6;
        spin = (random(`sp${i}`) - 0.5) * 0.9;
      }
      if (vy > 0 && ph.gravity(tt) <= 0) {
        free = true;
        vxFree = vx;
        vzFree = vz;
        spin = (random(`sp${i}`) - 0.5) * 0.7;
      }
    }
    return { x, y, z, heading, walk, tumble, airborne: y > 0.01 || free };
  });

/* ------------------------------------------------------------------ */
/* Fountain                                                             */
/* ------------------------------------------------------------------ */

export const FOUNTAIN = { x: -8, z: 3, top: 2.4, rim: 4.4, water: 0.55 };
const JETS = [
  { x: 0, z: 0, y: FOUNTAIN.top, vx: 0, vz: 0, vy: 6.5 },
  ...Array.from({ length: 10 }).map((_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return {
      x: Math.cos(a) * 3.9,
      z: Math.sin(a) * 3.9,
      y: FOUNTAIN.water,
      vx: -Math.cos(a) * 1.25,
      vz: -Math.sin(a) * 1.25,
      vy: 4.6,
    };
  }),
];
const DROPS_PER_JET = 22;

export type Drop = { x: number; y: number; z: number; o: number; s: number };

/** Droplets on ballistic arcs under the current g. At zero g the jets simply keep going up. */
export const drops = (t: number, pressure: number, ph: Physics = DEFAULT): Drop[] => {
  const g = G0 * ph.gravity(t);
  const out: Drop[] = [];
  JETS.forEach((j, ji) => {
    const flight = g > 0.05 ? (2 * j.vy) / g : Infinity;
    const cycle = Math.min(5, Math.max(1.2, flight * 1.05));
    for (let k = 0; k < DROPS_PER_JET; k++) {
      const age = (t + (k / DROPS_PER_JET) * cycle + ji * 0.13) % cycle;
      const v = pressure; // jets weaken as the air (and the pump's push against it) goes
      const y = j.y + j.vy * v * age - 0.5 * g * age * age;
      if (y < FOUNTAIN.water - 0.05) continue;
      const fade = Math.min(1, (cycle - age) / (cycle * 0.3));
      out.push({
        x: FOUNTAIN.x + j.x + j.vx * age,
        y,
        z: FOUNTAIN.z + j.z + j.vz * age,
        o: fade,
        s: ji === 0 ? 0.26 : 0.19,
      });
    }
  });
  return out;
};

/* ------------------------------------------------------------------ */
/* Cars                                                                 */
/* ------------------------------------------------------------------ */

export const ROAD_X = 21;
export const CARS = [
  { z0: 30, speed: 7, color: "#C0392B" },
  { z0: 12, speed: 6.4, color: "#2C3E50" },
  { z0: -4, speed: 7.4, color: "#ECF0F1" },
];
const BUMPS = [18, 2, -8];

/** Cars drive down the road; at low g the speed bumps start launching them. */
export const simCars = (t: number, ph: Physics = DEFAULT) =>
  CARS.map((c, i) => {
    let z = c.z0;
    let y = 0;
    let vy = 0;
    let pitch = 0;
    let lastZ = z;
    for (let tt = 0; tt < t; tt += DT) {
      const g = G0 * ph.gravity(tt);
      z -= c.speed * DT;
      if (z < -16 && y <= 0) z += 50;
      for (const b of BUMPS) {
        if (lastZ > b && z <= b && y <= 0.001) vy = 1.1 + 0.4 * (i % 2);
      }
      lastZ = z;
      if (y > 0 || vy > 0) {
        y += vy * DT;
        vy -= g * DT;
        if (y > 0.5) vy += (ph.updraft?.(tt) ?? 0) * DT;
        pitch = Math.max(-0.4, Math.min(0.4, vy * 0.08));
        if (y <= 0) {
          y = 0;
          vy = 0;
          pitch = 0;
        }
      }
    }
    return { z, y, pitch, color: c.color };
  });
export const BUMP_Z = BUMPS;

/* ------------------------------------------------------------------ */
/* River blobs, leaves, balloons                                        */
/* ------------------------------------------------------------------ */

export const RIVER = { z0: -24, z1: -14, level: -0.6 };

/** After zero g the river surface tears into wobbling blobs that drift up. */
export const blobs = (t: number, ph: Physics = DEFAULT) =>
  Array.from({ length: 22 }).flatMap((_, i) => {
    const at = ph.zeroAt + 0.8 + i * 0.42;
    if (t < at) return [];
    const age = t - at;
    const r = (k: string) => random(`bl${i}${k}`);
    const size = 0.5 + r("s") * 1.4;
    const grow = Math.min(1, age / 1.2);
    return [
      {
        x: -30 + r("x") * 60,
        z: RIVER.z0 + 1.5 + r("z") * (RIVER.z1 - RIVER.z0 - 3),
        y: RIVER.level + (0.3 + r("v") * 0.7) * age * age * 0.35 + age * 0.15,
        size: size * grow,
        wob: Math.sin(age * (3 + r("w") * 2)) * 0.18,
      },
    ];
  });

export const TREES = [
  { x: 10, z: -7, s: 1.25 },
  { x: -17, z: -8, s: 1.0 },
  { x: 15, z: 9, s: 0.9 },
];

/** Leaves: fall slower and slower, then hang in the air. */
export const leaves = (t: number, ph: Physics = DEFAULT) =>
  Array.from({ length: 24 }).flatMap((_, i) => {
    const tree = TREES[i % TREES.length];
    const at = (i * 1.37) % 30;
    if (t < at) return [];
    const r = (k: string) => random(`lf${i}${k}`);
    let y = 6 * tree.s + r("y") * 2;
    for (let tt = at; tt < t; tt += DT) {
      const g = ph.gravity(tt);
      y -= (0.9 * Math.sqrt(g) - (g <= 0 ? 0.08 : 0)) * DT;
      if (y < 0.05) {
        y = 0.05;
        break;
      }
    }
    const age = t - at;
    return [
      {
        x: tree.x + (r("x") - 0.5) * 5 + Math.sin(age * 1.7 + i) * 0.6,
        y,
        z: tree.z + (r("z") - 0.5) * 5 + Math.cos(age * 1.3 + i) * 0.4,
        rot: age * (1 + r("r")),
      },
    ];
  });

/** Balloons swell as the air thins and pop one after another. */
export const BALLOONS = [
  "#E74C3C",
  "#F1C40F",
  "#3498DB",
  "#9B59B6",
  "#2ECC71",
  "#E67E22",
  "#FF6FA8",
  "#1ABC9C",
];
export const balloonPop = (i: number) => AIR_START + 1.6 + i * 0.45 + random(`bp${i}`) * 0.3;
export const balloonSwell = (t: number, i: number) => {
  const k = Math.max(0, Math.min(1, (t - AIR_START) / (balloonPop(i) - AIR_START)));
  return 1 + k * k * 0.9;
};
export { AIR_GONE };
