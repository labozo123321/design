import TL from "./timeline.json";

/**
 * The Looks timeline (scripts/generate-looks-timeline.py): per frame the world time (slowed in each edit,
 * stopped while a photo is held), how far into an edit the picture is, and which photo is being held; and
 * every cue in video and world seconds.
 */

type Frame = { w: number; edit: number; hold: { photo: number; t: number } | null };
const FRAMES = TL.frames as Frame[];

export const FPS = TL.fps;
export const NFRAMES = FRAMES.length;
export const DURATION = NFRAMES;
export const CUE = TL.cues as Record<string, number>;
export const CUE_W = TL.cuesW as Record<string, number>;
export const KIDS = TL.kids as string[];
export const EDIT_SPEED = TL.editSpeed;

const at = (frame: number) => FRAMES[Math.max(0, Math.min(NFRAMES - 1, Math.round(frame)))];
/** World time at a frame. */
export const wAt = (frame: number) => at(frame).w;
/** 0..1: how far into a sigma edit. */
export const editAt = (frame: number) => at(frame).edit;
/** The photo being held after a flash (index into the holds: the kids in order, then the photographer). */
export const holdAt = (frame: number) => at(frame).hold;

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Up over [a, a+r], held, down over [b-r, b]. */
export const span = (x: number, a: number, b: number, r = 0.25) => smooth(a, a + r, x) * (1 - smooth(b - r, b, x));
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
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
/** A kid's cue in world time: W("mewer", "flash"). */
export const W = (kid: string, beat: string) => CUE_W[`${kid}.${beat}`];
/** A kid's cue in video time. */
export const V = (kid: string, beat: string) => CUE[`${kid}.${beat}`];
