import * as THREE from "three";
import { MOM, NORA, YOU, type Sib } from "./cast";
import type { ArmSpec, Lie, Reach, Spot } from "./People";
import { knockReach, lieToPosed } from "./People";
import { blendPosed, facing, standAt, walkAlong, type Posed } from "./Motion";
import { BED, PRESETS, TREAD, WALL, knockPoint, type Preset } from "./layout";
import { knockMotion, knocksOf, smooth, smoother, track, V3, vnoise } from "./anim";
import type { Look } from "./Post";
import { BEAGLE, type BeaglePose } from "./Beagle";

/**
 * The director: for any moment of the film, who is where doing what (the siblings in their beds and their
 * ages, their rolls, their hands, their faces), how the room is dressed, the light, the camera, the grade.
 * Beat by beat, following the treatment's blocking to the tenth of a second.
 */

export type SibFrame = {
  s: Sib;
  side: -1 | 1;
  lie: Lie;
  /** where the covers start, as a fraction of the way from the feet to the eyes (0.62 the chest, 0.95 the
   * nose); null: no covers */
  covers: number | null;
  /** the covers are a sleeping bag */
  bag?: boolean;
  /** a phone in the far hand: screen brightness (0 off), and face-down on the covers instead */
  phone?: { on: number; down?: boolean; at?: THREE.Vector3; ear?: boolean };
};

export type Era = "2004a" | "2004b" | "2007" | "2009" | "2011" | "2013" | "2014" | "2016" | "2025";
export type BedState = { kind: "twin" | "air" | "none"; look: string; bare?: boolean; spec?: "air-mid" | "air-wall"; thrown?: number; noPillow?: boolean };
export type Dressing = {
  era: Era;
  /** the time-lapse's day (empty, beds made) */
  day?: boolean;
  /** the pile on mom's treadmill (0..1); the boxes for your move (2016) */
  laundry?: number;
  dormBoxes?: boolean;
  /** 2013: her dorm boxes, fridge and lamp waiting by the door the night before she leaves */
  moveOut?: boolean;
  /** mom's treadmill belt: how far it has run (m) */
  belt?: number;
  /** your forearm cast (2006) */
  cast?: boolean;
  /** the T-rex on your shelf: how far it has toppled; the shelf's jolt */
  trex: number;
  jolt: number;
  /** glow stars on Nora's ceiling: how many, how bright */
  stars: number;
  starGlow: number;
  beds: { nora: BedState; you: BedState };
};

export type LightState = {
  hall: number;
  street: number;
  moon: number;
  nightlight: number;
  fill: number;
  /** a lightning flash (0..1), daylight from the sun (0..1) and where the sun is (0 east .. 1 west) */
  lightning?: number;
  sun?: number;
  sunAz?: number;
  /** Nora's fairy lights (2011) */
  fairy?: number;
  /** the hallway's Christmas string lights (2025), the snow-light through the windows */
  strings?: number;
  snow?: number;
  /** a car's headlights sweeping through the front windows (0..1 across the sweep) */
  headlight?: number;
  /** warm light out of the seam onto both faces (the payoff) */
  seamGlow?: number;
};

/** Moose, where and how (see Beagle): his feet (or his bed), which way he faces (0 = -z), his pose. */
export type Dog = { at: THREE.Vector3; yaw: number; pose: BeaglePose; puppy?: boolean; inBed?: boolean; ground?: (x: number, z: number) => number; collar?: boolean };

/** Someone out of bed (sitting up, walking, lying down somewhere else), and what they carry. */
export type Walker = { key: string; s: Sib; p: Posed; carry?: "pillow" | "bundle" | null };
/** Someone lying on the floor (a rug) with their own pillow; covers optional. */
export type Floor = SibFrame & { spot: Spot; pillow: boolean; body: boolean; look?: string };

export type Frame = {
  t: number;
  nora: SibFrame | null;
  you: SibFrame | null;
  walkers?: Walker[];
  floor?: Floor[];
  dress: Dressing;
  light: LightState;
  cam: Preset;
  look: Omit<Look, "time">;
  bloom: number;
  aperture: number;
  /** the payoff's warm bloom from inside the wall (0..1) */
  seam: number;
  /** the camera is inside the wall's cavity, looking down the slot (1) */
  macro?: number;
  /** the note in a sleeper's near hand (drawn at the hand) */
  noteHand?: { sib: "nora" | "you" } | null;
  /** the "sorry" note: where it is (world), how open, its spin */
  note?: { pos: THREE.Vector3; open: number; rot: THREE.Euler } | null;
  /** Moose */
  dog?: Dog | null;
  /** loose things in the world: a pillow held over a face, an earplug in a hand or an ear */
  items?: { kind: "pillowOver" | "earplug" | "quiltBundle"; pos: THREE.Vector3; q?: THREE.Quaternion }[];
};

// ------------------------------------------------------------------------------------------- helpers
/** Drawing for the simple cut (set only while frameAt draws one of its frames). */
let SIMPLE = false;

const camBetween = (t: number, t0: number, t1: number, a: Preset, b: Preset): Preset => {
  const k = smoother((t - t0) / (t1 - t0));
  return { target: a.target.clone().lerp(b.target, k), dist: Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k) };
};

/** A side's knocking arm for a window of the timeline: rests at `rest`, comes up to the wall for the
 * knocks (with the strike-and-recoil), goes back down. */
const knockArm = (t: number, side: -1 | 1, w0: number, w1: number, rest: Reach, fist = false, dz = 0, dy = 0): ArmSpec => {
  const ks = knocksOf(side < 0 ? "N" : "Y", w0, w1);
  const m = knockMotion(t, ks);
  if (m.up <= 0.001) return { rest };
  const wall = knockPoint(side, dz).add(V3(0, dy, 0));
  // (the strike: in to the wall, a little recoil away from it between knocks)
  const to = knockReach(side, wall, m.gap, fist);
  return { rest, to, k: smoother(m.up) };
};

/** Hands resting on the covers over the belly (body frame: in front of the torso, clear of the cloth). */
const restOnCovers = (sib: Sib, which: "near" | "far", side: -1 | 1, fold = 0): Reach => {
  const k = sib.k;
  // the body's right is +x; the arm nearer the wall is Nora's left and your right
  const sgnBody = (which === "near" ? (side < 0 ? -1 : 1) : side < 0 ? 1 : -1) as number;
  return {
    body: true,
    at: V3(sgnBody * (0.17 - 0.12 * fold) * k, (0.93 + 0.18) * k, -(0.14 * k + 0.085)),
    // (the simple cut: loosely curled, the thumb in, so from above a resting hand never reads as a gesture)
    hand: SIMPLE ? { curl: [0.95, 1.05, 1.1, 1.15], spread: 0.02, thumbOut: 0.1, thumbCurl: 0.6 } : { curl: [0.45, 0.5, 0.55, 0.6], spread: 0.08, thumbOut: 0.3, thumbCurl: 0.35 },
    palm: V3(0, 0, 1),
    pole: V3(sgnBody, 0, 0.6),
  };
};

/** Fists gripping the covers' edge at the chin (body frame, in front of the chest at the covers' edge). */
const gripEdge = (sib: Sib, which: "near" | "far", side: -1 | 1, edge: number, lift = 0): Reach => {
  const k = sib.k;
  const sgnBody = (which === "near" ? (side < 0 ? -1 : 1) : side < 0 ? 1 : -1) as number;
  const eyeH = 1.555 * k + Math.abs(sib.who.shape.chinY);
  return {
    body: true,
    at: V3(sgnBody * 0.075 * k, Math.min(eyeH - 0.15, edge * eyeH), -(0.13 * k + 0.06 + lift)),
    hand: { curl: [1.3, 1.35, 1.4, 1.4], spread: 0.0, thumbOut: 0.2, thumbCurl: 0.8 },
    palm: V3(0, -1, 0.3),
    pole: V3(sgnBody, -0.4, 0.5),
  };
};

// ------------------------------------------------------------------------------------------- the grade
const WARM: Omit<Look, "time"> = { exposure: 1.35, sat: 1.02, con: 1.04, tint: [1.06, 0.99, 0.88], shadow: [0.86, 0.92, 1.12], vig: 0.32, grain: 0.016 };

