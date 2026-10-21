import React, { useMemo } from "react";
import * as THREE from "three";
import { PORCH, ROOM } from "../layout";
import {
  GB,
  canvasTex,
  clamp01,
  envB,
  fbm,
  geoB,
  haloB,
  hash3,
  leafAtlas,
  mat,
  onceB,
  rand,
  ringB,
  shingleTex,
  snowBump,
  snowTex,
  sweepX,
  tubeCapped,
  type Course,
  type Prof,
} from "./texturesB";

/**
 * Outside the front windows: the porch roof (three-tab asphalt shingles in staggered courses, each tab its
 * own granule blend, every butt a real 4.5 mm step), its fascia, drip edge and wall flashing; a K-style
 * gutter with hangers, end caps, an outlet and a downspout (and, in a storm, an overflowing sheet of
 * water); multicolour C9 Christmas bulbs clipped along the gutter lip; and the season dressings: dry leaves,
 * a snow cover that drifts against the wall and fills the gutter (icicles under it), and rain splashes.
 *
 * Every piece shares one frame: the origin is the roof's top edge at the centre of the house wall's outer
 * face (world PORCH: x = 0, y = PORCH.yWall, z = PORCH.z0), the roof sloping down toward +z by `rise`
 * over `depth` to the eave. Put the pieces (or <Porch>, all of them) in one group placed there.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export type RoofSpec = { width: number; depth: number; rise: number };
export const ROOF_DEFAULT: RoofSpec = { width: 2 * (ROOM.outer + ROOM.wallT), depth: PORCH.z1 - PORCH.z0, rise: PORCH.yWall - PORCH.yEdge };

const EXPO0 = 0.14; // nominal shingle exposure (the frame fits a whole number of courses)
const T0 = 0.006; // two layers under each exposed tab
const TS = 0.0045; // one shingle: the butt's step
const OVER = 0.035; // the shingles' overhang past the deck edge
const FASCIA = 0.18;

export type RoofFrame = RoofSpec & {
  S: number;
  Stot: number;
  /** the exposure actually used (a whole number of courses from the wall to the eave) */
  E: number;
  sinA: number;
  cosA: number;
  butts: number[];
  courses: Course[];
  /** the shingle surface's height above the deck at slope distance s */
  h: (s: number) => number;
  /** the highest h within [s0, s1] */
  hMax: (s0: number, s1: number) => number;
  /** a point at (x, slope distance s, height n above the deck) */
  P: (x: number, s: number, n: number) => THREE.Vector3;
  N: THREE.Vector3;
  T: THREE.Vector3;
  /** the gutter's frame: its back top edge */
  gutter: { y: number; z: number };
};

/** The roof's geometry frame (shared by every porch piece). */
export const roofFrame = (spec: RoofSpec = ROOF_DEFAULT): RoofFrame =>
  onceB(`b-roofFrame-${spec.width}-${spec.depth}-${spec.rise}`, () => {
    const { width, depth, rise } = spec;
    const S = Math.hypot(depth, rise);
    const sinA = rise / S;
    const cosA = depth / S;
    const Stot = S + OVER;
    const n = Math.max(1, Math.round(Stot / EXPO0));
    const E = Stot / n;
    const butts = Array.from({ length: n }, (_, k) => Stot - k * E);
    const courses: Course[] = butts.map((b, k) => ({ s0: Math.max(0, b - E), s1: b, off: (k % 2) * 0.1524 + Math.floor(hash3(k, 7, 3) * 3) * 0.3048 + 0.05 }));
    const h = (s: number) => {
      const k = Math.min(n - 1, Math.max(0, Math.floor((Stot - s) / E)));
      const b = butts[k];
      return T0 + (TS * (s - (b - E))) / E;
    };
    const hMax = (s0: number, s1: number) => {
      let m = Math.max(h(s0), h(s1));
      for (const b of butts) if (b > s0 && b < s1) m = Math.max(m, T0 + TS);
      return m;
    };
    const P = (x: number, s: number, nn: number) => V(x, -s * sinA + nn * cosA, s * cosA + nn * sinA);
    return { width, depth, rise, S, Stot, E, sinA, cosA, butts, courses, h, hMax, P, N: V(0, cosA, sinA), T: V(0, -sinA, cosA), gutter: { y: -rise - 0.015, z: depth + 0.022 } };
  });

// ------------------------------------------------------------------------------------------- materials
const shingleMat = (F: RoofFrame, wet: number, base: string) => {
  const lvl = Math.round(clamp01(wet) * 8);
  return mat(`b-shingle-${F.width}-${F.Stot.toFixed(3)}-${base}-${lvl}`, () => {
    const t = shingleTex(`${F.width}-${F.Stot.toFixed(3)}-${base}`, F.width, F.Stot, F.courses, base);
    const w = lvl / 8;
    return new THREE.MeshPhysicalMaterial({
      map: t.colour,
      bumpMap: t.bump,
      bumpScale: 0.07,
      color: new THREE.Color(1, 1, 1).multiplyScalar(1 - 0.38 * w),
      roughness: 0.92 - 0.6 * w,
      clearcoat: 0.6 * w,
      clearcoatRoughness: 0.25,
      envMap: envB(),
      envMapIntensity: 0.25 + 0.9 * w,
    });
  });
};
const trimMat = () => mat("b-porchTrim", () => new THREE.MeshPhysicalMaterial({ color: "#EDEBE4", roughness: 0.5, clearcoat: 0.15 }));
const metalTrim = () => mat("b-porchMetal", () => new THREE.MeshStandardMaterial({ color: "#E6E4DE", metalness: 0.55, roughness: 0.35, envMap: envB(), envMapIntensity: 0.6 }));
const gutterMat = () => mat("b-gutterMat", () => new THREE.MeshStandardMaterial({ color: "#F2F1EC", metalness: 0.35, roughness: 0.32, envMap: envB(), envMapIntensity: 0.8, side: THREE.DoubleSide }));
const gutterInMat = () => mat("b-gutterIn", () => new THREE.MeshStandardMaterial({ color: "#8E8B84", metalness: 0.3, roughness: 0.6 }));

