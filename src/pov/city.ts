/**
 * Procedural city around the plaza: a grid of blocks with lots, a downtown cluster north of the river,
 * parks, street trees and traffic. Deterministic (seeded) so every frame sees the same city.
 */
import { random } from "remotion";

export const BLOCK = 96; // block pitch, m
export const STREET = 16; // street width, m
export const CITY_R = 1500;
export const DOWNTOWN = { x: 60, z: -420 };
const PALETTE = [
  "#A9483A",
  "#C8693E",
  "#C9B9A3",
  "#8C9DB5",
  "#B9B4AE",
  "#D8D2C6",
  "#9A8C7A",
  "#6F7C8C",
  "#E2DCCF",
  "#B5654A",
];

/** Areas kept clear: the plaza, the riverbanks, the near buildings of the plaza scene. */
const clear = (x: number, z: number, r: number) =>
  (x > -70 - r && x < 70 + r && z > -60 - r && z < 60 + r) || (z > -30 - r && z < -8 + r);

export type Building = { x: number; z: number; w: number; d: number; h: number; c: string; roof: number };
export type Tree = { x: number; z: number; s: number };
export type Park = { x: number; z: number; w: number; d: number };

export const city = (() => {
  const buildings: Building[] = [];
  const trees: Tree[] = [];
  const parks: Park[] = [];
  const n = Math.ceil(CITY_R / BLOCK);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const cx = i * BLOCK + BLOCK / 2;
      const cz = j * BLOCK + BLOCK / 2;
      const dist = Math.hypot(cx, cz);
      if (dist > CITY_R) continue;
      const inner = BLOCK - STREET;
      if (clear(cx, cz, inner / 2)) continue;
      const r = (k: string) => random(`b${i},${j}${k}`);
      // street trees along two sides of the block
      for (let k = 0; k < 6; k++) {
        trees.push({
          x: cx - inner / 2 + (k + 0.5) * (inner / 6),
          z: cz + inner / 2 + 0.9,
          s: 0.8 + r(`t${k}`) * 0.4,
        });
      }
      if (r("park") < 0.08 && dist > 250) {
        parks.push({ x: cx, z: cz, w: inner, d: inner });
        for (let k = 0; k < 22; k++)
          trees.push({
            x: cx + (r(`px${k}`) - 0.5) * inner * 0.9,
            z: cz + (r(`pz${k}`) - 0.5) * inner * 0.9,
            s: 0.9 + r(`ps${k}`) * 0.8,
          });
        continue;
      }
      const dd = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z);
      const tall = Math.exp(-dd / 300);
      // 2x2 or 3x2 lots per block
      const cols = r("c") < 0.5 ? 2 : 3;
      const rows = 2;
      for (let a = 0; a < cols; a++)
        for (let b = 0; b < rows; b++) {
          const lw = inner / cols;
          const ld = inner / rows;
          const k = `${a}${b}`;
          const w = lw * (0.7 + r(`w${k}`) * 0.25);
          const d = ld * (0.7 + r(`d${k}`) * 0.25);
          const base = 9 + r(`h${k}`) * 16;
          const h = base + tall * (40 + r(`H${k}`) * 190) + (r(`spike${k}`) > 0.93 ? 30 : 0);
          buildings.push({
            x: cx - inner / 2 + lw * (a + 0.5),
            z: cz - inner / 2 + ld * (b + 0.5),
            w,
            d,
            h,
            c: PALETTE[Math.floor(r(`col${k}`) * PALETTE.length)],
            roof: r(`roof${k}`),
          });
        }
    }
  return { buildings, trees, parks };
})();

/** The city ground sits 0.4 m below the plaza (a raised square), so distant layers never z-fight. */
export const GROUND_Y = -0.4;
export const RIVER_Z0 = -24.5;
export const RIVER_Z1 = -13.5;
const CAR_COLORS = ["#C0392B", "#2C3E50", "#ECF0F1", "#7F8C8D", "#1F3A5F", "#D4AC0D", "#111111", "#4E7F5A"];

/** North-south streets that carry traffic (and get a bridge over the river). The plaza street is pedestrian. */
export const NS_STREETS = (() => {
  const out: number[] = [];
  const n = Math.ceil(CITY_R / BLOCK);
  for (let i = -n; i <= n; i++) {
    const x = i * BLOCK;
    if (i === 0 || Math.abs(x) > CITY_R - 80) continue;
    out.push(x);
  }
  return out;
})();

/** Parked cars along the east-west streets, mid-block only (never in an intersection), static. */
export const parked = (() => {
  const out: { x: number; z: number; rot: number; c: string }[] = [];
  const n = Math.ceil(CITY_R / BLOCK);
  for (let j = -n; j <= n; j++) {
    const z0 = j * BLOCK;
    if (z0 > -34 && z0 < -4) continue; // the river
    for (let i = -n; i < n; i++) {
      for (let slot = 0; slot < 6; slot++) {
        for (const side of [-1, 1]) {
          const r = (k: string) => random(`pk${i},${j},${slot},${side}${k}`);
          if (r("occ") > 0.55) continue;
          const x = i * BLOCK + 16 + slot * 12.5;
          const z = z0 + side * 4.6;
          if (Math.hypot(x, z) > CITY_R - 40) continue;
          if (x > -85 && x < 85 && z > -75 && z < 75) continue; // the plaza
          out.push({
            x,
            z,
            rot: side > 0 ? Math.PI / 2 : -Math.PI / 2,
            c: CAR_COLORS[Math.floor(r("c") * CAR_COLORS.length)],
          });
        }
      }
    }
  }
  return out;
})();

/**
 * Moving traffic on the north-south streets. Every car in a lane shares the lane's speed (so they keep
 * their spacing), crosses the river on its bridge, and shrinks away at the city's edge instead of popping.
 */
export const traffic = (t: number) => {
  const out: { x: number; z: number; rot: number; c: string; scale: number }[] = [];
  for (const x0 of NS_STREETS) {
    const L = Math.sqrt(CITY_R * CITY_R - x0 * x0) - 40;
    for (const dir of [-1, 1]) {
      const r = (k: string) => random(`car${x0},${dir}${k}`);
      const speed = 9 + r("s") * 4;
      const count = Math.max(1, Math.floor((2 * L) / 140));
      const base = r("o") * 2 * L;
      for (let c = 0; c < count; c++) {
        const s = ((((base + (c / count) * 2 * L + t * speed * dir) % (2 * L)) + 2 * L) % (2 * L)) - L;
        const scale = Math.min(1, Math.max(0, (L - Math.abs(s)) / 25));
        if (scale <= 0.01) continue;
        out.push({
          x: x0 + dir * 3,
          z: s,
          rot: dir > 0 ? 0 : Math.PI,
          c: CAR_COLORS[Math.floor(random(`cc${x0},${dir},${c}`) * CAR_COLORS.length)],
          scale,
        });
      }
    }
  }
  return out;
};