// ------------------------------------------------------------------------------------------- beat 1
/** 2004, the first night in a new house, each in a room of their own. */
const b1 = (t: number): Frame => {
  const n = NORA[9];
  const y = YOU[6];
  // Nora: calm on her back, hands folded; glances at the wall at 3.8 and rolls toward it; three slow
  // knocks; then a laugh held behind her lips, the quilt pulled up over her mouth
  const nRoll = track(t, [
    [3.75, 0],
    [4.0, 0.5],
  ]);
  const nRest = restOnCovers(n, "near", -1, 1);
  const nNear = knockArm(t, -1, 3.9, 4.7, nRest);
  const laugh = smooth(6.6, 6.9, t);
  const nora: SibFrame = {
    s: n,
    side: -1,
    covers: track(t, [
      [6.6, 0.68],
      [7.2, 0.86],
    ]),
    lie: {
      roll: nRoll,
      near: nNear,
      far: { rest: restOnCovers(n, "far", -1, 1), to: gripEdge(n, "far", -1, 0.86), k: smooth(6.7, 7.1, t) },
      e: {
        smile: 0.15 + 0.55 * laugh,
        squint: 0.35 * laugh,
        lidL: (t > 1.2 && t < 1.32) || (t > 2.4 && t < 2.52) ? 0.9 : 0,
        lidR: (t > 1.2 && t < 1.32) || (t > 2.4 && t < 2.52) ? 0.9 : 0,
        eyePitch: t < 3.6 ? 0.25 : 0.05,
        eyeYaw: t < 3.6 ? 0 : -0.25,
        brow: t > 3.6 && t < 4.0 ? 0.25 : 0.05,
        puff: 0.25 * laugh * (0.5 + 0.5 * Math.sin(t * 22)),
      },
      headYaw: track(t, [
        [3.55, 0],
        [3.85, -0.35],
      ]),
      prop: 0.006 * laugh * Math.sin(t * 20),
    },
  };
  // you: the duvet to your nose, eyes wide at the dark; squeezed shut at 3.3; the knock arrives (4.9),
  // you roll to the wall (5.3), hammer three times with the bottom of your fist, the T-rex falls, a huge
  // gap-toothed grin, burrow down
  const yRoll = track(t, [
    [5.2, 0],
    [5.55, 0.55],
  ]);
  const scared = 1 - smooth(4.9, 5.3, t);
  const grin = smooth(6.75, 7.05, t);
  // (to the chin, then pulled up to the mouth when he squeezes his eyes shut: his face always shows)
  const yCov = track(t, [
    [0, 0.84],
    [3.3, 0.84],
    [3.5, 0.88],
    [5.2, 0.88],
    [5.5, 0.78],
    [7.3, 0.78],
    [7.8, 0.84],
  ]);
  const yGrip = gripEdge(y, "near", 1, yCov, 0.01 * smooth(3.3, 3.5, t));
  const yNear = knockArm(t, 1, 5.7, 6.7, yGrip, true, 0, 0.02);
  const you: SibFrame = {
    s: y,
    side: 1,
    covers: yCov,
    lie: {
      roll: yRoll,
      near: yNear,
      far: { rest: gripEdge(y, "far", 1, yCov, 0.01 * smooth(3.3, 3.5, t)) },
      e: {
        lidL: t > 3.3 && t < 3.75 ? 1 : 0,
        lidR: t > 3.3 && t < 3.75 ? 1 : 0,
        squint: t > 3.3 && t < 3.75 ? 1 : 0.4 * grin,
        eyeYaw: scared * 0.45 * vnoise(t * 0.9, 3) + (t > 4.9 && t < 6.6 ? 0.3 : 0) + (t > 6.6 && t < 6.9 ? -0.1 : 0),
        eyePitch: t > 6.6 && t < 6.95 ? 0.45 : 0.1,
        brow: 0.7 * scared + 0.3 * grin,
        smile: -0.15 * scared + 1.0 * grin,
        jaw: (t > 5.3 && t < 5.9 ? 0.25 : 0) + 0.32 * grin,
        wide: 0.15 * scared,
      },
      headYaw: track(t, [
        [6.5, 0.25],
        [6.65, 0.05],
        [6.9, 0.25],
      ]),
      headPitch: track(t, [
        [6.55, 0],
        [6.7, 0.25],
        [6.95, 0],
      ]),
    },
  };
  const tip = smooth(6.5, 6.75, t);
  const jolt = Math.max(...[5.9, 6.2, 6.5].map((k) => Math.exp(-Math.max(0, t - k) / 0.06) * (t >= k ? 1 : 0)));
  const cam = t < 3.5 ? PRESETS.wide : camBetween(t, 3.5, 8.0, PRESETS.wide, PRESETS.medium);
  return {
    t,
    nora,
    you,
    dress: { era: "2004a", trex: tip, jolt, stars: 0, starGlow: 0, beds: { nora: { kind: "twin", look: "nora2004" }, you: { kind: "twin", look: "you2004" } } },
    light: { hall: 1 - smooth(2.98, 3.02, t), street: 1, moon: 0.3, nightlight: 1, fill: 1 },
    cam,
    look: WARM,
    bloom: 0.55,
    aperture: 0.0,
    seam: 0,
  };
};

/** A hand holding a phone up in front of the chin, screen to the eyes (an offset from the eyes: toward the
 * camera, toward the feet, a little to the open side so it never meets the wall, and low enough that the
 * hand never hides the face from above); down: lowered to the mattress beside the face. */
const phoneHand = (sib: Sib, side: -1 | 1, down = 0): Reach => {
  void sib;
  return {
    eye: true,
    at: V3(side * (0.12 + 0.03 * down), 0.09 - 0.07 * down, 0.27 - 0.07 * down),
    hand: { curl: [0.9, 1.0, 1.05, 1.1], spread: 0.05, thumbOut: 0.6, thumbCurl: 0.3 },
    palm: V3(0, -1, 0),
    pole: V3(side, -0.2, 0.6),
  };
};

/** The open palm laid flat on the wall (world), in front of the chest: the forearm stands up off the
 * mattress, the fingers up the wall from the wrist. */
const palmOnWall = (side: -1 | 1, dz = 0.02): Reach => ({
  // (the wrist just off the wall, on the sleeper's side of it, low: the fingers lie up the wall from there)
  at: knockPoint(side, dz).add(V3(side * 0.022, 0.03, 0.2)),
  hand: { curl: [0.1, 0.1, 0.12, 0.15], spread: 0.15, thumbOut: 0.5, thumbCurl: 0.1 },
  // (the palm faces the wall: toward the middle of the house)
  palm: V3(-side, 0, 0),
  // (the elbow down on the mattress, out from the wall)
  pole: V3(side * 0.6, -1, 0.2),
});

const NEUTRAL_GRADE: Omit<Look, "time"> = { exposure: 1.3, sat: 0.95, con: 1.04, tint: [1.0, 0.99, 0.97], shadow: [0.9, 0.95, 1.1], vig: 0.34, grain: 0.016 };
const SLATE: Omit<Look, "time"> = { exposure: 1.3, sat: 0.78, con: 1.02, tint: [0.92, 0.97, 1.04], shadow: [0.88, 0.95, 1.14], vig: 0.36, grain: 0.018 };
const mixLook = (a: Omit<Look, "time">, b: Omit<Look, "time">, k: number): Omit<Look, "time"> => ({
  exposure: a.exposure + (b.exposure - a.exposure) * k,
  sat: a.sat + (b.sat - a.sat) * k,
  con: a.con + (b.con - a.con) * k,
  tint: a.tint.map((v, i) => v + (b.tint[i] - v) * k) as [number, number, number],
  shadow: a.shadow.map((v, i) => v + (b.shadow[i] - v) * k) as [number, number, number],
  vig: (a.vig ?? 0.3) + ((b.vig ?? 0.3) - (a.vig ?? 0.3)) * k,
  grain: (a.grain ?? 0.015) + ((b.grain ?? 0.015) - (a.grain ?? 0.015)) * k,
});

// ------------------------------------------------------------------------------------------- beat 5
/** 2013, her last night home: her room stripped, Nora in a sleeping bag on the bare mattress facing the
 * wall; you with your back to it. She knocks; nothing; softer; nothing; then you turn over, forehead to the
 * wall, and answer, and her palm comes up flat against her side of it. */
const b5 = (t: number): Frame => {
  const n = NORA[18];
  const y = YOU[15];
  const nKnocks = knockArm(t, -1, 29.0, 33.2, restOnCovers(n, "near", -1, 0.5), false, 0, 0);
  const palm = smooth(34.0, 34.5, t);
  const nora: SibFrame = {
    s: n,
    side: -1,
    bag: true,
    // (the simple cut: the bag at her waist, both arms out on top of it)
    covers: SIMPLE
      ? 0.6
      : track(t, [
          [33.0, 0.8],
          [34.0, 0.9],
        ]),
    lie: {
      roll: 0.62,
      near: palm > 0 ? { rest: restOnCovers(n, "near", -1, 0.5), to: palmOnWall(-1), k: palm } : nKnocks,
      // (the other arm inside the bag, along her side)
      far: SIMPLE ? { rest: restOnCovers(n, "far", -1, 0.5) } : null,
      e: {
        eyeYaw: -0.15,
        eyePitch: -0.05,
        brow: t > 30 && t < 34 ? 0.25 : 0.05,
        lidL: smooth(34.8, 35.2, t) * 0.95,
        lidR: smooth(34.8, 35.2, t) * 0.95,
        smile: 0.35 * smooth(34.9, 35.4, t) - 0.08 * (t > 30 && t < 34.5 ? 1 : 0),
      },
    },
  };
  // you: on your side facing your window (away from the wall), eyes open, jaw set; the eyes flick toward the
  // wall behind you while she waits; at 33.45 you roll over, forehead to the wall, and answer softly
  const yRoll = track(t, [
    [33.45, -0.72],
    [33.95, 0.82],
  ]);
  const yKnocks = knockArm(t, 1, 33.9, 34.8, restOnCovers(y, "near", 1, 0.3), false, -0.02, -0.02);
  const you: SibFrame = {
    s: y,
    side: 1,
    covers: SIMPLE ? 0.6 : 0.72,
    lie: {
      roll: yRoll,
      // (no closer: rolled to face the wall, the nose is already a centimetre off it)
      slide: 0,
      near: yKnocks,
      far: { rest: restOnCovers(y, "far", 1, 0.3) },
      e: {
        eyeYaw: t > 30.0 && t < 30.4 ? -0.35 : t > 31.3 && t < 31.6 ? -0.35 : 0,
        jaw: 0.04 * Math.max(0, Math.sin(t * 7)) * (t > 30 && t < 33 ? 1 : 0),
        smile: -0.15,
        brow: -0.25 * (1 - smooth(33.5, 34.2, t)),
        lidL: t > 34.1 ? 0.55 : 0,
        lidR: t > 34.1 ? 0.55 : 0,
      },
      headPitch: 0.12 * smooth(33.9, 34.2, t),
    },
  };
  return {
    t,
    nora,
    you,
    dress: { era: "2013", moveOut: true, trex: 0, jolt: 0, stars: 40, starGlow: 0.45, beds: { nora: { kind: "twin", look: "bare", bare: true }, you: { kind: "twin", look: "you2011" } } },
    light: { hall: 0, street: 0.35, moon: 1, nightlight: 0, fill: 0.85 },
    // (from the wide, her stripped room and the boxes, slowly in to the two of them)
    cam: camBetween(t, 28, 34.5, PRESETS.wide, PRESETS.two),
    look: { ...mixLook(WARM, NEUTRAL_GRADE, smooth(28, 33, t)), flash: t < 28.05 ? 0.55 : 0 },
    bloom: 0.5,
    aperture: 0.012 * smooth(29, 35, t),
    seam: 0,
  };
};

