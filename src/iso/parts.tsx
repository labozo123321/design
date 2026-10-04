import React, { useMemo } from "react";
import * as THREE from "three";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ISO, MAT, clockTexture, glowTexture, skylineTexture } from "./look";
import CUES from "./cues.json";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export type V3 = [number, number, number];

/** Weighted mechanical settle: rises, overshoots a hair, locks. */
export const useSettle = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (at: number, stiffness = 140) =>
    spring({ frame: frame - at, fps, config: { damping: 15, stiffness, mass: 0.9 } });
};

/** Additive glow sprite. */
export const Halo: React.FC<{ position: V3; size: number; color: string; opacity: number }> = ({
  position,
  size,
  color,
  opacity,
}) => {
  const mat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [color],
  );
  mat.opacity = Math.max(0, opacity);
  if (opacity <= 0.001) return null;
  return <sprite position={position} scale={[size, size, 1]} material={mat} />;
};

const goldMat = (k: number) =>
  new THREE.MeshStandardMaterial({
    color: ISO.gold,
    roughness: 0.3,
    metalness: 0.85,
    emissive: new THREE.Color(ISO.gold),
    emissiveIntensity: k,
  });

/* ------------------------------------------------------------------ */
/* Tile                                                                 */
/* ------------------------------------------------------------------ */

export const TILE = 10;

