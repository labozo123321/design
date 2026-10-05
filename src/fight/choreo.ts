/**
 * FIGHT CHOREOGRAPHY · 30 fps. All frames absolute.
 * Track key: [frame, pose, x, air, rot?]  x = world px (floor centre is 0), air = height above floor,
 * rot = whole-body spin in degrees. Between keys the pose snaps with an ease-out (fast attack, soft settle).
 */
import { Easing } from "remotion";
import { POSES, Pose, PoseName, mix } from "./rig";

export const BRAND = "FourFig";
export const FIGHT_DURATION = 820;

/** Big beats shared by picture and sound. */
export const FB = {
  roundVo: 10,
  fightSlam: 48,
  fightVo: 46,
  clash: 70,
  bossSlam1: 126,
  airFinisher: 232,
  bossCrash: 240,
  meDown: 345,
  lowStart: 345,
  heartbeats: [372, 402, 428, 450],
  ballThrow: 462,
  ballSmash: 478,
  sendIt: 482,
  finishVo: 486,
  finalHit: 544,
  koVo: 556,
  koText: 556,
  cut: 600,
  send: 624,
  toast: 640,
  emailVo: 652,
  end: 692,
  endVo: 704,
  pill: 770,
};

type Key = [number, PoseName, number, number, number?];

const bob = (from: number, to: number, x: number, step = 8): Key[] => {
  const out: Key[] = [];
  for (let f = from, i = 0; f < to; f += step, i++) out.push([f, i % 2 ? "bounce" : "guard", x, 0]);
  return out;
};

export const ME_KEYS: Key[] = [
  ...bob(0, 60, -280),
  [60, "guard", -280, 0],
  [66, "dash", -120, 0],
  [70, "jab", -88, 0],
  [74, "hurt", -120, 0],
  [84, "guard", -250, 0],
  [86, "dash", -230, 0],
  [91, "dash", 80, 0],
  [92, "jab", 110, 0],
  [94, "guard", 112, 0],
  [96, "cross", 120, 0],
  [98, "guard", 124, 0],
  [100, "jab", 130, 0],
  [102, "guard", 134, 0],
  [104, "cross", 140, 0],
  [107, "crouch", 140, 0],
  [110, "kick", 150, 0],
  [116, "guard", 140, 0],
  [124, "guard", 140, 0],
  [126, "hurt", 120, 30],
  [134, "fly", -60, 150, -120],
  [144, "tuck", -280, 170, -300],
  [150, "crouch", -380, 0, -360],
  [160, "guard", -380, 0, -360],
  [166, "crouch", -370, 0, -360],
  [172, "tuck", -350, 200, -360],
  [180, "tuck", -320, 270, -540],
  [189, "crouch", -260, 0, -720],
  [194, "dash", -250, 0, -720],
  [201, "dash", 110, 0, -720],
  [204, "uppercut", 150, 30, -720],
  [210, "tuck", 175, 190, -720],
  [216, "tuck", 195, 300, -720],
  [218, "jab", 200, 300, -720],
  [220, "tuck", 202, 300, -720],
  [222, "cross", 205, 302, -720],
  [224, "tuck", 206, 304, -720],
  [226, "jab", 208, 306, -720],
  [229, "tuck", 205, 316, -720],
  [232, "highkick", 210, 310, -720],
  [240, "tuck", 205, 140, -720],
  [246, "crouch", 200, 0, -720],
  [254, "guard", 190, 0, -720],
  ...bob(254, 280, 175, 7).map(([f, p, , a]) => [f, p, 175, a, -720] as Key),
  [282, "guard", 165, 0, -720],
  [286, "jab", 175, 0, -720],
  [290, "guard", 165, 0, -720],
  [300, "block", 160, 0, -720],
  [304, "hurt", 130, 0, -720],
  [312, "guard", 140, 0, -720],
  [316, "hurt", 120, 60, -720],
  [326, "fly", -110, 190, -780],
  [338, "fly", -280, 90, -800],
  [345, "down", -330, 0, -720],
  [420, "down", -330, 0, -720],
  [436, "kneel", -330, 0, -720],
  [452, "kneel", -330, 0, -720],
  [460, "power", -330, 0, -720],
  [470, "power", -330, 0, -720],
  [474, "crouch", -320, 0, -720],
  [478, "superpunch", -290, 0, -720],
  [486, "power", -300, 0, -720],
  [490, "dash", -300, 0, -720],
  [499, "dash", -110, 0, -720],
  [502, "jab", -100, 0, -720],
  [504, "guard", -98, 0, -720],
  [505, "cross", -92, 0, -720],
  [507, "guard", -90, 0, -720],
  [508, "jab", -84, 0, -720],
  [510, "guard", -80, 0, -720],
  [511, "cross", -74, 0, -720],
  [513, "crouch", -70, 0, -720],
  [514, "kick", -60, 0, -720],
  [516, "crouch", -50, 0, -720],
  [518, "uppercut", -30, 30, -720],
  [526, "tuck", 0, 300, -900],
  [532, "tuck", 30, 470, -1080],
  [536, "superpunch", 50, 450, -1020],
  [544, "superpunch", 70, 390, -1020],
  [548, "superpunch", 70, 388, -1020],
  [556, "crouch", 40, 0, -1080],
  [568, "victory", 30, 0, -1080],
  [600, "victory", 30, 0, -1080],
];