// ------------------------------------------------------------------------------------------- beat 8
/** Christmas Eve 2025. Both home. The air mattress (mom set it up in the middle of the room) is against the
 * wall by 11:47 PM; Nora on it, you on the guest bed, both facing the wall, both scrolling. You put the
 * phone down, look at the wall, raise your knuckles to it, and stop two centimetres short. She stops
 * scrolling and looks up at the four glow stars still on her ceiling. */
const b8 = (t: number): Frame => {
  const n = NORA[30];
  const y = YOU[27];
  const occupied = t >= 49.0;
  const lower = smooth(53.6, 54.3, t);
  const nora: SibFrame | null = occupied
    ? {
        s: n,
        side: -1,
        covers: SIMPLE ? 0.56 : 0.66,
        phone: { on: 1 - 0.4 * lower },
        // (nearly on her back by the wall, the phone held up over her chest; when she stops, she looks up)
        lie: {
          roll: 0.2,
          spot: { x: -0.27, top: 0.45, pillowZ: -3.3, pillowH: 0.12 },
          near: { rest: restOnCovers(n, "near", -1, 0.4) },
          far: { rest: phoneHand(n, -1, lower) },
          e: { eyePitch: -0.15 + 0.55 * lower, eyeYaw: 0.05, smile: 0.05, brow: 0.15 * lower },
          headPitch: 0.25 * lower,
        },
      }
    : null;
  // (the simple cut leaves out the fist that stops short of the wall)
  const hover = SIMPLE ? 0 : smooth(52.0, 52.5, t) * (1 - smooth(53.0, 53.4, t));
  const yRestNear = restOnCovers(y, "near", 1, 0.3);
  const you: SibFrame | null = occupied
    ? {
        s: y,
        side: 1,
        covers: SIMPLE ? 0.56 : 0.66,
        phone: t < 50.6 ? { on: 1 } : { on: 0, down: true },
        lie: {
          roll: 0.6,
          near: { rest: yRestNear, to: knockReach(1, knockPoint(1, 0), 0.07 + 0.008 * Math.sin(t * 5.3)), k: smoother(hover) },
          far: t < 50.6 ? { rest: phoneHand(y, 1, smooth(50.3, 50.6, t)) } : { rest: restOnCovers(y, "far", 1, 0.3) },
          e: { eyePitch: t < 51.4 ? -0.15 : 0.05, eyeYaw: t > 51.4 ? -0.2 : 0, brow: 0.1, smile: 0 },
        },
      }
    : null;
  const cam = t < 49.8 ? PRESETS.wide : camBetween(t, 49.8, 53.0, PRESETS.wide, PRESETS.two);
  return {
    t,
    nora,
    you,
    dress: { era: "2025", trex: 0, jolt: 0, stars: 4, starGlow: 0.6, beds: { nora: { kind: "air", look: "air", spec: occupied ? "air-wall" : "air-mid" }, you: { kind: "twin", look: "guest" } } },
    light: { hall: 0, street: 0.25, moon: 0.9, nightlight: 0, fill: 0.8, strings: 1, snow: 1, headlight: t >= 47.7 && t <= 48.7 ? t - 47.7 : undefined },
    cam,
    look: { ...SLATE, flash: Math.abs(t - 49.0) < 0.05 ? 0.55 : 0 },
    bloom: 0.55,
    aperture: 0.012 * smooth(50, 53, t),
    seam: 0,
  };
};

// ------------------------------------------------------------------------------------------- beat 9
/** The payoff: you knock first. Silence. She answers. The wall glows; 3216 becomes 3217. She sends the old
 * eleven-knock "come here", laughing; this time you're the one who gets up with your pillow. */
const b9 = (t: number): Frame => {
  const n = NORA[30];
  const y = YOU[27];
  // you: three knocks, the T-rex tips (as it did when you were six), you glance up at it; the wait; the
  // exhale; you start to roll away; her answer stops you; back, grinning into the pillow; laughing
  // (the simple cut: you only close your eyes in the wait, no rolling away)
  const away = SIMPLE ? 0 : smooth(58.0, 58.6, t) * (1 - smooth(60.1, 60.5, t));
  const yKnock = knockArm(t, 1, 54.9, 55.7, restOnCovers(y, "near", 1, 0.3));
  const yGrin = smooth(60.2, 60.6, t);
  const you: SibFrame = {
    s: y,
    side: 1,
    covers: SIMPLE ? 0.56 : 0.66,
    phone: { on: 0, down: true },
    lie: {
      roll: 0.6 - 0.38 * away,
      prop: 0.006 * smooth(57.4, 57.6, t) * (1 - smooth(57.7, 58.1, t)),
      near: yKnock,
      far: { rest: restOnCovers(y, "far", 1, 0.3) },
      e: {
        eyePitch: t > 55.75 && t < 56.3 ? 0.5 : 0.02,
        eyeYaw: t > 55.75 && t < 56.3 ? 0.2 : -0.2,
        smile: 0.25 * smooth(55.9, 56.2, t) * (1 - smooth(56.8, 57.2, t)) + 0.95 * yGrin,
        squint: 0.45 * yGrin,
        jaw: 0.18 * yGrin * (t > 60.8 ? 0.5 + 0.5 * Math.sin(t * 17) : 1),
        brow: 0.1 + 0.2 * yGrin,
        lidL: SIMPLE ? 0.85 * smooth(57.9, 58.3, t) * (1 - smooth(58.45, 58.6, t)) : away * 0.3,
        lidR: SIMPLE ? 0.85 * smooth(57.9, 58.3, t) * (1 - smooth(58.45, 58.6, t)) : away * 0.3,
      },
      headYaw: t > 60.9 && t < 62.0 ? 0.12 * Math.sin((t - 60.9) * 9) : 0,
      headPitch: t > 55.75 && t < 56.3 ? 0.2 : 0,
    },
  };
  // Nora: eyes wide on your first knock, the phone sinks to the mattress (its light under her chin), not
  // moving; her chin trembles; three knocks back; a silent laugh, the heel of her hand to one eye, eleven
  // knocks fast
  const wide = smooth(55.1, 55.3, t) * (1 - smooth(59.2, 59.8, t));
  const laugh = smooth(60.5, 60.9, t);
  const tremble = smooth(56.9, 57.1, t) * (1 - smooth(58.2, 58.4, t));
  const nKnocks = knockArm(t, -1, 58.3, 59.1, restOnCovers(n, "near", -1, 0.4));
  const nFast = knockArm(t, -1, 60.7, 62.1, restOnCovers(n, "near", -1, 0.4));
  // (laughing, her free hand flat on her chest, over her heart, the phone let go on the mattress)
  const wipe = smooth(60.6, 60.9, t) * (1 - smooth(63.4, 63.8, t));
  const eyeWipe: Reach = { body: true, at: V3(0.1 * n.k, 1.25 * n.k, -(0.12 * n.k + 0.06)), hand: { curl: [0.25, 0.3, 0.35, 0.4], spread: 0.1, thumbOut: 0.35, thumbCurl: 0.2 }, palm: V3(0, 0, 1), pole: V3(1, -0.6, 0.2) };
  const pat = smooth(64.45, 64.7, t) * (1 - smooth(65.1, 65.4, t));
  const onBack = smooth(65.3, 65.9, t);
  const nora: SibFrame = {
    s: n,
    side: -1,
    covers: SIMPLE ? 0.56 : 0.66,
    phone: t < 60.7 ? { on: 0.6 } : { on: 0, down: true },
    lie: {
      // (on your first knock she turns toward the wall)
      roll: (0.2 + 0.2 * smooth(55.1, 55.5, t)) * (1 - onBack),
      slide: 0.04 * smooth(64.4, 64.7, t),
      spot: { x: -0.27, top: 0.45, pillowZ: -3.3, pillowH: 0.12 },
      near: t < 60.0 ? nKnocks : nFast,
      far:
        t < 64.3
          ? { rest: phoneHand(n, -1, 1), to: eyeWipe, k: SIMPLE ? 0 : wipe }
          : { rest: phoneHand(n, -1, 1), to: { at: V3(-1.12, 0.08, -2.95), hand: { curl: [0.2, 0.2, 0.25, 0.3], spread: 0.1, thumbOut: 0.4, thumbCurl: 0.2 }, palm: V3(0, -1, 0), pole: V3(-0.3, 1, 0.5) }, k: pat },
      e: {
        lidL: 0,
        lidR: 0,
        brow: 0.55 * wide + 0.25 * laugh,
        eyeYaw: 0.05,
        eyePitch: 0.15 * (1 - laugh),
        smile: -0.25 * tremble + 1.0 * laugh,
        pucker: 0.15 * tremble,
        jaw: 0.03 * tremble * Math.max(0, Math.sin(t * 31)) + 0.12 * laugh * (0.5 + 0.5 * Math.sin(t * 15)),
        squint: 0.55 * laugh * (1 - onBack * 0.6),
      },
      headPitch: 0.3 * onBack,
      prop: 0.005 * laugh * Math.sin(t * 19) * (1 - onBack),
    },
  };
  // (the simple cut: only a touch warmer, no glow out of the wall)
  const gold = (SIMPLE ? 0.3 : 1) * smooth(59.05, 59.8, t);
  // 62.0: you get up with your pillow; down the hall; into her room; down on the rug beside her
  let youNow: SibFrame | null = you;
  const walkers: Walker[] = [];
  const floor: Floor[] = [];
  if (t >= 62.0) {
    youNow = null;
    const lying = lieToPosed(y, 1, { ...you.lie, roll: 0.6 });
    // the pillow under one arm, held to the chest with both hands
    const k = y.k;
    const hold: ArmSpec = { rest: { body: true, at: V3(-0.17, 1.33 * k, -0.2), hand: { curl: [0.8, 0.9, 0.9, 1.0], spread: 0.05, thumbOut: 0.5, thumbCurl: 0.4 }, palm: V3(1, 0, 0), pole: V3(-1, -0.4, 0.4) } };
    const hold2: ArmSpec = { rest: { body: true, at: V3(0.17, 1.33 * k, -0.2), hand: { curl: [0.8, 0.9, 0.9, 1.0], spread: 0.05, thumbOut: 0.5, thumbCurl: 0.4 }, palm: V3(-1, 0, 0), pole: V3(1, -0.4, 0.4) } };
    const base = { e: { smile: 0.6, squint: 0.2 }, nearSide: 1 as const, near: hold2, far: hold };
    const sitUp: Posed = { ...base, hip: V3(0.5, 0.62, -2.75), q: facing(V3(0, 0, 1)), feet: [V3(0.42, 0.56, -1.95), V3(0.6, 0.56, -1.95)] };
    const edge: Posed = { ...base, hip: V3(0.86, 0.6, -2.95), q: facing(V3(1, 0, 0.35)), feet: [V3(1.22, 0.06, -3.1), V3(1.26, 0.06, -2.85)] };
    const path = [V3(1.18, 0, -3.0), V3(1.5, 0, -3.35), V3(1.52, 0, -3.95), V3(1.15, 0, -4.32), V3(-1.15, 0, -4.32), V3(-1.52, 0, -3.95), V3(-1.52, 0, -3.35), V3(-1.42, 0, -2.75)];
    const stand = standAt(y, path[0], V3(0.5, 0, -1), base);
    const walkT0 = 62.85;
    const speed = 2.35;
    let p: Posed | null;
    let carry: "pillow" | null = "pillow";
    if (t < 62.3) p = blendPosed({ ...lying, ...base }, sitUp, (t - 62.0) / 0.3);
    else if (t < 62.6) p = blendPosed(sitUp, edge, (t - 62.3) / 0.3);
    else if (t < walkT0) p = blendPosed(edge, stand, (t - 62.6) / (walkT0 - 62.6));
    else {
      const total = path.reduce((a, q, i) => (i ? a + q.distanceTo(path[i - 1]) : 0), 0);
      const d = Math.min(total, (t - walkT0) * speed);
      const arrive = walkT0 + total / speed;
      if (t < arrive) p = walkAlong(y, path, d, base, WALK_STRIDE);
      else {
        // drop the pillow on the rug, kneel, lie down on your back beside the mattress
        const end = standAt(y, path[path.length - 1], V3(0, 0, 1), base);
        const spot: Spot = { x: -1.38, top: 0.012, pillowZ: -3.25, pillowH: 0.12 };
        // (side: the room you lie in, hers; the bed-side logic keeps a sleeper off its own room's wall)
        // (your hands folded on your front as you lie down and once you're down)
        const downArms = { near: { rest: restOnCovers(y, "near", -1, 0.5) }, far: { rest: restOnCovers(y, "far", -1, 0.5) } };
        const down = lieToPosed(y, -1, { roll: 0, spot, e: { smile: 0.5 }, ...downArms });
        const kneel: Posed = { ...base, hip: V3(-1.4, 0.42, -2.6), q: facing(V3(0, -0.2, -1)), feet: [V3(-1.5, 0.05, -2.2), V3(-1.3, 0.05, -2.2)] };
        const sitF: Posed = { ...base, hip: V3(-1.38, 0.13, -2.55), q: facing(V3(0, 0, 1), V3(0, 1, -0.25)), feet: [V3(-1.46, 0.05, -1.75), V3(-1.3, 0.05, -1.75)] };
        carry = t < arrive + 0.35 ? "pillow" : null;
        const lyingThere: Floor = { s: y, side: -1, covers: null, spot, pillow: true, body: false, lie: { roll: 0, spot, e: { smile: 0.45, eyePitch: 0.35 }, ...downArms } };
        if (t < arrive + 0.35) p = end;
        else if (t < arrive + 0.75) p = blendPosed(end, kneel, (t - arrive - 0.35) / 0.4);
        else if (t < arrive + 1.1) p = blendPosed(kneel, sitF, (t - arrive - 0.75) / 0.35);
        else if (t < arrive + 1.5) p = blendPosed(sitF, { ...base, ...down }, (t - arrive - 1.1) / 0.4);
        else p = null;
        // the pillow is on the rug from the drop; you're in it once you've lain down
        if (t >= arrive + 0.35) floor.push({ ...lyingThere, body: p === null });
      }
    }
    if (p) walkers.push({ key: "you", s: y, p, carry });
  }
  return {
    t,
    nora,
    you: youNow,
    walkers,
    floor,
    dress: { era: "2025", trex: smooth(55.6, 55.85, t), jolt: Math.max(...[55.0, 55.3, 55.6].map((k) => (t >= k ? Math.exp(-(t - k) / 0.05) : 0))), stars: 4, starGlow: 0.6 + 0.4 * gold, beds: { nora: { kind: "air", look: "air", spec: "air-wall" }, you: { kind: "twin", look: "guest" } } },
    light: {
      hall: 0,
      street: 0.25,
      moon: 0.9 - 0.3 * gold,
      nightlight: 0,
      fill: 0.8 + 0.1 * gold,
      strings: 1 - smooth(66.75, 66.85, t),
      snow: 1,
      // the bloom out of the seam, settling to an ember that stays while they laugh
      seamGlow: SIMPLE ? 0 : smooth(59.0, 59.2, t) * (1 - 0.7 * smooth(59.6, 61.0, t)) * (1 - smooth(62.4, 63.4, t)),
    },
    cam: t < 61.9 ? PRESETS.two : camBetween(t, 61.9, 64.3, PRESETS.two, PRESETS.wide),
    look: mixLook(SLATE, WARM, gold),
    bloom: 0.55 + (SIMPLE ? 0 : 0.25 * smooth(59.0, 59.3, t) * (1 - smooth(59.6, 60.6, t))),
    aperture: 0.012 * (1 - smooth(62.6, 64, t)),
    seam: SIMPLE ? 0 : smooth(58.95, 59.1, t) * (1 - smooth(59.6, 60.8, t)),
  };
};

