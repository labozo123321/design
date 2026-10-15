import React from "react";
import * as THREE from "three";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import { GRIP, OPEN, RELAX, THUMBS_UP, mixHand } from "../coaster/Hand";
import type { Arm, Pose } from "../wedding/Figure";
import { KidFigure, SEAT_LIFT, type Extras } from "./People";
import { FRIEND, GLASS, GUM, HEIGHT, HUNTER, LINE, MEWER, MOGGER, NORMAL, PHOTOG, TEACHER, type Kid } from "./cast";
import { CUE_W, clamp, hash, smooth, vnoise } from "./timeline";
import { Clipboard, FaceGlare, HeldSunglasses, LeafBlower } from "./Props";
import { STOOL_H } from "./Gym";

/**
 * Who's where, doing what, at a moment of world time: each kid walks in from the line, sits on the stool,
 * does his face (his own script: the mew, the hunter eyes, the gum, the glass skin, the normal smile, the
 * height-maxer on the stool, the mogger and his friend's leaf blower), gets up and goes; the kids waiting
 * along the wall and the teacher; the photographer himself at the end, the camera turned on his own face.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The camera on its tripod (the photographer stands behind it). */
export const TRIPOD = V3(0, 1.37, 2.6);
/** Seated, the body turned a little toward the key light; walking in from the line and out the other side. */
const STOOL_YAW = -(Math.PI + 0.42);
const ENTRY = V3(-0.98, 0, 0.36);
const EXIT = V3(1.9, 0, 0.6);
const FEET_SEAT: [THREE.Vector3, THREE.Vector3] = [V3(-0.11, 0.25, -0.17), V3(0.11, 0.25, -0.17)];

const cw = (kid: string, beat: string) => CUE_W[`${kid}.${beat}`];

export type Act = {
  kid: Kid;
  pose: Pose;
  at: THREE.Vector3;
  yaw: number;
  extras?: Extras;
  hi?: boolean;
  /** the whole body tipped over (radians, about the feet, toward the body's right) */
  tip?: number;
  /** extra things in the body's frame */
  children?: React.ReactNode;
  /** things in head space */
  head?: React.ReactNode;
  /** a stable name for the figure (so it isn't rebuilt when others come and go) */
  role?: string;
};

/** Facing the direction of travel (dx, dz). */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Walking legs, hips and arms at a walk cycle phase (amt 0 standing .. 1 striding). */
const walk = (k: number, phase: number, amt: number, lifts = 0, swagger = 0) => {
  const feet = [-1, 1].map((side) => {
    const ph = phase + (side > 0 ? Math.PI : 0);
    const z = -0.26 * k * Math.sin(ph) * amt;
    const up = 0.07 * k * Math.max(0, Math.cos(ph)) * amt;
    return V3(side * (0.1 + 0.03 * swagger) * k, 0.09 * k + lifts + up, -0.01 + z);
  }) as [THREE.Vector3, THREE.Vector3];
  const hipY = 0.93 * k + lifts;
  const arms = [-1, 1].map((side) => {
    const ph = phase + (side > 0 ? Math.PI : 0);
    return {
      at: V3(side * (0.2 + 0.05 * swagger) * k, hipY - 0.08 * k + 0.02 * amt * Math.max(0, Math.sin(ph)), 0.15 * k * Math.sin(ph) * amt * (1 + 0.6 * swagger)),
      hand: RELAX,
      palm: V3(-side, 0, 0),
      pole: V3(side * 0.3, -0.4, 1),
    } as Arm;
  }) as [Arm, Arm];
  return { feet, arms, bob: 0.012 * Math.cos(2 * phase) * amt, roll: (0.02 + 0.05 * swagger) * Math.sin(phase) * amt };
};

type Perf = {
  e?: Partial<Expr>;
  look?: THREE.Vector3;
  headRoll?: number;
  lean?: number;
  twist?: number;
  roll?: number;
  armL?: Arm;
  armR?: Arm;
  feet?: [THREE.Vector3, THREE.Vector3];
  extras?: Extras;
  children?: React.ReactNode;
  head?: React.ReactNode;
};

/**
 * The common part: in from the line, sit, (the performance), up, out. b: the kid's beats in world time.
 * Returns null when he's not in the picture.
 */
