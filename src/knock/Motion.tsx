import React from "react";
import * as THREE from "three";
import { Figure, RELAX, type Arm, type Pose } from "../wedding/Figure";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import { BAREFOOT, type Sib } from "./cast";
import { HeadBits, LIE_POINT, clearOfWall, legCapsules, lyingChains, turnToward, type ArmSpec, type Reach } from "./People";
import type { Capsule } from "./Beds";
import { smoother, V3 } from "./anim";
import { mixHand } from "../coaster/Hand";

/**
 * Bodies out of bed: one model for every posture. A body is its hips (a world point), its orientation (the
 * body's right, up, back as a quaternion), where its two feet are (world points: planted on the floor,
 * along the mattress, over the bed's edge), its arms, its face. Postures blend by moving the hips, turning
 * the body and sliding the feet, so sitting up, swinging the legs out, standing, walking and lying down on
 * the floor all flow into one another without a pop. Walking plants each foot on the floor while the other
 * swings, the hips bobbing.
 */

export type Posed = {
  hip: THREE.Vector3;
  q: THREE.Quaternion;
  feet: [THREE.Vector3, THREE.Vector3];
  near?: ArmSpec | null;
  far?: ArmSpec | null;
  /** which arm is "near" (the body's left, -1, or right, +1) */
  nearSide?: -1 | 1;
  e: Partial<Expr>;
  look?: THREE.Vector3 | null;
  headYaw?: number;
  headPitch?: number;
  lean?: number;
  twist?: number;
};

/** The hips' height above the feet origin in the Figure (standing, no crouch). */
export const hipHeight = (s: Sib) => 0.93 * s.k;

/** Body orientation: facing a heading (world direction, horizontal), upright; or with the body's up along
 * a direction (lying, rising). */
export const facing = (dir: THREE.Vector3, up = V3(0, 1, 0)) => {
  const U = up.clone().normalize();
  const F = dir.clone().addScaledVector(U, -dir.dot(U)).normalize();
  const B = F.clone().negate();
  const R = new THREE.Vector3().crossVectors(U, B).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, B));
};

/** Blend two postures (hips, orientation, feet; arms and face from the nearer one unless given). */
export const blendPosed = (a: Posed, b: Posed, k: number): Posed => {
  const e = smoother(k);
  // the hands travel from one pose's place to the other's (no snap halfway), each arm with its own side
  const [bNear, bFar] = (b.nearSide ?? -1) === (a.nearSide ?? -1) ? [b.near, b.far] : [b.far, b.near];
  return {
    ...(e < 0.5 ? a : b),
    hip: a.hip.clone().lerp(b.hip, e),
    q: a.q.clone().slerp(b.q, e),
    feet: [a.feet[0].clone().lerp(b.feet[0], e), a.feet[1].clone().lerp(b.feet[1], e)],
    nearSide: a.nearSide,
    near: mixArm(a.near, bNear, e),
    far: mixArm(a.far, bFar, e),
  };
};
/** Where an arm is headed (its target once more than halfway there). */
const settled = (s?: ArmSpec | null): Reach | null => (s ? (s.to && (s.k ?? 1) > 0.5 ? s.to : s.rest) : null);
const mixArm = (x: ArmSpec | null | undefined, y: ArmSpec | null | undefined, e: number): ArmSpec | null | undefined => {
  const rx = settled(x);
  const ry = settled(y);
  if (!rx || !ry) return e < 0.5 ? x : y;
  return { rest: rx, to: ry, k: e };
};

/** Walking along a path (world points on the floor) at distance d (m) from its start: the hips over the
 * path with a bob, facing along it, each foot planted while the other swings. */
/** (arms: if given, the arms for the walk's phase, so they can swing with the steps) */
export const walkAlong = (s: Sib, path: THREE.Vector3[], d: number, base: Omit<Posed, "hip" | "q" | "feet">, strideK = 0.62, arms?: (ph: number) => Pick<Posed, "near" | "far">): Posed => {
  // the point at distance d (along the path)
  const segs = path.slice(1).map((q, i) => q.clone().sub(path[i]));
  const lens = segs.map((v) => v.length());
  const dirs = segs.map((v) => v.clone().normalize());
  let rem = Math.max(0, d);
  let i = 0;
  while (i < segs.length - 1 && rem > lens[i]) rem -= lens[i++];
  const p = path[i].clone().addScaledVector(dirs[i], Math.min(rem, lens[i]));
  // the heading: each leg's direction, handed on to the next across every corner over up to 30 cm either
  // side of it (less on a short leg, so the turns never overlap), so the body never snaps round
  const at = Math.min(Math.max(0, d), lens.reduce((x, y) => x + y, 0));
  const corner: number[] = [];
  const half: number[] = [];
  let c = 0;
  for (let j = 0; j < segs.length - 1; j++) {
    c += lens[j];
    corner.push(c);
    half.push(Math.max(1e-3, Math.min(0.3, lens[j] / 2, lens[j + 1] / 2)));
  }
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (at - a) / (b - a)));
  const dir = new THREE.Vector3();
  for (let j = 0; j < segs.length; j++) {
    const up = j === 0 ? 1 : ramp(corner[j - 1] - half[j - 1], corner[j - 1] + half[j - 1]);
    const down = j === segs.length - 1 ? 1 : 1 - ramp(corner[j] - half[j], corner[j] + half[j]);
    dir.addScaledVector(dirs[j], up * down);
  }
  if (dir.lengthSq() < 1e-8) dir.copy(dirs[i]);
  dir.normalize();
  const k = s.k;
  // (one full cycle, two steps; hurrying across a dark house, the steps are long)
  const stride = strideK * k;
  const ph = (d / stride) * Math.PI * 2;
  const right = new THREE.Vector3(-dir.z, 0, dir.x);
  const foot = (sd: number, phase: number) => {
    // forward/back along the heading, lifted on the swing half
    const fwd = Math.sin(phase) * stride * 0.25;
    const lift = Math.max(0, Math.cos(phase)) * 0.07 * k;
    return p.clone().addScaledVector(dir, fwd).addScaledVector(right, sd * 0.1 * k).add(V3(0, 0.09 * k * 0.6 + lift, 0));
  };
  const bob = Math.abs(Math.cos(ph)) * 0.025 * k;
  const hip = p.clone().add(V3(0, hipHeight(s) - 0.02 * k + bob, 0));
  return { ...base, ...(arms ? arms(ph) : {}), hip, q: facing(dir), feet: [foot(-1, ph), foot(1, ph + Math.PI)] };
};