// ------------------------------------------------------------------------------------------- time-lapse
/** One night of a time-lapse: the cycle index and where in it we are (night first, then the morning). */
const cycle = (t: number, t0: number, perSec = 3) => {
  const x = (t - t0) * perSec;
  const i = Math.floor(x);
  return { i, u: x - i, night: x - i < 0.62 };
};
/** A quick restless pose for a sleeper in a time-lapse night (varied by the night). */
const sleeper = (sib: Sib, side: -1 | 1, i: number, st: Partial<Lie> = {}): SibFrame => {
  const h = (n: number) => {
    const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const r = h(1);
  return {
    s: sib,
    side,
    covers: 0.7 + 0.18 * h(2),
    lie: {
      roll: r < 0.33 ? 0 : r < 0.7 ? 0.5 : -0.5,
      e: { lidL: 1, lidR: 1, smile: 0.05 },
      near: { rest: restOnCovers(sib, "near", side, h(3)) },
      far: { rest: restOnCovers(sib, "far", side, h(4)) },
      ...st,
    },
  };
};
const WARM_DAY: Omit<Look, "time"> = { exposure: 1.05, sat: 1.0, con: 1.03, tint: [1.05, 1.0, 0.92], shadow: [0.92, 0.95, 1.05], vig: 0.28, grain: 0.015 };

/** Folded arms on the chest (body frame), for the fight night. */
const crossArms = (sib: Sib, which: "near" | "far", side: -1 | 1): Reach => {
  const k = sib.k;
  const sgnBody = (which === "near" ? (side < 0 ? -1 : 1) : side < 0 ? 1 : -1) as number;
  return {
    body: true,
    at: V3(-sgnBody * 0.12 * k, (1.17 + (sgnBody > 0 ? 0.03 : 0)) * k, -(0.15 * k + 0.035 + (sgnBody > 0 ? 0.03 : 0))),
    hand: { curl: [0.9, 1.0, 1.0, 1.0], spread: 0.0, thumbOut: 0.2, thumbCurl: 0.5 },
    palm: V3(0, 0, 1),
    pole: V3(sgnBody, -0.6, 0.3),
  };
};

/** The "sorry" note: pushed through the gap at the top of the outlet cover (12.25), over the box, then
 * fluttering down the slot beside it (12.3-13.05, the macro plays it at half speed) to lie on the bottom
 * plate, half open, for the rest of the film. Its long side runs along the slot (it's 7 cm across a 9 cm
 * cavity), its fold toward Nora's side. */
const NOTE_REST = { x: -0.036, y: WALL.plateH, z: -3.085 };
const noteAt = (t: number): Frame["note"] => {
  if (t < 12.25) return null;
  const u = smooth(12.3, 13.05, t);
  const a = 1 - u;
  const into = smooth(12.25, 12.32, t);
  return {
    pos: V3(
      NOTE_REST.x - 0.03 * (1 - into) + 0.004 * Math.sin(t * 9) * a,
      0.645 + (NOTE_REST.y - 0.645) * Math.pow(u, 1.35),
      -2.99 + (NOTE_REST.z + 2.99) * smooth(0, 0.3, u) + 0.018 * Math.sin(t * 6.5) * a * smooth(0, 0.3, u),
    ),
    // (it lands and springs open: the top leaf stands up, the writing on the bottom leaf faces the lens)
    open: 0.12 + 0.88 * smooth(12.95, 13.1, t),
    rot: new THREE.Euler(0.5 * Math.sin(t * 7) * a, Math.PI / 2 + 0.1 * Math.sin(t * 4) * a, 0.3 * Math.sin(t * 5) * a, "YXZ"),
  };
};

/** The stride (one cycle of two steps, in body heights) of the two hurried night walks across the house. */
export const WALK_STRIDE = 1.15;

/** A steady pseudo-random number in [0, 1) for an index (and a salt). */
const hash01 = (i: number, salt = 0) => {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// ------------------------------------------------------------------------------------------- beat 2
/** 2004 → 2008: nights flash by (three a second), the kids growing; one real night in 2007 when they're not
 * speaking (arms folded, scowling) and still knock goodnight; the note she slips into the wall. */
const b2 = (t: number): Frame => {
  const base: Omit<Frame, "t" | "nora" | "you" | "cam" | "dress"> = {
    light: { hall: 0, street: 1, moon: 0.3, nightlight: 1, fill: 1 },
    look: WARM,
    bloom: 0.5,
    aperture: 0,
    seam: 0,
  };
  const fast = t < 10.4 || t >= 13.9;
  if (fast) {
    const t0 = t < 10.4 ? 8.0 : 13.9;
    const c = cycle(t, t0);
    const late = t >= 13.9;
    // ages: 2004-05 (9, 6), 2006-07 (11, 9) after the 9.4 flash; the end of 2008 (13, 10)
    // the kids grow, and the bedding changes, inside one white flash on a night cut (9.33)
    const SWAP = 8.0 + 4 / 3;
    const nAge = late ? 13 : t < SWAP ? 9 : 11;
    const yAge = late ? 10 : t < SWAP ? 6 : 9;
    const flash = (t >= SWAP && t < SWAP + 0.067) || t - t0 < 0.067 ? 1 : 0;
    const era: Era = late ? "2007" : t < SWAP ? "2004b" : "2007";
    const night = c.night;
    // Moose: a puppy curled in his bed in Nora's doorway (2005-06), then curled in the doorway itself; most
    // nights, never by day
    const here = night && hash01(c.i + (late ? 40 : 0), 3) < 0.78;
    const pup = !late && t < SWAP;
    const dog: Dog | null = here
      ? { at: pup ? V3(-1.52, 0, -3.27) : V3(-1.5, 0, -3.33), yaw: (hash01(c.i, 7) - 0.5) * 2.4, pose: { kind: "curl", t }, puppy: pup, inBed: pup, collar: false }
      : null;
    return {
      ...base,
      t,
      dog,
      nora: night ? sleeper(NORA[nAge], -1, c.i + (late ? 40 : 0)) : null,
      you: night ? sleeper(YOU[yAge], 1, c.i + 17 + (late ? 40 : 0)) : null,
      dress: {
        era,
        day: !night,
        trex: 0,
        jolt: 0,
        stars: t < 8.5 ? 0 : 40,
        starGlow: night ? 0.8 : 0,
        cast: !late && t > 9.0 && t < 9.9,
        beds: { nora: { kind: "twin", look: era === "2004b" ? "nora2004" : "nora2007" }, you: { kind: "twin", look: era === "2004b" ? "you2004" : "you2007" } },
      },
      light: night ? { hall: 0, street: 1, moon: 0.3, nightlight: 1, fill: 1 } : { hall: 0, street: 0, moon: 0, nightlight: 0, fill: 0.4, sun: 1, sunAz: (c.u - 0.62) / 0.38 },
      look: { ...(night ? WARM : WARM_DAY), flash: flash * 0.55 },
      cam: PRESETS.wide,
    };
  }
  // the fight night, 2007: real time
  const n = NORA[11];
  const y = YOU[9];
  const note = smooth(11.4, 11.7, t);
  const push = smooth(11.8, 12.2, t);
  const nRest = crossArms(n, "near", -1);
  // she pulls the note from under her pillow and pushes it into the gap at the top of the outlet cover
  const toNote: Reach = { at: V3(-0.2, 0.6, -3.38), hand: { curl: [0.3, 0.35, 0.9, 1.0], spread: 0.0, thumbOut: 0.3, thumbCurl: 0.2 }, palm: V3(0, -1, 0), pole: V3(0.3, 0.6, 1) };
  const toGap: Reach = { at: V3(-0.085, 0.64, -2.96), hand: { curl: [0.3, 0.35, 0.9, 1.0], spread: 0.0, thumbOut: 0.3, thumbCurl: 0.2 }, palm: V3(1, 0, 0), pole: V3(0, 0.4, 1) };
  void toNote;
  // (the note held up off her chest, then out to the outlet beside her shoulder and into the gap)
  const held: Reach = { body: true, at: V3(0.02, 1.3 * n.k, -(0.14 * n.k + 0.16)), hand: { curl: [0.3, 0.35, 0.9, 1.0], spread: 0, thumbOut: 0.3, thumbCurl: 0.2 }, palm: V3(0, 0, -1), pole: V3(-1, -0.4, 0.4) };
  const nNear: ArmSpec =
    t < 13.0
      ? note <= 0
        ? { rest: nRest }
        : push <= 0
          ? { rest: nRest, to: held, k: note * (1 - smooth(12.25, 12.5, t)) }
          : { rest: held, to: toGap, k: smoother(push) * (1 - smooth(12.25, 12.5, t)) }
      : knockArm(t, -1, 13.0, 13.5, nRest, false);
  const yNear = knockArm(t, 1, 13.4, 13.9, crossArms(y, "near", 1), true);
  const scowl = { brow: -0.7, smile: -0.35, eyePitch: 0.25, squint: 0.15 };
  const macro = t >= 12.3 && t < 13.1 ? 1 : 0;
  const n2 = noteAt(t);
  return {
    ...base,
    t,
    nora: { s: n, side: -1, covers: 0.6, lie: { roll: 0, near: nNear, far: { rest: crossArms(n, "far", -1) }, e: scowl } },
    you: { s: y, side: 1, covers: 0.6, lie: { roll: 0, near: yNear, far: { rest: crossArms(y, "far", 1) }, e: scowl } },
    dress: { era: "2007", trex: 0, jolt: 0, stars: 40, starGlow: 0.8, beds: { nora: { kind: "twin", look: "nora2007" }, you: { kind: "twin", look: "you2007" } } },
    look: { ...WARM, flash: (Math.abs(t - 10.4) < 0.05 ? 1 : 0) * 0.55 },
    cam: PRESETS.medium,
    dog: { at: V3(-1.5, 0, -3.33), yaw: 0.6, pose: { kind: "curl", t }, collar: false },
    macro,
    note: n2,
    noteHand: t >= 11.45 && t < 12.25 ? { sib: "nora" } : null,
  };
};

// ------------------------------------------------------------------------------------------- beat 3
/** 2009, a thunderstorm at 2 AM: eleven knocks mean come here. She gets up with her pillow and quilt, down
 * the hall, into your room, onto the rug beside your bed with her back to you; the dog after her. */
const b3 = (t: number): Frame => {
  const n = NORA[14];
  const y = YOU[11];
  const strike = (a: number, w = 0.1) => (t >= a && t < a + w ? 1 - (t - a) / w : 0) + (t >= a + 0.13 && t < a + 0.18 ? 0.6 : 0);
  // (the simple cut: one soft flash, rising over a few frames and dying away, as the night fades in)
  const lightning = SIMPLE
    ? 0.42 * smooth(15.78, 15.86, t) * Math.exp(-Math.max(0, t - 15.86) / 0.3)
    : Math.max(strike(15.0), strike(15.8), strike(19.5), 0.35 * strike(21.0, 0.15));
  const yKnocks = knockArm(t, 1, 15.9, 17.3, gripEdge(y, "near", 1, 0.82), false);
  const peek = smooth(21.65, 21.9, t) * (1 - smooth(22.15, 22.4, t));
  const back = smooth(22.2, 22.45, t);
  const you: SibFrame = {
    s: y,
    side: 1,
    covers: 0.82 - 0.12 * smooth(15.75, 16.15, t),
    lie: {
      roll: t < 15.85 ? 0 : t < 17.5 ? 0.5 : -0.55 * peek + 0.5 * (1 - smooth(17.5, 18.0, t)) * (1 - peek),
      slide: -0.25 * peek,
      near: yKnocks,
      // (the other hand drops under the covers while you knock, so the fist at the wall reads alone)
      far: SIMPLE ? { rest: gripEdge(y, "far", 1, 0.82) } : { rest: gripEdge(y, "far", 1, 0.82), to: restOnCovers(y, "far", 1, 0.3), k: smooth(15.6, 15.9, t) * (1 - smooth(17.5, 17.9, t)) },
      e: { lidL: back > 0.5 ? 1 : 0, lidR: back > 0.5 ? 1 : 0, brow: 0.6 * (1 - back), eyePitch: 0.2, eyeYaw: peek > 0.3 ? 0.4 : 0, smile: 0.2 * back },
      headPitch: -0.15 * peek,
    },
  };
  // Nora: asleep; opens her eyes at 17.4, a puffed-cheek exhale, throws back the quilt; up and out
  const walkers: Walker[] = [];
  const floor: Floor[] = [];
  let nora: SibFrame | null = null;
  const nBase = { e: { puff: 0.0, brow: -0.1 }, nearSide: -1 as const };
  // (in step with the sound: the quilt thrown back at 17.62, up to sitting by 18.05, the pillow and quilt
  // gathered at 18.32 as the legs swing off the bed, bare feet on the floor at 18.41, walking from 18.6)
  if (t < 17.72) {
    const awake = smooth(17.4, 17.55, t);
    nora = {
      s: n,
      side: -1,
      covers: 0.86 - 0.5 * smooth(17.6, 17.72, t),
      lie: {
        roll: 0.15,
        near: { rest: restOnCovers(n, "near", -1, 0.5) },
        far: { rest: restOnCovers(n, "far", -1, 0.5) },
        e: { lidL: 1 - awake, lidR: 1 - awake, puff: 0.7 * smooth(17.5, 17.6, t) * (1 - smooth(17.75, 17.9, t)), brow: -0.2 * awake, eyePitch: 0.3 },
      },
    };
  } else {
    const k = n.k;
    const bundleArms: { near: ArmSpec; far: ArmSpec } = {
      near: { rest: { body: true, at: V3(-0.18, 1.3 * k, -0.24), hand: { curl: [0.8, 0.9, 0.9, 1.0], spread: 0.05, thumbOut: 0.5, thumbCurl: 0.4 }, palm: V3(1, 0, 0), pole: V3(-1, -0.4, 0.4) } },
      far: { rest: { body: true, at: V3(0.18, 1.3 * k, -0.24), hand: { curl: [0.8, 0.9, 0.9, 1.0], spread: 0.05, thumbOut: 0.5, thumbCurl: 0.4 }, palm: V3(-1, 0, 0), pole: V3(1, -0.4, 0.4) } },
    };
    // (rising from just as she lay, her hands still where they rested on the quilt)
    const lying = lieToPosed(n, -1, { roll: 0.15, e: {}, near: { rest: restOnCovers(n, "near", -1, 0.5) }, far: { rest: restOnCovers(n, "far", -1, 0.5) } });
    // (her feet stop short of the quilt she's thrown down to the foot of the bed)
    const sitUp: Posed = { ...nBase, hip: V3(-0.5, 0.62, -2.75), q: facing(V3(0, 0, 1)), feet: [V3(-0.42, 0.56, -2.04), V3(-0.6, 0.56, -2.04)] };
    const edge: Posed = { ...nBase, ...bundleArms, hip: V3(-0.86, 0.6, -2.95), q: facing(V3(-1, 0, 0.35)), feet: [V3(-1.26, 0.06, -2.85), V3(-1.22, 0.06, -3.1)] };
    const path = [V3(-1.18, 0, -3.0), V3(-1.5, 0, -3.35), V3(-1.52, 0, -3.95), V3(-1.15, 0, -4.32), V3(1.15, 0, -4.32), V3(1.52, 0, -3.95), V3(1.52, 0, -3.35), V3(1.36, 0, -2.75)];
    const stand = standAt(n, path[0], V3(-0.5, 0, -1), { ...nBase, ...bundleArms });
    const walkT0 = 18.6;
    const speed = 2.7;
    const total = path.reduce((a, q, i) => (i ? a + q.distanceTo(path[i - 1]) : 0), 0);
    const arrive = walkT0 + total / speed;
    const spot: Spot = { x: 1.34, top: 0.012, pillowZ: -3.2, pillowH: 0.12 };
    let p: Posed | null = null;
    let carry: "bundle" | null = "bundle";
    if (t < 18.05) p = blendPosed({ ...lying, ...nBase }, sitUp, (t - 17.72) / 0.33);
    else if (t < 18.42) p = blendPosed(sitUp, edge, (t - 18.05) / 0.37);
    else if (t < walkT0) p = blendPosed(edge, stand, (t - 18.42) / (walkT0 - 18.42));
    else if (t < arrive) p = walkAlong(n, path, (t - walkT0) * speed, { ...nBase, ...bundleArms }, WALK_STRIDE);
    else {
      // drop the pillow and quilt, down onto the rug on her side, her back to your bed
      const end = standAt(n, path[path.length - 1], V3(0, 0, 1), { ...nBase, ...bundleArms });
      // (her hands in front of her as she lies down and once she's down, the quilt pulled up below them)
      const downArms = { near: { rest: restOnCovers(n, "near", 1, 0.5) }, far: { rest: restOnCovers(n, "far", 1, 0.5) } };
      const down = lieToPosed(n, 1, { roll: -0.9, spot, e: {}, ...downArms });
      const kneel: Posed = { ...nBase, hip: V3(1.42, 0.42, -2.6), q: facing(V3(0, -0.2, -1)), feet: [V3(1.32, 0.05, -2.2), V3(1.52, 0.05, -2.2)] };
      // (she keeps hold of the bundle until she's down, then pulls the quilt up over herself from her feet)
      carry = t < arrive + 0.95 ? "bundle" : null;
      if (t < arrive + 0.2) p = end;
      else if (t < arrive + 0.55) p = blendPosed(end, kneel, (t - arrive - 0.2) / 0.35);
      else if (t < arrive + 0.95) p = blendPosed(kneel, { ...nBase, ...down }, (t - arrive - 0.55) / 0.4);
      else p = null;
      if (t >= arrive + 0.2)
        floor.push({ s: n, side: 1, covers: p === null ? 0.14 + 0.52 * smoother((t - arrive - 0.95) / 0.5) : null, spot, pillow: t >= arrive + 0.95, body: p === null, look: "nora2007", lie: { roll: -0.9, spot, e: { lidL: 1, lidR: 1 }, ...downArms } });
    }
    if (p && t < 18.32) carry = null;
    if (p) walkers.push({ key: "nora", s: n, p, carry });
  }
  // (pulling back as she gets up, so her way out of the room stays in frame)
  const cam = t < 17.8 ? PRESETS.medium : camBetween(t, 17.8, 19.2, PRESETS.medium, PRESETS.wide);
  return {
    t,
    nora,
    you,
    walkers,
    floor,
    dog: mooseIn2009(t, n),
    // (her quilt stays thrown back on the bed while she sits up; at 18.32 she gathers it and her pillow)
    dress: { era: "2009", trex: 0, jolt: 0, stars: 40, starGlow: 0.6, beds: { nora: { kind: "twin", look: "nora2007", thrown: t >= 17.72 ? 1 : 0, bare: t >= 18.32, noPillow: t >= 18.32 }, you: { kind: "twin", look: "you2009" } } },
    // (the simple cut: her door open on a brighter hallway, so her way across the house reads)
    light: { hall: 0.12 + (SIMPLE ? 0.55 : 0.25) * smooth(18.2, 18.6, t), street: 0.1, moon: 0.15, nightlight: 1, fill: 0.7, lightning },
    cam,
    look: { exposure: 1.3, sat: 0.92, con: 1.05, tint: [0.92, 0.95, 1.1], shadow: [0.85, 0.9, 1.2], vig: 0.36, grain: 0.017 },
    bloom: 0.55,
    aperture: 0,
    seam: 0,
  };
};

/** Moose in the storm: asleep in the hallway (out of sight behind the back wall) until she passes; up, and
 * trotting after her along the hall, through your door, round her on the outer side, to flop across her
 * ankles facing the camera, eyes closing. */
const mooseIn2009 = (t: number, n: Sib): Dog | null => {
  const spot: Spot = { x: 1.34, top: 0.012, pillowZ: -3.2, pillowH: 0.12 };
  const legs = lieToPosed(n, 1, { roll: -0.9, spot, e: {}, near: null, far: null }).feet;
  const ankle = legs[0].clone().lerp(legs[1], 0.5);
  // the quilt over her legs is a ridge the dog drapes over
  const ground = (x: number, z: number) => {
    const along = Math.max(0, 1 - Math.abs(z - ankle.z + 0.05) / 0.35);
    const across = Math.max(0, 1 - ((x - ankle.x) / 0.13) ** 2);
    return 0.012 + 0.15 * across * Math.min(1, along * 3);
  };
  const path = [V3(-0.7, 0, -4.36), V3(1.15, 0, -4.36), V3(1.52, 0, -3.98), V3(1.56, 0, -3.4), V3(2.03, 0, -2.95), V3(2.03, 0, ankle.z + 0.06)];
  const lens = path.slice(1).map((q, i) => q.distanceTo(path[i]));
  const total = lens.reduce((a, b) => a + b, 0);
  // (right behind her in the hall; at her feet before she's down, waiting)
  const t0 = 19.0;
  const speed = 1.9;
  const arrive = t0 + total / speed;
  if (t < t0) return { at: path[0].clone(), yaw: -Math.PI / 2, pose: { kind: "lie", t, headUp: smooth(t0 - 0.6, t0 - 0.2, t) } };
  if (t < arrive) {
    const d = (t - t0) * speed;
    let rem = d;
    let i = 0;
    while (i < lens.length - 1 && rem > lens[i]) rem -= lens[i++];
    const dir = path[i + 1].clone().sub(path[i]).normalize();
    // turning smoothly into the next leg over its last 25 cm
    if (i < lens.length - 1 && lens[i] - rem < 0.25) dir.lerp(path[i + 2].clone().sub(path[i + 1]).normalize(), (0.25 - (lens[i] - rem)) / 0.5).normalize();
    const at = path[i].clone().addScaledVector(path[i + 1].clone().sub(path[i]).normalize(), Math.min(rem, lens[i]));
    // (running, not trotting: long bounds, under three a second, so the legs read at 30 fps)
    return { at, yaw: Math.atan2(-dir.x, -dir.z), pose: { kind: "trot", t, phase: d / (1.6 * BEAGLE.stride(false)), wag: 0.6 } };
  }
  // stop beside her feet, turn to face across her ankles, and flop
  const end = path[path.length - 1];
  const flopAt = V3(ankle.x + 0.06, 0, ankle.z - 0.02);
  const f0 = Math.max(arrive + 0.15, 21.8);
  const k = smooth(f0, f0 + 0.45, t);
  const at = end.clone().lerp(flopAt, k);
  return {
    at,
    // (he came in heading +z; he turns to face your bed, across her legs)
    yaw: Math.PI * (1 - 0.5 * smooth(arrive, arrive + 0.35, t)),
    pose: { kind: "stand", to: "flop", mix: k, t, faceUp: 0.55, headNod: 0.45 * k, blink: smooth(f0 + 0.3, f0 + 0.7, t) * 0.92, wag: 0.4 * (1 - k) },
    ground,
  };
};

// ------------------------------------------------------------------------------------------- beat 4
/** 2011: she's got a boyfriend (on the phone, giggling, heels drumming the bed into the wall); you've got
 * a pillow over your head, then earplugs. Her three knocks you can't hear; you feel them; out comes one
 * earplug, a huge eye-roll, three knocks back; earplug back in. */
const b4 = (t: number): Frame => {
  const n = NORA[16];
  const y = YOU[13];
  const dreamy = smooth(25.0, 25.3, t);
  const nRoll = 0.45 * smooth(25.1, 25.35, t) * (1 - smooth(27.2, 27.6, t));
  const nKnock = knockArm(t, -1, 25.2, 26.0, restOnCovers(n, "near", -1, 0.4));
  const hangUp = smooth(25.0, 25.3, t);
  const texting = smooth(27.3, 27.7, t);
  const nEye = 1.555 * n.k + Math.abs(n.who.shape.chinY);
  const atEar: Reach = {
    body: true,
    at: V3(0.085 * n.k + 0.075, nEye - 0.05, 0.02),
    hand: { curl: [0.85, 0.95, 1.0, 1.05], spread: 0.05, thumbOut: 0.5, thumbCurl: 0.3 },
    palm: V3(-1, 0, 0),
    pole: V3(1, -0.6, 0.2),
  };
  const nora: SibFrame = {
    s: n,
    side: -1,
    covers: 0.6,
    phone: { on: hangUp > 0.5 ? 1 : 0.12, ear: hangUp < 0.5 },
    lie: {
      roll: nRoll,
      near: nKnock,
      far: hangUp <= 0 ? { rest: atEar } : hangUp < 1 ? { rest: atEar, to: phoneHand(n, -1, 1), k: hangUp } : { rest: phoneHand(n, -1, 1 - texting) },
      e: { smile: 0.55 + 0.35 * (dreamy > 0 ? dreamy : 0.5 + 0.5 * Math.sin(t * 6)), squint: 0.25, eyePitch: 0.2, lidL: 0.15 * dreamy, lidR: 0.15 * dreamy },
      prop: 0.004 * Math.max(0, Math.sin(t * 13)) * (t < 24.0 ? 1 : 0),
    },
  };
  // you: the pillow over your head (held there), then the earplugs from the tin on your shelf, in, a glare
  const pillowOn = 1 - smooth(23.9, 24.1, t);
  const reachShelf = smooth(24.05, 24.3, t) * (1 - smooth(24.4, 24.6, t));
  const toEar = smooth(24.55, 24.8, t) * (1 - smooth(24.95, 25.1, t)) + smooth(26.15, 26.3, t) * (1 - smooth(26.35, 26.5, t)) + smooth(27.05, 27.2, t) * (1 - smooth(27.35, 27.5, t));
  const yK = y.k;
  const yEye = 1.555 * yK + Math.abs(y.who.shape.chinY);
  const shelf: Reach = { at: V3(0.14, 0.98, -3.33), hand: { curl: [0.5, 0.6, 0.8, 0.9], spread: 0.05, thumbOut: 0.4, thumbCurl: 0.3 }, palm: V3(0, -1, 0), pole: V3(1, 0.5, 0.5) };
  const ear: Reach = { body: true, at: V3(-0.125, yEye - 0.04, 0.025), hand: { curl: [0.7, 1.2, 1.3, 1.3], spread: 0.0, thumbOut: 0.3, thumbCurl: 0.6 }, palm: V3(1, 0, 0), pole: V3(-1, -0.3, 0.5) };
  const overHead: Reach = { body: true, at: V3(-0.05, yEye + 0.02, -0.16), hand: { curl: [0.6, 0.7, 0.7, 0.8], spread: 0.1, thumbOut: 0.4, thumbCurl: 0.3 }, palm: V3(0, 0, 1), pole: V3(-1, 0, 0.3) };
  const yKnock = knockArm(t, 1, 26.4, 27.1, restOnCovers(y, "near", 1, 0.3));
  const roll = smooth(26.15, 26.5, t) * 0.75;
  const you: SibFrame = {
    s: y,
    side: 1,
    covers: 0.66,
    lie: {
      roll: 0.15 + 0.3 * smooth(24.8, 25.1, t),
      near: t < 26.4 ? { rest: restOnCovers(y, "near", 1, 0.3), to: reachShelf > 0 ? shelf : ear, k: reachShelf > 0 ? reachShelf : toEar } : yKnock,
      far: pillowOn > 0.01 ? { rest: restOnCovers(y, "far", 1, 0.3), to: overHead, k: pillowOn } : { rest: restOnCovers(y, "far", 1, 0.3) },
      e: {
        brow: -0.55 * smooth(24.8, 25.0, t) * (1 - roll),
        smile: -0.2,
        eyeYaw: -0.3 * smooth(24.8, 25.0, t),
        eyePitch: 0.6 * roll * (1 - smooth(26.6, 26.9, t)),
        lidL: 0.25 * roll,
        lidR: 0.25 * roll,
        jaw: 0.05,
      },
      headPitch: 0.15 * roll * (1 - smooth(26.6, 26.9, t)),
      prop: 0.006 * Math.exp(-Math.max(0, t - 26.0) / 0.08) * (t >= 26.0 ? 1 : 0),
      // (both in at 24.9; the one facing up (the head's +x side as you lie) out at 26.3 and back in at 27.3)
      plugs: [t >= 24.9, t >= 24.9 && (t < 26.3 || t >= 27.3)],
    },
  };
  const items: Frame["items"] = [];
  {
    // the pillow over your head, then shoved off to the open side of the bed, where it stays
    const over = V3(0.24, 0.72, -3.22);
    const aside = V3(0.82, BED.top + 0.07, -2.95);
    const qOver = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0.1, Math.PI / 2));
    const qAside = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.35));
    const k = 1 - pillowOn;
    const pos = over.clone().lerp(aside, k).add(V3(0, 0.12 * Math.sin(Math.PI * k), 0));
    items.push({ kind: "pillowOver", pos, q: qOver.clone().slerp(qAside, k) });
  }
  return {
    t,
    nora,
    you,
    items,
    dress: { era: "2011", trex: 0, jolt: 0, stars: 40, starGlow: 0.5, beds: { nora: { kind: "twin", look: "nora2011" }, you: { kind: "twin", look: "you2011" } } },
    light: { hall: 0, street: 0.6, moon: 0.2, nightlight: 0.3, fill: 0.9, fairy: 1 },
    cam: (() => {
      const k = smooth(22.5, 28, t);
      return { target: V3(0, 0.62, -2.98 - 0.3 * k), dist: 4.0 };
    })(),
    look: { exposure: 1.3, sat: 1.08, con: 1.04, tint: [0.98, 0.98, 1.04], shadow: [0.9, 0.92, 1.12], vig: 0.32, grain: 0.016, flash: t < 22.55 ? 0.55 : 0 },
    bloom: 0.6,
    aperture: 0,
    seam: 0,
  };
};

