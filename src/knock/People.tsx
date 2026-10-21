import React from "react";
import * as THREE from "three";
import { Figure, GRIP, RELAX, type Arm, type Pose } from "../wedding/Figure";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import type { HandPose } from "../coaster/Hand";
import { CardHair } from "../looks/Hair";
import { Glasses } from "../looks/Accessories";
import { skullR } from "../looks/Hair";
import type { Sib } from "./cast";
import { BED, PILLOW, WALL } from "./layout";
import type { Capsule, HeadRest } from "./Beds";

/**
 * People lying in bed, seen from above. A body is the wedding's Figure laid down on the mattress: its long
 * axis along the bed (head at the headboard), rolled about that axis between lying on its back (face up,
 * to the camera) and on its side facing the wall (roll 1), its head on the pillow (the pillow dents to fit),
 * the shoulders lifted a little by the pillow. Arms reach for world points (a knock's contact on the wall,
 * the covers' edge, a phone over the face); the legs are straight on the back, the knees drawn up on the
 * side. The covers are built from the capsules this returns, so nothing under them can poke through.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Where a hand goes: a point (in the world, or in the body's own frame when body is set: x to the
 * body's right, y up the body from the feet, z behind it), the hand's shape, which way the palm faces,
 * where the elbow points. */
export type Reach = { at: THREE.Vector3; hand?: HandPose; palm?: THREE.Vector3; pole?: THREE.Vector3; body?: boolean; eye?: boolean };
/** An arm: at rest somewhere, moving toward another reach by k (0..1). */
export type ArmSpec = { rest: Reach; to?: Reach | null; k?: number };
export type Lie = {
  /** 0 on the back .. 1 on the side facing the wall (-1: on the side facing away from it) */
  roll: number;
  /** extra lift of the head and shoulders (sitting up a bit, m) */
  prop?: number;
  /** the arm nearer the wall and the one away from it; undefined: hanging at the sides */
  near?: ArmSpec | null;
  far?: ArmSpec | null;
  e: Partial<Expr>;
  look?: THREE.Vector3 | null;
  headYaw?: number;
  headPitch?: number;
  /** knees drawn up (0..1) */
  knees?: number;
  /** slide along the bed toward the wall (+) or away (-), metres */
  slide?: number;
  /** lying somewhere other than the twin bed: the head's x (on the back), the surface height, the pillow */
  spot?: Spot;
};
/** A place to lie: the x of the head when on the back, the surface's height, the pillow's centre z and
 * height. */
export type Spot = { x: number; top: number; pillowZ: number; pillowH: number };
export const bedSpot = (side: -1 | 1): Spot => ({ x: side * 0.25, top: BED.top, pillowZ: PILLOW.z, pillowH: PILLOW.h });

/** The head's eye-level origin above the feet (body frame), as the Figure builds it standing. */
const eyeHeight = (s: Sib) => 1.555 * s.k + Math.abs(s.who.shape.chinY);

/** The body frame for a lying person: rotation (columns: the body's x right, y up, z back in the world)
 * and the position of its feet origin, so that the eyes sit at `head`. */
export const lieFrame = (s: Sib, side: -1 | 1, st: Lie, head: THREE.Vector3) => {
  const th = (st.roll * Math.PI) / 2;
  // the face: up on the back, toward the wall on the side
  const F = V(-side * Math.sin(th), Math.cos(th), 0).normalize();
  // the body's up runs toward the headboard, lifted by the pillow
  const lift = 0.13 + (st.prop ?? 0) * 0.8;
  const U = V(0, Math.sin(lift), -Math.cos(lift)).normalize();
  // keep F perpendicular to U
  const Fp = F.clone().addScaledVector(U, -F.dot(U)).normalize();
  const B = Fp.clone().negate();
  const R = new THREE.Vector3().crossVectors(U, B).normalize();
  const m = new THREE.Matrix4().makeBasis(R, U, B);
  // rolled toward the wall, the body angles a little away from it (the face near it, the knees clear)
  const yawAway = side * Math.max(0, st.roll) * 0.16;
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yawAway).multiply(new THREE.Quaternion().setFromRotationMatrix(m));
  const eyeB = V(0, eyeHeight(s), 0);
  const pos = head.clone().sub(eyeB.clone().applyQuaternion(q));
  return { q, pos, R: R.applyAxisAngle(V(0, 1, 0), yawAway), U: U.applyAxisAngle(V(0, 1, 0), yawAway), B: B.applyAxisAngle(V(0, 1, 0), yawAway), F: Fp.applyAxisAngle(V(0, 1, 0), yawAway) };
};

