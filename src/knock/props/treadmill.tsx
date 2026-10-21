import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GB,
  beltTex,
  brushedTex,
  consoleTex,
  cottonTex,
  denimTex,
  ellipseP,
  envB,
  geoB,
  gripTex,
  hash3,
  hoodTex,
  knitTex,
  mat,
  sheetSolid,
  sweep,
  sweepX,
  terryTex,
  tubeCapped,
  withRepeat,
  type Prof,
} from "./texturesB";

/**
 * A home treadmill (generic, no brand) and the laundry that slowly turns it into a drying rack. Built on
 * the floor at the centre of its footprint (0.75 x 1.79 m), facing -z: the motor hood and console at -z,
 * the walker facing -z, the belt's top run moving toward +z. The tops read from above: the hood's vent
 * panel, the console's display and keys with the red stop key, silver uprights and handlebars with foam
 * grips and pulse plates, aluminium step rails with black grip inserts, the belt with its lap seam.
 * Laundry (0..1) arrives in fixed stages, every piece placed clear of the others and of the frame, and on
 * the +x side (the wall, in Nora's room) nothing reaches past x = 0.372.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Dimensions (local, metres) and the four rubber feet (x, z) for carpet dents. */
export const TREADMILL = {
  w: 0.75,
  len: 1.79,
  z0: -0.895,
  z1: 0.85,
  beltTop: 0.1825,
  rail: { x: 0.33, y: 1.02, z0: -0.54, z1: -0.1 },
  crossbar: { z: -0.3 },
  consoleTop: 1.3,
  feet: [
    [-0.3, -0.7],
    [0.3, -0.7],
    [-0.31, 0.81],
    [0.31, 0.81],
  ] as [number, number][],
  /** the belt loop's length (m): pass belt = speed * t; it wraps every BELT_LOOP metres */
  beltLoop: 0,
};

// ------------------------------------------------------------------------------------------- frame
const BELT = { z0: -0.5, z1: 0.78, yc: 0.152, rIn: 0.0285, rOut: 0.0305, hw: 0.24 };
const loopLen = 2 * (BELT.z1 - BELT.z0) + 2 * Math.PI * BELT.rOut;
TREADMILL.beltLoop = loopLen;

/** The belt: a closed loop round both rollers with its thickness, the outside textured (v along the loop). */
const beltGeo = () =>
  geoB("b-tm-belt", () => {
    const gb = new GB();
    const pts: { y: number; z: number; ny: number; nz: number; s: number }[] = [];
    const L = BELT.z1 - BELT.z0;
    const arc = Math.PI * BELT.rOut;
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * loopLen;
      let y: number;
      let z: number;
      let ny: number;
      let nz: number;
      if (s < L) {
        z = BELT.z0 + s;
        y = BELT.yc + BELT.rOut;
        ny = 1;
        nz = 0;
      } else if (s < L + arc) {
        const a = Math.PI / 2 - (s - L) / BELT.rOut;
        ny = Math.sin(a);
        nz = Math.cos(a);
        z = BELT.z1 + BELT.rOut * nz;
        y = BELT.yc + BELT.rOut * ny;
      } else if (s < 2 * L + arc) {
        z = BELT.z1 - (s - L - arc);
        y = BELT.yc - BELT.rOut;
        ny = -1;
        nz = 0;
      } else {
        const a = -Math.PI / 2 - (s - 2 * L - arc) / BELT.rOut;
        ny = Math.sin(a);
        nz = Math.cos(a);
        z = BELT.z0 + BELT.rOut * nz;
        y = BELT.yc + BELT.rOut * ny;
      }
      pts.push({ y, z, ny, nz, s });
    }
    const t = BELT.rOut - BELT.rIn;
    const o: number[][] = [];
    const n: number[][] = [];
    for (const p of pts) {
      const N1 = V(0, p.ny, p.nz);
      o.push([-1, 1].map((sx) => gb.v(V(sx * BELT.hw, p.y, p.z), N1, (sx + 1) / 2, p.s / loopLen)));
      const N2 = N1.clone().negate();
      n.push([-1, 1].map((sx) => gb.v(V(sx * BELT.hw, p.y - p.ny * t, p.z - p.nz * t), N2, (sx + 1) / 2, p.s / loopLen)));
    }
    for (let i = 0; i < N; i++) {
      gb.q(o[i][0], o[i][1], o[i + 1][1], o[i + 1][0]);
      gb.q(n[i][0], n[i][1], n[i + 1][1], n[i + 1][0]);
      for (const k of [0, 1]) {
        const f = V(k ? 1 : -1, 0, 0);
        const a = gb.v(gb.P(o[i][k]), f, 0, 0);
        const b = gb.v(gb.P(o[i + 1][k]), f, 0, 0);
        const c = gb.v(gb.P(n[i + 1][k]), f, 0, 0);
        const d = gb.v(gb.P(n[i][k]), f, 0, 0);
        gb.q(a, b, c, d, f);
      }
    }
    return gb.build();
  });