export const BOSS_KEYS: Key[] = [
  ...bob(0, 60, 290, 9),
  [60, "guard", 290, 0],
  [66, "dash", 120, 0],
  [70, "jab", 88, 0],
  [74, "hurt", 120, 0],
  [84, "guard", 260, 0],
  [91, "guard", 262, 0],
  [92, "hurt", 274, 0],
  [95, "block", 276, 0],
  [96, "hurt", 288, 0],
  [99, "block", 290, 0],
  [100, "hurt", 300, 0],
  [103, "block", 302, 0],
  [104, "hurt", 312, 0],
  [108, "block", 314, 0],
  [110, "hurt", 336, 10],
  [116, "block", 340, 0],
  [120, "dash", 300, 0],
  [124, "cross", 250, 0],
  [126, "cross", 245, 0],
  [134, "guard", 250, 0],
  [150, "guard", 250, 0],
  [156, "cast", 250, 0],
  [166, "guard", 250, 0],
  [200, "guard", 250, 0],
  [204, "hurt", 262, 40],
  [214, "fly", 280, 300],
  [218, "hurt", 285, 304],
  [222, "fly", 288, 306],
  [226, "hurt", 290, 310],
  [232, "fly", 300, 312],
  [240, "down", 360, 0],
  [256, "down", 360, 0],
  [262, "kneel", 360, 0],
  [267, "guard", 360, 0],
  [271, "cast", 360, 0],
  [281, "guard", 360, 0],
  [288, "cast", 360, 0],
  [298, "guard", 360, 0],
  [306, "dash", 340, 0],
  [312, "slam", 250, 0],
  [316, "cross", 240, 0],
  [330, "guard", 250, 0],
  // the slow walk in
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => [345 + i * 8, i % 2 ? "bounce" : "guard", 250 - i * 36, 0] as Key),
  [400, "guard", 0, 0],
  [408, "windup", 0, 0],
  [460, "windup", -10, 0],
  [464, "cast", -30, 0],
  [478, "cast", -30, 0],
  [484, "block", -10, 0],
  [500, "block", 0, 0],
  [502, "hurt", 10, 0],
  [504, "block", 12, 0],
  [505, "hurt", 20, 0],
  [507, "block", 22, 0],
  [508, "hurt", 30, 0],
  [510, "block", 32, 0],
  [511, "hurt", 40, 0],
  [514, "hurt", 56, 10],
  [518, "hurt", 70, 60],
  [530, "fly", 90, 380, -40],
  [544, "fly", 100, 372, -40],
  [548, "fly", 104, 300, -60],
  [553, "down", 130, 0, 0],
  [600, "down", 130, 0, 0],
];

const ease = Easing.bezier(0.12, 0.9, 0.3, 1);

