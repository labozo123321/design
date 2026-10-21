import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  braidTex,
  boxFaceTex,
  canvasTex,
  clamp01,
  dinoRugTex,
  drawMarker,
  ellipseProfile,
  geo,
  haloTex,
  kraftTex,
  laptopScreenTex,
  lin,
  markerLines,
  mat,
  mix3,
  normalFromFn,
  once,
  patchworkQuiltMat,
  phoneScreenTex,
  planarUV,
  plainSheetMat,
  rand,
  roundRectShape,
  sdEll,
  sdRoundCone,
  sdSphere,
  sdfMesh,
  smax,
  smin,
  sstep,
  sweepGeometry,
  tapeTex,
  tileNoise,
  withRepeat,
  type ScreenKind,
} from "./textures";

/**
 * Bedroom props: the green plastic T-rex (it topples by rolling over its own convex hull, so it never floats
 * or sinks), moving boxes with marker labels, the dinosaur lamp, the rugs and the unfaded carpet patch, fairy
 * lights on any curve, the earplug tin, laptop, soccer ball, phones, the dorm mini-fridge, the boxed desk
 * lamp, a candle, a pine sprig, the six decorative pillows and the made-up air mattress.
 * Each is built at its own origin on the floor (or its base), facing -z unless noted.
 */

type P3 = [number, number, number];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/** Kelvin-ish warm colours (sRGB) */
const K2400 = "#FFA54F";
const K2700 = "#FFB46B";

// ============================================================================================ T-rex
const TR = {
  bodyC: [0, 0.067, 0.004] as P3,
  neckA: [0, 0.078, -0.016] as P3,
  neckB: [0, 0.095, -0.031] as P3,
  jawUA: [0, 0.103, -0.044] as P3,
  jawUB: [0, 0.0985, -0.073] as P3,
  jawLA: [0, 0.0925, -0.04] as P3,
  jawLB: [0, 0.0795, -0.064] as P3,
  mouthA: [0, 0.0928, -0.047] as P3,
  mouthB: [0, 0.0868, -0.082] as P3,
  armA: [0.0155, 0.077, -0.024] as P3,
  armB: [0.0185, 0.0685, -0.033] as P3,
  armC: [0.0165, 0.0705, -0.042] as P3,
  clawA: [0.0152, 0.0712, -0.0465] as P3,
  clawB: [0.0185, 0.0688, -0.046] as P3,
  shinA: [0.0175, 0.012, 0.009] as P3,
  shinB: [0.02, 0.038, -0.003] as P3,
  heel: [0.0175, 0.0072, 0.011] as P3,
  ball: [0.0185, 0.0062, -0.009] as P3,
  tail: [
    [0, 0.065, 0.028],
    [0, 0.058, 0.054],
    [0.003, 0.048, 0.078],
    [0.009, 0.038, 0.097],
    [0.016, 0.03, 0.11],
  ] as P3[],
  tailR: [0.017, 0.0115, 0.0072, 0.0042, 0.0022],
};
const TOES: [P3, P3][] = [
  [[0.0175, 0.0055, -0.008], [0.011, 0.0038, -0.0175]],
  [[0.0185, 0.0055, -0.009], [0.0192, 0.0038, -0.0205]],
  [[0.0195, 0.0055, -0.008], [0.0268, 0.0038, -0.0165]],
];
const TOE_TIPS: P3[] = TOES.map((t) => t[1]);
/** the teeth: bumps along the jaw rims (upper pointing down, lower up) */
const TEETH: P3[] = (() => {
  const out: P3[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -0.0505 - 0.0042 * i;
    const t = (z - TR.jawUA[2]) / (TR.jawUB[2] - TR.jawUA[2]);
    const yc = TR.jawUA[1] + (TR.jawUB[1] - TR.jawUA[1]) * t;
    const r = 0.0128 + (0.0085 - 0.0128) * t;
    out.push([0.62 * r, yc - 0.8 * r, z]);
  }
  for (let i = 0; i < 5; i++) {
    const z = -0.0478 - 0.0036 * i;
    const t = (z - TR.jawLA[2]) / (TR.jawLB[2] - TR.jawLA[2]);
    const yc = TR.jawLA[1] + (TR.jawLB[1] - TR.jawLA[1]) * t;
    const r = 0.0095 + (0.005 - 0.0095) * t;
    out.push([0.6 * r, yc + 0.78 * r, z]);
  }
  return out;
})();
const BODY_PH = 0.5;
const sinPh = Math.sin(BODY_PH);
const cosPh = Math.cos(BODY_PH);

const trexTeethD = (ax: number, y: number, z: number) => {
  let d = 1;
  for (const t of TEETH) d = Math.min(d, sdSphere(ax, y, z, t[0], t[1], t[2], 0.00135));
  return d;
};
const trexD = (x: number, y: number, z: number) => {
  const ax = Math.abs(x);
  const dy = y - TR.bodyC[1];
  const dz = z - TR.bodyC[2];
  let d = sdEll(x, dy * cosPh + dz * sinPh, dy * sinPh - dz * cosPh, 0, 0, 0, 0.022, 0.0235, 0.034);
  d = smin(d, sdRoundCone(x, y, z, TR.neckA, TR.neckB, 0.019, 0.0135), 0.008);
  d = smin(d, sdEll(x, y, z, 0, 0.104, -0.038, 0.0155, 0.0155, 0.02), 0.006);
  d = smin(d, sdRoundCone(x, y, z, TR.jawUA, TR.jawUB, 0.0128, 0.0085), 0.005);
  d = smin(d, sdRoundCone(x, y, z, TR.jawLA, TR.jawLB, 0.0095, 0.005), 0.004);
  d = smin(d, sdEll(ax, y, z, 0.0105, 0.1135, -0.047, 0.0045, 0.003, 0.0065), 0.003);
  d = smax(d, -sdRoundCone(x, y, z, TR.mouthA, TR.mouthB, 0.0016, 0.0042), 0.0015);
  if (z < -0.04 && y > 0.075) d = smin(d, trexTeethD(ax, y, z), 0.0008);
  d = smax(d, -sdSphere(ax, y, z, 0.0042, 0.1015, -0.0795, 0.0015), 0.001);
  // arms and their two claws
  let arm = Math.min(sdRoundCone(ax, y, z, TR.armA, TR.armB, 0.0042, 0.0034), sdRoundCone(ax, y, z, TR.armB, TR.armC, 0.0034, 0.0028));
  arm = smin(arm, Math.min(sdRoundCone(ax, y, z, TR.armC, TR.clawA, 0.0022, 0.0009), sdRoundCone(ax, y, z, TR.armC, TR.clawB, 0.0022, 0.0009)), 0.0015);
  d = smin(d, arm, 0.003);
  // legs
  d = smin(d, sdEll(ax, y, z, 0.021, 0.056, 0.008, 0.012, 0.02, 0.017), 0.008);
  d = smin(d, sdRoundCone(ax, y, z, TR.shinA, TR.shinB, 0.0068, 0.0095), 0.005);
  let f = sdRoundCone(ax, y, z, TR.heel, TR.ball, 0.0075, 0.0062);
  for (const [a, b] of TOES) f = smin(f, sdRoundCone(ax, y, z, a, b, 0.0042, 0.0026), 0.003);
  f = Math.max(f, -y);
  d = smin(d, f, 0.003);
  // tail
  let tl = 1;
  for (let i = 0; i < TR.tail.length - 1; i++) tl = Math.min(tl, sdRoundCone(x, y, z, TR.tail[i], TR.tail[i + 1], TR.tailR[i], TR.tailR[i + 1]));
  d = smin(d, tl, 0.006);
  return Math.max(d, -y);
};
const TREX_COL = {
  base: lin("#4E9C3F"),
  dark: lin("#2F6A2B"),
  belly: lin("#A9C95C"),
  teeth: lin("#F3F0E2"),
  mouth: lin("#B4473D"),
  claw: lin("#E7E0C6"),
  nostril: lin("#24461F"),
};
const trexColor = (x: number, y: number, z: number): [number, number, number] => {
  const ax = Math.abs(x);
  const h = 0.0004;
  const gx = trexD(x + h, y, z) - trexD(x - h, y, z);
  const gy = trexD(x, y + h, z) - trexD(x, y - h, z);
  const gz = trexD(x, y, z + h) - trexD(x, y, z - h);
  const gl = Math.hypot(gx, gy, gz) || 1;
  const ny = gy / gl;
  if (z < -0.04 && y > 0.075 && trexTeethD(ax, y, z) < 0.00045) return TREX_COL.teeth;
  if (sdRoundCone(x, y, z, TR.mouthA, TR.mouthB, 0.0016, 0.0042) < 0.0013) return TREX_COL.mouth;
  for (const t of TOE_TIPS) if (sdSphere(ax, y, z, t[0], t[1], t[2], 0.0034) < 0) return TREX_COL.claw;
  if (sdSphere(ax, y, z, TR.clawA[0], TR.clawA[1], TR.clawA[2], 0.0018) < 0 || sdSphere(ax, y, z, TR.clawB[0], TR.clawB[1], TR.clawB[2], 0.0018) < 0) return TREX_COL.claw;
  if (sdSphere(ax, y, z, 0.0042, 0.1015, -0.0795, 0.0024) < 0) return TREX_COL.nostril;
  let c = TREX_COL.base;
  // a pale belly and throat
  const under = sstep(-0.05, -0.55, ny) * (y > 0.03 ? 1 : 0.4);
  c = mix3(c, TREX_COL.belly, under * 0.85);
  // painted dark stripes over the back and tail
  const top = sstep(0.25, 0.6, ny);
  const stripe = sstep(0.35, 0.7, Math.sin(z * 260 + Math.sin(ax * 300) * 0.8));
  if (z > -0.03) c = mix3(c, TREX_COL.dark, top * stripe * 0.85);
  // a darker brow line
  if (sdEll(ax, y, z, 0.0105, 0.1135, -0.047, 0.0045, 0.003, 0.0065) < 0.0006) c = mix3(c, TREX_COL.dark, 0.55);
  return c;
};

type Roll = { steps: { px: number; py: number; g: number; a0: number; a1: number }[]; total: number };
const hull2D = (pts: [number, number][]) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1)); // CCW
};
/** Roll a body over its hull (as seen down the long axis) toward +x until its centre of mass rests over a
 * hull edge on the ground (after at least minA radians). */
const rollPath = (hull: [number, number][], com: [number, number], minA: number): Roll => {
  const n = hull.length;
  const ymin = Math.min(...hull.map((p) => p[1]));
  let k = 0;
  let best = -Infinity;
  hull.forEach((p, i) => {
    if (p[1] < ymin + 0.0004 && p[0] > best) {
      best = p[0];
      k = i;
    }
  });
  const steps: Roll["steps"] = [];
  let A = 0;
  let g = hull[k][0];
  for (let guard = 0; guard < n; guard++) {
    const cur = hull[k];
    const nx = hull[(k + 1) % n];
    let ae = Math.atan2(nx[1] - cur[1], nx[0] - cur[0]);
    while (ae < A - 1e-9) ae += Math.PI * 2;
    steps.push({ px: cur[0], py: cur[1], g, a0: A, a1: ae });
    const len = Math.hypot(nx[0] - cur[0], nx[1] - cur[1]);
    A = ae;
    // where the centre of mass now sits along the ground
    const cx = com[0] - cur[0];
    const cy = com[1] - cur[1];
    const comX = g + cx * Math.cos(A) + cy * Math.sin(A);
    if (A >= minA && comX >= g && comX <= g + len) break;
    g += len;
    k = (k + 1) % n;
  }
  return { steps, total: A };
};
/** The pose (rotation about z, translation in x/y) for an angle along a roll. */
const rollPose = (r: Roll, theta: number) => {
  const th = Math.min(Math.max(theta, 0), r.total);
  const s = r.steps.find((st) => th <= st.a1 + 1e-9) ?? r.steps[r.steps.length - 1];
  const c = Math.cos(th);
  const sn = Math.sin(th);
  // R(-th) p = (p.x c + p.y s, -p.x s + p.y c)
  const rx = s.px * c + s.py * sn;
  const ry = -s.px * sn + s.py * c;
  return { angle: -th, tx: s.g - rx, ty: -ry };
};

const trexMesh = () =>
  once("trexMesh", () => {
    const m = sdfMesh(trexD, [-0.04, -0.002, -0.088], [0.04, 0.124, 0.118], 0.00125, trexColor);
    // soles exactly on the ground
    const p = m.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);
    const pts: [number, number][] = [];
    const ptsM: [number, number][] = [];
    for (let i = 0; i < p.count; i++) {
      pts.push([p.getX(i), p.getY(i)]);
      ptsM.push([-p.getX(i), p.getY(i)]);
    }
    const roll = rollPath(hull2D(pts), [m.com.x, m.com.y], 1.0);
    const rollM = rollPath(hull2D(ptsM), [-m.com.x, m.com.y], 1.0);
    return { ...m, roll, rollM };
  });