/** Round a closed polygon's corners (radius r each, n segments). */
const roundPoly = (p: Prof, r: number | number[], n = 5): Prof => {
  const out: Prof = [];
  const m = p.length;
  for (let i = 0; i < m; i++) {
    const a = p[(i - 1 + m) % m];
    const b = p[i];
    const c = p[(i + 1) % m];
    const rr = Array.isArray(r) ? r[i] : r;
    const d1 = [a[0] - b[0], a[1] - b[1]];
    const d2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(d1[0], d1[1]);
    const l2 = Math.hypot(d2[0], d2[1]);
    const u1 = [d1[0] / l1, d1[1] / l1];
    const u2 = [d2[0] / l2, d2[1] / l2];
    const cos = u1[0] * u2[0] + u1[1] * u2[1];
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const tlen = Math.min(rr / Math.tan(ang / 2), l1 * 0.45, l2 * 0.45);
    const p1: [number, number] = [b[0] + u1[0] * tlen, b[1] + u1[1] * tlen];
    const p2: [number, number] = [b[0] + u2[0] * tlen, b[1] + u2[1] * tlen];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      // a quadratic Bezier through the corner (close to an arc)
      const x = (1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1];
      out.push([x, y]);
    }
  }
  return out;
};

// the console's side section (y, z), extruded across x
const CONSOLE_PROF: Prof = roundPoly(
  [
    [1.06, -0.645],
    [1.06, -0.37],
    [1.12, -0.325],
    [1.28, -0.545],
    [1.3, -0.6],
    [1.275, -0.65],
  ],
  [0.02, 0.025, 0.012, 0.014, 0.02, 0.02],
);
const FACE = { a: new THREE.Vector2(1.12, -0.325), b: new THREE.Vector2(1.28, -0.545) };
const faceN = () => {
  const d = FACE.b.clone().sub(FACE.a).normalize();
  return { up: V(0, d.x, d.y), n: V(0, -d.y, d.x).multiplyScalar(-d.y < 0 ? -1 : 1) };
};

const darkPlastic = () => mat("b-tm-dark", () => new THREE.MeshPhysicalMaterial({ color: "#2C2F34", roughness: 0.48, clearcoat: 0.2, clearcoatRoughness: 0.5 }));
const greyPlastic = () => mat("b-tm-grey", () => new THREE.MeshPhysicalMaterial({ color: "#5A5F66", roughness: 0.5, clearcoat: 0.15 }));
const alu = () => mat("b-tm-alu", () => new THREE.MeshStandardMaterial({ color: "#D9DCDF", map: brushedTex(), metalness: 0.85, roughness: 0.34, envMap: envB(), envMapIntensity: 0.9 }));
const chrome = () => mat("b-tm-chrome", () => new THREE.MeshStandardMaterial({ color: "#E4E6E8", metalness: 1, roughness: 0.16, envMap: envB(), envMapIntensity: 1.2 }));
const steelTube = () => mat("b-tm-steel", () => new THREE.MeshPhysicalMaterial({ color: "#B9BDC2", metalness: 0.6, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2, envMap: envB(), envMapIntensity: 0.8 }));
const rubber = () => mat("b-tm-rubber", () => new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.85 }));
const grip = () => mat("b-tm-grip", () => new THREE.MeshStandardMaterial({ map: gripTex(), roughness: 0.8 }));
const foam = () => mat("b-tm-foam", () => new THREE.MeshStandardMaterial({ color: "#1A1B1D", roughness: 0.95, bumpMap: withRepeat(gripTex(), 3, 1), bumpScale: 0.4 }));
const redKey = () => mat("b-tm-red", () => new THREE.MeshPhysicalMaterial({ color: "#D0251E", roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
const hoodDecal = () => mat("b-tm-hoodDecal", () => new THREE.MeshPhysicalMaterial({ map: hoodTex(), roughness: 0.5, clearcoat: 0.15 }));
const consoleMat = (on: boolean) =>
  mat(`b-tm-console-${on}`, () => {
    const t = consoleTex(on);
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, emissive: on ? new THREE.Color("#FFFFFF") : new THREE.Color("#000000"), emissiveMap: on ? t : null, emissiveIntensity: on ? 0.55 : 0 });
  });

const uprightGeo = (s: number) =>
  geoB(`b-tm-upright-${s}`, () => sweep([V(s * 0.335, 0.235, -0.635), V(s * 0.335, 1.11, -0.515)], ellipseP(0.03, 0.022, 18), V(1, 0, 0), { caps: true, crease: 60 }));
const bootGeo = (s: number) =>
  geoB(`b-tm-boot-${s}`, () => sweep([V(s * 0.335, 0.25, -0.633), V(s * 0.335, 0.3, -0.626)], ellipseP(0.036, 0.027, 18), V(1, 0, 0), { caps: true, crease: 60 }));
const consoleGeo = () => geoB("b-tm-console", () => sweepX(CONSOLE_PROF, -0.36, 0.36, 50));
const keyGeo = () =>
  geoB("b-tm-stopKey", () =>
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.024, 0],
        [0.0245, 0.003],
        [0.022, 0.0085],
        [0.016, 0.0125],
        [0.008, 0.0142],
        [0, 0.0145],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
  );

