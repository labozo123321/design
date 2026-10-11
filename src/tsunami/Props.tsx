import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { std } from "../hole/mats";
import { YOU, edgeZ, groundY, levelAt, reefAt, rng, shoreZ, smooth, vnoise } from "./world";

/**
 * Everything on the beach and the sea floor: palms, umbrellas and towels, the lifeguard tower and the
 * tsunami sign, a sandcastle, a beach ball the sea takes with it, boats that end up on their sides, rocks,
 * coral, weed, starfish and shells on the uncovered floor, and fish flopping about on it.
 */

const C = (hex: string) => new THREE.Color(hex);
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/* ------------------------------------------------------------------ */
/* Palms                                                                */
/* ------------------------------------------------------------------ */

let frondTex: THREE.Texture | null = null;
const frond = () =>
  (frondTex ??= canvasTex(128, 512, (g) => {
    g.clearRect(0, 0, 128, 512);
    // midrib
    g.strokeStyle = "#6E7F3A";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(64, 0);
    g.lineTo(64, 512);
    g.stroke();
    // leaflets, angled out toward the tip, longest in the middle
    for (let y = 10; y < 505; y += 7) {
      const L = 58 * Math.pow(Math.sin((y / 512) * Math.PI), 0.6) + 6;
      for (const s of [-1, 1]) {
        g.strokeStyle = (y / 7) % 2 ? "#4C6B27" : "#5E8030";
        g.lineWidth = 4.2;
        g.beginPath();
        g.moveTo(64, y);
        g.quadraticCurveTo(64 + s * L * 0.5, y + 10, 64 + s * L, y + 26);
        g.stroke();
      }
    }
  }));

type PalmSpec = { x: number; z: number; h: number; lean: number; dir: number; seed: number };
const PALMS: PalmSpec[] = [
  { x: -24, z: 9, h: 9.5, lean: 0.38, dir: Math.PI - 0.3, seed: 1 },
  { x: -31, z: 14, h: 11, lean: 0.25, dir: Math.PI + 0.2, seed: 2 },
  { x: 27, z: 8.5, h: 10, lean: 0.42, dir: Math.PI + 0.5, seed: 3 },
  { x: 35, z: 15, h: 8.6, lean: 0.3, dir: Math.PI - 0.1, seed: 4 },
  { x: -12, z: 29, h: 12, lean: 0.2, dir: Math.PI - 0.5, seed: 5 },
  { x: -3, z: 33, h: 10.5, lean: 0.28, dir: Math.PI + 0.3, seed: 6 },
  { x: 7, z: 28, h: 11.5, lean: 0.24, dir: Math.PI - 0.2, seed: 7 },
  { x: 16, z: 34, h: 9.8, lean: 0.32, dir: Math.PI + 0.4, seed: 8 },
  { x: -20, z: 38, h: 10.8, lean: 0.18, dir: Math.PI, seed: 9 },
  { x: 25, z: 40, h: 12.5, lean: 0.2, dir: Math.PI - 0.6, seed: 10 },
  { x: -38, z: 31, h: 9.4, lean: 0.3, dir: Math.PI + 0.1, seed: 11 },
  { x: 41, z: 29, h: 10.4, lean: 0.27, dir: Math.PI - 0.4, seed: 12 },
  { x: -52, z: 22, h: 11.2, lean: 0.33, dir: Math.PI + 0.6, seed: 13 },
  { x: 55, z: 21, h: 9.6, lean: 0.36, dir: Math.PI - 0.7, seed: 14 },
  { x: 2, z: 45, h: 13, lean: 0.15, dir: Math.PI, seed: 15 },
  { x: -30, z: 50, h: 12, lean: 0.2, dir: Math.PI, seed: 16 },
  { x: 34, z: 52, h: 12.6, lean: 0.18, dir: Math.PI, seed: 17 },
];

const palmParts = (p: PalmSpec) => {
  const R = rng(p.seed * 131);
  const base = new THREE.Vector3(p.x, groundY(p.x, p.z) - 0.15, p.z);
  const dir = new THREE.Vector3(Math.sin(p.dir), 0, Math.cos(p.dir));
  const at = (t: number) =>
    base
      .clone()
      .addScaledVector(dir, p.lean * p.h * t * t)
      .add(new THREE.Vector3(0, p.h * t, 0));
  // trunk: rings of bark, a flared foot, tapering up
  const SEG = 22;
  const RING = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const bark = C("#8A7358");
  const barkD = C("#6A5641");
  for (let k = 0; k <= SEG; k++) {
    const t = k / SEG;
    const c = at(t);
    const tan = at(Math.min(1, t + 0.01))
      .sub(at(Math.max(0, t - 0.01)))
      .normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(tan).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const up2 = tan.clone().cross(side).normalize();
    const r = 0.22 * (1 - 0.38 * t) * (1 + 0.45 * Math.exp(-t * 14));
    const cc = (k % 2 ? bark : barkD).clone();
    for (let s = 0; s < RING; s++) {
      const a = (s / RING) * Math.PI * 2;
      const v = c
        .clone()
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(up2, Math.sin(a) * r);
      pos.push(v.x, v.y, v.z);
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let k = 0; k < SEG; k++)
    for (let s = 0; s < RING; s++) {
      const a = k * RING + s;
      const b = k * RING + ((s + 1) % RING);
      idx.push(a, b, a + RING, b, b + RING, a + RING);
    }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  trunk.setIndex(idx);
  trunk.computeVertexNormals();
  const top = at(1);
  // the crown: arching fronds, folded a little along the rib, relative to the top
  const fr: THREE.BufferGeometry[] = [];
  const n = 13;
  for (let f = 0; f < n; f++) {
    const az = (f / n) * Math.PI * 2 + R() * 0.35;
    const el = 0.5 + R() * 0.45 - (f % 3 === 0 ? 0.3 : 0);
    const len = 3.4 + R() * 1.3;
    const d = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const sideV = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const S = 12;
    const fp: number[] = [];
    const fu: number[] = [];
    const fi: number[] = [];
    for (let s = 0; s <= S; s++) {
      const t = s / S;
      const along = len * t;
      const c = d
        .clone()
        .multiplyScalar(Math.cos(el) * along)
        .add(new THREE.Vector3(0, Math.sin(el) * along - 0.23 * along * along * (0.8 + 0.4 * R()), 0));
      const w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.92 + 0.06)), 0.7) + 0.04;
      for (const sd of [-1, 1]) {
        const v = c
          .clone()
          .addScaledVector(sideV, sd * w)
          .add(new THREE.Vector3(0, -0.22 * w, 0));
        fp.push(v.x, v.y, v.z);
        fu.push(sd < 0 ? 0 : 1, t);
      }
    }
    for (let s = 0; s < S; s++) {
      const a = s * 2;
      fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(fu, 2));
    g.setIndex(fi);
    g.computeVertexNormals();
    fr.push(g);
  }
  const crown = mergeGeometries(fr)!;
  const nuts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + R();
    const s = new THREE.SphereGeometry(0.13, 10, 8);
    s.translate(Math.sin(a) * 0.2, -0.28 - R() * 0.1, Math.cos(a) * 0.2);
    nuts.push(s);
  }
  return { trunk, crown, nuts: mergeGeometries(nuts)!, top };
};

