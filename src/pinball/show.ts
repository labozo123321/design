import { DmdLine } from "./Dmd";
import { EVENTS, M, T, clampF } from "./timeline";

/**
 * The machine's side of the story, by video time: what the lamps do, what the dot-matrix display says,
 * the score, the general illumination (which dies with the TILT) and the flashers.
 */

const POINTS: Record<string, number> = {
  bumper: 1000,
  sling_L: 100,
  sling_R: 100,
  lane: 5000,
  drop: 10000,
  ramp_in: 50000,
  chomp: 100000,
  jackpot: 1000000,
};

const MAIN = EVENTS.filter((e) => !(e as { cold?: boolean }).cold);

/** Score after everything up to pinball time tau (the skill shot pays 25,000). */
export const scoreAt = (tau: number) => {
  let s = 0;
  let firstLane = true;
  for (const e of MAIN) {
    if (e.tau > tau || e.ball !== "you") continue;
    if (e.kind === "lane" && firstLane) {
      s += 25000;
      firstLane = false;
      continue;
    }
    s += POINTS[e.kind] ?? 0;
  }
  // the other balls score too during multiball
  for (const e of MAIN) if (e.tau <= tau && e.ball && e.ball !== "you" && e.kind === "bumper") s += 1000;
  return s;
};

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const firstT = (kind: string, ball = "you") =>
  MAIN.find((e) => e.kind === kind && (e.ball === ball || !e.ball))?.t ?? 1e9;
export const KEY = {
  skill: MAIN.find((e) => e.kind === "lane" && e.ball === "you")?.t ?? 13,
  drop: firstT("drop"),
  jackpot: M.jackpot,
  tilt: M.tilt,
  drain: M.drain,
  chomp: M.chomp,
  burp: M.burp,
  multiball: M.multiball,
  coin1: 5.5,
  coin2: 64.6,
  gameOver: M.drain + 1.6,
};

/** Video times of the player's nudges before the TILT (the warnings). */
export const NUDGES = [KEY.tilt - 2.3, KEY.tilt - 1.1, KEY.tilt - 0.05];

export type Show = {
  gi: number;
  lamp: (group: string, i: number) => number;
  dmd: DmdLine[];
  dmdExtra: { flash?: number; sparkle?: number; invert?: boolean };
  flash: { monster: number; bumpers: number; centre: number };
  score: number;
  glass: number;
  /** The music's beat (1 on each beat, decaying), for the speaker lights; 0 when the song isn't playing. */
  beat: number;
};

const BEAT = 60 / 128;
/** On the song's 128 BPM grid: the cold open's starts a bar and a half before the video, the main one at
 * the launch (matching scripts/generate-pinball-audio.py). */
const beatAt = (t: number) => {
  let phase = -1;
  if (t < M.freeze) phase = (t + BEAT * 6) % BEAT;
  else if (t >= M.launch && t < M.tilt) phase = (t - M.launch) % BEAT;
  return phase < 0 ? 0 : Math.exp(-phase / 0.09);
};

const blink = (t: number, period: number, duty = 0.5) => ((t / period) % 1 < duty ? 1 : 0);

