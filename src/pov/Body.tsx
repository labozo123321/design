import React from "react";
import * as THREE from "three";
import { interpolate, random } from "remotion";
import { FLOAT_AT, T } from "./timeline";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const mats: Record<string, THREE.MeshStandardMaterial> = {};
export const mat = (c: string, rough = 0.8) =>
  (mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
export const SKIN = "#D9A37A";
export const SLEEVE = "#3B4352"; // charcoal hoodie
const SHOE = "#EDEDED";

/** How far the arms are raised into view (0 hidden at the sides, 1 reaching forward). */
const armReach = (frame: number) => {
  let r = 0;
  for (const f of T.takeoffs) {
    const d = frame - f;
    if (d > -4 && d < 40) r = Math.max(r, interpolate(d, [-4, 4, 26, 40], [0, 0.55, 0.55, 0], CLAMP));
  }
  const fl = interpolate(
    frame,
    [FLOAT_AT - 4, FLOAT_AT + 30, 36 * 30, 38 * 30, 44 * 30, 49 * 30, 60 * 30, 64 * 30],
    [0, 1, 1, 0.45, 0.45, 0.9, 0.9, 1.1],
    CLAMP,
  );
  return Math.max(r, frame >= FLOAT_AT - 4 ? fl : 0);
};

export const Hand: React.FC<{ side: number; spread: number; curl: number }> = ({ side, spread, curl }) => (
  <group>
    <mesh scale={[0.085, 0.03, 0.1]} material={mat(SKIN, 0.6)}>
      <sphereGeometry args={[1, 16, 12]} />
    </mesh>
    {[0, 1, 2, 3].map((k) => {
      const x = (k - 1.5) * 0.034 * side;
      const ang = (k - 1.5) * spread * 0.12 * side;
      return (
        <group key={k} position={[x, 0, -0.08]} rotation={[-curl * (0.6 + k * 0.05), ang, 0]}>
          <mesh position={[0, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
            <capsuleGeometry args={[0.012, k === 0 || k === 3 ? 0.045 : 0.06, 4, 8]} />
          </mesh>
        </group>
      );
    })}
    <group position={[0.07 * side, 0, -0.01]} rotation={[0, side * (0.7 + spread * 0.3), 0]}>
      <mesh position={[0, 0, -0.035]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
        <capsuleGeometry args={[0.014, 0.045, 4, 8]} />
      </mesh>
    </group>
  </group>
);

/** Both arms, in camera space: hidden at the sides, rising into frame on leaps, reaching out while floating. */
export const Arms: React.FC<{ frame: number }> = ({ frame }) => {
  const reach = armReach(frame);
  if (reach < 0.02) return null;
  const t = frame / 30;
  const drift = (k: number) => Math.sin(t * 0.9 + k) * 0.06 + Math.sin(t * 2.3 + k * 2) * 0.02;
  const flail = interpolate(t, [37.5, 39, 43, 45], [0, 1, 1, 0], CLAMP);
  return (
    <group>
      {[-1, 1].map((side) => {
        const lift = reach;
        const sh = new THREE.Vector3(side * 0.22, -0.32 + (1 - lift) * -0.25, 0.05);
        const pitch = -0.2 - lift * 1.0 + drift(side) + Math.sin(t * 7 + side) * 0.25 * flail;
        const yaw = side * (0.18 + lift * 0.12) + drift(side + 3) * 0.6;
        return (
          <group key={side} position={sh} rotation={[pitch, yaw, side * -0.15]}>
            {/* upper arm + sleeve */}
            <mesh position={[0, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
              <capsuleGeometry args={[0.055, 0.24, 6, 12]} />
            </mesh>
            <group position={[0, 0, -0.34]} rotation={[0.35 - lift * 0.25 + drift(side + 7), 0, 0]}>
              <mesh position={[0, 0, -0.14]} rotation={[Math.PI / 2, 0, 0]} material={mat(SKIN, 0.6)}>
                <capsuleGeometry args={[0.042, 0.22, 6, 12]} />
              </mesh>
              {/* cuff */}
              <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]} material={mat(SLEEVE, 0.9)}>
                <cylinderGeometry args={[0.058, 0.058, 0.05, 12]} />
              </mesh>
              <group position={[0, 0, -0.3]} rotation={[0.1 + drift(side + 9) * 0.5, 0, side * 0.2]}>
                <Hand
                  side={side}
                  spread={0.4 + lift * 0.6}
                  curl={0.6 - lift * 0.45 + Math.abs(drift(side + 11))}
                />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Your own body below the eyes (yaw-only space: it stays upright)       */
/* ------------------------------------------------------------------ */

const geos: Record<string, THREE.BufferGeometry> = {};
/** Profiles are written top to bottom; LatheGeometry wants them bottom to top (outward faces). */
export const lathe = (key: string, pts: [number, number][]) =>
  (geos[key] ??= new THREE.LatheGeometry(
    (pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)),
    36,
  ));
/** Shirt from the shoulders to the waist (radius, height below the eyes). */
export const TORSO: [number, number][] = [
  [0.001, -0.27],
  [0.08, -0.275],
  [0.15, -0.31],
  [0.182, -0.37],
  [0.192, -0.46],
  [0.188, -0.58],
  [0.18, -0.7],
  [0.174, -0.82],
  [0.171, -0.89],
  [0.001, -0.9],
];
export const THIGH: [number, number][] = [
  [0.001, 0.03],
  [0.07, 0.015],
  [0.088, -0.04],
  [0.085, -0.15],
  [0.074, -0.29],
  [0.062, -0.4],
  [0.057, -0.44],
  [0.001, -0.455],
];
export const SHIN: [number, number][] = [
  [0.001, 0.015],
  [0.056, 0.0],
  [0.06, -0.07],
  [0.058, -0.15],
  [0.05, -0.27],
  [0.047, -0.37],
  [0.05, -0.41],
  [0.001, -0.42],
];

let denimTex: THREE.Texture | null = null;
/** Denim: a fine diagonal twill with a little fading. */
const denim = () => {
  if (denimTex) return denimTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3C5E8C";
  g.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 128; i += 4) {
    g.strokeStyle = i % 8 ? "rgba(255,255,255,0.10)" : "rgba(10,20,40,0.18)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(i, 128);
    g.lineTo(i + 128, 0);
    g.stroke();
  }
  for (let k = 0; k < 400; k++) {
    g.fillStyle = k % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    g.fillRect(random(`dnx${k}`) * 128, random(`dny${k}`) * 128, 2, 2);
  }
  denimTex = new THREE.CanvasTexture(c);
  denimTex.wrapS = denimTex.wrapT = THREE.RepeatWrapping;
  denimTex.repeat.set(5, 4);
  denimTex.colorSpace = THREE.SRGBColorSpace;
  return denimTex;
};
let jeansMat: THREE.MeshStandardMaterial | null = null;
export const jeans = () => (jeansMat ??= new THREE.MeshStandardMaterial({ map: denim(), roughness: 0.92 }));

const SHIRT = SLEEVE;
const ACCENT = "#E4572E";

/** A sneaker in the ankle's frame, toes toward -z. */
export const Sneaker: React.FC = () => (
  <group>
    <mesh
      position={[0, -0.035, -0.06]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[1, 1, 0.82]}
      material={mat(SHOE, 0.55)}
    >
      <capsuleGeometry args={[0.05, 0.16, 6, 14]} />
    </mesh>
    <mesh position={[0, -0.05, -0.16]} scale={[0.054, 0.04, 0.06]} material={mat(SHOE, 0.55)}>
      <sphereGeometry args={[1, 16, 12]} />
    </mesh>
    <mesh position={[0, -0.083, -0.066]} scale={[0.108, 0.028, 0.3]} material={mat("#DCDCD5", 0.7)}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh
        key={s}
        position={[s * 0.051, -0.04, -0.05]}
        scale={[0.006, 0.022, 0.13]}
        material={mat(ACCENT, 0.5)}
      >
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    ))}
    <mesh position={[0, -0.01, 0.045]} scale={[0.045, 0.05, 0.018]} material={mat(ACCENT, 0.5)}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  </group>
);

/**
 * Your body when you look down while floating: shirt, belt, jeans and sneakers. The legs hang relaxed and
 * drift slowly (a little more restless while the updraft hits), knees soft, toes pointing down.
 */
export const Legs: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame < FLOAT_AT - 10) return null;
  const t = frame / 30;
  const t0 = FLOAT_AT / 30;
  // from the last take-off the legs settle into the relaxed zero-g crouch: thighs drifting forward, knees
  // soft, so when you look down you see them out in front of you
  const settle = interpolate(t, [t0 - 0.2, t0 + 1.8], [0, 1], {
    ...CLAMP,
    easing: (x) => x * x * (3 - 2 * x),
  });
  const stir = interpolate(t, [37.5, 39, 44, 46], [0, 1, 1, 0], CLAMP);
  const w = (k: number, f: number) => Math.sin(t * f + k);
  // the torso sits a little behind the eyes (as it does: the face is out in front of the chest)
  const Z = 0.17;
  const D = 0.6;
  return (
    <group>
      {/* hoodie, with its hem over the belt */}
      <mesh
        geometry={lathe("torso", TORSO)}
        position={[0, 0, Z]}
        scale={[1, 1, D]}
        material={mat(SHIRT, 0.92)}
      />
      <mesh position={[0, -0.86, Z]} scale={[0.176, 0.05, 0.176 * D]} material={mat(SHIRT, 0.92)}>
        <cylinderGeometry args={[1, 1, 1, 36, 1, true]} />
      </mesh>
      {/* belt and buckle */}
      <mesh position={[0, -0.9, Z]} scale={[0.17, 0.035, 0.17 * D]} material={mat("#3A2A20", 0.6)}>
        <cylinderGeometry args={[1, 1, 1, 36]} />
      </mesh>
      <mesh
        position={[0, -0.9, Z - 0.17 * D - 0.004]}
        scale={[0.05, 0.032, 0.01]}
        material={mat("#C9C9CF", 0.3)}
      >
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* hips */}
      <mesh position={[0, -0.97, Z]} scale={[0.17, 0.12, 0.112]} material={jeans()}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {[-1, 1].map((side) => {
        // thighs drift forward, knees bend less than the hips so the shins angle out and the shoes show
        const hip = 0.12 + 0.72 * settle + 0.08 * w(side * 1.3, 0.55) + stir * 0.25 * w(side * 2, 2.6);
        const knee = -(
          0.12 +
          0.36 * settle +
          0.12 * w(side * 1.7 + 1, 0.7) +
          stir * 0.3 * Math.max(0, w(side * 2 + 1, 2.6))
        );
        const ankle = -0.5 + 0.12 * w(side + 4, 0.9);
        return (
          <group
            key={side}
            position={[side * 0.095, -0.99, Z]}
            rotation={[hip, side * 0.05, side * (0.08 + 0.03 * w(side, 0.4))]}
          >
            <mesh geometry={lathe("thigh", THIGH)} material={jeans()} />
            <group position={[0, -0.44, 0]} rotation={[knee, 0, 0]}>
              <mesh scale={0.062} material={jeans()}>
                <sphereGeometry args={[1, 16, 12]} />
              </mesh>
              <mesh geometry={lathe("shin", SHIN)} material={jeans()} />
              <group position={[0, -0.4, 0.005]} rotation={[ankle, 0, side * 0.06]}>
                <Sneaker />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
};
