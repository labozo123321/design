import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { markRider } from "./Train";
import { skinShade } from "./face/Head";

/**
 * A hand: a padded palm, four fingers of three bones each and a thumb, knuckles and nails. Built at the
 * wrist: the fingers point down -y, the palm faces +z, the thumb is on +x (a right hand; mirror x for a
 * left). Each finger bends toward the palm by its curl (radians per joint).
 */

export type HandPose = {
  /** curl of each finger [index, middle, ring, little], 0 straight .. ~1.5 fist (per joint) */
  curl: [number, number, number, number];
  /** fingers fanned apart */
  spread: number;
  /** thumb: across the palm (0) .. out (1), and its own bend */
  thumbOut: number;
  thumbCurl: number;
};

export const GRIP: HandPose = { curl: [1.15, 1.2, 1.22, 1.25], spread: 0.05, thumbOut: 0.25, thumbCurl: 0.7 };
export const RELAX: HandPose = { curl: [0.25, 0.32, 0.36, 0.42], spread: 0.15, thumbOut: 0.5, thumbCurl: 0.2 };
export const OPEN: HandPose = { curl: [0.05, 0.05, 0.08, 0.1], spread: 0.5, thumbOut: 0.9, thumbCurl: 0.05 };
export const THUMBS_UP: HandPose = { curl: [1.45, 1.5, 1.5, 1.5], spread: 0, thumbOut: 1.0, thumbCurl: -0.1 };

export const mixHand = (a: HandPose, b: HandPose, k: number): HandPose => ({
  curl: a.curl.map((c, i) => c + (b.curl[i] - c) * k) as HandPose["curl"],
  spread: a.spread + (b.spread - a.spread) * k,
  thumbOut: a.thumbOut + (b.thumbOut - a.thumbOut) * k,
  thumbCurl: a.thumbCurl + (b.thumbCurl - a.thumbCurl) * k,
});

const FINGERS = [
  { x: 0.027, len: [0.042, 0.025, 0.019], r: 0.0092 },
  { x: 0.008, len: [0.046, 0.028, 0.02], r: 0.0095 },
  { x: -0.011, len: [0.043, 0.026, 0.019], r: 0.0089 },
  { x: -0.028, len: [0.034, 0.02, 0.017], r: 0.0079 },
];
const PALM_L = 0.086;

const geoCache: Record<string, THREE.BufferGeometry> = {};
const cap = (r: number, l: number) => (geoCache[`c${r}${l}`] ??= new THREE.CapsuleGeometry(r, l, 6, 12));
const sph = () => (geoCache.s ??= new THREE.SphereGeometry(1, 16, 12));

const matCache: Record<string, THREE.MeshPhysicalMaterial> = {};
export const skinMat = (tone: string) => {
  if (matCache[tone]) return matCache[tone];
  const m = new THREE.MeshPhysicalMaterial({
    color: tone,
    roughness: 0.55,
    sheen: 0.35,
    sheenColor: new THREE.Color("#FFAE98"),
  });
  m.onBeforeCompile = (s) => skinShade(s);
  m.customProgramCacheKey = () => "skinlike";
  matCache[tone] = markRider(m);
  return matCache[tone];
};
const nailMat = (tone: string) => {
  const k = `nail${tone}`;
  if (matCache[k]) return matCache[k];
  matCache[k] = markRider(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(tone).lerp(new THREE.Color("#F5D0C8"), 0.55),
      roughness: 0.25,
      clearcoat: 0.8,
    }),
  );
  return matCache[k];
};