/** Where the head rests for a side and roll (eye-level origin), the pillow-dent centre and radius. */
export const headAt = (s: Sib, side: -1 | 1, st: Lie) => {
  const sh = s.who.shape;
  const r = Math.max(sh.w, sh.d) * 1.08;
  const roll = Math.max(0, st.roll);
  // on the back: the back of the skull in the pillow; on the side: the cheek on it, nearer the wall
  const sp = st.spot ?? bedSpot(side);
  const x = sp.x - side * (0.09 * roll + (st.slide ?? 0));
  const y = sp.top + sp.pillowH * 0.62 + r * (0.62 - 0.12 * roll) + (st.prop ?? 0);
  const z = sp.pillowZ + 0.02;
  const eye = V(x, y, z);
  // the skull's centre sits behind and a little above the eyes
  const th = (st.roll * Math.PI) / 2;
  const back = V(side * Math.sin(th), -Math.cos(th), 0).multiplyScalar(sh.d * 0.55);
  const centre = eye.clone().add(back).add(V(0, 0, -0.01));
  const rest: HeadRest = { at: centre, r };
  return { eye, rest };
};

const toBody = (p: THREE.Vector3, f: { q: THREE.Quaternion; pos: THREE.Vector3 }) => p.clone().sub(f.pos).applyQuaternion(f.q.clone().invert());
const dirToBody = (d: THREE.Vector3, f: { q: THREE.Quaternion }) => d.clone().applyQuaternion(f.q.clone().invert());

/** Two-bone IK as the Figure does it: the joint between S and T for bone lengths a, b, bending toward pole. */
const ik = (S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) => {
  const d0 = T.clone().sub(S);
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d0.length()));
  const dir = d0.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
};

/** The body's capsules in the world (for the covers): torso, pelvis, thighs and shins (the knees exactly
 * where the Figure's IK puts them). */
export const bodyCapsules = (s: Sib, f: ReturnType<typeof lieFrame>, knees: number): Capsule[] => {
  const k = s.k;
  const w = (p: THREE.Vector3) => p.clone().applyQuaternion(f.q).add(f.pos);
  const hipY = 0.93 * k;
  const caps: Capsule[] = [
    { a: w(V(0, hipY - 0.02, 0.0)), b: w(V(0, hipY + 0.44 * k, 0.0)), r: 0.14 * k },
    { a: w(V(-0.1 * k, hipY - 0.05, 0)), b: w(V(0.1 * k, hipY - 0.05, 0)), r: 0.125 * k },
  ];
  for (const sd of [-1, 1]) {
    const hip = V(sd * 0.095 * k, hipY - 0.02, 0);
    const foot = footAt(k, sd, knees);
    const knee = ik(hip, foot, 0.45 * k, 0.43 * k, V(sd * 0.02, 0, -1));
    caps.push({ a: w(hip), b: w(knee), r: 0.085 * k });
    caps.push({ a: w(knee), b: w(foot), r: 0.07 * k });
    // the foot itself, pointing up out of the line of the leg
    caps.push({ a: w(foot), b: w(foot.clone().add(V(0, 0.03, -0.24 * k))), r: 0.075 * k });
  }
  return caps;
};

/** The ankles in the body frame: legs straight on the back (only just short of full length, so the knees
 * don't buckle up), drawn up with the knees forward when curled on the side. */
export const footAt = (k: number, sd: number, knees: number) => {
  const hipY = 0.93 * k - 0.02;
  const len = 0.865 * k;
  const a = knees * 1.1;
  return V(sd * 0.1 * k, hipY - len * Math.cos(a) * (1 - 0.15 * knees), -len * Math.sin(a) * 0.75);
};

