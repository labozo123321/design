import S from "./script.json";

/** The film's single timeline (video seconds): beats, every knock, the odometer's keys, captions, events.
 * The picture, the overlay and the soundtrack all read it. */

export type Side = "N" | "Y";
export type Knock = { t: number; side: Side; kind: "tap" | "fist" | "hard" | "soft" | "urgent" | "pulse" | "grey"; count: boolean; gain: number; pitch: string | null; note: string };
export type Caption = { t0: number; t1: number; text: string };

export const FPS = S.fps;
export const DURATION = S.duration;
export const NFRAMES = S.frames;
export const BEATS = S.beats;
export const KNOCKS = S.knocks as Knock[];
export const CAPTIONS = S.captions as Caption[];
export const EVENTS = S.events;
export const TITLE = S.title;
export const beatAt = (t: number) => BEATS.find((b) => t >= b.t0 && t < b.t1) ?? BEATS[BEATS.length - 1];

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const smoother = (k: number) => {
  const x = clamp(k);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
