import React, { useMemo } from "react";
import * as THREE from "three";
import { M, canvasTex, mat, rand } from "./materials";

/**
 * The lineup the Roadster jumps: a Model Y (deep blue), a Model 3 (red), the Semi (white), a Cybertruck
 * (bare steel, and yes, one cracked window) and a Cybercab (champagne gold). Smooth cars are lofted through
 * cross-sections (wheel arches cut into their sides); the Cybertruck and the Semi's cab are flat facets.
 * Each faces -z (nose forward), origin on the ground under its middle, lights on.
 */

type V2 = [number, number];
type PL = [number, number][];

const pl = (c: PL, z: number) => {
  if (z <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (z <= c[i + 1][0]) {
      const k = (z - c[i][0]) / (c[i + 1][0] - c[i][0]);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * k;
    }
  }
  return c[c.length - 1][1];
};

/** A smooth loft: sections (each a half profile, x >= 0, bottom centre up round the side to the top centre)
 * mirrored, rows [i0, i1) of the profile, sections [s0, s1]. Smooth normals. */
const loft = (secs: { z: number; pts: V2[] }[], i0: number, i1: number, s0 = 0, s1 = secs.length - 1) => {
  const pos: number[] = [];
  const idx: number[] = [];
  const np = i1 - i0 + 1;
  const ring = (s: { z: number; pts: V2[] }, side: number) => {
    for (let i = i0; i <= i1; i++) pos.push(side * s.pts[i][0], s.pts[i][1], s.z);
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let s = s0; s <= s1; s++) ring(secs[s], side);
    for (let s = 0; s < s1 - s0; s++)
      for (let i = 0; i < np - 1; i++) {
        const a = base + s * np + i;
        const b = a + np;
        if (side > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
        else idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** Close an end of a loft with a fan (front: facing -z). */
const capEnd = (sec: { z: number; pts: V2[] }, front: boolean) => {
  const ring: THREE.Vector3[] = [];
  for (const [x, y] of sec.pts) ring.push(new THREE.Vector3(x, y, sec.z));
  for (let i = sec.pts.length - 2; i >= 1; i--) ring.push(new THREE.Vector3(-sec.pts[i][0], sec.pts[i][1], sec.z));
  const c = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  const v: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (front) v.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z);
    else v.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
};

type Spec = {
  len: number;
  axles: [number, number];
  wheelR: number;
  track: number;
  top: PL;
  belt: PL;
  yb: PL;
  w: PL;
  wr: PL;
  glass: [number, number]; // the greenhouse's z range
  ym: number;
  archR: number;
};

/** Sections for a smooth car from its profile curves, with wheel arches cut into the sides. */
const sections = (sp: Spec) => {
  const secs: { z: number; pts: V2[] }[] = [];
  const zs: number[] = [];
  const h = sp.len / 2;
  for (let z = -h; z <= h + 1e-6; z += 0.06) zs.push(Math.min(h, z));
  for (const z of zs) {
    const top = pl(sp.top, z);
    const yb = pl(sp.yb, z);
    const w = pl(sp.w, z);
    const inGlass = z > sp.glass[0] && z < sp.glass[1];
    const belt = Math.min(pl(sp.belt, z), top - 0.02);
    const wr = Math.min(pl(sp.wr, z), w * 0.97);
    // the arch over a wheel: the side's lower edge lifted on a circle round the axle
    let arch = 0;
    for (const a of sp.axles) {
      const dz = z - a;
      if (Math.abs(dz) < sp.archR) arch = Math.max(arch, sp.wheelR + Math.sqrt(sp.archR * sp.archR - dz * dz) - (yb + 0.12));
    }
    const lowY = yb + 0.12 + Math.max(0, arch);
    const ym = Math.max(sp.ym, lowY + 0.04);
    const pts: V2[] = [
      [0, yb],
      [w * 0.86 - (arch > 0 ? 0.18 : 0), yb],
      [w * (arch > 0 ? 0.985 : 0.985), lowY],
      [w, Math.min(ym, belt - 0.06)],
      [w * 0.985, belt - 0.05],
      [w * 0.96, belt],
    ];
    if (inGlass) {
      pts.push([w * 0.9 - 0.02, belt + (top - belt) * 0.5], [wr, top - 0.035], [wr * 0.55, top - 0.004], [0, top]);
    } else {
      pts.push([w * 0.9, belt + (top - belt) * 0.45], [w * 0.72, top - 0.012], [w * 0.38, top - 0.002], [0, top]);
    }
    secs.push({ z, pts });
  }
  return secs;
};

const SmoothCar: React.FC<{ sp: Spec; paint: THREE.Material; lights?: React.ReactNode; roofGlass?: boolean }> = ({ sp, paint, lights, roofGlass = true }) => {
  const g = useMemo(() => {
    const secs = sections(sp);
    const n = secs.length;
    const gi0 = secs.findIndex((s) => s.z > sp.glass[0]);
    const gi1 = secs.findIndex((s) => s.z >= sp.glass[1]) - 1;
    return {
      lower: loft(secs, 0, 5),
      hood: loft(secs, 5, 9, 0, gi0),
      glass: loft(secs, 5, roofGlass ? 9 : 7, gi0, gi1),
      roof: roofGlass ? null : loft(secs, 7, 9, gi0, gi1),
      trunk: loft(secs, 5, 9, gi1, n - 1),
      front: capEnd(secs[0], true),
      back: capEnd(secs[n - 1], false),
    };
  }, [sp, roofGlass]);
  return (
    <group>
      <mesh geometry={g.lower} material={paint} castShadow receiveShadow />
      <mesh geometry={g.hood} material={paint} castShadow />
      <mesh geometry={g.trunk} material={paint} castShadow />
      <mesh geometry={g.glass} material={darkGlass()} />
      {g.roof ? <mesh geometry={g.roof} material={paint} /> : null}
      <mesh geometry={g.front} material={paint} />
      <mesh geometry={g.back} material={paint} />
      {sp.axles.map((z) => [-1, 1].map((s) => <CarWheel key={`${z}${s}`} at={[s * sp.track, sp.wheelR, z]} r={sp.wheelR} side={s} />))}
      {lights}
    </group>
  );
};

export const darkGlass = () => mat("darkGlass", () => new THREE.MeshPhysicalMaterial({ color: "#0A0C10", metalness: 0.3, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.4 }));
const carPaint = (key: string, color: string, metallic = 0.5) =>
  mat(`carPaint-${key}`, () => new THREE.MeshPhysicalMaterial({ color, metalness: metallic, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 }));

const CarWheel: React.FC<{ at: [number, number, number]; r: number; side: number }> = ({ at, r, side }) => {
  const g = useMemo(() => {
    const tyre = new THREE.TorusGeometry(r - 0.07, 0.075, 12, 32);
    tyre.rotateY(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r - 0.085, r - 0.085, 0.2, 28);
    rim.rotateZ(Math.PI / 2);
    const cap = new THREE.CylinderGeometry(r - 0.1, r - 0.12, 0.02, 28);
    cap.rotateZ(Math.PI / 2);
    return { tyre, rim, cap };
  }, [r]);
  return (
    <group position={at}>
      <mesh geometry={g.tyre} material={M.tyre()} castShadow />
      <mesh geometry={g.rim} material={M.well()} />
      <mesh geometry={g.cap} material={M.titanium()} position={[side * 0.1, 0, 0]} />
    </group>
  );
};

/** A light bar (box) in HDR colour. */
const Bar: React.FC<{ at: [number, number, number]; size: [number, number, number]; color: string; k: number; name: string }> = ({ at, size, color, k, name }) => (
  <mesh material={M.light(name, color, k)} position={at} scale={size}>
    <boxGeometry args={[1, 1, 1]} />
  </mesh>
);

// --------------------------------------------------------------------------------------------- Model 3
const MODEL3: Spec = {
  len: 4.72,
  axles: [-1.44, 1.44],
  wheelR: 0.34,
  track: 0.8,
  top: [
    [-2.36, 0.56],
    [-2.25, 0.66],
    [-2.0, 0.72],
    [-1.2, 0.8],
    [-0.95, 0.86],
    [-0.6, 1.1],
    [-0.25, 1.33],
    [0.15, 1.44],
    [0.6, 1.42],
    [1.1, 1.27],
    [1.55, 1.03],
    [2.05, 1.0],
    [2.3, 0.99],
    [2.36, 0.93],
  ],
  belt: [
    [-2.36, 0.5],
    [-2.0, 0.66],
    [-0.95, 0.83],
    [0.0, 0.9],
    [1.55, 0.98],
    [2.36, 0.9],
  ],
  yb: [
    [-2.36, 0.3],
    [-2.15, 0.17],
    [2.1, 0.17],
    [2.36, 0.33],
  ],
  w: [
    [-2.36, 0.56],
    [-2.18, 0.82],
    [-1.6, 0.912],
    [0.0, 0.925],
    [1.6, 0.925],
    [2.2, 0.86],
    [2.36, 0.68],
  ],
  wr: [
    [-0.95, 0.8],
    [-0.25, 0.66],
    [0.6, 0.64],
    [1.55, 0.72],
  ],
  glass: [-0.95, 1.55],
  ym: 0.56,
  archR: 0.42,
};

export const Model3: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <SmoothCar
    sp={MODEL3}
    paint={carPaint("m3", "#9E0F14", 0.35)}
    lights={
      <>
        {[-1, 1].map((s) => (
          <Bar key={s} name="m3head" at={[s * 0.66, 0.66, -2.24]} size={[0.32, 0.035, 0.05]} color="#F4F8FF" k={5 * k} />
        ))}
        <Bar name="m3tail" at={[0, 0.9, 2.35]} size={[1.5, 0.03, 0.02]} color="#FF1A12" k={3 * k} />
        {[-1, 1].map((s) => (
          <Bar key={`t${s}`} name="m3tail" at={[s * 0.72, 0.88, 2.31]} size={[0.28, 0.06, 0.04]} color="#FF1A12" k={3 * k} />
        ))}
      </>
    }
  />
);

// --------------------------------------------------------------------------------------------- Model Y
const MODELY: Spec = {
  len: 4.75,
  axles: [-1.445, 1.445],
  wheelR: 0.37,
  track: 0.83,
  top: [
    [-2.375, 0.62],
    [-2.25, 0.74],
    [-2.0, 0.8],
    [-1.2, 0.9],
    [-0.95, 0.96],
    [-0.55, 1.28],
    [-0.15, 1.54],
    [0.3, 1.62],
    [1.0, 1.58],
    [1.7, 1.44],
    [2.15, 1.3],
    [2.3, 1.12],
    [2.375, 0.95],
  ],
  belt: [
    [-2.375, 0.56],
    [-2.0, 0.76],
    [-0.95, 0.93],
    [0.0, 1.0],
    [1.8, 1.08],
    [2.375, 0.95],
  ],
  yb: [
    [-2.375, 0.36],
    [-2.2, 0.2],
    [2.1, 0.2],
    [2.375, 0.38],
  ],
  w: [
    [-2.375, 0.6],
    [-2.2, 0.86],
    [-1.6, 0.955],
    [0.0, 0.96],
    [1.6, 0.96],
    [2.2, 0.9],
    [2.375, 0.74],
  ],
  wr: [
    [-0.95, 0.82],
    [-0.15, 0.68],
    [1.0, 0.66],
    [2.15, 0.6],
  ],
  glass: [-0.95, 2.18],
  ym: 0.62,
  archR: 0.45,
};

export const ModelY: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <SmoothCar
    sp={MODELY}
    paint={carPaint("my", "#1A3A8C", 0.55)}
    lights={
      <>
        {/* the new Model Y's light bar right across the nose */}
        <Bar name="myBar" at={[0, 0.8, -2.255]} size={[1.55, 0.016, 0.02]} color="#F4F8FF" k={6 * k} />
        {[-1, 1].map((s) => (
          <Bar key={s} name="myHead" at={[s * 0.7, 0.66, -2.3]} size={[0.24, 0.05, 0.04]} color="#F4F8FF" k={4 * k} />
        ))}
        <Bar name="myTail" at={[0, 1.02, 2.33]} size={[1.6, 0.03, 0.03]} color="#FF1A12" k={3.5 * k} />
      </>
    }
  />
);

