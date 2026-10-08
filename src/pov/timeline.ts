/**
 * POV · gravity is switching off. 66 s at 30 fps, no narration.
 * scripts/generate-pov-path.py writes track.json: the viewer's per-frame position, look angles and fov,
 * plus step / take-off / landing events. Picture and sound both read it.
 */
import TRACK from "./track.json";

export const POV_FPS = TRACK.fps;
export const POV_DURATION = TRACK.frames;
export const T = TRACK;
export const FLOAT_AT = TRACK.floatAt;
export const UPDRAFT_AT = 38;
export const EARTH_R = 6371000;

/** Same schedule the track was simulated with: 100% until 4 s, zero at 32 s. */
export const gravity = (t: number) => Math.min(1, Math.max(0, 1 - (t - 4) / 28));
/** The atmosphere rushing up into space carries everything loose with it. */
export const updraft = (t: number) => Math.min(6, Math.max(0, (t - UPDRAFT_AT) * 2));
export const PHYSICS = { gravity, zeroAt: 32, updraft };

export type Cam = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; fov: number };
export const camAt = (frame: number): Cam => {
  const f = Math.max(0, Math.min(T.frames - 1, Math.round(frame)));
  return {
    x: T.x[f],
    y: T.y[f],
    z: T.z[f],
    yaw: T.yaw[f],
    pitch: T.pitch[f],
    roll: T.roll[f],
    fov: T.fov[f],
  };
};

/** Gravity pulses: when each one hits, how hard, and where the viewer stood (the shockwave's centre). */
export const PULSES = TRACK.pulses.map((f, i) => ({
  t: f / TRACK.fps,
  k: TRACK.pulseK[i],
  x: TRACK.x[f],
  z: TRACK.z[f],
}));
/** The most recent pulse at time t, with its age in seconds (null before the first). */
export const lastPulse = (t: number) => {
  let p: (typeof PULSES)[number] | null = null;
  for (const q of PULSES) if (t >= q.t) p = q;
  return p ? { ...p, age: t - p.t } : null;
};
