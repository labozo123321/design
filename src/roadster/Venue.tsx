import React, { useMemo } from "react";
import * as THREE from "three";
import { M, canvasTex, mat, rand } from "./materials";
import { LANES, LINEUP, RAMP } from "./path";
import { hash } from "./timeline";

/**
 * The test site at night: a huge pad of tarmac with the lanes painted on it; the inverted ramp (a
 * roller-coaster half loop on a steel truss tower, its edges lined with light, blue light washing up it);
 * the low black platform under the lineup with red LED strips; floodlight towers; the crowd barrier; and
 * off in the dark the test stands with their red lights, utility poles, the horizon's glow and the stars.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- the pad
const asphaltTex = () =>
  canvasTex(
    "asphalt",
    512,
    512,
    (g, w, h) => {
      const r = rand(11);
      g.fillStyle = "#3A3B3E";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        const v = 40 + r() * 38;
        g.fillStyle = `rgba(${v},${v},${v + 2},${0.35 + r() * 0.5})`;
        const s = 1 + r() * 2.2;
        g.fillRect(r() * w, r() * h, s, s);
      }
      // patches and seams
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(20,20,22,${0.05 + r() * 0.08})`;
        g.beginPath();
        g.ellipse(r() * w, r() * h, 20 + r() * 80, 10 + r() * 50, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
    [90, 90],
  );

const roughTex = () =>
  canvasTex(
    "asphaltRough",
    256,
    256,
    (g, w, h) => {
      const r = rand(5);
      g.fillStyle = "#C8C8C8";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = 150 + r() * 105;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    },
    [140, 140],
    false,
  );

/** Tyre marks: dark streaks down the lanes (black rubber laid by the rehearsals). */
const tyreMarks = () => {
  const v: number[] = [];
  const r = rand(21);
  const strip = (x0: number, z0: number, z1: number, wdt: number, wob: number) => {
    const n = 30;
    for (let i = 0; i < n; i++) {
      const za = z0 + ((z1 - z0) * i) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const xa = x0 + Math.sin(za * 0.07 + x0) * wob;
      const xb = x0 + Math.sin(zb * 0.07 + x0) * wob;
      v.push(xa - wdt, 0.006, za, xb - wdt, 0.006, zb, xb + wdt, 0.006, zb, xa - wdt, 0.006, za, xb + wdt, 0.006, zb, xa + wdt, 0.006, za);
    }
  };
  for (const lane of [LANES.a, LANES.b]) {
    for (let k = 0; k < 6; k++) {
      const off = (k % 2 ? 1 : -1) * (0.86 + (r() - 0.5) * 0.12);
      strip(lane + off, 2 - r() * 4, -30 - r() * 25, 0.13 + r() * 0.05, 0.05 + r() * 0.1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
};

/** The painted lines: the lanes' edges, the start lines (with a chequer), the launch boxes. */
const markings = () => {
  const white: number[] = [];
  const quad = (arr: number[], x0: number, z0: number, x1: number, z1: number, y = 0.005) => arr.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  // lane edges (solid), out to the ramp and past the lineup
  for (const [x, z0, z1] of [
    [LANES.a - 2.6, 6, -66],
    [LANES.a + 2.6, 6, -66],
    [LANES.b - 2.6, 10, -34],
    [LANES.b + 2.6, 10, -34],
    [LANES.b - 2.6, -58, -110],
    [LANES.b + 2.6, -58, -110],
  ])
    quad(white, x - 0.08, z0, x + 0.08, z1);
  // start lines
  quad(white, LANES.a - 2.6, -0.1, LANES.a + 2.6, 0.1);
  quad(white, LANES.b - 2.6, LANES.startB - 0.1, LANES.b + 2.6, LANES.startB + 0.1);
  // the chequer just past each start line
  const cheq: number[] = [];
  for (const [x0, z0] of [
    [LANES.a, -0.1],
    [LANES.b, LANES.startB - 0.1],
  ])
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) quad(cheq, x0 - 2.5 + i * 0.5, z0 - j * 0.5, x0 - 2.0 + i * 0.5, z0 - 0.5 - j * 0.5, 0.0055);
  // the dashed centre between the lanes
  for (let z = 6; z > -110; z -= 6) quad(white, (LANES.a + LANES.b) / 2 - 0.07, z, (LANES.a + LANES.b) / 2 + 0.07, z - 3);
  const mk = (a: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  };
  return { white: mk(white), cheq: mk(cheq) };
};

export const Pad: React.FC = () => {
  const marks = useMemo(markings, []);
  const tyres = useMemo(tyreMarks, []);
  const pad = mat(
    "pad",
    () =>
      new THREE.MeshStandardMaterial({
        map: asphaltTex(),
        roughnessMap: roughTex(),
        roughness: 0.62,
        metalness: 0.0,
        color: "#9A9CA2",
        envMapIntensity: 0.6,
      }),
  );
  const paint = mat("paintLine", () => new THREE.MeshStandardMaterial({ color: "#D9DBDE", roughness: 0.55 }));
  const rubber = mat("rubber", () => new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false }));
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0, -50]} material={pad} receiveShadow>
        <planeGeometry args={[340, 340]} />
      </mesh>
      {/* beyond the pad: the dark ground out to the horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -50]}>
        <circleGeometry args={[3000, 64]} />
        <meshStandardMaterial color="#0E0F0D" roughness={1} />
      </mesh>
      <mesh geometry={marks.white} material={paint} receiveShadow />
      <mesh geometry={marks.cheq} material={paint} receiveShadow />
      <mesh geometry={tyres} material={rubber} />
    </group>
  );
};

// ------------------------------------------------------------------------------------------ the ramp
/** The ramp's riding surface by arc length: the point, the forward tangent, the inward normal. */
export const rampAt = (s: number) => {
  const a1 = (RAMP.r1 * Math.PI) / 2;
  if (s <= a1) {
    const th = s / RAMP.r1;
    return {
      p: V3(RAMP.x, RAMP.r1 - RAMP.r1 * Math.cos(th), RAMP.entryZ - RAMP.r1 * Math.sin(th)),
      f: V3(0, Math.sin(th), -Math.cos(th)),
      u: V3(0, Math.cos(th), Math.sin(th)),
    };
  }
  const ph = (s - a1) / RAMP.r2;
  const c2 = V3(RAMP.x, RAMP.r1, RAMP.entryZ - RAMP.r1 + RAMP.r2);
  return {
    p: c2.clone().add(V3(0, RAMP.r2 * Math.sin(ph), -RAMP.r2 * Math.cos(ph))),
    f: V3(0, Math.cos(ph), Math.sin(ph)),
    u: V3(0, -Math.sin(ph), Math.cos(ph)),
  };
};
export const RAMP_LEN = (RAMP.r1 * Math.PI) / 2 + (RAMP.r2 * Math.PI) / 2;
const DECK_W = 2.3; // half width
const DECK_T = 0.42; // thickness

const rampGeometry = () => {
  const n = 120;
  const surf: number[] = [];
  const back: number[] = [];
  const sides: number[] = [];
  const walls: number[] = [];
  const S: { p: THREE.Vector3; u: THREE.Vector3 }[] = [];
  for (let i = 0; i <= n; i++) {
    const s = -2 + ((RAMP_LEN + 2) * i) / n;
    const r = s < 0 ? { p: V3(RAMP.x, 0, RAMP.entryZ - s), u: V3(0, 1, 0) } : rampAt(s);
    S.push({ p: r.p.clone().add(r.u.clone().multiplyScalar(0.002)), u: r.u.clone() });
  }
  const X = V3(1, 0, 0);
  const push = (arr: number[], ...pts: THREE.Vector3[]) => pts.forEach((p) => arr.push(p.x, p.y, p.z));
  for (let i = 0; i < n; i++) {
    const a = S[i];
    const b = S[i + 1];
    const aL = a.p.clone().addScaledVector(X, -DECK_W);
    const aR = a.p.clone().addScaledVector(X, DECK_W);
    const bL = b.p.clone().addScaledVector(X, -DECK_W);
    const bR = b.p.clone().addScaledVector(X, DECK_W);
    // the riding surface faces the loop's centre (+u)
    push(surf, aL, bL, bR, aL, bR, aR);
    // the back (outside of the loop)
    const ta = Math.min(1, i / 8) * DECK_T;
    const tb = Math.min(1, (i + 1) / 8) * DECK_T;
    const aLb = aL.clone().addScaledVector(a.u, -ta);
    const aRb = aR.clone().addScaledVector(a.u, -ta);
    const bLb = bL.clone().addScaledVector(b.u, -tb);
    const bRb = bR.clone().addScaledVector(b.u, -tb);
    push(back, aLb, bRb, bLb, aLb, aRb, bRb);
    // the deck's edges
    push(sides, aL, aLb, bLb, aL, bLb, bL);
    push(sides, aR, bRb, aRb, aR, bR, bRb);
    // the low walls on the edges (on the riding side)
    const h = 0.32;
    for (const sx of [-1, 1]) {
      const a0 = a.p.clone().addScaledVector(X, sx * DECK_W);
      const b0 = b.p.clone().addScaledVector(X, sx * DECK_W);
      const a1 = a0.clone().addScaledVector(a.u, h);
      const b1 = b0.clone().addScaledVector(b.u, h);
      if (sx < 0) push(walls, a0, a1, b1, a0, b1, b0);
      else push(walls, a0, b1, a1, a0, b0, b1);
    }
  }
  const mk = (a: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  };
  // the LED lines along the walls' tops, and the centre dashes
  const lines = [-1, 1].map((sx) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(S.slice(6).map((q) => q.p.clone().addScaledVector(X, sx * (DECK_W - 0.04)).addScaledVector(q.u, 0.33))), 160, 0.025, 6, false));
  const dash: number[] = [];
  for (let i = 8; i < n; i += 4) {
    const a = S[i];
    const b = S[i + 2];
    const w = 0.07;
    push(dash, a.p.clone().addScaledVector(X, -w).addScaledVector(a.u, 0.004), b.p.clone().addScaledVector(X, -w).addScaledVector(b.u, 0.004), b.p.clone().addScaledVector(X, w).addScaledVector(b.u, 0.004), a.p.clone().addScaledVector(X, -w).addScaledVector(a.u, 0.004), b.p.clone().addScaledVector(X, w).addScaledVector(b.u, 0.004), a.p.clone().addScaledVector(X, w).addScaledVector(a.u, 0.004));
  }
  return { surf: mk(surf), back: mk(back), sides: mk(sides), walls: mk(walls), lines, dash: mk(dash) };
};

