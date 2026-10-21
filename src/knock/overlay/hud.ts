import { KNOCKS, FPS, clamp, smooth, smoother, lerp } from "../script";
import type { Side } from "../script";

/**
 * The HUD's state at any video time, as a pure function of t (seconds). The overlay draws it; the picture
 * (ring colours, the seam bloom) and the soundtrack (odometer ticks, the detent, chat pings) can read it.
 * Nothing here touches React or three.js.
 */

// ---------------------------------------------------------------- colours

export const NORA_BLUE = "#7FB4FF";
export const YOUR_AMBER = "#FFB45C";
/** the treadmill's rings (they never light a dot) */
export const GREY_RING = "#9AA3AB";
/** the side colour for a knock side */
export const sideColor = (s: Side) => (s === "N" ? NORA_BLUE : YOUR_AMBER);

/** The HUD tint follows the grade: warm white (2004-2011), neutral (2013), slate (drift), white-gold (payoff). */
export const TINTS = { warm: "#FFF1DD", neutral: "#EDEFF2", slate: "#B9C4CE", gold: "#FFE7B8" } as const;
/** [start of a 20-frame sweep, the colour it sweeps to] */
const TINT_KEYS: [number, string][] = [
  [-1, TINTS.warm],
  [28.0, TINTS.neutral],
  [36.0, TINTS.slate],
  [59.1, TINTS.gold],
];
const SWEEP = 20 / FPS;