const PalmTree: React.FC<{ p: PalmSpec; t: number; wind: number }> = ({ p, t, wind }) => {
  const parts = useMemo(() => palmParts(p), [p]);
  const sway = Math.sin(t * 1.1 + p.seed) * 0.03 + wind * (0.08 + 0.05 * Math.sin(t * 7 + p.seed));
  return (
    <group>
      <mesh geometry={parts.trunk} material={palmMats().trunk} castShadow />
      <group position={parts.top} rotation={[sway, 0, sway * 0.6]}>
        <mesh geometry={parts.crown} material={palmMats().leaf} castShadow />
        <mesh geometry={parts.nuts} material={std("#4A3A22", { roughness: 0.6 })} />
      </group>
    </group>
  );
};

let palmMatCache: { trunk: THREE.Material; leaf: THREE.Material } | null = null;
const palmMats = () =>
  (palmMatCache ??= {
    trunk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    leaf: new THREE.MeshStandardMaterial({
      map: frond(),
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.7,
      color: new THREE.Color("#C8D8A0"),
    }),
  });

export const Palms: React.FC<{ t: number; wind: number }> = ({ t, wind }) => (
  <group>
    {PALMS.map((p) => (
      <PalmTree key={p.seed} p={p} t={t} wind={wind} />
    ))}
  </group>
);

/* ------------------------------------------------------------------ */
/* The beach: umbrellas, towels, loungers, boards, the tower and sign   */
/* ------------------------------------------------------------------ */

const stripes = (cols: string[], n: number, vertical = true) =>
  canvasTex(256, 256, (g) => {
    for (let k = 0; k < n; k++) {
      g.fillStyle = cols[k % cols.length];
      if (vertical) g.fillRect((k * 256) / n, 0, 256 / n + 1, 256);
      else g.fillRect(0, (k * 256) / n, 256, 256 / n + 1);
    }
  });

const texCache: Record<string, THREE.Texture> = {};
const tex = (key: string, make: () => THREE.Texture) => (texCache[key] ??= make());

const UMBRELLAS = [
  { x: -12.6, z: 6.2, cols: ["#E63946", "#F1FAEE"], tilt: 0.12 },
  { x: -3.2, z: 16.5, cols: ["#1D7FD1", "#FFFFFF"], tilt: -0.08 },
  { x: 6.8, z: 11.8, cols: ["#FFB703", "#FB8500"], tilt: 0.1 },
  { x: 12.5, z: 15.5, cols: ["#2A9D8F", "#E9F5DB"], tilt: -0.14 },
  { x: 19, z: 10.5, cols: ["#E76F51", "#FFE8D6"], tilt: 0.06 },
  { x: -17, z: 9.5, cols: ["#8E44AD", "#F5EEF8"], tilt: -0.1 },
];