// ------------------------------------------------------------------------------------------- mom
/** The belt under her: 1.7 m/s until she slaps the stop (37.93), then running down over a quarter second. */
const momBelt = (t: number) => {
  const v = 1.7;
  if (t < 37.93) return v * (t - 37.0);
  const u = Math.min(0.27, t - 37.93);
  return v * 0.93 + v * (u - (u * u) / (2 * 0.27));
};
/** Mom's go on the treadmill (2014, real time 37.0-38.8): power-walking on the belt, arms pumping, beaming;
 * slaps the stop; the slowing belt carries her off the back; two staggering steps; a starfish flop onto the
 * carpet, laughing up at the ceiling. */
const momAt = (t: number): Posed => {
  const s = MOM;
  const k = s.k;
  const dir = V3(0, 0, 1);
  // (half a metre from the console, so the stop is in reach)
  const zOn = -0.68;
  const speed = 1.7;
  const base = { e: { smile: 0.75, squint: 0.2, brow: 0.15 }, nearSide: -1 as const, headPitch: 0.05 };
  // the arms, bent and pumping (body frame), against the legs
  const pump = (ph: number): Pick<Posed, "near" | "far"> => {
    const arm = (sd: number, sw: number): ArmSpec => ({
      rest: { body: true, at: V3(sd * 0.2 * k, (0.98 + 0.07 * sw) * k, -(0.1 + 0.15 * sw) * k), hand: { curl: [1.1, 1.2, 1.25, 1.3], spread: 0, thumbOut: 0.2, thumbCurl: 0.8 }, palm: V3(-sd, 0, 0), pole: V3(sd * 0.3, -0.3, 1) },
    });
    return { near: arm(-1, -Math.sin(ph)), far: arm(1, Math.sin(ph)) };
  };
  const onBelt = (tt: number, drift: number) => {
    const d = (tt - 37.0) * speed;
    const ph = (d / (0.62 * k)) * Math.PI * 2;
    const a = V3(TREAD.x, TREAD.deck, zOn);
    const w = walkAlong(s, [a, a.clone().addScaledVector(dir, 60)], d, { ...base, ...pump(ph) });
    // in place: the belt takes the planted foot back under her; drift: carried back as it slows
    const back = -d + drift;
    return { ...w, hip: w.hip.clone().addScaledVector(dir, back), feet: [w.feet[0].clone().addScaledVector(dir, back), w.feet[1].clone().addScaledVector(dir, back)] as [THREE.Vector3, THREE.Vector3] };
  };
  if (t < 37.85) return onBelt(t, 0);
  if (t < 37.97) {
    // the stop: her right hand slaps the console
    const p = onBelt(37.85, 0);
    const slap = smooth(37.85, 37.93, t);
    return { ...p, far: { ...p.far!, to: { at: TREAD.console.clone().add(V3(-0.06, 0.03, -0.02)), hand: { curl: [0.1, 0.1, 0.15, 0.2], spread: 0.1, thumbOut: 0.5, thumbCurl: 0.1 }, palm: V3(0, -1, 0), pole: V3(1, 0, -0.5) }, k: slap }, e: { ...base.e, brow: 0.5 } };
  }
  if (t < 38.27) {
    // carried back on the slowing belt, off its end, arms out for balance (to just where her stagger starts)
    const p = onBelt(37.85 + (t - 37.97) * 0.55, (TREAD.z0 - 0.06 - zOn) * smoother((t - 37.97) / 0.3));
    // (elbows bent, hands up and forward, windmilling a little)
    const w = Math.sin((t - 37.97) * 26);
    const flail = (sd: number): ArmSpec => ({ rest: { body: true, at: V3(sd * (0.36 + 0.04 * w * sd) * k, (1.42 + 0.06 * w * sd) * k, -(0.2 + 0.05 * w) * k), hand: { curl: [0.3, 0.35, 0.4, 0.45], spread: 0.35, thumbOut: 0.6, thumbCurl: 0.1 }, palm: V3(0, 0, -1), pole: V3(sd, -0.6, 0.2) } });
    return { ...p, near: flail(-1), far: flail(1), e: { smile: 0.2, jaw: 0.45, brow: 0.9, lidL: 0, lidR: 0 } };
  }
  // two staggering steps back onto the carpet, then over sideways onto the floor, a starfish across the
  // room just behind the treadmill (her head toward the outer wall, her feet toward the shared one), well
  // clear of the treadmill's end and of the HUD at the top of the frame
  const pivot = V3(-2.0, 0, -2.35);
  const landed0 = lieToPosed(s, -1, { roll: 0, spot: { x: pivot.x, top: 0.16, pillowZ: pivot.z, pillowH: 0 }, prop: -0.16, e: {}, near: null, far: null });
  const yaw = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI / 2 - 0.12);
  const turn = (p: THREE.Vector3) => p.clone().sub(pivot).applyQuaternion(yaw).add(pivot);
  const landed = { ...landed0, hip: turn(landed0.hip), q: yaw.clone().multiply(landed0.q), feet: [turn(landed0.feet[0]), turn(landed0.feet[1])] as [THREE.Vector3, THREE.Vector3] };
  const R = V3(-1, 0, 0).applyQuaternion(yaw);
  const star: Posed = {
    ...landed,
    feet: [landed.feet[0].clone().addScaledVector(R, -0.24), landed.feet[1].clone().addScaledVector(R, 0.24)],
    near: { rest: { at: turn(V3(pivot.x + 0.55, 0.05, pivot.z - 0.02)), hand: { curl: [0.2, 0.25, 0.3, 0.35], spread: 0.25, thumbOut: 0.6, thumbCurl: 0.1 }, palm: V3(0, 1, 0), pole: V3(0, -1, 0.3) } },
    far: { rest: { at: turn(V3(pivot.x - 0.55, 0.05, pivot.z - 0.02)), hand: { curl: [0.2, 0.25, 0.3, 0.35], spread: 0.25, thumbOut: 0.6, thumbCurl: 0.1 }, palm: V3(0, 1, 0), pole: V3(0, -1, 0.3) } },
    nearSide: -1,
    e: { smile: 1, jaw: 0.4 + 0.12 * Math.sin(t * 22), squint: 0.45, lidL: 0.35, lidR: 0.35, brow: 0.35 },
    headPitch: 0,
  };
  const path = [V3(TREAD.x, 0, TREAD.z0 - 0.06), V3(TREAD.x, 0, -2.2)];
  if (t < 38.47) {
    const w = walkAlong(s, path, (t - 38.27) * 1.6, { ...base, e: { smile: 0.3, jaw: 0.3, brow: 0.8 } });
    const wm = Math.sin((t - 38.27) * 22);
    const flail = (sd: number): ArmSpec => ({ rest: { body: true, at: V3(sd * (0.4 + 0.05 * wm * sd) * k, (1.38 + 0.07 * wm * sd) * k, -(0.12 + 0.04 * wm) * k), hand: { curl: [0.3, 0.35, 0.4, 0.45], spread: 0.35, thumbOut: 0.6, thumbCurl: 0.1 }, palm: V3(0, 0, -1), pole: V3(sd, -0.6, 0.2) } });
    return { ...w, q: facing(dir), near: flail(-1), far: flail(1) };
  }
  const st = standAt(s, path[1], dir, base);
  const fall = smooth(38.47, 38.7, t);
  const p = blendPosed({ ...st, near: star.near, far: star.far }, star, fall);
  // a little bounce when she lands
  if (t > 38.7) p.hip = p.hip.clone().add(V3(0, 0.025 * Math.exp(-(t - 38.7) * 14) * Math.abs(Math.sin((t - 38.7) * 30)), 0));
  return { ...p, e: fall < 0.5 ? { smile: 0.4, jaw: 0.5, brow: 0.9 } : star.e };
};

