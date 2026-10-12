import React from "react";
import * as THREE from "three";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import { GRIP, OPEN, RELAX, THUMBS_UP, mixHand, type HandPose } from "../coaster/Hand";
import { Controller, Figure, type Arm, type Pose } from "./Figure";
import { BAKER, BRIDE, DJ_P, GROOM, GUESTS, KID_P, OFFICIANT, OUTFITS, POURER, WAITER, type Guest } from "./cast";
import { CUE_W, L, boxAtW, droneAtW, smooth, span, vnoise } from "./flight";

/**
 * Everyone, posed for the moment: where they look (usually at the drone), what their hands are doing and
 * the faces they pull. World time w drives it all (so the slow motion slows them too).
 */

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = CUE_W;
const POINT: HandPose = { curl: [0.05, 1.4, 1.45, 1.5], spread: 0, thumbOut: 0.2, thumbCurl: 0.8 };
const faceToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const mixE = (a: Partial<Expr>, b: Partial<Expr>, k: number): Partial<Expr> => {
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    const x = (a as Record<string, number>)[key] ?? 0;
    const y = (b as Record<string, number>)[key] ?? 0;
    out[key] = x + (y - x) * k;
  });
  return out as Partial<Expr>;
};
const E = (e: Partial<Expr>): Expr => ({ ...NEUTRAL, ...e });

const SMILE: Partial<Expr> = { smile: 0.55, squint: 0.15 };
const AWE: Partial<Expr> = { smile: 0.6, brow: 0.5, jaw: 0.12 };
const SHOCK: Partial<Expr> = { jaw: 0.55, brow: 0.9, wide: 0.4, squint: 0.1 };
const LAUGH: Partial<Expr> = { smile: 1, squint: 0.8, jaw: 0.45, brow: 0.3 };
const GLARE: Partial<Expr> = { smile: -0.55, brow: -1.0, squint: 0.62, jaw: 0.04 };
const AWKWARD: Partial<Expr> = { smile: 0.75, wide: 0.6, brow: 0.55, squint: 0.05 };
const HORROR: Partial<Expr> = { jaw: 0.9, brow: 1, wide: 0.6, squint: 0 };

/* ------------------------------------------------------------------ */
/* Guests in the chairs                                                  */
/* ------------------------------------------------------------------ */

const COUPLE_MID = v3(0, 1.55, 0.6);

const guestPose = (g: Guest, w: number): Pose => {
  const [x, , z] = g.at;
  const head = v3(x, 1.22, z + 0.06);
  const D = droneAtW(w);
  const r = (k: number) => Math.abs(vnoise(g.at[0] * 3.1 + g.at[2] * 1.7 + k, 3));
  // they watch the drone from the moment it lifts off until it's gone over the tent; some keep glancing
  // back at the couple
  const watching = span(w, 5.0 + r(1) * 1.5, W.whip + 1.5, 0.5) * (0.75 + 0.25 * r(2));
  const look = COUPLE_MID.clone().lerp(D, watching);
  // ducking as it skims over them
  const [nd, nt] = g.nearest;
  const duck = nd < 1.6 ? span(w, nt - 0.4, nt + 0.3, 0.18) * Math.min(1, (1.7 - nd) / 0.6) : 0;
  // phones up while it's being lovely, and for the officiant
  const phone = g.phone ? Math.max(span(w, 8.0 + r(3), 14.0, 0.4), span(w, 20.5 + r(4), 26.5, 0.4)) * (1 - duck) : 0;
  // faces: smiling at the couple, awed by the drone, shocked as it dips, laughing at the officiant
  let e: Partial<Expr> = mixE(SMILE, AWE, watching * span(w, 7, 15, 0.8));
  e = mixE(e, SHOCK, Math.max(duck, span(w, W.dip - 0.1, W.dip + 1.6, 0.3) * 0.5));
  e = mixE(e, LAUGH, span(w, W.officiant + 0.6 + r(5) * 1.5, W.throttle, 0.4) * g.laugh);
  e = mixE(e, SHOCK, span(w, W.throttle + 0.2, W.top, 0.3) * 0.6);
  const pose: Pose = { sit: true, look, e: E(e), lean: 0.55 * duck, crouch: 0 };
  if (duck > 0.02) {
    pose.armL = { at: v3(-0.12, 1.12 - 0.12 * duck, -0.28 - 0.1 * duck), hand: OPEN, palm: v3(0, -1, 0.3) };
    pose.armR = { at: v3(0.12, 1.12 - 0.12 * duck, -0.28 - 0.1 * duck), hand: OPEN, palm: v3(0, -1, 0.3) };
    pose.headPitch = -0.5 * duck;
    pose.look = duck > 0.5 ? null : look;
  } else if (phone > 0.02) {
    pose.armR = { at: v3(0.06, 0.62 + 0.62 * phone, -0.25 - 0.18 * phone), hand: GRIP, palm: v3(0, 0.2, 1) };
    pose.holdR = phone > 0.3 ? "phone" : null;
  }
  // laughers clap or cover their mouths
  if (g.laugh > 0.7 && span(w, W.officiant + 1, W.throttle, 0.4) > 0.5 && duck < 0.1) {
    const clap = Math.abs(Math.sin(w * 9 + g.at[0])) * 0.04;
    pose.armL = { at: v3(-0.04 - clap, 0.95, -0.32), hand: OPEN, palm: v3(1, 0, 0) };
    pose.armR = { at: v3(0.04 + clap, 0.95, -0.32), hand: OPEN, palm: v3(-1, 0, 0) };
  }
  // the grandmother laughs the whole time the drone is in the officiant's face, rocking back
  if (g.role === "grandma") {
    const lg = span(w, W.officiant + 0.3, W.throttle + 1, 0.4);
    pose.e = E(mixE(pose.e, { smile: 1, squint: 0.95, jaw: 0.55, brow: 0.5 }, lg));
    pose.lean = (pose.lean ?? 0) - 0.12 * lg + 0.05 * Math.sin(w * 6) * lg;
    if (lg > 0.3) {
      pose.armR = { at: v3(0.02, 1.16, -0.2), hand: RELAX, palm: v3(0, 0, 1) };
    }
  }
  // the hat lady grabs for the hat as it goes
  if (g.role === "hatlady") {
    const grab = span(w, W.hat - 0.05, W.hat + 1.6, 0.15);
    if (grab > 0.02) {
      pose.armL = { at: v3(-0.1, 1.3, -0.12), hand: mixHand(OPEN, GRIP, smooth(W.hat + 0.2, W.hat + 0.4, w)), palm: v3(0.3, -1, 0) };
      pose.armR = { at: v3(0.1, 1.32, -0.15), hand: OPEN, palm: v3(-0.3, -1, 0) };
      pose.e = E(mixE(pose.e, SHOCK, grab));
      pose.look = head.clone().add(v3(1.5, 0.8, -2.5));
    }
  }
  void head;
  return pose;
};