const hero = (kid: Kid, b: { in: number; sit: number; up: number }, tw: number, perf: (tw: number) => Perf, opts: { swagger?: number; speed?: number } = {}): Act | null => {
  const k = kid.k;
  const lifts = kid.outfit.lifts ?? 0;
  const tArrive = b.sit - 0.35;
  if (tw < b.in) return null;
  const sw = opts.swagger ?? 0;
  // ---- walking in
  if (tw < tArrive) {
    const u = (tw - b.in) / (tArrive - b.in);
    const e = 1 - (1 - u) * (1 - u) * 0.6 - 0.4 * (1 - u); // most of the way at a steady pace, easing in at the end
    const at = ENTRY.clone().lerp(V3(0, 0, 0), e);
    const dist = ENTRY.length() * e;
    const w = walk(k, (dist / (1.2 * k)) * Math.PI * 2, Math.min(1, (1 - u) * 6), lifts, sw);
    return {
      kid,
      at,
      yaw: yawToward(-ENTRY.x, -ENTRY.z),
      pose: { e: { ...NEUTRAL }, feet: w.feet, armL: w.arms[0], armR: w.arms[1], lift: w.bob, roll: w.roll, lean: 0.04 - 0.08 * sw, headYaw: 0.25 * smooth(0.5, 1, u) },
      extras: perf(tw).extras,
      children: perf(tw).children,
    };
  }
  // ---- sitting down, seated, getting up
  const sitK = smooth(tArrive, b.sit + 0.15, tw) * (1 - smooth(b.up, b.up + 0.32, tw));
  const tLeave = b.up + 0.32;
  if (tw < tLeave || sitK > 0.01) {
    const turnIn = smooth(tArrive - 0.05, b.sit - 0.02, tw);
    const turnOut = smooth(b.up + 0.05, b.up + 0.32, tw);
    const yaw = lerp(lerp(yawToward(-ENTRY.x, -ENTRY.z), STOOL_YAW, turnIn), yawToward(EXIT.x, EXIT.z), turnOut);
    const p = perf(tw);
    const relax = 1 - smooth(b.up - 0.12, b.up + 0.25, tw);
    const e = { ...NEUTRAL } as Expr;
    for (const [key, val] of Object.entries(p.e ?? {})) (e as Record<string, number>)[key] = (val as number) * relax;
    if (sitK < 0.55) {
      // standing, bending to sit (or rising)
      const cSw = (0.93 - (0.56 + SEAT_LIFT) / k) / 0.55;
      const c = cSw * (sitK / 0.55);
      return {
        kid,
        at: V3(0, 0, 0),
        yaw,
        pose: { e, crouch: c, lean: 0.22 * (sitK / 0.55), look: p.look ?? null, armL: undefined, armR: undefined },
        extras: p.extras,
        children: p.children,
        head: p.head,
      };
    }
    const settle = (sitK - 0.55) / 0.45;
    return {
      kid,
      at: V3(0, 0, 0),
      yaw,
      pose: {
        sit: true,
        lift: SEAT_LIFT,
        feet: p.feet ?? FEET_SEAT,
        e,
        look: p.look ?? TRIPOD,
        headRoll: p.headRoll,
        lean: (p.lean ?? 0) + 0.22 * (1 - settle) + 0.012 * Math.sin(tw * 1.9 + kid.who.skin.seed),
        twist: p.twist,
        roll: p.roll,
        armL: p.armL,
        armR: p.armR,
      },
      extras: p.extras,
      children: p.children,
      head: p.head,
    };
  }
  // ---- walking out
  const speed = opts.speed ?? 1.45;
  const d = (tw - tLeave) * speed;
  const total = EXIT.length();
  if (d > total + 0.4) return null;
  const at = EXIT.clone().multiplyScalar(Math.min(1, d / total));
  const w = walk(k, (d / (1.2 * k)) * Math.PI * 2, Math.min(1, d * 4), lifts, sw);
  const p = perf(tw);
  return {
    kid,
    at,
    yaw: yawToward(EXIT.x, EXIT.z),
    pose: { e: { ...NEUTRAL, ...(kid.key === "gum" ? { jaw: p.e?.jaw ?? 0, chew: p.e?.chew ?? 0 } : {}) }, feet: w.feet, armL: w.arms[0], armR: w.arms[1], lift: w.bob, roll: w.roll, lean: 0.04 },
    extras: p.extras,
    children: p.children,
    head: p.head,
  };
};

const beats = (kid: string) => ({ in: cw(kid, "in"), sit: cw(kid, "sit"), up: cw(kid, "up") });
const up = (y: number) => TRIPOD.clone().add(V3(0, y, 0));

