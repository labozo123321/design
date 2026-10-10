import React, { useMemo } from "react";
import * as THREE from "three";
import { HX, HZ } from "../timeline";
import { clipOutsideShaft, hot } from "../mats";

/**
 * 4 km down: the deepest mine. Five levels of galleries open off the east side of the shaft, 6.5 m apart:
 * timber sets, rails, a string of bulbs, an ore cart. At your speed they flash past one after another.
 * Each gallery starts inside the shaft's radius so its mouth meets the cut in the wall; every part of it is
 * clipped there, so nothing pokes out into the shaft.
 */

export const MINE_LEVELS = [-2, -1, 0, 1, 2];
export const LEVEL_DY = 6.5;
const LEN = 42;
const WID = 3.8;
const HGT = 3.1;

type Mats = Record<
  "rock" | "timber" | "cap" | "cable" | "bulb" | "rail" | "sleeper" | "cart" | "ore",
  THREE.Material
>;

const Gallery: React.FC<{ y: number; k: number; m: Mats }> = ({ y, k, m }) => (
  <group position={[HX + 3.0 + LEN / 2, y, HZ]}>
    <mesh material={m.rock}>
      <boxGeometry args={[LEN, HGT, WID]} />
    </mesh>
    {/* timber sets: two posts and a cap */}
    {Array.from({ length: 16 }).map((_, i) => {
      const x = -LEN / 2 + 2.2 + i * 2.5;
      return (
        <group key={i} position={[x, 0, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, -0.1, s * 1.68]} material={m.timber}>
              <boxGeometry args={[0.2, HGT - 0.3, 0.2]} />
            </mesh>
          ))}
          <mesh position={[0, HGT / 2 - 0.22, 0]} material={m.cap}>
            <boxGeometry args={[0.24, 0.24, WID - 0.1]} />
          </mesh>
        </group>
      );
    })}
    {/* bulbs on a cable along the cap line */}
    <mesh position={[0, HGT / 2 - 0.36, 0.5]} material={m.cable}>
      <boxGeometry args={[LEN, 0.02, 0.02]} />
    </mesh>
    {Array.from({ length: 13 }).map((_, i) => (
      <mesh key={i} position={[-LEN / 2 + 1.9 + i * 3.1, HGT / 2 - 0.5, 0.5]} material={m.bulb}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
    ))}
    {/* rails and sleepers */}
    {[-0.45, 0.45].map((z) => (
      <mesh key={z} position={[0, -HGT / 2 + 0.12, z]} material={m.rail}>
        <boxGeometry args={[LEN, 0.08, 0.06]} />
      </mesh>
    ))}
    {Array.from({ length: 40 }).map((_, i) => (
      <mesh key={i} position={[-LEN / 2 + 0.5 + i * 1.05, -HGT / 2 + 0.05, 0]} material={m.sleeper}>
        <boxGeometry args={[0.18, 0.08, 1.3]} />
      </mesh>
    ))}
    {/* an ore cart on two of the levels */}
    {k === 0 || k === -2 ? (
      <group position={[-LEN / 2 + 6 + (k === 0 ? 0 : 5), -HGT / 2 + 0.75, 0]}>
        <mesh material={m.cart}>
          <boxGeometry args={[1.6, 0.9, 1.1]} />
        </mesh>
        <mesh position={[0, 0.42, 0]} material={m.ore}>
          <icosahedronGeometry args={[0.62, 1]} />
        </mesh>
      </group>
    ) : null}
  </group>
);

export const Mine: React.FC<{ y: number }> = ({ y }) => {
  const m = useMemo<Mats>(() => {
    const s = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      clipOutsideShaft(new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o }));
    return {
      rock: s("#4A4038", { roughness: 0.95, side: THREE.BackSide }),
      timber: s("#6B4A2B"),
      cap: s("#5E4126"),
      cable: s("#151515"),
      bulb: clipOutsideShaft(new THREE.MeshBasicMaterial({ color: hot("#FFC77A", 7) })),
      rail: s("#9A958C", { metalness: 0.7, roughness: 0.35 }),
      sleeper: s("#4A3624"),
      cart: s("#6E3B22", { metalness: 0.5, roughness: 0.6 }),
      ore: s("#4E4A46", { roughness: 0.95, flatShading: true }),
    };
  }, []);
  return (
    <group>
      {MINE_LEVELS.map((k) => (
        <Gallery key={k} y={y - k * LEVEL_DY} k={k} m={m} />
      ))}
    </group>
  );
};