// ======================================================================================= the roof
export type PorchRoofProps = Partial<RoofSpec> & { /** 0..1 rain-darkened and glossy */ wet?: number; color?: string };
/**
 * The porch roof as a closed slab: the shingle surface (13 courses at a 140 mm exposure, keyways half a tab
 * off from course to course, each butt a 4.5 mm step), the shingles overhanging the eave by 35 mm; white
 * rake ends, a fascia under the eave, a soffit, and the step flashing where it meets the wall. In the porch
 * frame (see the file note); width and depth/rise default to the house's.
 */
export const PorchRoof: React.FC<PorchRoofProps> = ({ width = ROOF_DEFAULT.width, depth = ROOF_DEFAULT.depth, rise = ROOF_DEFAULT.rise, wet = 0, color = "#625C57" }) => {
  const F = roofFrame({ width, depth, rise });
  const geo = onceB(`b-roofGeo-${width}-${depth}-${rise}`, () => {
    const W = width / 2;
    const top = new GB();
    // each course: its exposed face (planar), then its butt step down to the next
    for (let k = 0; k < F.butts.length; k++) {
      const b = F.butts[k];
      const s0 = Math.max(0, b - F.E);
      const n0 = F.h(s0 + 1e-6);
      const n1 = T0 + TS;
      const nrm = F.P(0, b, n1).sub(F.P(0, s0, n0)).cross(V(1, 0, 0)).normalize();
      if (nrm.y < 0) nrm.negate();
      const v0 = 1 - s0 / F.Stot;
      const v1 = 1 - b / F.Stot;
      const a = top.v(F.P(-W, s0, n0), nrm, 0, v0);
      const c = top.v(F.P(W, s0, n0), nrm, 1, v0);
      const d = top.v(F.P(W, b, n1), nrm, 1, v1);
      const e = top.v(F.P(-W, b, n1), nrm, 0, v1);
      top.q(a, c, d, e, nrm);
      // the butt: down to the next course (or, at the eave, to the shingles' underside)
      const nLow = k === 0 ? -0.002 : T0;
      const bn = F.T.clone();
      const vb = 1 - (b - 0.003) / F.Stot;
      const f0 = top.v(F.P(-W, b, n1), bn, 0, vb);
      const f1 = top.v(F.P(W, b, n1), bn, 1, vb);
      const f2 = top.v(F.P(W, b, nLow), bn, 1, vb);
      const f3 = top.v(F.P(-W, b, nLow), bn, 0, vb);
      top.q(f0, f1, f2, f3, bn);
    }
    // the overhang's underside
    const dn = F.N.clone().negate();
    const u0 = top.v(F.P(-W, F.S, -0.002), dn, 0, 0);
    const u1 = top.v(F.P(W, F.S, -0.002), dn, 1, 0);
    const u2 = top.v(F.P(W, F.Stot, -0.002), dn, 1, 0);
    const u3 = top.v(F.P(-W, F.Stot, -0.002), dn, 0, 0);
    top.q(u0, u1, u2, u3, dn);
    // the section: sawtooth top, the eave, the soffit, the wall
    const sec: [number, number][] = []; // (z, y)
    const push = (p: THREE.Vector3) => sec.push([p.z, p.y]);
    push(F.P(0, 0, F.h(0)));
    for (let k = F.butts.length - 1; k >= 0; k--) {
      const b = F.butts[k];
      push(F.P(0, b, T0 + TS));
      push(F.P(0, b, k === 0 ? -0.002 : T0));
    }
    push(F.P(0, F.S, -0.002));
    const yb = -rise - FASCIA;
    sec.push([F.P(0, F.S, -0.002).z, yb]);
    sec.push([0, yb]);
    sec.push([0, F.P(0, 0, F.h(0)).y]);
    const trim = new GB();
    const tri = THREE.ShapeUtils.triangulateShape(
      sec.map(([z, y]) => new THREE.Vector2(z, y)),
      [],
    );
    for (const s of [-1, 1]) {
      const nx = V(s, 0, 0);
      const ids = sec.map(([z, y]) => trim.v(V(s * W, y, z), nx, z, y));
      for (const t of tri) trim.t(ids[t[0]], ids[t[1]], ids[t[2]], nx);
    }
    // soffit and the slab's front face (behind the fascia)
    const zf = F.P(0, F.S, -0.002).z;
    const q = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3) => trim.q(trim.v(a, n), trim.v(b, n), trim.v(c, n), trim.v(d, n), n);
    q(V(-W, yb, 0), V(W, yb, 0), V(W, yb, zf), V(-W, yb, zf), V(0, -1, 0));
    q(V(-W, F.P(0, F.S, -0.002).y, zf), V(W, F.P(0, F.S, -0.002).y, zf), V(W, yb, zf), V(-W, yb, zf), V(0, 0, 1));
    q(V(-W, F.P(0, 0, F.h(0)).y, 0), V(W, F.P(0, 0, F.h(0)).y, 0), V(W, yb, 0), V(-W, yb, 0), V(0, 0, -1));
    // the fascia board, its top cut to the roof's slope
    const fy0 = F.P(0, F.S, -0.002).y;
    const fasc: Prof = [
      [fy0 - 0.0004, zf + 0.0005],
      [fy0 - 0.0004 - 0.02 * (F.sinA / F.cosA) - 0.0015, zf + 0.02],
      [yb - 0.004, zf + 0.02],
      [yb - 0.004, zf + 0.0005],
    ];
    const fascia = sweepX(fasc, -W - 0.02, W + 0.02, 20);
    return { top: top.build(), trim: trim.build(), fascia };
  });
  // the step flashing at the wall: a leg on the top course and a leg up the siding
  const fl = useMemo(() => {
    const s1 = 0.065;
    const n0 = F.h(0.001) + 0.0012;
    const a = F.P(0, 0.003, n0);
    const b = F.P(0, s1, F.h(s1) + 0.0012);
    return { mid: a.clone().add(b).multiplyScalar(0.5), len: a.distanceTo(b), ang: Math.atan2(a.y - b.y, b.z - a.z), yTop: a.y + 0.075, y0: a.y - 0.004 };
  }, [F]);
  return (
    <group name="v:roof">
      <mesh geometry={geo.top} material={shingleMat(F, wet, color)} castShadow receiveShadow />
      <mesh geometry={geo.trim} material={trimMat()} castShadow receiveShadow />
      <mesh geometry={geo.fascia} material={trimMat()} castShadow receiveShadow />
      <mesh name="v:flashing" position={fl.mid} rotation={[fl.ang, 0, 0]} material={metalTrim()} castShadow receiveShadow>
        <boxGeometry args={[width - 0.004, 0.0012, fl.len]} />
      </mesh>
      <mesh name="v:flashing" position={[0, (fl.yTop + fl.y0) / 2, 0.0012]} material={metalTrim()} castShadow receiveShadow>
        <boxGeometry args={[width - 0.004, fl.yTop - fl.y0, 0.0012]} />
      </mesh>
      {/* the drip edge's lip in front of the fascia */}
      <mesh position={[0, -rise - 0.0155, depth + 0.0207]} material={metalTrim()} castShadow>
        <boxGeometry args={[width + 0.04, 0.011, 0.001]} />
      </mesh>
    </group>
  );
};