const Finger: React.FC<{ f: (typeof FINGERS)[number]; curl: number; splay: number; tone: string; nail: boolean; mat?: THREE.Material; fat?: number }> = ({
  f,
  curl,
  splay,
  tone,
  nail,
  mat,
  fat = 1,
}) => {
  const m = mat ?? skinMat(tone);
  const [l0, l1, l2] = f.len;
  const r = f.r * fat;
  // joints: the big knuckle bends the most, the tip the least
  const c0 = curl * 0.95;
  const c1 = curl * 1.15;
  const c2 = curl * 0.75;
  return (
    <group position={[f.x, -PALM_L, 0]} rotation={[0, 0, splay]}>
      <mesh geometry={sph()} material={m} scale={r * 1.12} />
      <group rotation={[c0, 0, 0]}>
        <mesh geometry={cap(r, l0 - r * 1.2)} material={m} position={[0, -l0 / 2, 0]} />
        <group position={[0, -l0, 0]} rotation={[c1, 0, 0]}>
          <mesh geometry={sph()} material={m} scale={r * 0.98} />
          <mesh geometry={cap(r * 0.93, l1 - r)} material={m} position={[0, -l1 / 2, 0]} />
          <group position={[0, -l1, 0]} rotation={[c2, 0, 0]}>
            <mesh geometry={cap(r * 0.86, l2 - r * 0.7)} material={m} position={[0, -l2 / 2, 0]} />
            {nail ? (
              <mesh
                geometry={sph()}
                material={nailMat(tone)}
                position={[0, -l2 * 0.62, -r * 0.62]}
                scale={[r * 0.72, l2 * 0.36, r * 0.28]}
              />
            ) : null}
          </group>
        </group>
      </group>
    </group>
  );
};

export const Hand: React.FC<{ pose: HandPose; tone: string; side?: number; scale?: number; /** a glove instead of skin */ mat?: THREE.Material }> = ({
  pose,
  tone,
  side = 1,
  scale = 1,
  mat,
}) => {
  const palm = useMemo(() => {
    const g = new RoundedBoxGeometry(0.082, PALM_L, 0.03, 4, 0.012);
    g.translate(0, -PALM_L / 2, 0);
    // a slightly cupped palm, thicker at the heel
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const z = p.getZ(i);
      const heel = 1 + 0.35 * Math.max(0, (y + 0.02) / 0.03);
      p.setZ(i, z * heel + (z > 0 ? -0.004 * Math.cos((p.getX(i) / 0.041) * 1.3) : 0));
      p.setX(i, p.getX(i) * (1 - 0.12 * Math.max(0, -y / PALM_L - 0.6)));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const m = mat ?? skinMat(tone);
  const fat = mat ? 1.12 : 1;
  return (
    <group scale={[side * scale, scale, scale]}>
      <mesh geometry={palm} material={m} castShadow scale={mat ? [1.04, 1, 1.15] : 1} />
      {FINGERS.map((f, i) => (
        <Finger key={i} f={f} curl={pose.curl[i]} splay={(i - 1.5) * -0.08 * pose.spread} tone={tone} nail={!mat} mat={mat} fat={fat} />
      ))}
      {/* thumb: from the heel of the palm, out to the side and forward, two bones */}
      <group position={[0.032, -0.022, 0.006]} rotation={[0.35 + 0.5 * (1 - pose.thumbOut), -0.5, 0.45 + 0.6 * pose.thumbOut]}>
        <mesh geometry={cap(0.0125, 0.026)} material={m} position={[0, -0.02, 0]} />
        <group position={[0, -0.04, 0]} rotation={[pose.thumbCurl * 0.8, 0, 0]}>
          <mesh geometry={sph()} material={m} scale={0.0108} />
          <mesh geometry={cap(0.0103, 0.016)} material={m} position={[0, -0.014, 0]} />
          <group position={[0, -0.029, 0]} rotation={[pose.thumbCurl * 0.7, 0, 0]}>
            <mesh geometry={cap(0.0095, 0.013)} material={m} position={[0, -0.011, 0]} />
            <mesh
              geometry={sph()}
              material={mat ?? nailMat(tone)}
              position={[0, -0.015, -0.0066]}
              scale={[0.0078, 0.0085, 0.0026]}
            />
          </group>
        </group>
      </group>
    </group>
  );
};