/** The truss: two lattice towers behind the loop, cantilevers out to the overhang, braces to the deck. */
const trussMembers = () => {
  const m: [THREE.Vector3, THREE.Vector3, number][] = [];
  const zBack = RAMP.entryZ - RAMP.r1 - DECK_T - 1.2; // behind the vertical
  const top = RAMP.top + 1.6;
  for (const sx of [-1, 1]) {
    const x0 = RAMP.x + sx * (DECK_W + 0.5);
    const x1 = x0 + sx * 1.2;
    // a square lattice tower: four chords, horizontals and diagonals every 1.5 m
    const corners = [
      [x0, zBack],
      [x1, zBack],
      [x1, zBack - 1.2],
      [x0, zBack - 1.2],
    ];
    for (const [x, z] of corners) m.push([V3(x, 0, z), V3(x, top, z), 0.07]);
    for (let y = 0; y < top; y += 1.5) {
      for (let k = 0; k < 4; k++) {
        const [xa, za] = corners[k];
        const [xb, zb] = corners[(k + 1) % 4];
        m.push([V3(xa, y, za), V3(xb, y, zb), 0.035]);
        m.push([V3(xa, y, za), V3(xb, Math.min(top, y + 1.5), zb), 0.028]);
      }
    }
    // braces from the tower to the deck's back, all the way up the curve
    for (let s = 3; s < RAMP_LEN; s += 2.2) {
      const r = rampAt(s);
      const pb = r.p.clone().addScaledVector(r.u, -DECK_T).add(V3(sx * (DECK_W - 0.3), 0, 0));
      const tower = V3(x0, Math.min(top, Math.max(0.5, pb.y)), zBack);
      if (pb.distanceTo(tower) > 0.6) m.push([pb, tower, 0.05]);
    }
    // legs under the low part of the curve
    for (let s = 2; s < 13; s += 2.2) {
      const r = rampAt(s);
      const pb = r.p.clone().addScaledVector(r.u, -DECK_T).add(V3(sx * (DECK_W - 0.3), 0, 0));
      m.push([pb, V3(pb.x, 0, pb.z), 0.06]);
    }
  }
  // the bridge across the towers' tops, and the cantilever over the loop's top
  for (const y of [top, top - 1.5])
    m.push([V3(RAMP.x - DECK_W - 0.5, y, zBack - 0.6), V3(RAMP.x + DECK_W + 0.5, y, zBack - 0.6), 0.06]);
  for (const sx of [-1, 1]) {
    const x0 = RAMP.x + sx * (DECK_W - 0.3);
    m.push([V3(x0, top, zBack), V3(x0, top - 0.2, RAMP.entryZ - RAMP.r1 + RAMP.r2 + 0.5), 0.06]);
  }
  return m;
};