const Umbrella: React.FC<{ x: number; z: number; cols: string[]; tilt: number; wind: number; t: number }> = ({
  x,
  z,
  cols,
  tilt,
  wind,
  t,
}) => {
  const y = groundY(x, z);
  const map = tex(`umb${cols.join()}`, () => stripes(cols, 12));
  const flap = wind * 0.12 * Math.sin(t * 9 + x);
  return (
    <group position={[x, y - 0.25, z]} rotation={[tilt + flap, 0, tilt * 0.6]}>
      <mesh position={[0, 1.15, 0]} material={std("#EDEDED", { roughness: 0.4, metalness: 0.5 })} castShadow>
        <cylinderGeometry args={[0.022, 0.022, 2.3, 8]} />
      </mesh>
      <mesh position={[0, 2.25, 0]} castShadow>
        <cylinderGeometry args={[0.03, 1.15, 0.38, 24, 1, true]} />
        <meshStandardMaterial map={map} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
};

const TOWELS = [
  { x: -3.0, z: 8.6, r: Math.PI, cols: ["#FF6B6B", "#FFFFFF", "#4ECDC4"] },
  { x: -11, z: 9, r: -0.2, cols: ["#FFD166", "#06D6A0"] },
  { x: -2.4, z: 17.6, r: 0.1, cols: ["#118AB2", "#FFFFFF"] },
  { x: 11, z: 13.4, r: -0.4, cols: ["#EF476F", "#FFD166"] },
];

const Towel: React.FC<{ x: number; z: number; r: number; cols: string[] }> = ({ x, z, r, cols }) => {
  const map = tex(`towel${cols.join()}`, () => stripes(cols, 9, false));
  return (
    <mesh position={[x, groundY(x, z) + 0.012, z]} rotation={[-Math.PI / 2, 0, r]} receiveShadow>
      <planeGeometry args={[0.95, 1.9]} />
      <meshStandardMaterial map={map} roughness={0.95} />
    </mesh>
  );
};

const Lounger: React.FC<{ x: number; z: number; r: number; color: string }> = ({ x, z, r, color }) => (
  <group position={[x, groundY(x, z), z]} rotation={[0, r, 0]}>
    <mesh position={[0, 0.32, 0.2]} material={std(color, { roughness: 0.7 })} castShadow>
      <boxGeometry args={[0.66, 0.06, 1.3]} />
    </mesh>
    <mesh
      position={[0, 0.6, -0.62]}
      rotation={[0.9, 0, 0]}
      material={std(color, { roughness: 0.7 })}
      castShadow
    >
      <boxGeometry args={[0.66, 0.06, 0.75]} />
    </mesh>
    {[-0.3, 0.3].map((sx) =>
      [-0.35, 0.75].map((sz) => (
        <mesh
          key={`${sx}${sz}`}
          position={[sx, 0.16, sz]}
          material={std("#DDDDDD", { metalness: 0.6, roughness: 0.35 })}
        >
          <boxGeometry args={[0.04, 0.32, 0.04]} />
        </mesh>
      )),
    )}
  </group>
);

const BOARDS = [
  { x: -19.5, z: 4.5, r: 0.2, lean: 0.12, color: "#F94144" },
  { x: -18.8, z: 4.9, r: -0.15, lean: -0.08, color: "#F9C74F" },
  { x: 12.5, z: 4.6, r: 0.4, lean: 0.1, color: "#43AA8B" },
];

const Board: React.FC<{ x: number; z: number; r: number; lean: number; color: string }> = ({
  x,
  z,
  r,
  lean,
  color,
}) => (
  <group position={[x, groundY(x, z) - 0.3, z]} rotation={[lean, r, 0]}>
    <mesh
      position={[0, 1.05, 0]}
      scale={[0.27, 1.05, 0.04]}
      material={std(color, { roughness: 0.3 })}
      castShadow
    >
      <sphereGeometry args={[1, 20, 14]} />
    </mesh>
    <mesh
      position={[0, 1.05, 0.03]}
      scale={[0.012, 1.0, 0.012]}
      material={std("#FFFFFF", { roughness: 0.3 })}
    >
      <boxGeometry args={[1, 2, 1]} />
    </mesh>
  </group>
);

let signTex: THREE.Texture | null = null;
const hazardSign = () =>
  (signTex ??= canvasTex(640, 800, (g) => {
    g.fillStyle = "#14479A";
    g.fillRect(0, 0, 640, 800);
    g.strokeStyle = "#FFFFFF";
    g.lineWidth = 16;
    g.strokeRect(20, 20, 600, 760);
    // the wave symbol
    g.save();
    g.translate(320, 215);
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.moveTo(-210, 110);
    g.bezierCurveTo(-150, 100, -90, 40, -60, -40);
    g.bezierCurveTo(-30, -120, 60, -150, 120, -110);
    g.bezierCurveTo(170, -80, 175, -10, 130, 10);
    g.bezierCurveTo(100, 25, 70, -5, 85, -35);
    g.bezierCurveTo(40, -45, 10, 0, 10, 50);
    g.bezierCurveTo(10, 85, 40, 105, 80, 110);
    g.closePath();
    g.fill();
    g.fillRect(-210, 110, 420, 18);
    // a figure running uphill away from it
    g.lineWidth = 12;
    g.lineCap = "round";
    g.strokeStyle = "#FFFFFF";
    g.beginPath();
    g.arc(185, -20, 16, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(178, 0);
    g.lineTo(166, 50);
    g.lineTo(190, 85);
    g.moveTo(166, 50);
    g.lineTo(140, 80);
    g.moveTo(176, 14);
    g.lineTo(200, 40);
    g.moveTo(176, 14);
    g.lineTo(150, 30);
    g.stroke();
    g.restore();
    g.fillStyle = "#FFFFFF";
    g.textAlign = "center";
    g.font = "bold 92px Arial, Helvetica, sans-serif";
    g.fillText("TSUNAMI", 320, 470);
    g.font = "bold 70px Arial, Helvetica, sans-serif";
    g.fillText("HAZARD ZONE", 320, 555);
    g.font = "bold 38px Arial, Helvetica, sans-serif";
    g.fillText("IN CASE OF EARTHQUAKE,", 320, 645);
    g.fillText("GO TO HIGH GROUND", 320, 692);
    g.fillText("OR INLAND", 320, 739);
  }));

export const TOWER = { x: -8.5, z: 13.0, deck: 2.0 };
const Tower: React.FC = () => {
  const y = groundY(TOWER.x, TOWER.z);
  const white = std("#F2F2EE", { roughness: 0.75 });
  const teal = std("#2A9D8F", { roughness: 0.7 });
  const yellow = std("#F4C430", { roughness: 0.6 });
  // facing you (and the sea behind you), so its sign reads when you turn round
  const rot = Math.atan2(YOU.x - TOWER.x, YOU.z - TOWER.z);
  return (
    <group position={[TOWER.x, y, TOWER.z]} rotation={[0, rot, 0]}>
      {[-1.1, 1.1].map((sx) =>
        [-1.1, 1.1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx, 1.0, sz]} material={white} castShadow>
            <boxGeometry args={[0.14, 2.0, 0.14]} />
          </mesh>
        )),
      )}
      {/* cross bracing */}
      {[-1.1, 1.1].map((sx) => (
        <mesh key={sx} position={[sx, 1.0, 0]} rotation={[0.74, 0, 0]} material={white}>
          <boxGeometry args={[0.07, 2.9, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, 2.0 - 0.06, 0.1]} material={white} castShadow receiveShadow>
        <boxGeometry args={[2.7, 0.12, 3.0]} />
      </mesh>
      {/* the hut at the back, the deck in front (facing the sea, +z here) */}
      <mesh position={[0, 2.9, -0.55]} material={teal} castShadow>
        <boxGeometry args={[2.4, 1.7, 1.6]} />
      </mesh>
      <mesh position={[0, 3.86, -0.35]} rotation={[0.12, 0, 0]} material={yellow} castShadow>
        <boxGeometry args={[2.8, 0.12, 2.3]} />
      </mesh>
      <mesh position={[0, 2.85, 0.27]} material={std("#1B2A33", { roughness: 0.2, metalness: 0.3 })}>
        <boxGeometry args={[1.8, 0.7, 0.02]} />
      </mesh>
      {/* deck railing */}
      <mesh position={[0, 2.5, 1.55]} material={yellow}>
        <boxGeometry args={[2.7, 0.07, 0.07]} />
      </mesh>
      {[-1.3, 0, 1.3].map((sx) => (
        <mesh key={sx} position={[sx, 2.25, 1.55]} material={yellow}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      ))}
      {/* the ramp down the back */}
      <mesh position={[0, 1.0, -2.6]} rotation={[-0.62, 0, 0]} material={white} castShadow>
        <boxGeometry args={[1.0, 0.07, 3.6]} />
      </mesh>
      {/* the tsunami sign, across the front legs */}
      <mesh position={[0, 1.0, 1.17]} castShadow>
        <planeGeometry args={[1.5, 1.875]} />
        <meshStandardMaterial map={hazardSign()} roughness={0.45} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.0, 1.15]} material={std("#C8CCD0", { metalness: 0.6, roughness: 0.4 })}>
        <boxGeometry args={[1.53, 1.9, 0.02]} />
      </mesh>
      {/* flags */}
      <mesh position={[1.25, 4.6, -1.2]} material={std("#888888", { metalness: 0.6 })}>
        <cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />
      </mesh>
      <mesh
        position={[1.62, 5.15, -1.2]}
        material={std("#D62828", { roughness: 0.8, side: THREE.DoubleSide })}
      >
        <planeGeometry args={[0.72, 0.46]} />
      </mesh>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* The sandcastle and the beach ball                                    */
/* ------------------------------------------------------------------ */

export const CASTLE = { x: -0.32, z: -1.8 };
const Sandcastle: React.FC = () => {
  const y = groundY(CASTLE.x, CASTLE.z);
  const sand = std("#C9A97C", { roughness: 0.85 });
  const tower = (x: number, z: number, h: number, r: number, k: number) => (
    <group key={k} position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} material={sand} castShadow receiveShadow>
        <cylinderGeometry args={[r * 0.9, r, h, 14]} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * r * 0.75, h + 0.02, Math.cos(a) * r * 0.75]} material={sand}>
            <boxGeometry args={[r * 0.35, 0.04, r * 0.35]} />
          </mesh>
        );
      })}
    </group>
  );
  return (
    <group position={[CASTLE.x, y - 0.01, CASTLE.z]} rotation={[0, 0.3, 0]}>
      <mesh position={[0, 0.06, 0]} material={sand} receiveShadow castShadow>
        <cylinderGeometry args={[0.36, 0.42, 0.12, 20]} />
      </mesh>
      {tower(0, 0, 0.3, 0.13, 0)}
      {tower(0.22, 0.18, 0.2, 0.08, 1)}
      {tower(-0.22, 0.18, 0.2, 0.08, 2)}
      {tower(0.22, -0.2, 0.2, 0.08, 3)}
      {tower(-0.22, -0.2, 0.2, 0.08, 4)}
      <mesh position={[0, 0.42, 0]} material={std("#6B4A2F")}>
        <cylinderGeometry args={[0.005, 0.005, 0.2, 5]} />
      </mesh>
      <mesh position={[0.045, 0.49, 0]} material={std("#E63946", { side: THREE.DoubleSide })}>
        <planeGeometry args={[0.08, 0.05]} />
      </mesh>
      {/* bucket and spade */}
      <group position={[0.55, 0, 0.12]} rotation={[0, 0, 0.08]}>
        <mesh
          position={[0, 0.09, 0]}
          material={std("#E63946", { roughness: 0.4, side: THREE.DoubleSide })}
          castShadow
        >
          <cylinderGeometry args={[0.1, 0.075, 0.18, 18, 1, true]} />
        </mesh>
        <mesh position={[0, 0.005, 0]} material={std("#E63946", { roughness: 0.4 })}>
          <cylinderGeometry args={[0.075, 0.075, 0.01, 18]} />
        </mesh>
      </group>
      <group position={[-0.5, 0.03, 0.25]} rotation={[-Math.PI / 2 + 0.05, 0, 0.7]}>
        <mesh position={[0, 0.12, 0]} material={std("#FFD60A", { roughness: 0.4 })} castShadow>
          <boxGeometry args={[0.025, 0.24, 0.02]} />
        </mesh>
        <mesh position={[0, -0.03, 0]} material={std("#FFD60A", { roughness: 0.4 })}>
          <boxGeometry args={[0.09, 0.1, 0.012]} />
        </mesh>
      </group>
    </group>
  );
};

