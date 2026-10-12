import * as THREE from "three";
import { ADULT_F, ADULT_M, KID, NEUTRAL, type Expr, type Shape } from "./face/sculpt";
import type { Person, HairStyle } from "./face/Head";
import { SISTER, YOU } from "./cast";
import { HER_SEAT, SEATS, YOUR_SEAT } from "./track";
import { BEAT, FPS, smooth } from "./world";
import { feltSmooth } from "./dynamics";

/**
 * Everyone on the train and what they do, as functions of video time u: where they look, their face, their
 * arms. Your sister is scripted beat by beat (the joke: she is bored the whole way); the others react to
 * the ride by temperament: screamers, laughers, an arms-up enthusiast, an eyes-shut prayer, a stoic.
 */

export type ArmMode = "grip" | "up" | "wave" | "thumb" | "chin" | "point";
export type ArmPose = { mode: ArmMode; k: number };
export type Clothes = { top: string; sleeves: "short" | "long"; bottom: string; legs: "shorts" | "pants"; shoe: string; sole: string };
export type RiderScript = {
  person: Person;
  row: number;
  seat: number;
  /** body size (1 adult) and how high the eyes sit over the seat (m) */
  k: number;
  eye: number;
  clothes: Clothes;
  look: (u: number) => { yaw: number; pitch: number };
  face: (u: number) => Expr;
  arms: (u: number) => { L: ArmPose; R: ArmPose };
  seed: number;
};

const SKINS = ["#F3D2B5", "#EBC09C", "#D9A37A", "#C08A60", "#9A6844", "#6E4730"];
const HAIRS = ["#1B1410", "#2E2018", "#4A3222", "#6B4A2F", "#A47B4F", "#D7B576", "#7E3A22"];
const IRISES = ["#3B2A1E", "#4A3322", "#2F5E8C", "#3F6E4A", "#5A4532"];
const TOPS = ["#E05A4F", "#3E6FB0", "#F2C14E", "#4E9A6A", "#7B5BA6", "#F4F1EA", "#2F2F3A", "#E98A3B", "#5DA9C9", "#C94F7C"];
const BOTTOMS = ["#2E3A55", "#3B4A6B", "#262A33", "#6B5A47", "#9A9A92"];

const hash = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};
const pick = <T,>(a: T[], u: number) => a[Math.min(a.length - 1, Math.floor(u * a.length))];
const wob = (u: number, seed: number, hz = 0.5) =>
  Math.sin(u * hz * 6.28 + seed) * 0.6 + Math.sin(u * hz * 2.7 * 6.28 + seed * 2.1) * 0.4;
/** 0..1 bump over [a, b] with soft edges. */
const span = (u: number, a: number, b: number, e = 0.25) => smooth(a - e, a + e, u) * (1 - smooth(b - e, b + e, u));

/* ------------------------------------------------------------------ */
/* The ride's phases, for everyone                                      */
/* ------------------------------------------------------------------ */

const P = {
  lift: [BEAT.chain, BEAT.liftTop] as const,
  hold: [BEAT.hold, BEAT.release] as const,
  ride: [BEAT.over, BEAT.brakes] as const,
  end: BEAT.brakes,
};
/** How intense the ride is at u (0 calm .. 1 the drop's bottom), for screams. */
const thrill = (u: number) =>
  smooth(P.ride[0] - 0.4, P.ride[0] + 0.6, u) * (1 - smooth(P.end - 0.3, P.end + 1.2, u)) *
  (0.75 + 0.25 * Math.sin(u * 2.1));

/* ------------------------------------------------------------------ */
/* Your sister                                                          */
/* ------------------------------------------------------------------ */

/** When you look at her (world.ts LOOK keys), she is doing these. */
export const SIS = {
  /** the station: a big gap-toothed grin, bouncing */
  grin: [0.0, 2.3] as const,
  /** the lift: she yawns at you */
  yawn: [BEAT.chain + 4.4, BEAT.chain + 6.0] as const,
  /** the hold: a bubble */
  bubble: BEAT.bubble,
  pop: BEAT.release,
  /** upside down in the Immelmann: a thumbs-up, deadpan */
  thumb: [BEAT.immTop - 0.4, BEAT.immTop + 1.0] as const,
  /** soaked after the splash: a slow blink */
  soaked: [BEAT.splash[1] + 0.3, BEAT.splash[1] + 1.6] as const,
  /** the brakes: she turns to you, grinning */
  again: BEAT.brakes + 0.4,
};