/** Where the hat lady's hat is once it's gone (world), and its spin; null while it's on her head. */
export const hatFlight = (w: number) => {
  const g = GUESTS.find((q) => q.role === "hatlady");
  if (!g || w < W.hat) return null;
  const a = Math.min(w - W.hat, 3);
  const p0 = v3(g.at[0], 1.42, g.at[2] + 0.04);
  // the prop wash flips it up off her head and forward, in front of the lens (the drone's backing over
  // the rows, looking up the aisle); the wide brim floats it down onto the grass by the aisle
  const vy = 2.3;
  const grav = 5.6;
  const tLand = (vy + Math.sqrt(vy * vy + 2 * grav * (p0.y - 0.03))) / grav;
  const t = Math.min(a, tLand);
  const p = p0.clone().add(v3(-1.6 * t * (1 - 0.15 * t), vy * t - 0.5 * grav * t * t, -1.4 * t * (1 - 0.15 * t)));
  if (a >= tLand) p.y = 0.03;
  const spin = t * 9 * (1 - t * 0.25);
  const tilt = a >= tLand ? 0 : Math.sin(t * 6) * 0.7 * Math.max(0, 1 - t / tLand) + 0.25 * (1 - t / tLand);
  return { p, spin, tilt };
};

/* ------------------------------------------------------------------ */
/* The couple and the officiant                                          */
/* ------------------------------------------------------------------ */

export const GROOM_AT = v3(-0.5, 0, 0.6);
export const BRIDE_AT = v3(0.5, 0, 0.6);
const OFF_AT = v3(...L.officiant);