/** A point just off the hair at a direction from the skull's centre (head space: the skull centre at the
 * origin, the face toward +z, the crown up), and a frame lying on the surface there. */
const onScalp = (sh: Sib["who"]["shape"], d: THREE.Vector3, off: number) => {
  const n = d.clone().normalize();
  const p = n.clone().multiplyScalar(skullR(sh, n) + off);
  const x = new THREE.Vector3().crossVectors(n, V(0, 0, 1));
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, n).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, z));
  return { p, q };
};

/** Things worn on the head: the haircut's cards, glasses, the clip, the cowlick. */
export const HeadBits: React.FC<{ s: Sib; t: number }> = ({ s, t }) => {
  const sh = s.who.shape;
  const clip = onScalp(sh, V(0.3, 0.86, -0.42), 0.016);
  const lick = onScalp(sh, V(-0.08, 0.72, -0.69), 0.008);
  return (
    <>
      {s.cut ? <CardHair sh={sh} cut={s.cut} color={s.cutColor ?? s.who.hair.color} params={{ t }} /> : null}
      {s.glasses ? <Glasses sh={sh} kind={s.glasses} color={s.glassesColor ?? "#222"} /> : null}
      {s.clip ? (
        // the yellow plastic clip at the crown, slightly off centre: it reads from above at every age
        <group position={clip.p} quaternion={clip.q}>
          <mesh rotation={[0, 0.5, 0]}>
            <capsuleGeometry args={[0.0055, 0.036, 4, 10]} />
            <meshPhysicalMaterial color="#F6C531" roughness={0.3} clearcoat={0.7} />
          </mesh>
        </group>
      ) : null}
      {s.cowlick ? (
        <group position={lick.p} quaternion={lick.q}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[((i % 3) - 1) * 0.006, 0.009, (Math.floor(i / 3) - 0.5) * 0.008]} rotation={[0.35 * ((i % 2) * 2 - 1), i * 1.1, 0.4 * ((i % 3) - 1)]}>
              <coneGeometry args={[0.0045, 0.026, 5]} />
              <meshStandardMaterial color={s.cutColor ?? s.who.hair.color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ) : null}
    </>
  );
};

/** Braids (or a ponytail) lying on the pillow, in head space (the face +z, the crown +y): from the sides
 * of the head down toward the shoulders and back against the pillow behind. */
export const lyingChains = (s: Sib): THREE.Vector3[][] | undefined => {
  const sh = s.who.shape;
  const style = s.who.hair.style;
  const chain = (root: THREE.Vector3, dir: THREE.Vector3, len: number, curl: THREE.Vector3) => {
    const pts: THREE.Vector3[] = [];
    const p = root.clone();
    const d = dir.clone().normalize();
    for (let i = 0; i < 8; i++) {
      pts.push(p.clone());
      p.addScaledVector(d, len / 7);
      d.add(curl.clone().multiplyScalar(0.12)).normalize();
    }
    return pts;
  };
  if (style === "pigtails")
    return [-1, 1].map((sd) =>
      chain(V(sd * sh.w * 0.88, -0.012, -sh.d * 0.45), V(sd * 0.35, -0.85, -0.45), 0.2 * (sh.kid ? 1 : 1.2), V(sd * 0.25, 0, -0.2)),
    );
  if (style === "pony") return [chain(V(0.01, sh.h * 0.35, -sh.d * 0.95), V(0.45, -0.6, -0.65), 0.24, V(0.3, -0.1, 0))];
  return undefined;
};

/** A person in bed. Returns the figure; use lieBody() for the covers and the pillow. */
export const lieBody = (s: Sib, side: -1 | 1, st: Lie) => {
  const { eye, rest } = headAt(s, side, st);
  let f = lieFrame(s, side, st, eye);
  // the near shoulder (and the upper arm round it) must clear the wall: slide the whole body away if not
  {
    const nearSd = side < 0 ? -1 : 1;
    const sh = V(nearSd * 0.168 * s.k, 1.374 * s.k, 0).applyQuaternion(f.q).add(f.pos);
    const need = WALL.half + 0.054 * s.k + 0.004;
    const short = need - side * sh.x;
    if (short > 0) {
      const d = V(side * short, 0, 0);
      eye.add(d);
      rest.at.add(d);
      f = lieFrame(s, side, st, eye);
    }
  }
  const knees = st.knees ?? Math.abs(st.roll) * 0.3;
  const caps = bodyCapsules(s, f, knees);
  return { f, eye, rest, caps, knees };
};