const trexMat = () => mat("k-trex", () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.15, sheenColor: new THREE.Color("#C8F0B0") }));
const eyeTex = () =>
  canvasTex("trexEye", 128, 64, (g, w, h) => {
    g.fillStyle = "#E8B92A";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#121008";
    g.beginPath();
    g.ellipse(w / 2, h / 2, 5, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#5A3C08";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(w / 2, h / 2, 18, 26, 0, 0, Math.PI * 2);
    g.stroke();
  });
const eyeMat = () => mat("k-trexEye", () => new THREE.MeshPhysicalMaterial({ map: eyeTex(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));

/** The pose of the T-rex for a tip value (0 standing .. 1 lying on its side), dir +1 = falls toward +x. */
export const trexPose = (tip: number, dir: 1 | -1 = 1) => {
  const m = trexMesh();
  const r = dir > 0 ? m.roll : m.rollM;
  const p = rollPose(r, clamp01(tip) * r.total);
  return dir > 0 ? p : { angle: -p.angle, tx: -p.tx, ty: p.ty };
};
/** Size facts: height, length (snout to tail), width, and how far it reaches from where it stood when lying. */
export const TREX_INFO = { height: 0.12, length: 0.2, width: 0.07 };

export type TRexProps = { tip?: number; dir?: 1 | -1 };
/** A green plastic toy T-rex (~0.12 tall, snout toward -z): open jaws with teeth bumps, brow ridges, tiny
 * two-clawed arms, thick legs on flat soles (y = 0), a long tail. tip 0..1 rolls it over the outer edge of a
 * foot onto its side (rolling over its own convex hull: no floating, no sinking at any tip). */
export const TRex: React.FC<TRexProps> = ({ tip = 0, dir = 1 }) => {
  const m = trexMesh();
  const p = trexPose(tip, dir);
  return (
    <group position={[p.tx, p.ty, 0]} rotation={[0, 0, p.angle]}>
      <mesh geometry={m.geometry} material={trexMat()} />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={geo("trexEyeBall", () => new THREE.SphereGeometry(0.0026, 16, 10))} material={eyeMat()} position={[s * 0.0119, 0.1076, -0.0462]} rotation={[0, s > 0 ? -0.45 : Math.PI + 0.45, 0]} />
      ))}
    </group>
  );
};

// ======================================================================================== moving box
const corrugTex = () =>
  canvasTex("corrugEdge", 256, 32, (g, w, h) => {
    g.fillStyle = "#B88F5E";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#D2AD7C";
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, h - 5, w, 5);
    g.strokeStyle = "#A07A4C";
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = h / 2 + Math.sin((x / w) * Math.PI * 2 * 14) * (h / 2 - 6);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = "rgba(60,40,20,0.35)";
    for (let x = 0; x < w; x += w / 28) g.fillRect(x + 2, 6, 3, h - 12);
  });
const kraftPlain = (inner: boolean) =>
  mat(`k-kraft-${inner}`, () => new THREE.MeshStandardMaterial({ map: kraftTex(inner ? "inner" : "outer", 512, 512, "#C49A68", inner ? 8 : 6, inner), roughness: 0.92 }));
const kraftEdge = () => mat("k-kraftEdge", () => new THREE.MeshStandardMaterial({ map: corrugTex(), roughness: 0.95 }));
const faceMat = (key: string, w: number, h: number, text: string | null, ink: string, seed: number, arrows: boolean, region?: [number, number, number, number]) =>
  mat(`k-boxface-${key}`, () => new THREE.MeshStandardMaterial({ map: boxFaceTex(key, w, h, text, ink, seed, arrows, region), roughness: 0.9 }));
const tapeMatFor = (color: string) => mat(`k-packTape-${color}`, () => new THREE.MeshPhysicalMaterial({ map: tapeTex(color), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15, transparent: true, opacity: 0.9 }));

export type MovingBoxProps = {
  w?: number;
  h?: number;
  d?: number;
  /** marker label (written on the top and on one side); null = none. Use \n to break lines. */
  text?: string | null;
  /** marker colour */
  color?: string;
  /** flaps: 0 closed and taped .. 1 all four flaps open */
  open?: number;
  /** which side carries the label: px, nx, pz (toward the camera in the film's view) or nz */
  sideLabel?: "px" | "nx" | "pz" | "nz";
  seed?: number;
  /** packing tape colour */
  tape?: string;
  /** printed this-way-up arrows on the sides */
  arrows?: boolean;
  /** things inside (origin = inside floor centre) */
  children?: React.ReactNode;
};

/** A corrugated cardboard moving box at the floor (origin bottom centre), taped along its top seam, marker
 * label on the top and a side; optional open flaps (long flaps go first, then the short ones). */
export const MovingBox: React.FC<MovingBoxProps> = ({ w = 0.46, h = 0.34, d = 0.36, text = null, color = "#5B2E91", open = 0, sideLabel = "pz", seed = 1, tape = "#B9813F", arrows = true, children }) => {
  const t = 0.004;
  const key = `${w}x${h}x${d}-${text}-${color}-${seed}-${sideLabel}-${arrows}`;
  const lines = text ? markerLines(text, 100, (w * 0.8 * 100) / 0.11) : [];
  // top label: split into two halves, one per long flap (line 1 on the -z flap)
  const half = Math.ceil(lines.length / 2);
  const topA = text ? (lines.length > 1 ? lines.slice(0, half).join("\n") : lines[0]) : null;
  const topB = text && lines.length > 1 ? lines.slice(half).join("\n") : null;
  const inner = kraftPlain(true);
  const edge = kraftEdge();
  const outerPlain = (k: string, fw: number, fh: number, s: number) => faceMat(`${key}-${k}`, fw, fh, null, color, s, arrows);
  const sideFace = (k: "px" | "nx" | "pz" | "nz", fw: number, fh: number, s: number) => (sideLabel === k && text ? faceMat(`${key}-${k}-lbl`, fw, fh, text, color, s, arrows, [0.08, 0.14, 0.84, 0.58]) : outerPlain(k, fw, fh, s));
  // box face order: px, nx, py, ny, pz, nz
  const wallZ = (s: 1 | -1) => (s > 0 ? [edge, edge, edge, edge, sideFace("pz", w, h - t, seed + 1), inner] : [edge, edge, edge, edge, inner, sideFace("nz", w, h - t, seed + 2)]);
  const wallX = (s: 1 | -1) => (s > 0 ? [sideFace("px", d - 2 * t, h - 2 * t, seed + 3), inner, edge, edge, edge, edge] : [inner, sideFace("nx", d - 2 * t, h - 2 * t, seed + 4), edge, edge, edge, edge]);
  const fd = d / 2 - 0.0015;
  const longA = 112 * DEG * sstep(0, 0.55, open);
  const shortA = 100 * DEG * sstep(0.5, 1, open);
  const flapTop = (s: 1 | -1) =>
    faceMat(`${key}-flap${s}`, w, fd, s < 0 ? topA : topB, color, seed + 5 + (s > 0 ? 1 : 0), false, s < 0 ? [0.08, 0.1, 0.84, 0.62] : [0.08, 0.36, 0.84, 0.56]);
  const longFlapMats = (s: 1 | -1) => [edge, edge, flapTop(s), inner, edge, edge];
  const shortFlapMats = () => [edge, edge, kraftPlain(false), inner, edge, edge];
  const tm = tapeMatFor(tape);
  const tw = 0.048;
  const tail = 0.07;
  const isOpen = open > 0.001;
  return (
    <group>
      {/* walls and floor */}
      {([1, -1] as const).map((s) => (
        <mesh key={`z${s}`} geometry={geo(`boxWZ-${w}-${h}-${t}`, () => new THREE.BoxGeometry(w, h - t, t))} material={wallZ(s)} position={[0, (h - t) / 2, s * (d / 2 - t / 2)]} />
      ))}
      {([1, -1] as const).map((s) => (
        <mesh key={`x${s}`} geometry={geo(`boxWX-${d}-${h}-${t}`, () => new THREE.BoxGeometry(t, h - 2 * t, d - 2 * t))} material={wallX(s)} position={[s * (w / 2 - t / 2), (h - 2 * t) / 2, 0]} />
      ))}
      <mesh geometry={geo(`boxFloor-${w}-${d}`, () => new THREE.BoxGeometry(w - 2 * t, t, d - 2 * t))} material={inner} position={[0, t / 2, 0]} />
      {/* short flaps (under the long ones when closed) */}
      {([1, -1] as const).map((s) => (
        <group key={`sf${s}`} position={[s * (w / 2), h - 2 * t, 0]} rotation={[0, 0, -s * shortA]}>
          <mesh geometry={geo(`boxSF-${d}-${t}`, () => new THREE.BoxGeometry(d / 2, t, d - 2 * t - 0.003))} material={shortFlapMats()} position={[-s * (d / 4), t / 2, 0]} />
        </group>
      ))}
      {/* long flaps, labelled, each carrying half the tape once it is cut */}
      {([1, -1] as const).map((s) => (
        <group key={`lf${s}`} position={[0, h - t, s * (d / 2)]} rotation={[s * longA, 0, 0]}>
          <mesh geometry={geo(`boxLF-${w}-${fd}-${t}`, () => new THREE.BoxGeometry(w, t, fd))} material={longFlapMats(s)} position={[0, t / 2, -s * (fd / 2)]} />
          {isOpen && <mesh geometry={geo(`tapeHalf-${w}`, () => new THREE.PlaneGeometry(w, tw / 2).rotateX(-Math.PI / 2))} material={tm} position={[0, t + 0.0004, -s * (fd - tw / 4)]} />}
        </group>
      ))}
      {/* tape: across the seam and down both ends (when cut, only the lower ends stay) */}
      {!isOpen && <mesh geometry={geo(`tapeTop-${w}`, () => new THREE.PlaneGeometry(w, tw).rotateX(-Math.PI / 2))} material={tm} position={[0, h + 0.0004, 0]} />}
      {([1, -1] as const).map((s) => (
        <mesh
          key={`tt${s}`}
          geometry={geo(`tapeTail-${isOpen}`, () => new THREE.PlaneGeometry(tw, isOpen ? tail - 2 * t - 0.002 : tail).rotateY(Math.PI / 2))}
          material={tm}
          position={[s * (w / 2 + 0.0004), isOpen ? h - 2 * t - 0.002 - (tail - 2 * t - 0.002) / 2 : h - tail / 2, 0]}
          rotation={[0, s > 0 ? 0 : Math.PI, 0]}
        />
      ))}
      <group position={[0, t, 0]}>{children}</group>
    </group>
  );
};

/** Toys for an open box (sized for a box of about 0.46 x 0.36): wooden letter blocks, a ball, a toy truck. */
const blockTex = (ch: string, c: string) =>
  canvasTex(`block-${ch}-${c}`, 128, 128, (g, w, h) => {
    g.fillStyle = "#E9D3A6";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = c;
    g.lineWidth = 10;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = c;
    g.font = "bold 78px 'DejaVu Sans', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, w / 2, h / 2 + 4);
  });
export const ToyBoxContents: React.FC = () => {
  const blocks: [string, string, P3, number][] = [
    ["A", "#C8402F", [-0.12, 0.025, -0.08], 0.2],
    ["B", "#2F6EC8", [-0.06, 0.025, -0.1], -0.3],
    ["C", "#2F9A4A", [-0.11, 0.075, -0.075], 0.5],
    ["D", "#E0A12A", [0.16, 0.025, 0.11], 0.1],
  ];
  return (
    <group>
      {blocks.map(([ch, c, p, r], i) => (
        <mesh key={i} geometry={geo("toyBlock", () => new RoundedBoxGeometry(0.05, 0.05, 0.05, 2, 0.004))} material={mat(`k-block-${ch}`, () => new THREE.MeshStandardMaterial({ map: blockTex(ch, c), roughness: 0.6 }))} position={p} rotation={[0, r, 0]} />
      ))}
      <mesh geometry={geo("toyBall", () => new THREE.SphereGeometry(0.06, 32, 20))} material={mat("k-toyBall", () => new THREE.MeshPhysicalMaterial({ color: "#D8352C", roughness: 0.3, clearcoat: 0.6 }))} position={[0.1, 0.06, -0.06]} />
      {/* a toy dump truck */}
      <group position={[0.02, 0, 0.08]} rotation={[0, 0.35, 0]}>
        <mesh geometry={geo("truckChassis", () => new RoundedBoxGeometry(0.18, 0.025, 0.08, 2, 0.006))} material={mat("k-truckRed", () => new THREE.MeshPhysicalMaterial({ color: "#E8B020", roughness: 0.35, clearcoat: 0.5 }))} position={[0, 0.033, 0]} />
        <mesh geometry={geo("truckCab", () => new RoundedBoxGeometry(0.05, 0.05, 0.075, 2, 0.008))} material={mat("k-truckRed", () => new THREE.MeshPhysicalMaterial({ color: "#E8B020", roughness: 0.35, clearcoat: 0.5 }))} position={[-0.06, 0.07, 0]} />
        <mesh geometry={geo("truckBed", () => new RoundedBoxGeometry(0.11, 0.04, 0.085, 2, 0.005))} material={mat("k-truckBed", () => new THREE.MeshPhysicalMaterial({ color: "#2C6FD0", roughness: 0.35, clearcoat: 0.5 }))} position={[0.03, 0.066, 0]} />
        {[-0.06, 0.05].map((x) =>
          [-1, 1].map((s) => (
            <mesh key={`${x}${s}`} geometry={geo("truckWheel", () => new THREE.CylinderGeometry(0.02, 0.02, 0.014, 18).rotateX(Math.PI / 2))} material={mat("k-tyre", () => new THREE.MeshStandardMaterial({ color: "#1B1B1D", roughness: 0.8 }))} position={[x, 0.02, s * 0.045]} />
          )),
        )}
      </group>
    </group>
  );
};