/** The safety cord: a coiled cord from the stop key over the console's lip to a clip on the crossbar. */
const cordGeo = (keyAt: THREE.Vector3) =>
  geoB(`b-tm-cord-${keyAt.x.toFixed(3)}`, () => {
    const { n } = faceN();
    const p0 = keyAt.clone().addScaledVector(n, 0.012);
    const lip = V(keyAt.x, 1.122, -0.312);
    const clip = V(keyAt.x, TREADMILL.rail.y + 0.016 + 0.012, TREADMILL.crossbar.z + 0.004);
    const spine = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(lip, 0.5).addScaledVector(n, 0.01), lip.clone().add(V(0, 0.004, 0.012)), V(keyAt.x, 1.075, -0.29), clip]);
    const pts: THREE.Vector3[] = [];
    const N = 260;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = spine.getPointAt(u);
      const t = spine.getTangentAt(u);
      const a = V(1, 0, 0).cross(t).normalize();
      const b = t.clone().cross(a).normalize();
      const ph = u * Math.PI * 2 * 26;
      const rr = 0.0045 * Math.min(1, u * 12, (1 - u) * 12);
      pts.push(c.clone().addScaledVector(a, Math.cos(ph) * rr).addScaledVector(b, Math.sin(ph) * rr));
    }
    return tubeCapped(new THREE.CatmullRomCurve3(pts), 0.0013, 520, 5);
  });

// ------------------------------------------------------------------------------------------- laundry
type DrapeOpts = { w: number; r: number; flapA: number; flapB: number; thick: number; fold: number; flareA: number; flareB: number; widen?: number; seed: number };
/** Cloth over a horizontal bar along local x (the bar's centre at the origin): flap A hangs on the -z
 * side, flap B on +z, over the top in between; folds deepen and the flaps flare toward the hems. */
const drapeGeo = (key: string, o: DrapeOpts) =>
  geoB(`b-drape-${key}`, () => {
    const Ro = o.r + 0.0015 + o.thick;
    const arc = Math.PI * Ro;
    const L = o.flapA + arc + o.flapB;
    const nf = Math.max(2, Math.round(o.w / 0.055));
    const ph = hash3(o.seed, 1, 1) * 6.28;
    const P = (u: number, v: number) => {
      const s = v * L;
      let d = 0;
      let flap = 0;
      if (s < o.flapA) {
        d = o.flapA - s;
        flap = -1;
      } else if (s > o.flapA + arc) {
        d = s - o.flapA - arc;
        flap = 1;
      }
      const FL = flap < 0 ? o.flapA : o.flapB;
      const k = flap === 0 ? 0 : d / FL;
      const wid = o.w * (1 + (o.widen ?? 0) * k);
      const x = (u - 0.5) * wid;
      if (flap === 0) {
        const a = Math.PI - (s - o.flapA) / Ro;
        return V(x, Ro * Math.sin(a), Ro * Math.cos(a));
      }
      const flare = (flap < 0 ? o.flareA : o.flareB) * Math.pow(k, 1.5);
      const fold = o.fold * k * Math.sin(u * nf * Math.PI * 2 + ph + flap * 1.7 + k * 2.2);
      return V(x, -d, flap * (Ro + flare + fold));
    };
    // the outside faces away from the bar: probe the top
    const pt = P(0.5, (o.flapA + arc / 2) / L);
    const du = P(0.51, (o.flapA + arc / 2) / L).sub(P(0.49, (o.flapA + arc / 2) / L));
    const dv = P(0.5, (o.flapA + arc / 2 + 0.01) / L).sub(P(0.5, (o.flapA + arc / 2 - 0.01) / L));
    const side = du.cross(dv).dot(pt) > 0 ? 1 : -1;
    return sheetSolid(P, Math.max(8, nf * 6), 90, o.thick, 1, 1, side);
  });

