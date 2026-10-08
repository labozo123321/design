import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { BUMP_Z, FOUNTAIN, ROAD_X, TREES } from "../whatif/sim";
import { BUILDINGS, M } from "../whatif/World";
import { surgeAt } from "./Spectacle";

/**
 * The plaza for the POV piece: the same layout as the WhatIf set (every prop where the crowd expects it),
 * dressed for golden hour: warm paving with a mosaic round the fountain, glowing lamps with light pools,
 * an LED strip along the river railing, a lit bridge, fairy lights in the trees, a striped umbrella on the
 * balloon cart, a flag, and the towers across the river lit up: windows, neon edges, LED screens, beacons.
 */

const sRGB = (t: THREE.Texture) => {
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
};
/** An emissive colour above 1 (linear), so the bloom picks it up. */
const hot = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);
const basicCache = new Map<string, THREE.MeshBasicMaterial>();
const glowMat = (hex: string, k: number) => {
  const key = `${hex}${k}`;
  if (!basicCache.has(key)) basicCache.set(key, new THREE.MeshBasicMaterial({ color: hot(hex, k) }));
  return basicCache.get(key)!;
};

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */

let pavingTex: THREE.Texture | null = null;
/** Warm stone slabs, each a slightly different tone, with dark joints. 4 x 4 slabs of 1 m per repeat. */
const paving = () => {
  if (pavingTex) return pavingTex;
  const { c, g } = canvas(512, 512);
  g.fillStyle = "#8F8374";
  g.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) {
      const v = random(`pv${r}${k}`);
      const w = random(`pw${r}${k}`);
      const base = new THREE.Color("#D2C3AE").offsetHSL((w - 0.5) * 0.02, (v - 0.5) * 0.06, (v - 0.5) * 0.07);
      g.fillStyle = `#${base.getHexString()}`;
      g.fillRect(k * 128 + 3, r * 128 + 3, 122, 122);
      // speckle
      for (let s = 0; s < 70; s++) {
        const a = random(`ps${r}${k}${s}`);
        g.fillStyle = a > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(60,40,20,0.07)";
        g.fillRect(
          k * 128 + 4 + random(`px${r}${k}${s}`) * 118,
          r * 128 + 4 + random(`py${r}${k}${s}`) * 118,
          3,
          3,
        );
      }
    }
  pavingTex = sRGB(new THREE.CanvasTexture(c));
  pavingTex.wrapS = pavingTex.wrapT = THREE.RepeatWrapping;
  pavingTex.repeat.set(30, 13);
  pavingTex.anisotropy = 8;
  return pavingTex;
};

let mosaicTex: THREE.Texture | null = null;
/** Rings and rays of darker stone and teal tile round the fountain. */
const mosaic = () => {
  if (mosaicTex) return mosaicTex;
  const { c, g } = canvas(1024, 1024);
  const C = 512;
  const ring = (r0: number, r1: number, col: string) => {
    g.beginPath();
    g.arc(C, C, r1, 0, Math.PI * 2);
    g.arc(C, C, r0, 0, Math.PI * 2, true);
    g.fillStyle = col;
    g.fill();
  };
  ring(300, 512, "#B9A68E");
  ring(330, 352, "#2F7F86");
  ring(470, 490, "#2F7F86");
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.save();
    g.translate(C, C);
    g.rotate(a);
    g.fillStyle = i % 2 ? "#C9B79E" : "#A2876A";
    g.beginPath();
    g.moveTo(360, -16);
    g.lineTo(462, -30);
    g.lineTo(462, 30);
    g.lineTo(360, 16);
    g.closePath();
    g.fill();
    g.restore();
  }
  mosaicTex = sRGB(new THREE.CanvasTexture(c));
  return mosaicTex;
};

let poolTex: THREE.Texture | null = null;
/** Soft warm pool of lamplight. */
const pool = () => {
  if (poolTex) return poolTex;
  const { c, g } = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,200,130,0.9)");
  grd.addColorStop(0.35, "rgba(255,170,90,0.35)");
  grd.addColorStop(1, "rgba(255,150,70,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  poolTex = sRGB(new THREE.CanvasTexture(c));
  return poolTex;
};

