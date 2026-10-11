import React, { useMemo } from "react";
import * as THREE from "three";
import { Hand } from "../pov/Body";

/**
 * Your own body, for when you look down at your feet in the wash: a T-shirt, board shorts, bare legs and
 * bare feet with toes, arms hanging at your sides. Built standing on the ground, facing -z; it turns with
 * where you look (yaw only).
 */

const SKIN = "#DDA77F";
const mats: Record<string, THREE.MeshStandardMaterial> = {};
const mat = (c: string, rough = 0.6, map?: THREE.Texture) =>
  (mats[`${c}${rough}${map ? map.uuid : ""}`] ??= new THREE.MeshStandardMaterial(
    map ? { color: c, roughness: rough, map } : { color: c, roughness: rough },
  ));

/** Lathe a radius profile (y from 0 down to -len) into a limb. */
const limb = (pts: [number, number][]) => {
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
  g.computeVertexNormals();
  return g;
};

let printTex: THREE.Texture | null = null;
/** Board-short print: hibiscus flowers on deep blue. */
const print = () => {
  if (printTex) return printTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16406E";
  g.fillRect(0, 0, 256, 256);
  const flower = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(
        x + Math.cos(a) * r * 0.55,
        y + Math.sin(a) * r * 0.55,
        r * 0.55,
        r * 0.33,
        a,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    g.fillStyle = "#FFE066";
    g.beginPath();
    g.arc(x, y, r * 0.18, 0, Math.PI * 2);
    g.fill();
  };
  const spots: [number, number, number, string][] = [
    [40, 50, 30, "#FF7B54"],
    [150, 30, 22, "#FFFFFF"],
    [210, 120, 32, "#FF7B54"],
    [90, 150, 26, "#FFFFFF"],
    [30, 220, 24, "#FFB4A2"],
    [180, 220, 28, "#FF7B54"],
    [128, 95, 14, "#FFB4A2"],
  ];
  for (const [x, y, r, col] of spots) {
    // leaves under each flower
    g.fillStyle = "#2D6A4F";
    g.beginPath();
    g.ellipse(x + r * 0.8, y + r * 0.5, r * 0.7, r * 0.25, 0.6, 0, Math.PI * 2);
    g.fill();
    flower(x, y, r, col);
  }
  printTex = new THREE.CanvasTexture(c);
  printTex.wrapS = printTex.wrapT = THREE.RepeatWrapping;
  printTex.repeat.set(3, 2);
  printTex.colorSpace = THREE.SRGBColorSpace;
  return printTex;
};