/* ------------------------------------------------------------------ */
/* The performances                                                       */
/* ------------------------------------------------------------------ */

const mewer = (tw: number) =>
  hero(MEWER, beats("mewer"), tw, (t) => {
    const a = smooth(cw("mewer", "pose") - 0.1, cw("mewer", "pose") + 0.25, t);
    const late = smooth(cw("mewer", "flash") - 0.16, cw("mewer", "flash") - 0.01, t);
    return {
      e: { jut: 0.55 * a + 1.15 * late, brow: -0.35 * a - 0.45 * late, squint: 0.3 * a + 0.25 * late, lidL: 0.18 * a + 0.4 * late, lidR: 0.22 * a + 0.55 * late, smile: -0.12 * a },
      look: up(0.55 * a + 0.35 * late),
      headRoll: 0.1 * a,
      lean: -0.04 * a,
    };
  });

const hunter = (tw: number) =>
  hero(HUNTER, beats("hunter"), tw, (t) => {
    const a = smooth(cw("hunter", "pose") - 0.1, cw("hunter", "pose") + 0.3, t);
    const shut = smooth(cw("hunter", "flash") - 0.09, cw("hunter", "flash") - 0.005, t);
    return {
      e: { brow: -0.95 * a, squint: 0.55 * a + 0.45 * shut, lidL: 0.3 * a + 0.75 * shut, lidR: 0.3 * a + 0.75 * shut, eyePitch: 0.18 * a * (1 - shut), jut: 0.15 * a, smile: -0.06 * a },
      look: up(-0.32 * a),
      headRoll: -0.05 * a,
    };
  });

const gum = (tw: number) =>
  hero(GUM, beats("gum"), tw, (t) => {
    const seated = smooth(cw("gum", "sit") - 0.2, cw("gum", "sit"), t);
    const a = smooth(cw("gum", "pose") - 0.1, cw("gum", "pose") + 0.3, t);
    const cyc = 2 * Math.PI * 1.9 * t;
    const wide = smooth(cw("gum", "flash") - 0.12, cw("gum", "flash") - 0.01, t);
    const jaw = 0.06 + 0.17 * (0.5 + 0.5 * Math.sin(cyc));
    const chew = 0.8 * Math.sin(cyc + 1.2);
    return {
      e: {
        jaw: lerp(jaw * seated, 0.55, wide),
        chew: lerp(chew * seated, 0.95, wide),
        brow: -0.45 * a + 0.75 * wide,
        squint: 0.35 * a * (1 - wide),
        lidL: 0.15 * a + 0.4 * wide,
        lidR: 0.1 * a + 0.5 * wide,
      },
      look: up(0.04 * Math.sin(cyc) * seated + 0.1 * a),
      headRoll: 0.04 * Math.sin(cyc * 0.5) * a,
      extras: { gum: true },
    };
  });

const glass = (tw: number) =>
  hero(GLASS, beats("glass"), tw, (t) => {
    const a = smooth(cw("glass", "pose") - 0.1, cw("glass", "pose") + 0.3, t);
    const glare = smooth(cw("glass", "flash") - 0.03, cw("glass", "flash"), t) * (1 - smooth(cw("glass", "flash") + 0.005, cw("glass", "up"), t));
    return {
      e: { smile: 0.14 * a, squint: 0.22 * a, brow: -0.15 * a, lidL: 0.12 * a, lidR: 0.12 * a },
      look: TRIPOD.clone().add(V3(0.32 * a, 0.12 * a, 0)),
      headRoll: -0.06 * a,
      head: <FaceGlare k={glare} />,
    };
  });

const normal = (tw: number) =>
  hero(NORMAL, beats("normal"), tw, (t) => {
    const sm = smooth(cw("normal", "smile") - 0.05, cw("normal", "smile") + 0.35, t);
    return {
      e: { smile: 0.85 * sm, jaw: 0.1 * sm, wide: 0.15 * sm, squint: 0.3 * sm, brow: 0.12 * sm },
      look: TRIPOD,
      headRoll: 0.07 * sm,
    };
  });

