import React, { useMemo } from "react";
import * as THREE from "three";
import { HR, HX, HZ } from "../timeline";
import { std } from "../mats";

/**
 * A dinosaur skeleton bedded in the strata on the west wall, half out of the rock: bones are modelled in a
 * flat 2D layout (s along the wall, v up), then wrapped onto the cylinder just behind the wall surface so
 * only what stands proud of the rock shows.
 */

type Bone = { s: number; v: number; len: number; r: number; ang: number; kind: "cap" | "ell" | "rib" };

const BONE = "#D8C7A0";
const BONE_DARK = "#A88F68";

/** The skeleton in wall units (metres): a theropod about 7 m long, lying left to right, head on the left. */
const SKELETON: Bone[] = (() => {
  const b: Bone[] = [];
  // skull: cranium, snout, jaw
  b.push({ s: -3.25, v: 0.42, len: 0.55, r: 0.24, ang: -0.1, kind: "ell" });
  b.push({ s: -3.75, v: 0.36, len: 0.55, r: 0.15, ang: -0.18, kind: "ell" });
  b.push({ s: -3.5, v: 0.17, len: 0.85, r: 0.07, ang: -0.12, kind: "cap" });
  // neck, curving up into the skull
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    b.push({ s: -2.9 + u * 0.75, v: 0.35 - Math.sin(u * 2.4) * 0.22, len: 0.16, r: 0.09, ang: 0.4, kind: "ell" });
  }
  // back: vertebrae with spines
  for (let i = 0; i < 11; i++) {
    const s = -2.05 + i * 0.25;
    const v = 0.08 + Math.sin(i * 0.3) * 0.05;
    b.push({ s, v, len: 0.12, r: 0.1, ang: 0, kind: "ell" });
    b.push({ s, v: v + 0.18, len: 0.2, r: 0.025, ang: Math.PI / 2 - 0.15, kind: "cap" });
  }
  // ribs hanging from the back
  for (let i = 0; i < 9; i++) {
    const s = -1.9 + i * 0.22;
    const L = 0.55 + Math.sin((i / 8) * Math.PI) * 0.35;
    b.push({ s, v: 0.04, len: L, r: 0.028, ang: -Math.PI / 2 - 0.35, kind: "rib" });
  }
  // pelvis and the hind leg (femur, shin, foot, toes)
  b.push({ s: 0.75, v: 0.0, len: 0.55, r: 0.17, ang: 0.15, kind: "ell" });
  b.push({ s: 0.62, v: -0.45, len: 0.9, r: 0.075, ang: -Math.PI / 2 + 0.45, kind: "cap" });
  b.push({ s: 0.62, v: -1.2, len: 0.85, r: 0.06, ang: -Math.PI / 2 - 0.35, kind: "cap" });
  b.push({ s: 0.85, v: -1.72, len: 0.45, r: 0.045, ang: -Math.PI / 2 + 0.6, kind: "cap" });
  for (const a of [-0.3, 0, 0.35]) b.push({ s: 1.07, v: -1.95, len: 0.3, r: 0.03, ang: a, kind: "cap" });
  // the other leg, further back in the rock
  b.push({ s: 0.95, v: -0.5, len: 0.85, r: 0.065, ang: -Math.PI / 2 + 0.15, kind: "cap" });
  b.push({ s: 1.1, v: -1.2, len: 0.75, r: 0.05, ang: -Math.PI / 2 - 0.1, kind: "cap" });
  // the little arms
  b.push({ s: -1.75, v: -0.35, len: 0.32, r: 0.03, ang: -1.0, kind: "cap" });
  b.push({ s: -1.55, v: -0.5, len: 0.22, r: 0.025, ang: -0.3, kind: "cap" });
  // tail, tapering and curling
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const s = 1.1 + u * 3.1;
    const v = 0.05 - u * 0.35 + Math.sin(u * 3.2) * 0.25;
    b.push({ s, v, len: 0.13 - u * 0.05, r: 0.09 - u * 0.06, ang: -0.2, kind: "ell" });
  }
  return b;
})();

const SCALE = 1.35;

export const Fossil: React.FC<{ y: number; th: number }> = ({ y, th }) => {
  const parts = useMemo(() => {
    const cap = new THREE.CapsuleGeometry(1, 2, 4, 10); // 4 long, radius 1: scaled to the bone
    const ell = new THREE.SphereGeometry(1, 16, 12);
    const rib = new THREE.TorusGeometry(1, 0.055, 6, 20, 1.7);
    return SKELETON.map((bone0, i) => {
      let bone = bone0;
      // wrap the flat layout onto the wall: angle from s, height from v, a hair behind the surface
      const bs = { ...bone, s: bone.s * SCALE, v: bone.v * SCALE, len: bone.len * SCALE, r: bone.r * SCALE };
      bone = bs;
      const a = th + bone.s / HR;
      const dr = bone.kind === "rib" ? 0.0 : bone.r * 0.45;
      const pos = new THREE.Vector3(HX + Math.sin(a) * (HR + dr), y + bone.v, HZ + Math.cos(a) * (HR + dr));
      // local frame: x along the wall (tangent), y up, z out of the rock (toward the axis)
      const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const inward = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
      const basis = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 1, 0), inward);
      const q = new THREE.Quaternion().setFromRotationMatrix(basis);
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bone.ang);
      q.multiply(spin);
      let geo: THREE.BufferGeometry;
      let scale: THREE.Vector3;
      if (bone.kind === "cap") {
        // capsule along its local y: turn so the bone runs along local x (then spun by ang)
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2));
        geo = cap;
        scale = new THREE.Vector3(bone.r, bone.len / 4, bone.r);
        pos.addScaledVector(
          new THREE.Vector3(Math.cos(bone.ang), Math.sin(bone.ang), 0).applyMatrix4(basis),
          bone.len / 2,
        );
      } else if (bone.kind === "ell") {
        geo = ell;
        scale = new THREE.Vector3(bone.len, bone.r, bone.r * 0.8);
      } else {
        // a rib: an arc starting at its vertebra and sweeping forward and down
        geo = rib;
        const R = bone.len * 0.7;
        q.copy(new THREE.Quaternion().setFromRotationMatrix(basis)).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
        );
        pos.addScaledVector(new THREE.Vector3(0, -R, 0), 1);
        scale = new THREE.Vector3(R, R, R);
      }
      return { geo, pos, q, scale, dark: i % 7 === 3 };
    });
  }, [y, th]);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geo}
          position={p.pos}
          quaternion={p.q}
          scale={p.scale}
          material={std(p.dark ? BONE_DARK : BONE, { roughness: 0.85 })}
        />
      ))}
    </group>
  );
};