// --------------------------------------------------------------------------------------------- Cybercab
const CABSPEC: Spec = {
  len: 4.1,
  axles: [-1.4, 1.4],
  wheelR: 0.36,
  track: 0.82,
  top: [
    [-2.05, 0.6],
    [-1.92, 0.76],
    [-1.5, 0.86],
    [-1.1, 0.94],
    [-0.7, 1.18],
    [-0.2, 1.38],
    [0.3, 1.4],
    [0.9, 1.3],
    [1.5, 1.06],
    [1.95, 0.9],
    [2.05, 0.74],
  ],
  belt: [
    [-2.05, 0.56],
    [-1.1, 0.88],
    [0.0, 0.92],
    [1.5, 0.98],
    [2.05, 0.72],
  ],
  yb: [
    [-2.05, 0.32],
    [-1.9, 0.18],
    [1.9, 0.18],
    [2.05, 0.34],
  ],
  w: [
    [-2.05, 0.6],
    [-1.85, 0.88],
    [-1.3, 0.97],
    [0.0, 0.975],
    [1.3, 0.97],
    [1.85, 0.9],
    [2.05, 0.66],
  ],
  wr: [
    [-1.1, 0.78],
    [-0.2, 0.66],
    [0.9, 0.62],
    [1.5, 0.7],
  ],
  glass: [-1.1, 1.5],
  ym: 0.55,
  archR: 0.43,
};