/** Standing still at a point facing a direction. */
export const standAt = (s: Sib, at: THREE.Vector3, dir: THREE.Vector3, base: Omit<Posed, "hip" | "q" | "feet">): Posed => {
  const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const f = (sd: number) => at.clone().addScaledVector(right, sd * 0.11 * s.k).add(V3(0, 0.09 * s.k * 0.6, 0));
  return { ...base, hip: at.clone().add(V3(0, hipHeight(s) - 0.005, 0)), q: facing(dir), feet: [f(-1), f(1)] };
};

const toBody = (p: THREE.Vector3, root: THREE.Vector3, q: THREE.Quaternion) => p.clone().sub(root).applyQuaternion(q.clone().invert());

/** A posed body's legs as capsules in the world (for covers it's getting out from under). */
export const posedLegCapsules = (s: Sib, p: Posed): Capsule[] => {
  const root = p.hip.clone().sub(V3(0, hipHeight(s), 0).applyQuaternion(p.q));
  const w = (v: THREE.Vector3) => v.clone().applyQuaternion(p.q).add(root);
  return legCapsules(s, w, [toBody(p.feet[0], root, p.q), toBody(p.feet[1], root, p.q)], true);
};

/** Draw a posed body. */
export const PosedSib: React.FC<{ s: Sib; p: Posed; t: number }> = ({ s, p, t }) => {
  const root = p.hip.clone().sub(V3(0, hipHeight(s), 0).applyQuaternion(p.q));
  const one = (r: Reach): Arm => ({
    at: r.body ? r.at.clone() : toBody(r.at, root, p.q),
    hand: r.hand ?? RELAX,
    palm: r.palm ? (r.body ? r.palm.clone() : r.palm.clone().applyQuaternion(p.q.clone().invert())) : undefined,
    pole: r.pole ? (r.body ? r.pole.clone() : r.pole.clone().applyQuaternion(p.q.clone().invert())) : undefined,
  });
  const arm = (a: ArmSpec | null | undefined): Arm | undefined => {
    if (!a) return undefined;
    const r = one(a.rest);
    if (!a.to || (a.k ?? 1) <= 0) return r;
    const g = one(a.to);
    const k = Math.min(1, a.k ?? 1);
    // (the hand opens or closes and the elbow and palm swing round over the whole move, not at its middle)
    const turn = (a?: THREE.Vector3, b?: THREE.Vector3) => (a && b ? turnToward(a, b, k) : k > 0.5 ? b : a);
    return { at: r.at.clone().lerp(g.at, k), hand: r.hand && g.hand ? mixHand(r.hand, g.hand, k) : k > 0.5 ? g.hand : r.hand, palm: turn(r.palm, g.palm), pole: turn(r.pole, g.pole) };
  };
  const nearKey: "armL" | "armR" = (p.nearSide ?? -1) < 0 ? "armL" : "armR";
  const farKey: "armL" | "armR" = nearKey === "armL" ? "armR" : "armL";
  const pose: Pose = {
    e: { ...NEUTRAL, ...p.e },
    look: p.look ? toBody(p.look, root, p.q) : null,
    headYaw: p.headYaw,
    headPitch: p.headPitch,
    lean: p.lean,
    twist: p.twist,
    feet: [toBody(p.feet[0], root, p.q), toBody(p.feet[1], root, p.q)],
    ankles: true,
    // (the feet fall relaxed as the body lies down; upright, they stand on the floor)
    pointToes: s.outfit.shoe === BAREFOOT ? LIE_POINT * Math.min(1, Math.max(0, 1 - 1.4 * new THREE.Vector3(0, 1, 0).applyQuaternion(p.q).y)) : 0,
  };
  // (out of whichever room's side of the wall the hips are in)
  const room = (p.hip.x < 0 ? -1 : 1) as -1 | 1;
  const qi = p.q.clone().invert();
  const toW = (v: THREE.Vector3) => v.clone().applyQuaternion(p.q).add(root);
  const toL = (d: THREE.Vector3) => d.clone().applyQuaternion(qi);
  const clamp = (a: Arm | undefined, key: "armL" | "armR") => (a ? clearOfWall(a, key === "armL" ? -1 : 1, s.k, room, toW, toL) : undefined);
  const n = clamp(arm(p.near), nearKey);
  const f = clamp(arm(p.far), farKey);
  if (n) pose[nearKey] = n;
  if (f) pose[farKey] = f;
  return (
    <group position={root} quaternion={p.q}>
      <Figure who={s.who} outfit={s.outfit} k={s.k} pose={pose} at={V3(0, 0, 0)} yaw={0} t={t} hi headExtra={<HeadBits s={s} t={t} />} chains={lyingChains(s)} />
    </group>
  );
};