// ------------------------------------------------------------------------------------------- beat 6
/** 2013 → 2016: the morning after, her room emptied; you still asleep with your back to the wall for three
 * years; mom's home gym (briefly); the treadmill becomes the laundry rack; your own boxes; the guest room. */
const b6 = (t: number): Frame => {
  const c = cycle(t, 36.0, 3);
  const night = c.night;
  // (in step with the HUD's calendar: you leave for college at its August 2016, 41.6)
  const youThere = t < 41.55;
  const yAge = t < 38.8 ? 15 : 16;
  const walkers: Walker[] = [];
  const momTime = t >= 37.0 && t < 38.8;
  let you: SibFrame | null = night && youThere && !momTime ? sleeper(YOU[yAge], 1, c.i + 70, { roll: -0.6 }) : null;
  if (momTime) you = null;
  let era: Era = t < 37.0 ? "2013" : "2014";
  if (t >= 41.55) era = "2016";
  if (momTime) walkers.push({ key: "mom", s: MOM, p: momAt(t) });
  return {
    t,
    nora: null,
    you,
    walkers,
    dress: { era, day: !night || momTime, belt: momTime ? momBelt(t) : 0, trex: 0, jolt: 0, stars: t < 40 ? 40 - Math.floor((t - 36) * 4) : 18, starGlow: night ? 0.3 : 0, laundry: smooth(38.8, 40.4, t), dormBoxes: t > 41.05 && t < 41.55, beds: { nora: { kind: "none", look: "nora2007" }, you: { kind: "twin", look: t < 41.55 ? "you2011" : "guest" } } },
    light: momTime
      ? { hall: 0, street: 0, moon: 0, nightlight: 0, fill: 0.5, sun: 0.85, sunAz: 0.3 + 0.05 * (t - 37) }
      : night
        ? { hall: 0, street: 0.6, moon: 0.4, nightlight: 0, fill: 0.7 }
        : { hall: 0, street: 0, moon: 0, nightlight: 0, fill: 0.4, sun: 1, sunAz: (c.u - 0.62) / 0.38 },
    cam: momTime ? { target: V3(-1.2, 0.45, -1.72), dist: 6.0 } : PRESETS.wide,
    look: { ...mixLook(NEUTRAL_GRADE, SLATE, smooth(36, 42, t)), ...(night && !momTime ? {} : { exposure: 1.0 }), flash: [36.0, 37.0, 38.8].some((x) => Math.abs(t - x) < 0.05) ? 0.55 : 0 },
    bloom: 0.5,
    aperture: 0,
    seam: 0,
  };
};

