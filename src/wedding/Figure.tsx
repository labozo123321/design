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
  kind: "suit" | "dress" | "gown" | "kidsuit" | "waiter" | "chef" | "tee";
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
  hat?: { kind: "wide" | "fascinator" | "toque"; color: string; band?: string };
  pocket?: string;
  boutonniere?: boolean;
};

export type Arm = { at: THREE.Vector3; hand: HandPose; palm?: THREE.Vector3; pole?: THREE.Vector3 };
export type Prop = "phone" | "bouquet" | "book" | "tray" | "bottle" | "controller" | "spatula" | "ringbox" | null;

export type Pose = {
  sit?: boolean;
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
  /** knees bent (0..1), and the whole body raised (a hop) */
  crouch?: number;
  lift?: number;
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
  const female = outfit.kind === "dress" || outfit.kind === "gown";
  const tone = who.skin.tone;
  const sk = skin(tone);
  const legMat = female && outfit.kind !== "gown" ? sk : cloth(outfit.trousers ?? outfit.main, 0.8);
  const crouch = pose.crouch ?? 0;
  // the body's joints (standing values for k = 1, scaled)
  const hipY = sit ? 0.56 : (0.93 - 0.55 * crouch) * k + (pose.lift ?? 0);
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
  const headP = neckBase.clone().addScaledVector(up, 0.05 * k - who.shape.chinY + (eyeLift ?? 0));
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
  const sleeveMat = outfit.sleeves === "none" || (female && outfit.sleeves !== "long" && outfit.sleeves !== "short") ? sk : outfit.kind === "waiter" ? cloth(outfit.shirt ?? "#FFFFFF", 0.8) : outfit.kind === "chef" ? cloth("#F6F4EE", 0.85) : cloth(outfit.main, 0.8);
  const shortSleeve = outfit.sleeves === "short";
  // ---- arms
  const arm = (side: number) => {
    const S = shoulderC.clone().addScaledVector(bodyX, side * 0.19 * k).addScaledVector(up, -0.02 * k);
    const def: Arm = sit
      ? { at: new THREE.Vector3(side * 0.15 * k, hipY + 0.06, -0.3 * k), hand: RELAX, palm: new THREE.Vector3(0, -1, 0) }
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
        <mesh position={S.clone().addScaledVector(bodyX, -side * 0.012 * k)} material={sleeveMat === sk ? sk : sleeveMat} scale={[0.05 * k, 0.046 * k, 0.05 * k]}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <Limb a={S} b={E} geo={lathe("wu", UPPER)} len={0.3} mat={longSleeve ? sleeveMat : sk} k={k} />
        {shortSleeve ? <Limb a={S} b={S.clone().lerp(E, 0.45)} geo={lathe("wsl", UPPER.map(([r, y]) => [r * 1.22, y * 0.45] as [number, number]))} len={0.135} mat={sleeveMat} k={k} /> : null}
        <mesh position={E} material={longSleeve ? sleeveMat : sk} scale={0.04 * k}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        <Limb a={E} b={W} geo={lathe("wf", FORE)} len={0.27} mat={longSleeve ? sleeveMat : sk} k={k} />
        {longSleeve && (outfit.kind === "suit" || outfit.kind === "kidsuit") ? (
          // the shirt cuff showing at the wrist
          <Limb a={W.clone().addScaledVector(fore, -0.03 * k)} b={W.clone().addScaledVector(fore, 0.005)} geo={lathe("wcuff", [[0, 0.01], [0.031, 0], [0.031, -0.035], [0, -0.036]])} len={0.036} mat={cloth(outfit.shirt ?? "#FFFFFF", 0.7)} k={k} />
        ) : null}
        <group position={W} quaternion={hq}>
          <Hand pose={a.hand} tone={tone} side={side} scale={k * 0.97} />
          {hold ? <PropMesh kind={hold} k={k} t={t} /> : null}
        </group>
      </group>
    );
  };
  // ---- legs
  const legs = [-1, 1].map((side) => {
    if (sit) {
      const H = new THREE.Vector3(side * 0.095 * k, hipY - 0.02, 0.04);
      const K = new THREE.Vector3(side * 0.11 * k, 0.5, -0.38 * k);
      const A = new THREE.Vector3(side * 0.115 * k, 0.09, -0.42 * k);
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
    const A = new THREE.Vector3(side * (spread + 0.01), 0.09 * k, -0.01);
    const kneeOut = new THREE.Vector3(side * 0.02, 0, -1);
    const { E: K } = ik(H, A, 0.45 * k, 0.43 * k, kneeOut);
    return (
      <group key={side}>
        <Limb a={H} b={K} geo={lathe("wth", THIGH)} len={0.45} mat={legMat} k={k} />
        <mesh position={K} material={legMat} scale={0.05 * k}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        <Limb a={K} b={A} geo={lathe("wsh", SHIN)} len={0.43} mat={legMat} k={k} />
        <Shoe at={A} side={side} k={k} o={outfit} />
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
      {/* torso */}
      <mesh geometry={lathe("wtorso", TORSO, 40)} material={torsoMat} position={hip} quaternion={torsoQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0))} scale={[k * (female ? 0.94 : 1), torsoLen / 0.58, k * 0.7]} castShadow receiveShadow />
      {/* the neck, and a shirt collar */}
      <mesh material={sk} position={neckBase.clone().addScaledVector(up, 0.05 * k)} quaternion={torsoQ} scale={[0.048 * k, 0.12 * k, 0.05 * k]}>
        <cylinderGeometry args={[0.95, 1.05, 1, 16]} />
      </mesh>
      {outfit.kind === "suit" || outfit.kind === "kidsuit" || outfit.kind === "waiter" ? (
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
        <Head person={who} e={expr} rider={false} hi={hi} chains={chains} />
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

const Shoe: React.FC<{ at: THREE.Vector3; side: number; k: number; o: Outfit }> = ({ at, side, k, o }) => {
  const heels = !!o.heels;
  const mat = leather(o.shoe);
  return (
    <group position={at} rotation={[0, side * 0.08, 0]} scale={k}>
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