export const showAt = (t: number, te: number, frame: number): Show => {
  const tau = T.tau[clampF(frame)];
  const cold = t < M.rewind[1];
  const attract = (t >= M.plunge && t < M.launch) || t >= KEY.gameOver + 0.8;
  const tilted = t >= KEY.tilt && t < KEY.gameOver + 0.8;
  const multiball = (t >= KEY.multiball && t < KEY.tilt) || (cold && t < M.rewind[0]);
  const score = cold ? scoreAt(T.tau[clampF(Math.min(frame, Math.round(M.freeze * 30)))]) : scoreAt(tau);
  // general illumination: dies with the tilt (a flicker, then a dim glow), back for the next game
  let gi = 1;
  if (tilted) {
    const d = t - KEY.tilt;
    gi = d < 0.35 ? (Math.floor(d * 40) % 2 ? 0.2 : 1) : 0.3;
  }
  if (t >= M.rewind[0] && t < M.rewind[1]) gi = 0.7 + 0.3 * Math.sin(t * 60);
  // lamps
  const jackFlash = Math.exp(-Math.max(0, te - KEY.jackpot) / 0.6) * (te >= KEY.jackpot ? 1 : 0);
  const coldJack = cold
    ? Math.exp(-Math.max(0, Math.min(te, M.freeze) - 0.53) / 0.6) * (te >= 0.53 ? 1 : 0)
    : 0;
  const lamp = (group: string, i: number) => {
    if (tilted) return 0;
    if (attract) {
      // a sweep up the table and round the ring
      return Math.max(0, Math.sin(t * 6 - i * 0.9)) ** 3 * 2.5;
    }
    const jf = Math.max(jackFlash, coldJack);
    switch (group) {
      case "again":
        return t < 13 ? blink(t, 0.5) * 2.5 : 0;
      case "bonus":
        return i < Math.min(4, Math.floor(score / 300000)) ? 2.2 : 0;
      case "tongue":
        return t > 19.5 && t < KEY.chomp ? blink(t, 0.22) * 3.5 : 0;
      case "teeth":
        return t > KEY.burp && t < KEY.tilt ? blink(t + i * 0.1, 0.4) * 2.5 : 0;
      case "jackpot":
        return multiball ? (jf > 0.05 ? 4 * jf + 1 : blink(t, 0.3) * 3) : 0;
      case "multiball":
        return multiball ? blink(t + i * 0.15, 0.3) * 3 + jf * 3 : 0;
      case "lanes":
        return t > M.launch && t < KEY.skill
          ? blink(t + i * 0.12, 0.36) * 3
          : t >= KEY.skill && i === 1
            ? 2.5
            : 0.0;
      case "lanesLow":
        return 1.2;
      case "ring":
        return (Math.sin(t * 5 - i * 0.7) > 0.4 ? 2.4 : 0.15) + jf * 3;
      case "trail":
        return t > 19.5 && t < KEY.chomp ? Math.max(0, Math.sin(t * 9 - i * 1.1)) * 3 : 0.1 + jf * 2;
      default:
        return 0;
    }
  };
  // flashers
  const fl = (at: number, k = 0.12) => (te >= at ? Math.exp(-(te - at) / k) : 0);
  const flash = {
    monster:
      fl(KEY.chomp, 0.3) * 6 +
      fl(KEY.burp, 0.25) * 5 +
      (t > 19.5 && t < KEY.chomp ? blink(t, 0.22) * 1.2 : 0),
    bumpers: 0,
    centre: Math.max(jackFlash, coldJack) * 8 * (0.6 + 0.4 * blink(t, 0.08)),
  };
  // the display
  let dmd: DmdLine[] = [];
  let dmdExtra: Show["dmdExtra"] = {};
  const scoreLine = (y = 21): DmdLine => ({ text: fmt(score), y });
  if (cold) {
    if (t < M.rewind[0]) {
      dmd = [
        { text: "JACKPOT", y: 3, scale: 2 },
        { text: "1,000,000", y: 22 },
      ];
      dmdExtra = { sparkle: 1, flash: coldJack * 0.3 };
    } else dmd = [{ text: "<< REWIND", y: 12 }];
  } else if (t < KEY.coin1) {
    dmd = [
      { text: "PRESS START", y: 5 },
      { text: "INSERT COIN", y: 19, blink: true },
    ];
  } else if (t < M.launch) {
    const k = t - KEY.coin1;
    dmd =
      k < 0.7
        ? [{ text: "CREDIT 1", y: 12 }]
        : k < 1.6
          ? [
              { text: "PLAYER 1", y: 5 },
              { text: "BALL 1", y: 19 },
            ]
          : [
              { text: "GET READY", y: 5, blink: true },
              { text: "PULL THE PLUNGER", y: 19 },
            ];
  } else if (t < KEY.skill) {
    dmd = [{ text: "SKILL SHOT?", y: 5 }, scoreLine(19)];
  } else if (t < KEY.skill + 1.5) {
    dmd = [
      { text: "SKILL SHOT!", y: 3, scale: 1 },
      { text: "25,000", y: 14, scale: 2 },
    ];
    dmdExtra = { sparkle: 0.6 };
  } else if (t < 19.5) {
    dmd = [
      { text: "BALL 1", y: 3 },
      { text: fmt(score), y: 13, scale: 2 },
    ];
  } else if (t < KEY.chomp) {
    dmd = [{ text: "FEED THE MONSTER", y: 5, blink: true }, scoreLine(19)];
  } else if (t < KEY.multiball + 0.4) {
    dmd = [{ text: "CHOMP!", y: 5, scale: 3 }];
    dmdExtra = { sparkle: 1, flash: Math.max(0, 1 - (t - KEY.chomp) * 2) };
  } else if (t < KEY.burp) {
    dmd = [{ text: "MULTIBALL", y: 9, scale: 2 }];
    dmdExtra = { invert: blink(t, 0.25) > 0 };
  } else if (t < KEY.burp + 1.2) {
    dmd = [{ text: "BURRRP!", y: 5, scale: 3 }];
  } else if (t < KEY.drop + 1.2 && t >= KEY.drop) {
    dmd = [{ text: "TOOTH KNOCKED OUT", y: 5 }, scoreLine(19)];
  } else if (t < KEY.jackpot) {
    dmd = [{ text: "JACKPOT IS LIT", y: 5, blink: true }, scoreLine(19)];
  } else if (t < KEY.jackpot + 1.6) {
    dmd = [
      { text: "JACKPOT", y: 2, scale: 2 },
      { text: "1,000,000", y: 21 },
    ];
    dmdExtra = { sparkle: 1, invert: blink(t, 0.16) > 0 };
  } else if (t < KEY.tilt) {
    const warn = NUDGES.findIndex((n) => t >= n && t < n + 0.8);
    dmd =
      warn >= 0 && warn < 2
        ? [{ text: "DANGER", y: 5, scale: 3 }]
        : [
            { text: "BALL 1", y: 3 },
            { text: fmt(score), y: 13, scale: 2 },
          ];
    if (warn >= 0 && warn < 2) dmdExtra = { invert: blink(t, 0.1) > 0 };
  } else if (t < KEY.drain + 0.4) {
    dmd = [{ text: "TILT", y: 2, scale: 4, blink: t - KEY.tilt > 1.0 }];
  } else if (t < KEY.gameOver) {
    dmd = [{ text: "BALL LOST", y: 12 }];
  } else if (t < KEY.coin2) {
    dmd = [
      { text: "GAME OVER", y: 3, scale: 2 },
      { text: fmt(score), y: 21 },
    ];
  } else if (t < KEY.coin2 + 0.8) {
    dmd = [{ text: "CREDIT 1", y: 12 }];
  } else {
    dmd = [
      { text: "HERE WE GO", y: 1, scale: 2 },
      { text: "AGAIN", y: 17, scale: 2 },
    ];
  }
  return { gi, lamp, dmd, dmdExtra, flash, score, glass: tilted ? 0.35 : 1, beat: beatAt(t) };
};