const BALL0 = { x: 1.15, z: -5.2 };
const BeachBall: React.FC<{ u: number }> = ({ u }) => {
  const map = tex("ball", () =>
    canvasTex(512, 256, (g) => {
      const cols = ["#E63946", "#FFFFFF", "#1D7FD1", "#FFFFFF", "#FFD60A", "#FFFFFF"];
      cols.forEach((c, k) => {
        g.fillStyle = c;
        g.fillRect((k * 512) / 6, 0, 512 / 6 + 1, 256);
      });
    }),
  );
  // bobbing in the shallows; then the sea drags it out with it
  const z = Math.min(BALL0.z, edgeZ(BALL0.x, u) - 0.9 - 0.4 * smooth(3.3, 6, u));
  const lv = levelAt(BALL0.x, z, u);
  const y = Math.max(lv.y, lv.g) + 0.22;
  const roll = (BALL0.z - z) / 0.3;
  return (
    <mesh position={[BALL0.x, y, z]} rotation={[-roll, 0.4, Math.sin(u * 1.7) * 0.2]} castShadow>
      <sphereGeometry args={[0.3, 24, 16]} />
      <meshStandardMaterial map={map} roughness={0.35} />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/* Boats                                                                */
/* ------------------------------------------------------------------ */

/** A hull: lofted V sections from the stern (+z) to a fine bow (-z); origin at the keel, middle of the boat. */
const hull = (L: number, B: number, H: number, bottom: string, top: string, stripe: string) => {
  const ST = 18;
  const SEC = 11;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cb = C(bottom);
  const ct = C(top);
  const cs = C(stripe);
  for (let k = 0; k <= ST; k++) {
    const t = k / ST; // 0 stern, 1 bow
    const z = L / 2 - t * L;
    const hb =
      (B / 2) *
      (t < 0.55
        ? 1 - 0.12 * Math.pow((0.55 - t) / 0.55, 2)
        : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 1.8))));
    const deck = H * (1 + 0.18 * t * t);
    const keel = H * 0.42 * smooth(0.6, 1, t);
    for (let s = 0; s <= SEC; s++) {
      const a = (s / SEC) * Math.PI;
      const x = Math.cos(a) * Math.max(hb, 0.002);
      const y = deck - (deck - keel) * Math.pow(Math.sin(a), 0.75);
      pos.push(x, y, z);
      const c = y < H * 0.28 ? cb : y < H * 0.36 ? cs : ct;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let k = 0; k < ST; k++)
    for (let s = 0; s < SEC; s++) {
      const a = k * (SEC + 1) + s;
      const b = a + 1;
      const c = a + SEC + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // the deck: a strip across each station
  const base = pos.length / 3;
  for (let k = 0; k <= ST; k++) {
    const i0 = k * (SEC + 1);
    const i1 = k * (SEC + 1) + SEC;
    pos.push(
      pos[i0 * 3],
      pos[i0 * 3 + 1] - 0.02,
      pos[i0 * 3 + 2],
      pos[i1 * 3],
      pos[i1 * 3 + 1] - 0.02,
      pos[i1 * 3 + 2],
    );
    const d = C("#D9CFC1");
    col.push(d.r, d.g, d.b, d.r, d.g, d.b);
  }
  for (let k = 0; k < ST; k++) {
    const a = base + k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // the transom
  const tb = pos.length / 3;
  for (let s = 0; s <= SEC; s++) {
    pos.push(pos[s * 3], pos[s * 3 + 1], pos[s * 3 + 2] + 0.001);
    col.push(ct.r, ct.g, ct.b);
  }
  for (let s = 1; s < SEC; s++) idx.push(tb, tb + s, tb + s + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

let hullMatCache: THREE.MeshStandardMaterial | null = null;
const hullMat = () =>
  (hullMatCache ??= new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    side: THREE.DoubleSide,
  }));

type BoatKind = "sail" | "motor" | "jetski" | "yacht";
type BoatSpec = { kind: BoatKind; x: number; z: number; heading: number; seed: number };
const BOATS: BoatSpec[] = [
  { kind: "sail", x: -36, z: -118, heading: 0.5, seed: 1 },
  { kind: "motor", x: 23, z: -61, heading: -0.9, seed: 2 },
  { kind: "jetski", x: 9.5, z: -27, heading: 2.1, seed: 3 },
  { kind: "motor", x: -58, z: -86, heading: 1.8, seed: 4 },
  { kind: "yacht", x: -430, z: -1500, heading: 1.2, seed: 5 },
];

const BOAT_DIMS: Record<
  BoatKind,
  { L: number; B: number; H: number; draft: number; fin: number; roll: number }
> = {
  sail: { L: 8.2, B: 2.7, H: 1.25, draft: 0.38, fin: 1.25, roll: 0.62 },
  motor: { L: 5.6, B: 2.1, H: 0.95, draft: 0.3, fin: 0, roll: 0.12 },
  jetski: { L: 3.0, B: 1.1, H: 0.62, draft: 0.2, fin: 0, roll: 1.25 },
  yacht: { L: 11, B: 3.4, H: 1.5, draft: 0.5, fin: 1.6, roll: 0.5 },
};

const Rigging: React.FC<{ from: THREE.Vector3; to: THREE.Vector3; r?: number; mat?: THREE.Material }> = ({
  from,
  to,
  r = 0.012,
  mat,
}) => {
  const d = to.clone().sub(from);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return (
    <mesh
      position={from.clone().add(to).multiplyScalar(0.5)}
      quaternion={q}
      material={mat ?? std("#BFC4C8", { metalness: 0.7, roughness: 0.3 })}
    >
      <cylinderGeometry args={[r, r, len, 5]} />
    </mesh>
  );
};

const Boat: React.FC<{ b: BoatSpec; u: number }> = ({ b, u }) => {
  const dims = BOAT_DIMS[b.kind];
  const geo = useMemo(
    () =>
      b.kind === "sail" || b.kind === "yacht"
        ? hull(dims.L, dims.B, dims.H, "#1D3557", "#F4F4F0", "#1D7FD1")
        : b.kind === "motor"
          ? hull(dims.L, dims.B, dims.H, "#8D1B1B", b.seed === 4 ? "#E8E2D0" : "#F4F4F0", "#264653")
          : hull(dims.L, dims.B, dims.H, "#202020", "#FFD60A", "#FFFFFF"),
    [b.kind, b.seed, dims.L, dims.B, dims.H],
  );
  // afloat it sits at the water; when the water's gone it settles on the sand and falls over on its keel
  const here = levelAt(b.x, b.z, u);
  const floatY = here.y - dims.draft;
  const restY = here.g + dims.fin;
  const grounded = smooth(-0.05, 0.35, restY - floatY);
  const y = Math.max(floatY, here.g + dims.fin * (1 - grounded) + (dims.fin > 0 ? 0.5 : 0.02) * grounded);
  // afloat, it rides the surface (up the face of the wave at the end)
  const dl = 2.2;
  const fz = levelAt(b.x, b.z - dl, u).y - levelAt(b.x, b.z + dl, u).y;
  const fx = levelAt(b.x + dl, b.z, u).y - levelAt(b.x - dl, b.z, u).y;
  const afloat = 1 - grounded;
  const pitch = Math.max(-1.25, Math.min(1.25, Math.atan2(fz, 2 * dl))) * afloat;
  const rollW = Math.max(-1.25, Math.min(1.25, Math.atan2(fx, 2 * dl))) * afloat;
  const fall = smooth(0, 1, (u - fallStart(b)) / 1.6);
  const roll = dims.roll * grounded * (b.seed % 2 ? 1 : -1) * fall + rollW;
  const mast = b.kind === "sail" || b.kind === "yacht";
  return (
    <group position={[b.x, y, b.z]} rotation={[pitch, 0, 0]}>
      <group rotation={[0, b.heading, roll]}>
        <mesh geometry={geo} material={hullMat()} castShadow />
        {mast ? (
          <>
            {/* the keel fin */}
            <mesh
              position={[0, -dims.fin / 2 + 0.05, 0.3]}
              material={std("#1D3557", { roughness: 0.4 })}
              castShadow
            >
              <boxGeometry args={[0.16, dims.fin, 1.5]} />
            </mesh>
            <mesh position={[0, dims.H + 0.25, 0.6]} material={std("#F4F4F0", { roughness: 0.4 })} castShadow>
              <boxGeometry args={[1.7, 0.5, 2.6]} />
            </mesh>
            <mesh
              position={[0, dims.H + 5.6, -0.8]}
              material={std("#D0D4D8", { metalness: 0.7, roughness: 0.3 })}
              castShadow
            >
              <cylinderGeometry args={[0.06, 0.08, 11, 8]} />
            </mesh>
            <mesh
              position={[0, dims.H + 1.25, 1.0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={std("#D0D4D8", { metalness: 0.7, roughness: 0.3 })}
            >
              <cylinderGeometry args={[0.05, 0.05, 3.6, 8]} />
            </mesh>
            <mesh
              position={[0, dims.H + 1.38, 1.0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={std("#1D4E89", { roughness: 0.8 })}
              castShadow
            >
              <cylinderGeometry args={[0.16, 0.12, 3.3, 10]} />
            </mesh>
            <Rigging
              from={new THREE.Vector3(0, dims.H + 11, -0.8)}
              to={new THREE.Vector3(0, dims.H + 0.1, -dims.L / 2 + 0.2)}
            />
            <Rigging
              from={new THREE.Vector3(0, dims.H + 11, -0.8)}
              to={new THREE.Vector3(0, dims.H + 0.1, dims.L / 2 - 0.2)}
            />
            {b.kind === "yacht" ? (
              // the far yacht still has its sails up
              <mesh
                geometry={sailGeo()}
                position={[0, dims.H + 0.6, -0.8]}
                material={std("#FAFAF5", { roughness: 0.7, side: THREE.DoubleSide })}
              />
            ) : null}
          </>
        ) : null}
        {b.kind === "motor" ? (
          <>
            <mesh position={[0, dims.H + 0.35, 0.3]} material={std("#F4F4F0", { roughness: 0.4 })} castShadow>
              <boxGeometry args={[0.8, 0.7, 0.7]} />
            </mesh>
            <mesh
              position={[0, dims.H + 0.85, 0.05]}
              rotation={[-0.4, 0, 0]}
              material={std("#26343D", { roughness: 0.1, metalness: 0.4 })}
            >
              <boxGeometry args={[0.85, 0.4, 0.03]} />
            </mesh>
            <mesh
              position={[0, dims.H - 0.1, dims.L / 2 + 0.15]}
              material={std("#151515", { roughness: 0.4 })}
              castShadow
            >
              <boxGeometry args={[0.35, 0.9, 0.4]} />
            </mesh>
          </>
        ) : null}
        {b.kind === "jetski" ? (
          <>
            <mesh position={[0, dims.H + 0.12, 0.3]} material={std("#111111", { roughness: 0.6 })}>
              <boxGeometry args={[0.38, 0.18, 1.1]} />
            </mesh>
            <mesh
              position={[0, dims.H + 0.4, -0.45]}
              rotation={[0, 0, Math.PI / 2]}
              material={std("#222222", { roughness: 0.4 })}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
            </mesh>
          </>
        ) : null}
      </group>
    </group>
  );
};

/** When a boat first touched bottom (so it falls over over a second and a half from then). */
const fallCache = new Map<number, number>();
const fallStart = (b: BoatSpec) => {
  const hit = fallCache.get(b.seed);
  if (hit !== undefined) return hit;
  const dims = BOAT_DIMS[b.kind];
  let t = 1e9;
  for (let s = 0; s < 12; s += 0.05) {
    const lv = levelAt(b.x, b.z, s);
    if (lv.g + dims.fin > lv.y - dims.draft) {
      t = s;
      break;
    }
  }
  fallCache.set(b.seed, t);
  return t;
};

let sailCache: THREE.BufferGeometry | null = null;
/** A mainsail: a tall triangle from the masthead down the mast and aft along the boom. */
const sailGeo = () => {
  if (sailCache) return sailCache;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 10.2, 0, 0, 0.8, 0, 0, 0.8, 3.4], 3));
  g.computeVertexNormals();
  sailCache = g;
  return g;
};

export const Boats: React.FC<{ u: number }> = ({ u }) => (
  <group>
    {BOATS.map((b) => (
      <Boat key={b.seed} b={b} u={u} />
    ))}
  </group>
);

/* ------------------------------------------------------------------ */
/* The sea floor: rocks, coral, weed, shells, starfish                   */
/* ------------------------------------------------------------------ */

const rockGeo = (seed: number, detail = 1) => {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 1.7 + seed, v.y * 1.7 + v.z * 1.3 - seed);
    v.multiplyScalar(0.75 + 0.5 * n);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
};

type Inst = { x: number; y: number; z: number; s: number; sy: number; ry: number; c: THREE.Color };

const scatter = () => {
  const R = rng(777);
  const rocks: Inst[] = [];
  const coral: Inst[] = [];
  const weed: Inst[] = [];
  const shells: Inst[] = [];
  const stars: Inst[] = [];
  const rockCols = ["#4F4740", "#5C5248", "#3F4038", "#625A4C"].map(C);
  const coralCols = ["#C9787E", "#B98AB8", "#D9A066", "#8FB0A0", "#C2B280"].map(C);
  for (let k = 0; k < 9000 && rocks.length < 340; k++) {
    const x = (R() * 2 - 1) * 260;
    const z = -30 - R() * 300;
    const reef = reefAt(x, z);
    if (reef < 0.12 || R() > 0.55) continue;
    const s = 0.3 + R() * 0.9 + reef * 0.5;
    rocks.push({
      x,
      y: groundY(x, z) - s * 0.25,
      z,
      s,
      sy: 0.6 + R() * 0.5,
      ry: R() * 6.3,
      c: rockCols[k % 4].clone(),
    });
  }
  for (let k = 0; k < 6000 && coral.length < 140; k++) {
    const x = (R() * 2 - 1) * 200;
    const z = -40 - R() * 240;
    if (reefAt(x, z) < 0.05 || R() > 0.4) continue;
    const s = 0.25 + R() * 0.45;
    coral.push({
      x,
      y: groundY(x, z) - s * 0.2,
      z,
      s,
      sy: 0.7 + R() * 0.5,
      ry: R() * 6.3,
      c: coralCols[k % 5].clone(),
    });
  }
  for (let k = 0; k < 900; k++) {
    const x = (R() * 2 - 1) * 70;
    const z = -6 - R() * 140;
    if (z - shoreZ(x) > -5) continue;
    weed.push({
      x,
      y: groundY(x, z) + 0.012,
      z,
      s: 0.5 + R() * 0.9,
      sy: 1,
      ry: R() * 6.3,
      c: C(R() > 0.5 ? "#3C4A22" : "#55602A"),
    });
  }
  for (let k = 0; k < 260; k++) {
    const x = (R() * 2 - 1) * 14;
    const z = -1.5 - R() * 26;
    shells.push({
      x,
      y: groundY(x, z) + 0.006,
      z,
      s: 0.015 + R() * 0.02,
      sy: 0.45,
      ry: R() * 6.3,
      c: C(R() > 0.3 ? "#EDE3D3" : "#D9B9A6"),
    });
  }
  for (let k = 0; k < 7; k++) {
    const x = (R() * 2 - 1) * 9;
    const z = -4 - R() * 22;
    stars.push({
      x,
      y: groundY(x, z) + 0.012,
      z,
      s: 0.08 + R() * 0.05,
      sy: 1,
      ry: R() * 6.3,
      c: C(R() > 0.5 ? "#C8553D" : "#B23A2E"),
    });
  }
  return { rocks, coral, weed, shells, stars };
};

const Instanced: React.FC<{
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  list: Inst[];
  flat?: boolean;
  shadow?: boolean;
}> = ({ geo, mat, list, flat, shadow }) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const o = new THREE.Object3D();
    list.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z);
      o.rotation.set(flat ? -Math.PI / 2 : 0, flat ? 0 : it.ry, flat ? it.ry : 0);
      o.scale.set(it.s, flat ? it.s : it.s * it.sy, it.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, it.c);
    });
    m.castShadow = !!shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }, [geo, mat, list, flat, shadow]);
  return <primitive object={mesh} />;
};