/** The height-maxer: lift shoes, then up onto the stool; the wobble; the fall; up again, thumbs up. */
const height = (tw: number): Act | null => {
  const tStand = cw("height", "stand");
  const tWob = cw("height", "wobble");
  const tFall = cw("height", "fall");
  const tPop = cw("height", "popUp");
  const kid = HEIGHT;
  const k = kid.k;
  const lifts = kid.outfit.lifts ?? 0;
  const b = { in: cw("height", "in"), sit: cw("height", "sit"), up: tStand };
  if (tw < tStand + 0.02)
    return hero(kid, b, tw, (t) => {
      const a = smooth(cw("height", "pose") - 0.1, cw("height", "pose") + 0.2, t);
      return { e: { brow: -0.3 * a, smile: -0.2 * a }, look: up(0.05) };
    });
  // up onto the stool (slow motion: the edit's begun)
  const climb = smooth(tStand, tStand + 0.5, tw);
  const wob = smooth(tWob, tWob + 0.08, tw);
  const wt = tw - tWob;
  const stoolTilt = 0.15 * Math.sin(2 * Math.PI * 2.3 * wt) * wob;
  const panic = smooth(tWob, tWob + 0.1, tw);
  const fall = smooth(tFall, tFall + 0.45, tw);
  if (tw >= tFall + 0.5 && tw < tPop) return null;
  if (tw >= tPop) {
    // popped back up beside the stool: thumbs up; then off
    const pop = smooth(tPop, tPop + 0.18, tw);
    const leave = tw - (tPop + 0.55);
    const at = V3(0.32, -0.9 * (1 - pop) + 0.04 * Math.sin(Math.min(1, (tw - tPop) / 0.3) * Math.PI), 0.25);
    if (leave > 0) {
      const d = leave * 1.6;
      if (d > 2.2) return null;
      const w = walk(k, (d / (1.2 * k)) * Math.PI * 2, Math.min(1, d * 4), lifts);
      return {
        kid,
        at: at.clone().add(V3(d * 0.95, 0, d * 0.25)),
        yaw: yawToward(1, 0.25),
        pose: { e: { ...NEUTRAL, smile: 0.6 }, feet: w.feet, armL: w.arms[0], armR: w.arms[1], lift: w.bob },
      };
    }
    const hipY = 0.93 * k + lifts;
    return {
      kid,
      at,
      yaw: STOOL_YAW + 0.5,
      pose: {
        e: { ...NEUTRAL, smile: 0.9, jaw: 0.18, squint: 0.4, brow: 0.3 },
        look: TRIPOD,
        headRoll: 0.12,
        armR: { at: V3(0.24 * k, hipY + 0.42 * k, -0.22 * k), hand: THUMBS_UP, palm: V3(-1, 0, 0), pole: V3(1, -0.5, 0.3) },
      },
    };
  }
  const hipY = 0.93 * k + lifts;
  // arms: on his hips, posing; flailing in the wobble
  const akimbo = (side: number): Arm => ({ at: V3(side * 0.16 * k, hipY + 0.12 * k, 0.03), hand: mixHand(RELAX, GRIP, 0.3), palm: V3(side, 0, 0), pole: V3(side, -0.2, 0.6) });
  const flail = (side: number): Arm => {
    const ph = 2 * Math.PI * 3.1 * wt + (side > 0 ? 1.7 : 0);
    return { at: V3(side * (0.36 + 0.06 * Math.cos(ph)) * k, hipY + (0.5 + 0.14 * Math.sin(ph)) * k, -0.08 + 0.12 * Math.cos(ph)), hand: OPEN, palm: V3(0, 0, -1), pole: V3(side, -0.3, 0.2) };
  };
  const arm = (side: number): Arm => {
    const a = akimbo(side);
    const f = flail(side);
    return panic > 0 ? { ...f, at: a.at.clone().lerp(f.at, panic) } : a;
  };
  const smug = smooth(tStand + 0.4, tStand + 0.6, tw) * (1 - panic);
  return {
    kid,
    at: V3(0, STOOL_H * climb, 0),
    yaw: STOOL_YAW + 0.25 * climb,
    tip: stoolTilt * 1.6 + (0.18 * Math.sin(2 * Math.PI * 2.3 * wt + 0.6) * wob) + 1.55 * fall * fall,
    pose: {
      e: {
        ...NEUTRAL,
        smile: 0.3 * smug,
        brow: 0.35 * smug + 1.0 * panic,
        lidL: 0.3 * smug - 0.1 * panic,
        lidR: 0.3 * smug - 0.1 * panic,
        wide: 0.8 * panic,
        jaw: 0.5 * panic,
      },
      crouch: ((0.93 - (0.56 + SEAT_LIFT - lifts) / k) / 0.55) * (1 - climb),
      look: up(0.6 * smug + 0.3),
      lean: -0.08 * smug + 0.1 * (1 - climb),
      roll: 0.2 * Math.sin(2 * Math.PI * 2.3 * wt + 1.2) * wob,
      armL: climb > 0.6 ? arm(-1) : undefined,
      armR: climb > 0.6 ? arm(1) : undefined,
    },
    extras: {},
  };
};

