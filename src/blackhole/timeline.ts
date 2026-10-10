/**
 * POV · you fall into a black hole (Sagittarius A*). 70 s at 30 fps, no narration.
 * scripts/generate-bh-path.py writes track.json: the per-frame camera (position in units of the
 * Schwarzschild radius r_s, the hole at the origin; where you look; your velocity for the aberration) and
 * the real physics for the readouts (distance, speed, thrust, tidal stretch, your clock and Earth's).
 */
import TRACK from "./track.json";

export const T = TRACK;
export const BH_FPS = TRACK.fps;
export const BH_DURATION = TRACK.frames;
export const EV = TRACK.events;
export const CONSTS = TRACK.consts;
/** Light-crossing time of r_s (s): converts Earth seconds into the shader's time unit. */
export const T_RS = (CONSTS.rsKm * 1000) / 2.998e8;

export const clampF = (frame: number) => Math.max(0, Math.min(T.frames - 1, Math.round(frame)));

export type Cam = {
  pos: [number, number, number];
  fwd: [number, number, number];
  up: [number, number, number];
  fov: number;
  /** Your velocity relative to observers hovering where you are (units of c). */
  beta: [number, number, number];
  /** Your height above the horizon in r_s, for the picture (kept apart from 1 + eps for precision). */
  eps: number;
};

export const camAt = (frame: number): Cam => {
  const f = clampF(frame);
  const b = T.beta[f];
  const v = T.vdir[f];
  return {
    pos: T.pos[f] as [number, number, number],
    fwd: T.fwd[f] as [number, number, number],
    up: T.up[f] as [number, number, number],
    fov: T.fov[f],
    beta: [b * v[0], b * v[1], b * v[2]],
    eps: T.eVis[f],
  };
};

/** Earth (coordinate) time since you set off, seconds. */
export const earthAt = (frame: number) => T.earth[clampF(frame)];
