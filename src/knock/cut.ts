/**
 * The simple cut: the same house and the same two people, but only four nights, each played slower, with a
 * fade to black between them and nothing else in between (no time-lapses, no flash cuts, no side gags).
 *
 *   2004  your first night in your own room: she knocks, you answer
 *   2009  the storm: eleven knocks, and she comes
 *   2013  her last night home: you almost don't answer
 *   2025  Christmas Eve: you knock first; this time you go to her
 *
 * Each segment maps a stretch of the long film's timeline (the director's seconds) onto the cut's own
 * seconds at a slower speed. The picture, the HUD and the sound all read their moments through srcAt().
 */

export const CUT_FPS = 30;
export const CUT_SECONDS = 70;
export const CUT_FRAMES = CUT_SECONDS * CUT_FPS;

export type Seg = {
  /** the cut's seconds */
  o0: number;
  o1: number;
  /** the long film's seconds they show */
  s0: number;
  s1: number;
  year: string;
};

export const SEGS: Seg[] = [
  // (stops short of the 8.0 flash into the time-lapse)
  { o0: 0.0, o1: 13.5, s0: 0.0, s1: 7.95, year: "2004" },
  // (opens on the lightning; stops before the 22.5 flash)
  { o0: 13.5, o1: 27.0, s0: 15.0, s1: 22.4, year: "2009" },
  // (after the 28.0 flash, before the 36.0 one)
  { o0: 27.0, o1: 40.5, s0: 28.07, s1: 35.9, year: "2013" },
  // (after the 49.0 flash: the mattress already against the wall)
  { o0: 40.5, o1: 64.0, s0: 49.07, s1: 67.45, year: "2025" },
  // the end card over the last wide, held (the director dims it from 67.5)
  { o0: 64.0, o1: 70.0, s0: 67.45, s1: 73.45, year: "2025" },
];

export const segAt = (o: number): Seg => SEGS.find((s) => o >= s.o0 && o < s.o1) ?? SEGS[SEGS.length - 1];

/** The long film's moment shown at the cut's second o. */
export const srcAt = (o: number): number => {
  const s = segAt(o);
  const u = (Math.min(Math.max(o, s.o0), s.o1) - s.o0) / (s.o1 - s.o0);
  return s.s0 + (s.s1 - s.s0) * u;
};

/** The cut's second at which a moment of the long film is shown (null if the cut leaves it out). */
export const outAt = (src: number): number | null => {
  for (const s of SEGS.slice(0, 4)) if (src >= s.s0 && src <= s.s1) return s.o0 + ((src - s.s0) / (s.s1 - s.s0)) * (s.o1 - s.o0);
  return null;
};

/** How far into black the picture is (0 clear .. 1 black): in from black at the start, through black
 * between the nights, out to black at the very end. */
export const blackAt = (o: number): number => {
  const ramp = (a: number, b: number) => {
    const u = Math.min(1, Math.max(0, (o - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  let k = 1 - ramp(0.0, 0.8);
  for (const b of [13.5, 27.0, 40.5]) k = Math.max(k, ramp(b - 0.7, b - 0.05) * (1 - ramp(b + 0.05, b + 0.8)));
  k = Math.max(k, ramp(69.2, 69.95));
  return k;
};