type ShirtKind = "tee" | "button";
const HANGER_HALF = 0.18;
/** A shirt on a tubular plastic hanger, in the hanger's plane (x along the shoulders, y up, z thin), the
 * bar it hangs from along z through the origin (radius r). */
const shirtGeo = (kind: ShirtKind, r: number) =>
  geoB(`b-shirt-${kind}-${r.toFixed(4)}`, () => {
    const rh = r + 0.0045;
    const neckY = -rh - 0.02;
    const sl = (x: number) => neckY - 0.005 - 0.3 * Math.min(Math.abs(x), 0.22);
    const len = kind === "tee" ? 0.68 : 0.74;
    const yHem = neckY - len;
    const W = (v: number) => {
      if (kind === "tee") {
        if (v < 0.04) return 0.205 + 0.5 * v;
        if (v < 0.2) return 0.225 + 0.0625 * (v - 0.04);
        if (v < 0.215) return 0.235 - ((v - 0.2) / 0.015) * 0.05;
        if (v < 0.25) return 0.185 - ((v - 0.215) / 0.035) * 0.004;
        return 0.181 + 0.008 * (v - 0.25);
      }
      return 0.205 + 0.01 * Math.min(1, v / 0.05) - 0.006 * v;
    };
    const D = (v: number) => (v < 0.08 ? 0.006 + (0.007 * v) / 0.08 : v < 0.3 ? 0.013 + (0.004 * (v - 0.08)) / 0.22 : 0.017 - 0.005 * ((v - 0.3) / 0.7));
    const nt = 64;
    const nv = 40;
    const gb = new GB();
    const rows: number[][] = [];
    const se = (c: number, p: number) => Math.sign(c) * Math.pow(Math.abs(c), p);
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const row: number[] = [];
      for (let i = 0; i <= nt; i++) {
        const t = (i / nt) * Math.PI * 2;
        const x = W(v) * se(Math.cos(t), 0.5);
        const z = D(v) * se(Math.sin(t), 0.5);
        const yTop = sl(x) + 0.0065;
        const y = yTop + (yHem - yTop) * v;
        row.push(gb.v(V(x, y, z), V(se(Math.cos(t), 0.5), 0, se(Math.sin(t), 0.5) * 3).normalize(), i / nt, v));
      }
      rows.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nt; i++) gb.q(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
    const shirt = gb.build(true);
    // the hanger: a closed triangle (shoulders and a bottom bar), and its hook round the bar
    const tip = HANGER_HALF;
    const tri = new THREE.CatmullRomCurve3(
      [V(0, neckY - 0.003), V(tip * 0.5, sl(tip * 0.5)), V(tip, sl(tip) + 0.002), V(tip + 0.004, sl(tip) - 0.006), V(tip * 0.6, sl(tip) - 0.009), V(0, sl(tip) - 0.009), V(-tip * 0.6, sl(tip) - 0.009), V(-tip - 0.004, sl(tip) - 0.006), V(-tip, sl(tip) + 0.002), V(-tip * 0.5, sl(tip * 0.5))],
      true,
      "catmullrom",
      0.3,
    );
    const hanger = new THREE.TubeGeometry(tri, 120, 0.004, 6, true);
    const hk: THREE.Vector3[] = [V(0, neckY), V(0.004, neckY + 0.01)];
    for (let a = -20; a <= 205; a += 15) hk.push(V(rh * Math.cos((a * Math.PI) / 180), rh * Math.sin((a * Math.PI) / 180)));
    const hook = tubeCapped(new THREE.CatmullRomCurve3(hk), 0.003, 80, 6);
    const out = new THREE.BufferGeometry();
    out.userData = { shirt, hanger, hook };
    return out;
  }).userData as { shirt: THREE.BufferGeometry; hanger: THREE.BufferGeometry; hook: THREE.BufferGeometry };