const couplePose = (bride: boolean, w: number): Pose => {
  const me = bride ? BRIDE_AT : GROOM_AT;
  const other = bride ? GROOM_AT : BRIDE_AT;
  const D = droneAtW(w);
  const watch = span(w, 9.5, W.top + 1, 0.6);
  const eachOther = other.clone().setY(1.6);
  let look: THREE.Vector3 | null = eachOther.clone().lerp(D, watch);
  let e: Partial<Expr> = mixE({ smile: 0.65, squint: 0.2 }, AWE, span(w, 9.5, 14.5, 0.6));
  // hands joined between them, until the drone arrives
  const joined = 1 - smooth(13.5, 14.3, w);
  const side = bride ? 1 : -1;
  const toward = other.clone().sub(me).normalize();
  // in body space the partner is straight ahead (-z)
  let armL: Arm = { at: v3(-0.12, 1.0, -0.38), hand: mixHand(RELAX, GRIP, 0.5), palm: v3(0.6, 0, -0.4) };
  let armR: Arm = { at: v3(0.12, 1.0, -0.38), hand: mixHand(RELAX, GRIP, 0.5), palm: v3(-0.6, 0, -0.4) };
  if (joined < 0.98) {
    armL = { at: v3(-0.2, 0.9 + 0.06 * (1 - joined), -0.12), hand: RELAX };
    armR = { at: v3(0.2, 0.9 + 0.06 * (1 - joined), -0.12), hand: RELAX };
  }
  let lean = 0;
  let lift = 0;
  if (!bride) {
    // the grab: reaching up and forward for the box, closing on nothing
    const reach = span(w, W.grab - 0.35, W.yank + 0.45, 0.2);
    if (reach > 0.01) {
      const box = boxAtW(Math.min(w, W.grab + 0.1));
      const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, faceToward(me, other) + 0.6, 0)).invert();
      const local = box.clone().sub(me).applyQuaternion(inv);
      armR = { at: armR.at.clone().lerp(local, reach), hand: mixHand(OPEN, GRIP, smooth(W.yank - 0.05, W.yank + 0.1, w)), palm: v3(0, 0, -1), pole: v3(1, -0.4, 0.4) };
      lean = 0.22 * reach;
      lift = 0.035 * reach;
      look = box;
      e = mixE(e, { smile: 0.4, brow: 0.6, jaw: 0.15 }, reach);
    }
    // the face-palm while the drone hovers at the officiant
    const palm = span(w, W.officiant + 1.2, W.officiant + 3.2, 0.3);
    if (palm > 0.02) {
      armL = { at: v3(-0.02, 1.62, -0.2), hand: mixHand(RELAX, OPEN, palm), palm: v3(0, 0, 1), pole: v3(-1, -0.3, 0.2) };
      e = mixE(e, { smile: -0.2, squint: 0.6, brow: -0.3 }, palm);
    }
    // the glare into the lens
    const glare = span(w, W.groomLook - 0.4, W.groomLook + 1.0, 0.25);
    e = mixE(e, GLARE, glare);
    if (glare > 0.3) look = D;
    lean += 0.08 * glare;
  } else {
    const giggle = span(w, W.officiant + 0.5, W.officiant + 3.6, 0.4);
    e = mixE(e, { smile: 0.9, squint: 0.5, jaw: 0.2 }, giggle);
    if (giggle > 0.3) armR = { at: v3(0.02, 1.48, -0.24), hand: RELAX, palm: v3(0, 0, 1), pole: v3(1, -0.4, 0.3) };
    // the awkward smile and a little wave: shoo
    const awk = span(w, W.brideLook - 0.4, W.brideLook + 1.0, 0.25);
    e = mixE(e, AWKWARD, awk);
    if (awk > 0.2) {
      look = D;
      const wave = Math.sin(w * 13) * 0.05;
      armR = { at: v3(0.25 + wave, 1.47, -0.16), hand: OPEN, palm: v3(-0.2, 0.1, -1), pole: v3(1, -0.8, 0.2) };
    }
  }
  // the climb: everyone looks up
  const up = span(w, W.throttle, W.whip + 1, 0.3);
  e = mixE(e, { jaw: 0.35, brow: 0.8, wide: 0.2 }, up);
  void side;
  void toward;
  return { look, e: E(e), armL, armR, lean, lift, holdL: bride && joined < 0.5 ? "bouquet" : null };
};

const officiantPose = (w: number): Pose => {
  const D = droneAtW(w);
  const stare = span(w, W.officiant - 0.9, W.officiant + 3.9, 0.35);
  const watch = span(w, 9.5, W.top + 1, 0.6);
  const reading = Math.sin(w * 0.7) * 0.5 + 0.5;
  const look = v3(0, 1.0, 0.0).lerp(v3(reading > 0.5 ? -0.5 : 0.5, 1.6, 0.6), 1 - watch).lerp(D, Math.max(stare, watch * 0.7));
  let e: Partial<Expr> = { smile: 0.25 };
  e = mixE(e, { brow: 0.95, jaw: 0.08, smile: -0.1, squint: 0 }, stare);
  // and then a slow, flat "really?"
  e = mixE(e, { brow: 0.5, smile: -0.25, squint: 0.35, lidL: 0.35, lidR: 0.35 }, smooth(W.officiant + 1.8, W.officiant + 2.4, w) * stare);
  const lower = stare * 0.5;
  return {
    look,
    e: E(e),
    armL: { at: v3(-0.1, 1.08 - 0.15 * lower, -0.3 + 0.08 * lower), hand: GRIP, palm: v3(1, 0.2, -0.3) },
    armR: { at: v3(0.1, 1.08 - 0.15 * lower, -0.3 + 0.08 * lower), hand: GRIP, palm: v3(-1, 0.2, -0.3) },
    holdL: "book",
    lean: -0.08 * stare,
  };
};

/* ------------------------------------------------------------------ */
/* The ring bearer, at the start (and the end)                           */
/* ------------------------------------------------------------------ */

export const KID_AT = v3(...L.kid);