/** The height-maxer's stool, tipping in the wobble (the Gym draws it at this tilt). */
export const stoolTiltAt = (tw: number) => {
  const tWob = cw("height", "wobble");
  const tFall = cw("height", "fall");
  if (tw < tWob) return 0;
  const wob = smooth(tWob, tWob + 0.08, tw);
  const fall = smooth(tFall, tFall + 0.3, tw) * (1 - smooth(tFall + 0.3, tFall + 0.6, tw));
  return 0.15 * Math.sin(2 * Math.PI * 2.3 * (tw - tWob)) * wob * (1 - smooth(tFall, tFall + 0.6, tw)) - 0.35 * fall;
};

/** The mogger: in slow motion, sunglasses on, his friend's leaf blower in his hair; the glasses come off; the
 * flip, just as the blower dies. */
const BLOWER_AT = V3(-1.25, 0, -0.32);
const mogger = (tw: number): Act | null => {
  const tGl = cw("mogger", "glasses");
  const tFlip = cw("mogger", "flip");
  return hero(
    MOGGER,
    beats("mogger"),
    tw,
    (t) => {
      const seated = smooth(cw("mogger", "sit") - 0.1, cw("mogger", "sit") + 0.2, t);
      const reach = smooth(tGl - 0.22, tGl, t);
      const pull = smooth(tGl + 0.04, tGl + 0.32, t);
      const off = t > tGl + 0.04;
      const stare = smooth(tGl + 0.2, tGl + 0.45, t);
      const dip = smooth(tFlip - 0.12, tFlip, t) * (1 - smooth(tFlip, tFlip + 0.1, t));
      const flip = smooth(tFlip + 0.03, tFlip + 0.2, t);
      const wind = (1 - smooth(tFlip - 0.02, tFlip + 0.06, t)) * smooth(cw("mogger", "in") - 0.1, cw("mogger", "in"), t);
      const k = MOGGER.k;
      const hipY = 0.56 + SEAT_LIFT;
      // his right hand: on his knee; up to the glasses; down with them
      const rest = V3(0.2 * k, hipY + 0.06, -0.33 * k);
      const temple = V3(0.13, hipY + 0.6 * k, -0.03);
      const away = V3(0.26 * k, hipY + 0.2, -0.3 * k);
      const rAt = rest.clone().lerp(temple, reach).lerp(away, pull);
      return {
        e: {
          smile: 0.16 + 0.06 * stare,
          brow: -0.25 - 0.15 * stare,
          squint: 0.25 + 0.2 * stare,
          lidL: 0.15 + 0.1 * stare,
          lidR: 0.15 + 0.1 * stare,
          jut: 0.3,
        },
        look: up(0.18 - 0.9 * dip + 0.3 * flip),
        headRoll: 0.05,
        lean: -0.07 * seated,
        feet: [V3(-0.24, 0.25, -0.16), V3(0.24, 0.25, -0.16)],
        armR: seated > 0.5 ? { at: rAt, hand: reach > 0.5 && pull < 0.9 ? mixHand(RELAX, GRIP, 0.6) : RELAX, palm: V3(-1, 0, 0), pole: V3(1, -0.6, 0.4) } : undefined,
        extras: { sunglasses: !off, wind, flip },
        children: off && seated > 0.5 ? (
          <group position={rAt.clone().add(V3(0, -0.04, -0.02))}>
            <HeldSunglasses />
          </group>
        ) : null,
      };
    },
    { swagger: 1 },
  );
};

/** The friend with the leaf blower: behind the mogger on his way in, then beside the stool aiming at his
 * hair; at the end behind the photographer. */