/** A flat sock (an L, cuff up the leg, heel and toe rounded), lying on y = 0, its leg along -z. */
const sockGeo = () =>
  geoB("b-sock", () => {
    const s = new THREE.Shape();
    const w = 0.068;
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, -0.2);
    s.quadraticCurveTo(-w / 2, -0.245, -w / 2 + 0.03, -0.252);
    s.lineTo(0.125, -0.252 + 0.002);
    s.quadraticCurveTo(0.162, -0.245, 0.16, -0.215);
    s.quadraticCurveTo(0.158, -0.185, 0.125, -0.184);
    s.lineTo(w / 2 + 0.01, -0.184);
    s.lineTo(w / 2, -0.17);
    s.lineTo(w / 2, 0);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.002, 0);
    return g;
  });

const fab = (key: string, make: () => THREE.Texture, rough = 0.95, sheen = 0.4) =>
  mat(`b-fab-${key}`, () => new THREE.MeshPhysicalMaterial({ map: make(), roughness: rough, sheen, sheenRoughness: 0.7, sheenColor: new THREE.Color("#FFFFFF"), side: THREE.DoubleSide }));

type Item =
  | { at: number; kind: "drape"; key: string; bar: "L" | "R" | "X"; c: number; o: DrapeOpts; m: () => THREE.Material }
  | { at: number; kind: "shirt"; bar: "L" | "X"; c: number; shirt: ShirtKind; m: () => THREE.Material; hanger: string; tilt: number }
  | { at: number; kind: "sock"; x: number; z: number; y: number; yaw: number; m: () => THREE.Material }
  | { at: number; kind: "fold"; x: number; y: number; z: number; size: [number, number, number]; yaw: number; m: () => THREE.Material };

