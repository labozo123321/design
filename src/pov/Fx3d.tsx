import React from "react";
import * as THREE from "three";
import { interpolate, random } from "remotion";
import { glow } from "./Sky";
import { T, UPDRAFT_AT } from "./timeline";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const mats: Record<string, THREE.Material> = {};
const std = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  (mats[c + JSON.stringify(o)] ??= new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.7,
    flatShading: true,
    ...o,
  }));

/** Golden dust motes drifting in the sunbeams around the viewer (ground phase). */
export const Motes: React.FC<{ cam: THREE.Vector3; t: number; o: number }> = ({ cam, t, o }) => {
  if (o <= 0.01) return null;
  const B = 14;
  return (
    <group>
      {Array.from({ length: 70 }).map((_, i) => {
        const r = (k: string) => random(`mo${i}${k}`);
        const wrap = (v: number, c: number) => c + ((((v - c) % B) + B * 1.5) % B) - B / 2;
        const x = wrap(r("x") * 200 + Math.sin(t * 0.3 + i) * 0.6, cam.x);
        const y = cam.y - 1 + ((r("y") * 4 + t * 0.05 * (r("v") - 0.3)) % 4);
        const z = wrap(r("z") * 200 + Math.cos(t * 0.25 + i) * 0.6, cam.z);
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        return (
          <sprite key={i} position={[x, y, z]} scale={[0.05, 0.05, 1]}>
            <spriteMaterial
              map={glow()}
              color="#FFE2A8"
              transparent
              opacity={o * tw * 0.8}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        );
      })}
    </group>
  );
};

/** Dust kicked up by each landing, around the feet. */
export const LandingDust: React.FC<{ frame: number; cam: THREE.Vector3; yaw: number }> = ({
  frame,
  cam,
  yaw,
}) => (
  <group>
    {T.landings.map(([f0, v]) => {
      const d = frame - f0;
      if (d < 0 || d > 26) return null;
      const k = d / 26;
      const fx = cam.x - Math.sin(yaw) * 0.9;
      const fz = cam.z - Math.cos(yaw) * 0.9;
      return Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 + f0;
        const rr = (0.3 + k * 1.6) * (0.6 + random(`ld${f0}${i}`) * 0.6) * Math.min(1.4, v / 2.5);
        return (
          <sprite
            key={`${f0}-${i}`}
            position={[fx + Math.cos(a) * rr, 0.12 + k * 0.5, fz + Math.sin(a) * rr]}
            scale={[0.5 + k * 1.2, 0.35 + k * 0.8, 1]}
          >
            <spriteMaterial
              map={glow()}
              color="#D8CDB8"
              transparent
              opacity={(1 - k) * 0.55}
              depthWrite={false}
            />
          </sprite>
        );
      });
    })}
  </group>
);