// ========================================================================================= dino lamp
const DL = {
  neck: [
    [0, 0.075, -0.035],
    [0, 0.125, -0.08],
    [0, 0.168, -0.098],
  ] as P3[],
  neckR: [0.028, 0.019, 0.016],
  tail: [
    [0, 0.052, 0.07],
    [0.018, 0.034, 0.118],
    [0.055, 0.02, 0.142],
    [0.084, 0.013, 0.125],
  ] as P3[],
  tailR: [0.03, 0.017, 0.0095, 0.0055],
  legs: [
    [[0.03, 0.006, -0.028], [0.03, 0.045, -0.025]],
    [[-0.03, 0.006, -0.028], [-0.03, 0.045, -0.025]],
    [[0.031, 0.006, 0.055], [0.03, 0.045, 0.05]],
    [[-0.031, 0.006, 0.055], [-0.03, 0.045, 0.05]],
  ] as [P3, P3][],
  snoutA: [0, 0.185, -0.118] as P3,
  snoutB: [0, 0.181, -0.142] as P3,
  bumps: [
    [0.006, 0.083, 0.088, 0.008],
    [0.024, 0.06, 0.123, 0.0065],
    [0.052, 0.037, 0.142, 0.005],
  ],
};
const dinoD = (x: number, y: number, z: number) => {
  let d = sdEll(x, y, z, 0, 0.062, 0.012, 0.05, 0.043, 0.068);
  for (const [a, b] of DL.legs) d = smin(d, Math.max(sdRoundCone(x, y, z, a, b, 0.016, 0.0175), -y), 0.012);
  for (let i = 0; i < DL.neck.length - 1; i++) d = smin(d, sdRoundCone(x, y, z, DL.neck[i], DL.neck[i + 1], DL.neckR[i], DL.neckR[i + 1]), 0.012);
  d = smin(d, sdEll(x, y, z, 0, 0.188, -0.112, 0.025, 0.023, 0.03), 0.01);
  d = smin(d, sdRoundCone(x, y, z, DL.snoutA, DL.snoutB, 0.02, 0.0165), 0.008);
  for (let i = 0; i < DL.tail.length - 1; i++) d = smin(d, sdRoundCone(x, y, z, DL.tail[i], DL.tail[i + 1], DL.tailR[i], DL.tailR[i + 1]), 0.012);
  for (const [bx, by, bz, br] of DL.bumps) d = smin(d, sdSphere(x, y, z, bx, by, bz, br), 0.006);
  return Math.max(d, -y);
};
const DINO_COL = { base: lin("#6CC4A1"), belly: lin("#F2E3B3"), spot: lin("#3E9C7E"), cheek: lin("#F29A9A") };
const dnoise = tileNoise(19, 16);
const dinoColor = (x: number, y: number, z: number): [number, number, number] => {
  const h = 0.001;
  const gy = dinoD(x, y + h, z) - dinoD(x, y - h, z);
  const gx = dinoD(x + h, y, z) - dinoD(x - h, y, z);
  const gz = dinoD(x, y, z + h) - dinoD(x, y, z - h);
  const ny = gy / (Math.hypot(gx, gy, gz) || 1);
  let c = DINO_COL.base;
  c = mix3(c, DINO_COL.belly, sstep(-0.1, -0.5, ny) * 0.9);
  // the front of the neck is cream too
  const nz = gz / (Math.hypot(gx, gy, gz) || 1);
  if (y > 0.07 && z < -0.03) c = mix3(c, DINO_COL.belly, sstep(-0.4, -0.85, nz) * 0.8);
  // spots on the back
  const sp = dnoise(x * 9 + 0.5, z * 9 + y * 4);
  if (ny > 0.2) c = mix3(c, DINO_COL.spot, sstep(0.66, 0.72, sp) * 0.9);
  // cheeks
  for (const s of [1, -1]) {
    const dd = Math.hypot(x - s * 0.02, y - 0.182, z + 0.132);
    c = mix3(c, DINO_COL.cheek, sstep(0.012, 0.004, dd) * 0.85);
  }
  return c;
};
const dinoMesh = () => once("dinoMesh", () => sdfMesh(dinoD, [-0.065, -0.002, -0.17], [0.1, 0.222, 0.168], 0.0032, dinoColor));
/** project a point onto the dino's surface (along the SDF gradient) */
const onDino = (p: THREE.Vector3, lift = 0) => {
  const q = p.clone();
  for (let i = 0; i < 6; i++) {
    const dd = dinoD(q.x, q.y, q.z);
    const h = 0.0005;
    const g = V(dinoD(q.x + h, q.y, q.z) - dinoD(q.x - h, q.y, q.z), dinoD(q.x, q.y + h, q.z) - dinoD(q.x, q.y - h, q.z), dinoD(q.x, q.y, q.z + h) - dinoD(q.x, q.y, q.z - h)).normalize();
    q.addScaledVector(g, -dd + (i === 5 ? lift : 0));
  }
  return q;
};
const dinoFace = () =>
  once("dinoFace", () => {
    const arcs: THREE.BufferGeometry[] = [];
    // happy closed eyes (∩) on each side of the head
    for (const s of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        pts.push(onDino(V(s * 0.03, 0.196 + 0.0045 * Math.sin(a), -0.122 + 0.0065 * Math.cos(a)), 0.0006));
      }
      arcs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0011, 6, false));
    }
    // a smile on the snout
    const sm: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      sm.push(onDino(V(0.009 * Math.cos(a), 0.177 + 0.004 * Math.sin(a) + 0.002, -0.16), 0.0006));
    }
    arcs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sm), 16, 0.001, 6, false));
    const nostrils = [1, -1].map((s) => onDino(V(s * 0.0065, 0.19, -0.16), 0.0002));
    return { lines: mergeGeometries(arcs), nostrils };
  });
const glaze = () => mat("k-dinoGlaze", () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12 }));
const brassMat = () => mat("k-brass", () => new THREE.MeshStandardMaterial({ color: "#C9A25A", metalness: 0.9, roughness: 0.3 }));
const inkMat = () => mat("k-ink", () => new THREE.MeshStandardMaterial({ color: "#1E1A18", roughness: 0.4 }));
const shadeTex = () =>
  canvasTex("dinoShade", 1024, 256, (g, w, h) => {
    g.fillStyle = "#F5E7B8";
    g.fillRect(0, 0, w, h);
    const r = rand(29);
    // linen slubs
    for (let i = 0; i < 12000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(150,120,60,${r() * 0.08})` : `rgba(255,255,240,${r() * 0.1})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 6, 1);
    }
    // little green footprints and stars
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * w + (r() - 0.5) * 20;
      const y = h * (0.3 + (i % 2) * 0.3 + (r() - 0.5) * 0.1);
      g.fillStyle = i % 3 === 0 ? "#E9B949" : "#5FAE8C";
      if (i % 3 === 0) {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5;
          const rr = k % 2 ? 4 : 10;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      } else {
        g.beginPath();
        g.ellipse(x, y + 6, 6, 7, 0, 0, Math.PI * 2);
        g.fill();
        for (const a of [-0.5, 0, 0.5]) {
          g.beginPath();
          g.ellipse(x + Math.sin(a) * 11, y - 6 - Math.cos(a) * 4, 2.6, 5, a, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // trim bands top and bottom
    g.fillStyle = "#4E9C7E";
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
  });

export type DinoLampProps = {
  /** 0 off .. 1 on (bulb and shade glow) */
  on?: number;
  /** optional real light at the bulb: point-light intensity at on = 1 (0 = none) */
  light?: number;
  lightRange?: number;
};
/** A friendly glazed-ceramic dinosaur (a long-necked sitter, closed happy eyes, rosy cheeks, spots, a curled
 * tail) with a brass stem from its back, a harp, a bulb and a linen drum shade printed with footprints. About
 * 0.41 tall; origin on the table, head toward -z. */
export const DinoLamp: React.FC<DinoLampProps> = ({ on = 0, light = 0, lightRange = 2 }) => {
  const m = dinoMesh();
  const face = dinoFace();
  const k = clamp01(on);
  const bulb = mat("k-dinoBulb", () => new THREE.MeshStandardMaterial({ color: "#F4F0E8", roughness: 0.25, emissive: new THREE.Color(K2700) }));
  bulb.emissiveIntensity = 5 * k;
  const shOut = mat("k-shadeOut", () => new THREE.MeshStandardMaterial({ map: shadeTex(), roughness: 0.92, emissive: new THREE.Color(K2700), emissiveMap: shadeTex(), side: THREE.FrontSide }));
  shOut.emissiveIntensity = 0.85 * k;
  const shIn = mat("k-shadeIn", () => new THREE.MeshStandardMaterial({ color: "#F8EED2", roughness: 0.9, emissive: new THREE.Color(K2700), side: THREE.BackSide }));
  shIn.emissiveIntensity = 1.8 * k;
  const harp = geo("dinoHarp", () => {
    const pts = [V(0.03, 0.3, 0), V(0.036, 0.35, 0), V(0.032, 0.392, 0), V(0.01, 0.404, 0), V(-0.01, 0.404, 0), V(-0.032, 0.392, 0), V(-0.036, 0.35, 0), V(-0.03, 0.3, 0)];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0016, 6, false);
  });
  const spider = geo("dinoSpider", () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      parts.push(new THREE.TubeGeometry(new THREE.LineCurve3(V(0, 0.4065, 0), V(Math.cos(a) * 0.087, 0.4065, Math.sin(a) * 0.087)), 2, 0.0012, 5, false));
    }
    parts.push(new THREE.TorusGeometry(0.087, 0.0016, 6, 64).rotateX(Math.PI / 2).translate(0, 0.4065, 0));
    parts.push(new THREE.TorusGeometry(0.104, 0.0016, 6, 64).rotateX(Math.PI / 2).translate(0, 0.269, 0));
    return mergeGeometries(parts);
  });
  const cord = geo("dinoCord", () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.028, 0.004, 0.064), V(-0.045, 0.0032, 0.12), V(-0.08, 0.0032, 0.2), V(-0.07, 0.0032, 0.3), V(-0.1, 0.0032, 0.38)]), 40, 0.0029, 6, false));
  return (
    <group>
      <mesh geometry={m.geometry} material={glaze()} />
      <mesh geometry={face.lines} material={inkMat()} />
      {face.nostrils.map((p, i) => (
        <mesh key={i} geometry={geo("dinoNostril", () => new THREE.SphereGeometry(0.0018, 8, 6))} material={inkMat()} position={p} />
      ))}
      <mesh geometry={cord} material={mat("k-cordWhite", () => new THREE.MeshStandardMaterial({ color: "#EDEAE2", roughness: 0.5 }))} />
      {/* the lamp: collar, stem, socket, bulb, harp, shade */}
      <group position={[0, 0, 0.02]}>
        <mesh geometry={geo("dinoCollar", () => new THREE.CylinderGeometry(0.013, 0.015, 0.009, 24))} material={brassMat()} position={[0, 0.1045, 0]} />
        <mesh geometry={geo("dinoStem", () => new THREE.CylinderGeometry(0.0072, 0.0072, 0.2, 16))} material={brassMat()} position={[0, 0.195, 0]} />
        <mesh geometry={geo("dinoSocket", () => new THREE.CylinderGeometry(0.0155, 0.017, 0.034, 24))} material={brassMat()} position={[0, 0.312, 0]} />
        <mesh geometry={geo("dinoBulbNeck", () => new THREE.CylinderGeometry(0.012, 0.0115, 0.018, 20))} material={bulb} position={[0, 0.337, 0]} />
        <mesh geometry={geo("dinoBulb", () => new THREE.SphereGeometry(0.027, 28, 18))} material={bulb} position={[0, 0.362, 0]} />
        <mesh geometry={harp} material={brassMat()} />
        <mesh geometry={geo("dinoFinial", () => new THREE.SphereGeometry(0.0065, 14, 10))} material={brassMat()} position={[0, 0.412, 0]} />
        <mesh geometry={spider} material={brassMat()} />
        <mesh geometry={geo("dinoShade", () => new THREE.CylinderGeometry(0.088, 0.105, 0.138, 72, 1, true))} material={shOut} position={[0, 0.338, 0]} />
        <mesh geometry={geo("dinoShade", () => new THREE.CylinderGeometry(0.088, 0.105, 0.138, 72, 1, true))} material={shIn} position={[0, 0.338, 0]} />
        {light > 0 && k > 0 && <pointLight color={K2700} intensity={light * k} distance={lightRange} decay={2} position={[0, 0.34, 0]} />}
      </group>
    </group>
  );
};