const R_FOAM = 0.021;
const R_PLATE = 0.0185;
const R_BAR = 0.016;
/** The laundry, in the order it arrives (`at` on 0..1). */
const LAUNDRY: Item[] = [
  // a bath towel over the wall-side grip
  { at: 0.05, kind: "drape", key: "towelA", bar: "R", c: -0.19, o: { w: 0.16, r: R_FOAM, flapA: 0.36, flapB: 0.4, thick: 0.006, fold: 0.004, flareA: 0.007, flareB: 0.02, seed: 3 }, m: () => fab("towelA", () => terryTex("A", "#5E86A8", "#E8EEF2")) },
  // a striped hand towel over the wall-side pulse plate
  { at: 0.15, kind: "drape", key: "towelB", bar: "R", c: -0.41, o: { w: 0.11, r: R_PLATE, flapA: 0.22, flapB: 0.24, thick: 0.005, fold: 0.003, flareA: 0.006, flareB: 0.014, seed: 5 }, m: () => fab("towelB", () => terryTex("B", "#D9C9A8", "#9C3B32")) },
  // a burgundy sweater over the room-side plate
  { at: 0.24, kind: "drape", key: "sweaterA", bar: "L", c: -0.42, o: { w: 0.12, r: R_PLATE, flapA: 0.2, flapB: 0.42, thick: 0.01, fold: 0.008, flareA: 0.012, flareB: 0.045, widen: 0.35, seed: 7 }, m: () => fab("sweaterA", () => withRepeat(knitTex("A", "#7A2E36"), 3, 3), 0.98, 0.6) },
  // an oatmeal cable-knit over the crossbar
  { at: 0.33, kind: "drape", key: "sweaterB", bar: "X", c: -0.19, o: { w: 0.14, r: R_BAR, flapA: 0.26, flapB: 0.32, thick: 0.011, fold: 0.008, flareA: 0.03, flareB: 0.04, widen: 0.12, seed: 11 }, m: () => fab("sweaterB", () => withRepeat(knitTex("B", "#CDBB9A", "cable"), 3, 3), 0.98, 0.6) },
  // shirts on hangers along the crossbar
  { at: 0.42, kind: "shirt", bar: "X", c: 0.19, shirt: "button", m: () => fab("shirtW", () => withRepeat(cottonTex("W", "#EEF0F2", "oxford"), 4, 4), 0.85), hanger: "#F4F4F2", tilt: 0.04 },
  { at: 0.48, kind: "shirt", bar: "X", c: 0.13, shirt: "button", m: () => fab("shirtS", () => withRepeat(cottonTex("S", "#BFD3EA", "stripe", "#3E6FA8"), 4, 4), 0.85), hanger: "#2F6FB8", tilt: -0.03 },
  { at: 0.54, kind: "shirt", bar: "X", c: 0.07, shirt: "tee", m: () => fab("teeG", () => withRepeat(cottonTex("G", "#8F969C"), 4, 4), 0.95), hanger: "#F4F4F2", tilt: 0.02 },
  // shirts on the room-side grip
  { at: 0.6, kind: "shirt", bar: "L", c: -0.12, shirt: "tee", m: () => fab("teeN", () => withRepeat(cottonTex("N", "#2C3E5C"), 4, 4), 0.95), hanger: "#E25C8A", tilt: 0.03 },
  { at: 0.65, kind: "sock", x: -0.08, z: 0.18, y: TREADMILL.beltTop, yaw: 0.5, m: () => fab("sockW", () => withRepeat(knitTex("sockW", "#E9E6E0"), 6, 6)) },
  { at: 0.66, kind: "sock", x: 0.0, z: 0.26, y: TREADMILL.beltTop, yaw: 0.35, m: () => fab("sockW", () => withRepeat(knitTex("sockW", "#E9E6E0"), 6, 6)) },
  { at: 0.7, kind: "shirt", bar: "X", c: 0.01, shirt: "tee", m: () => fab("teeR", () => withRepeat(cottonTex("R", "#B8463A"), 4, 4), 0.95), hanger: "#F4F4F2", tilt: -0.02 },
  { at: 0.72, kind: "sock", x: 0.12, z: 0.08, y: TREADMILL.beltTop, yaw: -0.9, m: () => fab("sockK", () => withRepeat(knitTex("sockK", "#2A2B2E"), 6, 6)) },
  { at: 0.73, kind: "sock", x: 0.06, z: -0.02, y: TREADMILL.beltTop, yaw: -1.05, m: () => fab("sockK", () => withRepeat(knitTex("sockK", "#2A2B2E"), 6, 6)) },
  { at: 0.76, kind: "shirt", bar: "L", c: -0.165, shirt: "button", m: () => fab("shirtP", () => withRepeat(cottonTex("P", "#3F5F45", "plaid", "#C9B15A"), 3, 3), 0.9), hanger: "#F4F4F2", tilt: -0.04 },
  { at: 0.78, kind: "fold", x: 0.0, y: TREADMILL.beltTop, z: 0.55, size: [0.36, 0.045, 0.28], yaw: 0.12, m: () => fab("denim", () => withRepeat(denimTex(), 3, 3), 0.9, 0.2) },
  { at: 0.82, kind: "shirt", bar: "X", c: -0.05, shirt: "button", m: () => fab("shirtY", () => withRepeat(cottonTex("Y", "#E8D9A8", "stripe", "#B7924A"), 4, 4), 0.85), hanger: "#2F6FB8", tilt: 0.03 },
  { at: 0.84, kind: "sock", x: -0.31, z: 0.32, y: 0.1935, yaw: 0.1, m: () => fab("sockG", () => withRepeat(knitTex("sockG", "#6C8F6A"), 6, 6)) },
  { at: 0.88, kind: "shirt", bar: "L", c: -0.205, shirt: "tee", m: () => fab("teeL", () => withRepeat(cottonTex("L", "#C9B6DC"), 4, 4), 0.95), hanger: "#F4F4F2", tilt: 0.02 },
  { at: 0.94, kind: "fold", x: 0.0, y: 0.2706, z: -0.69, size: [0.34, 0.03, 0.2], yaw: -0.05, m: () => fab("towelC", () => terryTex("C", "#8FB59A", "#F2F0E8")) },
  { at: 0.97, kind: "sock", x: 0.18, z: 0.62, y: TREADMILL.beltTop + 0.045, yaw: 1.4, m: () => fab("sockG", () => withRepeat(knitTex("sockG", "#6C8F6A"), 6, 6)) },
];

