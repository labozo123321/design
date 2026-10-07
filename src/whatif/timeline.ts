/**
 * WHAT IF · gravity got 5% weaker every second. 41 s at 30 fps.
 * Gravity holds at 100% for 3 s, then drops 5 points a second and hits zero at 23 s.
 * From 31 s the air itself leaves: pressure falls to zero by 37 s, the sky goes black and sound dies.
 */
import VOICE from "./voice.json";

export const WI_FPS = 30;
export const WI_DURATION = 41 * WI_FPS;
export const LINES = VOICE.lines;

export const G0 = 9.81;
export const DROP_START = 3;
export const ZERO_AT = 23;
export const AIR_START = 31.5;
export const AIR_GONE = 37;

/** Gravity as a fraction of normal at time t (seconds). */
export const gravity = (t: number) => Math.min(1, Math.max(0, 1 - 0.05 * (t - DROP_START)));
/** Air pressure as a fraction of normal. */
export const air = (t: number) => {
  const k = Math.min(1, Math.max(0, (t - AIR_START) / (AIR_GONE - AIR_START)));
  return 1 - k * k * (3 - 2 * k);
};

/** HUD descriptor for a gravity reading. */
export const describe = (g: number) =>
  g >= 0.995
    ? "A SUMMER EVENING"
    : g > 0.8
      ? "BARELY NOTICEABLE"
      : g > 0.6
        ? "KIDS CLEARING BENCHES"
        : g > 0.4
          ? "HALF YOUR WEIGHT"
          : g > 0.2
            ? "CAR-HURDLING"
            : g > 0.05
              ? "MOON GRAVITY"
              : g > 0
                ? "ALMOST WEIGHTLESS"
                : "WEIGHTLESS";