const starGeo = () => {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = k % 2 ? 0.38 : 1;
    if (k === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r);
    else s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: 2,
  });
  return g;
};

const weedGeo = () => {
  const g = new THREE.PlaneGeometry(0.16, 1, 1, 4);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 3) * 0.08);
  return g;
};

export const SeaFloor: React.FC = () => {
  const s = useMemo(scatter, []);
  const geos = useMemo(
    () => ({
      rock: rockGeo(3.1),
      coral: rockGeo(7.7, 2),
      weed: weedGeo(),
      shell: new THREE.SphereGeometry(1, 8, 6),
      star: starGeo(),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      rock: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 }),
      coral: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      weed: new THREE.MeshStandardMaterial({ roughness: 0.25, side: THREE.DoubleSide }),
      shell: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
      star: new THREE.MeshStandardMaterial({ roughness: 0.5 }),
    }),
    [],
  );
  return (
    <group>
      <Instanced geo={geos.rock} mat={mats.rock} list={s.rocks} shadow />
      <Instanced geo={geos.coral} mat={mats.coral} list={s.coral} />
      <Instanced geo={geos.weed} mat={mats.weed} list={s.weed} flat />
      <Instanced geo={geos.shell} mat={mats.shell} list={s.shells} />
      <Instanced geo={geos.star} mat={mats.star} list={s.stars} flat />
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Fish, flopping once the water's gone                                 */
/* ------------------------------------------------------------------ */

type FishSpec = { x: number; z: number; ry: number; len: number; col: string; seed: number };
const FISH: FishSpec[] = (() => {
  const R = rng(99);
  const out: FishSpec[] = [];
  const cols = ["#B9C3CC", "#A7B4BF", "#C9D1D8", "#9AA9B5"];
  for (let k = 0; k < 16; k++) {
    const x = (R() * 2 - 1) * (3 + k * 0.7);
    const z = -3.4 - R() * (7 + k * 1.4);
    out.push({ x, z, ry: R() * 6.3, len: 0.3 + R() * 0.18, col: cols[k % 4], seed: k });
  }
  return out;
})();

const Fish: React.FC<{ f: FishSpec; u: number }> = ({ f, u }) => {
  const lv = levelAt(f.x, f.z, u);
  const dry = smooth(0.0, 0.03, lv.g - lv.y + 0.015);
  // a flop every second or so: a hop, a flip, a flick of the tail
  const per = 0.75 + (f.seed % 5) * 0.12;
  const ph = ((u + f.seed * 0.37) % per) / per;
  const hop = dry * Math.max(0, Math.sin(ph * Math.PI * 2)) * (ph < 0.5 ? 1 : 0) * 0.13;
  const flip = dry * Math.sin(ph * Math.PI * 2) * 1.1;
  const tail = Math.sin(u * (dry > 0.5 ? 22 : 6) + f.seed) * (0.35 + 0.4 * dry);
  const y = lv.g + 0.03 + hop + (1 - dry) * Math.max(0, Math.min(0.25, lv.y - lv.g - 0.1)) * 0.5;
  return (
    <group position={[f.x, y, f.z]} rotation={[0, f.ry, (Math.PI / 2) * dry * 0.85 + flip * 0.5]}>
      <mesh
        scale={[f.len * 0.16, f.len * 0.3, f.len * 0.5]}
        material={std(f.col, { roughness: 0.15, metalness: 0.6 })}
        castShadow
      >
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      <mesh
        position={[0, f.len * 0.13, 0]}
        scale={[f.len * 0.12, f.len * 0.16, f.len * 0.44]}
        material={std("#4A5A66", { roughness: 0.2, metalness: 0.4 })}
      >
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh
          key={sd}
          position={[sd * f.len * 0.13, f.len * 0.05, -f.len * 0.36]}
          material={std("#101010", { roughness: 0.1 })}
        >
          <sphereGeometry args={[f.len * 0.035, 8, 6]} />
        </mesh>
      ))}
      <group position={[0, 0, f.len * 0.45]} rotation={[0, tail, 0]}>
        <mesh
          position={[0, 0, f.len * 0.16]}
          rotation={[0, Math.PI / 2, 0]}
          material={std(f.col, { roughness: 0.3, metalness: 0.4, side: THREE.DoubleSide })}
        >
          <circleGeometry args={[f.len * 0.2, 3]} />
        </mesh>
      </group>
    </group>
  );
};

export const Fishes: React.FC<{ u: number }> = ({ u }) => (
  <group>
    {FISH.map((f) => (
      <Fish key={f.seed} f={f} u={u} />
    ))}
  </group>
);

export const Beach: React.FC<{ u: number; wind: number }> = ({ u, wind }) => (
  <group>
    <Palms t={u} wind={wind} />
    {UMBRELLAS.map((m, i) => (
      <Umbrella key={i} {...m} wind={wind} t={u} />
    ))}
    {TOWELS.map((m, i) => (
      <Towel key={i} {...m} />
    ))}
    <Lounger x={8.2} z={9.6} r={0.5} color="#2A9D8F" />
    <Lounger x={9.4} z={10.4} r={0.45} color="#E76F51" />
    {BOARDS.map((b, i) => (
      <Board key={i} {...b} />
    ))}
    <Tower />
    <Sandcastle />
    <BeachBall u={u} />
    <mesh
      position={[6.4, groundY(6.4, 8.9) + 0.2, 8.9]}
      rotation={[0, 0.3, 0]}
      material={std("#1D7FD1", { roughness: 0.4 })}
      castShadow
    >
      <boxGeometry args={[0.6, 0.4, 0.4]} />
    </mesh>
  </group>
);
