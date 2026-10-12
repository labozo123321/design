import React from "react";
import * as THREE from "three";
import { Head, type Person } from "./face/Head";
import { NEUTRAL, type Expr } from "./face/sculpt";
import { GRIP, Hand, OPEN, RELAX, THUMBS_UP, type HandPose } from "./Hand";
import type { Clothes } from "./riders";

/**
 * A standing person with the riders' face and hands: in the queue, at the controls, on the viewing deck.
 * Built at their feet, facing -z, 1.75 m tall at k = 1. Poses: standing easy, waving, a thumbs up, holding
 * up a phone, cheering; the head turns to look at a point (usually you).
 */

export type Stance = "stand" | "wave" | "thumb" | "phone" | "cheer" | "point";

const geoCache: Record<string, THREE.BufferGeometry> = {};
const lathe = (key: string, pts: [number, number][]) =>
  (geoCache[key] ??= (() => {
    const g = new THREE.LatheGeometry(
      (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    );
    g.computeVertexNormals();
    return g;
  })());
const matCache: Record<string, THREE.Material> = {};
const cloth = (c: string, rough = 0.9) => (matCache[c + rough] ??= new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
const skin = (c: string) =>
  (matCache[`skin${c}`] ??= new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color("#FFAE98") }));

const LEG: [number, number][] = [
  [0.0, 0.02],
  [0.08, 0.0],
  [0.075, -0.2],
  [0.06, -0.42],
  [0.052, -0.5],
  [0.045, -0.7],
  [0.035, -0.84],
  [0.0, -0.86],
];
const ARM: [number, number][] = [
  [0.0, 0.03],
  [0.046, 0.0],
  [0.042, -0.14],
  [0.034, -0.28],
  [0.037, -0.33],
  [0.03, -0.48],
  [0.024, -0.54],
  [0.0, -0.56],
];
const TORSO: [number, number][] = [
  [0.0, -0.02],
  [0.16, -0.02],
  [0.155, 0.1],
  [0.15, 0.22],
  [0.17, 0.4],
  [0.18, 0.5],
  [0.15, 0.56],
  [0.07, 0.6],
  [0.0, 0.61],
];

const along = (d: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize());