/** Air streaks during the updraft: everything rushing past, upward. */
export const Streaks: React.FC<{ cam: THREE.Vector3; t: number; speed: number }> = ({ cam, t, speed }) => {
  const o = interpolate(t, [UPDRAFT_AT, UPDRAFT_AT + 2, 52, 55], [0, 1, 1, 0], CLAMP);
  if (o <= 0.01) return null;
  const B = 40;
  const len = Math.min(9, 0.6 + speed * 0.06);
  return (
    <group>
      {Array.from({ length: 140 }).map((_, i) => {
        const r = (k: string) => random(`sk${i}${k}`);
        const wrap = (v: number, c: number) => c + ((((v - c) % B) + B * 1.5) % B) - B / 2;
        // particles rise slower than us, so they stream downward past the camera
        const travel = -((t - UPDRAFT_AT) * (6 + speed * 0.55));
        const x = wrap(r("x") * 400, cam.x);
        const y = wrap(r("y") * 400 + travel, cam.y);
        const z = wrap(r("z") * 400, cam.z);
        const near = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
        const fade = Math.min(1, Math.max(0, (near - 1.5) / 3)) * Math.min(1, (B / 2 - near) / 6);
        if (fade <= 0) return null;
        return (
          <mesh key={i} position={[x, y, z]} scale={[0.02, len, 0.02]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#FFFFFF" transparent opacity={o * fade * 0.5} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Debris riding the updraft with you                                   */
/* ------------------------------------------------------------------ */

const Bench = () => (
  <group>
    <mesh position={[0, 0.45, 0]} material={std("#D9773F")}>
      <boxGeometry args={[1.8, 0.08, 0.5]} />
    </mesh>
    <mesh position={[0, 0.75, -0.22]} material={std("#D9773F")}>
      <boxGeometry args={[1.8, 0.4, 0.06]} />
    </mesh>
    {[-0.8, 0.8].map((x) => (
      <mesh key={x} position={[x, 0.22, 0]} material={std("#2A2A2E")}>
        <boxGeometry args={[0.08, 0.45, 0.45]} />
      </mesh>
    ))}
  </group>
);
const Bike = () => (
  <group>
    {[-0.55, 0.55].map((x) => (
      <mesh key={x} position={[x, 0, 0]} material={std("#151518")}>
        <torusGeometry args={[0.33, 0.035, 8, 24]} />
      </mesh>
    ))}
    <mesh position={[0, 0.25, 0]} rotation={[0, 0, 0.5]} material={std("#C0392B")}>
      <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
    </mesh>
    <mesh position={[0.15, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} material={std("#C0392B")}>
      <cylinderGeometry args={[0.03, 0.03, 0.75, 8]} />
    </mesh>
    <mesh position={[0.5, 0.62, 0]} material={std("#151518")}>
      <boxGeometry args={[0.06, 0.06, 0.5]} />
    </mesh>
  </group>
);
const Cone = () => (
  <group>
    <mesh position={[0, 0.35, 0]} material={std("#F06A22")}>
      <coneGeometry args={[0.2, 0.7, 14]} />
    </mesh>
    <mesh position={[0, 0.4, 0]} material={std("#F4F4F4")}>
      <cylinderGeometry args={[0.105, 0.135, 0.12, 14]} />
    </mesh>
    <mesh position={[0, 0.02, 0]} material={std("#2A2A2E")}>
      <boxGeometry args={[0.5, 0.04, 0.5]} />
    </mesh>
  </group>
);
const Hat = () => (
  <group>
    <mesh material={std("#3B2F2A")}>
      <cylinderGeometry args={[0.3, 0.3, 0.02, 20]} />
    </mesh>
    <mesh position={[0, 0.1, 0]} material={std("#3B2F2A")}>
      <cylinderGeometry args={[0.14, 0.16, 0.2, 16]} />
    </mesh>
  </group>
);
const Pigeon: React.FC<{ t: number }> = ({ t }) => {
  const flap = Math.sin(t * 16) * 0.8;
  return (
    <group>
      <mesh scale={[0.12, 0.1, 0.22]} material={std("#8A8F99")}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <mesh position={[0, 0.07, -0.18]} material={std("#6E7480")}>
        <sphereGeometry args={[0.06, 8, 6]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.12, 0.02, 0]} rotation={[0, 0, s * flap]} material={std("#9AA0AA")}>
          <boxGeometry args={[0.3 * 1, 0.015, 0.16]} />
        </mesh>
      ))}
    </group>
  );
};
const Globule: React.FC<{ t: number; seed: number }> = ({ t, seed }) => {
  const w = Math.sin(t * 4 + seed) * 0.14;
  return (
    <mesh scale={[1 + w, 1 - w, 1 + w * 0.4]}>
      <icosahedronGeometry args={[1, 3]} />
      <meshStandardMaterial color="#7EB8EC" roughness={0.05} metalness={0.2} transparent opacity={0.6} />
    </mesh>
  );
};
const Balloon: React.FC<{ c: string }> = ({ c }) => (
  <group>
    <mesh scale={[0.42, 0.52, 0.42]} material={std(c, { roughness: 0.3, flatShading: false })}>
      <sphereGeometry args={[1, 18, 14]} />
    </mesh>
    <mesh position={[0, -1.1, 0]} material={std("#EEEEEE")}>
      <cylinderGeometry args={[0.006, 0.006, 1.2, 3]} />
    </mesh>
  </group>
);
const Leaf = () => (
  <mesh material={std("#4E9E43", { side: THREE.DoubleSide })}>
    <planeGeometry args={[0.14, 0.09]} />
  </mesh>
);

type Item = {
  kind: string;
  off: [number, number, number];
  spin: [number, number, number];
  s: number;
  c?: string;
};
const ITEMS: Item[] = [
  { kind: "bench", off: [4.5, 2.5, -6], spin: [0.3, 0.2, 0.15], s: 1 },
  { kind: "bike", off: [-5, -1.5, -7], spin: [0.15, 0.35, 0.2], s: 1 },
  { kind: "cone", off: [2.2, 1.0, -3.2], spin: [0.6, 0.4, 0.5], s: 1 },
  { kind: "hat", off: [-1.6, 0.6, -2.6], spin: [0.8, 0.5, 0.3], s: 1 },
  { kind: "pigeon", off: [1.4, 1.8, -4.2], spin: [0, 0.1, 0], s: 1.2 },
  { kind: "pigeon", off: [-2.5, 2.6, -5.5], spin: [0, -0.1, 0], s: 1.2 },
  { kind: "balloon", off: [-3.5, 4.0, -4.5], spin: [0.1, 0.2, 0.1], s: 1, c: "#E74C3C" },
  { kind: "balloon", off: [3.2, 5.0, -2.5], spin: [0.1, 0.25, 0.1], s: 1, c: "#F1C40F" },
  { kind: "balloon", off: [0.8, 6.0, -5.0], spin: [0.1, 0.2, 0.1], s: 1, c: "#3498DB" },
  ...Array.from({ length: 7 }).map((_, i) => ({
    kind: "globule",
    off: [(random(`go${i}x`) - 0.5) * 9, (random(`go${i}y`) - 0.3) * 6, -2 - random(`go${i}z`) * 7] as [
      number,
      number,
      number,
    ],
    spin: [0, 0, 0] as [number, number, number],
    s: 0.12 + random(`go${i}s`) * 0.35,
  })),
  ...Array.from({ length: 26 }).map((_, i) => ({
    kind: "leaf",
    off: [(random(`le${i}x`) - 0.5) * 8, (random(`le${i}y`) - 0.4) * 7, (random(`le${i}z`) - 0.5) * 8] as [
      number,
      number,
      number,
    ],
    spin: [1 + random(`le${i}a`) * 2, 1.4, 0.8] as [number, number, number],
    s: 1,
  })),
];

/** Loose things lifted by the updraft that keep you company on the way up, then fall behind. */
export const Debris: React.FC<{ cam: THREE.Vector3; t: number; yaw: number }> = ({ cam, t, yaw }) => {
  // yaw is the heading when the updraft began: the company stays put in the world while you look around
  const appear = interpolate(t, [UPDRAFT_AT - 1, UPDRAFT_AT + 2.5], [0, 1], CLAMP);
  if (appear <= 0 || t > 54) return null;
  const behind = interpolate(t, [47, 53.5], [0, 1], CLAMP);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return (
    <group>
      {ITEMS.map((it, i) => {
        const age = t - UPDRAFT_AT;
        // offsets are in "facing" space so the company frames well; then they drift and fall behind
        const ox = it.off[0] + Math.sin(age * 0.3 + i) * 0.6;
        const oz = it.off[2] + Math.cos(age * 0.25 + i) * 0.5;
        const oy =
          it.off[1] - (1 - appear) * 12 - behind * behind * (40 + i * 6) + Math.sin(age * 0.4 + i * 2) * 0.4;
        const wx = cam.x + ox * cy + oz * -sy * -1;
        const wz = cam.z - ox * sy + oz * cy;
        const rot: [number, number, number] = [age * it.spin[0], age * it.spin[1] + i, age * it.spin[2]];
        const d = Math.hypot(ox, oy, oz);
        if (d < 1.2) return null;
        let body: React.ReactNode = null;
        if (it.kind === "bench") body = <Bench />;
        else if (it.kind === "bike") body = <Bike />;
        else if (it.kind === "cone") body = <Cone />;
        else if (it.kind === "hat") body = <Hat />;
        else if (it.kind === "pigeon") body = <Pigeon t={t + i} />;
        else if (it.kind === "balloon") body = <Balloon c={it.c!} />;
        else if (it.kind === "globule") body = <Globule t={t} seed={i} />;
        else body = <Leaf />;
        return (
          <group key={i} position={[wx, cam.y + oy, wz]} rotation={rot} scale={it.s}>
            {body}
          </group>
        );
      })}
    </group>
  );
};