/** Keep an arm out of the wall: the Figure's IK (shoulder, elbow, wrist) and the hand beyond the wrist,
 * pushed back so every part stays on its own side of the wall's face. sd: the arm's side in the body (-1
 * left); room: which room the body is in (-1 Nora's); toWorld/dirToLocal: the body frame. */
export const clearOfWall = (a: Arm, sd: number, k: number, room: -1 | 1, toWorld: (p: THREE.Vector3) => THREE.Vector3, dirToLocal: (d: THREE.Vector3) => THREE.Vector3): Arm => {
  const S = V(sd * 0.168 * k, 1.374 * k, 0);
  const la = 0.3 * k;
  const lb = 0.27 * k;
  const pole = (a.pole ?? V(sd, -0.6, 0.6)).clone().normalize();
  const curl = a.hand ? a.hand.curl.reduce((x, y) => x + y, 0) / 4 : 0.3;
  const reach = (curl > 0.85 ? 0.1 : 0.175) * k;
  let at = a.at.clone();
  for (let it = 0; it < 4; it++) {
    const d0 = at.clone().sub(S);
    const d = Math.min(la + lb - 1e-3, Math.max(Math.abs(la - lb) + 1e-3, d0.length()));
    const dir = d0.normalize();
    const W = S.clone().addScaledVector(dir, d);
    const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, la * cosA).addScaledVector(perp, la * sinA);
    const fore = W.clone().sub(E).normalize();
    // the hand's frame as the Figure builds it: its width across (the thumb's side) and its palm normal
    const handY = fore.clone().negate();
    const pw = (a.palm ?? V(-sd, 0, 0)).clone();
    const handZ = pw.addScaledVector(handY, -pw.dot(handY)).normalize();
    const handX = new THREE.Vector3().crossVectors(handY, handZ);
    // points with their radii: the elbow, along the forearm, the wrist, the hand to the knuckles/fingertips,
    // its two edges (the thumb's and the little finger's)
    const mid = W.clone().addScaledVector(fore, reach * 0.5);
    const pts: [THREE.Vector3, number][] = [
      [E, 0.042 * k],
      [E.clone().lerp(W, 0.5), 0.036 * k],
      [W, 0.03 * k],
      [mid, 0.028 * k],
      [W.clone().addScaledVector(fore, reach), 0.02 * k],
      [mid.clone().addScaledVector(handX, 0.05 * k), 0.02 * k],
      [mid.clone().addScaledVector(handX, -0.05 * k), 0.02 * k],
      [mid.clone().addScaledVector(handZ, 0.03 * k), 0.015 * k],
      // the thumb, out from the heel of the hand on its own side (the Hand mirrors it for a left hand)
      [W.clone().addScaledVector(fore, 0.03 * k).addScaledVector(handX, sd * 0.07 * k), 0.016 * k],
      [W.clone().addScaledVector(fore, 0.05 * k).addScaledVector(handX, sd * 0.095 * k), 0.012 * k],
    ];
    let pen = 0;
    for (const [p, r] of pts) {
      const w = toWorld(p);
      // only near the wall's height (it's cut at 1.1 m; above it, nothing to hit)
      if (w.y > WALL.cut + r) continue;
      pen = Math.max(pen, WALL.half + r + 0.002 - room * w.x);
    }
    if (pen <= 1e-4) break;
    at = at.add(dirToLocal(V(room * pen, 0, 0)));
  }
  return { ...a, at };
};