export const Ramp: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const g = useMemo(rampGeometry, []);
  const members = useMemo(trussMembers, []);
  const inst = useMemo(() => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat("truss", () => new THREE.MeshStandardMaterial({ color: "#3B4250", metalness: 0.7, roughness: 0.42 })), members.length);
    const m4 = new THREE.Matrix4();
    members.forEach(([a, b, r], i) => {
      const d = b.clone().sub(a);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      m4.compose(a, q, V3(r, d.length(), r));
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = true;
    return mesh;
  }, [members]);
  const deck = mat("deck", () => new THREE.MeshStandardMaterial({ color: "#5B5F66", roughness: 0.8, metalness: 0.1, map: asphaltTex() }));
  const deckBack = mat("deckBack", () => new THREE.MeshStandardMaterial({ color: "#2A2F3A", roughness: 0.6, metalness: 0.5 }));
  const wall = mat("rampWall", () => new THREE.MeshStandardMaterial({ color: "#20242C", roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
  const led = M.light("rampLed", "#BFD9FF", 5 * glow);
  const paintM = mat("rampPaint", () => new THREE.MeshStandardMaterial({ color: "#E8EAEE", roughness: 0.5 }));
  return (
    <group>
      <mesh geometry={g.surf} material={deck} receiveShadow />
      <mesh geometry={g.back} material={deckBack} />
      <mesh geometry={g.sides} material={deckBack} />
      <mesh geometry={g.walls} material={wall} />
      <mesh geometry={g.dash} material={paintM} />
      {g.lines.map((l, i) => (
        <mesh key={i} geometry={l} material={led} />
      ))}
      <primitive object={inst} />
    </group>
  );
};

// ------------------------------------------------------------------------------- the lineup platform
export const LineupPlatform: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const z0 = Math.max(...LINEUP.map((v) => v.z + v.w / 2)) + 0.9;
  const z1 = Math.min(...LINEUP.map((v) => v.z - v.w / 2)) - 0.9;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const wide = 8.4;
  const red = M.light("lineupRed", "#FF2318", 6 * glow);
  return (
    <group position={[LANES.b, 0, zc]}>
      <mesh material={mat("platform", () => new THREE.MeshStandardMaterial({ color: "#0E0F12", roughness: 0.35, metalness: 0.2 }))} position={[0, 0.09, 0]} scale={[wide, 0.18, len]} receiveShadow castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* red LED strips round its edges */}
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} material={red} position={[s * (wide / 2 + 0.01), 0.12, 0]} scale={[0.02, 0.03, len]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`z${s}`} material={red} position={[0, 0.12, s * (len / 2 + 0.01)]} scale={[wide, 0.03, 0.02]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
};

// ------------------------------------------------------------------------------- the floodlight towers
export const FLOODS: { at: THREE.Vector3; aim: THREE.Vector3 }[] = [
  { at: V3(-33, 13, -8), aim: V3(-4, 0, -12) },
  { at: V3(-33, 13, -64), aim: V3(-8, 0, -60) },
  { at: V3(-33, 13, -112), aim: V3(-12, 0, -100) },
  { at: V3(18, 13, -28), aim: V3(-4, 0, -40) },
  { at: V3(18, 13, -92), aim: V3(-4, 0, -86) },
  { at: V3(10, 13, 22), aim: V3(-6, 0, 2) },
];

export const FloodTower: React.FC<{ at: THREE.Vector3; aim: THREE.Vector3; k?: number }> = ({ at, aim, k = 1 }) => {
  const yaw = Math.atan2(aim.x - at.x, aim.z - at.z);
  const lamp = M.light("flood", "#FFF6E8", 9 * k);
  return (
    <group position={[at.x, 0, at.z]}>
      {/* the mast: a tapered lattice of four chords */}
      {[
        [-0.35, -0.35],
        [0.35, -0.35],
        [0.35, 0.35],
        [-0.35, 0.35],
      ].map(([x, z], i) => (
        <mesh key={i} material={mat("mast", () => new THREE.MeshStandardMaterial({ color: "#5A606A", metalness: 0.6, roughness: 0.5 }))} position={[x * 0.7, at.y / 2, z * 0.7]} rotation={[z * 0.03, 0, -x * 0.03]}>
          <cylinderGeometry args={[0.05, 0.06, at.y, 6]} />
        </mesh>
      ))}
      <group position={[0, at.y, 0]} rotation={[0, yaw, 0]}>
        <mesh material={mat("floodFrame", () => new THREE.MeshStandardMaterial({ color: "#2A2D33", metalness: 0.6, roughness: 0.5 }))} scale={[3.0, 1.5, 0.25]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => (
            <mesh key={`${r}${c}`} material={lamp} position={[-1.08 + c * 0.72, -0.48 + r * 0.48, 0.14]} rotation={[0.35, 0, 0]}>
              <circleGeometry args={[0.17, 20]} />
            </mesh>
          )),
        )}
      </group>
    </group>
  );
};

