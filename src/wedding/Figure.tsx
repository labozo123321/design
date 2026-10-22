import React from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Head, type Person } from "../coaster/face/Head";
import { NEUTRAL, type Expr } from "../coaster/face/sculpt";
import { GRIP, Hand, RELAX, type HandPose } from "../coaster/Hand";
import { hash } from "./flight";

/**
 * A person in their wedding clothes, standing or sitting, built at the feet facing -z (x right, y up).
 * One body for everyone: legs, hips, a lathed torso with the outfit painted on it (a suit's shirt V, its
 * tie and lapels and buttons; a dress's neckline with skin above it; the bride's lace), a skirt or a gown
 * for dresses, arms by two-bone IK reaching for targets with hands from the coaster's riders, the neck and
 * the head with its face (sculpt.ts), hats and the bride's veil, and whatever they hold.
 */

export type Outfit = {
  kind: "suit" | "dress" | "gown" | "kidsuit" | "waiter" | "chef" | "tee" | "polo" | "sweater" | "shirt" | "hoodie" | "vest" | "cardigan";
  /** a sculpted torso (shoulders, chest) instead of the round one, for close portraits */
  bust?: boolean;
  /** a 3D collar: a shirt's points, a polo's, a crew neck's rib, a hood */
  collar?: "shirt" | "polo" | "crew" | "hood";
  /** a woman's proportions without a dress */
  female?: boolean;
  /** the shirt's pattern (the vest's shirt, a shirt) */
  pattern?: "plaid" | "stripes";
  /** top buttons undone: how far down the shirt is open (0..1) */
  open?: number;
  /** a thin chain at the neck */
  chain?: string;
  main: string;
  trousers?: string;
  shirt?: string;
  accent?: string;
  tie?: "tie" | "bow" | "none";
  neckline?: "v" | "sweetheart" | "round" | "halter";
  sleeves?: "long" | "short" | "none";
  /** dress hem height above the floor (m at k = 1) */
  hem?: number;
  flare?: number;
  /** the gown's hem radius at the floor (m at k = 1), if not the full ball gown */
  hemR?: number;
  shoe: string;
  heels?: boolean;
  /** lift shoes: a platform this thick (m) under each shoe, the body raised by it */
  lifts?: number;
  hat?: { kind: "wide" | "fascinator" | "toque"; color: string; band?: string };
  pocket?: string;
  boutonniere?: boolean;
};

export type Arm = { at: THREE.Vector3; hand: HandPose; palm?: THREE.Vector3; pole?: THREE.Vector3; /** the hand not drawn (it's somewhere unseen, e.g. under a duvet) */ hidden?: boolean };
export type Prop = "phone" | "bouquet" | "book" | "tray" | "bottle" | "controller" | "spatula" | "ringbox" | null;

export type Pose = {
  sit?: boolean;
  /** a rounded ankle where the shin meets the shoe (lying down, seen end-on from above, the shin's taper
   *  would otherwise show as a point with the shoe beyond it) */
  ankles?: boolean;
  /** feet pointed (radians, plantar flexion about the ankle): a body lying down lets its feet fall toward the
   *  foot of the bed rather than stand straight up */
  pointToes?: number;
  /** torso pitched forward (+) */
  lean?: number;
  /** torso rolled to its right (+) */
  roll?: number;
  /** torso turned (+ to its left) */
  twist?: number;
  /** a world point to look at; else headYaw/headPitch (relative to the body) */
  look?: THREE.Vector3 | null;
  headYaw?: number;
  headPitch?: number;
  headRoll?: number;
  armL?: Arm;
  armR?: Arm;
  e: Expr;
  holdL?: Prop;
  holdR?: Prop;
  /** knees bent (0..1), and the whole body raised (a hop; seated, a higher seat) */
  crouch?: number;
  lift?: number;
  /** seated: where the ankles are (body frame), else on the floor in front */
  feet?: [THREE.Vector3, THREE.Vector3];
};

/* ------------------------------------------------------------------ */
/* Geometry and materials (cached)                                       */
/* ------------------------------------------------------------------ */

const geoCache: Record<string, THREE.BufferGeometry> = {};
const lathe = (key: string, pts: [number, number][], seg = 24) =>
  (geoCache[key] ??= (() => {
    const g = new THREE.LatheGeometry(
      (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    );
    g.computeVertexNormals();
    return g;
  })());
const matCache: Record<string, THREE.Material> = {};
const cloth = (c: string, rough = 0.85, sheen = 0) =>
  (matCache[`c${c}${rough}${sheen}`] ??= new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, sheen, sheenColor: new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.5) }));
const skin = (tone: string) =>
  (matCache[`s${tone}`] ??= new THREE.MeshPhysicalMaterial({ color: tone, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color("#FFB09A") }));
const leather = (c: string) => (matCache[`l${c}`] ??= new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 }));

const along = (d: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize());

// limbs along -y from the joint (adult metres)
const UPPER: [number, number][] = [
  [0.0, 0.03],
  [0.045, 0.015],
  [0.05, 0.0],
  [0.046, -0.1],
  [0.04, -0.22],
  [0.036, -0.29],
  [0.0, -0.3],
];
/** The upper arm for portraits: the deltoid's round cap over the joint, then the arm (adult metres). */
const UPPER_B: [number, number][] = [
  [0.0, 0.042],
  [0.03, 0.036],
  [0.046, 0.02],
  [0.052, -0.008],
  [0.051, -0.05],
  [0.045, -0.12],
  [0.043, -0.19],
  [0.037, -0.28],
  [0.0, -0.3],
];
/** A short sleeve over the portrait upper arm: the cap and the top 40% of the arm, a little loose, hemmed. */
const SLEEVE_B: [number, number][] = [
  [0.0, 0.046],
  [0.034, 0.039],
  [0.051, 0.022],
  [0.058, -0.008],
  [0.056, -0.05],
  [0.052, -0.11],
  [0.05, -0.128],
  [0.0, -0.129],
];
const FORE: [number, number][] = [
  [0.0, 0.02],
  [0.037, 0.0],
  [0.04, -0.06],
  [0.034, -0.16],
  [0.027, -0.25],
  [0.0, -0.27],
];
const THIGH: [number, number][] = [
  [0.0, 0.03],
  [0.085, 0.0],
  [0.084, -0.1],
  [0.072, -0.26],
  [0.058, -0.42],
  [0.0, -0.45],
];
const SHIN: [number, number][] = [
  [0.0, 0.02],
  [0.054, 0.0],
  [0.058, -0.1],
  [0.046, -0.24],
  [0.034, -0.4],
  [0.0, -0.43],
];
const TORSO: [number, number][] = [
  [0.0, -0.03],
  [0.155, -0.03],
  [0.16, 0.06],
  [0.148, 0.18],
  [0.16, 0.32],
  [0.178, 0.42],
  [0.182, 0.48],
  [0.16, 0.53],
  [0.1, 0.565],
  [0.055, 0.575],
  [0.0, 0.58],
];

/** A sculpted torso for close portraits: the waist, the chest, the shoulders' top edge, and the trapezius
 * sloping up to the neck (the arms' deltoids round the shoulders off). Same frame and UV layout as the lathe
 * torso (u round from the back, v up the profile), but in true depth (no squash). */
type Ring = { y: number; X: number; Zf: number; Zb: number; n: number };
const BUST_TOP = 0.58;
const bustRings = (female: boolean): Ring[] =>
  (
    [
      // y, half-width, front depth, back depth, squareness
      [-0.03, 0.15, 0.1, 0.098, 2.6],
      [0.06, 0.15, 0.102, 0.1, 2.5],
      [0.18, 0.14, 0.097, 0.095, 2.45],
      [0.3, 0.154, female ? 0.112 : 0.11, 0.1, 2.5],
      [0.38, 0.166, female ? 0.132 : 0.12, 0.105, 2.6],
      [0.43, 0.176, female ? 0.124 : 0.117, 0.104, 2.7],
      [0.46, 0.184, 0.108, 0.1, 2.75],
      [0.478, 0.182, 0.098, 0.094, 2.5],
      [0.49, 0.172, 0.088, 0.088, 2.35],
      [0.5, 0.156, 0.082, 0.084, 2.3],
      [0.512, 0.138, 0.076, 0.08, 2.4],
      [0.524, 0.116, 0.071, 0.075, 2.3],
      [0.536, 0.096, 0.066, 0.07, 2.2],
      [0.548, 0.08, 0.062, 0.065, 2.1],
      [0.56, 0.068, 0.058, 0.06, 2.05],
      [0.572, 0.062, 0.056, 0.057, 2.0],
      [BUST_TOP, 0.06, 0.055, 0.056, 2.0],
    ] as [number, number, number, number, number][]
  ).map(([y, X, Zf, Zb, n]) => ({ y, X, Zf, Zb, n }));

