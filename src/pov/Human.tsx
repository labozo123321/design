import React from "react";
import * as THREE from "three";
import { random } from "remotion";
import { watches, type PState, type Spec } from "./crowd";

/**
 * Articulated person, modelled in metres for a 1.78 m adult (scaled per person).
 * Pelvis -> legs (hip, knee, ankle) and spine -> arms (shoulder, elbow, wrist) and neck -> head with a
 * face: eyes (sclera, iris, pupil) that blink, brows, nose, ears, a mouth that smiles or drops open.
 */

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

const SKIN = ["#F3D2B5", "#EBC09C", "#D9A37A", "#C08A60", "#9A6844", "#6E4730"];
const HAIR = ["#1B1410", "#2E2018", "#4A3222", "#6B4A2F", "#A47B4F", "#D7B576", "#7E3A22", "#8C8C8C"];
const IRIS = ["#3B2A1E", "#4A3322", "#2F5E8C", "#3F6E4A", "#5A4532"];
const TOPS = [
  "#E05A4F",
  "#3E6FB0",
  "#F2C14E",
  "#4E9A6A",
  "#7B5BA6",
  "#F4F1EA",
  "#2F2F3A",
  "#E98A3B",
  "#5DA9C9",
  "#C94F7C",
  "#8FA36B",
  "#B5654A",
];
const BOTTOMS = ["#2E3A55", "#3B4A6B", "#262A33", "#6B5A47", "#9A9A92", "#4A3B2F"];
const SHOES = [
  { up: "#F4F4F2", sole: "#DADAD5" },
  { up: "#1C1C1F", sole: "#2A2A2E" },
  { up: "#C0392B", sole: "#F2F2F2" },
  { up: "#6B4A2F", sole: "#2A1E15" },
  { up: "#3E6FB0", sole: "#F2F2F2" },
];

export type Look = {
  female: boolean;
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun" | "pony" | "curly" | "bald" | "cap";
  capColor: string;
  beard: boolean;
  glasses: boolean;
  iris: string;
  top: string;
  sleeves: "short" | "long" | "hoodie";
  bottom: string;
  legs: "pants" | "shorts" | "dress";
  shoe: { up: string; sole: string };
  backpack: boolean;
  bag: string;
  width: number;
};

const pick = <V,>(arr: V[], u: number) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];

export const lookFor = (sp: Spec): Look => {
  const r = (k: string) => random(`look-${sp.i}-${k}`);
  const female = r("sex") < 0.5;
  const kid = sp.kid;
  const hairStyle = female
    ? pick(["long", "bun", "pony", "curly", "long", "short"] as const, r("hs"))
    : pick(["short", "short", "curly", "bald", "cap", "short"] as const, r("hs"));
  const legs = kid
    ? pick(["shorts", "pants", "shorts"] as const, r("lg"))
    : female
      ? pick(["pants", "dress", "pants", "shorts"] as const, r("lg"))
      : pick(["pants", "pants", "shorts"] as const, r("lg"));
  const look: Look = {
    female,
    skin: pick(SKIN, r("skin")),
    hair: kid ? pick(HAIR.slice(0, 7), r("hair")) : pick(HAIR, r("hair")),
    hairStyle: kid && hairStyle === "bald" ? "short" : hairStyle,
    capColor: pick(TOPS, r("cap")),
    beard: !female && !kid && r("beard") < 0.3,
    glasses: !kid && r("glasses") < 0.22,
    iris: pick(IRIS, r("iris")),
    top: pick(TOPS, r("top")),
    sleeves: pick(["short", "short", "long", "hoodie"] as const, r("sl")),
    bottom: pick(BOTTOMS, r("bottom")),
    legs,
    shoe: pick(SHOES, r("shoe")),
    backpack: sp.role === "walk" && r("bp") < 0.22,
    bag: pick(["#2F2F3A", "#7E3A22", "#3E6FB0", "#4E9A6A"], r("bag")),
    width: (female ? 0.92 : 1.0) * (0.95 + r("w") * 0.14),
  };
  // the two people who meet your eye are cast, not rolled: a clean-shaven balloon seller in a red cap
  // (nothing over the smile), and a woman in a sky-blue top
  if (sp.role === "greet")
    return {
      ...look,
      female: false,
      skin: SKIN[2],
      hairStyle: "cap",
      capColor: "#C0392B",
      beard: false,
      glasses: false,
      top: "#F4F1EA",
      sleeves: "short",
      bottom: "#2E3A55",
      legs: "pants",
      width: 1.03,
    };
  if (sp.role === "stare")
    return {
      ...look,
      female: true,
      skin: SKIN[3],
      hair: HAIR[1],
      hairStyle: "long",
      glasses: false,
      top: "#5DA9C9",
      sleeves: "long",
      bottom: "#3B4A6B",
      legs: "pants",
      width: 0.92,
    };
  return look;
};

/* ------------------------------------------------------------------ */
/* Geometry + material caches                                           */
/* ------------------------------------------------------------------ */