const sisterLook = (u: number) => {
  // she faces the front, glances about; turns to you (her left, yaw +) at the beats you look at her
  const atYou =
    span(u, 0.7, 2.4, 0.2) +
    span(u, SIS.yawn[0] - 0.3, SIS.yawn[1], 0.25) +
    span(u, BEAT.bubble[0] + 0.3, BEAT.bubble[1] - 0.2, 0.3) +
    span(u, SIS.thumb[0], SIS.thumb[1], 0.2) +
    span(u, SIS.soaked[0], SIS.soaked[1], 0.2) +
    smooth(SIS.again - 0.2, SIS.again + 0.5, u);
  const k = Math.min(1, atYou);
  const idleYaw = 0.25 * wob(u, 3, 0.11) - 0.15 * smooth(BEAT.chain, BEAT.chain + 2, u) * (1 - smooth(P.lift[1], P.lift[1] + 2, u));
  const idlePitch = 0.08 * wob(u, 5, 0.09) - 0.25 * span(u, BEAT.chain + 7, BEAT.chain + 9.5, 0.6);
  // turned to you: her neck takes most of it (you sit at her left, a head taller), her eyes the rest
  return { yaw: idleYaw * (1 - k) + 1.28 * k, pitch: idlePitch * (1 - k) + 0.24 * k };
};

/** How much she is looking at you (0..1). */
const sisterAtYou = (u: number) =>
  Math.min(
    1,
    span(u, 0.7, 2.4, 0.2) +
      span(u, SIS.yawn[0] - 0.3, SIS.yawn[1], 0.25) +
      span(u, BEAT.bubble[0] + 0.3, BEAT.bubble[1] - 0.2, 0.3) +
      span(u, SIS.thumb[0], SIS.thumb[1], 0.2) +
      span(u, SIS.soaked[0], SIS.soaked[1], 0.2) +
      smooth(SIS.again - 0.2, SIS.again + 0.5, u),
  );

const sisterFace = (u: number): Expr => {
  const e: Expr = { ...NEUTRAL };
  // blinking
  const bp = (u + 0.37) % 3.7;
  const blink = bp < 0.14 ? Math.sin((bp / 0.14) * Math.PI) : 0;
  // bored by default: lids a bit low, chewing gum
  const bored = smooth(2.2, 3.5, u) * (1 - smooth(SIS.again - 0.3, SIS.again + 0.3, u));
  e.lidL = e.lidR = 0.3 * bored;
  e.chew = Math.sin(u * 2 * Math.PI * 1.4) * 0.8 * bored * (1 - span(u, BEAT.bubble[0], BEAT.bubble[1] + 0.2, 0.15));
  e.jaw = 0.06 + 0.06 * Math.max(0, Math.sin(u * 2 * Math.PI * 1.4)) * bored;
  // the station grin
  const g = span(u, SIS.grin[0] - 1, SIS.grin[1], 0.3);
  e.smile += 0.95 * g;
  e.jaw += 0.22 * g;
  e.squint += 0.25 * g;
  // the yawn
  const y = span(u, SIS.yawn[0] + 0.2, SIS.yawn[1] - 0.2, 0.35);
  e.jaw = Math.max(e.jaw, 0.85 * y);
  e.squint += 0.7 * y;
  e.lidL = e.lidR = Math.max(e.lidL, 0.75 * y);
  e.brow += 0.4 * y;
  e.wide += 0.15 * y;
  // the bubble: lips pursed round it, cheeks puffed a little
  const b = span(u, BEAT.bubble[0], BEAT.bubble[1], 0.2);
  e.pucker = Math.max(e.pucker, 0.85 * b);
  e.puff = 0.35 * b;
  e.jaw = e.jaw * (1 - b);
  e.lidL = e.lidR = Math.max(e.lidL, 0.38 * b);
  // the pop: a blink of surprise, brows up, then straight back to bored
  const pop = span(u, SIS.pop, SIS.pop + 0.35, 0.08);
  e.lidL = e.lidR = Math.max(e.lidL, 0.95 * pop);
  e.brow += 0.6 * pop;
  // the ride: deadpan, eyes narrowed against the wind
  const ride = smooth(BEAT.over, BEAT.over + 0.8, u) * (1 - smooth(P.end, P.end + 0.6, u));
  e.squint += 0.35 * ride;
  // soaked: a slow blink
  const sk = span(u, SIS.soaked[0] + 0.3, SIS.soaked[0] + 0.9, 0.15);
  e.lidL = e.lidR = Math.max(e.lidL, sk);
  // again!: a huge grin
  const again = smooth(SIS.again, SIS.again + 0.5, u);
  e.smile = Math.max(e.smile, again);
  e.jaw = Math.max(e.jaw, 0.42 * again);
  e.squint = Math.max(e.squint, 0.35 * again);
  e.brow += 0.3 * again;
  e.lidL = Math.max(e.lidL, blink);
  e.lidR = Math.max(e.lidR, blink);
  // eyes: on you when she looks at you, else roaming a little
  const at = sisterAtYou(u);
  e.eyeYaw = 0.12 * wob(u, 7, 0.3) * (1 - at) + 0.2 * at;
  e.eyePitch = (-0.05 + 0.06 * wob(u, 9, 0.21)) * (1 - at) + 0.06 * at;
  return e;
};