export type Body = { pose: Pose; x: number; air: number; rot: number };
export const evalTrack = (keys: Key[], frame: number): Body => {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1][0] <= frame) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b[0] - a[0];
  const t = span > 0 ? ease(Math.min(1, Math.max(0, (frame - a[0]) / span))) : 0;
  return {
    pose: mix(POSES[a[1]], POSES[b[1]], frame < a[0] ? 0 : t),
    x: a[2] + (b[2] - a[2]) * t,
    air: a[3] + (b[3] - a[3]) * t,
    rot: (a[4] ?? 0) + ((b[4] ?? 0) - (a[4] ?? 0)) * t,
  };
};

/** Every landed hit: who got hit, how hard (0..1), damage in %. */
export type Hit = { f: number; on: "me" | "boss"; power: number; dmg: number };
export const HITS: Hit[] = [
  { f: 70, on: "boss", power: 0.9, dmg: 0 },
  ...[92, 96, 100, 104].map((f) => ({ f, on: "boss" as const, power: 0.35, dmg: 4 })),
  { f: 110, on: "boss", power: 0.6, dmg: 6 },
  { f: 126, on: "me", power: 0.9, dmg: 18 },
  { f: 204, on: "boss", power: 0.75, dmg: 8 },
  ...[218, 222, 226].map((f) => ({ f, on: "boss" as const, power: 0.4, dmg: 3 })),
  { f: 232, on: "boss", power: 1, dmg: 10 },
  { f: 240, on: "boss", power: 0.6, dmg: 0 },
  { f: 304, on: "me", power: 0.5, dmg: 22 },
  { f: 316, on: "me", power: 1, dmg: 48 },
  { f: 345, on: "me", power: 0.5, dmg: 0 },
  ...[502, 505, 508, 511].map((f) => ({ f, on: "boss" as const, power: 0.4, dmg: 5 })),
  { f: 514, on: "boss", power: 0.6, dmg: 5 },
  { f: 518, on: "boss", power: 0.8, dmg: 6 },
  { f: 544, on: "boss", power: 1.3, dmg: 20 },
  { f: 553, on: "boss", power: 0.9, dmg: 0 },
];

/** Full-screen impact frames (inverted, high contrast): [frame, length]. */
export const IMPACTS: [number, number][] = [
  [70, 2],
  [126, 2],
  [232, 3],
  [316, 2],
  [478, 3],
  [544, 5],
];

/** Thought-projectiles thrown by OVERTHINKING. */
export type Shot = {
  from: number;
  to: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  text: string;
  size: number;
  fate: "miss" | "smash" | "hit";
};
export const SHOTS: Shot[] = [
  {
    from: 158,
    to: 204,
    x0: 190,
    x1: -700,
    y0: 150,
    y1: 120,
    text: "WHAT IF IT'S CRINGE",
    size: 1,
    fate: "miss",
  },
  {
    from: 270,
    to: 288,
    x0: 330,
    x1: 240,
    y0: 160,
    y1: 160,
    text: "THEY'LL SAY NO",
    size: 0.95,
    fate: "smash",
  },
  { from: 289, to: 304, x0: 340, x1: 170, y0: 160, y1: 150, text: "NOT READY YET", size: 0.95, fate: "hit" },
  {
    from: 462,
    to: 478,
    x0: -30,
    x1: -260,
    y0: 560,
    y1: 190,
    text: "WHAT IF THEY SAY NO",
    size: 2.3,
    fate: "smash",
  },
];

/** Move-name callouts for each throw, held long enough to read: [from, to, text]. */
export const CALLOUTS: [number, number, string][] = [
  [150, 204, "WHAT IF IT'S CRINGE"],
  [266, 290, "THEY'LL SAY NO"],
  [288, 318, "NOT READY YET"],
  [410, 482, "WHAT IF THEY SAY NO"],
];

/** Combo counter windows: [first hit, last hit, hits]. */
export const COMBOS: [number, number, number][] = [
  [92, 110, 5],
  [204, 232, 5],
  [502, 544, 7],
];

export const healthAt = (who: "me" | "boss", frame: number) =>
  Math.max(0, 100 - HITS.filter((h) => h.on === who && h.f <= frame).reduce((s, h) => s + h.dmg, 0));
