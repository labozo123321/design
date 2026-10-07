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
          z: cz + inner / 2 + 2,
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

/** Traffic: cars along the east-west and north-south streets, moving at a steady pace. */
export const traffic = (t: number) => {
  const out: { x: number; z: number; rot: number; c: string }[] = [];
  const n = Math.ceil(CITY_R / BLOCK);
  const colors = ["#C0392B", "#2C3E50", "#ECF0F1", "#7F8C8D", "#1F3A5F", "#D4AC0D", "#111"];
  for (let i = -n; i <= n; i++) {
    for (let lane = 0; lane < 4; lane++) {
      const r = (k: string) => random(`car${i},${lane}${k}`);
      const ns = lane < 2;
      const dir = lane % 2 ? 1 : -1;
      const line = i * BLOCK + (ns ? 0 : 0) + (lane % 2 ? 3 : -3);
      const speed = 9 + r("s") * 5;
      const s = ((((r("o") * 3000 + t * speed * dir) % 3000) + 3000) % 3000) - 1500;
      const x = ns ? line : s;
      const z = ns ? s : line;
      if (Math.hypot(x, z) > CITY_R || clearRoad(x, z)) continue;
      out.push({
        x,
        z,
        rot: ns ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        c: colors[Math.floor(r("c") * colors.length)],
      });
    }
  }
  return out;
};
const clearRoad = (x: number, z: number) => (x > -80 && x < 80 && z > -70 && z < 70) || (z > -30 && z < -8);