const sisterArms = (u: number) => {
  const thumb = span(u, SIS.thumb[0], SIS.thumb[1], 0.2);
  const upRide = smooth(BEAT.over + 1.5, BEAT.over + 2.5, u) * (1 - smooth(BEAT.immTop - 1.0, BEAT.immTop - 0.5, u));
  const upLate = span(u, BEAT.zr[0] - 0.5, BEAT.brakes - 0.5, 0.4);
  const wave = span(u, 0.2, 1.6, 0.3);
  return {
    L: thumb > 0.02 ? ({ mode: "thumb", k: thumb } as ArmPose) : ({ mode: "up", k: Math.max(upRide, upLate) * 0.9 } as ArmPose),
    R: wave > 0.02 ? ({ mode: "wave", k: wave } as ArmPose) : ({ mode: "up", k: Math.max(upRide, upLate) } as ArmPose),
  };
};

/* ------------------------------------------------------------------ */
/* Everyone else                                                        */
/* ------------------------------------------------------------------ */

type Temper = "screamer" | "laugher" | "armsup" | "prayer" | "stoic";

const generic = (seed: number, temper: Temper, faceTowardYou: number) => {
  const look = (u: number) => {
    const fear = span(u, P.hold[0] - 1, P.hold[1] + 0.5, 0.5);
    const yaw = 0.35 * wob(u, seed, 0.13) * (1 - 0.7 * thrill(u)) + faceTowardYou * 0.15 * span(u, 0, 2.5);
    const pitch = 0.1 * wob(u, seed + 3, 0.1) - 0.6 * fear - 0.2 * span(u, P.lift[0] + 2, P.lift[1], 1);
    return { yaw, pitch };
  };
  const face = (u: number): Expr => {
    const e: Expr = { ...NEUTRAL };
    const bp = (u + seed * 0.71) % (3 + (seed % 3));
    const blink = bp < 0.13 ? Math.sin((bp / 0.13) * Math.PI) : 0;
    const th = thrill(u);
    const nervous = span(u, P.lift[0], P.hold[1], 0.8);
    const fear = span(u, P.hold[0] - 1.5, P.hold[1] + 0.3, 0.4);
    const relief = smooth(P.end + 0.2, P.end + 1.2, u);
    // station: smiles
    e.smile = 0.5 * (1 - smooth(1.5, 4, u)) + 0.9 * relief;
    e.jaw = 0.25 * relief;
    e.brow = 0.2 * nervous + 0.7 * fear;
    e.wide = 0.3 * fear;
    e.jaw = Math.max(e.jaw, 0.12 * fear);
    // the ride, by temperament
    const burst = 0.65 + 0.35 * Math.sin(u * (1.3 + (seed % 5) * 0.11) + seed);
    if (temper === "screamer") {
      e.jaw = Math.max(e.jaw, 0.95 * th * burst);
      e.wide = Math.max(e.wide, 0.7 * th);
      e.squint = 0.8 * th;
      e.brow += 0.6 * th;
    } else if (temper === "laugher" || temper === "armsup") {
      e.jaw = Math.max(e.jaw, 0.6 * th * burst);
      e.smile = Math.max(e.smile, 0.95 * th);
      e.squint = 0.6 * th;
    } else if (temper === "prayer") {
      e.lidL = e.lidR = 0.95 * Math.max(th, fear * 0.7);
      e.wide = Math.max(e.wide, 0.5 * th);
      e.smile = -0.4 * th;
      e.jaw = Math.max(e.jaw, 0.2 * th);
    } else {
      e.smile = Math.max(e.smile, 0.2 * th);
      e.squint = 0.4 * th;
      e.jaw = Math.max(e.jaw, 0.08 * th);
    }
    e.lidL = Math.max(e.lidL, blink);
    e.lidR = Math.max(e.lidR, blink);
    e.eyeYaw = 0.1 * wob(u, seed + 11, 0.3);
    e.eyePitch = 0.05 * wob(u, seed + 13, 0.2);
    return e;
  };
  const arms = (u: number) => {
    const up = temper === "armsup" ? smooth(P.ride[0] + 0.5, P.ride[0] + 1.3, u) * (1 - smooth(P.end - 0.5, P.end, u)) : 0;
    const laughUp = temper === "laugher" ? span(u, P.ride[0] + 12, P.ride[0] + 20, 0.5) * 0.85 : 0;
    return {
      L: { mode: "up", k: Math.max(up, laughUp) } as ArmPose,
      R: { mode: "up", k: Math.max(up, laughUp) } as ArmPose,
    };
  };
  return { look, face, arms };
};

