import React from "react";
import * as THREE from "three";
import { interpolate } from "remotion";
import { FLOAT_AT, T } from "./timeline";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const mats: Record<string, THREE.MeshStandardMaterial> = {};
const mat = (c: string, rough = 0.8) =>
  (mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
const SKIN = "#D9A37A";
const SLEEVE = "#8FA6C2";
const PANTS = "#4A5468";
const SHOE = "#EDEDED";

/** How far the arms are raised into view (0 hidden at the sides, 1 reaching forward). */
const armReach = (frame: number) => {
  let r = 0;
  for (const f of T.takeoffs) {
    const d = frame - f;
    if (d > -4 && d < 40) r = Math.max(r, interpolate(d, [-4, 4, 26, 40], [0, 0.55, 0.55, 0], CLAMP));
  }
  const fl = interpolate(
    frame,
    [FLOAT_AT - 4, FLOAT_AT + 30, 36 * 30, 38 * 30, 44 * 30, 49 * 30, 60 * 30, 64 * 30],
    [0, 1, 1, 0.45, 0.45, 0.9, 0.9, 1.1],
    CLAMP,
  );
  return Math.max(r, frame >= FLOAT_AT - 4 ? fl : 0);
};

const Hand: React.FC<{ side: number; spread: number; curl: number }> = ({ side, spread, curl }) => (
  <group>
    <mesh scale={[0.085, 0.03, 0.1]} material={mat(SKIN, 0.6)}>
      <sphereGeometry args={[1, 16, 12]} />
    </mesh>
    {[0, 1, 2, 3].map((k) => {
      const x = (k - 1.5) * 0.034 * side;
      const ang = (k - 1.5) * spread * 0.12 * side;
      return (
        <group key={k} position={[x, 0, -0.08]} rotation={[-curl * (0.6 + k * 0.05), ang, 0]}>
          <mesh position={[0, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
            <capsuleGeometry args={[0.012, k === 0 || k === 3 ? 0.045 : 0.06, 4, 8]} />
          </mesh>
        </group>
      );
    })}
    <group position={[0.07 * side, 0, -0.01]} rotation={[0, side * (0.7 + spread * 0.3), 0]}>
      <mesh position={[0, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
        <capsuleGeometry args={[0.014, 0.045, 4, 8]} />
      </mesh>
    </group>
  </group>
);

/** Both arms, in camera space: hidden at the sides, rising into frame on leaps, reaching out while floating. */
export const Arms: React.FC<{ frame: number }> = ({ frame }) => {
  const reach = armReach(frame);
  if (reach < 0.02) return null;
  const t = frame / 30;
  const drift = (k: number) => Math.sin(t * 0.9 + k) * 0.06 + Math.sin(t * 2.3 + k * 2) * 0.02;
  const flail = interpolate(t, [37.5, 39, 43, 45], [0, 1, 1, 0], CLAMP);
  return (
    <group>
      {[-1, 1].map((side) => {
        const lift = reach;
        const sh = new THREE.Vector3(side * 0.22, -0.32 + (1 - lift) * -0.25, 0.05);
        const pitch = -0.2 - lift * 1.0 + drift(side) + Math.sin(t * 7 + side) * 0.25 * flail;
        const yaw = side * (0.18 + lift * 0.12) + drift(side + 3) * 0.6;
        return (
          <group key={side} position={sh} rotation={[pitch, yaw, side * -0.15]}>
            {/* upper arm + sleeve */}
            <mesh position={[0, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
              <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
            </mesh>
            <group position={[0, 0, -0.34]} rotation={[0.35 - lift * 0.25 + drift(side + 7), 0, 0]}>
              <mesh position={[0, 0, -0.14]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
                <capsuleGeometry args={[0.042, 0.22, 6, 12]} />
              </mesh>
              {/* cuff */}
              <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
                <cylinderGeometry args={[0.058, 0.058, 0.05, 12]} />
              </mesh>
              <group position={[0, 0, -0.3]} rotation={[0.1 + drift(side + 9) * 0.5, 0, side * 0.2]}>
                <Hand
                  side={side}
                  spread={0.4 + lift * 0.6}
                  curl={0.6 - lift * 0.45 + Math.abs(drift(side + 11))}
                />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};

/** Legs and sneakers in yaw-only space below the eyes: you see them dangling when you look down while floating. */
export const Legs: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < FLOAT_AT - 10) return null;
  const t = frame / 30;
  const kick = (k: number) => Math.sin(t * 1.4 + k * 2.1) * 0.25 + Math.sin(t * 3.1 + k) * 0.08;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.12, -0.92, -0.04]}
          rotation={[kick(side) - 0.15, 0, side * 0.06]}
        >
          <mesh position={[0, -0.22, 0]} material={mat(PANTS, 0.95)}>
            <capsuleGeometry args={[0.075, 0.36, 6, 12]} />
          </mesh>
          <group position={[0, -0.46, 0]} rotation={[-Math.max(0, kick(side + 4)) * 0.9 - 0.1, 0, 0]}>
            <mesh position={[0, -0.2, 0]} material={mat(PANTS, 0.95)}>
              <capsuleGeometry args={[0.062, 0.34, 6, 12]} />
            </mesh>
            <mesh position={[0, -0.44, -0.06]} material={mat(SHOE, 0.5)}>
              <boxGeometry args={[0.11, 0.09, 0.27]} />
            </mesh>
            <mesh position={[0, -0.485, -0.06]} material={mat("#B23A3A", 0.6)}>
              <boxGeometry args={[0.115, 0.025, 0.275]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
};