// ======================================================================================= the gutter
/** The K-style gutter's centre line (z' out from the back, y' down from the top): back, bottom, ogee face. */
const K_LINE: [number, number][] = [
  [0, 0],
  [0, -0.104],
  [0.072, -0.104],
  [0.083, -0.1],
  [0.092, -0.09],
  [0.097, -0.077],
  [0.1, -0.068],
  [0.108, -0.064],
  [0.112, -0.056],
  [0.114, -0.042],
  [0.118, -0.028],
  [0.122, -0.014],
  [0.125, -0.004],
  [0.126, 0],
];
const GT = 0.0012;
/** The gutter's sheet as a closed thin profile, with the rolled bead at the front lip. */
const gutterProf = (): Prof => {
  const L = K_LINE;
  const off = (sgn: number) =>
    L.map((p, i) => {
      const a = L[Math.max(0, i - 1)];
      const b = L[Math.min(L.length - 1, i + 1)];
      const dz = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dz, dy);
      // the normal to the line, toward the trough's inside for sgn = +1
      return [p[0] + (sgn * -dy * GT) / (2 * l), p[1] + (sgn * dz * GT) / (2 * l)] as [number, number];
    });
  const A = off(1);
  const B = off(-1).reverse();
  // the bead: a small roll at the lip (outward and down)
  const bead: [number, number][] = [];
  const c: [number, number] = [0.1285, -0.0015];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 - (i / 10) * Math.PI * 1.6;
    bead.push([c[0] + 0.003 * Math.cos(a), c[1] + 0.003 * Math.sin(a)]);
  }
  // profile coordinates for sweepX are (y, z)
  return [...A, ...bead, ...B].map(([z, y]) => [y, z] as [number, number]);
};
/** The front face's inner surface z' at a height y' (for fills). */
export const gutterInnerZ = (y: number) => {
  for (let i = 3; i < K_LINE.length; i++) {
    const [z0, y0] = K_LINE[i - 1];
    const [z1, y1] = K_LINE[i];
    if (y >= y0 && y <= y1) return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0) - GT;
  }
  return y > 0 ? K_LINE[K_LINE.length - 1][0] - GT : K_LINE[2][0];
};
const gutterGeo = (width: number) => geoB(`b-gutter-${width}`, () => sweepX(gutterProf(), -width / 2, width / 2, 50));
const endCapGeo = () =>
  geoB("b-gutterCap", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    K_LINE.forEach(([z, y]) => s.lineTo(z, y));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0012, bevelEnabled: false });
    // shape (z', y') -> local (x = -extrusion, y = y', z = z')
    g.rotateY(-Math.PI / 2);
    return g;
  });
const spoutProf = (): Prof => {
  const p: Prof = [];
  const hw = 0.0375;
  const hd = 0.025;
  const r = 0.006;
  const cs: [number, number, number][] = [
    [hw - r, hd - r, 0],
    [-hw + r, hd - r, Math.PI / 2],
    [-hw + r, -hd + r, Math.PI],
    [hw - r, -hd + r, Math.PI * 1.5],
  ];
  for (const [x, y, a0] of cs) for (let i = 0; i <= 3; i++) p.push([x + r * Math.cos(a0 + (i / 3) * (Math.PI / 2)), y + r * Math.sin(a0 + (i / 3) * (Math.PI / 2))]);
  return p;
};

const overflowTex = () =>
  canvasTex(
    "b-overflow",
    128,
    256,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = rand(61);
      for (let i = 0; i < 140; i++) {
        const x = r() * w;
        const y = r() * h;
        const l = 20 + r() * 80;
        const grd = g.createLinearGradient(0, y, 0, y + l);
        grd.addColorStop(0, "rgba(230,240,255,0)");
        grd.addColorStop(0.5, `rgba(230,240,255,${0.25 + r() * 0.5})`);
        grd.addColorStop(1, "rgba(230,240,255,0)");
        g.strokeStyle = grd;
        g.lineWidth = 1 + r() * 2.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y + l);
        g.stroke();
      }
    },
    [3, 1],
  );

export type GutterProps = {
  width?: number;
  /** where the downspout drops (x), and how far below the gutter it runs */
  spoutX?: number;
  spoutLength?: number;
  /** 0..1 a storm: water standing in the trough and sheeting over the lip in places; animated by time */
  overflow?: number;
  time?: number;
};
/**
 * A white aluminium K-style gutter (127 mm), built along x (centred) with its local origin at its back top
 * edge, the trough opening toward +z (place it at the roof frame's `gutter` point, or use <Porch>). Hidden
 * hangers across the top every 0.6 m, end caps, an outlet with a 2x3 in downspout that elbows back under
 * the soffit and drops `spoutLength`.
 */
