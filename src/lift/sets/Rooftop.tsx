import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, flat, hash, toon, smooth } from "../toon";
import { Fx } from "../Fx";
import { SkyDome, Stars, windowTex } from "./common";
import { RocketBody, Flames } from "./Rocket";

/**
 * Night, on a city roof: purple-blue towers with lit windows, a big moon, stars, and far off on the
 * horizon a launch pad. `launch` is the second the rocket out there lights.
 */

const moonTex = () =>
  canvasTex("moon", 256, 256, (g) => {
    g.fillStyle = "#fff6d8";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#efe2b8";
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.arc(hash(i * 2.3) * 256, hash(i * 4.1) * 256, 8 + hash(i * 6.7) * 22, 0, Math.PI * 2);
      g.fill();
    }
  });

type B = { x: number; z: number; w: number; d: number; h: number; seed: number; c: string };
const CITY: B[] = (() => {
  const out: B[] = [];
  const cols = ["#2c3170", "#353a7e", "#28306a", "#3b357a", "#30285f"];
  for (let i = 0; i < 70; i++) {
    const a = hash(i * 1.9) * Math.PI * 2;
    const r = 9 + hash(i * 3.7) * 40;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 6;
    if (Math.abs(x) < 5 && Math.abs(z + 6) < 5) continue;
    // keep the view to the far pad open
    if (z < -12 && Math.abs(x - 8 * (-z / 60)) < 4.5) continue;
    out.push({ x, z, w: 2.2 + hash(i * 5.3) * 2.5, d: 2.2 + hash(i * 6.1) * 2.5, h: 3 + hash(i * 7.7) * (r < 22 ? 9 : 16), seed: i % 6, c: cols[i % cols.length] });
  }
  return out;
})();

const Building: React.FC<{ b: B }> = ({ b }) => {
  const geo = useMemo(() => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    // windows tile by size: scale the side faces' uvs
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const sx = face < 2 ? b.d / 4 : b.w / 4;
      const sy = b.h / 6;
      if (face === 2 || face === 3) uv.setXY(i, 0, 0);
      else uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    }
    return g;
  }, [b]);
  const tex = windowTex(b.seed, 0.4, b.c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return <mesh geometry={geo} position={[b.x, b.h / 2 - 8, b.z]} material={toon("#ffffff", { map: tex, emissive: "#ffffff", ei: 0.55, emap: true })} />;
};

export const Rooftop: React.FC<{ t: number; launch?: number }> = ({ t, launch }) => {
  const since = launch === undefined ? -1 : t - launch;
  const k = since < 0 ? 0 : smooth(0, 0.3, since);
  const rise = since > 0.4 ? 1.6 * (since - 0.4) * (since - 0.4) * 3 : 0;
  return (
    <group>
      <SkyDome stops={[[0, "#0e1240"], [0.35, "#1d1f5c"], [0.47, "#3d2c72"], [0.5, "#8a4f8e"], [0.53, "#2a2560"], [1, "#151848"]]} />
      <Stars n={900} r={260} size={2.4} minY={0.05} />
      <hemisphereLight args={["#8e95ff", "#2a2050", 0.9]} />
      <directionalLight position={[-6, 10, -12]} intensity={0.9} color="#cfd6ff" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0005} />
      <fog attach="fog" args={["#1d1d55", 18, 80]} />
      {/* the moon */}
      <Fx>
        <mesh position={[-10, 22, -80]} material={flat("#ffffff", 1.12, { map: moonTex() })}>
          <circleGeometry args={[6, 48]} />
        </mesh>
        <mesh position={[-10, 22, -80.5]} material={flat("#fff3c4", 0.4, { additive: true, opacity: 0.25 })}>
          <circleGeometry args={[9, 48]} />
        </mesh>
      </Fx>
      {/* the roof */}
      <mesh position={[0, -0.25, -1]} material={toon("#4a4f86")} receiveShadow castShadow>
        <boxGeometry args={[8, 0.5, 8]} />
      </mesh>
      <mesh position={[0, -4.5, -1]} material={toon("#ffffff", { map: windowTex(9, 0.5, "#3a3f80") })}>
        <boxGeometry args={[8, 8, 8]} />
      </mesh>
      {/* parapet */}
      {[
        [0, 3, 8, 0.25],
        [0, -5, 8, 0.25],
        [-4, -1, 0.25, 8],
        [4, -1, 0.25, 8],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.18, z]} material={toon("#5a5f98")} castShadow receiveShadow>
          <boxGeometry args={[w, 0.36, d]} />
        </mesh>
      ))}
      {/* a water tower and a vent */}
      <group position={[-2.4, 0, -3.4]}>
        {[
          [-0.5, -0.5],
          [0.5, -0.5],
          [-0.5, 0.5],
          [0.5, 0.5],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.7, z]} material={toon("#2b2e5c")}>
            <boxGeometry args={[0.08, 1.4, 0.08]} />
          </mesh>
        ))}
        <mesh position={[0, 1.95, 0]} material={toon("#8a5a4a")} castShadow>
          <cylinderGeometry args={[0.85, 0.85, 1.2, 24]} />
        </mesh>
        <mesh position={[0, 2.8, 0]} material={toon("#6f4638")}>
          <coneGeometry args={[0.95, 0.5, 24]} />
        </mesh>
      </group>
      <mesh position={[2.3, 0.4, -3.2]} material={toon("#6b6fa6")} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.8, 1.0]} />
      </mesh>
      {CITY.map((b, i) => (
        <Building key={i} b={b} />
      ))}
      {/* the far pad on the horizon, on a hill */}
      <mesh position={[8, -9, -60]} material={toon("#2a2860")}>
        <cylinderGeometry args={[6, 12, 12, 24]} />
      </mesh>
      <group position={[8, -3 + 0.5 + rise, -60]} scale={1.2}>
        <RocketBody t={t} />
        <Flames k={k} t={t} len={2.6 + rise * 0.3} />
        {k > 0 ? <pointLight position={[0, -1, 2]} intensity={120 * k} distance={60} color="#ffae4a" /> : null}
      </group>
      {k > 0 ? (
        <Fx>
          <mesh position={[8, -3 + rise * 0.5 * 1.2 + 0.5, -60.5]} material={flat("#ffd59a", 1.2, { additive: true, opacity: 0.35 * k })}>
            <planeGeometry args={[1.2, Math.max(0.01, rise * 1.2)]} />
          </mesh>
        </Fx>
      ) : null}
    </group>
  );
};