// ============================================================================================== rugs
const rugEdge = (c: string) => mat(`k-rugEdge-${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.97 }));
/** Nora's braided oval rug, 1.2 x 0.8 x 0.012 (origin at the floor centre, long axis along x). */
export const LavenderRug: React.FC = () => {
  const g = geo("lavRug", () => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 0.6 - 0.004, 0.4 - 0.004, 0, Math.PI * 2, false, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 4, curveSegments: 96 });
    e.rotateX(-Math.PI / 2);
    e.translate(0, 0.004, 0);
    return e;
  });
  const top = mat("k-lavRugTop", () => {
    const { map, normal } = braidTex();
    const m2 = withRepeat(map, 1 / 1.2, 1 / 0.8);
    m2.offset.set(0.5, 0.5);
    const n2 = withRepeat(normal, 1 / 1.2, 1 / 0.8);
    n2.offset.set(0.5, 0.5);
    return new THREE.MeshStandardMaterial({ map: m2, normalMap: n2, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.96 });
  });
  return <mesh geometry={g} material={[top, rugEdge("#A992CC")]} />;
};

const pileNormal = () => normalFromFn("pile", 256, 256, (u, v) => tileNoise(5, 64)(u, v) * 0.6 + tileNoise(6, 128)(u, v) * 0.4, 2.5);
/** Your blue rug with a trail of three-toed dinosaur footprints, 1.3 x 0.9 x 0.01 (origin floor centre). */
export const DinoRug: React.FC = () => {
  const g = geo("dinoRug", () => {
    const e = new THREE.ExtrudeGeometry(roundRectShape(1.3 - 0.006, 0.9 - 0.006, 0.035), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 10 });
    e.rotateX(-Math.PI / 2);
    e.translate(0, 0.003, 0);
    return e;
  });
  const top = mat("k-dinoRugTop", () => {
    const m2 = withRepeat(dinoRugTex(), 1 / 1.3, 1 / 0.9);
    m2.offset.set(0.5, 0.5);
    return new THREE.MeshStandardMaterial({ map: m2, normalMap: withRepeat(pileNormal(), 8, 8), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.97 });
  });
  return <mesh geometry={g} material={[top, rugEdge("#8FB5E3")]} />;
};

/** The unfaded carpet where her rug lay: a multiply decal with a soft edge (oval 1.2 x 0.8 by default, or a
 * rectangle). It darkens whatever carpet is under it; lay it at the floor (it lifts itself 0.8 mm). */
export const DarkerCarpetPatch: React.FC<{ w?: number; d?: number; shape?: "oval" | "rect"; strength?: number; tint?: string }> = ({ w = 1.2, d = 0.8, shape = "oval", strength = 1, tint = "#CBBFB8" }) => {
  const m = mat(`k-patch-${shape}-${strength}-${tint}`, () => {
    const t = canvasTex(`patch-${shape}-${strength}-${tint}`, 512, 352, (g, W, H) => {
      const img = g.createImageData(W, H);
      const c = new THREE.Color(tint);
      const n = tileNoise(44, 32);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W - 0.5;
          const v = (y + 0.5) / H - 0.5;
          let e: number;
          if (shape === "oval") e = 1 - Math.hypot(u * 2, v * 2);
          else e = Math.min(0.5 - Math.abs(u), 0.5 - Math.abs(v)) * 2;
          const k = sstep(0, 0.07, e) * strength * (0.85 + 0.3 * n((x / W) * 2, (y / H) * 2));
          const o = (y * W + x) * 4;
          img.data[o] = 255 * (1 - k * (1 - c.r));
          img.data[o + 1] = 255 * (1 - k * (1 - c.g));
          img.data[o + 2] = 255 * (1 - k * (1 - c.b));
          img.data[o + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    }, undefined, false);
    return new THREE.MeshBasicMaterial({ map: t, blending: THREE.MultiplyBlending, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
  return <mesh geometry={geo(`patch-${w}-${d}`, () => new THREE.PlaneGeometry(w * 1.08, d * 1.08).rotateX(-Math.PI / 2))} material={m} position={[0, 0.0008, 0]} renderOrder={1} />;
};

// ====================================================================================== fairy lights
/** A deterministic twinkle factor 0..1 for bulb i at time t (s): two slow sines per bulb, own phases. */
export const twinkle = (t: number, i: number, amount = 0.35) => {
  const r = rand(i * 7919 + 17);
  const f1 = 0.25 + r() * 0.5;
  const f2 = 0.6 + r() * 0.9;
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const s = (0.5 + 0.5 * Math.sin(t * f1 * Math.PI * 2 + p1)) * (0.5 + 0.5 * Math.sin(t * f2 * Math.PI * 2 + p2));
  return 1 - amount * s;
};
/** A helix winding around a path (e.g. a headboard's top rail): radius, turns. */
export const spiralCurve = (path: THREE.Curve<THREE.Vector3>, radius: number, turns: number, samples = 400) => {
  const fr = path.computeFrenetFrames(samples, false);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = t * turns * Math.PI * 2;
    pts.push(path.getPointAt(t).addScaledVector(fr.normals[i], Math.cos(a) * radius).addScaledVector(fr.binormals[i], Math.sin(a) * radius));
  }
  return new THREE.CatmullRomCurve3(pts);
};
/** A string hung between anchor points, sagging by `sag` (m per m of span) between each pair. */
export const sagCurve = (anchors: THREE.Vector3[], sag = 0.06, per = 12) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const span = a.distanceTo(b);
    for (let k = 0; k < per; k++) {
      const t = k / per;
      pts.push(a.clone().lerp(b, t).add(V(0, -4 * sag * span * t * (1 - t), 0)));
    }
  }
  pts.push(anchors[anchors.length - 1].clone());
  return new THREE.CatmullRomCurve3(pts);
};

export type FairyLightsProps = {
  curve: THREE.Curve<THREE.Vector3>;
  /** bulbs along it */
  count?: number;
  /** 0 off .. 1 on */
  on?: number;
  /** time (s) for the twinkle */
  t?: number;
  /** twinkle depth 0..1 */
  twinkleAmount?: number;
  /** bulb colour (default 2400 K) */
  color?: string;
  /** halo sprite size (m) */
  halo?: number;
};
const wireMat = () => mat("k-copperWire", () => new THREE.MeshStandardMaterial({ color: "#B87333", metalness: 0.85, roughness: 0.35 }));
const beadOff = () => mat("k-beadOff", () => new THREE.MeshPhysicalMaterial({ color: "#E9DDBE", roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.85 }));
/** Warm micro LED "fairy" lights on a thin copper wire along any curve. Bulbs are instanced (2.5 mm rice
 * beads along the wire) with additive halo points; everything deterministic in t. */
export const FairyLights: React.FC<FairyLightsProps> = ({ curve, count = 50, on = 1, t = 0, twinkleAmount = 0.35, color = K2400, halo = 0.028 }) => {
  const data = useMemo(() => {
    const wire = new THREE.TubeGeometry(curve, Math.max(64, count * 8), 0.00055, 4, false);
    const pos: THREE.Vector3[] = [];
    const quat: THREE.Quaternion[] = [];
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      pos.push(curve.getPointAt(u));
      quat.push(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), curve.getTangentAt(u).normalize()));
    }
    const pts = new THREE.BufferGeometry().setFromPoints(pos);
    pts.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    return { wire, pos, quat, pts };
  }, [curve, count]);
  const k = clamp01(on);
  const beadGeo = geo("fairyBead", () => new THREE.SphereGeometry(0.0019, 8, 6).scale(1, 1.5, 1));
  const lit = useMemo<THREE.Material>(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2), toneMapped: false }), [color]);
  const pm = useMemo(() => new THREE.PointsMaterial({ map: haloTex(), size: halo, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }), [halo]);
  const inst = useMemo(() => {
    const im = new THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>(beadGeo, lit, count);
    const m4 = new THREE.Matrix4();
    data.pos.forEach((p, i) => im.setMatrixAt(i, m4.compose(p, data.quat[i], V(1, 1, 1))));
    im.instanceMatrix.needsUpdate = true;
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    return im;
  }, [beadGeo, lit, count, data]);
  const c = new THREE.Color(color);
  const col = data.pts.getAttribute("color") as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const b = k * twinkle(t, i, twinkleAmount);
    inst.setColorAt(i, new THREE.Color(b, b, b));
    col.setXYZ(i, c.r * b * 0.85, c.g * b * 0.85, c.b * b * 0.85);
  }
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  col.needsUpdate = true;
  inst.material = k > 0.01 ? lit : beadOff();
  return (
    <group>
      <mesh geometry={data.wire} material={wireMat()} />
      <primitive object={inst} />
      {k > 0.01 && <points geometry={data.pts} material={pm} />}
    </group>
  );
};

// ======================================================================================= earplugs
const foamNormal = () => normalFromFn("foam", 128, 128, (u, v) => tileNoise(71, 48)(u, v) * 0.7 + tileNoise(72, 96)(u, v) * 0.3, 3);
const foamMat = () => mat("k-foam", () => new THREE.MeshStandardMaterial({ color: "#F07A2A", roughness: 0.96, normalMap: withRepeat(foamNormal(), 2, 2), normalScale: new THREE.Vector2(0.9, 0.9) }));
const earplugGeo = (squeeze: number) =>
  geo(`earplug-${squeeze.toFixed(2)}`, () => {
    const L = 0.022 * (1 + 0.25 * squeeze);
    const r0 = 0.0056 * (1 - 0.45 * squeeze);
    const r1 = 0.006 * (1 - 0.45 * squeeze);
    const pts: THREE.Vector2[] = [];
    const n = 7;
    // a slightly tapered foam cylinder with domed ends, along y (later laid along z)
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * r0, -L / 2 + r0 * 0.6 * (1 - Math.cos(a))));
    }
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.sin(a) * r1, L / 2 - r1 * 0.6 * (1 - Math.cos(a))));
    }
    const g = new THREE.LatheGeometry(pts, 18);
    g.rotateX(Math.PI / 2);
    return g;
  });
/** One orange foam earplug, centred, its axis along z (0.022 long, 0.012 thick); squeeze 0..1 = rolled thin. */
export const Earplug: React.FC<{ squeeze?: number }> = ({ squeeze = 0 }) => <mesh geometry={earplugGeo(Math.round(clamp01(squeeze) * 20) / 20)} material={foamMat()} />;

const tinMat = () => mat("k-tin", () => new THREE.MeshStandardMaterial({ color: "#C9CCD0", metalness: 0.95, roughness: 0.28 }));
const tinLidTex = () =>
  canvasTex("tinLid", 256, 256, (g, w, h) => {
    g.fillStyle = "#2D4C7A";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 3;
    for (const r of [0.46, 0.4]) {
      g.beginPath();
      g.arc(w / 2, h / 2, w * r, 0, Math.PI * 2);
      g.stroke();
    }
    // a simple crescent and three z's (no brand)
    g.fillStyle = "#F2E6C2";
    g.beginPath();
    g.arc(w * 0.44, h * 0.5, 44, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2D4C7A";
    g.beginPath();
    g.arc(w * 0.5, h * 0.45, 40, 0, Math.PI * 2);
    g.fill();
    drawMarker(g, "z z z", w * 0.52, h * 0.42, 22, "#F2E6C2", { seed: 4, width: 4, jitter: 0.3 });
  });
/** An open round tin (0.06 across, 0.017 tall) of orange foam earplugs; the lid lies beside it (or none).
 * count 0..8 plugs (the top two go first). Origin floor centre of the tin. */
export const EarplugTin: React.FC<{ count?: number; lid?: "beside" | "none" }> = ({ count = 8, lid = "beside" }) => {
  const base = geo("tinBase", () => {
    const p = [
      [0, 0],
      [0.0294, 0],
      [0.03, 0.0008],
      [0.03, 0.0162],
      [0.0306, 0.0168],
      [0.03, 0.0174],
      [0.0292, 0.0168],
      [0.0292, 0.0013],
      [0, 0.0013],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 48);
  });
  // plugs: five tangential in a ring, one across the middle, two on top
  const plugs: { p: P3; yaw: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    plugs.push({ p: [Math.cos(a) * 0.0188, 0.0013 + 0.0059, Math.sin(a) * 0.0188], yaw: -a });
  }
  plugs.push({ p: [0, 0.0013 + 0.0059, 0], yaw: 0.9 });
  plugs.push({ p: [0.0064, 0.0013 + 0.0118 + 0.0058, -0.002], yaw: 0.25 });
  plugs.push({ p: [-0.0064, 0.0013 + 0.0118 + 0.0058, 0.001], yaw: 0.25 });
  return (
    <group>
      <mesh geometry={base} material={tinMat()} />
      {plugs.slice(0, Math.max(0, Math.min(8, Math.round(count)))).map((e, i) => (
        <group key={i} position={e.p} rotation={[0, e.yaw, 0]}>
          <Earplug />
        </group>
      ))}
      {lid === "beside" && (
        <group position={[0.072, 0, 0.012]}>
          <mesh geometry={geo("tinLid", () => new THREE.CylinderGeometry(0.0309, 0.0309, 0.0075, 48))} material={[tinMat(), mat("k-tinLidTop", () => new THREE.MeshPhysicalMaterial({ map: tinLidTex(), metalness: 0.3, roughness: 0.35, clearcoat: 0.6 })), tinMat()]} position={[0, 0.00375, 0]} />
        </group>
      )}
    </group>
  );
};

// ============================================================================================ laptop
const keyboardTex = () =>
  canvasTex("keyboard", 1024, 704, (g, w, h) => {
    g.fillStyle = "#26282C";
    g.fillRect(0, 0, w, h);
    const px = w / 0.31;
    // keys: 6 rows over the top ~55%
    const rows = [14, 14, 13, 12, 11, 8];
    let y = 0.012 * px;
    rows.forEach((n, ri) => {
      const kh = (ri === 0 ? 0.011 : 0.016) * px;
      const kw = (0.29 * px - (n - 1) * 0.0025 * px) / n;
      for (let i = 0; i < n; i++) {
        let ww = kw;
        let x = 0.01 * px + i * (kw + 0.0025 * px);
        if (ri === 5 && i === 3) ww = kw * 3.2;
        if (ri === 5 && i > 3) x += kw * 2.2;
        if (ri === 5 && i > 3 && x + ww > w - 0.01 * px) continue;
        g.fillStyle = "#121315";
        g.beginPath();
        g.roundRect(x, y, ww, kh, 5);
        g.fill();
        const gr = g.createLinearGradient(0, y, 0, y + kh);
        gr.addColorStop(0, "rgba(255,255,255,0.10)");
        gr.addColorStop(1, "rgba(255,255,255,0.0)");
        g.fillStyle = gr;
        g.fillRect(x + 2, y + 2, ww - 4, kh * 0.5);
        if (ri > 0 && ri < 5) {
          g.fillStyle = "rgba(230,230,235,0.55)";
          g.fillRect(x + ww * 0.3, y + kh * 0.35, ww * 0.18, kh * 0.25);
        }
      }
      y += kh + 0.0025 * px;
    });
    // trackpad and palm rest
    g.fillStyle = "#2F3236";
    g.beginPath();
    g.roundRect(w / 2 - 0.05 * px, h - 0.075 * px, 0.1 * px, 0.06 * px, 12);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 2;
    g.stroke();
    const r = rand(3);
    for (let i = 0; i < 8000; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  });
const stickerTex = (kind: "star" | "planet" | "bolt") =>
  canvasTex(`sticker-${kind}`, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    if (kind === "star") {
      g.fillStyle = "#FFFFFF";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * (i % 2 ? 26 : 60), Math.sin(a) * (i % 2 ? 26 : 60));
      }
      g.fill();
      g.fillStyle = "#F2C230";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * (i % 2 ? 20 : 50), Math.sin(a) * (i % 2 ? 20 : 50));
      }
      g.fill();
    } else if (kind === "planet") {
      g.fillStyle = "#FFFFFF";
      g.beginPath();
      g.arc(0, 0, 54, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#7A5BD0";
      g.beginPath();
      g.arc(0, 0, 32, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#F08A3A";
      g.lineWidth = 8;
      g.beginPath();
      g.ellipse(0, 0, 50, 14, -0.4, 0, Math.PI * 2);
      g.stroke();
    } else {
      g.fillStyle = "#FFFFFF";
      g.beginPath();
      g.moveTo(-10, -60);
      g.lineTo(34, -60);
      g.lineTo(12, -10);
      g.lineTo(40, -10);
      g.lineTo(-24, 62);
      g.lineTo(-6, 6);
      g.lineTo(-34, 6);
      g.closePath();
      g.fill();
      g.fillStyle = "#3BA0E8";
      g.scale(0.8, 0.8);
      g.beginPath();
      g.moveTo(-10, -60);
      g.lineTo(34, -60);
      g.lineTo(12, -10);
      g.lineTo(40, -10);
      g.lineTo(-24, 62);
      g.lineTo(-6, 6);
      g.lineTo(-34, 6);
      g.closePath();
      g.fill();
    }
    g.restore();
  });
export type LaptopProps = { open?: number; screen?: number; screenKind?: "game" | "video" | "desktop"; color?: string };
/** A generic 2011 laptop (0.33 x 0.23): dark plastic, stickers on the lid, keyboard and trackpad; open 0..1
 * (closed .. 110 deg), screen brightness 0..1. Origin floor centre, hinge at the back (-z). */
export const Laptop: React.FC<LaptopProps> = ({ open = 0, screen = 0, screenKind = "game", color = "#2B2D33" }) => {
  const body = mat(`k-laptop-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
  const deck = mat("k-deck", () => new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const scr = mat(`k-laptopScreen-${screenKind}`, () => new THREE.MeshPhysicalMaterial({ color: "#050608", roughness: 0.12, clearcoat: 0.6, emissive: new THREE.Color("#ffffff"), emissiveMap: laptopScreenTex(screenKind), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  scr.emissiveIntensity = 1.3 * clamp01(screen);
  const ang = 110 * DEG * clamp01(open);
  const stick = (k: "star" | "planet" | "bolt") => mat(`k-stk-${k}`, () => new THREE.MeshStandardMaterial({ map: stickerTex(k), transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  return (
    <group>
      <mesh geometry={geo("lapBase", () => new RoundedBoxGeometry(0.33, 0.02, 0.23, 2, 0.004))} material={body} position={[0, 0.01, 0]} />
      <mesh geometry={geo("lapDeck", () => new THREE.PlaneGeometry(0.31, 0.21).rotateX(-Math.PI / 2))} material={deck} position={[0, 0.02 + 0.0002, 0]} />
      {/* ports */}
      {[0.03, 0.05, 0.075].map((z, i) => (
        <mesh key={i} geometry={geo("lapPort", () => new THREE.PlaneGeometry(0.012, 0.005).rotateY(Math.PI / 2))} material={mat("k-portBlack", () => new THREE.MeshBasicMaterial({ color: "#050505" }))} position={[0.165 + 0.0003, 0.01, z]} />
      ))}
      <group position={[0, 0.0201, -0.115]} rotation={[-ang, 0, 0]}>
        <mesh geometry={geo("lapLid", () => new RoundedBoxGeometry(0.33, 0.007, 0.23, 2, 0.003))} material={body} position={[0, 0.0036, 0.115]} />
        {/* screen on the inside face */}
        <mesh geometry={geo("lapScreen", () => new THREE.PlaneGeometry(0.29, 0.172).rotateX(Math.PI / 2))} material={scr} position={[0, 0.0001 - 0.0002, 0.113]} />
        {/* stickers on the outside */}
        <mesh geometry={geo("lapStk1", () => new THREE.PlaneGeometry(0.05, 0.05).rotateX(-Math.PI / 2))} material={stick("star")} position={[-0.09, 0.0072 + 0.0002, 0.07]} rotation={[0, 0.3, 0]} />
        <mesh geometry={geo("lapStk2", () => new THREE.PlaneGeometry(0.06, 0.06).rotateX(-Math.PI / 2))} material={stick("planet")} position={[0.07, 0.0072 + 0.0002, 0.15]} rotation={[0, -0.2, 0]} />
        <mesh geometry={geo("lapStk3", () => new THREE.PlaneGeometry(0.04, 0.04).rotateX(-Math.PI / 2))} material={stick("bolt")} position={[0.11, 0.0072 + 0.0002, 0.05]} rotation={[0, 0.5, 0]} />
      </group>
    </group>
  );
};

// ======================================================================================= soccer ball
const soccerMaps = () =>
  once("soccerMaps", () => {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const p = ico.getAttribute("position");
    const verts: THREE.Vector3[] = [];
    const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const seen = new Set<string>();
    const faces: THREE.Vector3[] = [];
    for (let i = 0; i < p.count; i += 3) {
      const a = V(p.getX(i), p.getY(i), p.getZ(i));
      const b = V(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
      const c = V(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      for (const v of [a, b, c])
        if (!seen.has(key(v))) {
          seen.add(key(v));
          verts.push(v.clone());
        }
      faces.push(a.clone().add(b).add(c).normalize());
    }
    // plane distances of the truncated icosahedron's faces (vertices at 1/3 along the ico edges)
    const v0 = verts[0];
    let nb = verts[1];
    let best = -2;
    for (const v of verts.slice(1))
      if (v.dot(v0) > best) {
        best = v.dot(v0);
        nb = v;
      }
    const tv = v0.clone().lerp(nb, 1 / 3);
    const n5 = v0.clone().normalize();
    const d5 = tv.dot(n5);
    // a hexagon touching that vertex: the face containing v0 and nb
    let n6 = faces[0];
    let bd = -2;
    for (const f of faces) {
      const s = f.dot(v0.clone().normalize()) + f.dot(nb.clone().normalize());
      if (s > bd) {
        bd = s;
        n6 = f;
      }
    }
    const d6 = tv.dot(n6);
    const P5 = verts.map((v) => v.clone().normalize());
    const W = 1024;
    const H = 512;
    const img = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
    const hgt = new Uint8ClampedArray(new ArrayBuffer(W * H * 4));
    const r = rand(9);
    const scuff = tileNoise(12, 24);
    for (let y = 0; y < H; y++) {
      const th = ((y + 0.5) / H) * Math.PI;
      for (let x = 0; x < W; x++) {
        const ph = ((x + 0.5) / W) * Math.PI * 2;
        const dx = -Math.cos(ph) * Math.sin(th);
        const dy = Math.cos(th);
        const dz = Math.sin(ph) * Math.sin(th);
        let b1 = -1;
        let b2 = -1;
        let pent = false;
        for (const n of P5) {
          const s = (dx * n.x + dy * n.y + dz * n.z) / d5;
          if (s > b1) {
            b2 = b1;
            b1 = s;
            pent = true;
          } else if (s > b2) b2 = s;
        }
        for (const n of faces) {
          const s = (dx * n.x + dy * n.y + dz * n.z) / d6;
          if (s > b1) {
            b2 = b1;
            b1 = s;
            pent = false;
          } else if (s > b2) b2 = s;
        }
        const edge = (b1 - b2) / b1; // 0 on a seam
        const seam = sstep(0.004, 0.016, edge);
        const puff = Math.pow(sstep(0.0, 0.09, edge), 0.6);
        const base = pent ? 26 : 242;
        const sc = scuff(x / W * 4, y / H * 2) > 0.72 ? 0.9 : 1;
        const v = (base * (0.35 + 0.65 * seam)) * sc;
        const o = (y * W + x) * 4;
        img[o] = v + (pent ? 0 : -4);
        img[o + 1] = v;
        img[o + 2] = v + (pent ? 2 : -10);
        img[o + 3] = 255;
        const hv = 255 * (0.25 + 0.75 * puff * seam);
        hgt[o] = hgt[o + 1] = hgt[o + 2] = hv;
        hgt[o + 3] = 255;
      }
    }
    void r;
    const mk = (data: Uint8ClampedArray<ArrayBuffer>, srgb: boolean, k: string) =>
      canvasTex(k, W, H, (g) => g.putImageData(new ImageData(data, W, H), 0, 0), undefined, srgb);
    return { map: mk(img, true, "soccerMap"), bump: mk(hgt, false, "soccerBump") };
  });
/** A size-5-ish soccer ball (0.2 across), classic 12 black pentagons and 20 white hexagons with stitched,
 * sunken seams and puffed panels. Origin on the floor under it. */
export const SoccerBall: React.FC<{ d?: number }> = ({ d = 0.2 }) => {
  const m = mat("k-soccer", () => {
    const { map, bump } = soccerMaps();
    return new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  });
  return <mesh geometry={geo("soccerBall", () => new THREE.SphereGeometry(0.1, 96, 64))} material={m} position={[0, d / 2, 0]} scale={d / 0.2} />;
};

// ============================================================================================== phone
export type PhoneProps = {
  w?: number;
  l?: number;
  t?: number;
  /** body / case colour */
  color?: string;
  /** a drawn screen (any texture); otherwise one of the generic screens */
  screen?: THREE.Texture;
  screenKind?: ScreenKind;
  /** screen brightness 0..1 */
  bright?: number;
  /** lying screen-down */
  faceDown?: boolean;
};
const phoneBodyGeo = (w: number, l: number, t: number) =>
  geo(`phoneBody-${w}-${l}-${t}`, () => {
    const b = Math.min(0.0022, t * 0.3);
    const e = new THREE.ExtrudeGeometry(roundRectShape(w - 2 * b, l - 2 * b, Math.min(w, l) * 0.13 - b), { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 12 });
    e.rotateX(-Math.PI / 2);
    e.translate(0, b, 0);
    return e;
  });
/** A generic phone slab (rounded rect, no logo) lying flat, screen up (+y), its top toward -z; origin under
 * its centre. The screen is emissive with any texture you draw. */
export const Phone: React.FC<PhoneProps> = ({ w = 0.071, l = 0.146, t = 0.0078, color = "#2B2E36", screen, screenKind = "chat", bright = 1, faceDown = false }) => {
  const body = mat(`k-phone-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  const tex = screen ?? phoneScreenTex(screenKind);
  const sm = useMemo(() => {
    const st = tex.clone();
    st.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ color: "#040506", roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, emissive: new THREE.Color("#ffffff"), emissiveMap: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }, [tex]);
  sm.emissiveIntensity = 1.25 * clamp01(bright);
  const scrGeo = geo(`phoneScreen-${w}-${l}`, () => {
    const g = new THREE.ShapeGeometry(roundRectShape(w - 0.0042, l - 0.0042, Math.min(w, l) * 0.11), 10);
    planarUV(g, "x", "y", -(w - 0.0042) / 2, (w - 0.0042) / 2, -(l - 0.0042) / 2, (l - 0.0042) / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const lift = 0.0005;
  return (
    <group position={[0, faceDown ? t + 0.0006 + lift : lift, 0]} rotation={[0, 0, faceDown ? Math.PI : 0]}>
      <mesh geometry={phoneBodyGeo(w, l, t)} material={body} />
      <mesh geometry={scrGeo} material={sm} position={[0, t + 0.00015, 0]} />
      {/* the camera module on the back (a 0.5 mm rise), two lenses and a flash */}
      <group position={[-w / 2 + 0.016, -0.00025, -l / 2 + 0.018]}>
        <mesh geometry={geo("phoneCam", () => new RoundedBoxGeometry(0.022, 0.0005, 0.024, 1, 0.0002))} material={body} />
        {[
          [0, -0.0055],
          [0, 0.0055],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={geo("phoneLens", () => new THREE.CylinderGeometry(0.0038, 0.0038, 0.0006, 20))} material={mat("k-lens", () => new THREE.MeshPhysicalMaterial({ color: "#07080A", roughness: 0.05, clearcoat: 1, metalness: 0.4 }))} position={[x - 0.003, -0.0002, z]} />
        ))}
        <mesh geometry={geo("phoneFlash", () => new THREE.CylinderGeometry(0.0016, 0.0016, 0.0006, 12))} material={mat("k-flash", () => new THREE.MeshStandardMaterial({ color: "#F2E6C8", roughness: 0.3 }))} position={[0.0065, -0.0002, 0]} />
      </group>
      {/* side buttons */}
      <mesh geometry={geo("phoneBtn", () => new RoundedBoxGeometry(0.0016, 0.0032, 0.018, 1, 0.0006))} material={body} position={[w / 2 + 0.0002, t / 2, -l * 0.18]} />
      <mesh geometry={geo("phoneBtn2", () => new RoundedBoxGeometry(0.0016, 0.0032, 0.011, 1, 0.0006))} material={body} position={[-w / 2 - 0.0002, t / 2, -l * 0.24]} />
      <mesh geometry={geo("phoneBtn2", () => new RoundedBoxGeometry(0.0016, 0.0032, 0.011, 1, 0.0006))} material={body} position={[-w / 2 - 0.0002, t / 2, -l * 0.15]} />
    </group>
  );
};

// ========================================================================================= mini fridge
const coilGeo = () =>
  geo("fridgeCoil", () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 9; i++) {
      const y = 0.08 + i * 0.045;
      const x0 = i % 2 ? 0.17 : -0.17;
      pts.push(V(x0, y, 0), V(-x0, y, 0));
    }
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      parts.push(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, 0.0035, 6, false));
    }
    for (let x = -0.15; x <= 0.151; x += 0.025) parts.push(new THREE.CylinderGeometry(0.0012, 0.0012, 0.38, 4).translate(x, 0.26, 0.004));
    return mergeGeometries(parts);
  });
const cordCoil = () =>
  geo("fridgeCordCoil", () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2 * 4;
      const r = 0.055 + 0.002 * Math.sin(a * 0.5);
      pts.push(V(Math.cos(a) * r, 0.0042 + (i / 200) * 0.0001 + (i % 50 < 25 ? 0 : 0.0), Math.sin(a) * r * 0.8));
    }
    // a loose tail to the plug
    pts.push(V(0.07, 0.0042, 0.02), V(0.095, 0.0042, 0.05));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.0035, 6, false);
  });
/** The dorm mini-fridge (0.45 w x 0.5 h x 0.5 d), door facing -z: rounded cabinet on four feet, a moulded
 * handle, a vent strip, condenser coils on the back, its cord coiled on top under a strip of painter's tape,
 * and tape across the door seam (packed). Origin floor centre. */
export const MiniFridge: React.FC<{ color?: string; packed?: boolean }> = ({ color = "#E9EAE6", packed = true }) => {
  const shell = mat(`k-fridge-${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  const black = mat("k-fridgeBlack", () => new THREE.MeshStandardMaterial({ color: "#1C1D20", roughness: 0.6 }));
  const blueTape = mat("k-blueTape", () => new THREE.MeshStandardMaterial({ color: "#3C8FD8", roughness: 0.85 }));
  const vent = mat("k-vent", () =>
    new THREE.MeshStandardMaterial({
      map: canvasTex("fridgeVent", 256, 32, (g, w, h) => {
        g.fillStyle = "#2A2B2E";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#0A0A0B";
        for (let x = 8; x < w - 8; x += 12) g.fillRect(x, 6, 7, h - 12);
      }),
      roughness: 0.6,
    }),
  );
  return (
    <group>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} geometry={geo("fridgeFoot", () => new THREE.CylinderGeometry(0.014, 0.016, 0.022, 16))} material={black} position={[sx * 0.18, 0.011, sz * 0.19]} />
      ))}
      <mesh geometry={geo("fridgeBody", () => new RoundedBoxGeometry(0.45, 0.478, 0.47, 3, 0.012))} material={shell} position={[0, 0.022 + 0.239, 0.015]} />
      <mesh geometry={geo("fridgeDoor", () => new RoundedBoxGeometry(0.446, 0.43, 0.034, 3, 0.011))} material={shell} position={[0, 0.07 + 0.215, -0.22 - 0.017 + 0.0005]} />
      <mesh geometry={geo("fridgeVentP", () => new THREE.PlaneGeometry(0.36, 0.03))} material={vent} position={[0, 0.047, -0.2201 + 0.0001]} rotation={[0, Math.PI, 0]} />
      <mesh geometry={geo("fridgeHandle", () => new RoundedBoxGeometry(0.022, 0.2, 0.02, 2, 0.007))} material={shell} position={[0.18, 0.33, -0.254 - 0.006]} />
      <mesh geometry={coilGeo()} material={black} position={[0, 0, 0.25 + 0.012]} />
      {packed && (
        <>
          <mesh geometry={cordCoil()} material={black} position={[-0.06, 0.5, 0.05]} />
          <mesh geometry={geo("fridgePlug", () => new RoundedBoxGeometry(0.03, 0.012, 0.022, 2, 0.003))} material={black} position={[0.035, 0.5 + 0.006, 0.1]} rotation={[0, 0.5, 0]} />
          <mesh geometry={geo("fridgeCordTape", () => new THREE.PlaneGeometry(0.05, 0.16).rotateX(-Math.PI / 2))} material={blueTape} position={[-0.06, 0.5 + 0.0085, 0.05]} rotation={[0, 0.3, 0]} />
          {/* tape over the door seam: front and side */}
          <mesh geometry={geo("doorTapeF", () => new THREE.PlaneGeometry(0.06, 0.05))} material={blueTape} position={[-0.21, 0.36, -0.254 - 0.0006]} rotation={[0, Math.PI, 0]} />
          <mesh geometry={geo("doorTapeS", () => new THREE.PlaneGeometry(0.06, 0.05).rotateY(-Math.PI / 2))} material={blueTape} position={[-0.225 - 0.0006, 0.36, -0.22]} />
        </>
      )}
    </group>
  );
};

// ======================================================================================= boxed desk lamp
const newsTex = () =>
  canvasTex("newsprint", 256, 256, (g, w, h) => {
    g.fillStyle = "#DCD8CC";
    g.fillRect(0, 0, w, h);
    const r = rand(13);
    for (let col = 0; col < 4; col++)
      for (let y = 8; y < h - 4; y += 6) {
        if (r() < 0.08) continue;
        g.fillStyle = `rgba(40,40,40,${0.35 + r() * 0.3})`;
        g.fillRect(6 + col * 62, y, 50 * (0.6 + r() * 0.4), 2);
      }
    g.fillStyle = "rgba(30,30,30,0.6)";
    g.fillRect(10, 12, 120, 10);
  });
const paperBall = (seed: number, R: number) =>
  geo(`paperBall-${seed}-${R}`, () => {
    const g = new THREE.IcosahedronGeometry(R, 3);
    const p = g.getAttribute("position");
    const n = tileNoise(seed, 6);
    const n2 = tileNoise(seed + 1, 14);
    for (let i = 0; i < p.count; i++) {
      const v = V(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const u = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5;
      const w = v.y * 0.5 + 0.5;
      const k = 0.82 + 0.22 * n(u, w) + 0.1 * (n2(u, w) - 0.5);
      p.setXYZ(i, v.x * R * k, v.y * R * k * 0.85, v.z * R * k);
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    // sit it on y = 0
    g.translate(0, -g.boundingBox!.min.y, 0);
    g.computeBoundingBox();
    return g;
  });
/** A swing-arm desk lamp packed upright in an open box with crumpled newsprint; its shade pokes out the
 * top. Box 0.32 x 0.26 x 0.26 (labelled if you like). Origin floor centre. */
export const BoxedDeskLamp: React.FC<{ text?: string | null; color?: string }> = ({ text = null, color = "#1E1E1E" }) => {
  const metal = mat("k-lampWhite", () => new THREE.MeshPhysicalMaterial({ color: "#E8E6E0", roughness: 0.3, clearcoat: 0.6, metalness: 0.1 }));
  const paper = mat("k-news", () => new THREE.MeshStandardMaterial({ map: newsTex(), roughness: 0.9, side: THREE.DoubleSide }));
  const arm1 = geo("lampArm1", () => new THREE.CylinderGeometry(0.006, 0.006, 1, 10));
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    return { mid, q, len: a.distanceTo(b) };
  };
  const base = V(0, 0.026, 0.01);
  const elbow = V(0.045, 0.2, 0.03);
  const head = V(-0.05, 0.285, -0.025);
  const s1 = seg(base, elbow);
  const s2 = seg(elbow, head);
  const balls: [number, number, P3][] = [
    [3, 0.042, [0.105, 0, 0.075]],
    [5, 0.04, [-0.1, 0, 0.07]],
    [7, 0.04, [0.1, 0, -0.075]],
  ];
  return (
    <MovingBox w={0.32} h={0.26} d={0.26} open={1} text={text} color={color} seed={7} arrows={false}>
      {balls.map(([sd, r, p], i) => (
        <mesh key={i} geometry={paperBall(sd, r)} material={paper} position={p} />
      ))}
      <mesh geometry={geo("lampBase", () => new THREE.CylinderGeometry(0.062, 0.066, 0.022, 32))} material={metal} position={[0, 0.011, 0.01]} />
      <mesh geometry={arm1} material={metal} position={s1.mid} quaternion={s1.q} scale={[1, s1.len, 1]} />
      <mesh geometry={geo("lampJoint", () => new THREE.SphereGeometry(0.011, 14, 10))} material={metal} position={elbow} />
      <mesh geometry={arm1} material={metal} position={s2.mid} quaternion={s2.q} scale={[1, s2.len, 1]} />
      <group position={head} rotation={[0.9, 0.3, 0.6]}>
        <mesh geometry={geo("lampHeadShade", () => new THREE.CylinderGeometry(0.018, 0.055, 0.085, 32, 1, true))} material={[metal]} position={[0, -0.03, 0]} />
        <mesh geometry={geo("lampHeadShadeIn", () => new THREE.CylinderGeometry(0.018, 0.055, 0.085, 32, 1, true))} material={mat("k-lampIn", () => new THREE.MeshStandardMaterial({ color: "#D9D5CC", roughness: 0.6, side: THREE.BackSide }))} position={[0, -0.03, 0]} />
        <mesh geometry={geo("lampHeadCap", () => new THREE.SphereGeometry(0.019, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2))} material={metal} position={[0, 0.0125, 0]} />
      </group>
    </MovingBox>
  );
};

// ============================================================================================ candle
const flameMat = () =>
  mat(
    "k-flame",
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uK: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying float vH;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = uv.y;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uK; varying vec3 vN; varying vec3 vV; varying float vH;
          void main() {
            float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
            vec3 core = vec3(1.0, 0.92, 0.7);
            vec3 edge = vec3(1.0, 0.52, 0.12);
            vec3 blue = vec3(0.25, 0.35, 1.0);
            vec3 c = mix(edge, core, f);
            c = mix(blue, c, smoothstep(0.02, 0.22, vH));
            float a = f * smoothstep(1.0, 0.55, vH) * (0.55 + 0.45 * smoothstep(0.0, 0.25, vH));
            gl_FragColor = vec4(c * a * 1.6 * uK, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
  );
const flameGeo = () =>
  geo("flame", () => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = 0.0052 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.9) * (1 - t * 0.55);
      pts.push(new THREE.Vector2(Math.max(0.00001, r), t * 0.026));
    }
    return new THREE.LatheGeometry(pts, 20);
  });
/** An ivory pillar candle (0.064 across, 0.075 tall) on a small white saucer, a melt pool and a curled wick;
 * lit 0..1 shows a soft flickering flame (t in seconds), glowing wax and a halo. Origin floor centre. */
export const Candle: React.FC<{ lit?: number; t?: number; light?: number }> = ({ lit = 1, t = 0, light = 0 }) => {
  const k = clamp01(lit);
  const saucer = geo("candleSaucer", () => {
    const p = [
      [0, 0],
      [0.03, 0],
      [0.033, 0.001],
      [0.043, 0.006],
      [0.046, 0.0085],
      [0.0448, 0.009],
      [0.041, 0.0068],
      [0.031, 0.0032],
      [0, 0.003],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(p, 48);
  });
  const wax = geo("candleWax", () => {
    const p: [number, number][] = [
      [0, 0],
      [0.031, 0],
      [0.032, 0.002],
      [0.032, 0.072],
      [0.0318, 0.0748],
      [0.0302, 0.0752],
      [0.026, 0.0722],
      [0.016, 0.0702],
      [0.004, 0.0694],
      [0, 0.0693],
    ];
    return new THREE.LatheGeometry(
      p.map(([x, y]) => new THREE.Vector2(x, y)),
      48,
    );
  });
  const waxMat = mat("k-wax", () => new THREE.MeshPhysicalMaterial({ color: "#F1E4CB", roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color("#FFE7C2"), emissive: new THREE.Color("#FF9A4A"), emissiveMap: canvasTex("waxGlow", 8, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.25, "#444444");
    gr.addColorStop(1, "#000000");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }) }));
  waxMat.emissiveIntensity = 0.55 * k;
  const fl = 1 + 0.07 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.03 * Math.sin(t * 41 + 0.4);
  const sway = 0.06 * Math.sin(t * 3.1) + 0.04 * Math.sin(t * 7.3 + 0.8);
  const fm = flameMat();
  (fm.uniforms.uK as { value: number }).value = k;
  const top = 0.003 + 0.0693;
  const halo = mat("k-candleHalo", () => new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color("#FFB05A"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.opacity = 0.55 * k * (0.9 + 0.1 * fl);
  return (
    <group>
      <mesh geometry={saucer} material={mat("k-saucer", () => new THREE.MeshPhysicalMaterial({ color: "#F4F2EC", roughness: 0.2, clearcoat: 0.8 }))} />
      <mesh geometry={wax} material={waxMat} position={[0, 0.003, 0]} />
      <mesh geometry={geo("wick", () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, -0.002, 0), V(0, 0.004, 0), V(0.0012, 0.0075, 0), V(0.0026, 0.0088, 0)]), 10, 0.0006, 5, false))} material={inkMat()} position={[0, top, 0]} />
      {k > 0.01 && (
        <group position={[0, top + 0.0045, 0]} rotation={[0, 0, sway * 0.4]} scale={[1, fl, 1]}>
          <mesh geometry={flameGeo()} material={fm} />
          <sprite material={halo} position={[0, 0.012, 0]} scale={[0.07, 0.07, 1]} />
          {light > 0 && <pointLight color="#FFA24A" intensity={light * k * fl} distance={1.5} decay={2} position={[0, 0.015, 0]} />}
        </group>
      )}
    </group>
  );
};

// ========================================================================================= pine sprig
const sprigData = () =>
  once("sprig", () => {
    const main = new THREE.CatmullRomCurve3([V(-0.1, 0.0042, 0.004), V(-0.04, 0.0046, 0.0), V(0.02, 0.0044, -0.006), V(0.07, 0.0041, -0.002), V(0.105, 0.0038, 0.006)]);
    const twigs: THREE.CatmullRomCurve3[] = [main];
    const r = rand(31);
    for (const [t, side, len] of [
      [0.22, 1, 0.07],
      [0.38, -1, 0.065],
      [0.55, 1, 0.055],
      [0.7, -1, 0.045],
      [0.84, 1, 0.032],
    ] as [number, number, number][]) {
      const p = main.getPointAt(t);
      const tg = main.getTangentAt(t);
      const side3 = V(-tg.z, 0, tg.x).multiplyScalar(side);
      const dir = tg.clone().multiplyScalar(0.75).add(side3).normalize();
      const q = p.clone().addScaledVector(dir, len);
      const m = p.clone().addScaledVector(dir, len * 0.5).add(V(0, 0.0004, 0)).addScaledVector(side3, len * 0.08);
      q.y = 0.0036;
      twigs.push(new THREE.CatmullRomCurve3([p, m, q]));
    }
    // needles: flattened sprays left and right of each twig, a few on top for volume
    const needles: { p: THREE.Vector3; d: THREE.Vector3; len: number; c: number }[] = [];
    twigs.forEach((tw, ti) => {
      const L = tw.getLength();
      const n = Math.floor(L / 0.0016);
      for (let i = 2; i < n; i++) {
        const u = i / n;
        const p = tw.getPointAt(u);
        const tg = tw.getTangentAt(u);
        const sideV = V(-tg.z, 0, tg.x);
        for (const s of [1, -1, 0]) {
          if (s === 0 && r() < 0.55) continue;
          const len = (0.013 + r() * 0.007) * (1 - 0.45 * Math.pow(u, 3)) * (ti === 0 ? 1 : 0.9);
          const elev = s === 0 ? 0.35 + r() * 0.35 : -0.04 + r() * 0.3;
          const fwd = 0.45 + r() * 0.3;
          const d = tg.clone().multiplyScalar(fwd).add(sideV.clone().multiplyScalar(s === 0 ? (r() - 0.5) * 0.6 : s)).normalize();
          d.y = Math.sin(elev);
          d.normalize();
          needles.push({ p, d, len, c: r() });
        }
      }
    });
    return { twigs, needles };
  });
/** A small fir sprig lying flat (about 0.21 long) with flattened sprays of needles and three red berries.
 * Every needle tip stays above y = 0. Origin on the surface at its middle. */
export const PineSprig: React.FC<{ berries?: boolean }> = ({ berries = true }) => {
  const data = sprigData();
  const bark = mat("k-bark", () => new THREE.MeshStandardMaterial({ color: "#6B4A2E", roughness: 0.85 }));
  const stems = geo("sprigStems", () => mergeGeometries(data.twigs.map((tw, i) => new THREE.TubeGeometry(tw, 24, i === 0 ? 0.0021 : 0.0012, 6, false))));
  const inst = useMemo(() => {
    const needle = new THREE.CylinderGeometry(0.00028, 0.00065, 1, 4).translate(0, 0.5, 0).scale(1, 1, 0.5);
    const im = new THREE.InstancedMesh(needle, mat("k-needle", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55 })), data.needles.length);
    const m4 = new THREE.Matrix4();
    const ca = new THREE.Color("#244A2E");
    const cb = new THREE.Color("#4C7A44");
    data.needles.forEach((n, i) => {
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n.d);
      im.setMatrixAt(i, m4.compose(n.p, q, V(1, n.len, 1)));
      im.setColorAt(i, ca.clone().lerp(cb, n.c * 0.7));
    });
    im.instanceMatrix.needsUpdate = true;
    return im;
  }, [data]);
  return (
    <group>
      <mesh geometry={stems} material={bark} />
      <primitive object={inst} />
      {berries &&
        [
          [-0.085, 0.0056, 0.016],
          [-0.077, 0.0056, 0.024],
          [-0.091, 0.0056, 0.027],
        ].map((p, i) => (
          <mesh key={i} geometry={geo("berry", () => new THREE.SphereGeometry(0.0055, 14, 10))} material={mat("k-berry", () => new THREE.MeshPhysicalMaterial({ color: "#B3121C", roughness: 0.2, clearcoat: 1 }))} position={p as P3} />
        ))}
    </group>
  );
};

// ================================================================================= decorative pillows
type PillowSpec = { name: string; w: number; d: number; ht: number; hb: number; pinch: number; piping: string | null; tassels: string | null; kind: "square" | "bolster" };
/** The six guest-bed pillows by index (w, d across; h = total height lying flat). */
export const DECOR_PILLOWS: (PillowSpec & { h: number })[] = (
  [
    { name: "beige linen", w: 0.45, d: 0.45, ht: 0.09, hb: 0.045, pinch: 0.08, piping: null, tassels: null, kind: "square" },
    { name: "mustard velvet", w: 0.45, d: 0.45, ht: 0.085, hb: 0.045, pinch: 0.07, piping: "#A87A1E", tassels: null, kind: "square" },
    { name: "sage rib", w: 0.5, d: 0.5, ht: 0.1, hb: 0.05, pinch: 0.09, piping: "#86997C", tassels: null, kind: "square" },
    { name: "cream tasselled", w: 0.45, d: 0.45, ht: 0.085, hb: 0.046, pinch: 0.06, piping: null, tassels: "#B4634A", kind: "square" },
    { name: "terracotta bolster", w: 0.46, d: 0.17, ht: 0.17, hb: 0, pinch: 0, piping: null, tassels: null, kind: "bolster" },
    { name: "lumbar stripe", w: 0.55, d: 0.32, ht: 0.075, hb: 0.038, pinch: 0.05, piping: "#B5562E", tassels: null, kind: "square" },
  ] as PillowSpec[]
).map((p) => ({ ...p, h: p.kind === "bolster" ? p.ht : p.ht + p.hb }));

const pillowGeo = (s: PillowSpec) =>
  geo(`pillow-${s.name}`, () => {
    const n = 30;
    const f = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.7);
    const gb = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 7)), 0.3);
    const P = (u: number, v: number, top: boolean): P3 => {
      const x = (s.w / 2) * u * (1 - s.pinch * (1 - v * v));
      const z = (s.d / 2) * v * (1 - s.pinch * (1 - u * u));
      const y = top ? s.hb + s.ht * f(u) * f(v) : s.hb * (1 - gb(u) * gb(v));
      return [x, y, z];
    };
    const build = (top: boolean) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j <= n; j++)
        for (let i = 0; i <= n; i++) {
          const u = Math.sin((-1 + (2 * i) / n) * (Math.PI / 2));
          const v = Math.sin((-1 + (2 * j) / n) * (Math.PI / 2));
          pos.push(...P(u, v, top));
          uv.push((u + 1) / 2, 1 - (v + 1) / 2);
        }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const a = j * (n + 1) + i;
          const b = a + 1;
          const c = a + n + 1;
          const d = c + 1;
          if (top) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const top = build(true);
    const bot = build(false);
    const out = mergeGeometries([top, bot]);
    return out;
  });