export const Gutter: React.FC<GutterProps> = ({ width = ROOF_DEFAULT.width, spoutX, spoutLength = 2.4, overflow = 0, time = 0 }) => {
  const sx = spoutX ?? width / 2 - 0.2;
  const nh = Math.floor((width - 0.1) / 0.6);
  const spout = useMemo(() => {
    const p = spoutProf();
    // a 2x3 down-pipe: down 0.08 from the outlet, elbow back 0.1 under the soffit, then down
    const zc = 0.04;
    const a = geoB(`b-spoutA`, () => {
      const g = sweepX(
        p.map(([x, y]) => [x, y] as [number, number]),
        0,
        0.08,
      );
      g.rotateZ(-Math.PI / 2);
      return g;
    });
    return { a, zc };
  }, []);
  const ov = clamp01(overflow);
  const ovMat = useMemo(() => {
    const t = overflowTex().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, color: "#DDE8F2", roughness: 0.1, metalness: 0, envMap: envB(), envMapIntensity: 1.2, side: THREE.DoubleSide });
  }, []);
  ovMat.map!.offset.set(0, time * 2.6);
  ovMat.opacity = 0.35 + 0.5 * ov;
  const sheets = useMemo(() => {
    // three spills where the gutter is clogged
    const spots = [-0.31, 0.12, 0.38].map((u) => u * width);
    return spots.map((x0, i) =>
      geoB(`b-spill-${width}-${i}`, () => {
        const w = 0.35 + 0.25 * hash3(i, 3, 3);
        const g = new THREE.PlaneGeometry(w, 1, 8, 16);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < pos.count; k++) {
          const u = pos.getX(k) / w;
          const v = 0.5 - pos.getY(k); // 0 at the lip, 1 at the bottom
          const t = v * 0.32;
          const z = 0.132 + 0.55 * t * (1 - 0.25 * u * u);
          const y = 0.004 - 4.9 * t * t;
          pos.setXYZ(k, x0 + u * w * (1 + v * 0.3), y, z);
        }
        g.computeVertexNormals();
        return g;
      }),
    );
  }, [width]);
  return (
    <group name="v:gutter">
      <mesh geometry={gutterGeo(width)} material={gutterMat()} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={endCapGeo()} position={[s * (width / 2) + (s > 0 ? 0.0012 : 0), 0, 0]} material={gutterMat()} castShadow />
      ))}
      {Array.from({ length: nh }, (_, i) => -width / 2 + 0.3 + i * ((width - 0.6) / Math.max(1, nh - 1))).map((x, i) => (
        <mesh key={`h${i}`} position={[x, -0.0045, 0.063]} material={gutterMat()}>
          <boxGeometry args={[0.016, 0.0016, 0.124]} />
        </mesh>
      ))}
      {/* the outlet: a dark hole in the trough floor, and the pipe below */}
      <mesh position={[sx, -0.104 + GT + 0.0009, spout.zc]} rotation={[-Math.PI / 2, 0, 0]} material={mat("b-outletHole", () => new THREE.MeshBasicMaterial({ color: "#1A1A1A" }))}>
        <planeGeometry args={[0.068, 0.044]} />
      </mesh>
      <group position={[sx, -0.104, spout.zc]}>
        <mesh geometry={spout.a} material={gutterMat()} castShadow />
        <mesh
          geometry={geoB("b-spoutElbow", () => {
            const c = new THREE.CatmullRomCurve3([V(0, -0.075, 0), V(0, -0.11, -0.01), V(0, -0.15, -0.07), V(0, -0.17, -0.13), V(0, -0.2, -0.14)]);
            return tubeCapped(c, 0.031, 24, 14);
          })}
          material={gutterMat()}
          castShadow
        />
        <mesh position={[0, -0.2 - spoutLength / 2, -0.14]} material={gutterMat()} castShadow>
          <boxGeometry args={[0.075, spoutLength, 0.05]} />
        </mesh>
      </group>
      {ov > 0.01 ? (
        <>
          <mesh position={[0, -0.104 + 0.01 + 0.06 * ov, 0.06]} rotation={[-Math.PI / 2, 0, 0]} material={ovMat}>
            <planeGeometry args={[width - 0.004, 0.1]} />
          </mesh>
          {sheets.map((g, i) => (
            <mesh key={`sp${i}`} geometry={g} material={ovMat} />
          ))}
        </>
      ) : null}
      <mesh position={[0, -0.104 + GT + 0.0004, 0.036]} rotation={[-Math.PI / 2, 0, 0]} material={gutterInMat()} receiveShadow>
        <planeGeometry args={[width - 0.004, 0.07]} />
      </mesh>
    </group>
  );
};

// ======================================================================================= C9 lights
export const C9_COLOURS = ["#E0261E", "#1F9A3E", "#2357D8", "#F08A1A", "#F2C522"];
const c9Geo = () =>
  geoB("b-c9", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0.0085, 0],
      [0.0095, 0.004],
      [0.0118, 0.01],
      [0.0136, 0.018],
      [0.0138, 0.026],
      [0.0122, 0.036],
      [0.0092, 0.045],
      [0.0055, 0.052],
      [0.002, 0.0555],
      [0, 0.0562],
    ];
    return new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
  });
