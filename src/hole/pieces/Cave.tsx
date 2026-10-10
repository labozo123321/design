import React, { useMemo } from "react";
import * as THREE from "three";
import { HX, HZ } from "../timeline";
import { clipOutsideShaft, glowMat, rng, std } from "../mats";

/**
 * 300 m down: the shaft breaks into a cave of giant selenite crystals (like Naica's, beams up to 11 m long),
 * lit by two explorers' lamps. The cave opens off the +z side; a few beams reach across into the shaft.
 */

export const CAVE_C = { dx: 0, dz: 9.5 }; // room centre relative to the axis
const ROOM = { rx: 15, ry: 8.5, rz: 13 };

type Beam = { c: THREE.Vector3; dir: THREE.Vector3; len: number; r: number };

/** Crystal beams in room-local coordinates (origin = the cave's centre height on the shaft axis). */
const BEAMS: Beam[] = (() => {
  const R = rng(4242);
  const out: Beam[] = [];
  const clearOfPath = (b: Beam) => {
    for (let k = 0; k <= 12; k++) {
      const p = b.c.clone().addScaledVector(b.dir, (k / 12 - 0.5) * b.len);
      if (Math.hypot(p.x, p.z) < 2.1 + b.r) return false;
      // inside the room (with a little allowance for the ends going into the rock)
      const q =
        (p.x - CAVE_C.dx) ** 2 / ROOM.rx ** 2 +
        p.y ** 2 / ROOM.ry ** 2 +
        (p.z - CAVE_C.dz) ** 2 / ROOM.rz ** 2;
      if (q > 1.25) return false;
    }
    return true;
  };
  let tries = 0;
  while (out.length < 30 && tries < 20000) {
    tries++;
    const c = new THREE.Vector3(
      CAVE_C.dx + (R() * 2 - 1) * ROOM.rx * 0.75,
      (R() * 2 - 1) * ROOM.ry * 0.7,
      CAVE_C.dz + (R() * 2 - 1) * ROOM.rz * 0.7,
    );
    const yaw = R() * Math.PI * 2;
    const pitch = (R() * 2 - 1) * (R() < 0.7 ? 0.35 : 0.9);
    const dir = new THREE.Vector3(
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.cos(yaw),
    );
    const len = 4 + R() * 7.5;
    const r = 0.22 + R() * 0.6 * (len / 11);
    const b = { c, dir, len, r };
    if (clearOfPath(b)) out.push(b);
  }
  // three grown out of the cave and through the opening, their tips ~2.4 m from your path
  const reach: [number[], number[], number][] = [
    [[3.0, 2.6, 9.0], [1.9, 1.8, 1.4], 0.42],
    [[-4.5, -2.5, 10.5], [-1.6, -1.0, 2.0], 0.55],
    [[2.5, -5.5, 9.5], [0.6, -3.2, 2.5], 0.36],
  ];
  for (const [base, tipP, r] of reach) {
    const a = new THREE.Vector3(...base);
    const b = new THREE.Vector3(...tipP);
    out.push({
      c: a.clone().add(b).multiplyScalar(0.5),
      dir: b.clone().sub(a).normalize(),
      len: a.distanceTo(b),
      r,
    });
  }
  return out;
})();

let roomGeo: THREE.BufferGeometry | null = null;
/** A lumpy ellipsoid, seen from inside: the cave's walls. */
const room = () => {
  if (roomGeo) return roomGeo;
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n =
      0.12 * Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 5.7 - v.x * 2.1) +
      0.06 * Math.sin(v.x * 17 + v.z * 13 + v.y * 11);
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x * ROOM.rx, v.y * ROOM.ry, v.z * ROOM.rz);
  }
  g.computeVertexNormals();
  roomGeo = g;
  return g;
};

export const Cave: React.FC<{ y: number }> = ({ y }) => {
  const mats = useMemo(
    () => ({
      rock: clipOutsideShaft(
        new THREE.MeshStandardMaterial({
          color: "#5A4636",
          roughness: 0.95,
          flatShading: true,
          side: THREE.BackSide,
        }),
      ),
      crystals: [
        ["#E6F0EE", "#7FC4D6", 0.3, 0.8],
        ["#F2EBDD", "#C9B48A", 0.22, 0.88],
        ["#D8E6E4", "#9CCFDA", 0.4, 0.72],
      ].map(
        ([c, e, k, o]) =>
          new THREE.MeshStandardMaterial({
            color: c as string,
            emissive: new THREE.Color(e as string),
            emissiveIntensity: k as number,
            roughness: 0.16,
            metalness: 0.0,
            transparent: true,
            opacity: o as number,
            flatShading: true,
          }),
      ),
    }),
    [],
  );
  const prism = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1), []);
  const tip = useMemo(() => new THREE.ConeGeometry(1, 1, 6, 1), []);
  const up = new THREE.Vector3(0, 1, 0);
  return (
    <group position={[HX, y, HZ]}>
      <mesh geometry={room()} position={[CAVE_C.dx, 0, CAVE_C.dz]} material={mats.rock} />
      {BEAMS.map((b, i) => {
        const q = new THREE.Quaternion().setFromUnitVectors(up, b.dir);
        const end = b.c.clone().addScaledVector(b.dir, b.len / 2 + b.r * 0.7);
        return (
          <group key={i}>
            <mesh
              geometry={prism}
              position={b.c}
              quaternion={q}
              scale={[b.r, b.len, b.r]}
              material={mats.crystals[i % 3]}
            />
            <mesh
              geometry={tip}
              position={end}
              quaternion={q}
              scale={[b.r, b.r * 1.4, b.r]}
              material={mats.crystals[i % 3]}
            />
          </group>
        );
      })}
      {/* two explorers' lamps on tripods, on the cave floor */}
      {[
        [-5.5, -6.6, 12.5],
        [6.5, -6.2, 15],
      ].map(([x, yy, z], i) => (
        <group key={i} position={[x, yy, z]}>
          {[0, 2.1, 4.2].map((a) => (
            <mesh
              key={a}
              position={[Math.sin(a) * 0.35, -0.7, Math.cos(a) * 0.35]}
              rotation={[Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]}
              material={std("#2A2A2E")}
            >
              <cylinderGeometry args={[0.025, 0.025, 1.5, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.1, 0]} material={std("#1E1E22")}>
            <boxGeometry args={[0.5, 0.35, 0.3]} />
          </mesh>
          <mesh position={[0, 0.1, -0.16]} material={glowMat("#FFE4B5", 14)}>
            <boxGeometry args={[0.42, 0.26, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Lamp positions in world space (for the light rig): the two tripods. */
export const caveLights = (y: number) => [
  new THREE.Vector3(HX - 5.5, y - 6.3, HZ + 12.2),
  new THREE.Vector3(HX + 6.5, y - 5.9, HZ + 14.7),
];
