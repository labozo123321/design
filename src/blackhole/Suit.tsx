import React from "react";
import * as THREE from "three";
import { interpolate } from "remotion";

/**
 * Your spacesuit's arms, in camera space: they come up from the bottom corners in the last seconds,
 * reaching for the centre as the tides stretch them out ahead of you.
 */

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const mats: Record<string, THREE.MeshStandardMaterial> = {};
const mat = (c: string, rough = 0.85, metal = 0) =>
  (mats[`${c}:${rough}:${metal}`] ??= new THREE.MeshStandardMaterial({
    color: c,
    roughness: rough,
    metalness: metal,
  }));
const FABRIC = "#ECEAE4";
const GRIP = "#55575E";
const SEAM = "#9A9CA3";
const RING = "#3E6FD0";

/** How far each glove is raised into view (0 down out of sight, 1 out in front). */
export const reachAt = (t: number) => interpolate(t, [60.8, 62.0, 66.0], [0, 1, 1], CLAMP);

/** A gloved finger: two padded segments with a seam at the knuckle and a rubber tip (sizes in metres). */
const Finger: React.FC<{ len: number; curl: number; r: number }> = ({ len, curl, r }) => (
  <group rotation={[-curl * 0.5, 0, 0]}>
    <mesh position={[0, 0, -len * 0.5]} rotation={[Math.PI / 2, 0, 0]} material={mat(FABRIC)}>
      <capsuleGeometry args={[r, len * 0.62, 8, 20]} />
    </mesh>
    <mesh position={[0, 0, -len * 0.97]} rotation={[Math.PI / 2, 0, 0]} material={mat(SEAM, 0.7)}>
      <torusGeometry args={[r * 1.0, r * 0.14, 8, 20]} />
    </mesh>
    <group position={[0, 0, -len]} rotation={[-curl * 0.65, 0, 0]}>
      <mesh position={[0, 0, -len * 0.42]} rotation={[Math.PI / 2, 0, 0]} material={mat(FABRIC)}>
        <capsuleGeometry args={[r * 0.95, len * 0.5, 8, 20]} />
      </mesh>
      <mesh
        position={[0, -r * 0.2, -len * 0.7]}
        scale={[r * 1.0, r * 0.85, r * 1.3]}
        material={mat(GRIP, 0.55)}
      >
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
    </group>
  </group>
);

/** The glove itself, about the size of a real gloved hand (11 cm across the palm). */
const Glove: React.FC<{ side: number; curl: number; spread: number }> = ({ side, curl, spread }) => (
  <group>
    <mesh scale={[0.052, 0.022, 0.058]} material={mat(FABRIC)}>
      <sphereGeometry args={[1, 48, 32]} />
    </mesh>
    {/* palm grip underneath, padded back */}
    <mesh position={[0, -0.009, -0.004]} scale={[0.047, 0.016, 0.052]} material={mat(GRIP, 0.6)}>
      <sphereGeometry args={[1, 40, 24]} />
    </mesh>
    <mesh position={[0, 0.013, 0.004]} scale={[0.04, 0.011, 0.042]} material={mat("#DCD9D1", 0.82)}>
      <sphereGeometry args={[1, 36, 20]} />
    </mesh>
    {/* knuckle restraint */}
    <mesh position={[0, 0.008, -0.046]} rotation={[0, 0, Math.PI / 2]} material={mat(SEAM, 0.6)}>
      <capsuleGeometry args={[0.0075, 0.072, 8, 16]} />
    </mesh>
    {[0, 1, 2, 3].map((k) => {
      const x = (k - 1.5) * 0.0225 * side;
      const ang = (k - 1.5) * spread * 0.09 * side;
      const len = k === 0 || k === 3 ? 0.03 : 0.036;
      return (
        <group key={k} position={[x, 0.002, -0.05]} rotation={[0, ang, 0]}>
          <Finger len={len} curl={curl * (0.85 + k * 0.07)} r={0.0105} />
        </group>
      );
    })}
    <group
      position={[0.047 * side, -0.004, -0.006]}
      rotation={[0.2, side * (0.85 + spread * 0.2), side * 0.35]}
    >
      <Finger len={0.028} curl={curl * 0.5} r={0.0115} />
    </group>
  </group>
);