const pillowSeam = (s: PillowSpec) =>
  geo(`pillowSeam-${s.name}`, () => {
    const pts: THREE.Vector3[] = [];
    const m = 24;
    const edge = (u: number, v: number) => V((s.w / 2) * u * (1 - s.pinch * (1 - v * v)), s.hb, (s.d / 2) * v * (1 - s.pinch * (1 - u * u)));
    for (let i = 0; i < m; i++) pts.push(edge(-1 + (2 * i) / m, -1));
    for (let i = 0; i < m; i++) pts.push(edge(1, -1 + (2 * i) / m));
    for (let i = 0; i < m; i++) pts.push(edge(1 - (2 * i) / m, 1));
    for (let i = 0; i < m; i++) pts.push(edge(-1, 1 - (2 * i) / m));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, "centripetal"), 240, 0.0048, 8, true);
  });
const bolsterGeo = (s: PillowSpec) =>
  geo(`bolster-${s.name}`, () => {
    const L = s.w;
    const R = s.ht / 2;
    const e = 0.055;
    const ns = 56;
    const nt = 48;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= ns; i++) {
      const sx = -L / 2 + (L * i) / ns;
      const q = Math.max(0, (Math.abs(sx) - (L / 2 - e)) / e);
      for (let j = 0; j <= nt; j++) {
        const th = (j / nt) * Math.PI * 2;
        const pleat = 1 - 0.07 * (0.5 + 0.5 * Math.cos(th * 18)) * sstep(0.25, 1, q);
        const r = R * Math.sqrt(Math.max(0, 1 - q * q)) * pleat * (1 - 0.03 * Math.cos(th * 2 + Math.PI) * 0);
        pos.push(sx, R + r * Math.sin(th), r * Math.cos(th));
        uv.push(i / ns, j / nt);
      }
    }
    for (let i = 0; i < ns; i++)
      for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j;
        const b = a + nt + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
const tasselGeo = () =>
  geo("tassel", () => {
    const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.0068, 12, 8).scale(1, 1.25, 1)];
    parts.push(new THREE.CylinderGeometry(0.0058, 0.0066, 0.006, 12).translate(0, 0.008, 0));
    const r = rand(5);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const tilt = 0.08 + r() * 0.12;
      const len = 0.04 + r() * 0.008;
      const c = new THREE.CylinderGeometry(0.0009, 0.0011, len, 4).translate(0, len / 2, 0);
      c.rotateX(tilt);
      c.rotateY(a);
      c.translate(Math.cos(a) * 0.003, 0.009, Math.sin(a) * 0.003);
      parts.push(c);
    }
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    // the tassel hangs along +y from its knot; flip so it hangs down -y
    g.rotateX(Math.PI);
    return g;
  });