const friend = (tw: number): Act | null => {
  const kid = FRIEND;
  const k = kid.k;
  const tIn = cw("mogger", "in");
  const tSit = cw("mogger", "sit");
  const tUp = cw("mogger", "up");
  const tFlip = cw("mogger", "flip");
  const tBlow = cw("photog", "blow");
  const hipY = 0.93 * k;
  // the blower: grip in his right hand at the hip, the tube aimed at a target's head
  const aim = (from: THREE.Vector3, yaw: number, target: THREE.Vector3, run: number, t: number) => {
    const grip = V3(0.18 * k, hipY + 0.12, -0.12);
    // in the body frame: the target relative to the body
    const rel = target.clone().sub(from).applyAxisAngle(V3(0, 1, 0), -yaw);
    const dir = rel.clone().sub(grip).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -0.24, -1).normalize(), dir);
    const tubeHold = grip.clone().add(V3(0, -0.16, -0.36).applyQuaternion(q));
    return {
      armR: { at: grip.clone().add(V3(0, 0.02, 0)), hand: GRIP, palm: V3(-1, 0, 0), pole: V3(1, -0.6, 0.3) } as Arm,
      armL: { at: tubeHold, hand: mixHand(RELAX, GRIP, 0.7), palm: V3(0, 1, 0), pole: V3(-1, -0.6, 0.2) } as Arm,
      blower: (
        <group position={grip} quaternion={q}>
          <LeafBlower run={run} t={t} />
        </group>
      ),
    };
  };
  if (tw >= tIn - 0.05 && tw < tUp + 2) {
    // in behind the mogger, then aiming at his hair from beside the stool
    const arrive = smooth(tIn, tSit - 0.2, tw);
    const leave = Math.max(0, tw - (tUp + 0.35));
    const from = ENTRY.clone().add(V3(-0.65, 0, -0.55)).lerp(BLOWER_AT, arrive).add(V3(leave * 1.4, 0, leave * 0.2));
    if (leave * 1.4 > 3) return null;
    const moving = arrive > 0 && arrive < 1 ? 1 : leave > 0 ? 1 : 0;
    const yaw = leave > 0 ? yawToward(1, 0.15) : yawToward(0.9, -0.2) * (1 - arrive) + yawToward(0.85, -0.25) * arrive;
    const head = V3(0, 0.56 + SEAT_LIFT + 0.7 * MOGGER.k, 0.0).lerp(V3(0, 1.62, 0), 1 - smooth(tSit - 0.2, tSit + 0.2, tw));
    const run = 1 - smooth(tFlip - 0.05, tFlip + 0.05, tw);
    const a = aim(from, yaw, head, run, tw);
    const ph = (tw - tIn) * 1.3 * Math.PI * 2;
    const w = walk(k, ph, moving, 0);
    return {
      kid,
      at: from,
      yaw,
      pose: {
        e: { ...NEUTRAL, jaw: 0.08, brow: 0.2 + 0.5 * (1 - run), squint: 0.2 * run, wide: 0.4 * (1 - run) },
        look: head,
        feet: moving ? w.feet : undefined,
        lift: moving ? w.bob : 0,
        armL: leave > 0 ? w.arms[0] : a.armL,
        armR: a.armR,
        lean: 0.06,
      },
      children: a.blower,
      hi: false,
    };
  }
  if (tw >= cw("photog", "turn1") && tw < cw("photog", "photoEnd") + 1) {
    // behind the photographer: sneaking up, then the blower on his comb-over
    const sneak = smooth(cw("photog", "look") + 0.6, tBlow - 0.15, tw);
    const from = V3(1.6, 0, 4.6).lerp(V3(0.62, 0, 3.85), sneak);
    const yaw = yawToward(-0.55, -0.7);
    const head = V3(0, 1.72, 3.2);
    const run = smooth(tBlow - 0.05, tBlow + 0.05, tw);
    const a = aim(from, yaw, head, run, tw);
    const moving = sneak > 0.02 && sneak < 0.98 ? 1 : 0;
    const w = walk(k, tw * 1.5 * Math.PI * 2, moving * 0.6, 0);
    return {
      kid,
      at: from,
      yaw,
      pose: { e: { ...NEUTRAL, smile: 0.5 * run, squint: 0.3, brow: 0.2 }, look: head, feet: moving ? w.feet : undefined, armL: a.armL, armR: a.armR, lean: 0.08 },
      children: a.blower,
      hi: false,
    };
  }
  return null;
};

/** The leaf blower's wind on the photographer (0..1). */
export const blowAt = (tw: number) => smooth(cw("photog", "blow") - 0.02, cw("photog", "blow") + 0.12, tw);