/** The kid squats down by the drone on the grass, then stands and steps back as it spins up. */
export const kidStand = (w: number) => smooth(2.5, 3.5, w);
const kidStartPose = (w: number): Pose => {
  const D = droneAtW(w);
  const squat = 1 - kidStand(w);
  const concentrate = 1 - smooth(W.eyeToEye - 0.3, W.eyeToEye + 0.1, w);
  const grin = span(w, W.eyeToEye - 0.2, W.eyeToEye + 1.6, 0.3);
  const e = mixE(mixE({ smile: 0.25, brow: -0.3, squint: 0.25, tongue: 1, jaw: 0.12 }, { smile: 1, squint: 0.5, jaw: 0.4, brow: 0.3 }, grin), { jaw: 0.3, brow: 0.6, smile: 0.7 }, smooth(W.eyeToEye + 1.2, W.reveal, w));
  e.tongue = (e.tongue ?? 0) * concentrate;
  return {
    look: D,
    e: E(e),
    armL: { at: v3(-0.085, 0.7 - 0.2 * squat, -0.17 - 0.2 * squat), hand: GRIP, palm: v3(0, -1, -0.2) },
    armR: { at: v3(0.085, 0.7 - 0.2 * squat, -0.17 - 0.2 * squat), hand: GRIP, palm: v3(0, -1, -0.2) },
    lean: 0.1 * concentrate + 0.5 * squat,
    crouch: 0.42 * squat,
  };
};

/* ------------------------------------------------------------------ */
/* Staff                                                                 */
/* ------------------------------------------------------------------ */

const waiterPose = (w: number) => {
  const D = droneAtW(w);
  const spin = smooth(W.waiter - 0.25, W.waiter + 0.55, w) * Math.PI * 2;
  const sur = span(w, W.waiter - 0.4, W.waiter + 1.4, 0.3);
  const pose: Pose = {
    look: sur > 0.1 ? D : v3(30, 1.6, 4),
    e: E(mixE({ smile: 0.15 }, mixE(SHOCK, { smile: 0.8, brow: 0.6, squint: 0.3 }, smooth(W.waiter + 0.6, W.waiter + 1.1, w)), sur)),
    // the tray on his right hand, forearm level, palm up, at his chest
    armR: { at: v3(0.2, 1.1, -0.36), hand: { curl: [0.25, 0.3, 0.3, 0.35], spread: 0.3, thumbOut: 0.5, thumbCurl: 0.2 }, palm: v3(0, 1, 0), pole: v3(0.6, -1, 0.4) },
    armL: { at: v3(-0.2, 0.92, -0.05), hand: RELAX },
    holdR: "tray",
  };
  return { pose, yaw: faceToward(v3(...L.waiterOut), v3(10, 0, 3.5)) + spin };
};

const djPose = (w: number): Pose => {
  const D = droneAtW(w);
  const cheer = span(w, W.dj - 0.3, W.dj + 1.6, 0.25);
  const nod = Math.sin(w * Math.PI * 2 * 2.07) * 0.08 * (1 - cheer);
  return {
    look: cheer > 0.2 ? D : null,
    headPitch: -0.35 + nod,
    e: E(mixE({ smile: 0.3 }, { smile: 1, jaw: 0.45, squint: 0.4, brow: 0.6 }, cheer)),
    armL: cheer > 0.02 ? { at: v3(-0.28, 1.55 + 0.4 * cheer, -0.1), hand: OPEN, palm: v3(0, 0, -1), pole: v3(-1, -0.2, 0.2) } : { at: v3(-0.18, 1.03, -0.42), hand: RELAX, palm: v3(0, -1, 0) },
    armR: cheer > 0.02 ? { at: v3(0.28, 1.55 + 0.4 * cheer, -0.1), hand: OPEN, palm: v3(0, 0, -1), pole: v3(1, -0.2, 0.2) } : { at: v3(0.2, 1.05, -0.42), hand: RELAX, palm: v3(0, -1, 0) },
    lean: 0.1 * (1 - cheer) - 0.08 * cheer,
  };
};

const pourerPose = (w: number): Pose => {
  const flinch = smooth(W.towerHit - 0.12, W.towerHit + 0.25, w) * (1 - smooth(W.towerHit + 3, W.towerHit + 4, w));
  const top = v3(L.tower.at[0], L.tower.at[1] + L.tower.tiers * L.tower.h + 0.15, L.tower.at[2]);
  return {
    look: top.clone().lerp(droneAtW(w), flinch),
    e: E(mixE({ smile: 0.2, brow: 0.2 }, HORROR, flinch)),
    // the bottle held out over the top glass, pouring; jerked back on the hit
    armR: { at: v3(0.0, 1.32 + 0.12 * flinch, -0.52 + 0.3 * flinch), hand: GRIP, palm: v3(-1, 0, 0), pole: v3(1, -0.6, 0.3) },
    armL: flinch > 0.05 ? { at: v3(-0.15, 1.45, -0.3), hand: OPEN, palm: v3(0, 0, -1) } : { at: v3(-0.18, 0.95, -0.12), hand: RELAX },
    holdR: "bottle",
    lean: 0.18 - 0.35 * flinch,
  };
};

