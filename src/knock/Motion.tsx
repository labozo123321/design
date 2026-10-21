import React from "react";
import * as THREE from "three";
import { Figure, RELAX, type Arm, type Pose } from "../wedding/Figure";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import type { Sib } from "./cast";
import { HeadBits, lyingChains, type ArmSpec, type Reach } from "./People";
import { smoother, V3 } from "./anim";

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
  return {
    ...(e < 0.5 ? a : b),
    hip: a.hip.clone().lerp(b.hip, e),
    q: a.q.clone().slerp(b.q, e),
    feet: [a.feet[0].clone().lerp(b.feet[0], e), a.feet[1].clone().lerp(b.feet[1], e)],
  };
};

/** Walking along a path (world points on the floor) at distance d (m) from its start: the hips over the
 * path with a bob, facing along it, each foot planted while the other swings. */
export const walkAlong = (s: Sib, path: THREE.Vector3[], d: number, base: Omit<Posed, "hip" | "q" | "feet">): Posed => {
  // the point and heading at distance d
  let rem = Math.max(0, d);
  let p = path[0].clone();
  let dir = path[1].clone().sub(path[0]).normalize();
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i + 1].clone().sub(path[i]);
    const L = seg.length();
    if (rem <= L || i === path.length - 2) {
      p = path[i].clone().addScaledVector(seg.normalize(), Math.min(rem, L));
      dir = seg.clone();
      // turn smoothly into the next leg over the last 30 cm
      if (i < path.length - 2 && L - rem < 0.3) {
        const next = path[i + 2].clone().sub(path[i + 1]).normalize();
        dir.lerp(next, (0.3 - (L - rem)) / 0.6).normalize();
      }
      break;
    }
    rem -= L;
  }
  const k = s.k;
  const stride = 0.62 * k;
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
  return { ...base, hip, q: facing(dir), feet: [foot(-1, ph), foot(1, ph + Math.PI)] };
};

/** Standing still at a point facing a direction. */
export const standAt = (s: Sib, at: THREE.Vector3, dir: THREE.Vector3, base: Omit<Posed, "hip" | "q" | "feet">): Posed => {
  const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const f = (sd: number) => at.clone().addScaledVector(right, sd * 0.11 * s.k).add(V3(0, 0.09 * s.k * 0.6, 0));
  return { ...base, hip: at.clone().add(V3(0, hipHeight(s) - 0.005, 0)), q: facing(dir), feet: [f(-1), f(1)] };
};

const toBody = (p: THREE.Vector3, root: THREE.Vector3, q: THREE.Quaternion) => p.clone().sub(root).applyQuaternion(q.clone().invert());

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
    return { at: r.at.clone().lerp(g.at, k), hand: k > 0.5 ? g.hand : r.hand, palm: k > 0.5 ? g.palm : r.palm, pole: k > 0.5 ? g.pole : r.pole };
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
  };
  const n = arm(p.near);
  const f = arm(p.far);
  if (n) pose[nearKey] = n;
  if (f) pose[farKey] = f;
  return (
    <group position={root} quaternion={p.q}>
      <Figure who={s.who} outfit={s.outfit} k={s.k} pose={pose} at={V3(0, 0, 0)} yaw={0} t={t} hi headExtra={<HeadBits s={s} t={t} />} chains={lyingChains(s)} />
    </group>
  );
};