const pw = (a: number, e: number) => Math.sign(a) * Math.pow(Math.abs(a), e);
const ringPoint = (r: Ring, th: number, out: THREE.Vector3) => {
  const sx = Math.sin(th);
  const cz = Math.cos(th);
  return out.set(r.X * pw(sx, 2 / r.n), r.y, (cz > 0 ? r.Zb : r.Zf) * pw(cz, 2 / r.n));
};
const ringAt = (rings: Ring[], y: number): Ring => {
  if (y <= rings[0].y) return rings[0];
  for (let j = 1; j < rings.length; j++) {
    if (y <= rings[j].y) {
      const a = rings[j - 1];
      const b = rings[j];
      const f = (y - a.y) / (b.y - a.y);
      return { y, X: a.X + (b.X - a.X) * f, Zf: a.Zf + (b.Zf - a.Zf) * f, Zb: a.Zb + (b.Zb - a.Zb) * f, n: a.n + (b.n - a.n) * f };
    }
  }
  return { ...rings[rings.length - 1], y };
};

/** The portrait neck (a lathe, k = 1, from the neck base): it flares into the shoulders and runs up into
 * the head. */
const NECK: [number, number][] = [
  [0.0, -0.07],
  [0.066, -0.06],
  [0.062, -0.035],
  [0.0575, -0.01],
  [0.0545, 0.02],
  [0.052, 0.05],
  [0.05, 0.08],
  [0.0, 0.095],
];
const neckR = (y: number) => {
  if (y <= NECK[0][1]) return 0;
  for (let j = 1; j < NECK.length; j++) {
    if (y <= NECK[j][1]) {
      const [ra, ya] = NECK[j - 1];
      const [rb, yb] = NECK[j];
      return ra + ((rb - ra) * (y - ya)) / (yb - ya);
    }
  }
  return 0.05;
};
const NECK_Z = 0.004; // the neck's axis, a little behind the shoulders' centre
const NECK_SQ = 0.95; // its depth over its width

/** A point on the outside of the body (bust or neck, whichever is further out) at angle th round it (0: the
 * middle of the back, pi: the front; +x is the body's right) and height y in the torso frame (k = 1), pushed
 * out along the surface by off. */
const bodySurface = (female: boolean, th: number, y: number, off: number, out = new THREE.Vector3()) => {
  const rings = bustRings(female);
  const b = ringPoint(ringAt(rings, Math.min(y, BUST_TOP)), th, new THREE.Vector3());
  const rB = y <= BUST_TOP ? Math.hypot(b.x, b.z) : 0;
  const nr = neckR(y - 0.575);
  const n = new THREE.Vector3(Math.sin(th) * nr, y, Math.cos(th) * nr * NECK_SQ + NECK_Z);
  const rN = Math.hypot(n.x, n.z);
  const p = rB >= rN ? b : n;
  // outward: radial in the ring's plane, tipped up where the surface slopes (the shoulders' top)
  const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
  if (rB >= rN && y > 0.47) {
    const up = ringPoint(ringAt(rings, Math.min(BUST_TOP, y + 0.006)), th, new THREE.Vector3());
    const dn = ringPoint(ringAt(rings, y - 0.006), th, new THREE.Vector3());
    const dr = Math.hypot(up.x, up.z) - Math.hypot(dn.x, dn.z);
    dir.multiplyScalar(0.012).add(new THREE.Vector3(0, -dr, 0)).normalize();
  }
  return out.copy(p).addScaledVector(dir, off);
};

/** From height y0 at angle th, down the body's surface a distance len (along it): the point there. */
const downBody = (female: boolean, th: number, y0: number, len: number, off: number) => {
  let y = y0;
  let prev = bodySurface(female, th, y, 0);
  let dist = 0;
  while (dist < len && y > -0.02) {
    y -= 0.001;
    const p = bodySurface(female, th, y, 0);
    dist += p.distanceTo(prev);
    prev = p;
  }
  return bodySurface(female, th, y, off);
};

const bustGeometry = (female: boolean) =>
  (geoCache[`bust2${female}`] ??= (() => {
    const SEG = 72;
    const rings = bustRings(female);
    // v from height, the lathe torso's profile points evenly spaced in v
    const ys = TORSO.map(([, y]) => y);
    const vOf = (y: number) => {
      for (let j = 1; j < ys.length; j++) {
        if (y <= ys[j] || j === ys.length - 1) {
          const a = ys[j - 1];
          const b = ys[j];
          const f = b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0;
          return (j - 1 + f) / (ys.length - 1);
        }
      }
      return 1;
    };
    // denser rings: interpolate between the profile's
    const fine: Ring[] = [];
    for (let j = 0; j < rings.length - 1; j++) {
      const steps = rings[j + 1].y - rings[j].y > 0.05 ? 4 : 2;
      for (let s = 0; s < steps; s++) fine.push(ringAt(rings, rings[j].y + ((rings[j + 1].y - rings[j].y) * s) / steps));
    }
    fine.push(rings[rings.length - 1]);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const p = new THREE.Vector3();
    fine.forEach((r) => {
      for (let i = 0; i <= SEG; i++) {
        ringPoint(r, (i / SEG) * Math.PI * 2, p);
        pos.push(p.x, p.y, p.z);
        uv.push(i / SEG, vOf(r.y));
      }
    });
    const ring = SEG + 1;
    for (let j = 0; j < fine.length - 1; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * ring + i;
        const b = a + ring;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    // caps: the bottom and the top (inside the neck)
    const bot = pos.length / 3;
    pos.push(0, -0.03, 0);
    uv.push(0.5, 0);
    const top = pos.length / 3;
    pos.push(0, BUST_TOP, 0);
    uv.push(0.5, 1);
    const last = (fine.length - 1) * ring;
    for (let i = 0; i < SEG; i++) {
      idx.push(bot, i + 1, i);
      idx.push(top, last + i, last + i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })());

/** A surface over the body from a grid of points (rows x cols), both sides shaded. */
const gridGeometry = (pts: THREE.Vector3[][]) => {
  const rows = pts.length;
  const cols = pts[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pos.push(pts[i][j].x, pts[i][j].y, pts[i][j].z);
      uv.push(j / (cols - 1), i / (rows - 1));
    }
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/** A tube along a closed or open line of points (k = 1). */
const lineTube = (pts: THREE.Vector3[], r: number, closed: boolean, seg = 64, rad = 8) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, "centripetal"), seg, r, rad, closed);

/** The neckline's height round the body: lower at the front. */
const necklineY = (th: number, front: number, back: number) => back + (front - back) * (0.5 - 0.5 * Math.cos(th));

/** A shirt's or a polo's collar: the band round the neck, open at the front, and its two points folded down
 * over it onto the shoulders and the chest. open (0..1) spreads them. */
const shirtCollarGeometry = (female: boolean, polo: boolean, open: number) =>
  (geoCache[`collar2${female}${polo}${open}`] ??= (() => {
    const parts: THREE.BufferGeometry[] = [];
    const gap = 0.16 + 0.32 * open; // half the opening at the front (radians from the front)
    const bandH = polo ? 0.022 : 0.026;
    const yb = (th: number) => necklineY(th, 0.543 - 0.012 * open, 0.566);
    // the band: inside the points, from one side of the opening round the back to the other
    {
      const rows: THREE.Vector3[][] = [];
      for (let i = 0; i <= 2; i++) {
        const row: THREE.Vector3[] = [];
        for (let j = 0; j <= 48; j++) {
          const th = Math.PI + gap + (j / 48) * (Math.PI * 2 - 2 * gap);
          row.push(bodySurface(female, th, yb(th) - 0.008 + (i / 2) * (bandH + 0.008), 0.003));
        }
        rows.push(row);
      }
      parts.push(gridGeometry(rows));
    }
    // the points: from the fold (the band's top) out and down onto the body, longest at the front tip
    for (const side of [-1, 1]) {
      const rows: THREE.Vector3[][] = [];
      const NS = 22;
      const NT = 7;
      for (let i = 0; i <= NS; i++) {
        const s = i / NS; // 0 the front tip .. 1 the middle of the back
        const thF = Math.PI + side * (gap + (Math.PI - gap) * s);
        const yTop = yb(thF) + bandH;
        const fold = bodySurface(female, thF, yTop, 0.0055);
        // the outer edge: a collar's width along the body from the fold (longest at the front, the point),
        // spread out a little toward the shoulder
        const width = (polo ? 0.036 : 0.04) + (polo ? 0.014 : 0.03) * Math.pow(1 - s, 1.6) * (1 - 0.3 * open);
        const thO = thF + side * (0.1 + 0.25 * open) * (1 - s) * (1 - s) - side * (polo ? 0.0 : 0.06) * Math.pow(1 - s, 6);
        const edge = downBody(female, thO, yTop, width, 0.0042 + 0.0035 * (1 - s) * open);
        const roll = fold.clone().lerp(edge, 0.3).add(fold.clone().sub(new THREE.Vector3(0, fold.y, NECK_Z)).setY(0).normalize().multiplyScalar(0.007));
        const row: THREE.Vector3[] = [];
        for (let j = 0; j <= NT; j++) {
          const t = j / NT;
          // a quadratic from the fold over the roll to the edge
          const a = fold.clone().multiplyScalar((1 - t) * (1 - t));
          a.addScaledVector(roll, 2 * t * (1 - t)).addScaledVector(edge, t * t);
          row.push(a);
        }
        rows.push(row);
      }
      parts.push(gridGeometry(rows));
    }
    return mergeGeos(parts);
  })());

const mergeGeos = (gs: THREE.BufferGeometry[]) => {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g0 of gs) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
};

/** A crew neck's ribbed band, a hood bunched at the back with its strings, a chain on the skin. */
const crewGeometry = (female: boolean, front: number, back: number, r: number) =>
  (geoCache[`crew${female}${front}${back}${r}`] ??= (() => {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < 48; j++) {
      const th = (j / 48) * Math.PI * 2;
      pts.push(bodySurface(female, th, necklineY(th, front, back), r * 0.75));
    }
    return lineTube(pts, r, true, 96, 10);
  })());

