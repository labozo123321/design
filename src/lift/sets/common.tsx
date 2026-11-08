import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, flat, hash, labelTex, LabelOpts, toon } from "../toon";
import { Fx } from "../Fx";

/** Shared scenery: sky domes, stars, puffy clouds, labels in space. */

/** A sky sphere painted with a vertical gradient (stops from the top down). */
export const SkyDome: React.FC<{ stops: [number, string][]; r?: number; rotY?: number }> = ({ stops, r = 300, rotY = 0 }) => {
  const key = stops.map((s) => `${s[0]}:${s[1]}`).join(",");
  const tex = canvasTex(`sky|${key}`, 8, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 512);
  });
  return (
    <Fx>
      <mesh rotation={[0, rotY, 0]} material={flat("#ffffff", 1, { map: tex, side: THREE.BackSide, depthWrite: false })} renderOrder={-10}>
        <sphereGeometry args={[r, 32, 32]} />
      </mesh>
    </Fx>
  );
};

/** Stars as little discs: a Points cloud on a big shell. */
const starTex = () =>
  canvasTex("star-dot", 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.9)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
export const Stars: React.FC<{ n?: number; r?: number; size?: number; seed?: number; opacity?: number; minY?: number }> = ({ n = 1400, r = 250, size = 2.2, seed = 0, opacity = 1, minY = -1 }) => {
  const geo = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i < n * 3 && p.length < n * 3; i++) {
      const u = hash(i * 1.31 + seed) * 2 - 1;
      const a = hash(i * 2.17 + seed * 3.1) * Math.PI * 2;
      if (u < minY) continue;
      const s = Math.sqrt(1 - u * u);
      const rr = r * (0.85 + 0.15 * hash(i * 3.7 + seed));
      p.push(Math.cos(a) * s * rr, u * rr, Math.sin(a) * s * rr);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, [n, r, seed, minY]);
  const mat = useMemo(
    () => new THREE.PointsMaterial({ size: size, sizeAttenuation: false, map: starTex(), transparent: true, depthWrite: false, opacity, color: new THREE.Color("#ffffff").multiplyScalar(1.3) }),
    [size, opacity],
  );
  return (
    <Fx>
      <points geometry={geo} material={mat} renderOrder={-9} />
    </Fx>
  );
};

/** A puffy cartoon cloud: a few white balls on a flat bottom. */
export const Cloud: React.FC<{ pos: [number, number, number]; s?: number; seed?: number; color?: string; flatBottom?: boolean }> = ({ pos, s = 1, seed = 0, color = "#ffffff" }) => {
  const balls = useMemo(() => {
    const n = 5 + Math.floor(hash(seed * 7.7) * 4);
    return Array.from({ length: n }, (_, i) => {
      const x = (i - (n - 1) / 2) * 0.62 + (hash(seed + i * 1.3) - 0.5) * 0.3;
      const r = 0.45 + hash(seed * 3 + i) * 0.4 - Math.abs(x) * 0.12;
      return { x, y: r * 0.35 + hash(seed + i * 5.1) * 0.15, z: (hash(seed * 2 + i * 2.3) - 0.5) * 0.5, r };
    });
  }, [seed]);
  return (
    <group position={pos} scale={s}>
      {balls.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]} material={toon(color)} scale={[1, 0.82, 1]}>
          <sphereGeometry args={[b.r, 20, 14]} />
        </mesh>
      ))}
    </group>
  );
};

/** A label on a plane (faces +z unless rotated); h is its height in world units. */
export const Label: React.FC<{ text: string; h: number; pos?: [number, number, number]; rot?: [number, number, number]; o?: LabelOpts; glow?: number; opacity?: number; fx?: boolean }> = ({
  text,
  h,
  pos = [0, 0, 0],
  rot = [0, 0, 0],
  o = {},
  glow = 1,
  opacity = 1,
  fx = true,
}) => {
  const { tex, aspect } = labelTex(text, o);
  const m = (
    <mesh position={pos} rotation={rot} material={labelMat(tex, glow, opacity)}>
      <planeGeometry args={[h * aspect, h]} />
    </mesh>
  );
  return fx ? <Fx>{m}</Fx> : m;
};

const labelMats = new Map<string, THREE.MeshBasicMaterial>();
/** A label's material: alpha-tested so only the letters write depth (depth of field then treats them as
 * the thing they label, not as whatever is behind them); faded labels blend instead. */
const labelMat = (tex: THREE.Texture, glow: number, opacity: number) => {
  const op = Math.round(Math.max(0, Math.min(1, opacity)) * 20) / 20;
  const key = `${tex.uuid}|${glow}|${op}`;
  let m = labelMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color("#ffffff").multiplyScalar(glow) });
    if (op >= 1) {
      m.alphaTest = 0.45;
      m.transparent = false;
    } else {
      m.transparent = true;
      m.opacity = Math.max(0.001, op);
      m.depthWrite = false;
    }
    labelMats.set(key, m);
  }
  return m;
};

/** Windows texture for a night building: dark facade with lit and unlit windows. */
export const windowTex = (seed: number, lit = 0.45, facade = "#2a2f66") =>
  canvasTex(`win|${seed}|${lit}|${facade}`, 128, 256, (g) => {
    g.fillStyle = facade;
    g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 12; r++)
      for (let c = 0; c < 4; c++) {
        const on = hash(seed * 31 + r * 7 + c * 13) < lit;
        g.fillStyle = on ? (hash(r * 3 + c + seed) > 0.3 ? "#ffd86b" : "#ffeab0") : "#1c2050";
        g.fillRect(10 + c * 30, 10 + r * 20.5, 18, 12);
      }
  });

/** A simple low-poly rock (the asteroid, debris chunks). */
export const rockGeo = (seed: number, detail = 2) => {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.78 + 0.22 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.3) + 0.12 * Math.sin(v.z * 5.3 + seed * 2.1);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
};