const pillowTex = (i: number) =>
  canvasTex(`decorPillow-${i}`, 512, 512, (g, w, h) => {
    const r = rand(300 + i);
    const base = ["#CDBB9C", "#C99A2E", "#9DB093", "#EEE5D0", "#B4634A", "#EDE4D2"][i];
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 30000; k++) {
      g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.07})` : `rgba(255,255,255,${r() * 0.07})`;
      g.fillRect(r() * w, r() * h, i === 0 ? 4 + r() * 8 : 1.5, i === 0 ? 1 : 1.5);
    }
    if (i === 1 || i === 4) {
      // crushed velvet: soft light/dark clouds
      for (let k = 0; k < 60; k++) {
        const x = r() * w;
        const y = r() * h;
        const gr = g.createRadialGradient(x, y, 0, x, y, 30 + r() * 50);
        gr.addColorStop(0, r() < 0.5 ? "rgba(255,240,200,0.10)" : "rgba(60,30,0,0.10)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    }
    if (i === 3) {
      // a soft woven diamond lattice
      g.strokeStyle = "rgba(180,99,74,0.55)";
      g.lineWidth = 3;
      for (let k = -8; k <= 8; k++) {
        g.beginPath();
        g.moveTo(k * 64, 0);
        g.lineTo(k * 64 + w, h);
        g.stroke();
        g.beginPath();
        g.moveTo(k * 64 + w, 0);
        g.lineTo(k * 64, h);
        g.stroke();
      }
      g.fillStyle = "rgba(80,70,60,0.5)";
      for (let y = 32; y < h; y += 64)
        for (let x = 0; x < w; x += 64) {
          g.beginPath();
          g.arc(x + (y / 64) % 2 * 32, y, 4, 0, Math.PI * 2);
          g.fill();
        }
    }
    if (i === 5) {
      // a rust band of stripes across the middle (along the pillow's length)
      g.fillStyle = "#B5562E";
      g.fillRect(0, h * 0.4, w, h * 0.2);
      g.fillStyle = "#EDE4D2";
      for (const y of [0.44, 0.5, 0.56]) g.fillRect(0, h * y - 3, w, 6);
      g.fillStyle = "#3A3A40";
      g.fillRect(0, h * 0.37, w, 4);
      g.fillRect(0, h * 0.63 - 4, w, 4);
    }
  });
const pillowNormal = (i: number) =>
  normalFromFn(`decorPillow-${i}`, 256, 256, (u, v) => {
    if (i === 2) return 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 40);
    if (i === 0) return tileNoise(81, 64)(u, v) * 0.5 + 0.5 * Math.abs(Math.sin(v * Math.PI * 2 * 60));
    return tileNoise(82 + i, 64)(u, v);
  }, i === 2 ? 3 : 1.2);
const pillowMat = (i: number) =>
  mat(`k-decorPillow-${i}`, () => {
    const velvet = i === 1 || i === 4;
    return new THREE.MeshPhysicalMaterial({
      map: pillowTex(i),
      normalMap: withRepeat(pillowNormal(i), 3, 3),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: velvet ? 0.72 : 0.9,
      sheen: velvet ? 1 : 0.35,
      sheenRoughness: velvet ? 0.35 : 0.7,
      sheenColor: new THREE.Color(velvet ? (i === 1 ? "#FFD97A" : "#F0A07E") : "#FFFFFF"),
    });
  });

/** One of the six decorative pillows lying flat (origin under its centre, y = 0 its lowest point). index:
 * 0 beige linen, 1 mustard velvet (piped), 2 sage rib (piped), 3 cream with corner tassels, 4 terracotta
 * bolster (axis along x, gathered ends, buttons), 5 lumbar with a rust stripe band. */
export const DecorativePillow: React.FC<{ index: number }> = ({ index }) => {
  const i = ((Math.round(index) % 6) + 6) % 6;
  const s = DECOR_PILLOWS[i];
  if (s.kind === "bolster") {
    const R = s.ht / 2;
    return (
      <group>
        <mesh geometry={bolsterGeo(s)} material={pillowMat(i)} />
        {[1, -1].map((sx) => (
          <mesh key={sx} geometry={geo("bolsterButton", () => new THREE.CylinderGeometry(0.013, 0.013, 0.008, 20).rotateZ(Math.PI / 2))} material={mat("k-bolsterBtn", () => new THREE.MeshPhysicalMaterial({ color: "#8E4532", roughness: 0.6, sheen: 1, sheenColor: new THREE.Color("#E09070") }))} position={[sx * (s.w / 2 - 0.0015), R, 0]} />
        ))}
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={pillowGeo(s)} material={pillowMat(i)} />
      {s.piping && <mesh geometry={pillowSeam(s)} material={mat(`k-piping-${s.piping}`, () => new THREE.MeshPhysicalMaterial({ color: s.piping!, roughness: 0.6, sheen: 0.8, sheenColor: new THREE.Color("#ffffff") }))} />}
      {s.tassels &&
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz], k) => {
          const out = V(sx, 0, sz).normalize();
          const dir = out.clone().multiplyScalar(0.95).add(V(0, -0.3, 0)).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
          return <mesh key={k} geometry={tasselGeo()} material={mat(`k-tassel-${s.tassels}`, () => new THREE.MeshStandardMaterial({ color: s.tassels!, roughness: 0.85 }))} position={[sx * (s.w / 2 + 0.004), s.hb, sz * (s.d / 2 + 0.004)]} quaternion={q} />;
        })}
    </group>
  );
};

/** The pillows stacked on the floor (each resting on the peak of the one below, small turns and offsets). */
export const PillowStack: React.FC<{ order?: number[]; seed?: number }> = ({ order = [2, 0, 1, 3, 5, 4], seed = 4 }) => {
  const r = rand(seed);
  let y = 0;
  return (
    <group>
      {order.map((i, k) => {
        const s = DECOR_PILLOWS[i];
        const p: P3 = [(r() - 0.5) * 0.04, y, (r() - 0.5) * 0.04];
        const yaw = (r() - 0.5) * 0.5;
        y += s.h;
        return (
          <group key={k} position={p} rotation={[0, yaw, 0]}>
            <DecorativePillow index={i} />
          </group>
        );
      })}
    </group>
  );
};

// ======================================================================================= air mattress
type Perim = { p: [number, number][]; n: [number, number][]; s: number[]; corner: number[] };
/** Points round a rounded rectangle (half extents a, b; corner radius rc), with outward normals and arc length. */
const roundedPerim = (a: number, b: number, rc: number, segC = 10, segS = 0.06): Perim => {
  const p: [number, number][] = [];
  const n: [number, number][] = [];
  const corner: number[] = [];
  const cs: [number, number, number][] = [
    [a - rc, b - rc, 0],
    [-(a - rc), b - rc, Math.PI / 2],
    [-(a - rc), -(b - rc), Math.PI],
    [a - rc, -(b - rc), Math.PI * 1.5],
  ];
  for (let c = 0; c < 4; c++) {
    const [cx, cz, a0] = cs[c];
    for (let i = 0; i < segC; i++) {
      const ang = a0 + (i / segC) * (Math.PI / 2);
      p.push([cx + Math.cos(ang) * rc, cz + Math.sin(ang) * rc]);
      n.push([Math.cos(ang), Math.sin(ang)]);
      corner.push(1);
    }
    // straight run to the next corner
    const [nx, nz, a1] = cs[(c + 1) % 4];
    const e0: [number, number] = [cx + Math.cos(a0 + Math.PI / 2) * rc, cz + Math.sin(a0 + Math.PI / 2) * rc];
    const e1: [number, number] = [nx + Math.cos(a1) * rc, nz + Math.sin(a1) * rc];
    const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
    const k = Math.max(1, Math.ceil(len / segS));
    const nn: [number, number] = [Math.cos(a0 + Math.PI / 2), Math.sin(a0 + Math.PI / 2)];
    for (let i = 0; i < k; i++) {
      const t = i / k;
      p.push([e0[0] + (e1[0] - e0[0]) * t, e0[1] + (e1[1] - e0[1]) * t]);
      n.push(nn);
      corner.push(i === 0 ? 1 : 0);
    }
  }
  const s = [0];
  for (let i = 1; i <= p.length; i++) s.push(s[i - 1] + Math.hypot(p[i % p.length][0] - p[i - 1][0], p[i % p.length][1] - p[i - 1][1]));
  return { p, n, s, corner };
};
/** A surface swept round a perimeter: rings at profile points (outward offset o, height y). UV in metres. */
const ringSurface = (per: Perim, prof: [number, number][], extra?: (i: number, j: number) => number) => {
  const M = per.p.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let vacc = 0;
  prof.forEach(([o, y], j) => {
    if (j > 0) vacc += Math.hypot(o - prof[j - 1][0], y - prof[j - 1][1]);
    for (let i = 0; i <= M; i++) {
      const k = i % M;
      const oo = o + (extra ? extra(k, j) : 0);
      pos.push(per.p[k][0] + per.n[k][0] * oo, y, per.p[k][1] + per.n[k][1] * oo);
      uv.push(per.s[i], vacc);
    }
  });
  const row = M + 1;
  for (let j = 0; j < prof.length - 1; j++)
    for (let i = 0; i < M; i++) {
      const a = j * row + i;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};
/** A flat cap inside the perimeter at offset o, height y, facing up or down; UV = (x, z) in metres. */
const capGeo = (per: Perim, o: number, y: number, up: boolean) => {
  const sh = new THREE.Shape(per.p.map(([x, z], k) => new THREE.Vector2(x + per.n[k][0] * o, up ? -(z + per.n[k][1] * o) : z + per.n[k][1] * o)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate(0, y, 0);
  planarUV(g, "x", "z", 0, 1, 0, 1);
  return g;
};
const AM = { W: 0.99, L: 1.9, H: 0.45, rc: 0.09, rb: 0.035, rt: 0.06, bulge: 0.012, hem: 0.32 };
/** the vinyl body's profile: bottom rounding, bulging side, top rounding (flocked) */
const amProfile = () => {
  const side: [number, number][] = [];
  const top: [number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const ph = (i / 6) * (Math.PI / 2);
    side.push([-AM.rb + AM.rb * Math.sin(ph), AM.rb - AM.rb * Math.cos(ph)]);
  }
  const y0 = AM.rb;
  const y1 = AM.H - AM.rt;
  for (let i = 1; i <= 14; i++) {
    const y = y0 + ((y1 - y0) * i) / 14;
    side.push([AM.bulge * Math.sin((Math.PI * (y - y0)) / (y1 - y0)), y]);
  }
  for (let i = 0; i <= 8; i++) {
    const ph = (i / 8) * (Math.PI / 2);
    top.push([-AM.rt + AM.rt * Math.cos(ph), AM.H - AM.rt + AM.rt * Math.sin(ph)]);
  }
  return { side, top };
};
const offsetProfile = (prof: [number, number][], d: number) =>
  prof.map((p, j) => {
    const a = prof[Math.max(0, j - 1)];
    const b = prof[Math.min(prof.length - 1, j + 1)];
    const to = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(to, ty) || 1;
    return [p[0] + (ty / l) * d, p[1] - (to / l) * d] as [number, number];
  });
const amMats = () =>
  once("amMats", () => {
    const vinylN = normalFromFn("vinyl", 256, 256, (u, v) => tileNoise(91, 96)(u, v), 0.8);
    const vinyl = new THREE.MeshPhysicalMaterial({ color: "#7D828A", roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.3, normalMap: withRepeat(vinylN, 6, 6), normalScale: new THREE.Vector2(0.4, 0.4) });
    const flockMap = canvasTex("flock", 512, 512, (g, w, h) => {
      g.fillStyle = "#484B53";
      g.fillRect(0, 0, w, h);
      const r = rand(92);
      for (let i = 0; i < 40000; i++) {
        g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,255,255,${r() * 0.06})`;
        g.fillRect(r() * w, r() * h, 1.2, 1.2);
      }
    });
    const flockN = normalFromFn("coilBeam", 256, 256, (u, v) => {
      const k = fract1(v * 4);
      return Math.pow(Math.sin(Math.PI * k), 0.5) * (0.85 + 0.15 * Math.sin(u * Math.PI * 2 * 3)) + 0.05 * tileNoise(93, 64)(u, v);
    }, 4);
    const flock = new THREE.MeshPhysicalMaterial({ map: withRepeat(flockMap, 2, 2), normalMap: withRepeat(flockN, 1 / 0.44, 1 / 0.44), roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color("#9EA4B0") });
    const seam = new THREE.MeshPhysicalMaterial({ color: "#6E737B", roughness: 0.35, clearcoat: 0.5 });
    return { vinyl, flock, seam };
  });