// ------------------------------------------------------------------------------------------- beat 7
/** 2016 → 2024: the empty rooms at dusk, the seasons going by on the porch roof, while the birthday texts
 * get shorter (the overlay's chat card). */
const b7 = (t: number): Frame => {
  const c = cycle(t, 42.0, 1.4);
  // the light keeps to the HUD's clock: the two birthday texts at midnight (2017, 2020) in the dark, the
  // last one (2024, 4:37 PM) by day, a slow drift in each
  const dusk = t < 45.6 ? 0.12 + 0.1 * Math.sin(c.u * Math.PI * 2) : 0.85 + 0.1 * Math.sin(c.u * Math.PI * 2);
  return {
    t,
    nora: null,
    you: null,
    dress: { era: "2016", day: dusk > 0.6, trex: 0, jolt: 0, stars: 6, starGlow: 0.15 * (1 - dusk), laundry: 1, beds: { nora: { kind: "none", look: "nora2007" }, you: { kind: "twin", look: "guest" } } },
    // (the midnights properly dark: the street lamp and a little moon; the afternoon by day)
    light: t < 45.6 ? { hall: 0, street: 0.5, moon: 0.3, nightlight: 0, fill: 0.42 } : { hall: 0, street: 0, moon: 0, nightlight: 0, fill: 0.6 + 0.4 * dusk, sun: 0.35 * dusk, sunAz: c.u },
    cam: camBetween(t, 42, 47.5, PRESETS.wide, { target: PRESETS.wide.target, dist: PRESETS.wide.dist * 0.97 }),
    look: { ...SLATE, sat: 0.7, ...(t < 45.6 ? { exposure: 1.12 } : {}) },
    bloom: 0.45,
    aperture: 0.004,
    seam: 0,
  };
};