const geos: Record<string, THREE.BufferGeometry> = {};
const geo = (key: string, make: () => THREE.BufferGeometry) => (geos[key] ??= make());
const capsule = (r: number, len: number) =>
  geo(`cap${r}-${len}`, () => new THREE.CapsuleGeometry(r, len, 8, 16));
const sphere = (seg = 18) => geo(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)));
/**
 * Profiles are written top to bottom; LatheGeometry needs them bottom to top, or every face points inward
 * and the shape renders inside-out (its near side culled, lit from the wrong side).
 */
const lathe = (key: string, pts: [number, number][]) =>
  geo(
    `lathe-${key}`,
    () =>
      new THREE.LatheGeometry(
        (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(
          ([x, y]) => new THREE.Vector2(x, y),
        ),
        32,
      ),
  );
const box = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
/** One continuous head: an egg with a narrower jaw, a fuller cranium at the back, a flatter face plane. */
const headGeo = () =>
  geo("head", () => {
    const g = new THREE.SphereGeometry(1, 48, 36);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      if (y < 0) {
        const d = -y;
        x *= 1 - 0.26 * Math.pow(d, 1.6); // jaw narrows toward the chin
        z *= 1 - 0.08 * d;
        if (z > 0) z *= 1 + 0.06 * d; // chin comes forward a little
        y *= 1 + 0.08 * d; // longer lower face
      } else {
        if (z < 0) z *= 1.06; // fuller back of the skull
      }
      if (z > 0.5) z = 0.5 + (z - 0.5) * 0.85; // flatter face plane
      p.setXYZ(i, x * 0.094, y * 0.116, z * 0.104);
    }
    g.computeVertexNormals();
    return g;
  });

const TORSO_M: [number, number][] = [
  [0.001, -0.06],
  [0.142, -0.06],
  [0.158, -0.035],
  [0.156, 0.02],
  [0.152, 0.08],
  [0.142, 0.16],
  [0.146, 0.24],
  [0.162, 0.32],
  [0.176, 0.4],
  [0.172, 0.46],
  [0.13, 0.505],
  [0.06, 0.528],
  [0.001, 0.532],
];
const TORSO_F: [number, number][] = [
  [0.001, -0.06],
  [0.142, -0.06],
  [0.158, -0.035],
  [0.154, 0.02],
  [0.148, 0.08],
  [0.124, 0.17],
  [0.13, 0.25],
  [0.152, 0.31],
  [0.157, 0.37],
  [0.15, 0.44],
  [0.115, 0.495],
  [0.05, 0.518],
  [0.001, 0.522],
];
/** Tapered limbs: thigh, shin (with a calf), upper arm, forearm. Profiles are (radius, y) down from the joint. */
const THIGH: [number, number][] = [
  [0.001, 0.03],
  [0.058, 0.02],
  [0.076, -0.03],
  [0.074, -0.13],
  [0.066, -0.26],
  [0.055, -0.38],
  [0.05, -0.44],
  [0.001, -0.452],
];
const SHIN: [number, number][] = [
  [0.001, 0.012],
  [0.049, 0.0],
  [0.055, -0.06],
  [0.057, -0.13],
  [0.047, -0.25],
  [0.035, -0.37],
  [0.031, -0.42],
  [0.001, -0.432],
];
const UPPER_ARM: [number, number][] = [
  [0.001, 0.035],
  [0.046, 0.022],
  [0.051, -0.03],
  [0.048, -0.12],
  [0.041, -0.24],
  [0.038, -0.285],
  [0.001, -0.297],
];
const FOREARM: [number, number][] = [
  [0.001, 0.012],
  [0.038, 0.0],
  [0.044, -0.05],
  [0.041, -0.12],
  [0.031, -0.22],
  [0.027, -0.25],
  [0.001, -0.258],
];
const HIPS: [number, number][] = [
  [0.001, -0.13],
  [0.105, -0.13],
  [0.138, -0.085],
  [0.146, -0.03],
  [0.14, 0.02],
  [0.12, 0.05],
  [0.001, 0.055],
];

const mats: Record<string, THREE.MeshStandardMaterial> = {};
const mat = (color: string, rough = 0.85, metal = 0) =>
  (mats[`${color}${rough}${metal}`] ??= new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
  }));

/* ------------------------------------------------------------------ */
/* Pose                                                                 */
/* ------------------------------------------------------------------ */

type Pair = [number, number];
export type Pose = {
  pelvisY: number;
  pelvisYaw: number;
  pelvisRoll: number;
  spinePitch: number;
  spineYaw: number;
  hipX: Pair;
  hipZ: Pair;
  knee: Pair;
  ankle: Pair;
  shX: Pair;
  shZ: Pair;
  elbow: Pair;
  headYaw: number;
  headPitch: number;
  headRoll: number;
};
const P0: Pose = {
  pelvisY: 0.975,
  pelvisYaw: 0,
  pelvisRoll: 0,
  spinePitch: 0,
  spineYaw: 0,
  hipX: [0, 0],
  hipZ: [0, 0],
  knee: [0.05, 0.05],
  ankle: [-0.05, -0.05],
  shX: [0.05, 0.05],
  shZ: [-0.08, 0.08],
  elbow: [-0.15, -0.15],
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
};