/** One arm: padded sleeve, the ribbed wrist joint, the blue wrist bearing, the gauntlet and the glove. */
const Arm: React.FC<{ side: number; t: number; reach: number; shake: number; stretch: number }> = ({
  side,
  t,
  reach,
  shake,
  stretch,
}) => {
  const wob = (k: number) =>
    shake * (Math.sin(t * 37 + k * 1.9) * 0.6 + Math.sin(t * 59 + k * 2.7) * 0.4) +
    0.03 * Math.sin(t * 0.9 + k) +
    0.015 * Math.sin(t * 2.1 + k * 2);
  const sh = new THREE.Vector3(side * 0.23, -0.27 - (1 - reach) * 0.14, 0.1);
  const pitch = -1.45 + reach * 1.5 + wob(side);
  const yaw = side * (0.2 * reach) + wob(side + 4) * 0.5;
  // spaghettification: the forearm and hand stretch out ahead of you
  const sz = 1 + stretch * 2.4;
  const sxy = 1 / Math.sqrt(sz);
  return (
    <group position={sh} rotation={[pitch, yaw, side * -0.25 * reach]}>
      <mesh position={[0, 0, -0.14]} rotation={[Math.PI / 2, 0, 0]} material={mat(FABRIC, 0.9)}>
        <capsuleGeometry args={[0.06, 0.2, 10, 32]} />
      </mesh>
      <group position={[0, 0, -0.3]} rotation={[0.14 + wob(side + 8) * 0.5, 0, 0]} scale={[sxy, sxy, sz]}>
        <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]} material={mat(FABRIC, 0.9)}>
          <cylinderGeometry args={[0.05, 0.057, 0.17, 32]} />
        </mesh>
        {[0, 1, 2].map((k) => (
          <mesh
            key={k}
            position={[0, 0, -0.02 - k * 0.04]}
            rotation={[Math.PI / 2, 0, 0]}
            material={mat(FABRIC, 0.9)}
          >
            <torusGeometry args={[0.055 - k * 0.002, 0.009, 10, 36]} />
          </mesh>
        ))}
        {/* wrist bearing */}
        <mesh position={[0, 0, -0.178]} rotation={[Math.PI / 2, 0, 0]} material={mat(RING, 0.35, 0.6)}>
          <cylinderGeometry args={[0.049, 0.049, 0.026, 36]} />
        </mesh>
        <mesh position={[0, 0, -0.195]} rotation={[Math.PI / 2, 0, 0]} material={mat("#C9CED6", 0.3, 0.8)}>
          <cylinderGeometry args={[0.046, 0.046, 0.009, 36]} />
        </mesh>
        {/* gauntlet */}
        <mesh position={[0, 0, -0.225]} rotation={[Math.PI / 2, 0, 0]} material={mat(FABRIC)}>
          <cylinderGeometry args={[0.041, 0.047, 0.05, 32]} />
        </mesh>
        <group position={[0, 0, -0.29]} rotation={[0.06 + wob(side + 11) * 0.4, 0, side * 0.1]}>
          <Glove side={side} spread={0.5 + 0.3 * reach} curl={0.25 + Math.abs(wob(side + 13)) * 2} />
        </group>
      </group>
    </group>
  );
};

export type SuitLight = {
  dir: THREE.Vector3;
  color: THREE.Color;
  /** A second light, from the other side (the lensed glow above the hole, or the gas below). */
  dir2: THREE.Vector3;
  color2: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
};

/** Both arms, plus the lights that fall on them (in camera space: the disk's glow, the dot of sky). */
export const Suit: React.FC<{
  t: number;
  quat: THREE.Quaternion;
  shake: number;
  stretch: number;
  light: SuitLight;
}> = ({ t, quat, shake, stretch, light }) => {
  const reach = reachAt(t);
  if (reach < 0.01) return null;
  return (
    <group quaternion={quat}>
      <directionalLight position={light.dir.clone().multiplyScalar(4)} color={light.color} intensity={1} />
      <directionalLight position={light.dir2.clone().multiplyScalar(4)} color={light.color2} intensity={1} />
      <hemisphereLight args={[light.sky, light.ground, 1]} />
      {[-1, 1].map((side) => (
        <Arm key={side} side={side} t={t} reach={reach} shake={shake} stretch={stretch} />
      ))}
    </group>
  );
};