const hoodGeometry = (female: boolean) =>
  (geoCache[`hood${female}`] ??= (() => {
    // the hood: a soft fold of cloth lying on the upper back, open round the neck
    const rows: THREE.Vector3[][] = [];
    const NS = 28;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10; // 0 at the neckline .. 1 the hood's far edge down the back
      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= NS; j++) {
        const s = j / NS;
        const th = -1.25 + 2.5 * s; // round the back, between the shoulders
        const across = Math.sin(Math.PI * s);
        const y0 = necklineY(th, 0.548, 0.566);
        const y = y0 + 0.01 - t * (0.02 + 0.15 * across);
        const lift = 0.005 + 0.032 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * across * across + 0.003 * Math.sin(s * 23 + t * 5);
        row.push(bodySurface(female, th, y, lift));
      }
      rows.push(row);
    }
    return gridGeometry(rows);
  })());

const chainGeometry = (female: boolean) =>
  (geoCache[`chain${female}`] ??= (() => {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < 40; j++) {
      const th = (j / 40) * Math.PI * 2;
      const f = 0.5 - 0.5 * Math.cos(th);
      pts.push(bodySurface(female, th, 0.562 - 0.075 * Math.pow(f, 3), 0.0035));
    }
    return lineTube(pts, 0.0017, true, 160, 6);
  })());

const Collar: React.FC<{ o: Outfit; at: THREE.Vector3; q: THREE.Quaternion; k: number; female: boolean }> = ({ o, at, q, k, female }) => {
  const kind = o.collar;
  const scale: [number, number, number] = [k * (female ? 0.94 : 1), k, k];
  const shirtCol = o.kind === "shirt" || o.kind === "polo" ? o.main : o.shirt ?? "#FFFFFF";
  const flapMat = (matCache[`flap${shirtCol}`] ??= new THREE.MeshPhysicalMaterial({ color: shirtCol, roughness: 0.78, sheen: 0.25, sheenColor: new THREE.Color(shirtCol).lerp(new THREE.Color("#FFFFFF"), 0.4), side: THREE.DoubleSide }));
  const out: React.ReactNode[] = [];
  if (kind === "shirt" || kind === "polo") out.push(<mesh key="collar" geometry={shirtCollarGeometry(female, kind === "polo", o.open ?? 0)} material={flapMat} castShadow receiveShadow />);
  if (o.kind === "sweater" || kind === "crew") {
    const col = o.kind === "cardigan" ? o.shirt ?? "#FFFFFF" : o.main;
    out.push(<mesh key="crew" geometry={crewGeometry(female, 0.545, 0.566, o.kind === "sweater" ? 0.006 : 0.0042)} material={cloth(col, 0.92)} castShadow />);
  }
  if (kind === "hood") {
    out.push(<mesh key="hood" geometry={hoodGeometry(female)} material={(matCache[`hood${o.main}`] ??= new THREE.MeshPhysicalMaterial({ color: o.main, roughness: 0.92, sheen: 0.3, sheenColor: new THREE.Color(o.main).lerp(new THREE.Color("#FFFFFF"), 0.4), side: THREE.DoubleSide }))} castShadow receiveShadow />);
    out.push(<mesh key="rim" geometry={crewGeometry(female, 0.548, 0.566, 0.009)} material={cloth(o.main, 0.92)} castShadow />);
    // the drawstrings, from the neckline down the chest, with their tips
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 6; i++) {
        const y = 0.55 - (i / 6) * 0.15;
        pts.push(bodySurface(female, Math.PI + side * (0.24 - 0.05 * (i / 6)), y, 0.009 + 0.004 * Math.sin((i / 6) * Math.PI)));
      }
      out.push(<mesh key={`str${side}`} geometry={(geoCache[`str${side}${female}`] ??= lineTube(pts, 0.0028, false, 24, 6))} material={cloth("#F2EEE6", 0.8)} />);
      out.push(
        <mesh key={`tip${side}`} position={pts[6]} material={(matCache.aglet ??= new THREE.MeshStandardMaterial({ color: "#C8CCD2", metalness: 1, roughness: 0.3 }))}>
          <cylinderGeometry args={[0.003, 0.003, 0.02, 8]} />
        </mesh>,
      );
    }
  }
  if (o.chain) out.push(<mesh key="chain" geometry={chainGeometry(female)} material={(matCache[`chain${o.chain}`] ??= new THREE.MeshStandardMaterial({ color: o.chain, metalness: 1, roughness: 0.22 }))} />);
  if (o.tie === "tie" && kind === "shirt") {
    // the tie's knot under the collar's points
    out.push(
      <mesh key="knot" position={bodySurface(female, Math.PI, 0.553, 0.012)} rotation={[0.25, 0, 0]} material={cloth(o.accent ?? "#B8323A", 0.6, 0.3)} scale={[0.017, 0.022, 0.011]}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>,
    );
  }
  return (
    <group position={at} quaternion={q} scale={scale}>
      {out}
    </group>
  );
};

const ik = (S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) => {
  const d0 = T.clone().sub(S);
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d0.length()));
  const dir = d0.normalize();
  const W = S.clone().addScaledVector(dir, d);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
  return { E, W };
};

const Limb: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; geo: THREE.BufferGeometry; len: number; mat: THREE.Material; k: number; thick?: number }> = ({
  a,
  b,
  geo,
  len,
  mat,
  k,
  thick = 1,
}) => {
  const d = b.clone().sub(a);
  return <mesh geometry={geo} material={mat} position={a} quaternion={along(d)} scale={[k * thick, d.length() / len, k * thick]} castShadow />;
};

/* ------------------------------------------------------------------ */
/* The outfit painted on the torso (lathe uv: u round from the back, v up)                        */
/* ------------------------------------------------------------------ */