const bakerPose = (w: number): Pose => {
  const horror = smooth(W.cakeHit - 0.05, W.cakeHit + 0.35, w) * (1 - smooth(W.feedBack - 2, W.feedBack - 1, w));
  const top = v3(L.cake.at[0], 1.45, L.cake.at[2]);
  return {
    look: top.clone().lerp(droneAtW(w), horror * 0.5),
    e: E(mixE({ smile: 0.35, brow: 0.2, tongue: 0.6, squint: 0.2 }, HORROR, horror)),
    armR: horror > 0.05 ? { at: v3(0.09, 1.6, -0.12), hand: OPEN, palm: v3(-1, 0, 0) } : { at: v3(0.0, 1.38, -0.42), hand: GRIP, palm: v3(-1, 0, 0) },
    armL: horror > 0.05 ? { at: v3(-0.09, 1.6, -0.12), hand: OPEN, palm: v3(1, 0, 0) } : { at: v3(-0.2, 1.12, -0.32), hand: RELAX },
    holdR: horror > 0.05 ? null : "spatula",
    lean: 0.25 * (1 - horror) - 0.1 * horror,
  };
};

/* ------------------------------------------------------------------ */
/* The end: everyone round the cake, looking down at the camera in it                         */
/* ------------------------------------------------------------------ */

const CAM_END = v3(24.02, 1.12, -7.42);
export const DOG_HEAD = (() => {
  const d = v3(...L.dogEnd);
  return d.clone().addScaledVector(CAM_END.clone().sub(d).setY(0).normalize(), 0.12).setY(d.y + 0.62);
})();
type Who = "baker" | "bride" | "groom" | "kid";
/** Where everyone stands round the cake table at the end (feet) and how far they lean in over it: placed so
 * every face is in the shot from the camera lying in the cake (grandma's laughing somewhere behind). */
export const END_AT: Record<Who, THREE.Vector3> = {
  baker: v3(24.02, 0, -6.68),
  bride: v3(24.5, 0, -6.55),
  groom: v3(23.7, 0, -6.8),
  kid: v3(24.15, 0, -6.73),
};
const END_LEAN: Record<Who, number> = { baker: 0.5, bride: 0.4, groom: 0.6, kid: 0.2 };
const END_K: Record<Who, number> = { baker: 1, bride: 0.95, groom: 1, kid: 0.75 };
const END_CUE: Record<Who, number> = { baker: W.baker, bride: W.bride, groom: W.groom, kid: W.kid };
// which way each one comes in from (up to the table from behind and the sides)
const END_FROM: Record<Who, THREE.Vector3> = {
  baker: v3(0.2, 0, 1).normalize(),
  bride: v3(0.9, 0, 0.5).normalize(),
  groom: v3(-0.8, 0, 0.6).normalize(),
  kid: v3(0.6, 0, 1).normalize(),
};
/** The ribbon the groom pulls out of the cake: where his fingers hold it, from the moment it comes out. */
export const RIBBON_HOLD = (w: number) => {
  const up = smooth(W.ribbon - 0.15, W.ribbon + 0.55, w);
  return v3(23.93, 1.14, -7.3).lerp(v3(24.04, 1.64, -7.13), up);
};
/** The baker sees his cake and faints, straight down out of the picture. */
const faintAt = (w: number) => smooth(W.baker + 0.95, W.baker + 1.35, w);
export const endShown = (who: Who, w: number) =>
  w >= END_CUE[who] - 0.45 && !(who === "baker" && faintAt(w) >= 1 && w > W.baker + 1.6);

const toLocal = (at: THREE.Vector3, yaw: number, p: THREE.Vector3) =>
  p.clone().sub(at).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).invert());