const hangerMat = (c: string) => mat(`b-hanger-${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.4 }));
const foldGeo = (size: [number, number, number]) => geoB(`b-fold-${size.join("-")}`, () => new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(size[1] * 0.45, 0.014)));

const Laundry: React.FC<{ k: number }> = ({ k }) => {
  const R = TREADMILL.rail;
  return (
    <>
      {LAUNDRY.filter((it) => k >= it.at).map((it, i) => {
        if (it.kind === "drape") {
          const g = drapeGeo(it.key, it.o);
          if (it.bar === "X") return <mesh key={i} geometry={g} position={[it.c, R.y, TREADMILL.crossbar.z]} material={it.m()} castShadow receiveShadow />;
          const x = it.bar === "L" ? -R.x : R.x;
          return <mesh key={i} geometry={g} position={[x, R.y, it.c]} rotation={[0, -Math.PI / 2, 0]} material={it.m()} castShadow receiveShadow />;
        }
        if (it.kind === "shirt") {
          const r = it.bar === "L" ? R_FOAM : R_BAR;
          const s = shirtGeo(it.shirt, r);
          // on the crossbar the hanger's plane is the y-z plane; on the side grip, the x-y plane
          const pos: [number, number, number] = it.bar === "X" ? [it.c, R.y, TREADMILL.crossbar.z] : [-R.x, R.y, it.c];
          const rot: [number, number, number] = it.bar === "X" ? [it.tilt, Math.PI / 2, 0] : [0, 0, it.tilt];
          return (
            <group key={i} position={pos} rotation={rot}>
              <mesh geometry={s.shirt} material={it.m()} castShadow receiveShadow />
              <mesh geometry={s.hanger} material={hangerMat(it.hanger)} castShadow />
              <mesh geometry={s.hook} material={hangerMat(it.hanger)} castShadow />
            </group>
          );
        }
        if (it.kind === "sock") return <mesh key={i} geometry={sockGeo()} position={[it.x, it.y + 0.0004, it.z]} rotation={[0, it.yaw, 0]} material={it.m()} castShadow receiveShadow />;
        return <mesh key={i} geometry={foldGeo(it.size)} position={[it.x, it.y + it.size[1] / 2 + 0.0004, it.z]} rotation={[0, it.yaw, 0]} material={it.m()} castShadow receiveShadow />;
      })}
    </>
  );
};

export type TreadmillProps = {
  /** belt phase in metres (speed x time); the top run moves toward +z */
  belt?: number;
  /** 0..1, the laundry's stage (0 = none; 1 = a full drying rack) */
  laundry?: number;
  /** the console's display lit */
  on?: boolean;
};

/** A generic home treadmill, 0.75 x 1.79 m, console top 1.30 m, handlebars 1.02 m (see TREADMILL). */
export const Treadmill: React.FC<TreadmillProps> = ({ belt = 0, laundry = 0, on = false }) => {
  const beltMat = useMemo(() => {
    const t = beltTex().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.82 });
  }, []);
  beltMat.map!.offset.set(0, -belt / loopLen);
  const { up, n } = faceN();
  const faceMid = V(0, (FACE.a.x + FACE.b.x) / 2, (FACE.a.y + FACE.b.y) / 2);
  const faceQ = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), up, n)), [up, n]);
  const keyAt = faceMid.clone().addScaledVector(up, -0.046).add(V(0.1, 0, 0));
  const R = TREADMILL.rail;
  const rails = useMemo(
    () => ({
      side: [-1, 1].map((s) => geoB(`b-tm-rail-${s}`, () => tubeCapped(new THREE.LineCurve3(V(s * R.x, R.y, R.z0), V(s * R.x, R.y, -0.11)), R_BAR, 8, 16))),
      foam: [-1, 1].map((s) => geoB(`b-tm-foam-${s}`, () => tubeCapped(new THREE.LineCurve3(V(s * R.x, R.y, -0.275), V(s * R.x, R.y, -0.1)), R_FOAM, 8, 18))),
      plate: [-1, 1].map((s) => geoB(`b-tm-plate-${s}`, () => tubeCapped(new THREE.LineCurve3(V(s * R.x, R.y, -0.47), V(s * R.x, R.y, -0.36)), R_PLATE, 6, 18))),
      cross: geoB("b-tm-cross", () => tubeCapped(new THREE.LineCurve3(V(-R.x, R.y, TREADMILL.crossbar.z), V(R.x, R.y, TREADMILL.crossbar.z)), R_BAR, 12, 16)),
    }),
    [R],
  );
  return (
    <group>
      {/* motor hood, its vent panel, the uprights' boots */}
      <mesh geometry={geoB("b-tm-hood", () => new RoundedBoxGeometry(0.75, 0.22, 0.33, 4, 0.04))} position={[0, 0.16, -0.685]} material={darkPlastic()} castShadow receiveShadow />
      <mesh position={[0, 0.2706, -0.685]} rotation={[-Math.PI / 2, 0, 0]} material={hoodDecal()} receiveShadow>
        <planeGeometry args={[0.58, 0.22]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`bt${s}`} geometry={bootGeo(s)} material={rubber()} castShadow />
      ))}
      {/* step rails and their grips */}
      {[-1, 1].map((s) => (
        <group key={`sr${s}`}>
          <mesh geometry={geoB("b-tm-step", () => new RoundedBoxGeometry(0.115, 0.07, 1.295, 3, 0.012))} position={[s * 0.3075, 0.155, 0.1125]} material={alu()} castShadow receiveShadow />
          <mesh geometry={geoB("b-tm-grip", () => new RoundedBoxGeometry(0.078, 0.004, 1.2, 2, 0.0015))} position={[s * 0.31, 0.1915, 0.12]} material={grip()} receiveShadow />
          <mesh geometry={geoB("b-tm-cap", () => new RoundedBoxGeometry(0.13, 0.12, 0.1, 3, 0.02))} position={[s * 0.31, 0.135, 0.8]} material={greyPlastic()} castShadow receiveShadow />
        </group>
      ))}
      {/* the deck, rollers and belt */}
      <mesh position={[0, 0.153, 0.14]} material={rubber()}>
        <boxGeometry args={[0.47, 0.05, 1.21]} />
      </mesh>
      {[BELT.z0, BELT.z1].map((z) => (
        <mesh key={`rl${z}`} position={[0, BELT.yc, z]} rotation={[0, 0, Math.PI / 2]} material={chrome()}>
          <cylinderGeometry args={[0.028, 0.028, 0.484, 20]} />
        </mesh>
      ))}
      <mesh geometry={beltGeo()} material={beltMat} castShadow receiveShadow />
      {/* feet and the front transport wheels */}
      {[-1, 1].map((s) => (
        <group key={`ft${s}`}>
          <mesh position={[s * 0.3, 0.026, -0.7]} material={rubber()} castShadow>
            <cylinderGeometry args={[0.026, 0.028, 0.052, 16]} />
          </mesh>
          <mesh position={[s * 0.31, 0.009, 0.81]} material={rubber()} castShadow>
            <cylinderGeometry args={[0.022, 0.024, 0.018, 16]} />
          </mesh>
          <mesh position={[s * 0.31, 0.05, 0.81]} material={steelTube()}>
            <cylinderGeometry args={[0.007, 0.007, 0.064, 8]} />
          </mesh>
          <mesh position={[s * 0.31, 0.04, -0.865]} rotation={[0, 0, Math.PI / 2]} material={greyPlastic()} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.026, 20]} />
          </mesh>
          <mesh position={[s * 0.31, 0.04, -0.865]} rotation={[0, 0, Math.PI / 2]} material={steelTube()}>
            <cylinderGeometry args={[0.006, 0.006, 0.048, 8]} />
          </mesh>
          <mesh position={[s * (0.31 - 0.022), 0.058, -0.845]} rotation={[0.55, 0, 0]} material={darkPlastic()} castShadow>
            <boxGeometry args={[0.006, 0.05, 0.03]} />
          </mesh>
        </group>
      ))}
      {/* uprights, console, its face, the stop key and its cord */}
      {[-1, 1].map((s) => (
        <mesh key={`up${s}`} geometry={uprightGeo(s)} material={steelTube()} castShadow receiveShadow />
      ))}
      <mesh geometry={consoleGeo()} material={darkPlastic()} castShadow receiveShadow />
      <mesh position={faceMid.clone().addScaledVector(n, 0.0009)} quaternion={faceQ} material={consoleMat(on)}>
        <planeGeometry args={[0.64, 0.24]} />
      </mesh>
      <mesh geometry={keyGeo()} position={keyAt.clone().addScaledVector(n, 0.0009)} quaternion={useMemo(() => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n), [n])} material={redKey()} castShadow />
      <mesh geometry={cordGeo(keyAt)} material={redKey()} castShadow />
      <mesh position={[keyAt.x, R.y + R_BAR + 0.006, TREADMILL.crossbar.z]} material={redKey()} castShadow>
        <boxGeometry args={[0.024, 0.012, 0.034]} />
      </mesh>
      {/* handlebars: side rails with pulse plates and foam grips, the crossbar */}
      {[0, 1].map((i) => (
        <group key={`hb${i}`}>
          <mesh geometry={rails.side[i]} material={steelTube()} castShadow receiveShadow />
          <mesh geometry={rails.foam[i]} material={foam()} castShadow receiveShadow />
          <mesh geometry={rails.plate[i]} material={chrome()} castShadow receiveShadow />
        </group>
      ))}
      <mesh geometry={rails.cross} material={steelTube()} castShadow receiveShadow />
      {laundry > 0 ? <Laundry k={laundry} /> : null}
    </group>
  );
};

export { mergeGeometries };