export const LyingSib: React.FC<{ s: Sib; side: -1 | 1; st: Lie; t: number }> = ({ s, side, st, t }) => {
  const b = lieBody(s, side, st);
  const f = b.f;
  // the arm nearer the wall: Nora's left, your right (the body's -x is its left)
  const nearSide: "armL" | "armR" = side < 0 ? "armL" : "armR";
  const farSide: "armL" | "armR" = side < 0 ? "armR" : "armL";
  const one = (r: Reach): Arm => ({
    // (eye: an offset from the eyes, in world axes)
    at: r.body ? r.at.clone() : toBody(r.eye ? b.eye.clone().add(r.at) : r.at, f),
    hand: r.hand ?? RELAX,
    palm: r.palm ? (r.body ? r.palm.clone() : dirToBody(r.palm, f)) : undefined,
    pole: r.pole ? (r.body ? r.pole.clone() : dirToBody(r.pole, f)) : undefined,
  });
  const arm = (a: ArmSpec | null | undefined): Arm | undefined => {
    if (!a) return undefined;
    const r = one(a.rest);
    if (!a.to || (a.k ?? 1) <= 0) return r;
    const g = one(a.to);
    const k = Math.min(1, a.k ?? 1);
    const mix = (p?: THREE.Vector3, q?: THREE.Vector3) => (p && q ? p.clone().lerp(q, k).normalize() : (k > 0.5 ? q : p));
    const hand = k > 0.5 ? g.hand : r.hand;
    return { at: r.at.clone().lerp(g.at, k), hand, palm: mix(r.palm, g.palm), pole: mix(r.pole, g.pole) };
  };
  const pose: Pose = {
    e: { ...NEUTRAL, ...st.e },
    look: st.look ? toBody(st.look, f) : null,
    headYaw: st.headYaw,
    headPitch: st.headPitch,
    feet: [footAt(s.k, -1, b.knees), footAt(s.k, 1, b.knees)],
  };
  const toW = (p: THREE.Vector3) => p.clone().applyQuaternion(f.q).add(f.pos);
  const toL = (d: THREE.Vector3) => dirToBody(d, f);
  const clamp = (a: Arm | undefined, key: "armL" | "armR") => (a ? clearOfWall(a, key === "armL" ? -1 : 1, s.k, side, toW, toL) : undefined);
  const nearArm = clamp(arm(st.near), nearSide);
  const farArm = clamp(arm(st.far), farSide);
  if (nearArm) pose[nearSide] = nearArm;
  if (farArm) pose[farSide] = farArm;
  // Figure's look is a world point relative to its own `at`/yaw: we hand it body coordinates with at = 0
  return (
    <group position={f.pos} quaternion={f.q}>
      <Figure who={s.who} outfit={s.outfit} k={s.k} pose={pose} at={V(0, 0, 0)} yaw={0} t={t} hi headExtra={<HeadBits s={s} t={t} />} chains={lyingChains(s)} />
    </group>
  );
};

/** A knock: the knuckles of a loose fist on the wall's face beside the pillow (a small recoil after). */
export const knockReach = (side: -1 | 1, at: THREE.Vector3, recoil: number, fist = false): Reach => ({
  at: at.clone().add(V(-side * (0.018 + recoil * 0.012), 0, 0)),
  hand: fist ? { ...GRIP, curl: [1.4, 1.45, 1.45, 1.45] } : { ...GRIP, curl: [1.25, 1.35, 1.4, 1.4] },
  palm: V(0, -1, 0),
  pole: V(0, 0.4, 1),
});

export const wallFace = (side: -1 | 1) => side * WALL.half;
export { GRIP, RELAX };

/** A lying body as a posture (hips, orientation, feet in the world), for blending into getting up. */
export const lieToPosed = (s: Sib, side: -1 | 1, st: Lie) => {
  const b = lieBody(s, side, st);
  const w = (p: THREE.Vector3) => p.clone().applyQuaternion(b.f.q).add(b.f.pos);
  return {
    hip: w(V(0, 0.93 * s.k, 0)),
    q: b.f.q.clone(),
    feet: [w(footAt(s.k, -1, b.knees)), w(footAt(s.k, 1, b.knees))] as [THREE.Vector3, THREE.Vector3],
    nearSide: (side < 0 ? -1 : 1) as -1 | 1,
    near: st.near,
    far: st.far,
    e: st.e,
    look: st.look,
    headYaw: st.headYaw,
    headPitch: st.headPitch,
  };
};