const endPose = (who: Who, w: number): { pose: Pose; yaw: number; at: THREE.Vector3 } => {
  const cue = END_CUE[who];
  const k = END_K[who];
  const arrive = smooth(cue - 0.45, cue + 0.35, w);
  const at = END_AT[who].clone().addScaledVector(END_FROM[who], 0.75 * (1 - arrive) ** 2);
  const yaw = faceToward(at, CAM_END);
  // everyone stares into the lens; once the kid points, they all turn to the dog
  const toDog = smooth(W.point + 0.15 + (who === "kid" ? -0.2 : 0.1 * END_LEAN[who]), W.point + 0.7, w);
  let look: THREE.Vector3 | null = CAM_END.clone().lerp(DOG_HEAD, toDog);
  let lean = END_LEAN[who] * smooth(cue - 0.25, cue + 0.45, w);
  let e: Partial<Expr> = {};
  let armL: Arm | undefined;
  let armR: Arm | undefined;
  let crouch = 0;
  let lift = 0;
  // the face in the body's frame (for hands over a mouth): eyes on the leaning spine, a little forward
  const eyeLocal = (l: number) => v3(0, 0.93 * k + Math.cos(l) * 0.7 * k, -Math.sin(l) * 0.7 * k - 0.05);
  if (who === "baker") {
    const f = faintAt(w);
    // horror, then the eyes roll up and the lids come down, and he goes
    e = mixE(HORROR, { jaw: 0.35, brow: 0.6, lidL: 0.75, lidR: 0.75, eyePitch: 0.45, smile: -0.1 }, smooth(W.baker + 0.55, W.baker + 0.95, w));
    const m = eyeLocal(lean).add(v3(0, -0.08, -0.06));
    const cover = smooth(W.baker + 0.1, W.baker + 0.45, w) * (1 - smooth(W.baker + 0.7, W.baker + 1.0, w));
    armL = { at: m.clone().add(v3(-0.07, -0.05, 0.02)).lerp(v3(-0.25, 0.85, -0.05), 1 - cover), hand: OPEN, palm: v3(0.6, 0, 1) };
    armR = { at: m.clone().add(v3(0.07, -0.05, 0.02)).lerp(v3(0.25, 0.85, -0.05), 1 - cover), hand: OPEN, palm: v3(-0.6, 0, 1) };
    crouch = f;
    lift = -0.55 * f * f;
    lean = lean * (1 - f) - 0.5 * f;
    look = f > 0.2 ? null : look;
  }
  if (who === "bride") {
    // hands over her mouth, then just staring; at the ribbon, disbelief; at the dog, she can't
    const cover = smooth(cue - 0.1, cue + 0.3, w) * (1 - smooth(W.groom + 0.2, W.groom + 0.9, w));
    e = mixE(SHOCK, { smile: -0.25, brow: 0.75, jaw: 0.15, squint: 0.05 }, smooth(cue + 1.2, cue + 2.2, w));
    e = mixE(e, { brow: 1, jaw: 0.4, wide: 0.25, smile: -0.2 }, smooth(W.ribbon + 0.4, W.ribbon + 0.9, w));
    e = mixE(e, { smile: 0.55, brow: 0.85, jaw: 0.35, squint: 0.25 }, smooth(W.dog - 0.2, W.dog + 0.5, w));
    const m = eyeLocal(lean).add(v3(0, -0.075, -0.07));
    // before she's there her hands are at her sides; after, flat on the table's edge
    const rest = smooth(W.groom + 0.2, W.groom + 0.9, w);
    const sideR = v3(0.2, 0.86, -0.12).lerp(v3(0.17, 0.82, -0.36), rest);
    const sideL = v3(-0.2, 0.86, -0.12).lerp(v3(-0.19, 0.82, -0.34), rest);
    armR = { at: m.clone().add(v3(0.04, -0.06, 0.02)).lerp(sideR, 1 - cover), hand: mixHand(OPEN, OPEN, cover), palm: v3(-0.5, 0, 1).lerp(v3(0, -1, 0), rest), pole: v3(1, -0.7, 0.3) };
    armL = { at: m.clone().add(v3(-0.04, -0.07, 0.03)).lerp(sideL, 1 - cover), hand: OPEN, palm: v3(0.5, 0, 1).lerp(v3(0, -1, 0), rest), pole: v3(-1, -0.7, 0.3) };
  }
  if (who === "groom") {
    e = mixE(GLARE, { smile: -0.45, brow: -1, squint: 0.55, jaw: 0.08 }, smooth(cue + 1, cue + 2, w));
    // he turns his head, slowly, to the kid; the kid's grin; back to the lens
    const glare = span(w, W.glare - 0.1, W.glare + 1.1, 0.35);
    look = CAM_END.clone().lerp(END_AT.kid.clone().setY(1.2), glare);
    // he digs in the cake beside the lens, pulls out the ribbon and holds it up to it: nothing on it
    const reach = span(w, W.dig - 0.35, W.ribbon + 0.05, 0.4);
    const up = smooth(W.ribbon - 0.15, W.ribbon + 0.55, w);
    const dig = v3(23.93, 1.14, -7.3).add(v3(0.03 * Math.sin(w * 13), 0.02 * Math.abs(Math.sin(w * 9)), 0.02 * Math.cos(w * 11)).multiplyScalar(span(w, W.dig + 0.3, W.ribbon - 0.2, 0.2)));
    const restR: Arm = { at: v3(0.12, 0.8, -0.42), hand: OPEN, palm: v3(0, -1, 0), pole: v3(1, -0.4, 0.3) };
    armR = restR;
    if (reach > 0.01 || up > 0.01) {
      const hold = RIBBON_HOLD(w);
      const target = up > 0.01 ? hold : dig;
      armR = {
        at: restR.at.clone().lerp(toLocal(at, yaw, target).add(v3(0, -0.02, 0.03)), Math.max(reach, up)),
        hand: up > 0.01 ? mixHand(OPEN, { curl: [0.9, 1.0, 1.1, 1.15], spread: 0, thumbOut: 0.1, thumbCurl: 0.9 }, up) : mixHand(RELAX, OPEN, reach),
        palm: up > 0.01 ? v3(-1, 0, -0.2) : v3(0, -1, 0),
        pole: v3(1, -0.5, 0.3),
      };
      lean = END_LEAN.groom + 0.12 * reach * (1 - up);
      // a glance at what he's found, then straight back into the lens
      const glance = span(w, W.ribbon + 0.15, W.ribbon + 0.95, 0.2);
      look = look.clone().lerp(hold.clone().add(v3(0, -0.12, 0)), glance);
    }
    e = mixE(e, { brow: 0.85, jaw: 0.3, smile: -0.25, squint: 0 }, smooth(W.ribbon + 0.9, W.ribbon + 1.3, w));
    e = mixE(e, { brow: 0.9, jaw: 0.45, smile: 0.1, wide: 0.2 }, smooth(W.dog - 0.1, W.dog + 0.5, w));
    look = look.clone().lerp(DOG_HEAD, toDog);
    armL = { at: v3(-0.2, 0.83, -0.38), hand: OPEN, palm: v3(0, -1, 0) };
  }
  if (who === "kid") {
    // up from behind; guilty: a tight little smile, eyes going from the camera to his dad and back; then he
    // sees the dog and points
    const pointing = smooth(W.point - 0.25, W.point + 0.2, w);
    const dart = Math.sin(w * 2.6) > 0.2 ? 0.32 : Math.sin(w * 2.6) < -0.6 ? -0.15 : 0;
    e = { smile: 0.38, wide: 0.45, brow: 0.55, squint: 0.05, eyeYaw: dart * (1 - pointing) };
    // his dad's glare: he looks up at him with the biggest, guiltiest grin
    const glared = span(w, W.glare + 0.2, W.glare + 1.2, 0.3);
    look = CAM_END.clone().lerp(END_AT.groom.clone().setY(1.55), glared);
    e = mixE(e, { smile: 0.95, wide: 0.7, brow: 0.7, squint: 0.15, eyeYaw: 0 }, glared);
    crouch = 0.35 * (1 - smooth(cue - 0.2, cue + 0.35, w));
    if (pointing > 0.01) {
      const shoulder = v3(0.14, 0.93 * k + Math.cos(lean) * 0.47 * k, -Math.sin(lean) * 0.47 * k);
      const dl = toLocal(at, yaw, DOG_HEAD).sub(shoulder).normalize();
      armR = { at: shoulder.clone().addScaledVector(dl, 0.12).lerp(shoulder.clone().addScaledVector(dl, 0.42), pointing).add(v3(0, -0.15 * (1 - pointing), 0)), hand: mixHand(RELAX, POINT, pointing), palm: v3(0, -1, 0), pole: v3(1, -1, 0.2) };
      e = mixE(e, { smile: 0.85, brow: 0.8, jaw: 0.25, wide: 0.2, squint: 0.2, eyeYaw: 0 }, pointing);
      look = look.clone().lerp(DOG_HEAD, pointing);
    } else {
      armR = { at: v3(0.13, 0.66, -0.3), hand: OPEN, palm: v3(0, -1, 0) };
    }
    armL = { at: v3(-0.13, 0.66, -0.3), hand: OPEN, palm: v3(0, -1, 0) };
  }
  return { pose: { look, e: E(e), armL, armR, lean, crouch, lift }, yaw, at };
};

