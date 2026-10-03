import { Easing, interpolate } from "remotion";

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type EasingFn = (t: number) => number;

/** Clamped 0 → 1 progress between two frames, with an optional easing curve. */
export const ramp = (frame: number, from: number, to: number, easing: EasingFn = (t) => t) =>
  interpolate(frame, [from, to], [0, 1], { ...CLAMP, easing });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** One easing vocabulary per art style. */
export const EASE = {
  /** Noir: slow and heavy, long tails on both ends. */
  noir: Easing.bezier(0.45, 0.05, 0.25, 1),
  /** Noir, accelerating into something (a stamp, a cut). */
  noirIn: Easing.bezier(0.55, 0, 0.85, 0.35),
  /** UI: quick out, confident settle. */
  ui: Easing.bezier(0.16, 1, 0.3, 1),
  uiInOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Whip pans and iris moves. */
  whip: Easing.bezier(0.8, 0, 0.12, 1),
  /** Editorial titles: long, elegant settle. */
  editorial: Easing.bezier(0.22, 1, 0.36, 1),
};

/** Glitch motion is quantised: n hard steps instead of a curve. */
export const steps =
  (n: number): EasingFn =>
  (t) =>
    t >= 1 ? 1 : Math.floor(t * n) / n;

/** Spring presets for the UI act. */
export const SPRING = {
  snappy: { damping: 20, stiffness: 240, mass: 0.7 },
  pop: { damping: 11, stiffness: 210, mass: 0.7 },
  drop: { damping: 9, stiffness: 150, mass: 0.85 },
  smooth: { damping: 200, stiffness: 90, mass: 1 },
  fill: { damping: 16, stiffness: 60, mass: 1 },
  tilt: { damping: 22, stiffness: 70, mass: 1.1 },
};
