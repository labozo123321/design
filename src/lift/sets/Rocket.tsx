import React, { useMemo } from "react";
import * as THREE from "three";
import { flat, gloss, hash, toon, smooth, clamp01 } from "../toon";
import { Fx } from "../Fx";
import { Chibi, CAST } from "../Chibi";
import { SkyDome, Cloud } from "./common";

/**
 * A rocket (generic: white body, black bands, four fins), its flames and its smoke, and the pad it
 * stands on, under the reel's pink dusk sky.
 */

export const ROCKET_H = 9.6; // base of the engines to the nose tip

const Fin: React.FC<{ a: number }> = ({ a }) => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.75, -0.25);
    s.lineTo(0.75, 0.2);
    s.lineTo(0, 1.5);
    s.closePath();
    return s;
  }, []);
  return (
    <group rotation={[0, a, 0]}>
      <mesh position={[0.45, 0.5, -0.04]} material={toon("#2b2f3a")} castShadow>
        <extrudeGeometry args={[shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }]} />
      </mesh>
    </group>
  );
};

/** The rocket, its base at the origin. `shake` jitters it (seconds); `crew` puts a scared tiny you in the
 * porthole. */
export const RocketBody: React.FC<{ shake?: number; crew?: boolean; t?: number }> = ({ shake = 0, crew = false, t = 0 }) => {
  const jx = shake ? Math.sin(t * 61) * 0.015 * shake : 0;
  const jz = shake ? Math.cos(t * 47) * 0.015 * shake : 0;
  return (
    <group position={[jx, 0, jz]}>
      {/* engines */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22]} material={gloss("#2a2d36", 0.35)} castShadow>
            <cylinderGeometry args={[0.1, 0.2, 0.45, 18, 1, true]} />
          </mesh>
        );
      })}
      <mesh position={[0, 4.45, 0]} material={toon("#f2f3f6")} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 8.0, 40]} />
      </mesh>
      {[1.4, 6.6].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={toon("#24262e")}>
          <cylinderGeometry args={[0.505, 0.505, 0.32, 40]} />
        </mesh>
      ))}
      <mesh position={[0, 0.48, 0]} material={toon("#d9dce3")}>
        <cylinderGeometry args={[0.46, 0.5, 0.06, 40]} />
      </mesh>
      {/* the nose */}
      <mesh position={[0, 8.45 + 0.55, 0]} material={toon("#f2f3f6")} castShadow>
        <cylinderGeometry args={[0.04, 0.5, 1.1, 40]} />
      </mesh>
      <mesh position={[0, 9.56, 0]} material={toon("#f2f3f6")}>
        <sphereGeometry args={[0.045, 12, 8]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <Fin key={i} a={(i / 4) * Math.PI * 2 + Math.PI / 4} />
      ))}
      {/* the bubble window, out from the hull */}
      <group position={[0, 7.6, 0.5]}>
        <mesh material={toon("#c9ced8")}>
          <torusGeometry args={[0.33, 0.045, 10, 36]} />
        </mesh>
        <mesh position={[0, 0, 0.005]} material={flat("#1a2347")}>
          <circleGeometry args={[0.33, 36]} />
        </mesh>
        {crew ? (
          <Chibi
            look={CAST.you}
            pos={[0, -0.43, 0.15]}
            scale={0.42}
            bust
            shadow={false}
            tilt={Math.sin(t * 40) * 0.06}
            face={{ eyes: "spiral", mouth: "wavy", brows: "worry" }}
            sweat={1}
            arms={{ right: { hand: [-0.3, 0.5, 0.13], bend: [-0.13, -0.09, 0.02] }, left: { hand: [0.3, 0.5, 0.13], bend: [0.13, -0.09, 0.02] } }}
          />
        ) : null}
        <Fx>
          <mesh material={flat("#bfe6ff", 1, { opacity: 0.1, depthWrite: false })}>
            <sphereGeometry args={[0.33, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </Fx>
      </group>
    </group>
  );
};