export const Cybercab: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <SmoothCar
    sp={CABSPEC}
    paint={mat("cabGold", () => new THREE.MeshPhysicalMaterial({ color: "#B79A62", metalness: 0.85, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 }))}
    lights={
      <>
        <Bar name="cabBar" at={[0, 0.8, -2.0]} size={[1.5, 0.018, 0.03]} color="#F4F8FF" k={6 * k} />
        <Bar name="cabTail" at={[0, 0.84, 2.0]} size={[1.5, 0.02, 0.03]} color="#FF1A12" k={4 * k} />
      </>
    }
  />
);

// ------------------------------------------------------------------------------------------- Cybertruck
/** The cracked window: a spiderweb from where the steel ball hit, on dark glass. */
const crackTex = () =>
  canvasTex("crack", 512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rand(42);
    const cx = w * 0.55;
    const cy = h * 0.5;
    g.strokeStyle = "rgba(225,235,245,0.85)";
    g.lineCap = "round";
    // radial cracks, jagged
    for (let i = 0; i < 17; i++) {
      let a = (i / 17) * Math.PI * 2 + r() * 0.3;
      let x = cx;
      let y = cy;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x, y);
      const L = 120 + r() * 220;
      for (let s = 0; s < L; s += 14) {
        a += (r() - 0.5) * 0.35;
        x += Math.cos(a) * 14;
        y += Math.sin(a) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // the rings round the impact
    for (let ring = 1; ring <= 4; ring++) {
      g.lineWidth = 1.4;
      g.beginPath();
      const R = ring * (24 + r() * 10);
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = R * (0.85 + r() * 0.3);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    }
    // the white bruise in the middle
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 30);
    grad.addColorStop(0, "rgba(240,245,250,0.9)");
    grad.addColorStop(1, "rgba(240,245,250,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, 30, 0, Math.PI * 2);
    g.fill();
  });