const c9SocketGeo = () =>
  geoB("b-c9Socket", () =>
    new THREE.LatheGeometry(
      [
        [0, -0.024],
        [0.0075, -0.024],
        [0.0092, -0.02],
        [0.0092, -0.004],
        [0.0085, 0],
        [0, 0],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      16,
    ),
  );
const c9Mat = (c: string, on: number) =>
  mat(`b-c9-${c}-${Math.round(on * 20)}`, () => {
    const col = new THREE.Color(c);
    return new THREE.MeshPhysicalMaterial({
      color: col.clone().lerp(new THREE.Color("#FFFFFF"), 0.15),
      roughness: 0.15,
      clearcoat: 1,
      transparent: on < 0.05,
      opacity: on < 0.05 ? 0.92 : 1,
      emissive: col.clone().multiplyScalar(0.05 + 7 * on),
      toneMapped: on < 0.05,
    });
  });
const greenPlastic = () => mat("b-c9Green", () => new THREE.MeshStandardMaterial({ color: "#1C3B22", roughness: 0.55 }));
const haloMatC = (c: string, k: number) =>
  mat(`b-c9halo-${c}-${Math.round(k * 40)}`, () => new THREE.SpriteMaterial({ map: haloB(), color: new THREE.Color(c).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));

export type ChristmasGutterLightsProps = { width?: number; on?: number; spacing?: number; halo?: number; seed?: number };
/**
 * Multicolour C9 bulbs (red, green, blue, orange, gold in turn) on clips over the gutter's front lip, every
 * `spacing` (0.3 m), tilted up and out; a green wire sagging between the clips. In the gutter's frame (same
 * origin as <Gutter>). on 0..1; a coloured halo sprite on each when lit.
 */
export const ChristmasGutterLights: React.FC<ChristmasGutterLightsProps> = ({ width = ROOF_DEFAULT.width, on = 1, spacing = 0.3, halo = 0.6, seed = 0 }) => {
  const k = clamp01(on);
  const n = Math.floor((width - 0.1) / spacing);
  const x0 = -((n - 1) * spacing) / 2;
  const tilt = 0.6;
  const wire = geoB(`b-c9wire-${width}-${spacing}`, () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = x0 + i * spacing;
      for (let j = 0; j < 12; j++) {
        const u = j / 12;
        pts.push(V(a + u * spacing, -0.009 - 0.016 * Math.sin(Math.PI * u), 0.1395 + 0.002 * Math.sin(Math.PI * u)));
      }
    }
    pts.push(V(x0 + (n - 1) * spacing, -0.009, 0.1395));
    return tubeCapped(new THREE.CatmullRomCurve3(pts), 0.0019, pts.length * 3, 5);
  });
  return (
    <group name="v:lights">
      <mesh geometry={wire} material={greenPlastic()} castShadow />
      {Array.from({ length: n }, (_, i) => {
        const x = x0 + i * spacing;
        const c = C9_COLOURS[(i + seed) % C9_COLOURS.length];
        return (
          <group key={i} position={[x, 0, 0]}>
            {/* the clip: a hook over the bead and a cradle on the outside */}
            <mesh position={[0, 0.0029, 0.1255]} material={greenPlastic()}>
              <boxGeometry args={[0.012, 0.0022, 0.013]} />
            </mesh>
            <mesh position={[0, -0.006, 0.1359]} material={greenPlastic()} castShadow>
              <boxGeometry args={[0.014, 0.019, 0.008]} />
            </mesh>
            <group position={[0, -0.002, 0.1475]} rotation={[tilt, 0, 0]}>
              <mesh geometry={c9SocketGeo()} position={[0, 0.024, 0]} material={greenPlastic()} castShadow />
              <mesh geometry={c9Geo()} position={[0, 0.024, 0]} material={c9Mat(c, k)} castShadow />
              {halo > 0 && k > 0.01 ? <sprite position={[0, 0.05, 0]} scale={[0.22, 0.22, 1]} material={haloMatC(c, 0.75 * halo * k)} /> : null}
            </group>
          </group>
        );
      })}
    </group>
  );
};

// ======================================================================================= leaves
const leafMat = () => mat("b-leafMat", () => new THREE.MeshStandardMaterial({ map: leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }));
export type DryLeavesProps = Partial<RoofSpec> & { count?: number; seed?: number; /** leaves in the gutter too */ gutter?: boolean };
/**
 * Dry autumn leaves on the porch roof (maples, oaks, birches), curled, each lying on the shingles (bridging
 * the butt steps, never through them) and never on another; more of them along the eave and in the wall's
 * lee, a few in the gutter trough. Porch frame.
 */
export const DryLeaves: React.FC<DryLeavesProps> = ({ width = ROOF_DEFAULT.width, depth = ROOF_DEFAULT.depth, rise = ROOF_DEFAULT.rise, count = 70, seed = 1, gutter = true }) => {
  const F = roofFrame({ width, depth, rise });
  const g = geoB(`b-leaves-${width}-${depth}-${rise}-${count}-${seed}-${gutter}`, () => {
    const r = rand(seed * 977 + 13);
    const placed: { x: number; s: number; rad: number }[] = [];
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const leaf = (cx: number, cz: number, size: number, rot: number, cell: number, surf: (x: number, z: number, rr: number) => { p: THREE.Vector3; n: THREE.Vector3 }, curl: number) => {
      const N = 6;
      const base = pos.length / 3;
      const cu = (cell % 4) / 4;
      const cv = Math.floor(cell / 4) / 2;
      for (let j = 0; j <= N; j++)
        for (let i = 0; i <= N; i++) {
          const u = i / N - 0.5;
          const v = j / N - 0.5;
          const lx = (u * Math.cos(rot) - v * Math.sin(rot)) * size;
          const lz = (u * Math.sin(rot) + v * Math.cos(rot)) * size;
          const sp = surf(cx + lx, cz + lz, size / N);
          // curl: the edges lift, the tip lifts more
          const lift = curl * size * (0.45 * u * u + 0.25 * (v + 0.5) ** 2 * (v > 0 ? 1 : 0.3));
          const p = sp.p.clone().addScaledVector(sp.n, lift);
          pos.push(p.x, p.y, p.z);
          nor.push(sp.n.x, sp.n.y, sp.n.z);
          uv.push(cu + (i / N) * 0.25, 1 - (cv + (1 - j / N) * 0.5));
        }
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const a = base + j * (N + 1) + i;
          idx.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1);
        }
    };
    const roofSurf = (x: number, s: number, cell: number) => {
      // the highest shingle within a cell either side, plus a hair
      const hn = F.hMax(s - cell - 0.003, s + cell + 0.003) + 0.0016;
      return { p: F.P(x, s, hn), n: F.N };
    };
    let tries = 0;
    while (placed.length < count && tries < count * 40) {
      tries++;
      const q = r();
      const s = q < 0.38 ? F.S - 0.02 - 0.3 * r() * r() : q < 0.55 ? 0.04 + 0.22 * r() * r() : 0.05 + (F.S - 0.1) * r();
      const x = (r() - 0.5) * (width - 0.16);
      const size = 0.085 + 0.06 * r();
      const rad = size * 0.72;
      if (s - rad < 0.075 || s + rad > F.Stot - 0.012 || Math.abs(x) + rad > width / 2 - 0.012) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.s - s) < p.rad + rad)) continue;
      placed.push({ x, s, rad });
      const cell = Math.floor(r() * 8);
      leaf(x, s, size, r() * Math.PI * 2, cell, (xx, ss, c) => roofSurf(xx, ss, c), 0.18 + 0.3 * r());
    }
    if (gutter) {
      const gp: number[] = [];
      for (let i = 0; i < Math.round(count * 0.25); i++) {
        const x = (r() - 0.5) * (width - 0.1);
        if (gp.some((p) => Math.abs(p - x) < 0.07)) continue;
        gp.push(x);
        const size = 0.05 + 0.014 * r();
        const cell = Math.floor(r() * 8);
        leaf(
          x,
          0.036,
          size,
          (r() - 0.5) * 0.8,
          cell,
          (xx, zz) => {
            // the trough floor is flat to z' = 0.072, then the face curves up: keep to the floor, lift at the edges
            const zc = Math.min(0.068, Math.max(0.006, zz));
            return { p: V(xx, F.gutter.y - 0.104 + GT + 0.0014 + 0.4 * Math.abs(zz - zc), F.gutter.z + zc), n: V(0, 1, 0) };
          },
          0.15,
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  });
  return <mesh name="v:leaves" geometry={g} material={leafMat()} castShadow receiveShadow />;
};