let stripeTex: THREE.Texture | null = null;
const stripes = () => {
  if (stripeTex) return stripeTex;
  const { c, g } = canvas(256, 8);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? "#F4EFE6" : "#D8352E";
    g.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 8);
  }
  stripeTex = sRGB(new THREE.CanvasTexture(c));
  return stripeTex;
};

let flagTex: THREE.Texture | null = null;
const flagPattern = () => {
  if (flagTex) return flagTex;
  const { c, g } = canvas(256, 160);
  g.fillStyle = "#0F6E78";
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#F28C28";
  g.beginPath();
  g.moveTo(0, 160);
  g.lineTo(256, 0);
  g.lineTo(256, 160);
  g.closePath();
  g.fill();
  g.fillStyle = "#F7F2E8";
  g.beginPath();
  g.arc(92, 70, 30, 0, Math.PI * 2);
  g.fill();
  flagTex = sRGB(new THREE.CanvasTexture(c));
  return flagTex;
};

/** Tower facades at dusk: darker glass by day-side, and an emissive map of the windows that are lit. */
const facadeCache = new Map<string, { map: THREE.Texture; glow: THREE.Texture }>();
const facades = (base: string, cols: number, rows: number, seed: number) => {
  const key = `${base}${cols}${rows}${seed}`;
  if (facadeCache.has(key)) return facadeCache.get(key)!;
  const a = canvas(cols * 32, rows * 40);
  const b = canvas(cols * 32, rows * 40);
  a.g.fillStyle = base;
  a.g.fillRect(0, 0, a.c.width, a.c.height);
  b.g.fillStyle = "#000";
  b.g.fillRect(0, 0, b.c.width, b.c.height);
  const warm = ["#FFD48A", "#FFC46E", "#FFE2B0", "#FFB45C", "#CFE6FF"];
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const u = random(`fl${seed}-${r}-${k}`);
      // whole floors tend to be lit together, like offices and flats at dusk
      const floor = random(`ff${seed}-${r}`);
      const lit = u < 0.18 + floor * 0.42;
      a.g.fillStyle = "#E9E3D8";
      a.g.fillRect(k * 32 + 6, r * 40 + 8, 20, 26);
      const col = warm[Math.floor(random(`fc${seed}-${r}-${k}`) * warm.length)];
      a.g.fillStyle = lit ? col : u > 0.8 ? "#3B4A5E" : "#2C3647";
      a.g.fillRect(k * 32 + 8, r * 40 + 10, 16, 22);
      if (lit) {
        b.g.fillStyle = col;
        b.g.globalAlpha = 0.55 + 0.45 * random(`fi${seed}-${r}-${k}`);
        b.g.fillRect(k * 32 + 8, r * 40 + 10, 16, 22);
        b.g.globalAlpha = 1;
      }
    }
  // ground-floor shopfronts, glowing
  a.g.fillStyle = "#2B2B2E";
  a.g.fillRect(0, a.c.height - 30, a.c.width, 30);
  b.g.fillStyle = "#FFB86A";
  for (let k = 0; k < cols; k++)
    if (random(`fs${seed}${k}`) > 0.35) b.g.fillRect(k * 32 + 3, b.c.height - 26, 26, 18);
  const out = { map: sRGB(new THREE.CanvasTexture(a.c)), glow: sRGB(new THREE.CanvasTexture(b.c)) };
  facadeCache.set(key, out);
  return out;
};

/* ------------------------------------------------------------------ */
/* LED screens: animated, abstract (no words)                           */
/* ------------------------------------------------------------------ */