const mixP = (a: Pose, b: Pose, w: number): Pose => {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const m = (x: number, y: number) => x + (y - x) * w;
  const mp = (x: Pair, y: Pair): Pair => [m(x[0], y[0]), m(x[1], y[1])];
  return {
    pelvisY: m(a.pelvisY, b.pelvisY),
    pelvisYaw: m(a.pelvisYaw, b.pelvisYaw),
    pelvisRoll: m(a.pelvisRoll, b.pelvisRoll),
    spinePitch: m(a.spinePitch, b.spinePitch),
    spineYaw: m(a.spineYaw, b.spineYaw),
    hipX: mp(a.hipX, b.hipX),
    hipZ: mp(a.hipZ, b.hipZ),
    knee: mp(a.knee, b.knee),
    ankle: mp(a.ankle, b.ankle),
    shX: mp(a.shX, b.shX),
    shZ: mp(a.shZ, b.shZ),
    elbow: mp(a.elbow, b.elbow),
    headYaw: m(a.headYaw, b.headYaw),
    headPitch: m(a.headPitch, b.headPitch),
    headRoll: m(a.headRoll, b.headRoll),
  };
};
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Walk cycle. phase: radians, 2pi per stride; amp 0..1.2. */
const walk = (phase: number, amp: number, kid: boolean): Pose => {
  const p: Pose = {
    ...P0,
    hipX: [0, 0],
    hipZ: [0, 0],
    knee: [0, 0],
    ankle: [0, 0],
    shX: [0, 0],
    shZ: [0, 0],
    elbow: [0, 0],
  };
  const A = amp * (kid ? 1.15 : 1);
  ([0, 1] as const).forEach((i) => {
    const psi = phase + (i ? Math.PI : 0);
    const s = Math.sin(psi);
    const c = Math.cos(psi);
    p.hipX[i] = 0.42 * A * s;
    p.knee[i] = 0.06 + 0.95 * A * Math.pow(Math.max(0, -c), 1.2) + 0.12 * A * Math.max(0, s);
    p.ankle[i] = -(p.hipX[i] + p.knee[i]) * 0.85 + 0.28 * A * Math.max(0, Math.sin(psi - 0.4));
    p.shX[i] = -0.36 * A * s;
    p.shZ[i] = (i ? 1 : -1) * 0.07;
    p.elbow[i] = -(0.22 + 0.4 * A * Math.max(0, s));
  });
  p.pelvisY = 0.975 + (kid ? 0.03 : 0.02) * A * Math.cos(2 * phase) - 0.012 * A;
  p.pelvisYaw = 0.07 * A * Math.sin(phase);
  p.spineYaw = -0.1 * A * Math.sin(phase);
  p.pelvisRoll = 0.03 * A * Math.sin(phase);
  p.spinePitch = 0.05 * A;
  return p;
};

const crouch = (p: Pose, c: number): Pose => {
  if (c <= 0) return p;
  return {
    ...p,
    pelvisY: p.pelvisY - 0.2 * c,
    spinePitch: p.spinePitch + 0.35 * c,
    hipX: [p.hipX[0] - 0.95 * c, p.hipX[1] - 0.95 * c],
    knee: [p.knee[0] + 1.6 * c, p.knee[1] + 1.6 * c],
    ankle: [p.ankle[0] - 0.65 * c, p.ankle[1] - 0.65 * c],
    shX: [p.shX[0] + 0.55 * c, p.shX[1] + 0.55 * c],
  };
};

/** In the air from a jump or a low-g hop: arms up on the way up, out for balance coming down. */
const airborne = (vy: number, joy: number, hop: boolean): Pose => {
  const up = smooth(-0.6, 0.6, vy);
  const p: Pose = {
    ...P0,
    hipX: [0, 0],
    hipZ: [-0.05, 0.05],
    knee: [0, 0],
    ankle: [0, 0],
    shX: [0, 0],
    shZ: [0, 0],
    elbow: [0, 0],
  };
  const lift = hop ? 0.45 : 1;
  ([0, 1] as const).forEach((i) => {
    const s = i ? 1 : -1;
    p.hipX[i] = (up * 0.18 + (1 - up) * -0.3) * (hop ? (i ? 1 : -1) * 1.4 : 1);
    p.knee[i] = up * 0.25 + (1 - up) * 0.55;
    p.ankle[i] = up * 0.35 - (1 - up) * 0.2;
    p.shX[i] = -(up * 2.5 * joy + (1 - up) * 0.75) * lift;
    p.shZ[i] = s * (up * 0.3 + (1 - up) * 1.0) * lift;
    p.elbow[i] = -(up * 0.25 + (1 - up) * 0.35);
  });
  p.spinePitch = -0.06 * up + 0.08 * (1 - up);
  p.headPitch = -0.15 * up;
  return p;
};