const brushedTex = () =>
  canvasTex(
    "brushed",
    512,
    512,
    (g, w, h) => {
      const r = rand(3);
      g.fillStyle = "#9A9EA4";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const v = 130 + r() * 90;
        g.strokeStyle = `rgba(${v},${v},${v + 4},0.35)`;
        g.lineWidth = 0.6 + r();
        const y = r() * h;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y + (r() - 0.5) * 3);
        g.stroke();
      }
    },
    [3, 3],
  );

export const Cybertruck: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const g = useMemo(() => {
    // the profile: the flat nose, the windscreen up to the apex over the cabin, the long straight line down
    // to the tail. Each span: [z, roof height, side glass to the next station, roof glass to the next]
    const h = 5.68 / 2;
    const apex = 0.08;
    const roofAt = (z: number) => (z <= apex ? 1.13 + ((1.8 - 1.13) * (z + 1.75)) / (apex + 1.75) : 1.8 - ((1.8 - 1.12) * (z - apex)) / (h - 0.02 - apex));
    const ST: [number, number, boolean, boolean][] = [
      [-h, 0.98, false, false],
      [-h + 0.18, 1.0, false, false],
      [-1.75, 1.13, true, true],
      [apex, 1.8, true, false],
      [0.95, roofAt(0.95), false, false],
      [h - 0.02, 1.12, false, false],
      [h, 1.1, false, false],
    ];
    const W = 1.0;
    const yb = 0.32;
    const belt = (_z: number, top: number) => Math.min(top - 0.02, 1.1);
    const wt = (z: number) => (z < -1.6 ? 0.9 : 0.68);
    const v: Record<string, number[]> = { steel: [], glass: [], clad: [] };
    const quad = (key: string, a: number[], b: number[], c: number[], d: number[]) => v[key].push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < ST.length - 1; i++) {
      const [za, ta, sideG, roofG] = ST[i];
      const [zb, tb] = ST[i + 1];
      const wa = za < -h + 0.1 ? W - 0.08 : W;
      const wb = zb < -h + 0.1 ? W - 0.08 : W;
      for (const s of [1, -1]) {
        const P = (z: number, t: number, w: number) => ({
          floor: [s * (w - 0.08), yb, z],
          low: [s * w, yb + 0.1, z],
          belt: [s * w, belt(z, t), z],
          roofE: [s * wt(z), t, z],
          roofC: [0, t + 0.01, z],
        });
        const a = P(za, ta, wa);
        const b = P(zb, tb, wb);
        const order = (p: number[][]) => (s > 0 ? p : [p[0], p[3], p[2], p[1]]);
        const put = (key: string, p: number[][]) => {
          const [q0, q1, q2, q3] = order(p);
          quad(key, q0, q1, q2, q3);
        };
        put("clad", [a.floor, b.floor, b.low, a.low]);
        put("steel", [a.low, b.low, b.belt, a.belt]);
        put(sideG ? "glass" : "steel", [a.belt, b.belt, b.roofE, a.roofE]);
        put(roofG ? "glass" : "steel", [a.roofE, b.roofE, b.roofC, a.roofC]);
      }
    }
    const mk = (a: number[]) => {
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      g2.computeVertexNormals();
      return g2;
    };
    const end = (z: number, top: number, w: number, front: boolean) => {
      const pts = [
        [-w + 0.08, yb],
        [w - 0.08, yb],
        [w, yb + 0.1],
        [w, belt(z, top)],
        [wt(z), top],
        [-wt(z), top],
        [-w, belt(z, top)],
        [-w, yb + 0.1],
      ];
      const arr: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = [pts[0][0], pts[0][1], z];
        const b = [pts[i][0], pts[i][1], z];
        const c = [pts[i + 1][0], pts[i + 1][1], z];
        if (front) arr.push(...a, ...c, ...b);
        else arr.push(...a, ...b, ...c);
      }
      return mk(arr);
    };
    return { steel: mk(v.steel), glass: mk(v.glass), clad: mk(v.clad), front: end(-h, 0.98, W - 0.08, true), back: end(h, 1.1, W, false) };
  }, []);
  const steel = mat("cyberSteel", () => new THREE.MeshPhysicalMaterial({ map: brushedTex(), color: "#C9CDD3", metalness: 1, roughness: 0.34, envMapIntensity: 1.4 }));
  const clad = mat("cyberClad", () => new THREE.MeshStandardMaterial({ color: "#16171A", roughness: 0.75 }));
  return (
    <group>
      <mesh geometry={g.steel} material={steel} castShadow />
      <mesh geometry={g.glass} material={darkGlass()} />
      <mesh geometry={g.clad} material={clad} />
      <mesh geometry={g.front} material={steel} />
      <mesh geometry={g.back} material={steel} />
      {/* the trapezoid arches' black cladding */}
      {[-1.85, 1.85].map((z) =>
        [-1, 1].map((s) => (
          <mesh key={`${z}${s}`} material={clad} position={[s * 1.005, 0.62, z]} scale={[0.02, 0.62, 1.25]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        )),
      )}
      {[-1.85, 1.85].map((z) => [-1, 1].map((s) => <CarWheel key={`w${z}${s}`} at={[s * 0.86, 0.43, z]} r={0.43} side={s} />))}
      {/* the light bar right across the front, and the one across the back */}
      <Bar name="ctBar" at={[0, 0.965, -2.85]} size={[1.92, 0.018, 0.02]} color="#F4F8FF" k={7 * k} />
      <Bar name="ctTail" at={[0, 1.08, 2.85]} size={[1.92, 0.025, 0.02]} color="#FF1A12" k={4 * k} />
      {/* the cracked window (the driver's side, toward the crowd) */}
      <mesh position={[-1.0, 1.32, -0.75]} rotation={[0, -Math.PI / 2, 0.05]} scale={[0.95, 0.4, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={crackTex()} transparent depthWrite={false} toneMapped={false} color="#9AA3AD" />
      </mesh>
    </group>
  );
};

// ------------------------------------------------------------------------------------------------ Semi
export const Semi: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const g = useMemo(() => {
    // the cab: a big rounded nose, the wrapped windscreen, the roof fairing sweeping back
    const cabLen = 2.6;
    const secs: { z: number; pts: V2[] }[] = [];
    const zs: number[] = [];
    for (let z = -3.45; z <= -3.45 + cabLen + 1e-6; z += 0.1) zs.push(z);
    for (const z of zs) {
      const t = (z + 3.45) / cabLen;
      const top = 3.95 - 1.9 * Math.pow(Math.max(0, 1 - t * 2.2), 2.2);
      const belt = 1.55 + 0.25 * Math.min(1, t * 2.5);
      const w = 1.3 - 0.22 * Math.pow(Math.max(0, 1 - t * 3.0), 2);
      const glassOn = t > 0.08 && t < 0.42;
      const pts: V2[] = [
        [0, 0.55],
        [w - 0.1, 0.55],
        [w, 0.75],
        [w, belt - 0.1],
        [w * 0.99, belt],
        [w * 0.96, belt + (top - belt) * 0.5],
        [w * 0.86, top - 0.06],
        [w * 0.5, top - 0.005],
        [0, top],
      ];
      secs.push({ z, pts });
      void glassOn;
    }
    const n = secs.length;
    const gi0 = 1;
    const gi1 = Math.round(n * 0.42);
    return {
      lower: loft(secs, 0, 4),
      glass: loft(secs, 4, 8, gi0, gi1),
      upper: loft(secs, 4, 8, gi1, n - 1),
      nose: loft(secs, 4, 8, 0, gi0),
      front: capEnd(secs[0], true),
      back: capEnd(secs[n - 1], false),
    };
  }, []);
  const white = carPaint("semi", "#E8EBEE", 0.15);
  return (
    <group>
      <mesh geometry={g.lower} material={white} castShadow />
      <mesh geometry={g.glass} material={darkGlass()} />
      <mesh geometry={g.upper} material={white} castShadow />
      <mesh geometry={g.nose} material={white} />
      <mesh geometry={g.front} material={white} />
      <mesh geometry={g.back} material={white} />
      {/* the chassis behind the cab: rails, the fifth wheel, side fairings over the drive wheels */}
      <mesh material={M.black()} position={[0, 0.85, 0.9]} scale={[1.1, 0.3, 4.6]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      <mesh material={M.steel()} position={[0, 1.06, 1.6]} scale={[0.9, 0.08, 0.9]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={white} position={[s * 1.25, 1.0, 0.35]} scale={[0.05, 0.8, 2.6]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
      {[-2.6, 1.2, 2.55].map((z) => [-1, 1].map((s) => <CarWheel key={`${z}${s}`} at={[s * 1.02, 0.52, z]} r={0.52} side={s} />))}
      <Bar name="semiBar" at={[0, 1.42, -3.47]} size={[2.1, 0.03, 0.03]} color="#F4F8FF" k={6 * k} />
      {[-1, 1].map((s) => (
        <Bar key={s} name="semiHead" at={[s * 0.95, 1.0, -3.43]} size={[0.3, 0.07, 0.04]} color="#F4F8FF" k={5 * k} />
      ))}
    </group>
  );
};

/** One of the lineup by name. */
export const LineupCar: React.FC<{ name: string; k?: number }> = ({ name, k }) =>
  name === "model3" ? <Model3 k={k} /> : name === "modelY" ? <ModelY k={k} /> : name === "semi" ? <Semi k={k} /> : name === "cybertruck" ? <Cybertruck k={k} /> : <Cybercab k={k} />;
