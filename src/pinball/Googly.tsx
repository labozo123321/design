import React from "react";
import * as THREE from "three";
import { std } from "./mats";

/**
 * A googly eye: white disc under a clear dome, a black pupil rattling about inside. It faces `look` (a
 * world point, usually you), the pupil sags under gravity and swings after a knock (`jolt`: seconds since
 * the last hit, or a large number).
 */
const white = () => std("googlyWhite", () => new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 0.35 }));
const pupilM = () => std("googlyPupil", () => new THREE.MeshStandardMaterial({ color: "#050505", roughness: 0.4 }));
const dome = () =>
  std(
    "googlyDome",
    () =>
      new THREE.MeshStandardMaterial({
        color: "#FFFFFF",
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
  );
const rim = () => std("googlyRim", () => new THREE.MeshStandardMaterial({ color: "#D8D8DE", roughness: 0.3 }));

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const Googly: React.FC<{
  pos: [number, number, number];
  r: number;
  /** World point the eye turns to face (its own position is `pos` in the parent's frame: pass worldPos). */
  worldPos: THREE.Vector3;
  look: THREE.Vector3;
  jolt: number;
  seed: number;
  /** Pupil aimed at `look` rather than just sagging (0..1). */
  stare?: number;
  t: number;
}> = ({ pos, r, worldPos, look, jolt, seed, stare = 0.6, t }) => {
  // face the look point (with a little lag-free wobble)
  const dir = look.clone().sub(worldPos);
  if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
  dir.normalize();
  tmpM.lookAt(new THREE.Vector3(0, 0, 0), dir.clone().negate(), UP);
  tmpQ.setFromRotationMatrix(tmpM);
  // pupil: sag down, a stare towards the viewer, and a damped rattle after a knock
  const swing = Math.exp(-jolt / 0.35) * Math.max(0, Math.min(1, jolt * 40));
  const ph = jolt * 26 + seed * 2.1;
  const px = (Math.sin(ph) * 0.45 + Math.sin(t * 1.3 + seed) * 0.05) * swing;
  const py = -0.28 * (1 - stare) + Math.cos(ph * 0.83) * 0.45 * swing;
  const pr = r * 0.48;
  const off = r - pr - r * 0.08;
  return (
    <group position={pos} quaternion={tmpQ.clone()}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rim()}>
        <cylinderGeometry args={[r * 1.04, r * 1.04, r * 0.12, 28]} />
      </mesh>
      <mesh position={[0, 0, r * 0.065]} material={white()}>
        <circleGeometry args={[r, 32]} />
      </mesh>
      <mesh position={[px * off, py * off, r * 0.08]} material={pupilM()}>
        <circleGeometry args={[pr, 24]} />
      </mesh>
      <mesh position={[0, 0, r * 0.06]} scale={[1, 1, 0.45]} material={dome()}>
        <sphereGeometry args={[r * 1.02, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
};