export type RGB = [number, number, number];
export const hexRGB = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** an rgba() string for a colour */
export const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.round(a * 1000) / 1000})`;

export const tintAt = (t: number): RGB => {
  let c = hexRGB(TINT_KEYS[0][1]);
  for (let i = 1; i < TINT_KEYS.length; i++) {
    const [t0, h] = TINT_KEYS[i];
    if (t <= t0) break;
    c = mixRGB(c, hexRGB(h), smooth(t0, t0 + SWEEP, t));
  }
  return c;
};

/** The day-lit stretches of the picture (the two childhood time-lapses and the drift, whose sun strobes the
 *  rooms): the HUD's dark backing (top scrim, centre pad) deepens a step so the thin type holds. Hard cuts
 *  bound each one, so the step lands on a cut. */
export const DAY_SPANS: [number, number][] = [
  [8.0, 10.4],
  [13.9, 15.0],
  [36.0, 47.5],
];
export const dayLit = (t: number) => (DAY_SPANS.some(([a, b]) => t >= a && t < b) ? 1 : 0);

// ---------------------------------------------------------------- small helpers

/** deterministic 0..1 hash of an integer */
const hash = (n: number) => {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
};
const fmtClock = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const hm = (h: number, m: number) => h * 60 + m;
export const fmtThousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ---------------------------------------------------------------- the odometer

/** one counted step: a 0.4 s roll that overshoots a hair (3.5%) and settles back, like a detent */
const ROLL = 0.4;
const rollEase = (k: number) => {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return k < 0.72 ? 1.035 * smoother(k / 0.72) : 1.035 - 0.035 * smoother((k - 0.72) / 0.28);
};
const step = (t0: number, a: number, b: number) => (t: number) => lerp(a, b, rollEase((t - t0) / ROLL));
const spin = (t0: number, t1: number, a: number, b: number) => (t: number) => lerp(a, b, smoother((t - t0) / (t1 - t0)));
type OdoSeg = { t0: number; t1: number; f: (t: number) => number; spin?: boolean };
/** the drums' continuous value: rolls at each counted exchange, spins through the time-lapses */
const ODO: OdoSeg[] = [
  { t0: -1e9, t1: 8.0, f: step(6.7, 0, 1) },
  { t0: 8.0, t1: 10.4, f: spin(8.0, 10.4, 1, 897), spin: true },
  { t0: 10.4, t1: 14.3, f: step(13.9, 897, 898) },
  { t0: 14.3, t1: 15.0, f: spin(14.3, 15.0, 898, 1520), spin: true },
  { t0: 15.0, t1: 22.5, f: () => 1718 },
  { t0: 22.5, t1: 28.0, f: step(27.1, 2533, 2534) },
  { t0: 28.0, t1: 59.1, f: step(34.8, 3215, 3216) },
  { t0: 59.1, t1: 1e9, f: step(59.1, 3216, 3217) },
];
const odoSeg = (t: number) => ODO.find((s) => t >= s.t0 && t < s.t1) ?? ODO[ODO.length - 1];
/** the odometer's continuous value at t (e.g. 3216.4 mid-roll) */
export const odoValue = (t: number) => odoSeg(t).f(t);
/** the odometer's speed (counts per second), measured inside the current segment so cuts never read as speed */
const odoSpeed = (t: number) => {
  const s = odoSeg(t);
  const h = 1 / 240;
  const a = Math.max(s.t0, t - h);
  const b = Math.min(s.t1 - 1e-6, t + h);
  return b > a ? (s.f(b) - s.f(a)) / (b - a) : 0;
};
/** a drum's position (digit units, 0..10) for a value: the ones run free, each higher drum turns only while
 *  the drum below it goes 9 -> 0 (a real odometer's carry) */
const drumPos = (v: number, place: number) => {
  const p = Math.pow(10, place);
  if (place === 0) return ((v % 10) + 10) % 10;
  const base = Math.floor(v / p) % 10;
  const lower = v - Math.floor(v / p) * p;
  return base + Math.max(0, lower - (p - 1));
};
const wrap10 = (d: number) => ((((d + 5) % 10) + 10) % 10) - 5;

/** The drums' timeline for the soundtrack: one soft tick per step, the detent at the lock, the two spins. */
export const ODO_CUES = {
  ticks: [6.7, 13.9, 27.1, 34.8, 59.1],
  detent: 35.3,
  unlock: 59.1,
  spins: [
    [8.0, 10.4],
    [14.3, 15.0],
  ] as [number, number][],
};

// ---------------------------------------------------------------- the calendar (year, ages, clock, date line)

const DAY_MS = 86400000;
const day = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
/** the first goodnight (night 1) and the last one before she left (night 3216) */
export const FIRST_NIGHT = day(2004, 11, 3);
export const LAST_NIGHT = day(2013, 8, 23);
const XMAS = day(2025, 12, 24);
const ymdOf = (n: number) => {
  const d = new Date(n * DAY_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
};
const ageOn = (n: number, by: number, bm: number, bd: number) => {
  const [y, m, d] = ymdOf(n);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
};
/** Nora: Jun 9, 1995. You: Mar 14, 1998. */
export const noraAge = (n: number) => ageOn(n, 1995, 6, 9);
export const yourAge = (n: number) => ageOn(n, 1998, 3, 14);

/** a clock that flickers through a range of minutes, a new reading every 3 frames (time-lapses) */
const flick = (lo: number, hi: number, seed: number) => (t: number) => fmtClock(lo + Math.floor(hash(Math.floor((t * FPS) / 3) + seed) * (hi - lo + 1)));
const nightOfOdo = (t: number) => FIRST_NIGHT + Math.max(0, Math.floor(odoValue(t) + 1e-6) - 1);
/** the drift's night counter: 'LAST KNOCK · 1 NIGHT AGO' at 36.3, holding at 134 (Sat Jan 4, 2014) for mom's
 *  treadmill, then up to 1,093 (Aug 20, 2016) by 41.6 */
const driftNights = (t: number) => {
  if (t < 36.85) return 1;
  if (t < 37.0) return Math.round(1 + 133 * smoother((t - 36.85) / 0.15));
  if (t < 38.8) return 134;
  return Math.round(134 + 959 * smoother((t - 38.8) / 2.8));
};

type CalSeg = {
  t0: number;
  t1: number;
  night: (t: number) => number;
  clock: (t: number) => string;
  date?: string;
  /** a time-lapse: values flicker and snap rather than roll */
  lapse?: boolean;
  /** nights since the last goodnight (the drift's status line) */
  since?: (t: number) => number;
};
const at = (n: number) => () => n;
const say = (s: string) => () => s;
const CAL: CalSeg[] = [
  { t0: -1e9, t1: 8.0, night: at(FIRST_NIGHT), clock: say("9:02 PM"), date: "WED · NOV 3" },
  { t0: 8.0, t1: 10.4, night: nightOfOdo, clock: flick(hm(20, 31), hm(21, 48), 11), lapse: true },
  { t0: 10.4, t1: 13.9, night: at(day(2007, 4, 19)), clock: say("9:15 PM") },
  { t0: 13.9, t1: 15.0, night: nightOfOdo, clock: flick(hm(20, 31), hm(21, 48), 57), lapse: true },
  // 2:14 AM, the night of Fri Jul 17, 2009 (the ages are the same either side of midnight)
  { t0: 15.0, t1: 22.5, night: at(day(2009, 7, 17)), clock: say("2:14 AM") },
  { t0: 22.5, t1: 28.0, night: at(day(2011, 10, 11)), clock: say("11:52 PM") },
  { t0: 28.0, t1: 36.0, night: at(LAST_NIGHT), clock: say("11:58 PM"), date: "FRI · AUG 23" },
  { t0: 36.0, t1: 37.0, night: (t) => LAST_NIGHT + driftNights(t), since: driftNights, clock: flick(hm(21, 40), hm(23, 58), 91), lapse: true },
  // mom's treadmill, real time, a January afternoon
  { t0: 37.0, t1: 38.8, night: at(day(2014, 1, 4)), since: at(134), clock: say("3:40 PM") },
  { t0: 38.8, t1: 42.0, night: (t) => LAST_NIGHT + driftNights(t), since: driftNights, clock: flick(hm(21, 40), hm(23, 58), 133), lapse: true },
  { t0: 42.0, t1: 44.0, night: at(day(2017, 3, 14)), since: at(day(2017, 3, 14) - LAST_NIGHT), clock: say("12:01 AM") },
  { t0: 44.0, t1: 45.6, night: at(day(2020, 6, 9)), since: at(day(2020, 6, 9) - LAST_NIGHT), clock: say("11:58 PM") },
  { t0: 45.6, t1: 47.5, night: at(day(2024, 3, 14)), since: at(day(2024, 3, 14) - LAST_NIGHT), clock: say("4:37 PM") },
  { t0: 47.5, t1: 49.0, night: at(XMAS), since: at(XMAS - LAST_NIGHT), clock: say("8:12 PM"), date: "WED · DEC 24" },
  { t0: 49.0, t1: 55.0, night: at(XMAS), since: at(XMAS - LAST_NIGHT), clock: say("11:47 PM"), date: "WED · DEC 24" },
  { t0: 55.0, t1: 63.0, night: at(XMAS), since: at(XMAS - LAST_NIGHT), clock: say("11:49 PM"), date: "WED · DEC 24" },
  { t0: 63.0, t1: 66.5, night: at(XMAS), since: at(XMAS - LAST_NIGHT), clock: say("11:50 PM"), date: "WED · DEC 24" },
  { t0: 66.5, t1: 1e9, night: at(XMAS), since: at(XMAS - LAST_NIGHT), clock: say("11:51 PM"), date: "WED · DEC 24" },
];
const calSeg = (t: number) => CAL.find((s) => t >= s.t0 && t < s.t1) ?? CAL[CAL.length - 1];

type Base = { year: string; nora: string; you: string; clock: string; date: string; since: string; lapse: boolean };
const baseAt = (t: number): Base => {
  const s = calSeg(t);
  const n = s.night(t);
  return {
    year: String(ymdOf(n)[0]),
    nora: String(noraAge(n)),
    you: String(yourAge(n)),
    clock: s.clock(t),
    date: s.date ?? "",
    since: s.since ? fmtThousands(s.since(t)) : "",
    lapse: !!s.lapse,
  };
};

/** A text value that rolls when it changes: the new text rises into place over ROLL_FRAMES while the old one
 *  leaves upward. k is the roll's progress (1 = settled). Values in a time-lapse snap (k = 1). */
export type Rolled = { text: string; prev: string; k: number };
export const ROLL_FRAMES = 9;
/** the picture's hard cuts between eras */
const HARD_CUTS = [15.0, 22.5, 28.0, 49.0];
/** the time i frames before t, on the frame grid (t - i / FPS can land a hair short of a segment boundary
 *  that sits exactly on a frame, which would repeat one roll step and skip the next) */
const framesBack = (t: number, i: number) => {
  const f = t * FPS;
  const r = Math.round(f);
  return ((Math.abs(f - r) < 1e-4 ? r : f) - i) / FPS;
};
const rolled = (t: number, pick: (b: Base) => string): Rolled => {
  const b = baseAt(t);
  const cur = pick(b);
  if (b.lapse) return { text: cur, prev: cur, k: 1 };
  // on a hard cut in the picture the whole HUD changes with it, at once
  if (HARD_CUTS.some((c) => c > t - ROLL_FRAMES / FPS && c <= t + 1e-6)) return { text: cur, prev: cur, k: 1 };
  for (let i = 1; i <= ROLL_FRAMES; i++) {
    const p = pick(baseAt(framesBack(t, i)));
    if (p !== cur) return { text: cur, prev: p, k: i / ROLL_FRAMES };
  }
  return { text: cur, prev: cur, k: 1 };
};

// ---------------------------------------------------------------- the knock dots

/** Each exchange's dots go out 0.8 s after it ends (some are pinned by the treatment); [start, length] of
 *  each fade. Knocks belong to the first window that has not yet faded. */
const DOT_FADES: [number, number][] = [
  [7.4, 0.5], // b1
  [13.9, 0.25], // fight night: out on the cut back to the time-lapse
  [18.0, 0.5], // the storm's eleven
  [27.8, 0.2], // earplugs (dark by the cut at 28.0)
  [30.4, 0.5], // her last night: the unanswered first three
  [35.5, 0.25], // 'all dots go dark and stay dark'
  [62.6, 0.6], // the payoff
  [1e9, 0], // the end card: hers stay lit, yours stay dark
];
/** The eleven-knock bursts: while one runs, its side's held dots drop to half so the chase reads. */
type Hit = { t: number; side: Side; idx: number; level: number; win: number };
type Pulse = { t: number; side: Side; idx: number };
const HITS: Hit[] = [];
const PULSES: Pulse[] = [];
const BURSTS: { side: Side; t0: number; t1: number }[] = [];
{
  const counts = new Map<string, number>();
  const pulseCount: Record<Side, number> = { N: 0, Y: 0 };
  const ks = [...KNOCKS].sort((a, b) => a.t - b.t);
  for (const k of ks) {
    if (k.kind === "grey") continue; // mom's treadmill: the HUD refuses to count it
    if (k.kind === "pulse") {
      PULSES.push({ t: k.t, side: k.side, idx: pulseCount[k.side]++ % 3 });
      continue;
    }
    const win = DOT_FADES.findIndex(([f]) => k.t < f);
    const key = `${win}${k.side}`;
    const c = counts.get(key) ?? 0;
    counts.set(key, c + 1);
    HITS.push({ t: k.t, side: k.side, idx: c % 3, level: k.gain <= 0.5 ? 0.5 : 1, win });
  }
  for (const side of ["N", "Y"] as Side[]) {
    const u = ks.filter((k) => k.kind === "urgent" && k.side === side);
    let i = 0;
    while (i < u.length) {
      let j = i;
      while (j + 1 < u.length && u[j + 1].t - u[j].t < 0.5) j++;
      BURSTS.push({ side, t0: u[i].t, t1: u[j].t });
      i = j + 1;
    }
  }
}
/** One dot: on = held brightness 0..1 (pulses light it faintly), bloom = the flash of a fresh knock 0..1,
 *  ring = the phase 0..1 of the little ripple a fresh knock sends out of it (-1 when none). */
export type DotState = { on: number; bloom: number; ring: number };
const RING_S = 0.6;
const dotAt = (t: number, side: Side, idx: number): DotState => {
  let on = 0;
  let bloom = 0;
  let ring = -1;
  let burstMul = 1;
  for (const b of BURSTS) {
    if (b.side !== side) continue;
    if (t >= b.t0 && t < b.t1 + 0.5) burstMul = Math.min(burstMul, lerp(0.5, 1, smooth(b.t1 + 0.12, b.t1 + 0.5, t)));
  }
  for (const h of HITS) {
    if (h.side !== side || h.idx !== idx || h.t > t) continue;
    const [f0, fl] = DOT_FADES[h.win];
    const fade = fl > 0 ? 1 - smooth(f0, f0 + fl, t) : 1;
    if (fade <= 0) continue;
    const dt = t - h.t;
    const attack = clamp((dt + 1 / FPS) / (2 / FPS)); // half on the knock's own frame, full on the next
    on = Math.max(on, h.level * attack * burstMul * fade);
    bloom = Math.max(bloom, h.level * Math.exp(-dt / 0.16) * attack * fade);
    if (dt < RING_S) ring = dt / RING_S;
  }
  for (const p of PULSES) {
    if (p.side !== side || p.idx !== idx || p.t > t) continue;
    if ((p.t < 10.4 && t >= 10.4) || (p.t < 15.0 && t >= 15.0)) continue;
    const dt = t - p.t;
    if (dt > 1.2) continue;
    on = Math.max(on, 0.32 * clamp(dt / 0.034) * Math.exp(-dt / 0.2));
  }
  return { on: clamp(on), bloom: clamp(bloom), ring };
};

// ---------------------------------------------------------------- the state

export type HudState = {
  t: number;
  /** the whole HUD's opacity (fades in 2.6-3.2) */
  alpha: number;
  /** the left and right blocks' opacity (they leave for the end card) */
  sides: number;
  /** 0..1: the centre block shrinking to 70% at the top for the end card */
  endK: number;
  /** the tint (the HUD's text colour) as RGB 0..255 */
  tint: RGB;
  year: Rolled;
  ages: { nora: Rolled; you: Rolled; text: string };
  clock: Rolled & { flicker: boolean };
  date: { text: string; alpha: number };
  odometer: {
    /** continuous value (3216.5 = halfway through the 3216 -> 3217 roll) */
    value: number;
    /** the integer the drums read (the value rounded) */
    shown: number;
    /** progress 0..1 of the current roll between two integers (0 when settled) */
    phase: number;
    spinning: boolean;
    /** counts per second */
    speed: number;
    /** drum brightness: 1, or 0.4 while locked (35.3-59.1) */
    dim: number;
    /** 0..1: the underline gone grey (the detent lock) */
    lock: number;
    /** 0..1: the gentle bloom swell on the 3217 roll */
    glow: number;
    /** thousands, hundreds, tens, ones: position in digit units (0..10) and vertical motion blur (px) */
    drums: { pos: number; blur: number }[];
  };
  dots: { N: DotState[]; Y: DotState[] };
  status: {
    /** the full line as read ('' when none) */
    text: string;
    /** 'LAST KNOCK · ' + num + suffix, and its opacity */
    last: { num: Rolled; suffix: string; alpha: number };
    /** the shiver on the digits (52.6-53.2): vertical offset px, opacity multiplier */
    shiver: { dy: number; alpha: number };
    /** 'WAITING FOR AN ANSWER' and its bar */
    waiting: { alpha: number; progress: number };
  };
};

const PITCH_PX = 76;
export const hudState = (t: number): HudState => {
  const alpha = smooth(2.6, 3.2, t);
  const sides = 1 - smooth(67.5, 67.9, t);
  const endK = smoother((t - 67.5) / 0.6);
  const b = baseAt(t);

  // odometer
  const value = odoValue(t);
  const seg = odoSeg(t);
  const speed = odoSpeed(t);
  const drums = [3, 2, 1, 0].map((place) => {
    const pos = drumPos(value, place);
    const avg = Math.abs(speed) / Math.pow(10, place);
    let sp = avg;
    if (avg < 3) {
      const h = 1 / 240;
      const a = Math.max(seg.t0, t - h);
      const c = Math.min(seg.t1 - 1e-6, t + h);
      sp = c > a ? Math.abs(wrap10(drumPos(seg.f(c), place) - drumPos(seg.f(a), place))) / (c - a) : 0;
    }
    const blur = Math.min(16, (sp / FPS) * PITCH_PX * 0.3);
    return { pos, blur: blur < 0.15 ? 0 : blur };
  });
  const frac = value - Math.floor(value);
  const dim = 1 - 0.6 * smooth(35.3, 35.6, t) * (1 - smooth(59.1, 59.5, t));
  const lock = smooth(35.3, 35.4, t) * (1 - smooth(59.1, 59.5, t));
  const glow = smooth(59.1, 59.4, t) * (1 - smooth(59.7, 61.2, t));

  // status line
  const lastA = smooth(36.3, 36.55, t) * (1 - smooth(55.9, 56.25, t));
  const waitA = smooth(55.9, 56.25, t) * (1 - smooth(59.0, 59.4, t));
  const progress = clamp((t - 55.9) / 2.5);
  const num = rolled(t, (x) => x.since);
  const nNow = Number(num.text.replace(/,/g, "")) || 0;
  const suffix = nNow === 1 ? " NIGHT AGO" : " NIGHTS AGO";
  let shiver = { dy: 0, alpha: 1 };
  if (t >= 52.6 && t < 53.2) {
    const u = (t - 52.6) / 0.6;
    const flickOn = (u >= 0.16 && u < 0.34) || (u >= 0.66 && u < 0.84); // three frames each
    shiver = { dy: -2 * (0.5 - 0.5 * Math.cos(4 * Math.PI * u)), alpha: flickOn ? 0.6 : 1 };
  }
  let text = "";
  if (waitA > 0.5) text = "WAITING FOR AN ANSWER";
  else if (lastA > 0.01 && num.text) text = `LAST KNOCK · ${num.text}${suffix}`;

  // the date line fades over 8 frames either side of a change (only milestone nights have one)
  const date = (() => {
    if (b.date) {
      for (let i = 1; i <= 8; i++) if (!baseAt(framesBack(t, i)).date) return { text: b.date, alpha: i / 8 };
      return { text: b.date, alpha: 1 };
    }
    for (let i = 1; i <= 8; i++) {
      const d = baseAt(framesBack(t, i)).date;
      if (d) return { text: d, alpha: 1 - i / 8 };
    }
    return { text: "", alpha: 0 };
  })();

  return {
    t,
    alpha,
    sides,
    endK,
    tint: tintAt(t),
    year: rolled(t, (x) => x.year),
    ages: { nora: rolled(t, (x) => x.nora), you: rolled(t, (x) => x.you), text: `NORA ${b.nora} │ YOU ${b.you}` },
    clock: { ...rolled(t, (x) => x.clock), flicker: b.lapse },
    date,
    odometer: {
      value,
      shown: Math.round(value),
      phase: frac > 1e-4 && frac < 1 - 1e-4 ? frac : 0,
      spinning: !!seg.spin && Math.abs(speed) > 0.5,
      speed,
      dim,
      lock,
      glow,
      drums,
    },
    dots: {
      N: [0, 1, 2].map((i) => dotAt(t, "N", i)),
      Y: [0, 1, 2].map((i) => dotAt(t, "Y", i)),
    },
    status: {
      text,
      last: { num, suffix, alpha: lastA },
      shiver,
      waiting: { alpha: waitA, progress },
    },
  };
};

// ---------------------------------------------------------------- the chat (b7), for the overlay and the pings

export type ChatBubble = { t: number; from: Side; text: string; ping: "F#" | "E" };
export const CHAT = {
  t0: 42.3,
  t1: 47.3,
  name: "Nora (bossy)",
  screens: [
    {
      t0: 42.3,
      sep: "TUE, MAR 14, 2017 · 12:01 AM",
      bubbles: [
        { t: 42.5, from: "N", text: "HAPPY BIRTHDAY LITTLE BRO!!! 🎉🎉 come visit!!", ping: "F#" },
        { t: 43.2, from: "Y", text: "thank u!! i will", ping: "E" },
      ] as ChatBubble[],
    },
    {
      t0: 44.0,
      sep: "TUE, JUN 9, 2020 · 11:58 PM",
      bubbles: [
        { t: 44.3, from: "Y", text: "happy bday nora", ping: "F#" },
        { t: 45.0, from: "N", text: "ty!", ping: "E" },
      ] as ChatBubble[],
    },
    {
      t0: 45.6,
      sep: "THU, MAR 14, 2024 · 4:37 PM",
      bubbles: [{ t: 45.9, from: "N", text: "hbd", ping: "F#" }] as ChatBubble[],
    },
  ],
  /** your heart tapback on her 'hbd' (a muted, unpitched tick) */
  tapback: 46.6,
};
/** Every chat sound: the tuned pings (F# then E per exchange; 'hbd' gets F# alone) and the tapback's tick. */
export const CHAT_PINGS: { t: number; pitch: "F#" | "E" | null }[] = [
  ...CHAT.screens.flatMap((s) => s.bubbles.map((b) => ({ t: b.t, pitch: b.ping as "F#" | "E" | null }))),
  { t: CHAT.tapback, pitch: null },
];
