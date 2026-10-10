import React, { useMemo } from "react";
import * as THREE from "three";
import type { PState, Spec } from "../pov/crowd";
import { Human, lookFor, type Direction } from "../pov/Human";
import { HR, HX, HZ } from "./timeline";
import { glowMat, std } from "./mats";

/**
 * The plaza around the hole: a rope barrier on stanchions (open where you walk up), a warning sign across
 * the hole, and the people who came to look: filming, staring, one waving you off, two leaning over the
 * rope to watch you drop (from down the shaft you see their faces against the sky).
 */

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export const ROPE_R = 5.3;
/** The gap in the rope you walk through (angles from +z, rad). */
const GAP = 0.42;

type Onlooker = { th: number; r: number; h: number; kid?: boolean; act: Direction["act"]; lean?: number; react?: number };

const ONLOOKERS: Onlooker[] = [
  { th: Math.PI - 0.22, r: 5.75, h: 1.78, act: "stare", react: 1 },
  { th: Math.PI - 0.5, r: 6.0, h: 1.28, kid: true, act: "stare", react: 1 },
  // two who ducked under the rope to the very edge, leaning over to watch you go
  { th: Math.PI + 0.42, r: 4.85, h: 1.68, act: "stare", lean: 0.5, react: 1 },
  { th: Math.PI - 0.62, r: 4.82, h: 1.72, act: "film", lean: 0.55 },
  { th: Math.PI + 0.95, r: 5.9, h: 1.64, act: "film" },
  { th: Math.PI - 1.05, r: 6.2, h: 1.74, act: "film" },
  { th: Math.PI / 2 + 0.05, r: 6.4, h: 1.81, act: "wave" },
  { th: -Math.PI / 2 - 0.2, r: 6.3, h: 1.62, act: "stare", react: 1 },
  { th: Math.PI + 0.32, r: 7.4, h: 1.86, act: "film" },
  { th: 1.0, r: 7.2, h: 1.7, act: "stare", react: 1 },
  { th: -1.05, r: 7.0, h: 1.66, act: "film" },
  { th: Math.PI - 0.4, r: 7.9, h: 1.58, act: "stare", react: 1 },
];

const SPECS: Spec[] = ONLOOKERS.map((o, k) => {
  const x = HX + Math.sin(o.th) * o.r;
  const z = HZ + Math.cos(o.th) * o.r;
  return {
    i: 211 + k * 3,
    role: "photo",
    kid: !!o.kid,
    height: o.h,
    speed: 0,
    jumpEvery: 0,
    v0: 2.5,
    route: [[x, z]],
    start: [x, z],
    face0: Math.atan2(HX - x, HZ - z),
    liftAt: 1e9,
    seed: 17 + k * 41,
  };
});
const LOOKS = SPECS.map(lookFor);
const STATES: PState[] = SPECS.map((sp) => ({
  x: sp.start[0],
  y: 0,
  z: sp.start[1],
  vx: 0,
  vy: 0,
  vz: 0,
  heading: sp.face0,
  phase: 0,
  wp: 0,
  air: false,
  free: false,
  freeAt: 1e9,
  tx: 0,
  ty: 0,
  tz: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  landAt: -10,
  impact: 0,
  nextJump: 1e9,
  jumpAt: -10,
  jumpKind: 0,
  speed: 0,
}));