/** The photographer, in the selfie: arms out to the camera (our POV) held in front of his face. */
export const PHOTOG_AT = V3(0, 0, 3.2);
const photog = (tw: number, cam: THREE.Vector3): Act | null => {
  const t1 = cw("photog", "turn0");
  if (tw < t1) return null;
  const tLook = cw("photog", "look");
  const tThroat = cw("photog", "throat");
  const tPose = cw("photog", "pose");
  const tFlash = cw("photog", "flash");
  const a = smooth(tPose - 0.1, tPose + 0.25, tw);
  const late = smooth(tFlash - 0.15, tFlash - 0.01, tw);
  const glance = tw > tLook && tw < tThroat ? Math.sin((tw - tLook) * 5.2) * (1 - smooth(tThroat - 0.3, tThroat, tw)) : 0;
  const throat = Math.max(0, Math.sin(Math.min(1, Math.max(0, (tw - tThroat) / 0.35)) * Math.PI));
  // the camera's in his hands: both hands at its sides, wherever it is
  const rel = cam.clone().sub(PHOTOG_AT);
  const hands = (side: number): Arm => ({ at: rel.clone().add(V3(side * 0.085, -0.03, 0.06)), hand: mixHand(RELAX, GRIP, 0.75), palm: V3(-side, 0.2, 0), pole: V3(side, -0.8, 0.2) });
  return {
    kid: PHOTOG,
    at: PHOTOG_AT,
    yaw: 0,
    pose: {
      e: {
        ...NEUTRAL,
        eyeYaw: 0.55 * glance,
        jaw: 0.18 * throat,
        brow: 0.3 * throat - 0.75 * a - 0.2 * late,
        squint: 0.45 * a + 0.3 * late,
        lidL: 0.2 * a + 0.2 * late,
        lidR: 0.25 * a + 0.25 * late,
        jut: 0.75 * a + 0.6 * late,
        smile: -0.08 * a,
      },
      look: cam.clone().add(V3(0.12 * glance, 0.25 * a + 0.15 * late - 0.05 * throat, 0)),
      headRoll: 0.08 * a,
      lean: 0.02 + 0.04 * throat,
      armL: hands(-1),
      armR: hands(1),
    },
    extras: { lift: 1.9 * blowAt(tw) + 0.15 * blowAt(tw) * Math.sin(tw * 9) },
  };
};

/** The kids waiting along the wall, and the teacher with her clipboard. */
const LINE_AT = (i: number) => V3(-1.75 - 0.72 * i, 0, 0.75 + 0.16 * i);
const waiting = (tw: number, f: number): Act[] => {
  const out: Act[] = [];
  // the cast waiting their turn (only in the opening, before they're called)
  const order = [MEWER, HUNTER, GUM, GLASS, NORMAL, HEIGHT, MOGGER];
  const queue = order.filter((kd) => tw < cw(kd.key, "in") - 0.05 && tw < CUE_W.introEnd + 0.5);
  const crowd = [...queue, ...LINE];
  crowd.forEach((kid, i) => {
    const at = LINE_AT(i);
    const sway = vnoise(tw * 0.4 + i * 3.1, i) * 0.04;
    const phone = i % 3 === 2;
    const k = kid.k;
    const hipY = 0.93 * k + (kid.outfit.lifts ?? 0);
    out.push({
      kid,
      at,
      yaw: -Math.PI / 2 + 0.25 * vnoise(tw * 0.2, i + 7) + (i === 0 ? 0.3 : 0),
      hi: false,
      pose: {
        e: { ...NEUTRAL, smile: 0.1 * hash(i * 3.3), brow: 0.15 * vnoise(tw * 0.3, i) },
        headYaw: phone ? 0 : 0.4 * vnoise(tw * 0.25, i + 3) + 0.3,
        headPitch: phone ? -0.45 : 0,
        lean: 0.02 + sway,
        roll: 0.03 * vnoise(tw * 0.3, i + 11),
        armL: phone ? { at: V3(-0.06, hipY + 0.32 * k, -0.25 * k), hand: mixHand(RELAX, GRIP, 0.6), palm: V3(0.3, 1, 0), pole: V3(-1, -1, 0.2) } : undefined,
        armR: phone ? { at: V3(0.06, hipY + 0.31 * k, -0.25 * k), hand: mixHand(RELAX, GRIP, 0.4), palm: V3(-0.3, 1, 0), pole: V3(1, -1, 0.2) } : undefined,
        holdL: phone ? "phone" : undefined,
      },
      extras: kid.key === "mogger" ? { sunglasses: true } : {},
    });
  });
  // the teacher, ticking names off
  const tk = TEACHER.k;
  const hip = 0.93 * tk;
  out.push({
    kid: TEACHER,
    at: V3(-1.75, 0, 1.25),
    yaw: yawToward(0.45, -1),
    hi: false,
    pose: {
      e: { ...NEUTRAL, smile: 0.15, brow: 0.1 },
      headPitch: -0.3 + 0.25 * Math.max(0, Math.sin(tw * 0.9)),
      armL: { at: V3(-0.05, hip + 0.3 * tk, -0.24 * tk), hand: GRIP, palm: V3(1, 0.3, 0), pole: V3(-1, -1, 0) },
      armR: { at: V3(0.06, hip + 0.33 * tk + 0.01 * Math.sin(tw * 13), -0.27 * tk), hand: mixHand(RELAX, GRIP, 0.8), palm: V3(-0.5, -1, 0), pole: V3(1, -1, 0) },
    },
    children: (
      <group position={V3(-0.02, hip + 0.33 * tk, -0.27 * tk)} rotation={[-1.0, 0.1, 0]}>
        <Clipboard />
      </group>
    ),
  });
  void f;
  return out;
};