// ---------------------------------------------------------------------------------------- the barrier
export const BARRIER_X = -28;
export const Barrier: React.FC = () => {
  const inst = useMemo(() => {
    // crowd-control barriers: 2.3 m panels of a frame and vertical bars, end to end
    const n = Math.round(150 / 2.35);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.InstancedMesh(geo, mat("barrier", () => new THREE.MeshStandardMaterial({ color: "#1B1D21", metalness: 0.6, roughness: 0.45 })), n * 16);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const z = 22 - i * 2.35;
      const put = (x: number, y: number, zz: number, sx: number, sy: number, sz: number) => m.setMatrixAt(k++, m4.compose(V3(x, y, zz), new THREE.Quaternion(), V3(sx, sy, sz)));
      put(BARRIER_X, 1.08, z - 1.15, 0.04, 0.04, 2.25);
      put(BARRIER_X, 0.22, z - 1.15, 0.04, 0.04, 2.25);
      for (let b = 0; b < 12; b++) put(BARRIER_X, 0.65, z - 0.08 - b * 0.19, 0.018, 0.86, 0.018);
      put(BARRIER_X - 0.25, 0.02, z - 0.1, 0.6, 0.04, 0.06);
      put(BARRIER_X - 0.25, 0.02, z - 2.2, 0.6, 0.04, 0.06);
    }
    m.count = k;
    return m;
  }, []);
  return <primitive object={inst} />;
};