/** Weightless: slow swimming limbs, looking around. */
const floating = (t: number, seed: number): Pose => {
  const w = (f: number, ph: number) => Math.sin(t * f + seed + ph);
  return {
    ...P0,
    pelvisY: 0.975,
    spinePitch: 0.08 * w(0.7, 1),
    spineYaw: 0.15 * w(0.5, 2),
    hipX: [-0.25 + 0.3 * w(0.9, 0), -0.1 + 0.3 * w(0.9, 2.2)],
    hipZ: [-0.18 - 0.08 * w(0.6, 1), 0.18 + 0.08 * w(0.6, 3)],
    knee: [0.45 + 0.3 * w(1.2, 0.5), 0.5 + 0.3 * w(1.1, 2)],
    ankle: [0.2, 0.2],
    shX: [-0.5 + 0.45 * w(1.1, 0.3), -0.4 + 0.45 * w(1.0, 2.5)],
    shZ: [-(1.05 + 0.3 * w(0.8, 1)), 1.05 + 0.3 * w(0.8, 2)],
    elbow: [-0.5 + 0.3 * w(1.3, 0), -0.5 + 0.3 * w(1.25, 1)],
    headYaw: 0.5 * w(0.4, 4),
    headPitch: 0.25 * w(0.35, 1),
    headRoll: 0.1 * w(0.5, 2),
  };
};

const seated = (t: number, seed: number): Pose => ({
  ...P0,
  pelvisY: 0.6,
  spinePitch: -0.04 + 0.02 * Math.sin(t * 0.6 + seed),
  hipX: [-1.5, -1.45],
  hipZ: [-0.08, 0.1],
  knee: [1.48, 1.4],
  ankle: [0.05, 0.08],
  shX: [-0.5, -0.45],
  shZ: [-0.12, 0.12],
  elbow: [-0.62, -0.6],
  headYaw: 0.3 * Math.sin(t * 0.25 + seed),
});

const talking = (t: number, seed: number): Pose => {
  const g = (f: number, ph: number) => Math.sin(t * f + seed + ph);
  return {
    ...P0,
    pelvisRoll: 0.025 * g(0.5, 0),
    hipX: [0.02 * g(0.5, 0), -0.02 * g(0.5, 0)],
    hipZ: [-0.05, 0.05],
    knee: [0.05 + 0.04 * Math.max(0, g(0.5, 0)), 0.05 + 0.04 * Math.max(0, -g(0.5, 0))],
    shX: [0.08, -0.55 + 0.28 * g(2.1, 1)],
    shZ: [-0.1, 0.25 + 0.1 * g(1.7, 2)],
    elbow: [-0.2, -1.25 + 0.3 * g(1.7, 0)],
    headPitch: 0.06 * g(1.3, 3),
    headYaw: 0.12 * g(0.7, 2),
  };
};

const filming = (t: number, seed: number): Pose => ({
  ...P0,
  shX: [-1.15, -1.25],
  shZ: [0.32, -0.3],
  elbow: [-1.15, -1.05],
  headPitch: 0.08,
  spinePitch: -0.05 + 0.02 * Math.sin(t + seed),
});

/** Waving hello with the right hand (w: 0..1), the other arm relaxed. */
const greeting = (t: number, seed: number, w: number): Pose => {
  const sway = Math.sin(t * Math.PI * 2 * 1.6 + seed);
  return {
    ...P0,
    pelvisRoll: 0.02 * Math.sin(t * 0.8 + seed),
    hipZ: [-0.05, 0.05],
    spineYaw: -0.06 * w,
    shX: [-0.28 * w, 0.05],
    shZ: [-0.08 - w * (2.45 + 0.28 * sway), 0.1],
    elbow: [-0.15 - w * (0.45 + 0.22 * sway), -0.2],
  };
};

/** Rooted to the spot, staring: hands half raised, leaning back to look up (up 0..1, shock 0..1). */
const staring = (t: number, seed: number, up: number, shock: number): Pose =>
  crouch(
    {
      ...P0,
      spinePitch: -0.3 * up,
      hipZ: [-0.07, 0.07],
      shX: [-0.55 * shock, -0.5 * shock],
      shZ: [-0.08 - 0.32 * shock, 0.08 + 0.3 * shock],
      elbow: [-0.15 - 1.0 * shock, -0.15 - 0.95 * shock],
      headRoll: 0.04 * Math.sin(t * 0.7 + seed),
    },
    0.1 * shock,
  );

/* ------------------------------------------------------------------ */
/* Face                                                                 */
/* ------------------------------------------------------------------ */