let signTex: THREE.Texture | null = null;
const sign = () => {
  if (signTex) return signTex;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 560;
  const g = c.getContext("2d")!;
  g.fillStyle = "#F2C230";
  g.fillRect(0, 0, 1024, 560);
  g.strokeStyle = "#141414";
  g.lineWidth = 22;
  g.strokeRect(22, 22, 980, 516);
  // hazard stripes along the top
  g.save();
  g.beginPath();
  g.rect(33, 33, 958, 70);
  g.clip();
  for (let x = -100; x < 1100; x += 70) {
    g.fillStyle = "#141414";
    g.beginPath();
    g.moveTo(x, 103);
    g.lineTo(x + 35, 103);
    g.lineTo(x + 105, 33);
    g.lineTo(x + 70, 33);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = "#141414";
  g.textAlign = "center";
  g.font = "bold 66px sans-serif";
  g.fillText("HOLE THROUGH THE EARTH", 512, 190);
  g.font = "bold 50px sans-serif";
  g.fillText("12,742 km TO THE OTHER SIDE", 512, 262);
  g.fillStyle = "#C0261C";
  g.font = "bold 132px sans-serif";
  g.fillText("DO NOT JUMP", 512, 432);
  signTex = new THREE.CanvasTexture(c);
  signTex.colorSpace = THREE.SRGBColorSpace;
  signTex.anisotropy = 8;
  return signTex;
};

/** Stanchion posts round the hole and the sagging rope between them. */
const Barrier: React.FC = () => {
  const posts = useMemo(() => {
    const out: number[] = [];
    const n = 20;
    for (let k = 0; k < n; k++) {
      const a = GAP + ((Math.PI * 2 - 2 * GAP) * k) / (n - 1);
      out.push(a);
    }
    return out;
  }, []);
  const rope = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < posts.length - 1; k++) {
      const a0 = posts[k];
      const a1 = posts[k + 1];
      for (let s = 0; s < 8; s++) {
        const u = s / 8;
        const a = a0 + (a1 - a0) * u;
        pts.push(
          new THREE.Vector3(Math.sin(a) * ROPE_R, 0.9 - 0.12 * Math.sin(u * Math.PI), Math.cos(a) * ROPE_R),
        );
      }
    }
    const a = posts[posts.length - 1];
    pts.push(new THREE.Vector3(Math.sin(a) * ROPE_R, 0.9, Math.cos(a) * ROPE_R));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.022, 6, false);
  }, [posts]);
  return (
    <group position={[HX, 0, HZ]}>
      {posts.map((a, k) => (
        <group key={k} position={[Math.sin(a) * ROPE_R, 0, Math.cos(a) * ROPE_R]}>
          <mesh position={[0, 0.03, 0]} material={std("#C9A44A", { metalness: 0.8, roughness: 0.3 })}>
            <cylinderGeometry args={[0.16, 0.18, 0.06, 18]} />
          </mesh>
          <mesh position={[0, 0.47, 0]} material={std("#D7B45A", { metalness: 0.85, roughness: 0.25 })}>
            <cylinderGeometry args={[0.03, 0.03, 0.9, 10]} />
          </mesh>
          <mesh position={[0, 0.94, 0]} material={std("#D7B45A", { metalness: 0.85, roughness: 0.25 })}>
            <sphereGeometry args={[0.05, 12, 8]} />
          </mesh>
        </group>
      ))}
      <mesh geometry={rope} material={std("#8E1B1B", { roughness: 0.6 })} castShadow />
    </group>
  );
};

export const Spectators: React.FC<{ t: number; cam: THREE.Vector3 }> = ({ t, cam }) => {
  // they flinch as you jump: a gasp from 3.3 s
  const gasp = smooth(3.25, 3.9, t);
  return (
    <group>
      <Barrier />
      {/* the sign, across the hole, facing you as you walk up */}
      <group position={[HX + 0.6, 0, HZ - HR - 2.2]}>
        {[-1.15, 1.15].map((x) => (
          <mesh key={x} position={[x, 1.1, -0.04]} material={std("#2A2A2E", { metalness: 0.5 })}>
            <boxGeometry args={[0.08, 2.2, 0.08]} />
          </mesh>
        ))}
        <mesh position={[0, 1.72, 0]}>
          <planeGeometry args={[2.4, 1.31]} />
          <meshStandardMaterial map={sign()} roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.72, -0.03]} material={std("#2A2A2E")}>
          <boxGeometry args={[2.46, 1.37, 0.04]} />
        </mesh>
        {/* a blinking amber beacon on top */}
        <mesh position={[0, 2.46, 0]} material={glowMat("#FFB020", t % 0.9 < 0.4 ? 9 : 0.4)}>
          <sphereGeometry args={[0.09, 12, 8]} />
        </mesh>
      </group>
      {SPECS.map((sp, k) => {
        const o = ONLOOKERS[k];
        const dir: Direction = {
          act: o.act,
          watch: true,
          lean: o.lean ? o.lean * smooth(3.0, 4.2, t) + 0.05 : 0,
          react: o.react ? o.react * gasp : undefined,
          wave: o.act === "wave" ? smooth(1.6, 2.3, t) * (1 - smooth(6.6, 7.2, t)) : undefined,
        };
        const st = STATES[k];
        return (
          <Human
            key={k}
            sp={sp}
            look={LOOKS[k]}
            st={st}
            t={t}
            cam={cam}
            detail={Math.hypot(st.x - cam.x, 1.6 - cam.y, st.z - cam.z) < 30}
            dir={dir}
          />
        );
      })}
    </group>
  );
};
