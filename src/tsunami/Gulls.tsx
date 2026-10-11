import React, { useMemo } from "react";
import * as THREE from "three";
import { rng } from "./world";

/**
 * Seagulls wheeling over the shallows, gliding with the odd lazy flap; as the white line shows on the
 * horizon they all turn at once and beat it inland, straight over your head.
 */

type GullSpec = {
  cx: number;
  cz: number;
  h: number;
  r: number;
  w: number;
  ph: number;
  flee: number;
  seed: number;
  drift: number;
};
const GULLS: GullSpec[] = (() => {
  const R = rng(5150);
  return Array.from({ length: 16 }).map((_, k) => ({
    cx: (R() * 2 - 1) * 16,
    cz: -9 - R() * 22,
    h: 6 + R() * 11,
    r: 5 + R() * 9,
    w: (R() > 0.5 ? 1 : -1) * (0.28 + R() * 0.2),
    ph: R() * Math.PI * 2,
    flee: 9.25 + R() * 0.7,
    seed: k,
    drift: (R() * 2 - 1) * 2.5,
  }));
})();

const circling = (g: GullSpec, u: number) => {
  const a = g.ph + g.w * u;
  return {
    p: new THREE.Vector3(
      g.cx + Math.cos(a) * g.r,
      g.h + Math.sin(u * 0.7 + g.seed) * 0.6,
      g.cz + Math.sin(a) * g.r,
    ),
    v: new THREE.Vector3(
      -Math.sin(a) * g.r * g.w,
      Math.cos(u * 0.7 + g.seed) * 0.42,
      Math.cos(a) * g.r * g.w,
    ),
  };
};

/** Where a gull is and which way it's flying: circling, then turning hard and flying for the hills. */
const gullAt = (g: GullSpec, u: number) => {
  if (u <= g.flee) return { ...circling(g, u), flap: 0 };
  const c = circling(g, g.flee);
  const p = c.p.clone();
  const v = c.v.clone();
  const goal = new THREE.Vector3(g.drift, 2.2, 12.5);
  const dt = 1 / 60;
  for (let t = g.flee; t < u; t += dt) {
    // steer toward the flight inland, hard at first
    v.lerp(goal, Math.min(1, dt * 2.4));
    p.addScaledVector(v, dt);
  }
  return { p, v, flap: Math.min(1, (u - g.flee) / 0.4) };
};

const wingGeo = () => {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const grey = new THREE.Color("#A3ADB5");
  const tip = new THREE.Color("#1C1C1E");
  const N = 6;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const x = 0.04 + t * 0.66;
    const front = 0.06 - 0.04 * t * t;
    const back = -0.12 + 0.07 * t;
    pos.push(x, 0, front, x, 0, back);
    const c = grey.clone().lerp(tip, t > 0.72 ? 1 : 0);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let k = 0; k < N; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

export const Gulls: React.FC<{ u: number }> = ({ u }) => {
  const parts = useMemo(
    () => ({
      wing: wingGeo(),
      wingMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
      white: new THREE.MeshStandardMaterial({ color: "#F4F4F2", roughness: 0.8 }),
      beak: new THREE.MeshStandardMaterial({ color: "#F2B705", roughness: 0.5 }),
    }),
    [],
  );
  return (
    <group>
      {GULLS.map((g) => {
        const s = gullAt(g, u);
        if (s.p.z > 120) return null;
        const heading = Math.atan2(s.v.x, s.v.z);
        const climb = Math.atan2(s.v.y, Math.hypot(s.v.x, s.v.z));
        // gliding with an occasional lazy flap; flapping hard once they flee
        const lazy = Math.max(0, Math.sin(u * 0.9 + g.seed * 1.7)) ** 6;
        const amp = 0.12 + 0.5 * lazy + 0.55 * s.flap;
        const flap = Math.sin(u * (9 + 7 * s.flap) + g.seed) * amp;
        const bank = -g.w * 0.6 * (1 - s.flap);
        return (
          <group key={g.seed} position={s.p} rotation={[0, heading, 0]}>
            <group rotation={[-climb, 0, bank]} scale={1.15}>
              <mesh scale={[0.085, 0.075, 0.23]} material={parts.white} castShadow>
                <sphereGeometry args={[1, 12, 8]} />
              </mesh>
              <mesh position={[0, 0.045, 0.2]} material={parts.white}>
                <sphereGeometry args={[0.062, 10, 8]} />
              </mesh>
              <mesh position={[0, 0.035, 0.285]} rotation={[Math.PI / 2, 0, 0]} material={parts.beak}>
                <coneGeometry args={[0.014, 0.06, 6]} />
              </mesh>
              <mesh position={[0, 0.01, -0.25]} scale={[0.06, 0.012, 0.09]} material={parts.wingMat}>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
              {[-1, 1].map((side) => (
                <group
                  key={side}
                  position={[side * 0.05, 0.03, 0.03]}
                  rotation={[0, 0, side * flap]}
                  scale={[side, 1, 1]}
                >
                  <mesh geometry={parts.wing} material={parts.wingMat} castShadow />
                </group>
              ))}
            </group>
          </group>
        );
      })}
    </group>
  );
};