const torsoTexCache: Record<string, THREE.Texture> = {};
const torsoTexture = (o: Outfit, tone: string) => {
  const key = `${JSON.stringify(o)}${tone}`;
  if (torsoTexCache[key]) return torsoTexCache[key];
  const W = 512;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const X = (u: number) => u * W;
  const Y = (v: number) => (1 - v) * H;
  // fabric base with a faint weave
  g.fillStyle = o.kind === "chef" ? "#F6F4EE" : o.kind === "waiter" ? o.shirt ?? "#FFFFFF" : o.main;
  g.fillRect(0, 0, W, H);
  // a woven pattern over the base: plaid (the photographer's shirt), stripes
  const paintPattern = (col: string, x0: number, x1: number) => {
    if (o.pattern === "plaid") {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = i % 4 === 0 ? "rgba(30,30,40,0.28)" : i % 4 === 2 ? "rgba(255,255,255,0.14)" : "rgba(120,30,30,0.12)";
        g.fillRect(x0, (i * H) / 40, x1 - x0, H / 80);
        g.fillRect(x0 + ((i * (x1 - x0)) / 40) % (x1 - x0), 0, (x1 - x0) / 80, H);
      }
    } else if (o.pattern === "stripes") {
      for (let i = 0; i < 64; i++) {
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x0, (i * H) / 64, x1 - x0, H / 160);
      }
    }
    void col;
  };
  if (o.kind === "sweater" || o.kind === "cardigan" || o.kind === "hoodie") {
    // knit: fine vertical ribs
    for (let i = 0; i < 256; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + 0.03 * (i % 2)})`;
      g.fillRect((i * W) / 256, 0, 1, H);
    }
  }
  if (o.kind === "shirt" || o.kind === "polo") paintPattern(o.main, 0, W);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${hash(i) > 0.5 ? "255,255,255" : "0,0,0"},${0.025 + hash(i * 3.1) * 0.03})`;
    g.fillRect(hash(i * 7.7) * W, hash(i * 1.3) * H, 1 + hash(i * 5.1) * 3, 1);
  }
  const front = 0.5;
  const tri = (pts: [number, number][], col: string) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.closePath();
    g.fill();
  };
  if (o.kind === "suit" || o.kind === "kidsuit" || o.kind === "waiter") {
    const vest = o.kind === "waiter";
    const jacket = o.main;
    if (vest) {
      // a black waistcoat over the white shirt (the shirt shows on the sides and back above the waist)
      g.fillStyle = jacket;
      g.fillRect(X(front - 0.2), Y(0.86), X(0.4), H);
    }
    // the shirt's V, from the collar to the top button
    const vBottom = vest ? 0.5 : 0.4;
    tri(
      [
        [front - 0.075, 1.0],
        [front + 0.075, 1.0],
        [front + 0.012, vBottom],
        [front - 0.012, vBottom],
      ],
      o.shirt ?? "#FFFFFF",
    );
    // lapels: darker edges along the V
    if (!vest) {
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(X(front - 0.075), Y(1.0));
      g.lineTo(X(front - 0.012), Y(vBottom));
      g.lineTo(X(front + 0.012), Y(vBottom));
      g.lineTo(X(front + 0.075), Y(1.0));
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X(front - 0.1), Y(0.97));
      g.lineTo(X(front - 0.03), Y(vBottom + 0.05));
      g.moveTo(X(front + 0.1), Y(0.97));
      g.lineTo(X(front + 0.03), Y(vBottom + 0.05));
      g.stroke();
    }
    // the tie, or a bow at the collar
    if (o.tie === "tie") {
      tri(
        [
          [front - 0.012, 0.96],
          [front + 0.012, 0.96],
          [front + 0.016, vBottom + 0.02],
          [front, vBottom - 0.01],
          [front - 0.016, vBottom + 0.02],
        ],
        o.accent ?? "#3B4A7A",
      );
    } else if (o.tie === "bow") {
      tri(
        [
          [front - 0.04, 0.985],
          [front - 0.04, 0.925],
          [front, 0.955],
        ],
        o.accent ?? "#111111",
      );
      tri(
        [
          [front + 0.04, 0.985],
          [front + 0.04, 0.925],
          [front, 0.955],
        ],
        o.accent ?? "#111111",
      );
    }
    // buttons and a pocket square
    g.fillStyle = "rgba(0,0,0,0.5)";
    for (const v of vest ? [0.46, 0.36, 0.26, 0.16] : [vBottom - 0.04, vBottom - 0.15]) {
      g.beginPath();
      g.arc(X(front), Y(v), 4, 0, Math.PI * 2);
      g.fill();
    }
    if (o.pocket && !vest) {
      tri(
        [
          [front - 0.13, 0.78],
          [front - 0.085, 0.78],
          [front - 0.095, 0.82],
          [front - 0.12, 0.83],
        ],
        o.pocket,
      );
    }
  } else if (o.kind === "dress" || o.kind === "gown") {
    // skin above the neckline (and on the back, low), the bodice below it
    const nl = o.neckline ?? "v";
    g.fillStyle = tone;
    if (nl === "v") {
      tri(
        [
          [front - 0.09, 1.0],
          [front + 0.09, 1.0],
          [front, 0.68],
        ],
        tone,
      );
    } else if (nl === "sweetheart") {
      g.beginPath();
      g.moveTo(X(front - 0.2), Y(1.0));
      g.lineTo(X(front - 0.2), Y(0.8));
      g.quadraticCurveTo(X(front - 0.1), Y(0.86), X(front), Y(0.76));
      g.quadraticCurveTo(X(front + 0.1), Y(0.86), X(front + 0.2), Y(0.8));
      g.lineTo(X(front + 0.2), Y(1.0));
      g.closePath();
      g.fill();
      // bare back too
      g.fillRect(X(0), Y(1.0), X(0.25), H * 0.2);
      g.fillRect(X(0.75), Y(1.0), X(0.25), H * 0.2);
    } else if (nl === "round") {
      g.beginPath();
      g.ellipse(X(front), Y(1.0), X(0.08), H * 0.12, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      // halter: bare shoulders and arms, a band round the neck
      g.fillRect(0, 0, W, H * 0.16);
      tri(
        [
          [front - 0.1, 0.84],
          [front + 0.1, 0.84],
          [front + 0.03, 1.0],
          [front - 0.03, 1.0],
        ],
        o.main,
      );
    }
    if (o.kind === "gown") {
      // lace: little rosettes and scallops over the bodice
      g.strokeStyle = "rgba(160,150,140,0.35)";
      g.lineWidth = 1.5;
      for (let i = 0; i < 360; i++) {
        const u = hash(i * 2.3);
        const v = hash(i * 7.1) * 0.75;
        g.beginPath();
        g.arc(X(u), Y(v), 3 + hash(i) * 5, 0, Math.PI * 2);
        g.stroke();
      }
      // a satin sash at the waist
      g.fillStyle = o.accent ?? "#E8D8C8";
      g.fillRect(0, Y(0.2), W, H * 0.06);
    } else if (o.accent) {
      g.fillStyle = o.accent;
      g.fillRect(0, Y(0.16), W, H * 0.04);
    }
  } else if (o.kind === "chef") {
    // double-breasted buttons
    g.fillStyle = "#2A2A2A";
    for (const v of [0.82, 0.66, 0.5, 0.34])
      for (const du of [-0.05, 0.05]) {
        g.beginPath();
        g.arc(X(front + du), Y(v), 5, 0, Math.PI * 2);
        g.fill();
      }
  } else if (o.kind === "tee") {
    tri(
      [
        [front - 0.06, 1.0],
        [front + 0.06, 1.0],
        [front, 0.9],
      ],
      tone,
    );
  } else if (o.kind === "polo") {
    // the placket: a band down from the collar with two buttons, open at the top
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(X(front - 0.018), Y(1.0), 2, H * 0.17);
    g.fillRect(X(front + 0.018), Y(1.0), 2, H * 0.17);
    g.fillRect(X(front - 0.018), Y(0.83), X(0.036), 2);
    tri(
      [
        [front - 0.014, 1.0],
        [front + 0.014, 1.0],
        [front + 0.01, 0.94],
        [front - 0.01, 0.94],
      ],
      tone,
    );
    g.fillStyle = "rgba(240,240,240,0.9)";
    for (const v of [0.9, 0.86]) {
      g.beginPath();
      g.arc(X(front), Y(v), 4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (o.kind === "shirt") {
    // a button-up: the placket's edge and buttons all the way down; open at the top for some
    const openTo = 1.0 - 0.12 * (o.open ?? 0);
    if ((o.open ?? 0) > 0) {
      tri(
        [
          [front - 0.03 * (o.open ?? 0), 1.0],
          [front + 0.03 * (o.open ?? 0), 1.0],
          [front, openTo],
        ],
        tone,
      );
    }
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(X(front + 0.012), Y(openTo), 2, H * openTo);
    g.fillStyle = "rgba(250,250,250,0.95)";
    for (let v = openTo - 0.04; v > 0.05; v -= 0.11) {
      g.beginPath();
      g.arc(X(front + 0.004), Y(v), 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1;
      g.stroke();
    }
  } else if (o.kind === "sweater") {
    // the crew neck's rib and the shirt's collar showing inside it
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(0, Y(1.0), W, H * 0.045);
    tri(
      [
        [front - 0.03, 1.0],
        [front + 0.03, 1.0],
        [front, 0.965],
      ],
      o.shirt ?? "#FFFFFF",
    );
    // the hem's rib
    g.fillStyle = "rgba(0,0,0,0.14)";
    g.fillRect(0, Y(0.08), W, H * 0.08);
  } else if (o.kind === "hoodie") {
    // the kangaroo pocket, the drawstrings
    g.strokeStyle = "rgba(0,0,0,0.3)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(X(front - 0.14), Y(0.08));
    g.lineTo(X(front - 0.1), Y(0.36));
    g.lineTo(X(front + 0.1), Y(0.36));
    g.lineTo(X(front + 0.14), Y(0.08));
    g.stroke();
    g.fillStyle = "rgba(240,240,240,0.9)";
    g.fillRect(X(front - 0.03), Y(0.99), 3, H * 0.2);
    g.fillRect(X(front + 0.03), Y(0.99), 3, H * 0.22);
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(0, Y(0.08), W, H * 0.08);
  } else if (o.kind === "vest" || o.kind === "cardigan") {
    // a shirt (or top) down the middle of the front; the vest's or cardigan's panels either side
    const shirtW = o.kind === "vest" ? 0.06 : 0.05;
    g.fillStyle = o.shirt ?? "#D8D0C0";
    g.fillRect(X(front - shirtW), 0, X(shirtW * 2), H);
    if (o.pattern) {
      // the plaid shows only on the shirt
      paintPattern(o.shirt ?? "#D8D0C0", X(front - shirtW), X(front + shirtW));
    }
    tri(
      [
        [front - shirtW - 0.03, 1.0],
        [front - shirtW, 0.35],
        [front - shirtW + 0.004, 1.0],
      ],
      o.shirt ?? "#D8D0C0",
    );
    tri(
      [
        [front + shirtW + 0.03, 1.0],
        [front + shirtW, 0.35],
        [front + shirtW - 0.004, 1.0],
      ],
      o.shirt ?? "#D8D0C0",
    );
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(X(front - shirtW), 0, 2, H);
    g.fillRect(X(front + shirtW), 0, 2, H);
    if (o.kind === "vest") {
      // the photographer's pockets: flapped boxes on the chest and lower down
      for (const [du, v, w, h] of [
        [-0.13, 0.74, 0.07, 0.12],
        [0.13, 0.74, 0.07, 0.12],
        [-0.12, 0.38, 0.09, 0.16],
        [0.12, 0.38, 0.09, 0.16],
      ] as const) {
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.fillRect(X(front + du - w / 2), Y(v), X(w), H * h);
        g.strokeStyle = "rgba(0,0,0,0.35)";
        g.lineWidth = 2;
        g.strokeRect(X(front + du - w / 2), Y(v), X(w), H * h);
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.fillRect(X(front + du - w / 2), Y(v), X(w), H * 0.03);
      }
    } else {
      g.fillStyle = "rgba(255,255,255,0.85)";
      for (let v = 0.9; v > 0.1; v -= 0.12) {
        g.beginPath();
        g.arc(X(front - shirtW - 0.008), Y(v), 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  torsoTexCache[key] = t;
  return t;
};

const torsoMaterial = (o: Outfit, tone: string) =>
  (matCache[`t${JSON.stringify(o)}${tone}`] ??= new THREE.MeshPhysicalMaterial({
    map: torsoTexture(o, tone),
    roughness: o.kind === "gown" ? 0.55 : 0.8,
    sheen: o.kind === "gown" || o.kind === "dress" ? 0.6 : 0.2,
    sheenColor: new THREE.Color("#ffffff"),
  }));

/** A skirt: from the waist (r0) down to the hem (r1), with soft folds; the gown's has a train behind. */
const skirtGeometry = (key: string, len: number, r0: number, r1: number, folds: number, train: number) =>
  (geoCache[`sk${key}`] ??= (() => {
    const prof: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const r = r0 + (r1 - r0) * Math.pow(u, 0.75);
      prof.push([r, -u * len]);
    }
    prof.push([0.0, -len]);
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 64);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const u = -y / len;
      const a = Math.atan2(z, x);
      const f = 1 + folds * u * Math.sin(a * 11 + Math.sin(a * 3) * 1.5);
      let zz = z * f;
      // the train: the back (+z) of the hem drawn out along the floor
      if (train > 0 && z > 0) zz += train * Math.pow(u, 3) * (z / Math.max(1e-3, Math.hypot(x, z)));
      p.setXYZ(i, x * f, y, zz);
    }
    g.computeVertexNormals();
    return g;
  })());

/* ------------------------------------------------------------------ */
/* The bride's veil                                                      */
/* ------------------------------------------------------------------ */

const veilCache: Record<string, THREE.BufferGeometry> = {};
/** Tulle from under her bun down her back to the waist, in the torso's frame (hips at the origin, her back
 * toward +z): narrow at the top, wider below, curving round her back, with soft folds. */
const veilGeometry = (k: number) =>
  (veilCache[k] ??= (() => {
    const g = new THREE.PlaneGeometry(1, 1, 16, 22);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i) * 2; // -1..1 across
      const u = 0.5 - p.getY(i); // 0 at the top .. 1 at the bottom
      const w = (0.16 + 0.39 * u) * k;
      const z = (0.08 + 0.12 * Math.sqrt(u)) * k - 0.06 * sx * sx * u * k + 0.008 * Math.sin(sx * 9 + u * 4) * u;
      p.setXYZ(i, (sx * w) / 2, (0.77 - 0.65 * u) * k, z);
    }
    g.computeVertexNormals();
    return g;
  })());
const veilMaterial = () =>
  (matCache.veil ??= new THREE.MeshPhysicalMaterial({ color: "#FFFFFF", roughness: 0.6, sheen: 1, sheenColor: new THREE.Color("#FFFFFF"), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));

/* ------------------------------------------------------------------ */
/* Props                                                                 */
/* ------------------------------------------------------------------ */

const PropMesh: React.FC<{ kind: Prop; k: number; t: number }> = ({ kind, k, t }) => {
  if (kind === "phone")
    return (
      <group position={[0, -0.075 * k, 0.012]}>
        <mesh material={leather("#111114")}>
          <boxGeometry args={[0.072 * k, 0.15 * k, 0.009]} />
        </mesh>
        <mesh position={[0, 0, -0.0052]} material={matCache.screen ?? (matCache.screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.19, 0.24) }))}>
          <planeGeometry args={[0.066 * k, 0.142 * k]} />
        </mesh>
      </group>
    );
  if (kind === "book")
    return (
      <group position={[0, -0.09 * k, 0.03]} rotation={[0.3, 0, 0]}>
        <mesh material={leather("#3A1F14")}>
          <boxGeometry args={[0.16 * k, 0.22 * k, 0.025]} />
        </mesh>
        <mesh position={[0, 0, -0.013]} material={cloth("#F4EFE2", 0.9)}>
          <boxGeometry args={[0.15 * k, 0.21 * k, 0.002]} />
        </mesh>
      </group>
    );
  if (kind === "bottle")
    return (
      <group position={[0, -0.12 * k, 0.03]} rotation={[0, 0, 0]}>
        <mesh material={matCache.bottle ?? (matCache.bottle = new THREE.MeshPhysicalMaterial({ color: "#1C3A1E", roughness: 0.1, clearcoat: 1 }))}>
          <cylinderGeometry args={[0.036, 0.04, 0.24, 18]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} material={matCache.foil ?? (matCache.foil = new THREE.MeshStandardMaterial({ color: "#C9A55A", metalness: 1, roughness: 0.3 }))}>
          <cylinderGeometry args={[0.014, 0.034, 0.12, 14]} />
        </mesh>
      </group>
    );
  if (kind === "controller")
    return (
      <group position={[0, -0.03 * k, -0.04]}>
        <mesh material={matCache.ctl ?? (matCache.ctl = new THREE.MeshStandardMaterial({ color: "#2D2F33", roughness: 0.5 }))}>
          <boxGeometry args={[0.2, 0.035, 0.1]} />
        </mesh>
        {/* sticks, and a phone clamped on top as its screen */}
        {[-0.055, 0.055].map((x) => (
          <mesh key={x} position={[x, 0.025, 0.0]} material={leather("#111")}>
            <cylinderGeometry args={[0.008, 0.008, 0.02, 10]} />
          </mesh>
        ))}
        <mesh position={[0, 0.05, -0.04]} rotation={[-1.1, 0, 0]} material={leather("#111114")}>
          <boxGeometry args={[0.16, 0.08, 0.008]} />
        </mesh>
        <mesh position={[0, 0.05, -0.044]} rotation={[-1.1 + Math.PI, 0, 0]} material={matCache.ctlScreen ?? (matCache.ctlScreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.62, 0.55) }))}>
          <planeGeometry args={[0.15, 0.072]} />
        </mesh>
      </group>
    );
  if (kind === "tray") {
    // a silver tray on the upturned palm (the hand's +z), three flutes of champagne on it
    const silver = matCache.silver ?? (matCache.silver = new THREE.MeshStandardMaterial({ color: "#D9DBDF", metalness: 1, roughness: 0.22 }));
    const glass = matCache.flute ?? (matCache.flute = new THREE.MeshPhysicalMaterial({ color: "#F4F6F8", roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
    const fizz = matCache.fizz ?? (matCache.fizz = new THREE.MeshStandardMaterial({ color: "#E8C878", roughness: 0.2, emissive: "#3A2A08", transparent: true, opacity: 0.85 }));
    return (
      <group position={[0, -0.07 * k, 0.018]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh material={silver} castShadow>
          <cylinderGeometry args={[0.17, 0.165, 0.008, 40]} />
        </mesh>
        <mesh material={silver} position={[0, 0.006, 0]}>
          <torusGeometry args={[0.168, 0.004, 6, 40]} />
        </mesh>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          return (
            <group key={i} position={[Math.cos(a) * 0.08, 0.004, Math.sin(a) * 0.08]}>
              <mesh material={glass} position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.003, 0.003, 0.1, 6]} />
              </mesh>
              <mesh material={glass} position={[0, 0.003, 0]}>
                <cylinderGeometry args={[0.028, 0.03, 0.004, 16]} />
              </mesh>
              <mesh material={glass} position={[0, 0.145, 0]}>
                <cylinderGeometry args={[0.027, 0.02, 0.1, 16, 1, true]} />
              </mesh>
              <mesh material={fizz} position={[0, 0.13, 0]}>
                <cylinderGeometry args={[0.024, 0.019, 0.07, 14]} />
              </mesh>
            </group>
          );
        })}
      </group>
    );
  }
  if (kind === "spatula")
    return (
      <group position={[0, -0.08 * k, 0]}>
        <mesh material={leather("#3A2A1E")}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
        </mesh>
        <mesh position={[0, -0.13, 0]} material={matCache.steel ?? (matCache.steel = new THREE.MeshStandardMaterial({ color: "#C8CACE", metalness: 1, roughness: 0.25 }))}>
          <boxGeometry args={[0.03, 0.14, 0.002]} />
        </mesh>
      </group>
    );
  void t;
  return null;
};