const shapeFor = (female: boolean, seed: number): Shape => {
  const b = female ? ADULT_F : ADULT_M;
  const j = (k: number) => 1 + (hash(seed * 7 + k) - 0.5) * 0.08;
  return {
    ...b,
    w: b.w * j(1),
    h: b.h * j(2),
    noseLen: b.noseLen * j(3) * j(4),
    noseW: b.noseW * j(5),
    mouthW: b.mouthW * j(6),
    jaw: Math.min(1, Math.max(0, b.jaw + (hash(seed + 9) - 0.5) * 0.4)),
    cheek: Math.max(0, b.cheek + (hash(seed + 10) - 0.5) * 0.4),
  };
};

const mkPerson = (seed: number, female: boolean, style?: HairStyle): Person => {
  const tone = pick(SKINS, hash(seed + 1));
  const dark = SKINS.indexOf(tone) >= 3;
  const hair = pick(dark ? HAIRS.slice(0, 3) : HAIRS, hash(seed + 2));
  const st: HairStyle =
    style ??
    (female
      ? pick(["pony", "long", "bun", "pony", "curly"] as HairStyle[], hash(seed + 3))
      : pick(["short", "short", "buzz", "curly", "short"] as HairStyle[], hash(seed + 3)));
  return {
    name: `r${seed}`,
    shape: shapeFor(female, seed),
    skin: {
      tone,
      blush: female ? 0.6 : 0.35,
      freckles: !dark && hash(seed + 4) < 0.25 ? 0.6 : 0,
      lip: female ? "#C26D6A" : "#B97B72",
      seed,
      browTint: hair,
    },
    iris: pick(dark ? IRISES.slice(0, 2) : IRISES, hash(seed + 5)),
    hair: { style: st, color: hair, tie: st === "pony" ? pick(["#2F2F3A", "#C94F7C", "#3E6FB0"], hash(seed + 6)) : undefined },
    brow: hair,
    lashes: female ? 0.8 : 0.35,
  };
};