export const Tile: React.FC<{ rail: number }> = ({ rail }) => {
  const railMat = useMemo(() => goldMat(1.4), []);
  const len = TILE * 2;
  const filled = rail * len;
  const seg1 = Math.min(TILE, filled);
  const seg2 = Math.max(0, filled - TILE);
  return (
    <group>
      <mesh position={[0, -0.35, 0]} receiveShadow castShadow material={MAT.charcoal}>
        <boxGeometry args={[TILE, 0.7, TILE]} />
      </mesh>
      {/* top surface: slightly lighter stone */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={MAT.stone}>
        <planeGeometry args={[TILE - 0.16, TILE - 0.16]} />
      </mesh>
      {/* brass trim around the top edge */}
      {[
        [0, 0.02, TILE / 2, TILE + 0.06, 0.06],
        [0, 0.02, -TILE / 2, TILE + 0.06, 0.06],
      ].map(([x, y, z, w, d], i) => (
        <mesh key={`tz${i}`} position={[x, y, z]} material={MAT.brass}>
          <boxGeometry args={[w, 0.05, d]} />
        </mesh>
      ))}
      {[TILE / 2, -TILE / 2].map((x, i) => (
        <mesh key={`tx${i}`} position={[x, 0.02, 0]} material={MAT.brass}>
          <boxGeometry args={[0.06, 0.05, TILE + 0.06]} />
        </mesh>
      ))}
      {/* progress rail: a groove on the two front faces, filling with gold */}
      <mesh position={[0, -0.2, TILE / 2 + 0.012]} material={MAT.dark}>
        <boxGeometry args={[TILE - 0.3, 0.08, 0.03]} />
      </mesh>
      <mesh position={[TILE / 2 + 0.012, -0.2, 0]} material={MAT.dark}>
        <boxGeometry args={[0.03, 0.08, TILE - 0.3]} />
      </mesh>
      {seg1 > 0.01 ? (
        <mesh position={[-TILE / 2 + 0.15 + (seg1 - 0.3) / 2, -0.2, TILE / 2 + 0.03]} material={railMat}>
          <boxGeometry args={[Math.max(0.01, seg1 - 0.3), 0.06, 0.03]} />
        </mesh>
      ) : null}
      {seg2 > 0.01 ? (
        <mesh position={[TILE / 2 + 0.03, -0.2, TILE / 2 - 0.15 - (seg2 - 0.3) / 2]} material={railMat}>
          <boxGeometry args={[0.03, 0.06, Math.max(0.01, seg2 - 0.3)]} />
        </mesh>
      ) : null}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Figure                                                               */
/* ------------------------------------------------------------------ */

/** Faceless, adult-proportioned figure. pose: sit 0..1 (1 = seated), walk phase, slump 0..1. */
export const Figure: React.FC<{
  position: V3;
  heading: number;
  sit: number;
  walk: number;
  walking: number;
  slump?: number;
  hoodie?: THREE.Material;
}> = ({ position, heading, sit, walk, walking, slump = 0, hoodie = MAT.fabric }) => {
  const swing = Math.sin(walk) * 0.45 * walking;
  const bob = Math.abs(Math.cos(walk)) * 0.012 * walking;
  const hipY = 0.27 - sit * 0.12 + bob;
  const thigh = -sit * 1.45;
  const knee = sit * 1.45;
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <group position={[0, hipY, 0]}>
        {/* legs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.035, 0, 0]} rotation={[thigh + s * swing, 0, 0]}>
            <mesh position={[0, -0.07, 0]} castShadow material={MAT.dark}>
              <capsuleGeometry args={[0.026, 0.1, 4, 8]} />
            </mesh>
            <group position={[0, -0.14, 0]} rotation={[knee + Math.max(0, -s * swing) * 0.6, 0, 0]}>
              <mesh position={[0, -0.065, 0]} castShadow material={MAT.dark}>
                <capsuleGeometry args={[0.023, 0.09, 4, 8]} />
              </mesh>
            </group>
          </group>
        ))}
        {/* torso + head */}
        <group rotation={[-0.08 - slump * 0.35, 0, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow material={hoodie}>
            <capsuleGeometry args={[0.055, 0.11, 4, 10]} />
          </mesh>
          <mesh
            position={[0, 0.245 - slump * 0.01, 0.005]}
            rotation={[-slump * 0.4, 0, 0]}
            castShadow
            material={MAT.skin}
          >
            <sphereGeometry args={[0.042, 16, 12]} />
          </mesh>
          {/* hood */}
          <mesh position={[0, 0.235, -0.018]} castShadow material={hoodie}>
            <sphereGeometry args={[0.047, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group
              key={s}
              position={[s * 0.07, 0.17, 0]}
              rotation={[-s * swing * 0.8 - sit * 0.9, 0, s * 0.08]}
            >
              <mesh position={[0, -0.07, 0]} castShadow material={hoodie}>
                <capsuleGeometry args={[0.02, 0.11, 4, 8]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Apartment corner                                                     */
/* ------------------------------------------------------------------ */

export const APT = { x: -3.4, z: -3.4, size: 2.6 };
export const DESK: V3 = [APT.x + 0.15, 0, APT.z - 0.55];
export const CHAIR: V3 = [APT.x + 0.15, 0, APT.z - 0.15];

export const Apartment: React.FC<{ laptop: number; lamp: number; build: number }> = ({
  laptop,
  lamp,
  build,
}) => {
  const sky = skylineTexture();
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#111",
        emissive: new THREE.Color(ISO.gold),
        emissiveIntensity: 0,
      }),
    [],
  );
  screenMat.emissiveIntensity = 0.15 + laptop * 2.2;
  screenMat.emissive.set(laptop > 0.05 ? ISO.gold : "#4B5A78");
  const clockMat = useMemo(() => new THREE.MeshBasicMaterial({ map: clockTexture(), toneMapped: false }), []);
  const winMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }), [sky]);
  const s = APT.size;
  const y = (1 - build) * -1.2;
  // clock hands at 9:47
  const hourA = -((9 + 47 / 60) / 12) * Math.PI * 2;
  const minA = -(47 / 60) * Math.PI * 2;
  return (
    <group position={[APT.x, y, APT.z]}>
      {/* walnut floor + low walls (back and left) */}
      <mesh position={[0, 0.03, 0]} receiveShadow material={MAT.walnut}>
        <boxGeometry args={[s, 0.06, s]} />
      </mesh>
      <mesh position={[0, 0.48, -s / 2 + 0.04]} castShadow receiveShadow material={MAT.slate}>
        <boxGeometry args={[s, 0.9, 0.08]} />
      </mesh>
      <mesh position={[-s / 2 + 0.04, 0.48, 0]} castShadow receiveShadow material={MAT.slate}>
        <boxGeometry args={[0.08, 0.9, s]} />
      </mesh>
      {/* window with night skyline, brass frame */}
      <mesh position={[0.35, 0.52, -s / 2 + 0.085]} material={winMat}>
        <planeGeometry args={[1.1, 0.5]} />
      </mesh>
      {[
        [0.35, 0.78, 1.16, 0.03],
        [0.35, 0.26, 1.16, 0.03],
      ].map(([x, yy, w, h], i) => (
        <mesh key={i} position={[x, yy, -s / 2 + 0.09]} material={MAT.brass}>
          <boxGeometry args={[w, h, 0.02]} />
        </mesh>
      ))}
      {[-0.22, 0.35, 0.92].map((x, i) => (
        <mesh key={`m${i}`} position={[x, 0.52, -s / 2 + 0.09]} material={MAT.brass}>
          <boxGeometry args={[0.025, 0.55, 0.02]} />
        </mesh>
      ))}
      {/* wall clock 9:47 on the left wall */}
      <group position={[-s / 2 + 0.09, 0.66, 0.35]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={MAT.acrylic}>
          <circleGeometry args={[0.13, 32]} />
        </mesh>
        <mesh position={[0, 0, -0.005]} material={MAT.brass}>
          <circleGeometry args={[0.145, 32]} />
        </mesh>
        <mesh position={[0, 0, 0.004]} rotation={[0, 0, hourA]} material={MAT.dark}>
          <boxGeometry args={[0.012, 0.13, 0.004]} />
        </mesh>
        <mesh
          position={[Math.sin(-hourA) * 0.035, Math.cos(-hourA) * 0.035, 0.005]}
          rotation={[0, 0, hourA]}
          material={MAT.dark}
        >
          <boxGeometry args={[0.014, 0.07, 0.004]} />
        </mesh>
        <mesh
          position={[Math.sin(-minA) * 0.05, Math.cos(-minA) * 0.05, 0.006]}
          rotation={[0, 0, minA]}
          material={MAT.dark}
        >
          <boxGeometry args={[0.008, 0.1, 0.004]} />
        </mesh>
      </group>
      {/* desk */}
      <group position={[DESK[0] - APT.x, 0.06, DESK[2] - APT.z]}>
        <mesh position={[0, 0.235, 0]} castShadow receiveShadow material={MAT.walnut}>
          <boxGeometry args={[0.62, 0.03, 0.3]} />
        </mesh>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.11, 0]} castShadow material={MAT.brass}>
            <boxGeometry args={[0.02, 0.22, 0.26]} />
          </mesh>
        ))}
        {/* laptop */}
        <mesh position={[0, 0.255, 0.02]} castShadow material={MAT.slate}>
          <boxGeometry args={[0.18, 0.008, 0.12]} />
        </mesh>
        <mesh position={[0, 0.315, -0.04]} rotation={[-0.25, 0, 0]} material={screenMat}>
          <boxGeometry args={[0.18, 0.12, 0.006]} />
        </mesh>
        {/* desk clock: 9:47 PM */}
        <mesh position={[-0.21, 0.275, -0.05]} rotation={[-0.2, 0.35, 0]} material={MAT.brass}>
          <boxGeometry args={[0.13, 0.055, 0.02]} />
        </mesh>
        <mesh position={[-0.207, 0.276, -0.039]} rotation={[-0.2, 0.35, 0]} material={clockMat}>
          <planeGeometry args={[0.115, 0.042]} />
        </mesh>
        {/* desk lamp */}
        <mesh position={[0.23, 0.32, -0.06]} rotation={[0, 0, 0.35]} material={MAT.brass}>
          <cylinderGeometry args={[0.006, 0.006, 0.16, 8]} />
        </mesh>
        <mesh position={[0.2, 0.4, -0.06]} rotation={[0, 0, -0.9]} material={MAT.brass}>
          <coneGeometry args={[0.04, 0.06, 16, 1, true]} />
        </mesh>
        <pointLight
          position={[0.18, 0.37, -0.03]}
          color={ISO.amber}
          intensity={lamp * 1.6}
          distance={2.4}
          decay={1.6}
        />
        <Halo position={[0.18, 0.37, -0.03]} size={0.5} color={ISO.amber} opacity={lamp * 0.55} />
        <pointLight
          position={[0, 0.34, 0.05]}
          color={ISO.gold}
          intensity={laptop * 1.6}
          distance={1.8}
          decay={1.6}
        />
        <Halo position={[0, 0.32, -0.02]} size={0.6} color={ISO.gold} opacity={laptop * 0.6} />
      </group>
      {/* chair */}
      <group position={[CHAIR[0] - APT.x, 0.06, CHAIR[2] - APT.z]}>
        <mesh position={[0, 0.13, 0]} castShadow material={MAT.dark}>
          <boxGeometry args={[0.16, 0.025, 0.16]} />
        </mesh>
        <mesh position={[0, 0.24, 0.075]} castShadow material={MAT.dark}>
          <boxGeometry args={[0.16, 0.2, 0.02]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={MAT.brass}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
        </mesh>
      </group>
      {/* window light spilling in */}
      <pointLight position={[0.35, 0.55, -s / 2 + 0.4]} color="#5D7BB8" intensity={0.5} distance={2} />
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Path                                                                 */
/* ------------------------------------------------------------------ */

export const PATH: [number, number][] = [
  [-2.15, -1.95],
  [-1.55, -1.75],
  [-1.05, -1.35],
  [-0.95, -0.7],
  [-1.25, -0.1],
  [-1.15, 0.55],
  [-0.65, 1.0],
  [-0.0, 1.05],
  [0.5, 0.6],
  [1.0, 0.2],
  [1.6, 0.25],
  [2.05, 0.75],
  [2.1, 1.4],
  [2.35, 2.0],
  [2.75, 2.5],
];

export const PathStones: React.FC = () => {
  const settle = useSettle();
  const frame = useCurrentFrame();
  return (
    <group>
      {PATH.map(([x, z], i) => {
        const at = CUES.stones[i];
        const s = settle(at, 170);
        if (frame < at) return null;
        const glow = interpolate(frame, [at, at + 4, at + 22], [0, 1, 0], CLAMP);
        return (
          <group key={i} position={[x, (1 - s) * -0.45, z]} rotation={[0, (i * 0.7) % 1, 0]}>
            <mesh position={[0, 0.03, 0]} castShadow receiveShadow material={MAT.slate}>
              <cylinderGeometry args={[0.21, 0.23, 0.06, 6]} />
            </mesh>
            <mesh position={[0, 0.062, 0]} material={goldMatCache(glow)}>
              <cylinderGeometry args={[0.215, 0.215, 0.006, 6]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

const _gm = new Map<number, THREE.MeshStandardMaterial>();
/** Quantised gold materials so per-frame glow levels don't allocate endlessly. */
export const goldMatCache = (k: number) => {
  const q = Math.round(Math.max(0, k) * 20) / 20;
  if (!_gm.has(q)) {
    _gm.set(
      q,
      q === 0
        ? new THREE.MeshStandardMaterial({ color: "#6B655A", roughness: 0.7, metalness: 0.2 })
        : new THREE.MeshStandardMaterial({
            color: ISO.gold,
            roughness: 0.3,
            metalness: 0.85,
            emissive: new THREE.Color(ISO.gold),
            emissiveIntensity: q * 2.2,
          }),
    );
  }
  return _gm.get(q)!;
};

/** The gold line of light from the laptop to the first stone. */
export const GoldLine: React.FC<{ progress: number }> = ({ progress }) => {
  const pts: V3[] = [
    [DESK[0], 0.32, DESK[2] + 0.02],
    [DESK[0], 0.075, DESK[2] + 0.2],
    [DESK[0] + 0.6, 0.075, DESK[2] + 0.55],
    [APT.x + APT.size / 2, 0.075, -2.1],
    [PATH[0][0], 0.075, PATH[0][1]],
  ];
  const segs = pts
    .slice(1)
    .map((p, i) => ({
      a: pts[i],
      b: p,
      len: Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]),
    }));
  const total = segs.reduce((s, x) => s + x.len, 0);
  let remain = progress * total;
  const mat = goldMatCache(0.45);
  if (progress <= 0) return null;
  return (
    <group>
      {segs.map((sg, i) => {
        const l = Math.min(sg.len, Math.max(0, remain));
        remain -= sg.len;
        if (l <= 0.001) return null;
        const t = l / sg.len;
        const end: V3 = [
          sg.a[0] + (sg.b[0] - sg.a[0]) * t,
          sg.a[1] + (sg.b[1] - sg.a[1]) * t,
          sg.a[2] + (sg.b[2] - sg.a[2]) * t,
        ];
        const mid: V3 = [(sg.a[0] + end[0]) / 2, (sg.a[1] + end[1]) / 2, (sg.a[2] + end[2]) / 2];
        const dir = new THREE.Vector3(end[0] - sg.a[0], end[1] - sg.a[1], end[2] - sg.a[2]).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return (
          <group key={i}>
            <mesh position={mid} quaternion={q} material={mat}>
              <cylinderGeometry args={[0.012, 0.012, l, 6]} />
            </mesh>
            {i === segs.length - 1 || remain < 0 ? (
              <Halo position={end} size={0.5} color={ISO.gold} opacity={0.8} />
            ) : null}
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Milestone structures                                                 */
/* ------------------------------------------------------------------ */

/** Gold "complete" pulse shared by milestones. */
const pulse = (frame: number, done: number) =>
  interpolate(frame, [done - 2, done + 4, done + 30], [0, 1, 0.12], CLAMP);

export const STUDIO: V3 = [-2.75, 0, 0.35];
export const Studio: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const [a, done] = CUES.studio;
  const base = settle(a);
  const frame1 = settle(a + 8);
  const glass = interpolate(frame, [a + 16, a + 30], [0, 1], CLAMP);
  const easel = settle(a + 22);
  const g = pulse(frame, done);
  if (frame < a) return null;
  const W = 1.1,
    D = 0.85,
    H = 0.75;
  const edges: [V3, V3][] = [
    [
      [-W / 2, H / 2, -D / 2],
      [0.03, H, 0.03],
    ],
    [
      [W / 2, H / 2, -D / 2],
      [0.03, H, 0.03],
    ],
    [
      [-W / 2, H / 2, D / 2],
      [0.03, H, 0.03],
    ],
    [
      [W / 2, H / 2, D / 2],
      [0.03, H, 0.03],
    ],
    [
      [0, H, -D / 2],
      [W, 0.03, 0.03],
    ],
    [
      [0, H, D / 2],
      [W, 0.03, 0.03],
    ],
    [
      [-W / 2, H, 0],
      [0.03, 0.03, D],
    ],
    [
      [W / 2, H, 0],
      [0.03, 0.03, D],
    ],
  ];
  return (
    <group position={[STUDIO[0], (1 - base) * -1, STUDIO[2]]}>
      <mesh position={[0, 0.03, 0]} receiveShadow castShadow material={MAT.charcoal}>
        <boxGeometry args={[W + 0.1, 0.06, D + 0.1]} />
      </mesh>
      <group scale={[1, Math.max(0.001, frame1), 1]}>
        {edges.map(([p, s], i) => (
          <mesh key={i} position={p} castShadow material={g > 0.05 ? goldMatCache(g) : MAT.brass}>
            <boxGeometry args={s} />
          </mesh>
        ))}
      </group>
      {glass > 0 ? (
        <mesh position={[0, H / 2, 0]} material={MAT.glass}>
          <boxGeometry args={[W - 0.02, H - 0.02, D - 0.02]} />
        </mesh>
      ) : null}
      {/* easel with portfolio board */}
      <group position={[0.05, 0, 0.05]} scale={[easel, easel, easel]}>
        {[-0.08, 0.08].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]} rotation={[0.12, 0, x * 0.6]} material={MAT.walnut}>
            <boxGeometry args={[0.018, 0.42, 0.018]} />
          </mesh>
        ))}
        <mesh position={[0, 0.34, 0.03]} rotation={[0.12, 0, 0]} castShadow material={MAT.acrylic}>
          <boxGeometry args={[0.3, 0.22, 0.012]} />
        </mesh>
        {[0, 1, 2].map((r) => (
          <mesh
            key={r}
            position={[-0.07 + r * 0.07, 0.36, 0.04]}
            rotation={[0.12, 0, 0]}
            material={r === 1 ? goldMatCache(0.4 + g) : MAT.slate}
          >
            <boxGeometry args={[0.055, 0.08, 0.004]} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 0.6, 0]} color={ISO.amber} intensity={0.5 * glass + g * 1.5} distance={2} />
      <Halo position={[0, H + 0.2, 0]} size={1.6} color={ISO.gold} opacity={g * 0.6} />
    </group>
  );
};

export const STORE: V3 = [1.5, 0, -0.85];
export const Storefront: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const [a, done] = CUES.store;
  const [h0, h1] = CUES.handoff;
  const base = settle(a);
  const walls = settle(a + 6);
  const awning = settle(a + 14);
  const door = interpolate(frame, [done - 6, done + 4], [0, 1.25], CLAMP);
  const clientOut = interpolate(frame, [h0 - 4, h0 + 8], [0, 1], CLAMP);
  const doc = interpolate(frame, [h0 + 6, h1], [0, 1], CLAMP);
  const g = pulse(frame, done);
  if (frame < a) return null;
  const W = 1.15,
    D = 0.9,
    H = 0.85;
  return (
    <group position={[STORE[0], (1 - base) * -1, STORE[2]]}>
      <mesh position={[0, 0.03, 0]} receiveShadow material={MAT.slate}>
        <boxGeometry args={[W + 0.2, 0.06, D + 0.3]} />
      </mesh>
      <group scale={[1, Math.max(0.001, walls), 1]}>
        <mesh position={[0, H / 2 + 0.06, 0]} castShadow receiveShadow material={MAT.charcoal}>
          <boxGeometry args={[W, H, D]} />
        </mesh>
        {/* lit shop window */}
        <mesh position={[0.25, 0.42, D / 2 + 0.002]} material={warmPane(0.6 + g)}>
          <planeGeometry args={[0.42, 0.32]} />
        </mesh>
      </group>
      {/* walnut door, swings open */}
      <group position={[-0.32, 0.06, D / 2 + 0.01]} rotation={[0, -door, 0]}>
        <mesh position={[0.11, 0.25, 0]} castShadow material={MAT.walnut}>
          <boxGeometry args={[0.22, 0.5, 0.02]} />
        </mesh>
      </group>
      {door > 0.1 ? (
        <mesh position={[-0.21, 0.31, D / 2 + 0.003]} material={warmPane(1.2)}>
          <planeGeometry args={[0.2, 0.48]} />
        </mesh>
      ) : null}
      {/* brass awning */}
      <mesh
        position={[0, H + 0.1 - (1 - awning) * 0.3, D / 2 + 0.12]}
        rotation={[0.35, 0, 0]}
        castShadow
        material={g > 0.05 ? goldMatCache(g) : MAT.brass}
      >
        <boxGeometry args={[W + 0.05, 0.02, 0.3]} />
      </mesh>
      {/* the first client steps out and hands over a document */}
      {clientOut > 0 ? (
        <>
          <Figure
            position={[-0.21, 0.06, D / 2 + 0.05 + clientOut * 0.18]}
            heading={0}
            sit={0}
            walk={0}
            walking={0}
            hoodie={MAT.slate}
          />
          <mesh
            position={[-0.12, 0.3 - doc * 0.02, D / 2 + 0.25 + doc * 0.32]}
            rotation={[-0.4, 0, 0]}
            material={MAT.acrylic}
          >
            <boxGeometry args={[0.07, 0.09, 0.004]} />
          </mesh>
        </>
      ) : null}
      <pointLight
        position={[0, 0.5, D / 2 + 0.3]}
        color={ISO.amber}
        intensity={0.6 * walls + g * 1.4}
        distance={2}
      />
      <Halo position={[0, H + 0.3, 0.3]} size={1.6} color={ISO.gold} opacity={g * 0.6} />
    </group>
  );
};

const _wp = new Map<number, THREE.MeshBasicMaterial>();
const warmPane = (k: number) => {
  const q = Math.round(Math.min(2, k) * 10) / 10;
  if (!_wp.has(q))
    _wp.set(
      q,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ISO.amber).multiplyScalar(0.35 + q * 0.4),
        toneMapped: false,
      }),
    );
  return _wp.get(q)!;
};

export const MAILBOX: V3 = [3.05, 0, 1.25];
export const Mailbox: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const [a, done] = CUES.mailbox;
  const post = settle(a);
  const box = settle(a + 6);
  const lid = interpolate(frame, [done - 4, done + 2], [0, 1.9], CLAMP);
  const env = interpolate(frame, [done, done + 16], [0, 1], CLAMP);
  const g = pulse(frame, done);
  const emerald = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ISO.emerald,
        roughness: 0.5,
        emissive: new THREE.Color(ISO.emerald),
        emissiveIntensity: 1.2,
      }),
    [],
  );
  if (frame < a) return null;
  return (
    <group position={[MAILBOX[0], (1 - post) * -0.8, MAILBOX[2]]}>
      <mesh position={[0, 0.03, 0]} receiveShadow material={MAT.slate}>
        <cylinderGeometry args={[0.22, 0.24, 0.06, 6]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow material={MAT.dark}>
        <boxGeometry args={[0.04, 0.38, 0.04]} />
      </mesh>
      <group position={[0, 0.42, 0]} scale={[box, box, box]}>
        <mesh castShadow material={g > 0.05 ? goldMatCache(g) : MAT.brass}>
          <boxGeometry args={[0.16, 0.12, 0.24]} />
        </mesh>
        <group position={[0, 0.06, -0.12]} rotation={[-lid, 0, 0]}>
          <mesh position={[0, 0, 0.12]} material={MAT.brass}>
            <boxGeometry args={[0.165, 0.012, 0.245]} />
          </mesh>
        </group>
        {env > 0 ? (
          <mesh position={[0, 0.05 + env * 0.22, 0]} rotation={[0, env * 0.6, 0.1]} material={emerald}>
            <boxGeometry args={[0.12, 0.004, 0.08]} />
          </mesh>
        ) : null}
      </group>
      <Halo position={[0, 0.7, 0]} size={0.8} color={ISO.emerald} opacity={env * (1 - env * 0.5) * 0.9} />
      <Halo position={[0, 0.5, 0]} size={1.2} color={ISO.gold} opacity={g * 0.55} />
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Plaza + monument                                                     */
/* ------------------------------------------------------------------ */

export const PLAZA: V3 = [3.45, 0, 3.35];
export const Plaza: React.FC<{ fill: number }> = ({ fill }) => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const at = CUES.stones[CUES.stones.length - 1] + 4;
  const base = settle(at);
  const mon = settle(at + 10);
  const goldFill = useMemo(() => goldMat(1.6), []);
  if (frame < at) return null;
  const H = 1.1;
  return (
    <group position={[PLAZA[0], (1 - base) * -0.8, PLAZA[2]]}>
      <mesh position={[0, 0.035, 0]} receiveShadow castShadow material={MAT.slate}>
        <cylinderGeometry args={[1.05, 1.1, 0.07, 48]} />
      </mesh>
      <mesh position={[0, 0.072, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.brass}>
        <ringGeometry args={[0.95, 1.0, 64]} />
      </mesh>
      <group scale={[1, Math.max(0.001, mon), 1]}>
        <mesh position={[0, 0.14, 0]} castShadow material={MAT.brass}>
          <cylinderGeometry args={[0.22, 0.26, 0.14, 32]} />
        </mesh>
        {/* frosted tube */}
        <mesh position={[0, 0.21 + H / 2, 0]} material={MAT.acrylic}>
          <cylinderGeometry args={[0.085, 0.085, H, 32, 1, true]} />
        </mesh>
        <mesh position={[0, 0.24, 0]} material={goldFill}>
          <sphereGeometry args={[0.13, 24, 16]} />
        </mesh>
        {fill > 0.01 ? (
          <mesh position={[0, 0.24 + (H * fill) / 2, 0]} material={goldFill}>
            <cylinderGeometry args={[0.06, 0.06, H * fill, 24]} />
          </mesh>
        ) : null}
        <mesh position={[0, 0.21 + H + 0.03, 0]} material={MAT.brass}>
          <cylinderGeometry args={[0.1, 0.1, 0.05, 24]} />
        </mesh>
      </group>
      <pointLight position={[0, 0.25 + H * fill, 0.3]} color={ISO.gold} intensity={fill * 2.2} distance={3} />
      <Halo position={[0, 0.25 + H * fill, 0]} size={1 + fill * 1.4} color={ISO.gold} opacity={fill * 0.7} />
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* City                                                                 */
/* ------------------------------------------------------------------ */

type Tower = { x: number; z: number; w: number; d: number; floors: number; at: number };
export const TOWERS: Tower[] = (() => {
  const spots: [number, number, number, number, number][] = [
    [3.7, -3.7, 1.0, 1.0, 14],
    [2.4, -3.8, 0.8, 0.9, 10],
    [3.9, -2.2, 0.8, 0.8, 9],
    [1.0, -3.9, 0.7, 0.7, 7],
    [3.95, -0.6, 0.7, 0.9, 11],
    [-0.3, -3.8, 0.7, 0.8, 6],
    [-3.9, 2.0, 0.9, 0.9, 12],
    [-3.7, 3.7, 1.0, 1.0, 16],
    [-2.3, 3.9, 0.8, 0.7, 9],
    [-0.9, 3.85, 0.7, 0.7, 7],
    [-4.0, 0.6, 0.6, 0.7, 6],
    [1.0, 3.75, 0.7, 0.7, 8],
    [-2.0, 2.4, 0.6, 0.6, 5],
    [0.15, -2.3, 0.6, 0.6, 5],
    [1.7, -3.0, 0.55, 0.55, 4],
  ];
  const [t0, t1] = CUES.towers;
  return spots.map(([x, z, w, d, floors], i) => ({
    x,
    z,
    w,
    d,
    floors,
    at: Math.round(t0 + ((t1 - t0 - 30) * i) / spots.length),
  }));
})();
const FLOOR_H = 0.17;

export const Towers: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  return (
    <group>
      {TOWERS.map((t, ti) => {
        if (frame < t.at) return null;
        const pad = settle(t.at, 200);
        const built = Math.min(t.floors, Math.floor((frame - t.at) / 1.6));
        return (
          <group key={ti} position={[t.x, (1 - pad) * -0.4, t.z]}>
            <mesh position={[0, 0.02, 0]} receiveShadow material={MAT.slate}>
              <boxGeometry args={[t.w + 0.12, 0.04, t.d + 0.12]} />
            </mesh>
            {Array.from({ length: built }).map((_, f) => {
              const top = f === t.floors - 1;
              const winOn = frame > t.at + f * 1.6 + 14 + random(`w-${ti}-${f}`) * 40;
              return (
                <group key={f} position={[0, 0.04 + f * FLOOR_H, 0]}>
                  <mesh
                    position={[0, FLOOR_H / 2, 0]}
                    castShadow
                    receiveShadow
                    material={f % 4 === 3 ? MAT.slate : MAT.charcoal}
                  >
                    <boxGeometry args={[t.w, FLOOR_H - 0.01, t.d]} />
                  </mesh>
                  {/* window bands on the two camera-facing faces */}
                  <mesh
                    position={[0, FLOOR_H / 2, t.d / 2 + 0.002]}
                    material={winOn ? warmPane(0.5 + random(`b-${ti}-${f}`)) : MAT.dark}
                  >
                    <planeGeometry args={[t.w * 0.82, FLOOR_H * 0.45]} />
                  </mesh>
                  <mesh
                    position={[t.w / 2 + 0.002, FLOOR_H / 2, 0]}
                    rotation={[0, Math.PI / 2, 0]}
                    material={
                      winOn && random(`s-${ti}-${f}`) > 0.25
                        ? warmPane(0.4 + random(`c-${ti}-${f}`))
                        : MAT.dark
                    }
                  >
                    <planeGeometry args={[t.d * 0.82, FLOOR_H * 0.45]} />
                  </mesh>
                  {top ? (
                    <mesh position={[0, FLOOR_H + 0.01, 0]} material={MAT.brass}>
                      <boxGeometry args={[t.w + 0.02, 0.02, t.d + 0.02]} />
                    </mesh>
                  ) : null}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
};

/** Elevated train track along the back edge, laying itself, then a small train glides along it. */
export const Track: React.FC = () => {
  const frame = useCurrentFrame();
  const [a, b] = CUES.track;
  const n = 12;
  const z = -4.6;
  const x0 = -1.6;
  const x1 = 4.7;
  const len = (x1 - x0) / n;
  const trainX = interpolate(frame, [b, CUES.duration], [x0 - 1, x1 + 1.5], CLAMP);
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const at = a + ((b - a) * i) / n;
        if (frame < at) return null;
        const s = Math.min(1, (frame - at) / 5);
        const x = x0 + len * (i + 0.5);
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.55 * s, 0]} castShadow material={MAT.slate}>
              <boxGeometry args={[0.06, 1.1 * s, 0.06]} />
            </mesh>
            <mesh position={[0, 1.12, 0]} scale={[s, 1, 1]} castShadow receiveShadow material={MAT.charcoal}>
              <boxGeometry args={[len, 0.06, 0.32]} />
            </mesh>
            {[-0.08, 0.08].map((o) => (
              <mesh key={o} position={[0, 1.16, o]} scale={[s, 1, 1]} material={MAT.brass}>
                <boxGeometry args={[len, 0.015, 0.015]} />
              </mesh>
            ))}
          </group>
        );
      })}
      {frame > b ? (
        <group position={[trainX, 1.24, z]}>
          {[0, 1, 2].map((c) => (
            <group key={c} position={[-c * 0.62, 0, 0]}>
              <mesh castShadow material={MAT.slate}>
                <boxGeometry args={[0.58, 0.16, 0.24]} />
              </mesh>
              <mesh position={[0, 0.01, 0.121]} material={warmPane(1.1)}>
                <planeGeometry args={[0.48, 0.05]} />
              </mesh>
            </group>
          ))}
        </group>
      ) : null}
    </group>
  );
};

/** Street lamps along the path, lighting up in a chain. */
export const Lamps: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = useSettle();
  const [a, b] = CUES.lamps;
  const idx = [1, 3, 5, 7, 9, 11, 13];
  return (
    <group>
      {idx.map((pi, k) => {
        const [x, z] = PATH[pi];
        const side = k % 2 ? 0.42 : -0.42;
        const at = a - 14 + k * 3;
        const on = interpolate(
          frame,
          [a + ((b - a) * k) / idx.length, a + ((b - a) * k) / idx.length + 4],
          [0, 1],
          CLAMP,
        );
        if (frame < at) return null;
        const s = settle(at, 200);
        return (
          <group key={pi} position={[x + side * 0.7, (1 - s) * -0.6, z - side * 0.7]}>
            <mesh position={[0, 0.25, 0]} castShadow material={MAT.dark}>
              <cylinderGeometry args={[0.012, 0.016, 0.5, 8]} />
            </mesh>
            <mesh position={[0, 0.52, 0]} material={on > 0.5 ? warmPane(1.6) : MAT.brass}>
              <sphereGeometry args={[0.035, 12, 8]} />
            </mesh>
            <pointLight
              position={[0, 0.5, 0]}
              color={ISO.amber}
              intensity={on * 0.7}
              distance={1.4}
              decay={1.8}
            />
            <Halo position={[0, 0.52, 0]} size={0.45} color={ISO.amber} opacity={on * 0.7} />
          </group>
        );
      })}
    </group>
  );
};

/** Slow volumetric haze above the tile (stacked additive glow planes). */
export const Haze: React.FC<{ amount: number }> = ({ amount }) => {
  const frame = useCurrentFrame();
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#3A4A6E",
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  mat.opacity = 0.09 * amount;
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[Math.sin(frame / 90 + i * 2) * 1.2, 1.2 + i * 0.7, Math.cos(frame / 110 + i) * 1.2]}
          rotation={[-Math.PI / 2, 0, i]}
          material={mat}
        >
          <planeGeometry args={[12, 12]} />
        </mesh>
      ))}
    </group>
  );
};
