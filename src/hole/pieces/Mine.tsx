import React, { useMemo } from "react";
import * as THREE from "three";
import { HX, HZ } from "../timeline";
import { clipOutsideShaft, glowMat, std } from "../mats";

/**
 * 4 km down: the deepest mine. Five levels of galleries open off the east side of the shaft, 6.5 m apart:
 * timber sets, rails, a string of bulbs, an ore cart. At your speed they flash past one after another.
 */

export const MINE_LEVELS = [-2, -1, 0, 1, 2];
export const LEVEL_DY = 6.5;
const LEN = 42;
const WID = 3.8;
const HGT = 3.1;

const Gallery: React.FC<{ y: number; k: number; rock: THREE.Material }> = ({ y, k, rock }) => (
  <group position={[HX + 3.0 + LEN / 2, y, HZ]}>
    <mesh material={rock}>
      <boxGeometry args={[LEN, HGT, WID]} />
    </mesh>
    {/* timber sets: two posts and a cap */}
    {Array.from({ length: 16 }).map((_, i) => {
      const x = -LEN / 2 + 2.2 + i * 2.5;
      return (
        <group key={i} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, -0.1, s * 1.68]} material={std("#6B4A2B", { roughness: 0.9 })}>
              <boxGeometry args={[0.2, HGT - 0.3, 0.2]} />
            </mesh>
          ))}
          <mesh position={[0, HGT / 2 - 0.22, 0]} material={std("#5E4126", { roughness: 0.9 })}>
            <boxGeometry args={[0.24, 0.24, WID - 0.1]} />
          </mesh>
        </group>
      );
    })}
    {/* bulbs on a cable along the cap line */}
    <mesh position={[0, HGT / 2 - 0.36, 0.5]} material={std("#151515")}>
      <boxGeometry args={[LEN, 0.02, 0.02]} />
    </mesh>
    {Array.from({ length: 13 }).map((_, i) => (
      <mesh key={i} position={[-LEN / 2 + 1.2 + i * 3.1, HGT / 2 - 0.5, 0.5]} material={glowMat("#FFC77A", 7)}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
    ))}
    {/* rails and sleepers */}
    {[-0.45, 0.45].map((z) => (
      <mesh key={z} position={[0, -HGT / 2 + 0.12, z]} material={std("#9A958C", { metalness: 0.7, roughness: 0.35 })}>
        <boxGeometry args={[LEN, 0.08, 0.06]} />
      </mesh>
    ))}
    {Array.from({ length: 40 }).map((_, i) => (
      <mesh key={i} position={[-LEN / 2 + 0.5 + i * 1.05, -HGT / 2 + 0.05, 0]} material={std("#4A3624")}>
        <boxGeometry args={[0.18, 0.08, 1.3]} />
      </mesh>
    ))}
    {/* an ore cart on two of the levels */}
    {k === 0 || k === -2 ? (
      <group position={[-LEN / 2 + 6 + (k === 0 ? 0 : 5), -HGT / 2 + 0.75, 0]}>
        <mesh material={std("#6E3B22", { metalness: 0.5, roughness: 0.6 })}>
          <boxGeometry args={[1.6, 0.9, 1.1]} />
        </mesh>
        <mesh position={[0, 0.42, 0]} material={std("#4E4A46", { roughness: 0.95, flatShading: true })}>
          <icosahedronGeometry args={[0.62, 1]} />
        </mesh>
      </group>
    ) : null}
  </group>
);

export const Mine: React.FC<{ y: number }> = ({ y }) => {
  const rock = useMemo(
    () =>
      clipOutsideShaft(
        new THREE.MeshStandardMaterial({ color: "#4A4038", roughness: 0.95, side: THREE.BackSide }),
      ),
    [],
  );
  return (
    <group>
      {MINE_LEVELS.map((k) => (
        <Gallery key={k} y={y - k * LEVEL_DY} k={k} rock={rock} />
      ))}
    </group>
  );
};