/* ------------------------------------------------------------------ */
/* The figure                                                            */
/* ------------------------------------------------------------------ */

export const Figure: React.FC<{
  who: Person;
  outfit: Outfit;
  k?: number;
  /** extra neck length (m) */
  eyeLift?: number;
  pose: Pose;
  /** world placement: feet position and body yaw (0 faces -z) */
  at: THREE.Vector3;
  yaw: number;
  t: number;
  hi?: boolean;
  /** extra things in the body's frame (props on the floor, the veil...) */
  children?: React.ReactNode;
  /** the hat has blown off (it is drawn elsewhere) */
  noHat?: boolean;
  chains?: THREE.Vector3[][];
  headExtra?: React.ReactNode;
}> = ({ who, outfit, k = 1, eyeLift, pose, at, yaw, t, hi = false, children, noHat, chains, headExtra }) => {
  const sit = !!pose.sit;
  const female = outfit.kind === "dress" || outfit.kind === "gown" || !!outfit.female;
  const tone = who.skin.tone;
  const sk = skin(tone);
  const legMat = female && outfit.kind !== "gown" ? sk : cloth(outfit.trousers ?? outfit.main, 0.8);
  const crouch = pose.crouch ?? 0;
  // the body's joints (standing values for k = 1, scaled)
  const lifts = outfit.lifts ?? 0;
  const hipY = sit ? 0.56 + (pose.lift ?? 0) : (0.93 - 0.55 * crouch) * k + (pose.lift ?? 0) + lifts;
  const bust = !!outfit.bust;
  const torsoLen = 0.58 * k;
  // the torso: pitched, rolled, twisted about the hips
  const torsoQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(pose.lean ?? 0) + (sit ? -0.06 : 0), pose.twist ?? 0, -(pose.roll ?? 0), "YXZ"));
  const hip = new THREE.Vector3(0, hipY, sit ? 0.06 : 0);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(torsoQ);
  const bodyX = new THREE.Vector3(1, 0, 0).applyQuaternion(torsoQ);
  const bodyZ = new THREE.Vector3(0, 0, 1).applyQuaternion(torsoQ);
  const shoulderC = hip.clone().addScaledVector(up, 0.5 * k);
  const neckBase = hip.clone().addScaledVector(up, 0.575 * k);
  // the head sits on the neck: a short visible neck, then the chin; its origin is at eye level
  // (a portrait's neck is real length: the chin just above the collar)
  const headP = neckBase.clone().addScaledVector(up, (bust ? -0.008 : 0.05) * k - who.shape.chinY + (eyeLift ?? 0));
  // where the head looks
  let hy = pose.headYaw ?? 0;
  let hp = pose.headPitch ?? 0;
  if (pose.look) {
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)).invert();
    const local = pose.look.clone().sub(at).applyQuaternion(inv).sub(headP);
    hy = Math.max(-1.2, Math.min(1.2, Math.atan2(-local.x, -local.z)));
    hp = Math.max(-0.7, Math.min(0.75, Math.atan2(local.y, Math.hypot(local.x, local.z))));
  }
  const expr: Expr = { ...NEUTRAL, ...pose.e };
  const bp = (t + who.skin.seed * 0.71) % (3.1 + (who.skin.seed % 3) * 0.6);
  const blink = bp < 0.13 ? Math.sin((bp / 0.13) * Math.PI) : 0;
  expr.lidL = Math.max(expr.lidL, blink);
  expr.lidR = Math.max(expr.lidR, blink);
  // the eyes do a little of the looking too
  expr.eyeYaw = expr.eyeYaw || Math.max(-0.3, Math.min(0.3, (hy - (pose.twist ?? 0)) * 0.15));
  const torsoMat = torsoMaterial(outfit, tone);
  const sleeveMat =
    outfit.sleeves === "none" || (female && outfit.sleeves !== "long" && outfit.sleeves !== "short")
      ? sk
      : outfit.kind === "waiter" || outfit.kind === "vest"
        ? cloth(outfit.shirt ?? "#FFFFFF", 0.8)
        : outfit.kind === "chef"
          ? cloth("#F6F4EE", 0.85)
          : cloth(outfit.main, 0.8);
  const shortSleeve = outfit.sleeves === "short";
  // ---- arms
  const arm = (side: number) => {
    const S = bust
      ? shoulderC.clone().addScaledVector(bodyX, side * 0.168 * k).addScaledVector(up, -0.056 * k)
      : shoulderC.clone().addScaledVector(bodyX, side * 0.19 * k).addScaledVector(up, -0.02 * k);
    const def: Arm = sit
      ? bust
        ? { at: new THREE.Vector3(side * 0.12 * k, hipY + 0.04, -0.3 * k), hand: RELAX, palm: new THREE.Vector3(0, -1, 0), pole: new THREE.Vector3(side * 0.3, -1, 0.5) }
        : { at: new THREE.Vector3(side * 0.15 * k, hipY + 0.06, -0.3 * k), hand: RELAX, palm: new THREE.Vector3(0, -1, 0) }
      : { at: S.clone().add(new THREE.Vector3(side * 0.07 * k, -0.55 * k, -0.04 * k)), hand: RELAX };
    const a = (side < 0 ? pose.armL : pose.armR) ?? def;
    const la = 0.3 * k;
    const lb = 0.27 * k;
    const pole = (a.pole ?? new THREE.Vector3(side, -0.6, 0.6)).clone().normalize();
    const { E, W } = ik(S, a.at, la, lb, pole);
    const fore = W.clone().sub(E).normalize();
    const handY = fore.clone().negate();
    const palmWant = (a.palm ?? new THREE.Vector3(-side, 0, 0)).clone();
    const handZ = palmWant.addScaledVector(handY, -palmWant.dot(handY)).normalize();
    const handX = new THREE.Vector3().crossVectors(handY, handZ);
    const hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(handX, handY, handZ));
    const hold = side < 0 ? pose.holdL : pose.holdR;
    const longSleeve = sleeveMat !== sk && !shortSleeve;
    return (
      <group key={side}>
        {bust ? null : (
          <mesh position={S.clone().addScaledVector(bodyX, -side * 0.012 * k)} material={sleeveMat === sk ? sk : sleeveMat} scale={[0.05 * k, 0.046 * k, 0.05 * k]}>
            <sphereGeometry args={[1, 14, 10]} />
          </mesh>
        )}
        <Limb a={S} b={E} geo={bust ? lathe("wub", UPPER_B, 32) : lathe("wu", UPPER)} len={0.3} mat={longSleeve ? sleeveMat : sk} k={k} />
        {shortSleeve ? (
          <Limb
            a={S}
            b={bust ? E : S.clone().lerp(E, 0.45)}
            geo={bust ? lathe("wslb2", SLEEVE_B, 32) : lathe("wsl", UPPER.map(([r, y]) => [r * 1.22, y * 0.45] as [number, number]))}
            len={bust ? 0.3 : 0.135}
            mat={sleeveMat}
            k={k}
          />
        ) : null}
        <mesh position={E} material={longSleeve ? sleeveMat : sk} scale={0.04 * k}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        <Limb a={E} b={W} geo={lathe("wf", FORE)} len={0.27} mat={longSleeve ? sleeveMat : sk} k={k} />
        {longSleeve && (outfit.kind === "suit" || outfit.kind === "kidsuit") ? (
          // the shirt cuff showing at the wrist
          <Limb a={W.clone().addScaledVector(fore, -0.03 * k)} b={W.clone().addScaledVector(fore, 0.005)} geo={lathe("wcuff", [[0, 0.01], [0.031, 0], [0.031, -0.035], [0, -0.036]])} len={0.036} mat={cloth(outfit.shirt ?? "#FFFFFF", 0.7)} k={k} />
        ) : null}
        <group position={W} quaternion={hq}>
          {a.hidden ? null : <Hand pose={a.hand} tone={tone} side={side} scale={k * 0.97} />}
          {hold ? <PropMesh kind={hold} k={k} t={t} /> : null}
        </group>
      </group>
    );
  };
  // ---- legs
  const legs = [-1, 1].map((side) => {
    if (sit) {
      const H = new THREE.Vector3(side * 0.095 * k, hipY - 0.02, 0.04);
      const K = new THREE.Vector3(side * 0.11 * k, hipY - 0.06, -0.38 * k);
      const A = pose.feet ? pose.feet[side < 0 ? 0 : 1].clone() : new THREE.Vector3(side * 0.115 * k, Math.max(0.09, K.y - 0.41), -0.42 * k);
      return (
        <group key={side}>
          <Limb a={H} b={K} geo={lathe("wth", THIGH)} len={0.45} mat={female ? cloth(outfit.main, 0.8, 0.4) : legMat} k={k} thick={female ? 1.08 : 1} />
          <mesh position={K} material={female ? sk : legMat} scale={0.052 * k}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          <Limb a={K} b={A} geo={lathe("wsh", SHIN)} len={0.43} mat={female && outfit.kind !== "gown" ? sk : legMat} k={k} />
          <Shoe at={A} side={side} k={k} o={outfit} />
        </group>
      );
    }
    const spread = 0.1 * k;
    const H = new THREE.Vector3(side * 0.095 * k, hipY - 0.02, 0);
    const A = pose.feet ? pose.feet[side < 0 ? 0 : 1].clone() : new THREE.Vector3(side * (spread + 0.01), 0.09 * k + lifts, -0.01);
    if (pose.ankles) {
      // (a foot asked for beyond the leg's reach comes in to the end of the straightened leg, shoe and all)
      const reach = (bust ? 0.425 + 0.41 : 0.45 + 0.43) * k * 0.995;
      const d = A.clone().sub(H);
      if (d.length() > reach) A.copy(H).addScaledVector(d.normalize(), reach);
    }
    const kneeOut = new THREE.Vector3(side * 0.02, 0, -1);
    // (portrait people: legs that reach the floor nearly straight, not crouching)
    const { E: K } = bust ? ik(H, A, 0.425 * k, 0.41 * k, kneeOut) : ik(H, A, 0.45 * k, 0.43 * k, kneeOut);
    return (
      <group key={side}>
        <Limb a={H} b={K} geo={lathe("wth", THIGH)} len={0.45} mat={legMat} k={k} />
        <mesh position={K} material={legMat} scale={0.05 * k}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        <Limb a={K} b={A} geo={lathe("wsh", SHIN)} len={0.43} mat={legMat} k={k} />
        {pose.ankles ? (
          <mesh position={A.clone().add(new THREE.Vector3(0, -0.012 * k, -0.006 * k))} material={legMat} scale={[0.037 * k, 0.04 * k, 0.037 * k]}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        ) : null}
        <Shoe at={A} side={side} k={k} o={outfit} point={pose.pointToes ?? 0} />
      </group>
    );
  });
  // ---- skirt
  let skirt: React.ReactNode = null;
  if (female && !sit) {
    const gown = outfit.kind === "gown";
    const hem = (outfit.hem ?? (gown ? 0 : 0.45)) * k;
    const waist = hip.clone().addScaledVector(up, 0.17 * k);
    const len = waist.y - hem;
    const r1 = gown ? (outfit.hemR ?? 0.58) * k : (0.22 + 0.16 * (outfit.flare ?? 0.5)) * k;
    const geo = skirtGeometry(`${outfit.kind}${hem}${r1}${k}`, len, 0.15 * k, r1, gown ? 0.05 : 0.04, gown ? 0.55 : 0);
    skirt = <mesh geometry={geo} material={cloth(gown ? "#FBF8F2" : outfit.main, gown ? 0.6 : 0.75, gown ? 0.8 : 0.5)} position={waist} castShadow receiveShadow />;
  } else if (female && sit) {
    // seated: the skirt over the lap and falling below the knees
    skirt = (
      <group>
        <mesh material={cloth(outfit.main, 0.75, 0.5)} position={[0, 0.54, -0.18 * k]} scale={[0.26 * k, 0.09, 0.3 * k]} castShadow>
          <sphereGeometry args={[1, 24, 14]} />
        </mesh>
        <mesh material={cloth(outfit.main, 0.75, 0.5)} position={[0, 0.42, -0.42 * k]} scale={[0.25 * k, 0.15, 0.06 * k]} castShadow>
          <sphereGeometry args={[1, 20, 12]} />
        </mesh>
      </group>
    );
  }
  // ---- head rotation (in the body frame), on top of the torso's lean
  const headQ = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(-hp, Math.PI + hy, pose.headRoll ?? 0, "YXZ"))
    .premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-(pose.lean ?? 0) * 0.3, 0, -(pose.roll ?? 0) * 0.5, "YXZ")));
  const hat = outfit.hat && !noHat ? <Hat hat={outfit.hat} who={who} /> : null;
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      {legs}
      {/* hips */}
      <mesh material={female ? cloth(outfit.main, 0.8) : cloth(outfit.trousers ?? outfit.main, 0.8)} position={hip} quaternion={torsoQ} scale={[0.165 * k, 0.11 * k, 0.12 * k]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
      {skirt}
      {outfit.kind === "gown" ? <mesh geometry={veilGeometry(k)} material={veilMaterial()} position={hip} quaternion={torsoQ} renderOrder={2} /> : null}
      {/* torso */}
      {outfit.bust ? (
        <mesh geometry={bustGeometry(female)} material={torsoMat} position={hip} quaternion={torsoQ} scale={[k * (female ? 0.94 : 1), torsoLen / 0.58, k]} castShadow receiveShadow />
      ) : (
        <mesh geometry={lathe("wtorso", TORSO, 40)} material={torsoMat} position={hip} quaternion={torsoQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0))} scale={[k * (female ? 0.94 : 1), torsoLen / 0.58, k * 0.7]} castShadow receiveShadow />
      )}
      {bust ? <Collar o={outfit} at={hip} q={torsoQ} k={k} female={female} /> : null}
      {/* the neck, and a shirt collar */}
      {bust ? (
        <mesh geometry={lathe("wneck", NECK, 32)} material={sk} position={neckBase.clone().addScaledVector(bodyZ, NECK_Z * k)} quaternion={torsoQ} scale={[k, k, k * NECK_SQ]} castShadow receiveShadow />
      ) : (
        <mesh material={sk} position={neckBase.clone().addScaledVector(up, 0.05 * k)} quaternion={torsoQ} scale={[0.048 * k, 0.12 * k, 0.05 * k]}>
          <cylinderGeometry args={[0.95, 1.05, 1, 16]} />
        </mesh>
      )}
      {!bust && (outfit.kind === "suit" || outfit.kind === "kidsuit" || outfit.kind === "waiter") ? (
        <mesh material={cloth(outfit.shirt ?? "#FFFFFF", 0.7)} position={neckBase.clone().addScaledVector(up, 0.012 * k)} quaternion={torsoQ} scale={[0.062 * k, 0.04 * k, 0.064 * k]}>
          <cylinderGeometry args={[1, 1.12, 1, 18, 1, true]} />
        </mesh>
      ) : null}
      {outfit.boutonniere ? (
        <mesh position={shoulderC.clone().addScaledVector(bodyX, -0.1 * k).addScaledVector(bodyZ, -0.11 * k).addScaledVector(up, -0.04 * k)} material={cloth("#F6EFEA", 0.6, 0.6)} scale={0.022}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ) : null}
      {arm(-1)}
      {arm(1)}
      <group position={headP} quaternion={headQ}>
        <Head person={who} e={expr} rider={false} hi={hi} chains={chains} plainHair />
        {hat}
        {headExtra}
      </group>
      {children}
    </group>
  );
};