const fract1 = (x: number) => x - Math.floor(x);
const amGeos = () =>
  once("amGeos", () => {
    const per = roundedPerim(AM.W / 2, AM.L / 2, AM.rc);
    const { side, top } = amProfile();
    const sideG = ringSurface(per, side);
    const topG = ringSurface(per, top);
    const capTop = capGeo(per, -AM.rt, AM.H, true);
    const capBot = capGeo(per, -AM.rb, 0, false);
    const ring = (o: number, y: number) => new THREE.CatmullRomCurve3(per.p.map(([x, z], k) => V(x + per.n[k][0] * o, y, z + per.n[k][1] * o)), true, "centripetal");
    const seams = mergeGeometries([new THREE.TubeGeometry(ring(0.0015, AM.H - AM.rt), 400, 0.0042, 6, true), new THREE.TubeGeometry(ring(0.0012, AM.rb), 400, 0.0038, 6, true)]);
    // the fitted sheet: over the top rounding and down the side to the hem, 3 mm proud, loose at the corners
    const sheetProf = offsetProfile([...side.filter((p) => p[1] >= AM.hem), ...top.slice(1)], 0.003);
    const hemIdx = 0;
    const wr = (k: number, j: number) => {
      const near = per.corner[k] ? 1 : 0;
      const t = 1 - Math.min(1, (sheetProf[j][1] - AM.hem) / 0.08);
      return 0.0035 * near * t * t * (0.5 + 0.5 * Math.sin(per.s[k] * 70)) + 0.0012 * t * (0.5 + 0.5 * Math.sin(per.s[k] * 23));
    };
    const sheetSide = ringSurface(per, [[sheetProf[0][0] - 0.0005, sheetProf[0][1] - 0.004], ...sheetProf], (k, j) => wr(k, Math.max(0, j - 1)));
    const sheetCap = capGeo(per, -AM.rt, AM.H + 0.003, true);
    const hem = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(per.p.map(([x, z], k) => {
        const o = sheetProf[hemIdx][0] + wr(k, 0) + 0.0012;
        return V(x + per.n[k][0] * o, sheetProf[hemIdx][1] - 0.002, z + per.n[k][1] * o);
      }), true, "centripetal"),
      400,
      0.0032,
      6,
      true,
    );
    // the folded quilt at the foot: a stadium section 0.42 x 0.07 swept 0.92 across
    const qz = AM.L / 2 - 0.06 - 0.21 - 0.02;
    const qy = AM.H + 0.0035 + 0.035;
    const quilt = sweepGeometry(new THREE.LineCurve3(V(-0.46, qy, qz), V(0.46, qy, qz)), ellipseStadium(0.21, 0.035), 24, V(0, 0, 1));
    planarUV(quilt, "x", "z", -0.46, 0.46, qz - 0.21, qz + 0.21);
    return { sideG, topG, capTop, capBot, seams, sheetSide, sheetCap, hem, quilt, per };
  });