// ======================================================================================= snow
/**
 * Where snow settles first, per pixel over the roof (u across, v down the slope as the shingle texture):
 * fine, middle and coarse noise, a head start in the lee of every butt and in the wall's corner, then
 * flattened to percentiles, so a coverage c shows exactly the fraction c (alpha = 1 - percentile).
 */
const snowRankTex = (F: RoofFrame, seed: number) =>
  canvasTex(`b-snowRank-${F.width}-${F.Stot.toFixed(3)}-${seed}`, Math.min(2048, Math.ceil(F.width / 0.004)), Math.min(1024, Math.ceil(F.Stot / 0.004)), (g, w, h) => {
    const q = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const s = ((y + 0.5) / h) * F.Stot;
      const k = Math.floor((F.Stot - s) / F.E);
      const fromButt = s - (F.Stot - (k + 1) * F.E);
      const bonus = 0.3 * Math.exp(-fromButt / 0.02) + 0.25 * Math.exp(-s / 0.12);
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        // fbm tiles over [0, 1) with the given period in cells; v is scaled to keep the cells square
        const ar = F.Stot / F.width;
        const fine = fbm(u, v * ar, Math.round(F.width / 0.07), 3, seed + 21);
        const mid = fbm(u, v * ar, Math.round(F.width / 0.3), 3, seed + 11);
        const coarse = fbm(u, v * ar, Math.max(2, Math.round(F.width / 1.0)), 2, seed + 12);
        q[y * w + x] = 0.38 * fine + 0.37 * mid + 0.25 * coarse - bonus;
      }
    }
    const sorted = Float32Array.from(q).sort();
    const img = g.createImageData(w, h);
    for (let i = 0; i < q.length; i++) {
      // the value's percentile (binary search)
      let lo = 0;
      let hi = sorted.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < q[i]) lo = mid + 1;
        else hi = mid;
      }
      const a = Math.round(255 * (1 - lo / sorted.length));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = a;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, undefined, false);
const snowRoofMat = (F: RoofFrame, seed: number, cover: number) => {
  const c = Math.round(cover * 50) / 50;
  return mat(`b-snowRoof-${F.width}-${F.Stot.toFixed(3)}-${seed}-${c}`, () => {
    const map = snowTex().clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(F.width * 1.6, F.Stot * 1.6);
    map.needsUpdate = true;
    const bump = snowBump().clone();
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(F.width * 1.6, F.Stot * 1.6);
    bump.needsUpdate = true;
    const m = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.1, roughness: 0.8, sheen: 0.4, sheenColor: new THREE.Color("#DDE8FF") });
    if (c < 0.999) {
      m.alphaMap = snowRankTex(F, seed);
      m.alphaTest = Math.min(0.999, Math.max(0.002, 1 - c));
    }
    return m;
  });
};
const snowSolidMat = () => mat("b-snowSolid", () => new THREE.MeshPhysicalMaterial({ map: snowTex(), bumpMap: snowBump(), bumpScale: 0.1, roughness: 0.8, sheen: 0.4, sheenColor: new THREE.Color("#DDE8FF") }));
const iceMat = () => mat("b-ice", () => new THREE.MeshPhysicalMaterial({ color: "#E8F2FA", roughness: 0.06, transparent: true, opacity: 0.6, envMap: envB(), envMapIntensity: 1.4, clearcoat: 1, depthWrite: false }));

export type SnowDriftProps = Partial<RoofSpec> & { amount?: number; seed?: number; gutter?: boolean };
/**
 * Snow on the porch roof, 0..1: first in the lee of the butts and the wall corner, then a thin cover that
 * still shows the courses, then a smooth pillowy blanket (up to 9 cm, drifted to 17 cm against the wall),
 * rounding off at the eave and the rakes. The gutter fills and mounds over; icicles grow under it past
 * 0.6. Porch frame (the gutter's trough at the frame's gutter point).
 */