const shoeGeo = (heels: boolean) =>
  (geoCache[`shoe${heels}`] ??= (() => {
    const g = new RoundedBoxGeometry(0.095, heels ? 0.05 : 0.07, 0.26, 4, heels ? 0.022 : 0.03);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // a toe that narrows and rounds off, a heel that's a little higher
      const toe = Math.max(0, -z - 0.04) / 0.09;
      p.setX(i, x * (1 - 0.35 * toe * toe));
      p.setY(i, y * (1 - 0.3 * toe) + (heels ? 0.03 * Math.max(0, z) / 0.13 : 0));
    }
    g.computeVertexNormals();
    return g;
  })());

const Shoe: React.FC<{ at: THREE.Vector3; side: number; k: number; o: Outfit; point?: number }> = ({ at, side, k, o, point = 0 }) => {
  const heels = !!o.heels;
  const mat = leather(o.shoe);
  return (
    <group position={at} rotation={[-point, side * 0.08, 0]} scale={k}>
      <mesh geometry={shoeGeo(heels)} material={mat} position={[0, heels ? -0.045 : -0.05, -0.065]} rotation={[heels ? -0.12 : 0, 0, 0]} castShadow />
      {heels ? (
        <mesh material={mat} position={[0, -0.078, 0.035]} scale={[0.012, 0.045, 0.012]}>
          <cylinderGeometry args={[1, 0.6, 1, 8]} />
        </mesh>
      ) : (
        <mesh material={leather("#1A1410")} position={[0, -0.084, -0.065]} scale={[0.048, 0.008, 0.13]}>
          <sphereGeometry args={[1, 16, 6]} />
        </mesh>
      )}
      {o.lifts ? (
        // the lifts: a thick platform sole (not subtle)
        <mesh material={leather("#24201C")} position={[0, -0.088 - (o.lifts / k) / 2, -0.062]} scale={[1, o.lifts / k / 0.06, 1]} castShadow>
          <boxGeometry args={[0.1, 0.06, 0.27]} />
        </mesh>
      ) : null}
    </group>
  );
};