/** The satin ribbon hanging from the groom's fingers: a twisting strip with frosting smeared on it, and at the
 * end the empty bow it was tied to the box with. */
const Ribbon: React.FC<{ w: number }> = ({ w }) => {
  const mats = React.useMemo(
    () => ({
      satin: new THREE.MeshPhysicalMaterial({ color: "#F2EADF", roughness: 0.32, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color("#FFFFFF"), side: THREE.DoubleSide }),
      frost: new THREE.MeshPhysicalMaterial({ color: "#FFF4E2", roughness: 0.5, clearcoat: 0.4 }),
    }),
    [],
  );
  const geo = React.useMemo(() => new THREE.BufferGeometry(), []);
  if (w < W.ribbon - 0.15) return null;
  const top = RIBBON_HOLD(w);
  const N = 24;
  const len = 0.3;
  const width = 0.024;
  // swinging from his fingers, slowly turning
  const age = w - W.ribbon;
  const swing = 0.22 * Math.sin(age * 3.3) * Math.exp(-Math.max(0, age) * 0.45) + 0.03 * Math.sin(w * 1.7);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = swing * u;
    pts.push(top.clone().add(v3(Math.sin(a) * len * u, -Math.cos(a) * len * u, 0.25 * Math.sin(a) * len * u)));
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const frame: { c: THREE.Vector3; t: THREE.Vector3; side: THREE.Vector3; n: THREE.Vector3 }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const twist = 0.5 + 2.6 * (i / N) + w * 0.35;
    const side = new THREE.Vector3(Math.cos(twist), 0, Math.sin(twist));
    side.addScaledVector(t, -side.dot(t)).normalize();
    const n = new THREE.Vector3().crossVectors(t, side).normalize();
    frame.push({ c: pts[i], t, side, n });
    // the snapped end frays a little narrower
    const wd = width * (i === N ? 0.8 : 1);
    const a = pts[i].clone().addScaledVector(side, wd / 2);
    const b = pts[i].clone().addScaledVector(side, -wd / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const end = frame[N];
  const bowQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(end.side, end.t, end.n));
  return (
    <group>
      <mesh geometry={geo} material={mats.satin} frustumCulled={false} />
      {/* the knot at the end it was tied to the box with: nothing in it now */}
      <mesh material={mats.satin} position={end.c.clone().addScaledVector(end.t, 0.004)} quaternion={bowQ} scale={[0.014, 0.011, 0.008]}>
        <sphereGeometry args={[1, 12, 10]} />
      </mesh>
      {/* frosting smeared on it */}
      {[0.28, 0.52, 0.74, 0.9].map((u, i) => {
        const f = frame[Math.round(u * N)];
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.side, f.t, f.n));
        return (
          <mesh key={i} material={mats.frost} position={f.c.clone().addScaledVector(f.n, (i % 2 ? 1 : -1) * 0.002).addScaledVector(f.side, 0.003 * (i - 1.5))} quaternion={q} scale={[0.011 + 0.003 * (i % 2), 0.016 + 0.006 * ((i + 1) % 2), 0.0035]}>
            <sphereGeometry args={[1, 12, 9]} />
          </mesh>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Render                                                                */
/* ------------------------------------------------------------------ */

export const People: React.FC<{ w: number; cam: THREE.Vector3 }> = ({ w, cam }) => {
  const ending = w >= W.feedBack - 1.5;
  const near = (p: THREE.Vector3, d: number) => p.distanceTo(cam) < d;
  const out: React.ReactNode[] = [];
  if (!ending) {
    // the guests
    GUESTS.forEach((g, i) => {
      const at = v3(...g.at);
      const hatGone = g.role === "hatlady" && w >= W.hat;
      out.push(<Figure key={`g${i}`} who={g.person} outfit={g.outfit} k={g.k} pose={guestPose(g, w)} at={at} yaw={0} t={w} hi={near(at, 4)} noHat={hatGone} />);
    });
    out.push(<Figure key="groom" who={GROOM} outfit={OUTFITS.groom} pose={couplePose(false, w)} at={GROOM_AT} yaw={faceToward(GROOM_AT, BRIDE_AT) + 0.6} t={w} hi={near(GROOM_AT, 6)} />);
    out.push(<Figure key="bride" who={BRIDE} outfit={OUTFITS.bride} k={0.95} pose={couplePose(true, w)} at={BRIDE_AT} yaw={faceToward(BRIDE_AT, GROOM_AT) - 0.6} t={w} hi={near(BRIDE_AT, 6)} />);
    out.push(<Figure key="off" who={OFFICIANT} outfit={OUTFITS.officiant} pose={officiantPose(w)} at={OFF_AT} yaw={Math.PI} t={w} hi={near(OFF_AT, 6)} />);
    out.push(
      <Figure key="kid" who={KID_P} outfit={OUTFITS.kid} k={0.75} pose={kidStartPose(w)} at={KID_AT.clone().add(v3(0, 0, -0.38 * (1 - kidStand(w))))} yaw={0} t={w} hi={near(KID_AT, 5)}>
        <Controller at={v3(0, 0.69 - 0.2 * (1 - kidStand(w)), -0.2 - 0.2 * (1 - kidStand(w)))} />
      </Figure>,
    );
    // staff
    const wt = waiterPose(w);
    out.push(<Figure key="waiter" who={WAITER} outfit={OUTFITS.waiter} pose={wt.pose} at={v3(...L.waiterOut)} yaw={wt.yaw} t={w} hi={near(v3(...L.waiterOut), 6)} />);
    out.push(<Figure key="dj" who={DJ_P} outfit={OUTFITS.dj} pose={djPose(w)} at={v3(...L.dj.at)} yaw={Math.PI / 2} t={w} hi={near(v3(...L.dj.at), 6)} />);
    // the waitress pours from behind the tower; the baker finishes the cake from behind it; both face the
    // way the drone comes in
    const pourAt = v3(...L.pourer);
    const bakeAt = v3(...L.baker);
    out.push(<Figure key="pourer" who={POURER} outfit={OUTFITS.pourer} k={0.96} pose={pourerPose(w)} at={pourAt} yaw={faceToward(pourAt, v3(L.tower.at[0], 0, L.tower.at[2]))} t={w} hi={near(pourAt, 5)} />);
    out.push(<Figure key="baker" who={BAKER} outfit={OUTFITS.baker} pose={bakerPose(w)} at={bakeAt} yaw={faceToward(bakeAt, v3(L.cake.at[0], 0, L.cake.at[2]))} t={w} hi={near(bakeAt, 5)} />);
  } else {
    (["baker", "bride", "groom", "kid"] as const).forEach((who) => {
      if (!endShown(who, w)) return;
      const { pose, yaw, at } = endPose(who, w);
      const person = who === "baker" ? BAKER : who === "bride" ? BRIDE : who === "groom" ? GROOM : KID_P;
      // the gown narrower at the hem here, so it clears the table and the kid beside her
      const outfit = who === "bride" ? { ...OUTFITS.bride, hemR: 0.4 } : OUTFITS[who];
      out.push(<Figure key={`end${who}`} who={person} outfit={outfit} k={END_K[who]} pose={pose} at={at} yaw={yaw} t={w} hi />);
    });
    out.push(<Ribbon key="ribbon" w={w} />);
  }
  return <>{out}</>;
};

export { THUMBS_UP };