export const SnowDrift: React.FC<SnowDriftProps> = ({ width = ROOF_DEFAULT.width, depth = ROOF_DEFAULT.depth, rise = ROOF_DEFAULT.rise, amount = 0.6, seed = 1, gutter = true }) => {
  const F = roofFrame({ width, depth, rise });
  const a = clamp01(amount);
  const lvl = Math.round(a * 50);
  const ak = lvl / 50;
  const roof = geoB(`b-snowRoofGeo-${width}-${depth}-${rise}-${lvl}-${seed}`, () => {
    const W = width / 2;
    const nx = Math.ceil(width / 0.03);
    // rows: either side of every butt, and four between
    const rows: number[] = [];
    const bs = [...F.butts].reverse(); // from the top
    let prev = 0;
    for (const b of bs) {
      for (let k = 0; k < 4; k++) rows.push(prev + ((b - prev) * k) / 4 + (k === 0 && prev > 0 ? 0.0012 : 0));
      rows.push(b - 0.0012);
      prev = b;
    }
    rows.push(F.Stot);
    const depthAt = (x: number, s: number) => {
      const u = (x + W) / width;
      const v = s / F.Stot;
      const n = fbm(u, v * (F.Stot / width), Math.max(2, Math.round(width / 0.8)), 3, seed);
      let d = Math.pow(ak, 1.25) * 0.09 * (0.72 + 0.56 * n);
      d += ak * ak * 0.08 * Math.exp(-s / 0.22) * (0.8 + 0.4 * fbm(u, 0.2, Math.max(2, Math.round(width / 1.5)), 2, seed + 3));
      // round off at the eave and the rakes
      const ee = clamp01((F.Stot - s) / 0.09);
      const re = clamp01((W - Math.abs(x)) / 0.07);
      return d * Math.sqrt(ee * (2 - ee)) * Math.sqrt(re * (2 - re));
    };
    const gb = new GB();
    const grid: number[][] = [];
    for (let j = 0; j < rows.length; j++) {
      const s = rows[j];
      const r: number[] = [];
      for (let i = 0; i <= nx; i++) {
        const x = -W + (i / nx) * width;
        const hs = F.hMax(Math.max(1e-4, s - 0.004), Math.min(F.Stot - 1e-4, s + 0.004));
        const smooth = T0 + TS + depthAt(x, s);
        let top = Math.max(hs + 0.0018, smooth);
        if (j === rows.length - 1) top = hs + 0.0018;
        let p = F.P(x, s, top);
        if (j === 0) {
          // against the wall: pull the edge back to the siding
          const back = (p.z - 0.0026) / F.cosA;
          p = F.P(x, s - back, top);
        }
        r.push(gb.v(p, F.N, (x + W) / width, 1 - Math.min(F.Stot, Math.max(0, s)) / F.Stot));
      }
      grid.push(r);
    }
    for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nx; i++) gb.q(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i], F.N);
    return gb.build(true);
  });
  // the gutter: filled, then mounded over the opening; icicles under it
  const gut = geoB(`b-snowGutter-${width}-${lvl}-${seed}`, () => {
    if (ak < 0.15) return new THREE.BufferGeometry();
    const fill = Math.min(-0.006, -0.1 + (ak - 0.15) * 0.25);
    const mound = Math.max(0, ak - 0.55) * 0.06;
    const nx = Math.ceil(width / 0.03);
    const nz = 12;
    const gb = new GB();
    const zb = 0.0015;
    const zf = gutterInnerZ(fill) - 0.0015;
    const rowsG: number[][] = [];
    for (let i = 0; i <= nx; i++) {
      const x = -width / 2 + 0.0015 + (i / nx) * (width - 0.003);
      const r: number[] = [];
      for (let k = 0; k <= nz; k++) {
        const u = k / nz;
        const z = zb + (zf - zb) * u;
        const hump = Math.pow(Math.sin(Math.PI * u), 0.5) * (mound * (0.8 + 0.4 * hash3(Math.floor(x * 12), seed, 9)) + 0.004);
        let y = fill + hump;
        // under the shingles' overhang (the back of the trough) the snow stays below their underside
        const zw = F.gutter.z + z;
        const zEdge = F.P(0, F.Stot, -0.002).z;
        if (zw < zEdge + 0.004) {
          const sOf = Math.min(F.Stot, (zw + 0.002 * F.sinA) / F.cosA);
          const yUnder = -sOf * F.sinA - 0.002 * F.cosA - F.gutter.y;
          y = Math.min(y, yUnder - 0.0025);
        }
        r.push(gb.v(V(x, F.gutter.y + y, F.gutter.z + z), V(0, 1, 0), x * 2, z * 2));
      }
      rowsG.push(r);
    }
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) gb.q(rowsG[i][k], rowsG[i + 1][k], rowsG[i + 1][k + 1], rowsG[i][k + 1], V(0, 1, 0));
    return gb.build(true);
  });
  const icicles = useMemo(() => {
    if (ak <= 0.6) return [];
    const out: { x: number; len: number; r: number }[] = [];
    const r = rand(seed * 31 + 5);
    for (let x = -width / 2 + 0.12; x < width / 2 - 0.1; x += 0.09 + 0.22 * r()) out.push({ x, len: ((ak - 0.6) / 0.4) * (0.04 + 0.16 * r() * r()), r: 0.005 + 0.004 * r() });
    return out;
  }, [ak, width, seed]);
  const iceGeo = (len: number, rr: number) =>
    geoB(`b-icicle-${len.toFixed(3)}-${rr.toFixed(4)}`, () => {
      const pts: THREE.Vector2[] = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push(new THREE.Vector2(Math.max(0.0002, rr * Math.pow(1 - t, 1.3) * (1 + 0.12 * Math.sin(t * 19))), -t * len));
      }
      pts.unshift(new THREE.Vector2(0.0001, 0));
      return new THREE.LatheGeometry(pts.reverse(), 10);
    });
  return (
    <group name="v:snow">
      {ak > 0.004 ? <mesh geometry={roof} material={snowRoofMat(F, seed, Math.min(1, ak * 1.65))} castShadow receiveShadow /> : null}
      {gutter && ak >= 0.15 ? <mesh geometry={gut} material={snowSolidMat()} castShadow receiveShadow /> : null}
      {gutter
        ? icicles.map((ic, i) => (
            <mesh key={i} geometry={iceGeo(ic.len, ic.r)} position={[ic.x, F.gutter.y - 0.104 - GT / 2 - 0.0003, F.gutter.z + 0.03 + 0.02 * hash3(i, 2, 2)]} material={iceMat()} />
          ))
        : null}
    </group>
  );
};