/** Flames under the engines (0..1 throttle), flickering with t. */
export const Flames: React.FC<{ k: number; t: number; len?: number }> = ({ k, t, len = 3.2 }) => {
  if (k <= 0.01) return null;
  const fl = 1 + 0.12 * Math.sin(t * 53) + 0.08 * Math.sin(t * 91 + 1);
  const L = len * k * fl;
  return (
    <Fx>
      <group position={[0, 0.02, 0]}>
        <mesh position={[0, -L * 0.5, 0]} rotation={[Math.PI, 0, 0]} material={flat("#ff8a1f", 2.2, { additive: true, opacity: 0.85 })}>
          <coneGeometry args={[0.42, L, 24, 1, true]} />
        </mesh>
        <mesh position={[0, -L * 0.33, 0]} rotation={[Math.PI, 0, 0]} material={flat("#ffd34d", 3.0, { additive: true, opacity: 0.95 })}>
          <coneGeometry args={[0.3, L * 0.66, 24, 1, true]} />
        </mesh>
        <mesh position={[0, -L * 0.18, 0]} rotation={[Math.PI, 0, 0]} material={flat("#fff7d6", 4.0, { additive: true })}>
          <coneGeometry args={[0.18, L * 0.36, 20, 1, true]} />
        </mesh>
      </group>
    </Fx>
  );
};

/** Billowing cartoon smoke from the pad: n puffs, from time `t0` (s), at the base `y0`. */
export const Smoke: React.FC<{ t: number; t0: number; n?: number; spread?: number; y0?: number; rise?: number; color?: string }> = ({ t, t0, n = 46, spread = 5.5, y0 = 0.3, rise = 1.2, color = "#f4f1ee" }) => {
  const u = t - t0;
  if (u <= 0) return null;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const born = hash(i * 1.7) * 1.2;
        const age = u - born;
        if (age <= 0) return null;
        const a = hash(i * 3.3) * Math.PI * 2;
        const sp = spread * (0.5 + 0.5 * hash(i * 5.1));
        const d = sp * (1 - Math.exp(-age * 1.3));
        const r = (0.3 + 0.75 * hash(i * 7.9)) * (0.4 + 0.85 * (1 - Math.exp(-age * 1.6)));
        const y = y0 + r * 0.6 + rise * age * (0.3 + hash(i * 2.2));
        const shade = hash(i * 9.1) > 0.6 ? "#dcd6d2" : color;
        return (
          <mesh key={i} position={[Math.cos(a) * d, y, Math.sin(a) * d]} material={toon(shade)}>
            <sphereGeometry args={[r, 18, 12]} />
          </mesh>
        );
      })}
    </group>
  );
};