const clothesFor = (seed: number): Clothes => {
  const pants = hash(seed + 20) < 0.4;
  const shoe = pick(["#F4F4F2", "#1C1C1F", "#C0392B", "#3E6FB0", "#F4F4F2"], hash(seed + 22));
  return {
    top: pick(TOPS, hash(seed + 21)),
    sleeves: hash(seed + 23) < 0.8 ? "short" : "long",
    bottom: pick(BOTTOMS, hash(seed + 24)),
    legs: pants ? "pants" : "shorts",
    shoe,
    sole: shoe === "#1C1C1F" ? "#2A2A2E" : "#EDEDED",
  };
};

/* ------------------------------------------------------------------ */
/* The train                                                            */
/* ------------------------------------------------------------------ */

const TEMPERS: Temper[] = ["screamer", "laugher", "armsup", "prayer", "stoic", "screamer", "laugher", "armsup"];

export const RIDERS: RiderScript[] = (() => {
  const out: RiderScript[] = [];
  let n = 0;
  for (let row = 0; row < 3; row++)
    for (let seat = 0; seat < SEATS.length; seat++) {
      if (row === 0 && (seat === YOUR_SEAT || seat === HER_SEAT)) continue;
      const seed = 101 + row * 17 + seat * 5;
      const female = hash(seed) < 0.5;
      const temper = TEMPERS[(n * 3 + row) % TEMPERS.length];
      const g = generic(seed, temper, seat < YOUR_SEAT ? -1 : 1);
      out.push({
        person: mkPerson(seed, female),
        row,
        seat,
        k: female ? 0.95 : 1.0,
        eye: female ? 0.72 : 0.75,
        clothes: clothesFor(seed),
        look: g.look,
        face: g.face,
        arms: g.arms,
        seed,
      });
      n++;
    }
  out.push({
    person: SISTER,
    row: 0,
    seat: HER_SEAT,
    k: 0.76,
    eye: 0.585,
    clothes: { top: "#FFD23F", sleeves: "short", bottom: "#3B6FB6", legs: "shorts", shoe: "#FF6FAE", sole: "#FFFFFF" },
    look: sisterLook,
    face: sisterFace,
    arms: sisterArms,
    seed: 7,
  });
  return out;
})();

/** You: big brother, in the third seat. Only your arms and legs are seen (and your face in the photo). */
export const YOU_RIDER: RiderScript = {
  person: YOU,
  row: 0,
  seat: YOUR_SEAT,
  k: 0.98,
  eye: 0.75,
  clothes: { top: "#2B2D33", sleeves: "short", bottom: "#4A5568", legs: "shorts", shoe: "#F4F4F2", sole: "#DADAD5" },
  look: () => ({ yaw: 0, pitch: 0 }),
  face: (u: number) => {
    const e = generic(3, "screamer", 0).face(u);
    return e;
  },
  arms: () => ({ L: { mode: "grip", k: 0 }, R: { mode: "grip", k: 0 } }),
  seed: 3,
};

/* ------------------------------------------------------------------ */
/* Head pose in the row frame (shared with the hair dynamics)           */
/* ------------------------------------------------------------------ */

/** The base of the skull's centre (head space origin) over the seat, and the head's turn. */
export const headPose = (sc: RiderScript, frame: number) => {
  const u = frame / FPS;
  const look = sc.look(u);
  const fl = feltSmooth(frame, sc.row);
  const gn = fl.y / 9.81;
  // pushed by the g's: sinks and tips down at the bottoms, lifts in the airtime, leans in turns
  const sink = Math.max(-0.03, Math.min(0.035, -0.012 * (gn - 1)));
  const tipDown = Math.max(-0.12, Math.min(0.12, 0.03 * (gn - 1) + 0.02 * (fl.z / 9.81)));
  const lean = Math.max(-0.15, Math.min(0.15, 0.06 * (fl.x / 9.81)));
  const pos = new THREE.Vector3(SEATS[sc.seat] - 0.02 * lean, -0.36 + sc.eye + sink, 0.02 * sc.k);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-look.pitch + tipDown, Math.PI + look.yaw, lean * 0.5, "YXZ"),
  );
  return { pos, quat };
};

export const KID_SHAPE = KID;