/** In a time-lapse, whether this frame is one of the day frames (the HUD's clock shows a daytime then);
 * null outside the time-lapses. */
export const lapseDay = (t: number): boolean | null => {
  if (t >= 8.0 && t < 10.4) return !cycle(t, 8.0).night;
  if (t >= 13.9 && t < 15.0) return !cycle(t, 13.9).night;
  if ((t >= 36.0 && t < 37.0) || (t >= 38.8 && t < 42.0)) return !cycle(t, 36.0, 3).night;
  return null;
};

// ------------------------------------------------------------------------------------------- the film
/** simple: the short cut's calmer variant of a few beats (one soft flash of lightning, no relight when she
 * answers, covers at the waist so resting hands stay on top of them, no hesitation or rolling away). */
export const frameAt = (t: number, simple = false): Frame => {
  SIMPLE = simple;
  try {
    const f = frame(t);
    // the note stays where it fell
    if (f.note === undefined && t >= 13.05) f.note = noteAt(13.2);
    return f;
  } finally {
    SIMPLE = false;
  }
};
const frame = (t: number): Frame => {
  if (t < 8) return b1(t);
  if (t < 15) return b2(t);
  if (t < 22.5) return b3(t);
  if (t < 28) return b4(t);
  if (t < 36) return b5(t);
  if (t < 42) return b6(t);
  if (t < 47.5) return b7(t);
  if (t < 55) return b8(t);
  if (t < 67.5) {
    const f = b9(t);
    // the second macro: the same lens in the wall, the note in the dust, the two rings meeting
    if (t >= 59.3 && t < 60.1) f.macro = 1;
    return f;
  }
  // the end card: the last wide, held and dimmed
  const f = b9(67.49);
  return { ...f, t, look: { ...f.look, fade: 1 - 0.55 * smooth(67.5, 68.0, t) }, aperture: 0.006 };
};
