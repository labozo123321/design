import { random } from "remotion";

/** Smooth, deterministic 1D value noise in [-1, 1]. */
export const noise1D = (seed: string, t: number): number => {
  const i = Math.floor(t);
  const f = t - i;
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
};

/** Seeded handheld camera shake. `amp` in px; rotation is a fraction of it, in degrees. */
export const shake = (seed: string, frame: number, amp: number, speed = 0.33) => ({
  x: noise1D(`${seed}-x`, frame * speed) * amp,
  y: noise1D(`${seed}-y`, frame * speed) * amp,
  r: noise1D(`${seed}-r`, frame * speed) * amp * 0.035,
});

/** Random value held for `hold` frames: the building block of glitch timing. */
export const stepRandom = (seed: string, frame: number, hold = 1) =>
  random(`${seed}-${Math.floor(frame / hold)}`);

/** Random integer in [lo, hi]. */
export const randInt = (seed: string, lo: number, hi: number) =>
  lo + Math.floor(random(seed) * (hi - lo + 1));