/** Hats, in head space (origin between the ears at eye level, facing +z). */
export const Hat: React.FC<{ hat: NonNullable<Outfit["hat"]>; who: Person }> = ({ hat, who }) => {
  const sh = who.shape;
  if (hat.kind === "wide")
    return (
      <group position={[0, sh.h * 0.62, -0.01]} rotation={[-0.12, 0, 0.06]}>
        <mesh material={cloth(hat.color, 0.8)} castShadow>
          <cylinderGeometry args={[sh.w * 1.05, sh.w * 1.18, sh.h * 0.55, 32]} />
        </mesh>
        <mesh material={cloth(hat.color, 0.8)} position={[0, -sh.h * 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.245, 0.006, 48]} />
        </mesh>
        <mesh material={cloth(hat.band ?? "#222", 0.6)} position={[0, -sh.h * 0.17, 0]}>
          <cylinderGeometry args={[sh.w * 1.17, sh.w * 1.18, 0.022, 32]} />
        </mesh>
      </group>
    );
  if (hat.kind === "toque")
    return (
      <group position={[0, sh.h * 0.75, -0.005]}>
        <mesh material={cloth("#FBFBF8", 0.9)} castShadow>
          <cylinderGeometry args={[sh.w * 1.25, sh.w * 1.0, 0.2, 24]} />
        </mesh>
        <mesh material={cloth("#FBFBF8", 0.9)} position={[0, 0.1, 0]} scale={[sh.w * 1.3, 0.05, sh.w * 1.3]}>
          <sphereGeometry args={[1, 20, 10]} />
        </mesh>
      </group>
    );
  // a fascinator: a small disc and feathers on one side
  return (
    <group position={[sh.w * 0.6, sh.h * 0.55, 0.02]} rotation={[0.2, 0, -0.5]}>
      <mesh material={cloth(hat.color, 0.6, 0.5)}>
        <cylinderGeometry args={[0.05, 0.05, 0.012, 20]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={cloth(hat.band ?? hat.color, 0.7)} position={[0.01 * i, 0.04 + i * 0.01, -0.01]} rotation={[0, 0, -0.3 + i * 0.25]} scale={[0.008, 0.07, 0.003]}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
};

export { GRIP, RELAX };

/** The drone's controller, held level in front of the body (body space), its phone clamped on top. */
export const Controller: React.FC<{ at: THREE.Vector3; tilt?: number }> = ({ at, tilt = 0.35 }) => (
  <group position={at} rotation={[tilt, 0, 0]}>
    <mesh material={matCache.ctl ?? (matCache.ctl = new THREE.MeshStandardMaterial({ color: "#2D2F33", roughness: 0.5 }))} castShadow>
      <boxGeometry args={[0.19, 0.03, 0.085]} />
    </mesh>
    {[-0.07, 0.07].map((x) => (
      <mesh key={x} position={[x, 0.0, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={matCache.ctl}>
        <cylinderGeometry args={[0.022, 0.026, 0.06, 14]} />
      </mesh>
    ))}
    {[-0.045, 0.045].map((x) => (
      <mesh key={`s${x}`} position={[x, 0.024, -0.005]} material={leather("#111")}>
        <cylinderGeometry args={[0.007, 0.009, 0.02, 10]} />
      </mesh>
    ))}
    <mesh position={[0, 0.048, -0.05]} rotation={[-1.25, 0, 0]} material={leather("#111114")}>
      <boxGeometry args={[0.15, 0.072, 0.008]} />
    </mesh>
    <mesh position={[0, 0.0505, -0.0458]} rotation={[-1.25 + Math.PI, 0, 0]} material={matCache.ctlScreen ?? (matCache.ctlScreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.42, 0.38) }))}>
      <planeGeometry args={[0.14, 0.064]} />
    </mesh>
  </group>
);
