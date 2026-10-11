import React from "react";
import * as THREE from "three";
import { std } from "./mats";

/**
 * A googly eye: white disc under a clear dome, a black pupil rattling about inside, a glint on the dome,
 * and (optionally) an eyebrow. It turns to face `look` (a world point, usually you); the pupil sags under
 * gravity, stares at you, and swings after a knock (`jolt`: seconds since the last hit, or a large number).
 */
const white = () =>
  std(
    "googlyWhite",
    () =>
      new THREE.MeshStandardMaterial({
        color: "#FFFFFF",
        roughness: 0.42,
        emissive: "#FFFFFF",
        emissiveIntensity: 0.12,
      }),
  );
const pupilM = () =>
  std("googlyPupil", () => new THREE.MeshStandardMaterial({ color: "#040404", roughness: 0.3 }));
const dome = () =>
  std(
    "googlyDome",
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#FFFFFF",
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
      }),
  );
const rim = () =>
  std("googlyRim", () => new THREE.MeshStandardMaterial({ color: "#E4E4EA", roughness: 0.25 }));
const glint = () =>
  std(
    "googlyGlint",
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.2, 2.2, 2.2),
        toneMapped: false,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
  );
const browM = () =>
  std("googlyBrow", () => new THREE.MeshStandardMaterial({ color: "#120A16", roughness: 0.55 }));

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);

/** A rounded bar for eyebrows (a capsule squashed flat). */
const browGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    g = new THREE.CapsuleGeometry(0.5, 1.6, 4, 12);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 1, 0.6);
    return g;
  };
})();

export type Brow = {
  /** Tilt in radians: positive = angry (inner end down), negative = worried. */
  tilt: number;
  /** How far it lifts off the eye, in eye radii (raise on a hit for surprise). */
  lift?: number;
};

export const Googly: React.FC<{
  pos: [number, number, number];
  r: number;
  /** The eye's world position (its own position is `pos` in the parent's frame). */
  worldPos: THREE.Vector3;
  look: THREE.Vector3;
  jolt: number;
  seed: number;
  /** Pupil aimed at `look` rather than just sagging (0..1). */
  stare?: number;
  t: number;
  /** The parent's world rotation, so the eye can face `look` from inside a rotated group. */
  parentQ?: THREE.Quaternion;
  /** Which side of the face (-1 left, +1 right): mirrors the eyebrow. */
  side?: number;
  brow?: Brow;
  /** Pupil size as a fraction of the eye. */
  pupil?: number;
}> = ({ pos, r, worldPos, look, jolt, seed, stare = 0.6, t, parentQ, side = 1, brow, pupil = 0.44 }) => {
  // face the look point
  const dir = look.clone().sub(worldPos);
  if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
  dir.normalize();
  tmpM.lookAt(ORIGIN, dir.clone().negate(), UP);
  tmpQ.setFromRotationMatrix(tmpM);
  const q = parentQ ? parentQ.clone().invert().multiply(tmpQ) : tmpQ.clone();
  // pupil: sag down, a stare towards the viewer, and a damped rattle after a knock
  const swing = Math.exp(-jolt / 0.35) * Math.max(0, Math.min(1, jolt * 40));
  const ph = jolt * 26 + seed * 2.1;
  const px =
    (Math.sin(ph) * 0.45 + Math.sin(t * 1.3 + seed) * 0.06) * swing + Math.sin(t * 0.7 + seed * 1.7) * 0.05;
  const py = -0.3 * (1 - stare) + Math.cos(ph * 0.83) * 0.45 * swing;
  const pr = r * pupil;
  const off = r - pr - r * 0.07;
  const lift = brow ? (brow.lift ?? 0) : 0;
  return (
    <group position={pos} quaternion={q}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rim()}>
        <cylinderGeometry args={[r * 1.06, r * 1.06, r * 0.16, 32]} />
      </mesh>
      <mesh position={[0, 0, r * 0.085]} material={white()}>
        <circleGeometry args={[r, 40]} />
      </mesh>
      <mesh position={[px * off, py * off, r * 0.1]} material={pupilM()}>
        <circleGeometry args={[pr, 32]} />
      </mesh>
      <mesh position={[0, 0, r * 0.08]} scale={[1, 1, 0.42]} material={dome()}>
        <sphereGeometry args={[r * 1.03, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* the glint on the dome */}
      <mesh
        position={[-r * 0.36, r * 0.42, r * 0.44]}
        rotation={[0, 0, 0.6]}
        scale={[1, 0.62, 1]}
        material={glint()}
      >
        <circleGeometry args={[r * 0.15, 16]} />
      </mesh>
      <mesh position={[r * 0.3, -r * 0.42, r * 0.4]} material={glint()} scale={[0.5, 0.5, 1]}>
        <circleGeometry args={[r * 0.08, 10]} />
      </mesh>
      {/* the eyebrow comes down over the top of the eye like a lid: dark on white, it reads anywhere */}
      {brow ? (
        <group position={[0, r * (0.8 + lift), r * 0.28]} rotation={[0, 0, -side * brow.tilt]}>
          <mesh scale={[r * 0.8, r * 0.5, r * 0.3]} geometry={browGeo()} material={browM()} />
        </group>
      ) : null}
    </group>
  );
};