export const Person3D: React.FC<{
  who: Person;
  clothes: Clothes;
  k?: number;
  stance?: Stance;
  t: number;
  /** a point to look at, in this person's own frame (feet at origin, facing -z) */
  lookAt?: THREE.Vector3;
  e?: Partial<Expr>;
  rider?: boolean;
  /** hair chains in head space (pigtails), and anything else worn on the head */
  chains?: THREE.Vector3[][];
  headExtra?: React.ReactNode;
  /** where the head sits (m above the feet), if not an adult's */
  headY?: number;
  /** bubblegum over the lower face (0..1) */
  gum?: number;
}> = ({ who, clothes, k = 1, stance = "stand", t, lookAt, e, rider = false, chains, headExtra, headY, gum = 0 }) => {
  const hipY = 0.9 * k;
  const shY = 1.42 * k;
  const headP = new THREE.Vector3(0, headY ?? 1.6 * k, 0.0);
  // the head turns to the point it looks at (limited like a neck), the eyes do a little more
  let yaw = 0.15 * Math.sin(t * 0.4 + who.skin.seed);
  let pitch = 0;
  if (lookAt) {
    const d = lookAt.clone().sub(headP);
    yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(-d.x, -d.z)));
    pitch = Math.max(-0.5, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
  }
  const expr: Expr = { ...NEUTRAL, smile: 0.4, ...e };
  const bp = (t + who.skin.seed * 0.7) % 3.3;
  const blink = bp < 0.13 ? Math.sin((bp / 0.13) * Math.PI) : 0;
  expr.lidL = Math.max(expr.lidL, blink);
  expr.lidR = Math.max(expr.lidR, blink);
  const top = cloth(clothes.top);
  const bottom = cloth(clothes.bottom);
  const sk = skin(who.skin.tone);
  const legMat = clothes.legs === "pants" ? bottom : sk;
  // arms: shoulder -> wrist targets by stance
  const arm = (side: number) => {
    const S = new THREE.Vector3(side * 0.18 * k, shY, 0.02);
    let W = S.clone().add(new THREE.Vector3(side * 0.06 * k, -0.52 * k, -0.04 * k));
    let hand: HandPose = RELAX;
    let palm = new THREE.Vector3(-side, 0, 0);
    const sway = Math.sin(t * 7 + side);
    if (stance === "wave" && side > 0) {
      W = S.clone().add(new THREE.Vector3((0.22 + 0.08 * sway) * k, 0.42 * k, -0.08 * k));
      hand = OPEN;
      palm = new THREE.Vector3(0, 0, -1);
    } else if (stance === "thumb" && side > 0) {
      W = S.clone().add(new THREE.Vector3(0.1 * k, 0.16 * k, -0.42 * k));
      hand = THUMBS_UP;
      palm = new THREE.Vector3(side, 0, 0);
    } else if (stance === "phone" && side > 0) {
      W = S.clone().add(new THREE.Vector3(-0.08 * k, 0.16 * k, -0.4 * k));
      hand = GRIP;
      palm = new THREE.Vector3(0, 0, 1);
    } else if (stance === "cheer") {
      W = S.clone().add(new THREE.Vector3(side * (0.18 + 0.04 * sway) * k, 0.5 * k, -0.05 * k));
      hand = OPEN;
      palm = new THREE.Vector3(0, 0, -1);
    } else if (stance === "point" && side > 0) {
      W = S.clone().add(new THREE.Vector3(0.06 * k, 0.3 * k, -0.48 * k));
      hand = { curl: [0.05, 1.4, 1.45, 1.5], spread: 0, thumbOut: 0.2, thumbCurl: 0.8 };
    }
    // two-bone IK, elbows out and down
    const a = 0.3 * k;
    const b = 0.27 * k;
    const d0 = W.clone().sub(S);
    const d = Math.min(a + b - 1e-3, d0.length());
    const dir = d0.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const pole = new THREE.Vector3(side, -0.8, 0.5);
    const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
    const Wp = S.clone().addScaledVector(dir, d);
    const fore = Wp.clone().sub(E).normalize();
    const hy = fore.clone().negate();
    const hz = palm.addScaledVector(hy, -palm.dot(hy)).normalize();
    const hx = new THREE.Vector3().crossVectors(hy, hz);
    const hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz));
    const upper = E.clone().sub(S);
    return (
      <group key={side}>
        <mesh geometry={lathe("parm", ARM.slice(0, 4).concat([[0, -0.3]]) as [number, number][])} material={clothes.sleeves === "long" ? top : sk} position={S} quaternion={along(upper)} scale={[k, upper.length() / 0.3, k]} castShadow />
        <mesh geometry={lathe("pfore", [[0, 0.02], [0.036, 0], [0.034, -0.12], [0.026, -0.26], [0, -0.27]])} material={clothes.sleeves === "long" ? top : sk} position={E} quaternion={along(fore)} scale={[k, Wp.distanceTo(E) / 0.27, k]} castShadow />
        <mesh material={top} position={S} scale={0.055 * k}>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        {clothes.sleeves === "short" ? (
          <mesh geometry={lathe("psleeve", [[0, 0.03], [0.058, 0], [0.056, -0.12], [0, -0.13]])} material={top} position={S} quaternion={along(upper)} scale={k} />
        ) : null}
        <group position={Wp} quaternion={hq}>
          <Hand pose={hand} tone={who.skin.tone} side={side} scale={k} />
          {stance === "phone" && side > 0 ? (
            <mesh position={[0, -0.07 * k, 0.02]} material={cloth("#111114", 0.3)}>
              <boxGeometry args={[0.075, 0.15, 0.01]} />
            </mesh>
          ) : null}
        </group>
      </group>
    );
  };
  return (
    <group>
      {/* legs */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={lathe("pleg", LEG)} material={legMat} position={[side * 0.1 * k, hipY, 0]} scale={[k, k, k]} castShadow />
          {clothes.legs === "shorts" ? (
            <mesh geometry={lathe("pshort", [[0, 0.02], [0.092, 0], [0.088, -0.26], [0, -0.27]])} material={bottom} position={[side * 0.1 * k, hipY, 0]} scale={k} castShadow />
          ) : null}
          <mesh material={cloth(clothes.shoe, 0.6)} position={[side * 0.1 * k, 0.045 * k, -0.06 * k]} scale={[0.05 * k, 0.045 * k, 0.13 * k]} castShadow>
            <sphereGeometry args={[1, 16, 10]} />
          </mesh>
          <mesh material={cloth(clothes.sole, 0.7)} position={[side * 0.1 * k, 0.012 * k, -0.06 * k]} scale={[0.052 * k, 0.013 * k, 0.134 * k]}>
            <sphereGeometry args={[1, 16, 8]} />
          </mesh>
        </group>
      ))}
      {/* hips, torso, neck */}
      <mesh material={bottom} position={[0, hipY - 0.02 * k, 0]} scale={[0.17 * k, 0.11 * k, 0.12 * k]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
      <mesh geometry={lathe("ptorso", TORSO)} material={top} position={[0, hipY, 0]} scale={[k, (shY + 0.08 * k - hipY) / 0.61, k * 0.68]} castShadow />
      <mesh material={sk} position={[0, (shY + headP.y) / 2 - 0.05 * k, 0.01]} scale={[0.045 * k, Math.max(0.06, headP.y - shY - 0.02), 0.047 * k]}>
        <cylinderGeometry args={[0.95, 1.05, 1, 16]} />
      </mesh>
      <group position={headP} rotation={[-pitch, Math.PI + yaw, 0, "YXZ"]}>
        <Head person={who} e={expr} rider={rider} chains={chains} gum={gum} hi />
        {headExtra}
      </group>
      {arm(-1)}
      {arm(1)}
    </group>
  );
};