type Screen = { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
const screens: Screen[] = [];
const screen = (i: number) => {
  if (!screens[i]) {
    const { c, g } = canvas(256, 160);
    screens[i] = { c, g, tex: sRGB(new THREE.CanvasTexture(c)) as THREE.CanvasTexture };
  }
  return screens[i];
};
const drawScreen = (i: number, kind: number, t: number, glitch: number) => {
  const s = screen(i);
  const { g } = s;
  const W = 256;
  const H = 160;
  g.fillStyle = "#05060A";
  g.fillRect(0, 0, W, H);
  if (glitch > 0.15) {
    // the surge: torn colour bars and static
    const fr = Math.round(t * 30);
    for (let k = 0; k < 14; k++) {
      const y = random(`gy${i}${fr}${k}`) * H;
      const h = 3 + random(`gh${i}${fr}${k}`) * 16;
      g.fillStyle = ["#FF2A6D", "#05D9E8", "#FFFFFF", "#D1F7FF", "#7700FF"][k % 5];
      g.globalAlpha = 0.35 + 0.65 * random(`ga${i}${fr}${k}`);
      g.fillRect(random(`gx${i}${fr}${k}`) * -60, y, W + 60, h);
    }
    g.globalAlpha = 1;
    s.tex.needsUpdate = true;
    return s.tex;
  }
  if (kind === 0) {
    // equaliser bars sweeping through the spectrum
    for (let k = 0; k < 16; k++) {
      const h =
        (0.25 + 0.75 * Math.abs(Math.sin(t * 3.1 + k * 0.7) * Math.cos(t * 1.3 + k * 0.31))) * (H - 24);
      g.fillStyle = `hsl(${(k * 18 + t * 40) % 360}, 95%, 60%)`;
      g.fillRect(8 + k * 15, H - 12 - h, 11, h);
    }
  } else if (kind === 1) {
    // rings blooming from the centre
    for (let k = 0; k < 6; k++) {
      const r = ((t * 46 + k * 26) % 156) + 4;
      g.strokeStyle = k % 2 ? "#FF4FD8" : "#4FE3FF";
      g.globalAlpha = Math.max(0, 1 - r / 160);
      g.lineWidth = 7;
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    // a sunset sweep with a sun disc rising and setting
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#3B1D73");
    grd.addColorStop(0.55, "#E8427A");
    grd.addColorStop(1, "#FFB347");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#FFE7A0";
    g.beginPath();
    g.arc(W / 2, H * 0.62 - Math.sin(t * 0.9) * 26, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14102A";
    for (let k = 0; k < 6; k++) g.fillRect(0, H * 0.66 + k * 9, W, 3 + k);
  }
  s.tex.needsUpdate = true;
  return s.tex;
};

/* ------------------------------------------------------------------ */
/* The set                                                              */
/* ------------------------------------------------------------------ */

const NEON = ["#4FE3FF", "#FF4FD8", "#FFB347", "#9C7BFF"];
const LAMP_XZ: [number, number][] = [
  [-20, 6],
  [-2, -9],
  [12, -10],
  [16, 4],
  [-14, 18],
  [6, 20],
  [-28, -8],
];
const CANOPY: [number, number, number, number][] = [
  [0, 4.2, 0, 1.9],
  [1.3, 3.6, 0.4, 1.4],
  [-1.2, 3.8, -0.3, 1.5],
  [0.4, 5.3, -0.6, 1.3],
  [-0.5, 4.6, 1.0, 1.2],
];

/** Fairy lights scattered over every tree canopy (one instanced mesh). */
const FairyLights: React.FC<{ t: number }> = ({ t }) => {
  const mesh = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    TREES.forEach((tr, ti) =>
      CANOPY.forEach(([x, y, z, r], ci) => {
        for (let k = 0; k < 16; k++) {
          const u = random(`fy${ti}${ci}${k}u`) * 2 - 1;
          const a = random(`fy${ti}${ci}${k}a`) * Math.PI * 2;
          const q = Math.sqrt(1 - u * u);
          const rr = r * 1.02;
          pts.push(
            new THREE.Vector3(
              tr.x + tr.s * (x + rr * q * Math.cos(a)),
              tr.s * (y + rr * u),
              tr.z + tr.s * (z + rr * q * Math.sin(a)),
            ),
          );
        }
      }),
    );
    const m = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.05, 6, 4),
      new THREE.MeshBasicMaterial({ color: "#FFFFFF" }),
      pts.length,
    );
    pts.forEach((p, i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }, []);
  // a slow shimmer, each bulb on its own phase
  const c = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    const k = 2.2 + 1.6 * Math.sin(t * 2.3 + random(`fp${i}`) * 6.28);
    c.set(i % 5 === 0 ? "#BFE3FF" : "#FFD9A0").multiplyScalar(k);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return <primitive object={mesh} />;
};

/** Flag on the pole by the river: droops in full gravity, flies in the breeze, floats free at zero g. */
const Flag: React.FC<{ t: number; g: number }> = ({ t, g }) => {
  const geo = useMemo(() => new THREE.PlaneGeometry(2.2, 1.4, 18, 8), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x0 = base[i * 3] + 1.1; // 0 at the pole, 2.2 at the free end
    const y0 = base[i * 3 + 1];
    const f = x0 / 2.2;
    const wave = Math.sin(x0 * 2.6 - t * (2.4 + 2 * g)) * 0.16 * f;
    pos.setXYZ(i, x0, y0 - g * 0.5 * f * f, wave + Math.sin(y0 * 2 + t * 1.7) * 0.04 * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return (
    <group position={[-1, 0, -9]}>
      <mesh position={[0, 3.6, 0]} castShadow material={M("#D9D9DC", { metalness: 0.6, roughness: 0.35 })}>
        <cylinderGeometry args={[0.05, 0.07, 7.2, 10]} />
      </mesh>
      <mesh position={[0, 7.25, 0]} material={M("#E8C35A", { metalness: 0.7, roughness: 0.3 })}>
        <sphereGeometry args={[0.11, 12, 8]} />
      </mesh>
      <mesh geometry={geo} position={[0.06, 6.4, 0]} castShadow>
        <meshStandardMaterial map={flagPattern()} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
};

export const Plaza: React.FC<{ t: number; g: number }> = ({ t, g }) => {
  const towers = useMemo(
    () =>
      BUILDINGS.map((b, i) => ({
        b,
        i,
        mats: [0, 1, 2, 3, 4, 5].map((f) => {
          if (f === 2 || f === 3)
            return new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.9, flatShading: true });
          const tex = facades(b.c, Math.round((f < 2 ? b.d : b.w) / 2.2), Math.round(b.h / 3), i * 10 + f);
          return new THREE.MeshStandardMaterial({
            map: tex.map,
            emissiveMap: tex.glow,
            emissive: new THREE.Color("#FFFFFF"),
            emissiveIntensity: 1.2,
            roughness: 0.85,
          });
        }),
        neon: new THREE.MeshBasicMaterial(),
      })),
    [],
  );
  const lamps = useMemo(() => LAMP_XZ.map(() => new THREE.MeshBasicMaterial()), []);
  return (
    <group>
      {/* plaza: warm stone, and a mosaic round the fountain */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 12]} receiveShadow>
        <planeGeometry args={[120, 52]} />
        <meshStandardMaterial map={paving()} roughness={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FOUNTAIN.x, 0.006, FOUNTAIN.z]} receiveShadow>
        <circleGeometry args={[8.2, 72]} />
        <meshStandardMaterial
          map={mosaic()}
          roughness={0.8}
          alphaTest={0.5}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {/* road + bumps */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROAD_X, 0.02, 14]}
        receiveShadow
        material={M("#45484E")}
      >
        <planeGeometry args={[7, 56]} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[ROAD_X, 0.03, -10 + i * 4.4]}
          material={M("#F2F2F2")}
        >
          <planeGeometry args={[0.2, 2]} />
        </mesh>
      ))}
      {BUMP_Z.map((z) => (
        <mesh key={z} position={[ROAD_X, 0.08, z]} material={M("#E6B33E")}>
          <boxGeometry args={[6.6, 0.16, 0.6]} />
        </mesh>
      ))}
      {/* embankment + railing, with an LED strip along the rail */}
      <mesh position={[0, -0.6, -13.5]} receiveShadow castShadow material={M("#CFC6B5")}>
        <boxGeometry args={[140, 1.4, 1]} />
      </mesh>
      {Array.from({ length: 36 }).map((_, i) => (
        <mesh key={i} position={[-34 + i * 1.9, 0.55, -12.7]} castShadow material={M("#2A2A2E")}>
          <boxGeometry args={[0.08, 1.1, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 1.1, -12.7]} material={M("#2A2A2E")}>
        <boxGeometry args={[68, 0.08, 0.08]} />
      </mesh>
      <mesh position={[0, 1.16, -12.7]} material={glowMat("#4FE3FF", 2.4)}>
        <boxGeometry args={[68, 0.035, 0.035]} />
      </mesh>
      {/* far bank */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, -45]} receiveShadow material={M("#CBBFAC")}>
        <planeGeometry args={[160, 42]} />
      </mesh>
      <mesh position={[0, -0.5, -24.5]} material={M("#CFC6B5")}>
        <boxGeometry args={[160, 1.4, 1]} />
      </mesh>
      {/* the towers across the river, lit for the evening */}
      {towers.map(({ b, i, mats, neon: neonMat }) => {
        const front = b.z + b.d / 2;
        // the pulse browns the tower out for a moment as its wave rolls past
        const dip = surgeAt(t, b.x, front);
        mats.forEach((m) => {
          if (m.emissiveMap) m.emissiveIntensity = 1.2 * (1 - 0.85 * dip);
        });
        neonMat.color.copy(hot(NEON[i % NEON.length], 2.6 * (1 - 0.9 * dip)));
        return (
          <group key={i}>
            <mesh position={[b.x, b.h / 2, b.z]} castShadow receiveShadow material={mats}>
              <boxGeometry args={[b.w, b.h, b.d]} />
            </mesh>
            {/* neon edges: the two front corners and the roofline */}
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[b.x + (sx * b.w) / 2, b.h / 2, front]} material={neonMat}>
                <boxGeometry args={[0.14, b.h, 0.14]} />
              </mesh>
            ))}
            <mesh position={[b.x, b.h, front]} material={neonMat}>
              <boxGeometry args={[b.w, 0.14, 0.14]} />
            </mesh>
            <mesh position={[b.x, b.h, b.z]} material={neonMat}>
              <boxGeometry args={[0.12, 0.12, b.d]} />
            </mesh>
            {/* a red beacon on the roof, blinking */}
            <mesh
              position={[b.x, b.h + 0.5, b.z]}
              material={glowMat("#FF2A2A", (t + i * 0.37) % 1.4 < 0.18 ? 7 : 0.25)}
            >
              <sphereGeometry args={[0.32, 12, 8]} />
            </mesh>
          </group>
        );
      })}
      {/* LED screens on three of the facades facing the plaza */}
      {[
        { bi: 2, kind: 0, y: 12, w: 9, h: 5.6 },
        { bi: 1, kind: 2, y: 19, w: 8, h: 5 },
        { bi: 5, kind: 1, y: 14, w: 9, h: 5.6 },
      ].map((s, k) => {
        const b = BUILDINGS[s.bi];
        return (
          <group key={k} position={[b.x, s.y, b.z + b.d / 2 + 0.06]}>
            <mesh material={M("#0B0B0F")}>
              <boxGeometry args={[s.w + 0.5, s.h + 0.5, 0.1]} />
            </mesh>
            <mesh position={[0, 0, 0.06]}>
              <planeGeometry args={[s.w, s.h]} />
              <meshBasicMaterial
                map={drawScreen(k, s.kind, t, surgeAt(t, b.x, b.z + b.d / 2))}
                color={hot("#FFFFFF", 1.35)}
              />
            </mesh>
          </group>
        );
      })}
      {/* bridge: blue truss, bulbs along the top chords */}
      <group position={[-25, 0, -19]}>
        <mesh position={[0, 1.2, 0]} castShadow receiveShadow material={M("#2F5D8C")}>
          <boxGeometry args={[5, 0.5, 13]} />
        </mesh>
        {[-2.4, 2.4].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 4.3, 0]} castShadow material={M("#2F5D8C")}>
              <boxGeometry args={[0.25, 0.25, 13]} />
            </mesh>
            {Array.from({ length: 7 }).map((_, i) => (
              <group key={i} position={[0, 0, -6 + i * 2]}>
                <mesh position={[0, 2.8, 0]} castShadow material={M("#2F5D8C")}>
                  <boxGeometry args={[0.18, 3, 0.18]} />
                </mesh>
                {i < 6 ? (
                  <mesh
                    position={[0, 2.8, 1]}
                    rotation={[i % 2 ? 0.58 : -0.58, 0, 0]}
                    material={M("#2F5D8C")}
                  >
                    <boxGeometry args={[0.14, 3.6, 0.14]} />
                  </mesh>
                ) : null}
              </group>
            ))}
            {Array.from({ length: 13 }).map((_, i) => (
              <mesh key={`b${i}`} position={[0, 4.5, -6 + i]} material={glowMat("#FFD08A", 3.2)}>
                <sphereGeometry args={[0.08, 8, 6]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/* subway entrance */}
      <group position={[8, 0, -2]}>
        <mesh position={[0, 0.5, 0]} castShadow material={M("#1E1E22")}>
          <boxGeometry args={[4, 1, 6]} />
        </mesh>
        <mesh position={[0, 1.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M("#08080A")}>
          <planeGeometry args={[3.4, 5.4]} />
        </mesh>
        <mesh position={[0, 1.04, 0]} material={glowMat("#4FE3FF", 1.8)}>
          <boxGeometry args={[4.02, 0.04, 6.02]} />
        </mesh>
      </group>
      {/* benches */}
      {[-14, -4, 4, 14].map((x) => (
        <mesh key={x} position={[x, 0.45, -11.4]} castShadow material={M("#D9773F")}>
          <boxGeometry args={[2.6, 0.18, 0.7]} />
        </mesh>
      ))}
      {/* lamps: glowing globes and warm pools of light */}
      {LAMP_XZ.map(([x, z], li) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 2.4, 0]} castShadow material={M("#1F1F24")}>
            <cylinderGeometry args={[0.09, 0.12, 4.8, 6]} />
          </mesh>
          <mesh
            position={[0, 4.95, 0]}
            material={(() => {
              lamps[li].color.copy(hot("#FFD9A0", 2.6 * (1 - 0.9 * surgeAt(t, x, z))));
              return lamps[li];
            })()}
          >
            <icosahedronGeometry args={[0.38, 2]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <circleGeometry args={[3.6, 40]} />
            <meshBasicMaterial
              map={pool()}
              transparent
              opacity={0.42}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
      {/* fountain, with a lit rim */}
      <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
        <mesh position={[0, 0.35, 0]} castShadow receiveShadow material={M("#E9E1D1")}>
          <cylinderGeometry args={[FOUNTAIN.rim + 0.3, FOUNTAIN.rim + 0.4, 0.7, 28]} />
        </mesh>
        <mesh position={[0, 1.2, 0]} castShadow material={M("#E9E1D1")}>
          <cylinderGeometry args={[0.45, 0.6, 1.8, 12]} />
        </mesh>
        <mesh position={[0, 2.2, 0]} castShadow material={M("#E9E1D1")}>
          <cylinderGeometry args={[1.3, 0.5, 0.4, 16]} />
        </mesh>
        <mesh position={[0, 0.66, 0]} rotation={[Math.PI / 2, 0, 0]} material={glowMat("#4FE3FF", 2.2)}>
          <torusGeometry args={[FOUNTAIN.rim + 0.05, 0.045, 6, 96]} />
        </mesh>
      </group>
      {/* balloon cart under a striped umbrella */}
      <group position={[3, 0, 13]}>
        <mesh position={[0, 0.7, 0]} castShadow material={M("#F2C230")}>
          <boxGeometry args={[2.2, 1.1, 1.2]} />
        </mesh>
        {[-0.8, 0.8].map((x) => (
          <mesh key={x} position={[x, 0.25, 0.62]} rotation={[0, 0, Math.PI / 2]} material={M("#222")}>
            <cylinderGeometry args={[0.25, 0.25, 0.1, 10]} />
          </mesh>
        ))}
        <mesh position={[0, 1.95, 0]} castShadow material={M("#DADAD8", { metalness: 0.5, roughness: 0.4 })}>
          <cylinderGeometry args={[0.03, 0.03, 1.5, 8]} />
        </mesh>
        <mesh position={[0, 2.82, 0]} castShadow>
          <coneGeometry args={[1.1, 0.42, 24, 1, true]} />
          <meshStandardMaterial map={stripes()} side={THREE.DoubleSide} roughness={0.7} />
        </mesh>
      </group>
      {/* trees, strung with fairy lights */}
      {TREES.map((tr, i) => (
        <group key={i} position={[tr.x, 0, tr.z]} scale={tr.s}>
          <mesh position={[0, 1.6, 0]} castShadow material={M("#6B4A2F")}>
            <cylinderGeometry args={[0.22, 0.32, 3.2, 6]} />
          </mesh>
          {CANOPY.map(([x, y, z, r], k) => (
            <mesh key={k} position={[x, y, z]} castShadow material={M(k % 2 ? "#3F8A3A" : "#4E9E43")}>
              <icosahedronGeometry args={[r, 0]} />
            </mesh>
          ))}
        </group>
      ))}
      <FairyLights t={t} />
      <Flag t={t} g={g} />
    </group>
  );
};