// ======================================================================================= rain splashes
const ringMat = () => mat("b-splashRing", () => new THREE.MeshBasicMaterial({ map: ringB(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: "#FFFFFF", toneMapped: false }));
const dropMat = () => mat("b-splashDrop", () => new THREE.MeshStandardMaterial({ color: "#E4EEF8", emissive: new THREE.Color("#5A6878"), roughness: 0.05, metalness: 0, envMap: envB(), envMapIntensity: 1.8, transparent: true, opacity: 0.9 }));

export type RainSplashProps = Partial<RoofSpec> & { time: number; amount?: number; seed?: number };
/**
 * Rain landing on the porch roof: small crowns of droplets thrown up and falling back, and ripple rings
 * spreading on the wet shingles, each living 0.16 s; about 300 a second at amount 1. Deterministic in time.
 * Porch frame.
 */
export const RainSplash: React.FC<RainSplashProps> = ({ width = ROOF_DEFAULT.width, depth = ROOF_DEFAULT.depth, rise = ROOF_DEFAULT.rise, time, amount = 1, seed = 1 }) => {
  const F = roofFrame({ width, depth, rise });
  const MAX = 220;
  const DROPS = 6;
  const meshes = useMemo(() => {
    const ring = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ringMat(), MAX);
    ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ring.frustumCulled = false;
    const drop = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), dropMat(), MAX * DROPS);
    drop.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    drop.frustumCulled = false;
    ring.setColorAt(0, new THREE.Color(1, 1, 1));
    return { ring, drop };
  }, []);
  const n = Math.round(MAX * clamp01(amount));
  const life = 0.13;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), F.N);
  const c = new THREE.Color();
  let ri = 0;
  let di = 0;
  for (let i = 0; i < n; i++) {
    const P = 0.3 + 0.22 * hash3(i, seed, 1);
    const ph = hash3(i, seed, 2);
    const cyc = Math.floor(time / P + ph);
    const age = (time / P + ph - cyc) * P;
    if (age > life) continue;
    const x = (hash3(i, cyc, 3) - 0.5) * (width - 0.08);
    const s = 0.03 + hash3(i, cyc, 4) * (F.Stot - 0.06);
    const base = F.P(x, s, F.hMax(s - 0.03, s + 0.03) + 0.0012);
    const k = age / life;
    const rr = 0.004 + 0.02 * Math.sqrt(k);
    m.compose(base, q, V(rr * 2, rr * 2, 1));
    meshes.ring.setMatrixAt(ri, m);
    c.setScalar(0.22 * (1 - k) * (1 - k));
    meshes.ring.setColorAt(ri, c);
    ri++;
    for (let d = 0; d < DROPS; d++) {
      const ang = (d / DROPS) * Math.PI * 2 + hash3(i, cyc, 5 + d) * 0.8;
      const vh = 0.18 + 0.16 * hash3(i, cyc, 11 + d);
      const vv = 0.4 + 0.35 * hash3(i, cyc, 17 + d);
      const up = vv * age - 4.9 * age * age;
      if (up < 0) continue;
      const dir = V(Math.cos(ang), 0, Math.sin(ang));
      const tang = dir.clone().sub(F.N.clone().multiplyScalar(dir.dot(F.N))).normalize();
      const p = base.clone().addScaledVector(tang, vh * age).addScaledVector(F.N, up + 0.002);
      const sz = 0.0018 + 0.0014 * hash3(i, cyc, 23 + d);
      m.compose(p, new THREE.Quaternion(), V(sz, sz * 1.4, sz));
      meshes.drop.setMatrixAt(di, m);
      di++;
    }
  }
  meshes.ring.count = ri;
  meshes.drop.count = di;
  meshes.ring.instanceMatrix.needsUpdate = true;
  if (meshes.ring.instanceColor) meshes.ring.instanceColor.needsUpdate = true;
  meshes.drop.instanceMatrix.needsUpdate = true;
  return (
    <group>
      <primitive object={meshes.ring} />
      <primitive object={meshes.drop} />
    </group>
  );
};

// ======================================================================================= the whole porch
export type PorchProps = Partial<RoofSpec> & {
  /** 0..1 rain-darkened shingles */
  wet?: number;
  /** dry leaves (count; 0 = none) */
  leaves?: number;
  /** 0..1 snow */
  snow?: number;
  /** 0..1 rain splashes (needs time) */
  rain?: number;
  /** 0..1 water over the gutter's lip (needs time) */
  overflow?: number;
  /** null/undefined = no Christmas lights; else on 0..1 */
  lights?: number | null;
  time?: number;
  seed?: number;
  color?: string;
};
/** The porch roof with its gutter, downspout and season dressings, in the porch frame: place this group at
 * (0, PORCH.yWall, PORCH.z0). */
export const Porch: React.FC<PorchProps> = ({ width = ROOF_DEFAULT.width, depth = ROOF_DEFAULT.depth, rise = ROOF_DEFAULT.rise, wet = 0, leaves = 0, snow = 0, rain = 0, overflow = 0, lights = null, time = 0, seed = 1, color }) => {
  const F = roofFrame({ width, depth, rise });
  return (
    <group>
      <PorchRoof width={width} depth={depth} rise={rise} wet={wet} color={color} />
      <group position={[0, F.gutter.y, F.gutter.z]}>
        <Gutter width={width} overflow={overflow} time={time} />
        {lights !== null && lights !== undefined ? <ChristmasGutterLights width={width} on={lights} /> : null}
      </group>
      {leaves > 0 ? <DryLeaves width={width} depth={depth} rise={rise} count={leaves} seed={seed} /> : null}
      {snow > 0.004 ? <SnowDrift width={width} depth={depth} rise={rise} amount={snow} seed={seed} /> : null}
      {rain > 0.01 ? <RainSplash width={width} depth={depth} rise={rise} time={time} amount={rain} seed={seed} /> : null}
    </group>
  );
};
