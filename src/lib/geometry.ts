/**
 * Shared bar geometry.
 *
 * The alarm clock's seven-segment digits and the wall clock's ticks and hands
 * are all the same primitive: a bevelled bar with a centre, length, thickness
 * and angle. That is what makes the 6:00 → wall clock match cut a true morph:
 * every segment simply interpolates to a tick or a hand.
 */

export type Bar = {
  key: string;
  cx: number;
  cy: number;
  len: number;
  thick: number;
  /** degrees; 0 = horizontal */
  angle: number;
  lit: boolean;
  kind: "bar" | "dot";
};

/** Hexagonal LED-segment outline centred on the origin, pointing along +x. */
export const barPoints = (len: number, thick: number, gap = 0) => {
  const hl = Math.max(0.01, len / 2 - gap / 2);
  const ht = Math.max(0.01, thick / 2);
  const bevel = Math.min(ht, hl);
  const p = [
    [-hl, 0],
    [-hl + bevel, -ht],
    [hl - bevel, -ht],
    [hl, 0],
    [hl - bevel, ht],
    [-hl + bevel, ht],
  ];
  return p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
};

/* ------------------------------------------------------------------ */
/* Seven-segment layout                                                 */
/* ------------------------------------------------------------------ */

const DIGIT_SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgecd",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  " ": "",
};

export type SevenSegMetrics = {
  digitW: number;
  thick: number;
  gap: number;
  spacing: number;
  colonW: number;
  totalW: number;
};

export const sevenSegMetrics = (text: string, h: number): SevenSegMetrics => {
  const digitW = h * 0.52;
  const thick = h * 0.105;
  const gap = thick * 0.2;
  const spacing = h * 0.14;
  const colonW = thick * 2.6;
  const widths = [...text].map((ch) => (ch === ":" ? colonW : digitW));
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1);
  return { digitW, thick, gap, spacing, colonW, totalW };
};

/** Every segment (lit or not) of a seven-segment string centred on (cx, cy). */
export const layoutSevenSeg = (text: string, cx: number, cy: number, h: number): Bar[] => {
  const m = sevenSegMetrics(text, h);
  const { digitW: w, thick: t } = m;
  const top = cy - h / 2;
  let x = cx - m.totalW / 2;
  const bars: Bar[] = [];

  [...text].forEach((ch, ci) => {
    if (ch === ":") {
      const dx = x + m.colonW / 2;
      for (const [i, fy] of [0.32, 0.68].entries()) {
        bars.push({
          key: `${ci}-dot${i}`,
          cx: dx,
          cy: top + h * fy,
          len: t * 1.05,
          thick: t * 1.05,
          angle: 0,
          lit: true,
          kind: "dot",
        });
      }
      x += m.colonW + m.spacing;
      return;
    }
    const on = DIGIT_SEGMENTS[ch] ?? "";
    const hLen = w - t;
    const vLen = h / 2 - t / 2;
    const defs: Record<string, [number, number, number, number]> = {
      a: [w / 2, t / 2, hLen, 0],
      b: [w - t / 2, h / 4 + t / 4, vLen, 90],
      c: [w - t / 2, (3 * h) / 4 - t / 4, vLen, 90],
      d: [w / 2, h - t / 2, hLen, 0],
      e: [t / 2, (3 * h) / 4 - t / 4, vLen, 90],
      f: [t / 2, h / 4 + t / 4, vLen, 90],
      g: [w / 2, h / 2, hLen, 0],
    };
    for (const name of "abcdefg") {
      const [sx, sy, len, angle] = defs[name];
      bars.push({
        key: `${ci}-${name}`,
        cx: x + sx,
        cy: top + sy,
        len: len - m.gap,
        thick: t,
        angle,
        lit: on.includes(name),
        kind: "bar",
      });
    }
    x += w + m.spacing;
  });
  return bars;
};

/* ------------------------------------------------------------------ */
/* Wall clock                                                           */
/* ------------------------------------------------------------------ */

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Hour tick i (0 = 12 o'clock), pointing radially. */
export const tickBar = (cx: number, cy: number, R: number, i: number): Bar => {
  const cardinal = i % 3 === 0;
  const len = cardinal ? R * 0.2 : R * 0.13;
  const thick = cardinal ? R * 0.045 : R * 0.03;
  const rc = R * 0.9 - len / 2;
  const theta = rad(i * 30);
  return {
    key: `tick${i}`,
    cx: cx + rc * Math.sin(theta),
    cy: cy - rc * Math.cos(theta),
    len,
    thick,
    angle: i * 30 - 90,
    lit: true,
    kind: "bar",
  };
};

/** A hand at `deg` (clockwise from 12), pivoting on the clock centre. */
export const handBar = (
  cx: number,
  cy: number,
  deg: number,
  len: number,
  thick: number,
  tail: number,
  key = "hand",
): Bar => {
  const d = len / 2 - tail;
  const theta = rad(deg);
  return {
    key,
    cx: cx + d * Math.sin(theta),
    cy: cy - d * Math.cos(theta),
    len,
    thick,
    angle: deg - 90,
    lit: true,
    kind: "bar",
  };
};

export const clockHandSpecs = (R: number) => ({
  hour: { len: R * 0.62, thick: R * 0.06, tail: R * 0.1 },
  minute: { len: R * 0.9, thick: R * 0.04, tail: R * 0.12 },
  second: { len: R * 1.0, thick: R * 0.018, tail: R * 0.22 },
});

/** Shortest equivalent angle for a 180°-symmetric bar. */
export const nearestBarAngle = (from: number, to: number) => {
  let t = to;
  while (t - from > 90) t -= 180;
  while (t - from < -90) t += 180;
  return t;
};