/** A bare foot on the ground, toes toward -z; origin under the ankle. side: -1 left, +1 right. */
const Foot: React.FC<{ side: number }> = ({ side }) => {
  const skin = mat(SKIN, 0.45);
  const toes = [
    { x: -0.024, z: -0.178, r: 0.0175 },
    { x: -0.003, z: -0.172, r: 0.0128 },
    { x: 0.015, z: -0.163, r: 0.0118 },
    { x: 0.03, z: -0.151, r: 0.011 },
    { x: 0.043, z: -0.137, r: 0.0098 },
  ];
  return (
    <group scale={[side, 1, 1]}>
      {/* the foot: instep and sole, the heel, the ball of the foot */}
      <mesh position={[0.006, 0.034, -0.055]} scale={[0.047, 0.032, 0.105]} material={skin} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh position={[0, 0.036, 0.038]} scale={[0.036, 0.034, 0.04]} material={skin} castShadow>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      <mesh position={[0.01, 0.022, -0.125]} scale={[0.05, 0.022, 0.04]} material={skin}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      {toes.map((t, i) => (
        <mesh key={i} position={[t.x, t.r * 0.95, t.z]} scale={[1, 0.85, 1.25]} material={skin} castShadow>
          <sphereGeometry args={[t.r, 12, 10]} />
        </mesh>
      ))}
      {/* toenails */}
      {toes.map((t, i) => (
        <mesh
          key={`n${i}`}
          position={[t.x, t.r * 1.55, t.z - t.r * 0.45]}
          scale={[t.r * 0.75, t.r * 0.18, t.r * 0.7]}
          material={mat("#F2C9B0", 0.3)}
        >
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
      {/* ankle bones */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.03, 0.075, 0.008]} material={skin}>
          <sphereGeometry args={[0.016, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
};

export const You: React.FC<{ pos: THREE.Vector3; yaw: number }> = ({ pos, yaw }) => {
  const geos = useMemo(
    () => ({
      thigh: limb([
        [0.0, 0],
        [0.088, -0.01],
        [0.084, -0.12],
        [0.074, -0.28],
        [0.06, -0.4],
        [0.055, -0.43],
        [0.0, -0.44],
      ]),
      shin: limb([
        [0.0, 0.02],
        [0.052, 0.0],
        [0.058, -0.1],
        [0.05, -0.22],
        [0.036, -0.36],
        [0.033, -0.4],
        [0.0, -0.42],
      ]),
      torso: limb([
        [0.0, 0.5],
        [0.12, 0.49],
        [0.175, 0.44],
        [0.17, 0.3],
        [0.158, 0.12],
        [0.162, 0.0],
        [0.0, -0.01],
      ]),
      upperArm: limb([
        [0.0, 0.01],
        [0.047, 0.0],
        [0.044, -0.14],
        [0.036, -0.29],
        [0.0, -0.3],
      ]),
      foreArm: limb([
        [0.0, 0.01],
        [0.036, 0.0],
        [0.038, -0.08],
        [0.027, -0.25],
        [0.0, -0.26],
      ]),
    }),
    [],
  );
  const skin = mat(SKIN, 0.5);
  const shirt = mat("#2A9D8F", 0.9);
  const shorts = mat("#FFFFFF", 0.85, print());
  // the body sits a hand's width behind your eyes (more when you lean over to look down)
  const Z = 0.12;
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      {/* T-shirt torso, waist to shoulders, a little flattened front to back */}
      <mesh geometry={geos.torso} position={[0, 0.98, Z]} scale={[1, 1, 0.68]} material={shirt} castShadow />
      {/* board shorts: the seat and two wide legs to mid-thigh */}
      <mesh position={[0, 0.94, Z]} scale={[0.17, 0.1, 0.12]} material={shorts} castShadow>
        <sphereGeometry args={[1, 24, 14]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * 0.1, 0.815, Z - 0.005]}
            rotation={[0.05, 0, side * 0.04]}
            material={shorts}
            castShadow
          >
            <cylinderGeometry args={[0.093, 0.099, 0.27, 20, 1, true]} />
          </mesh>
          {/* the leg: hip at y 0.92, knee a touch forward, ankle over the foot */}
          <group position={[side * 0.098, 0.925, Z]} rotation={[-0.075, 0, side * 0.045]}>
            <mesh geometry={geos.thigh} material={skin} castShadow />
            <group position={[0, -0.43, 0]} rotation={[0.1, 0, 0]}>
              <mesh geometry={geos.shin} material={skin} castShadow />
            </group>
          </group>
          <group position={[side * 0.13, 0, Z - 0.06]} rotation={[0, side * -0.12, 0]}>
            <Foot side={side} />
          </group>
          {/* arms hanging at your sides */}
          <group position={[side * 0.205, 1.44, Z]} rotation={[0.08, 0, side * 0.1]}>
            <mesh geometry={geos.upperArm} material={skin} castShadow />
            <mesh
              position={[0, -0.07, 0]}
              scale={[1.18, 0.5, 1.18]}
              geometry={geos.upperArm}
              material={shirt}
            />
            <group position={[0, -0.29, 0]} rotation={[-0.25, 0, side * -0.04]}>
              <mesh geometry={geos.foreArm} material={skin} castShadow />
              <group position={[0, -0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <Hand side={side} spread={0.2} curl={0.35} />
              </group>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
};