/** A lattice tower: two (or four) posts with zigzag braces. */
export const Lattice: React.FC<{ h: number; w: number; color?: string; pos?: [number, number, number] }> = ({ h, w, color = "#3b3550", pos = [0, 0, 0] }) => {
  const n = Math.floor(h / (w * 0.9));
  const step = h / n;
  return (
    <group position={pos}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[(sx * w) / 2, h / 2, (sz * w) / 2]} material={toon(color)} castShadow>
          <boxGeometry args={[0.09, h, 0.09]} />
        </mesh>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[0, step * (i + 0.5), 0]}>
          {[0, 1, 2, 3].map((f) => (
            <group key={f} rotation={[0, (f * Math.PI) / 2, 0]}>
              <mesh position={[0, 0, w / 2]} rotation={[0, 0, (i + f) % 2 ? 0.7 : -0.7]} material={toon(color)}>
                <boxGeometry args={[Math.hypot(w, step), 0.05, 0.05]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
};

/** The pad: pink dusk, sand and concrete, the tower, the tanks, the sea beyond. `launch` = seconds since
 * ignition (undefined: standing quiet). */
export const LaunchPad: React.FC<{ t: number; ignite?: number; liftoff?: number; crew?: boolean; rocketVisible?: boolean; spread?: number }> = ({ t, ignite, liftoff, crew = false, rocketVisible = true, spread = 5.5 }) => {
  const sinceIgn = ignite === undefined ? -1 : t - ignite;
  const sinceLift = liftoff === undefined ? -1 : t - liftoff;
  const throttle = sinceIgn < 0 ? 0 : smooth(0, 0.35, sinceIgn);
  const rise = sinceLift > 0 ? 0.9 * sinceLift * sinceLift + 0.6 * sinceLift : 0;
  return (
    <group>
      <SkyDome stops={[[0, "#e9879c"], [0.42, "#f3a7aa"], [0.5, "#f8c4b0"], [0.55, "#f5d3c0"], [1, "#e4b9a8"]]} />
      <hemisphereLight args={["#ffe2e4", "#b88a7a", 1.25]} />
      <directionalLight
        position={[-8, 12, 9]}
        intensity={1.7}
        color="#fff1e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={16}
        shadow-camera-bottom={-4}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
      />
      {throttle > 0 ? <pointLight position={[0, 0.6, 1.2]} intensity={28 * throttle} distance={18} color="#ffb04a" /> : null}
      <fog attach="fog" args={["#f2c3b4", 40, 160]} />
      {/* ground: sand, the concrete pad, the sea */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={toon("#e9cf9f")} receiveShadow>
        <planeGeometry args={[400, 400]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0]} material={toon("#c9c6c2")} receiveShadow>
        <circleGeometry args={[9, 64]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -70]} material={toon("#3f9ad8")}>
        <planeGeometry args={[400, 90]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={toon("#a9a6a3")} receiveShadow castShadow>
        <cylinderGeometry args={[1.6, 1.9, 0.5, 40]} />
      </mesh>
      {/* the tower and its arm */}
      <Lattice h={11} w={1.3} pos={[2.8, 0, -0.4]} />
      <mesh position={[1.8, 8.3, -0.4]} material={toon("#3b3550")}>
        <boxGeometry args={[2.0, 0.25, 0.4]} />
      </mesh>
      {/* tanks and a building */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-7 - i * 1.25, 1.6, -6 + (i % 2) * 0.8]} material={toon("#eef0f3")} castShadow receiveShadow>
          <capsuleGeometry args={[0.6, 2.0, 8, 24]} />
        </mesh>
      ))}
      <mesh position={[-11.5, 2.5, -10]} material={toon("#e3e6ec")} castShadow receiveShadow>
        <boxGeometry args={[5, 5, 4]} />
      </mesh>
      <mesh position={[-11.5, 3.6, -7.98]} material={toon("#3a4f8c")}>
        <planeGeometry args={[3.2, 0.7]} />
      </mesh>
      <Cloud pos={[-30, 26, -90]} s={7} seed={1} color="#ffe6e2" />
      <Cloud pos={[25, 30, -100]} s={8} seed={2} color="#ffe6e2" />
      <Cloud pos={[60, 22, -80]} s={6} seed={3} color="#ffe6e2" />
      {rocketVisible ? (
        <group position={[0, 0.5 + rise, 0]}>
          <RocketBody shake={throttle} crew={crew} t={t} />
          <Flames k={throttle} t={t} len={3 + Math.min(6, rise * 0.5)} />
        </group>
      ) : null}
      {sinceIgn > 0 ? <Smoke t={t} t0={ignite! + 0.1} spread={spread} /> : null}
    </group>
  );
};

/** The flame-and-smoke burst for very close shots of the engines lighting. */
export const IgnitionBurst: React.FC<{ t: number; t0: number }> = ({ t, t0 }) => {
  const u = t - t0;
  if (u <= 0) return null;
  const k = clamp01(u / 0.25);
  return (
    <group>
      <Smoke t={t} t0={t0} n={34} spread={3.5} y0={0.1} rise={0.8} />
      <Fx>
        {Array.from({ length: 9 }, (_, i) => {
          const a = hash(i * 4.1) * Math.PI * 2;
          const d = (0.5 + hash(i * 2.9) * 1.6) * (1 - Math.exp(-u * 3));
          const r = (0.35 + hash(i * 6.3) * 0.5) * k * (1 - smooth(0.6, 2.2, u) * 0.6);
          return (
            <mesh key={i} position={[Math.cos(a) * d, 0.3 + hash(i) * 0.4, Math.sin(a) * d]} material={flat(i % 3 === 0 ? "#fff1a8" : "#ff9a2e", 1.6, { additive: true, opacity: 0.7 })}>
              <sphereGeometry args={[r, 16, 12]} />
            </mesh>
          );
        })}
      </Fx>
    </group>
  );
};