const Face: React.FC<{
  look: Look;
  blink: number;
  mouthO: number;
  smile: number;
  brow: number;
  eyeX: number;
  detail: boolean;
}> = ({ look, blink, mouthO, smile, brow, eyeX, detail }) => {
  const skin = mat(look.skin, 0.6);
  const hair = mat(look.hair, 0.7);
  return (
    <group>
      <mesh geometry={headGeo()} material={skin} castShadow />
      {[-1, 1].map((s) => (
        <mesh
          key={`ear${s}`}
          geometry={sphere(12)}
          position={[s * 0.093, 0.002, -0.006]}
          scale={[0.012, 0.03, 0.02]}
          material={skin}
        />
      ))}
      {detail ? (
        <>
          {[-1, 1].map((s) => (
            <group key={`eye${s}`} position={[s * 0.034, 0.014, 0]} scale={[1, Math.max(0.12, 1 - blink), 1]}>
              <mesh
                geometry={sphere(14)}
                position={[0, 0, 0.084]}
                scale={0.0145}
                material={mat("#F6F4EF", 0.25)}
              />
              <mesh
                geometry={sphere(12)}
                position={[eyeX, 0, 0.0915]}
                scale={0.0088}
                material={mat(look.iris, 0.3)}
              />
              <mesh
                geometry={sphere(10)}
                position={[eyeX * 1.1, 0, 0.0975]}
                scale={0.0042}
                material={mat("#0C0C0E", 0.15)}
              />
            </group>
          ))}
          {[-1, 1].map((s) => (
            <mesh
              key={`lid${s}`}
              geometry={geo(
                "lid",
                () => new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
              )}
              position={[s * 0.034, 0.0165 - blink * 0.004, 0.0845]}
              rotation={[0.55 + blink * 1.0, 0, 0]}
              scale={0.0158}
              material={skin}
            />
          ))}
          {[-1, 1].map((s) => (
            <mesh
              key={`brow${s}`}
              geometry={box()}
              position={[s * 0.035, 0.04 + brow, 0.094]}
              rotation={[-0.15, 0, s * -0.12 + s * brow * 6]}
              scale={[0.034, 0.0065, 0.01]}
              material={hair}
            />
          ))}
          <mesh
            geometry={geo("nose", () => new THREE.ConeGeometry(1, 1, 12))}
            position={[0, -0.008, 0.104]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.0135, 0.036, 0.0135]}
            material={skin}
          />
          {mouthO > 0.05 ? (
            <mesh
              geometry={sphere(14)}
              position={[0, -0.046, 0.092]}
              scale={[0.011 + 0.002 * mouthO, 0.008 + 0.012 * mouthO, 0.008]}
              material={mat("#4A1A1A", 0.5)}
            />
          ) : (
            <mesh
              geometry={geo("smile", () => new THREE.TorusGeometry(1, 0.2, 6, 18, Math.PI))}
              position={[0, -0.033, 0.093]}
              rotation={[0.25, 0, Math.PI]}
              scale={[0.017 * (0.85 + 0.3 * smile), 0.017 * (0.35 + 0.65 * smile), 0.017]}
              material={mat("#9B4B4B", 0.55)}
            />
          )}
          {look.glasses ? (
            <group>
              {[-1, 1].map((s) => (
                <mesh
                  key={`gl${s}`}
                  geometry={geo("ring", () => new THREE.TorusGeometry(1, 0.15, 6, 20))}
                  position={[s * 0.034, 0.014, 0.104]}
                  scale={0.0175}
                  material={mat("#151517", 0.4)}
                />
              ))}
              <mesh
                geometry={box()}
                position={[0, 0.017, 0.106]}
                scale={[0.02, 0.003, 0.003]}
                material={mat("#151517", 0.4)}
              />
              {[-1, 1].map((s) => (
                <mesh
                  key={`tm${s}`}
                  geometry={box()}
                  position={[s * 0.053, 0.017, 0.055]}
                  scale={[0.003, 0.003, 0.095]}
                  material={mat("#151517", 0.4)}
                />
              ))}
            </group>
          ) : null}
          {look.beard ? (
            <>
              <mesh
                geometry={sphere(18)}
                position={[0, -0.072, 0.012]}
                scale={[0.08, 0.05, 0.076]}
                material={hair}
              />
              <mesh
                geometry={box()}
                position={[0, -0.024, 0.1]}
                scale={[0.032, 0.006, 0.007]}
                material={hair}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Hair look={look} />
    </group>
  );
};

const CURLS = Array.from({ length: 13 }).map((_, i) => {
  const a = i * 2.39996;
  const yy = 0.25 + (i / 13) * 0.7;
  const rr = Math.sqrt(1 - yy * yy);
  return [Math.cos(a) * rr, yy, Math.sin(a) * rr] as [number, number, number];
});

const Hair: React.FC<{ look: Look }> = ({ look }) => {
  const h = mat(look.hair, 0.72);
  const cap = geo("haircap", () => new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  switch (look.hairStyle) {
    case "bald":
      return null;
    case "cap":
      return (
        <group>
          <mesh
            geometry={cap}
            position={[0, 0.008, -0.004]}
            rotation={[-0.3, 0, 0]}
            scale={[0.104, 0.112, 0.112]}
            material={mat(look.capColor, 0.85)}
            castShadow
          />
          <mesh
            geometry={box()}
            position={[0, 0.052, 0.112]}
            rotation={[-0.12, 0, 0]}
            scale={[0.098, 0.009, 0.085]}
            material={mat(look.capColor, 0.85)}
          />
        </group>
      );
    default:
      return (
        <group>
          <mesh
            geometry={cap}
            position={[0, 0.006, -0.004]}
            rotation={[-0.45, 0, 0]}
            scale={look.hairStyle === "short" ? [0.099, 0.122, 0.108] : [0.102, 0.126, 0.111]}
            material={h}
            castShadow
          />
          {look.hairStyle === "long" ? (
            <mesh
              geometry={capsule(0.05, 0.14)}
              position={[0, -0.085, -0.058]}
              scale={[1.95, 1, 0.75]}
              material={h}
              castShadow
            />
          ) : null}
          {look.hairStyle === "bun" ? (
            <mesh geometry={sphere(16)} position={[0, 0.095, -0.066]} scale={0.045} material={h} />
          ) : null}
          {look.hairStyle === "pony" ? (
            <mesh
              geometry={capsule(0.024, 0.12)}
              position={[0, -0.035, -0.118]}
              rotation={[0.35, 0, 0]}
              material={h}
            />
          ) : null}
          {look.hairStyle === "curly"
            ? CURLS.map((c, i) => (
                <mesh
                  key={i}
                  geometry={sphere(10)}
                  position={[c[0] * 0.1, c[1] * 0.12 + 0.01, c[2] * 0.1 - 0.012]}
                  scale={0.034}
                  material={h}
                />
              ))
            : null}
        </group>
      );
  }
};

/* ------------------------------------------------------------------ */
/* Person                                                               */
/* ------------------------------------------------------------------ */

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const Human: React.FC<{
  sp: Spec;
  look: Look;
  st: PState;
  t: number;
  cam: THREE.Vector3;
  detail: boolean;
}> = ({ sp, look, st, t, cam, detail }) => {
  const k = sp.height / 1.78;
  const w = look.width;
  const joy = sp.kid ? 1 : 0.65;

  // ---- base pose by role, then airborne / crouch / floating layers
  let pose: Pose;
  // where the viewer is, seen from this person's head
  const headY = st.y + 1.66 * k;
  const rx = cam.x - st.x;
  const rz = cam.z - st.z;
  const flat = Math.hypot(rx, rz);
  const dist = Math.hypot(flat, cam.y - headY);
  const rel = wrap(Math.atan2(rx, rz) - st.heading - st.ty);
  const elev = Math.atan2(cam.y - headY, flat);
  // the balloon seller waves while you come past (until your first leap); the woman by the river is
  // stunned from your last leap on
  const waveW =
    sp.role === "greet" && !st.free
      ? smooth(2.6, 3.6, t) *
        smooth(13, 9, dist) *
        smooth(1.9, 1.3, Math.abs(rel)) *
        (1 - smooth(11.2, 12.4, t))
      : 0;
  const shock = sp.role === "stare" ? smooth(25.2, 26.6, t) : 0;

  if (sp.role === "sit") pose = seated(t, sp.seed);
  else if (sp.role === "group") pose = talking(t, sp.seed);
  else if (sp.role === "photo") pose = filming(t, sp.seed);
  else if (sp.role === "greet") pose = greeting(t, sp.seed, waveW);
  else if (sp.role === "stare") pose = staring(t, sp.seed, smooth(0.25, 1.0, elev) * shock, shock);
  else
    pose = mixP(
      P0,
      walk(st.phase, Math.min(1.2, st.speed / Math.max(0.5, sp.speed)), sp.kid),
      Math.min(1, st.speed / 0.25),
    );

  if (st.air && !st.free) {
    const since = t - st.jumpAt;
    pose = mixP(pose, airborne(st.vy, joy, st.jumpKind === 2), smooth(0, 0.12, since));
  } else if (!st.free) {
    const land = t - st.landAt;
    if (land < 0.32) {
      // blend out of the air pose and absorb the landing
      pose = mixP(pose, airborne(-st.impact, joy, false), 1 - smooth(0, 0.14, land));
      pose = crouch(pose, (1 - land / 0.32) * Math.min(1, Math.max(0.25, st.impact / 3)));
    }
    const toJump = st.nextJump - t;
    if (toJump > 0 && toJump < 0.2 && sp.role !== "sit")
      pose = crouch(pose, (1 - toJump / 0.2) * (sp.kid ? 0.6 : 0.45));
  }
  if (st.free) pose = mixP(pose, floating(t, sp.seed), smooth(st.freeAt, st.freeAt + 0.9, t));

  // ---- glance at the viewer when they are near and in front (the two watchers keep their eyes on you;
  // their head stops turning sideways when you are nearly straight overhead, so it never swings)
  const lookW =
    watches(sp.role) && !st.free
      ? smooth(16, 11, dist)
      : smooth(10, 5, dist) * smooth(2.1, 1.4, Math.abs(rel)) * (st.free ? 0.6 : 1);
  const yawW = lookW * smooth(0.6, 1.6, flat);
  const pitchMax = sp.role === "stare" ? 1.05 : 0.6;
  pose.headYaw = pose.headYaw * (1 - yawW) + Math.max(-1.0, Math.min(1.0, rel)) * yawW;
  pose.headPitch = pose.headPitch * (1 - lookW) - Math.max(-pitchMax, Math.min(pitchMax, elev)) * lookW;

  // ---- face: blinking, surprise as gravity fails, kids grin
  const per = 3 + (sp.seed % 3);
  const blinkPh = (t + sp.seed * 0.37) % per;
  const blink = blinkPh < 0.13 ? Math.sin((blinkPh / 0.13) * Math.PI) : 0;
  const gNow = Math.max(0, Math.min(1, 1 - (t - 4) / 28));
  const surprise = Math.max(
    st.free ? smooth(st.freeAt, st.freeAt + 0.6, t) : 0,
    sp.kid ? 0 : smooth(0.7, 0.25, gNow) * 0.6,
  );
  let mouthO = st.free ? surprise : sp.kid ? 0 : Math.max(0, surprise - 0.3);
  let smile = sp.kid ? 1 : 0.55 - surprise * 0.4;
  let brow = 0.007 * surprise;
  if (waveW > 0) {
    // a big friendly grin, brows up
    smile += (1 - smile) * waveW;
    mouthO *= 1 - waveW;
    brow += (0.004 - brow) * waveW;
  }
  if (shock > 0) {
    // jaw dropped, brows high
    mouthO = Math.max(mouthO, 0.85 * shock);
    brow = Math.max(brow, 0.0075 * shock);
    smile *= 1 - shock;
  }

  const skin = mat(look.skin, 0.6);
  const top = mat(look.top, 0.92);
  const bottom = mat(look.bottom, 0.9);
  const torsoGeo = lathe(look.female ? "f" : "m", look.female ? TORSO_F : TORSO_M);
  const longSleeve = look.sleeves !== "short";
  const cy = 0.95; // tumble pivot (body centre), model units

  return (
    <group position={[st.x, st.y, st.z]} scale={k}>
      <group position={[0, cy, 0]} rotation={[st.tx, st.heading + st.ty, st.tz]}>
        <group position={[0, -cy, 0]}>
          {/* pelvis */}
          <group position={[0, pose.pelvisY, 0]} rotation={[0, pose.pelvisYaw, pose.pelvisRoll]}>
            {look.legs === "dress" ? (
              <mesh
                geometry={geo("skirt", () => new THREE.CylinderGeometry(0.15, 0.27, 0.48, 28))}
                position={[0, -0.2, 0]}
                scale={[w, 1, 0.78]}
                material={top}
                castShadow
              />
            ) : (
              <mesh geometry={lathe("hips", HIPS)} scale={[w, 1, 0.64]} material={bottom} castShadow />
            )}
            {/* legs */}
            {([0, 1] as const).map((i) => {
              const s = i ? 1 : -1;
              const thighMat = look.legs === "pants" ? bottom : skin;
              const shinMat = look.legs === "pants" ? bottom : skin;
              return (
                <group
                  key={i}
                  position={[s * 0.088 * w, -0.04, 0]}
                  rotation={[pose.hipX[i], 0, pose.hipZ[i]]}
                >
                  <mesh
                    geometry={lathe("thigh", THIGH)}
                    scale={look.legs === "pants" ? [1.1, 1, 1.1] : [1, 1, 1]}
                    material={thighMat}
                    castShadow
                  />
                  {look.legs === "shorts" ? (
                    <mesh
                      geometry={lathe("thigh", THIGH)}
                      scale={[1.1, 0.42, 1.1]}
                      material={bottom}
                      castShadow
                    />
                  ) : null}
                  <group position={[0, -0.44, 0]} rotation={[pose.knee[i], 0, 0]}>
                    <mesh
                      geometry={sphere(16)}
                      scale={look.legs === "pants" ? 0.054 : 0.046}
                      material={look.legs === "pants" ? bottom : skin}
                    />
                    <mesh
                      geometry={lathe("shin", SHIN)}
                      scale={look.legs === "pants" ? [1.14, 1, 1.14] : [1, 1, 1]}
                      material={shinMat}
                      castShadow
                    />
                    <group position={[0, -0.42, 0]} rotation={[pose.ankle[i], 0, 0]}>
                      <mesh
                        geometry={sphere(12)}
                        scale={look.legs === "pants" ? 0.036 : 0.031}
                        material={look.legs === "pants" ? bottom : skin}
                      />
                      <mesh
                        geometry={capsule(0.046, 0.17)}
                        position={[0, -0.038, 0.045]}
                        rotation={[Math.PI / 2, 0, 0]}
                        scale={[1.05, 1, 0.72]}
                        material={mat(look.shoe.up, 0.55)}
                        castShadow
                      />
                      <mesh
                        geometry={box()}
                        position={[0, -0.066, 0.045]}
                        scale={[0.088, 0.014, 0.25]}
                        material={mat(look.shoe.sole, 0.6)}
                      />
                    </group>
                  </group>
                </group>
              );
            })}
            {/* spine */}
            <group rotation={[pose.spinePitch, pose.spineYaw, 0]}>
              <mesh geometry={torsoGeo} scale={[w, 1, 0.62]} material={top} castShadow />
              {look.sleeves === "hoodie" ? (
                <>
                  <mesh
                    geometry={sphere(16)}
                    position={[0, 0.49, -0.085]}
                    scale={[0.11, 0.06, 0.08]}
                    material={top}
                  />
                  <mesh
                    geometry={box()}
                    position={[0, 0.12, 0.098]}
                    scale={[0.17 * w, 0.1, 0.02]}
                    material={mat(look.top, 0.95)}
                  />
                </>
              ) : null}
              {look.backpack ? (
                <group>
                  <mesh
                    geometry={capsule(0.07, 0.2)}
                    position={[0, 0.28, -0.155]}
                    scale={[1.6, 1, 0.9]}
                    material={mat(look.bag, 0.8)}
                    castShadow
                  />
                  {[-1, 1].map((s) => (
                    <mesh
                      key={s}
                      geometry={box()}
                      position={[s * 0.09 * w, 0.4, 0.0]}
                      rotation={[0.2, 0, 0]}
                      scale={[0.03, 0.02, 0.24]}
                      material={mat(look.bag, 0.8)}
                    />
                  ))}
                </group>
              ) : null}
              {/* arms */}
              {([0, 1] as const).map((i) => {
                const s = i ? 1 : -1;
                return (
                  <group key={i} position={[s * 0.148 * w, 0.45, 0]} rotation={[pose.shX[i], 0, pose.shZ[i]]}>
                    <mesh geometry={sphere(18)} scale={[0.047, 0.046, 0.05]} material={top} castShadow />
                    <mesh
                      geometry={lathe("uarm", UPPER_ARM)}
                      scale={longSleeve ? [1.04, 1, 1.04] : [0.94, 1, 0.94]}
                      material={longSleeve ? top : skin}
                      castShadow
                    />
                    {!longSleeve ? (
                      <mesh
                        geometry={lathe("uarm", UPPER_ARM)}
                        scale={[1.08, 0.36, 1.08]}
                        material={top}
                        castShadow
                      />
                    ) : null}
                    <group position={[0, -0.285, 0]} rotation={[pose.elbow[i], 0, 0]}>
                      <mesh
                        geometry={sphere(14)}
                        scale={longSleeve ? 0.0395 : 0.036}
                        material={longSleeve ? top : skin}
                      />
                      <mesh
                        geometry={lathe("farm", FOREARM)}
                        scale={longSleeve ? [1.04, 1, 1.04] : [0.94, 1, 0.94]}
                        material={longSleeve ? top : skin}
                        castShadow
                      />
                      {longSleeve ? (
                        <mesh
                          geometry={capsule(0.034, 0.02)}
                          position={[0, -0.225, 0]}
                          material={mat(look.top, 0.95)}
                        />
                      ) : null}
                      <group position={[0, -0.25, 0]}>
                        <mesh geometry={sphere(12)} scale={0.027} material={skin} />
                        <mesh
                          geometry={sphere(14)}
                          position={[0, -0.058, 0.004]}
                          scale={[0.023, 0.063, 0.04]}
                          material={skin}
                          castShadow
                        />
                        <mesh
                          geometry={capsule(0.012, 0.035)}
                          position={[s * -0.02, -0.032, 0.03]}
                          rotation={[-0.6, 0, s * -0.5]}
                          material={skin}
                        />
                        {sp.role === "photo" && i === 1 ? (
                          <mesh
                            geometry={box()}
                            position={[s * -0.03, -0.1, 0.05]}
                            rotation={[0.2, 0, 0.3]}
                            scale={[0.075, 0.15, 0.01]}
                            material={mat("#111114", 0.3, 0.4)}
                          />
                        ) : null}
                      </group>
                    </group>
                  </group>
                );
              })}
              {/* neck + head */}
              <group position={[0, 0.515, 0.005]}>
                <mesh
                  geometry={geo("neck", () => new THREE.CylinderGeometry(0.042, 0.046, 0.11, 16))}
                  position={[0, 0.04, 0]}
                  material={skin}
                  castShadow
                />
                <group position={[0, 0.165, 0.012]} rotation={[pose.headPitch, pose.headYaw, pose.headRoll]}>
                  <Face
                    look={look}
                    blink={blink}
                    mouthO={mouthO}
                    smile={smile}
                    brow={brow}
                    eyeX={Math.max(-0.003, Math.min(0.003, -pose.headYaw * 0.004))}
                    detail={detail}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
