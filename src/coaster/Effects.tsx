import React, { useMemo } from "react";
import * as THREE from "three";
import { MARK, NFRAMES, TR, frameAt, sAt } from "./track";
import { BEAT, FPS, PHOTO_MAST, smooth } from "./world";

/**
 * The splashdown and the on-ride camera.
 *
 * Splash: the train's scoops plough the trough, throwing two walls of water out to either side. Every
 * half metre of trough is struck when the front row passes it; from then its water flies on ballistic
 * paths (out, up, and on with the train a little), so the walls rise beside you and fall behind. Sheets
 * for the bulk, droplets for the spray, foam on the water where it's been.
 *
 * The camera: a mast beside the pull-out with a camera box and its flash, which fires as you pass.
 */

const G = 9.81;
const SPLASH = { s0: MARK.splash0 - 1.0, s1: MARK.splash1 + 2.0, step: 0.5 };

/** When the front row reached track position s (video seconds). */
const hitTimes = (() => {
  const S = TR.frames.s;
  const out: number[] = [];
  for (let s = SPLASH.s0; s <= SPLASH.s1; s += SPLASH.step) {
    let f = 0;
    while (f < NFRAMES - 1 && S[f + 1] < s) f++;
    const k = S[f + 1] > S[f] ? (s - S[f]) / (S[f + 1] - S[f]) : 0;
    out.push((f + Math.min(1, Math.max(0, k))) / FPS);
  }
  return out;
})();

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const NF = 10; // points across a sheet (slow water .. fast water)
const SLICES = hitTimes.length;