// --------------------------------------------------------------------------------------- far away
/** The test stands, poles and the like: dark silhouettes with lights on them, far out. */
export const FarSite: React.FC<{ t: number }> = ({ t }) => {
  const stands = useMemo(
    () => [
      { at: V3(160, 0, -620), h: 62, w: 14 },
      { at: V3(320, 0, -700), h: 48, w: 10 },
      { at: V3(-240, 0, -780), h: 40, w: 9 },
      { at: V3(520, 0, -420), h: 30, w: 12 },
    ],
    [],
  );
  const dark = mat("farDark", () => new THREE.MeshStandardMaterial({ color: "#07080A", roughness: 1 }));
  const blink = 0.5 + 0.5 * Math.sin(t * 3.1);
  const red = M.light("aviation", "#FF2A1A", 3 + 9 * blink);
  const work = M.light("work", "#FFE7C2", 6);
  return (
    <group>
      {stands.map((s, i) => (
        <group key={i} position={s.at}>
          <mesh material={dark} position={[0, s.h / 2, 0]} scale={[s.w, s.h, s.w]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <mesh material={dark} position={[0, s.h + 6, 0]} scale={[s.w * 0.3, 12, s.w * 0.3]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <mesh material={red} position={[0, s.h + 12.4, 0]} scale={1.1}>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
          {[0.25, 0.55, 0.85].map((f) => (
            <mesh key={f} material={work} position={[s.w * 0.51, s.h * f, 0]} scale={[0.2, 0.8, 1.6]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* utility poles off to the west, wires between them */}
      {Array.from({ length: 9 }, (_, i) => {
        const z = 40 - i * 32;
        return (
          <group key={i} position={[-78, 0, z]}>
            <mesh material={dark} position={[0, 5.5, 0]}>
              <cylinderGeometry args={[0.13, 0.16, 11, 8]} />
            </mesh>
            <mesh material={dark} position={[0, 10.4, 0]} scale={[2.6, 0.12, 0.12]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          </group>
        );
      })}
      {[-1.1, 0, 1.1].map((x) => (
        <mesh key={x} material={dark} position={[-78 + x, 10.5, 40 - 128]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 256, 4]} />
        </mesh>
      ))}
    </group>
  );
};

/** The sky: black, a little glow low down, and the stars (out here, a lot of them). */
export const Sky: React.FC = () => {
  const stars = useMemo(() => {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = hash(i * 1.31 + 0.2);
      const v = hash(i * 2.17 + 0.7);
      const y = 0.05 + 0.95 * Math.pow(u, 0.8);
      const a = v * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 2500, y * 2500, Math.sin(a) * r * 2500], i * 3);
      const b = 0.25 + 1.6 * Math.pow(hash(i * 3.7), 6);
      const warm = hash(i * 5.1);
      col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1.0 - 0.15 * warm)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  const dome = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p; }",
        fragmentShader: /* glsl */ `
          varying vec3 vP;
          void main() {
            float y = max(vP.y, 0.0);
            vec3 c = mix(vec3(0.03, 0.032, 0.045), vec3(0.004, 0.005, 0.012), smoothstep(0.0, 0.35, y));
            // the town's glow to the north-east, low
            float ne = max(0.0, dot(normalize(vP.xz), normalize(vec2(0.5, -1.0))));
            c += vec3(0.07, 0.045, 0.03) * exp(-y * 14.0) * pow(ne, 3.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <group>
      <mesh material={dome}>
        <sphereGeometry args={[2800, 32, 16]} />
      </mesh>
      <points geometry={stars}>
        <pointsMaterial size={2.2} sizeAttenuation={false} vertexColors transparent depthWrite={false} />
      </points>
    </group>
  );
};