/** a stadium profile with many points on the round ends */
const ellipseStadium = (a: number, b: number) => {
  const out: [number, number][] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([a - b + b * Math.cos(t), b * Math.sin(t)]);
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.PI / 2 + (i / n) * Math.PI;
    out.push([-(a - b) + b * Math.cos(t), b * Math.sin(t)]);
  }
  return out;
};
void ellipseProfile;

/** The raised twin air mattress (0.99 x 1.9, 0.45 tall): grey vinyl sides with welded seam beads, a flocked
 * coil-beam top, a built-in pump on the foot end; made up with a fitted sheet (wrapping 13 cm down the
 * sides, gathered at the corners) and a folded quilt at the foot. Origin floor centre, head toward -z. */
export const AirMattress: React.FC<{ sheet?: boolean; quilt?: boolean; quiltMaterial?: THREE.Material; sheetTone?: "white" | "cream" }> = ({ sheet = true, quilt = true, quiltMaterial, sheetTone = "white" }) => {
  const g = amGeos();
  const m = amMats();
  const sheetM = plainSheetMat(sheetTone, { uvSize: [1, 1] });
  const pumpZ = AM.L / 2;
  const pumpY = 0.2;
  const yy = (pumpY - AM.rb) / (AM.H - AM.rt - AM.rb);
  const pumpO = AM.bulge * Math.sin(Math.PI * yy);
  return (
    <group>
      <mesh geometry={g.sideG} material={m.vinyl} />
      <mesh geometry={g.capBot} material={m.vinyl} />
      <mesh geometry={g.topG} material={m.flock} />
      <mesh geometry={g.capTop} material={m.flock} />
      <mesh geometry={g.seams} material={m.seam} />
      {/* built-in pump panel and its dial */}
      <group position={[0.24, pumpY, pumpZ + pumpO - 0.004]}>
        <mesh geometry={geo("amPump", () => new RoundedBoxGeometry(0.17, 0.11, 0.02, 3, 0.008))} material={mat("k-pump", () => new THREE.MeshPhysicalMaterial({ color: "#3A3D44", roughness: 0.45, clearcoat: 0.4 }))} />
        <mesh geometry={geo("amDial", () => new THREE.CylinderGeometry(0.026, 0.028, 0.012, 32).rotateX(Math.PI / 2))} material={mat("k-dial", () => new THREE.MeshPhysicalMaterial({ color: "#1F2126", roughness: 0.35, clearcoat: 0.6 }))} position={[-0.03, 0, 0.016]} />
        <mesh geometry={geo("amDialMark", () => new THREE.BoxGeometry(0.004, 0.018, 0.002))} material={mat("k-dialMark", () => new THREE.MeshStandardMaterial({ color: "#E9E9E4", roughness: 0.5 }))} position={[-0.03, 0.006, 0.0225]} />
        <mesh geometry={geo("amSocket", () => new THREE.CircleGeometry(0.012, 20))} material={mat("k-portBlack", () => new THREE.MeshBasicMaterial({ color: "#050505" }))} position={[0.045, 0, 0.0102]} />
      </group>
      {sheet && (
        <>
          <mesh geometry={g.sheetSide} material={sheetM} />
          <mesh geometry={g.sheetCap} material={sheetM} />
          <mesh geometry={g.hem} material={sheetM} />
        </>
      )}
      {quilt && <mesh geometry={g.quilt} material={quiltMaterial ?? patchworkQuiltMat({ uvSize: [0.92, 0.42] })} />}
    </group>
  );
};
/** The mattress's top surface height (the sheet) for laying people on it. */
export const AIR_MATTRESS = { w: AM.W, l: AM.L, top: AM.H + 0.003 };
