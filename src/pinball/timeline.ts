/**
 * POV · you're a pinball. 70 s at 30 fps, no narration.
 * scripts/generate-pinball-path.py simulates the ball's life on a standard playfield (every bounce is
 * physics; the player's flips were found by search) and writes track.json: per frame, the pinball time
 * shown (slow motion where things are fast), where you are and where you look, the other balls, the
 * flippers, and every event (bumper, sling, flipper, drop target, chomp, burp, jackpot, tilt...).
 *
 * Coordinates are three.js metres: x across the table, y up off the playfield, z towards the front
 * (the far end of the table is z = -1.067).
 */
import TRACK from "./track.json";

export const T = TRACK;
export const PB_FPS = TRACK.fps;
export const PB_DURATION = TRACK.frames;
export const M = TRACK.marks;
export const LAY = TRACK.layout;
export const BALL_R = LAY.R;

export const clampF = (frame: number) => Math.max(0, Math.min(T.frames - 1, Math.round(frame)));

/** Table (x across, y up the table) to three.js ground position. */
export const tp = (x: number, y: number, h = 0): [number, number, number] => [x, h, -y];

export type Ev = (typeof TRACK.events)[number];
export const EVENTS: Ev[] = TRACK.events;
export const eventsOf = (kind: string, ball?: string) =>
  EVENTS.filter((e) => e.kind === kind && (ball === undefined || e.ball === ball));

/**
 * Sum of decaying pulses from past events of a kind (video seconds): 1 at the hit, falling off with
 * time constant tau. Used for flashes, the bumpers' rings, shakes.
 */
export const pulse = (t: number, list: { t: number }[], tau: number, ahead = 0.0) => {
  let s = 0;
  for (const e of list) {
    const d = t - e.t;
    if (d < -ahead) continue;
    if (d > tau * 8) continue;
    s += d < 0 ? 1 + d / Math.max(ahead, 1e-6) : Math.exp(-d / tau);
  }
  return s;
};

/** The last event of a kind at or before t (video seconds), or null. */
export const lastEvent = (t: number, list: { t: number }[]) => {
  let best: { t: number } | null = null;
  for (const e of list) if (e.t <= t && (!best || e.t > best.t)) best = e;
  return best;
};

export const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Are we in the cold open (before the rewind ends)? Events in it carry `cold`. */
export const inColdOpen = (t: number) => t < M.rewind[1];