export const Splash: React.FC<{ t: number }> = ({ t }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = SLICES * 2 * NF;
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const idx: number[] = [];
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < SLICES - 1; i++)
        for (let j = 0; j < NF - 1; j++) {
          const a = (side * SLICES + i) * NF + j;
          const b = (side * SLICES + i + 1) * NF + j;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    g.setIndex(idx);
    return g;
  }, []);
  const drops = useMemo(() => {
    const per = 26;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * per * 3), 3));
    return { g, per };
  }, []);
  const foam = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SLICES * 2 * 4), 4));
    const idx: number[] = [];
    for (let i = 0; i < SLICES - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    g.setIndex(idx);
    return g;
  }, []);
  const mats = useMemo(
    () => ({
      sheet: new THREE.MeshStandardMaterial({
        color: "#E8F4F6",
        roughness: 0.25,
        transparent: true,
        vertexColors: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      drop: new THREE.PointsMaterial({ color: "#F2FAFF", size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }),
      foam: new THREE.MeshStandardMaterial({ color: "#F4F8F8", roughness: 0.6, transparent: true, vertexColors: true, depthWrite: false }),
    }),
    [],
  );
  if (t < hitTimes[0] - 0.1 || t > hitTimes[SLICES - 1] + 6) return null;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const dpos = drops.g.attributes.position as THREE.BufferAttribute;
  const fpos = foam.attributes.position as THREE.BufferAttribute;
  const fcol = foam.attributes.color as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  let di = 0;
  for (let i = 0; i < SLICES; i++) {
    const s = SPLASH.s0 + i * SPLASH.step;
    const f = frameAt(s);
    const age = t - hitTimes[i];
    const v = 26;
    // fade the walls in over the trough's entry and exit
    const edge = smooth(0, 4, i) * smooth(SLICES - 1, SLICES - 7, i);
    for (let side = 0; side < 2; side++) {
      const sd = side ? 1 : -1;
      const L = f.P.clone().addScaledVector(f.U, -1.05).addScaledVector(f.R, sd * 0.9);
      const k1 = 0.85 + 0.3 * hash(i * 2 + side);
      const v0 = new THREE.Vector3()
        .addScaledVector(f.R, sd * 7.5 * k1)
        .addScaledVector(f.U, 8.5 * k1)
        .addScaledVector(f.T, 0.22 * v);
      for (let j = 0; j < NF; j++) {
        const fr = j / (NF - 1);
        const vv = v0.clone().multiplyScalar(0.3 + 0.7 * fr);
        const a = Math.max(0, age);
        p.copy(L).addScaledVector(vv, a);
        p.y -= 0.5 * G * a * a;
        // water below the lake's surface has rejoined it
        const under = p.y < -0.12;
        if (under) p.y = -0.12;
        const k = (side * SLICES + i) * NF + j;
        pos.setXYZ(k, p.x, p.y, p.z);
        const alpha = age < 0 ? 0 : edge * smooth(0, 0.08, age) * (1 - smooth(0.7, 1.6, age)) * (0.25 + 0.5 * Math.sin(Math.PI * fr)) * (under ? 0 : 1);
        col.setXYZW(k, 1, 1, 1, alpha);
      }
      // spray droplets: launched with the sheet, a little faster and scattered
      for (let q = 0; q < drops.per; q++) {
        const h1 = hash(i * 97 + side * 31 + q);
        const h2 = hash(i * 13 + side * 7 + q * 3.1);
        const h3 = hash(i * 5 + q * 11.7 + side);
        const vv = v0
          .clone()
          .multiplyScalar(0.4 + 0.9 * h1)
          .addScaledVector(f.T, (h2 - 0.5) * 4)
          .addScaledVector(f.U, (h3 - 0.3) * 4);
        const a = Math.max(0, age) * (age > 0 ? 1 : 0);
        p.copy(L).addScaledVector(vv, a);
        p.y -= 0.5 * G * a * a;
        if (age <= 0 || p.y < -0.1 || edge < 0.2) p.set(0, -100, 0);
        dpos.setXYZ(di++, p.x, p.y, p.z);
      }
      // foam on the water either side of the trough
      const fp = f.P.clone().addScaledVector(f.R, sd * 3.2);
      fpos.setXYZ(i * 2 + side, fp.x, -0.1, fp.z);
      fcol.setXYZW(i * 2 + side, 1, 1, 1, age < 0 ? 0 : edge * 0.7 * (1 - smooth(1, 6, age)));
    }
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  dpos.needsUpdate = true;
  fpos.needsUpdate = true;
  fcol.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  drops.g.computeBoundingSphere();
  foam.computeBoundingSphere();
  return (
    <>
      <mesh geometry={geo} material={mats.sheet} frustumCulled={false} renderOrder={5} />
      <points geometry={drops.g} material={mats.drop} frustumCulled={false} renderOrder={6} />
      <mesh geometry={foam} material={mats.foam} frustumCulled={false} renderOrder={4} />
    </>
  );
};

/** The on-ride camera on its mast; its flash fires as the front row comes past. */
export const PhotoMast: React.FC<{ t: number }> = ({ t }) => {
  const m = PHOTO_MAST;
  const fire = Math.exp(-Math.max(0, t - BEAT.photo) / 0.05) * smooth(BEAT.photo - 0.034, BEAT.photo, t);
  const dir = useMemo(() => {
    const f = frameAt(sAt(Math.round(BEAT.photo * FPS)));
    return f.P.clone().sub(m).setY(0).normalize();
  }, [m]);
  const yaw = Math.atan2(dir.x, dir.z);
  return (
    <group>
      <mesh position={[m.x, m.y / 2 - 0.3, m.z]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, m.y - 0.6, 10]} />
        <meshStandardMaterial color="#3A3D42" roughness={0.5} metalness={0.5} />
      </mesh>
      <group position={m} rotation={[0, yaw, 0]}>
        <mesh position={[0, 0, -0.05]} castShadow>
          <boxGeometry args={[0.36, 0.3, 0.5]} />
          <meshStandardMaterial color="#2C2F35" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
          <meshStandardMaterial color="#111" roughness={0.2} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.28, 0.1]}>
          <boxGeometry args={[0.5, 0.18, 0.12]} />
          <meshStandardMaterial color="#DDD" emissive="#ffffff" emissiveIntensity={fire * 40} />
        </mesh>
      </group>
      {fire > 0.01 ? <pointLight position={m.clone().add(new THREE.Vector3(0, 0.3, 0))} intensity={25 * fire} distance={18} decay={1.4} color="#FFFFFF" /> : null}
    </group>
  );
};