/** In the selfie: the kids who've had their photo taken, watching from behind him. */
const audience = (tw: number): Act[] => {
  if (tw < cw("photog", "turn0")) return [];
  const spots: [Kid, THREE.Vector3, number][] = [
    [MEWER, V3(-0.62, 0, 5.3), 0.2],
    [HUNTER, V3(-1.15, 0, 5.75), 0.35],
    [GLASS, V3(0.9, 0, 5.55), -0.3],
    [NORMAL, V3(-0.15, 0, 6.2), 0.05],
    [GUM, V3(0.35, 0, 5.95), -0.12],
    [HEIGHT, V3(1.4, 0, 6.1), -0.4],
    [MOGGER, V3(-1.6, 0, 6.3), 0.4],
  ];
  const react = smooth(cw("photog", "pose"), cw("photog", "pose") + 0.4, tw);
  return spots.map(([kid, at, yaw], i) => ({
    kid,
    at,
    yaw: Math.PI + yaw,
    hi: false,
    pose: {
      e: { ...NEUTRAL, jaw: 0.25 * react * hash(i * 1.7), brow: 0.6 * react, smile: 0.3 * react * hash(i * 2.9) },
      look: V3(0, 1.6, 3.2),
      lean: 0.02 * vnoise(tw * 0.5, i),
      holdR: i === 4 ? "phone" : undefined,
      armR: i === 4 ? { at: V3(0.05, 0.93 * kid.k + 0.42 * kid.k, -0.25 * kid.k), hand: GRIP, palm: V3(0, 0, 1), pole: V3(1, -1, 0.3) } : undefined,
    },
    extras: kid.key === "mogger" ? { flip: 0 } : {},
  }));
};

/** Everyone in the picture at world time tw (cam: where the camera is, for the photographer's hands). */
export const castAt = (tw: number, f: number, cam: THREE.Vector3): Act[] => {
  const acts: (Act | null)[] = [mewer(tw), hunter(tw), gum(tw), glass(tw), normal(tw), height(tw), mogger(tw), friend(tw), photog(tw, cam)];
  const out = acts.filter((a): a is Act => !!a).map((a) => ({ ...a, role: "hero" }));
  if (tw < CUE_W.introEnd + 1.2) out.push(...waiting(tw, f).map((a) => ({ ...a, role: "line" })));
  out.push(...audience(tw).map((a) => ({ ...a, role: "aud" })));
  return out;
};

/** Draw an act. */
export const ActFigure: React.FC<{ act: Act; t: number }> = ({ act, t }) => {
  const fig = (
    <KidFigure kid={act.kid} pose={act.pose} at={act.tip ? V3() : act.at} yaw={act.tip ? 0 : act.yaw} t={t} extras={act.extras} hi={act.hi ?? true} head={act.head}>
      {act.children}
    </KidFigure>
  );
  if (!act.tip) return fig;
  // tipped over about the feet: toward the body's right
  return (
    <group position={act.at} rotation={[0, act.yaw, 0]}>
      <group rotation={[0, 0, -act.tip]}>{fig}</group>
    </group>
  );
};

export const kidCount = () => 0;
void clamp;
