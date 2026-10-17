import TL from "./timeline.json";

/**
 * The Roadster video's timeline (scripts/generate-roadster-path.py): per frame which segment it's in (the
 * driver's seat on run 1, the phone replay in the crowd, run 2, the bullet time) and the world time; every
 * cue in video and world seconds.
 */

export const FPS = TL.fps as number;
const FRAMES = TL.frames as [number, number][];
export const NFRAMES = FRAMES.length;
export const DURATION = NFRAMES;
/** video-second cues */
export const CUE = TL.cues as Record<string, number>;
/** world-second cues */
export const CUE_W = TL.cuesW as unknown as Record<string, number> & { splashes: number[] };
export const SEGS = TL.segs as { name: string; v0: number; v1: number; w0: number; w1: number }[];

export type Seg = "pov1" | "replay" | "pov2" | "bullet";
const SEG_NAMES: Seg[] = ["pov1", "replay", "pov2", "bullet"];

const at = (frame: number) => FRAMES[Math.max(0, Math.min(NFRAMES - 1, Math.round(frame)))];
/** World time at a frame (fractional frames interpolate within a segment). */
export const wAt = (frame: number) => {
  const i = Math.floor(frame);
  const a = at(i);
  const b = at(i + 1);
  const k = frame - i;
  if (a[0] !== b[0] || k === 0) return a[1];
  return a[1] + (b[1] - a[1]) * k;
};
export const segAt = (frame: number): Seg => SEG_NAMES[at(frame)[0]];

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
export const smoother = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * k * (k * (k * 6 - 15) + 10);
};
/** Up over [a, a+r], held, down over [b-r, b]. */
export const span = (x: number, a: number, b: number, r = 0.25) => smooth(a, a + r, x) * (1 - smooth(b - r, b, x));
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth value noise in [-1, 1]. */
export const vnoise = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i + seed * 57.3) * 2 - 1;
  const b = hash(i + 1 + seed * 57.3) * 2 - 1;
  return a + (b - a) * u;
};
