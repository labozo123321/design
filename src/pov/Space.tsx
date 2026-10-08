import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { horizonDip } from "./Sky";
import { T } from "./timeline";

/**
 * The finale above the atmosphere: an aurora rippling along the curve of the planet, and meteors
 * streaking through the air far below you. Both hang at fixed directions round the camera (like the sky),
 * placed in the part of the sky the camera turns to over the last ten seconds.
 */

const D = 5e6;
const dirOf = (az: number, el: number, out = new THREE.Vector3()) =>
  out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

const NA = 180;
const NV = 7;
const GREEN = new THREE.Color("#4DFF9A");
const TEAL = new THREE.Color("#3FE0C8");
const VIOLET = new THREE.Color("#B266FF");

/** Curtains of green light with violet tops, folding and rippling just above the limb. */
export const Aurora: React.FC<{ cam: THREE.Vector3; alt: number; t: number; o: number }> = ({
  cam,
  alt,
  t,
  o,
}) => {
  const layers = useMemo(
    () =>
      [0, 1].map(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((NA + 1) * (NV + 1) * 3), 3));
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array((NA + 1) * (NV + 1) * 3), 3));
        const idx: number[] = [];
        for (let i = 0; i < NA; i++)
          for (let j = 0; j < NV; j++) {
            const a = i * (NV + 1) + j;
            const b = (i + 1) * (NV + 1) + j;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
          }
        g.setIndex(idx);
        return g;
      }),
    [],
  );
  if (o <= 0.002) return null;
  const dip = horizonDip(alt);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  layers.forEach((geo, L) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const az0 = L ? 4.9 : 4.7;
    const span = L ? 1.1 : 1.45;
    for (let i = 0; i <= NA; i++) {
      const u = i / NA;
      const az = az0 + u * span;
      const base =
        -dip +
        0.006 +
        (L ? 0.016 : 0) +
        0.01 * Math.sin(az * 9 + t * 0.35 + L) +
        0.005 * Math.sin(az * 23 - t * 0.6);
      const h = (L ? 0.045 : 0.07) + 0.045 * (0.5 + 0.5 * Math.sin(az * 5 - t * 0.25 + L * 2));
      // rays of uneven width and brightness drifting along the curtain
      const ray =
        0.5 * Math.sin(az * 131 + t * 0.9 + L) * Math.sin(az * 47 - t * 0.5) +
        0.3 * Math.sin(az * 83 - t * 0.7 + L * 3) +
        0.2 * Math.sin(az * 19 + t * 0.3);
      const edge = Math.pow(Math.sin(Math.PI * u), 0.7);
      const I = o * edge * (0.55 + 0.45 * ray) * (0.75 + 0.25 * Math.sin(t * 1.3 + az * 3)) * (L ? 0.6 : 1);
      for (let j = 0; j <= NV; j++) {
        const w = j / NV;
        dirOf(az + Math.sin(w * 2 + t * 0.4 + az * 6) * 0.004, base + h * w, v)
          .multiplyScalar(D)
          .add(cam);
        pos.setXYZ(i * (NV + 1) + j, v.x, v.y, v.z);
        if (w < 0.3) c.copy(GREEN).lerp(TEAL, w / 0.3);
        else c.copy(TEAL).lerp(VIOLET, (w - 0.3) / 0.7);
        const k = I * Math.min(1, w / 0.06) * Math.pow(1 - w, 1.5) * 2.6;
        col.setXYZ(i * (NV + 1) + j, c.r * k, c.g * k, c.b * k);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <group>
      {layers.map((geo, L) => (
        <mesh key={L} geometry={geo} frustumCulled={false} renderOrder={-7}>
          <meshBasicMaterial
            vertexColors
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
};

const METEORS = [58.4, 59.6, 60.7, 61.7, 62.6, 63.6, 64.6].map((at, i) => {
  const r = (k: string) => random(`mt${i}${k}`);
  const f = Math.min(T.frames - 1, Math.round(at * 30));
  return {
    at,
    dur: 0.75 + r("d") * 0.35,
    az: T.yaw[f] + (r("a") - 0.5) * 0.5,
    drop: 0.06 + r("e") * 0.16, // how far below the limb it starts
    daz: (r("s") < 0.5 ? -1 : 1) * (0.08 + r("v") * 0.08),
    del: -(0.03 + r("w") * 0.05),
    tail: 0.1 + r("l") * 0.06,
    warm: r("c"),
  };
});
const SEG = 10;

/** Shooting stars burning up in the atmosphere below you: a white-hot head and a fading tail. */
export const Meteors: React.FC<{ cam: THREE.Vector3; alt: number; t: number }> = ({ cam, alt, t }) => {
  const geo = useMemo(() => {
    const n = METEORS.length * (SEG + 1) * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    METEORS.forEach((_, m) => {
      const o = m * (SEG + 1) * 2;
      for (let s = 0; s < SEG; s++) {
        const a = o + s * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    g.setIndex(idx);
    return g;
  }, []);
  if (t < METEORS[0].at - 0.1) return null;
  const dip = horizonDip(alt);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const side = new THREE.Vector3();
  const head = new THREE.Color();
  METEORS.forEach((m, mi) => {
    const age = (t - m.at) / m.dur;
    const live = age > 0 && age < 1;
    const bright = live ? Math.pow(Math.sin(Math.PI * age), 0.6) : 0;
    const len = m.tail * Math.min(1, age / 0.25);
    head.set(m.warm > 0.5 ? "#FFE9C2" : "#D8F0FF");
    for (let s = 0; s <= SEG; s++) {
      const w = s / SEG; // 0 = head, 1 = end of the tail
      const k = Math.max(0, age - (w * len) / Math.hypot(m.daz, m.del));
      const az = m.az + m.daz * k;
      const el = -dip - m.drop + m.del * k;
      dirOf(az, el, p);
      dirOf(az + m.daz * 0.01, el + m.del * 0.01, q);
      side
        .crossVectors(q.sub(p), p)
        .normalize()
        .multiplyScalar(D * 0.0018 * (1 - w * 0.75));
      p.multiplyScalar(D).add(cam);
      const o = (mi * (SEG + 1) + s) * 2;
      pos.setXYZ(o, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(o + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const kk = bright * Math.pow(1 - w, 1.6) * (w < 0.05 ? 9 : 4);
      col.setXYZ(o, head.r * kk, head.g * kk, head.b * kk);
      col.setXYZ(o + 1, head.r * kk, head.g * kk, head.b * kk);
    }
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  return (
    <mesh geometry={geo} frustumCulled={false} renderOrder={20}>
      <meshBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
};
