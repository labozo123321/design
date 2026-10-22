/**
 * The simple cut: the same house and the same two people, but only four nights, each played slower, with a
 * fade to black between them and nothing else in between (no time-lapses, no flash cuts, no side gags).
 *
 *   2004  your first night in your own room: she knocks, you answer
 *   2009  the storm: eleven knocks, and she comes
 *   2013  her last night home: you almost don't answer
 *   2025  Christmas Eve: you knock first; this time you go to her
 *
 * Each night maps a stretch of the long film's timeline (the director's seconds) onto the cut's own seconds
 * through a smooth time warp: a few knots (cut second, film second) joined by a monotone cubic, so the
 * speed changes gently. Quicker through the stillness, slowest where someone gets up and crosses the house
 * (those play close to a real walking pace). The picture, the HUD and the sound all read their moments
 * through srcAt() and outAt(). (scripts/generate-knock-cut-audio.py keeps a copy of the knots.)
 */

export const CUT_FPS = 30;
export const CUT_SECONDS = 70;
export const CUT_FRAMES = CUT_SECONDS * CUT_FPS;

export type Seg = {
  /** the cut's seconds */
  o0: number;
  o1: number;
  /** (cut second, film second), from (o0, s0) to (o1, s1) */
  knots: [number, number][];
  year: string;
};

export const SEGS: Seg[] = [
  // stillness under the title a little quicker; her knock and your answer slow (stops short of the 8.0
  // flash into the time-lapse)
  { o0: 0.0, o1: 12.0, year: "2004", knots: [[0.0, 0.0], [4.4, 3.5], [10.6, 7.0], [12.0, 7.95]] },
  // your eleven knocks; then her waking and getting up, the walk across the house, lying down on your rug
  // (stops before the 22.5 flash)
  { o0: 12.0, o1: 27.5, year: "2009", knots: [[12.0, 15.0], [15.9, 17.4], [18.9, 18.6], [22.7, 20.7], [27.5, 22.4]] },
  // her knocks waiting; your roll over and answer slow (after the 28.0 flash, before the 36.0 one)
  { o0: 27.5, o1: 39.5, year: "2013", knots: [[27.5, 28.07], [28.83, 29.0], [34.7, 33.4], [38.7, 35.4], [39.5, 35.9]] },
  // (after the 49.0 flash: the mattress already against the wall) your three knocks; the wait; her answer;
  // her laughing knocks; you get up (slowest), the walk to her room, lying down on her rug
  {
    o0: 39.5,
    o1: 64.5,
    year: "2025",
    knots: [
      [39.5, 49.07],
      [41.64, 51.0],
      [45.74, 54.9],
      [46.97, 55.7],
      [50.22, 58.3],
      [51.55, 59.1],
      [54.96, 62.0],
      [57.2, 62.85],
      [61.28, 65.3],
      [63.74, 66.9],
      [64.5, 67.45],
    ],
  },
  // the end card over the last wide, held (the director dims it from 67.5)
  { o0: 64.5, o1: 70.0, year: "2025", knots: [[64.5, 67.45], [70.0, 72.95]] },
];

/** The cuts between the nights (through black). */
export const BOUNDS = [12.0, 27.5, 39.5];

// ------------------------------------------------------------------------------------------- the warp
/** Monotone cubic (Fritsch-Carlson) slopes at the knots. */
const slopesOf = (k: [number, number][]): number[] => {
  const n = k.length;
  const h = k.slice(1).map((p, i) => p[0] - k[i][0]);
  const d = k.slice(1).map((p, i) => (p[1] - k[i][1]) / h[i]);
  if (n === 2) return [d[0], d[0]];
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  const end = (h0: number, h1: number, d0: number, d1: number) => {
    let e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(e) !== Math.sign(d0)) e = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(e) > Math.abs(3 * d0)) e = 3 * d0;
    return e;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return m;
};
const SLOPES = SEGS.map((s) => slopesOf(s.knots));

const warp = (si: number, o: number): number => {
  const k = SEGS[si].knots;
  const m = SLOPES[si];
  const x = Math.min(Math.max(o, k[0][0]), k[k.length - 1][0]);
  let i = 0;
  while (i < k.length - 2 && x > k[i + 1][0]) i++;
  const h = k[i + 1][0] - k[i][0];
  const u = (x - k[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1];
};

const segIndex = (o: number) => {
  const i = SEGS.findIndex((s) => o >= s.o0 && o < s.o1);
  return i < 0 ? SEGS.length - 1 : i;
};
export const segAt = (o: number): Seg => SEGS[segIndex(o)];

/** The long film's moment shown at the cut's second o. */
export const srcAt = (o: number): number => warp(segIndex(o), o);

/** The cut's second at which a moment of the long film is shown (null if the cut leaves it out). */
export const outAt = (src: number): number | null => {
  for (let si = 0; si < 4; si++) {
    const k = SEGS[si].knots;
    if (src < k[0][1] || src > k[k.length - 1][1]) continue;
    let a = SEGS[si].o0;
    let b = SEGS[si].o1;
    for (let it = 0; it < 48; it++) {
      const c = (a + b) / 2;
      if (warp(si, c) < src) a = c;
      else b = c;
    }
    return (a + b) / 2;
  }
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
  for (const b of BOUNDS) k = Math.max(k, ramp(b - 0.7, b - 0.05) * (1 - ramp(b + 0.05, b + 0.8)));
  k = Math.max(k, ramp(69.2, 69.95));
  return k;
};
