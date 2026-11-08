import React from "react";
import * as THREE from "three";
import { flat, toon, smooth, clamp01, hash, backOut } from "../toon";
import { Fx } from "../Fx";
import { SkyDome, Stars, Cloud, Label } from "./common";

/**
 * How high space is, drawn to a squashed scale: the ground with you on it, the clouds, a plane, and the
 * line where space starts (100 km) at y = 60, with eleven mountains stacked up to meet it.
 */

export const SPACE_Y = 60;
const MOUNT_H = SPACE_Y / 11;

const Mountain: React.FC<{ y: number; s: number; n: number; show: number }> = ({ y, s, n, show }) => {
  const k = backOut(clamp01(show), 1.4);
  const sc = s * Math.max(0.001, k);
  return (
    <group position={[0, y, 0]} scale={[sc, sc, sc]}>
      {/* a fat cartoon peak with a snowcap, and a little shoulder */}
      <mesh position={[0, MOUNT_H / 2, 0]} material={toon(n % 2 ? "#8a7a6c" : "#7c6f66")} castShadow receiveShadow>
        <coneGeometry args={[MOUNT_H * 0.62, MOUNT_H, 9, 1]} />
      </mesh>
      <mesh position={[MOUNT_H * 0.3, MOUNT_H * 0.3, MOUNT_H * 0.05]} material={toon("#9a8a7a")} castShadow>
        <coneGeometry args={[MOUNT_H * 0.32, MOUNT_H * 0.6, 8, 1]} />
      </mesh>
      <mesh position={[0, MOUNT_H * 0.8, 0]} material={toon("#f6f8fb")} castShadow>
        <coneGeometry args={[MOUNT_H * 0.25, MOUNT_H * 0.4, 9, 1]} />
      </mesh>
      <Label text={String(n)} h={MOUNT_H * 0.4} pos={[-MOUNT_H * 0.05, MOUNT_H * 0.32, MOUNT_H * 0.48]} o={{ size: 140, color: "#ffffff", stroke: "#1a1d2e", strokeW: 22 }} />
    </group>
  );
};

const Plane: React.FC<{ pos: [number, number, number]; yaw?: number }> = ({ pos, yaw = 0 }) => (
  <group position={pos} rotation={[0, yaw, 0]} scale={0.9}>
    <mesh rotation={[0, 0, Math.PI / 2]} material={toon("#f4f6fa")} castShadow>
      <capsuleGeometry args={[0.35, 3.2, 8, 20]} />
    </mesh>
    <mesh position={[0, 0, 0]} material={toon("#d8dde7")}>
      <boxGeometry args={[0.9, 0.08, 4.4]} />
    </mesh>
    <mesh position={[-1.7, 0.45, 0]} material={toon("#e5484d")}>
      <boxGeometry args={[0.55, 0.9, 0.08]} />
    </mesh>
    <mesh position={[-1.75, 0.05, 0]} material={toon("#d8dde7")}>
      <boxGeometry args={[0.45, 0.06, 1.5]} />
    </mesh>
    {[-0.8, -0.4, 0, 0.4, 0.8].map((x) => (
      <mesh key={x} position={[x, 0.12, 0.34]} material={flat("#3a6fd0")}>
        <circleGeometry args={[0.08, 12]} />
      </mesh>
    ))}
  </group>
);

/** camY: the camera's height, which sets the sky (blue down low, navy and stars up at the line).
 * stack: 0..1 how far the mountain stack has built up. */
export const Height: React.FC<{ camY: number; stack?: number; plane?: number; bigLabel?: boolean }> = ({ camY, stack = 0, plane = 0, bigLabel = false }) => {
  const up = smooth(18, SPACE_Y - 4, camY);
  const sky = (a: string, b: string) => `#${new THREE.Color(a).lerp(new THREE.Color(b), up).getHexString()}`;
  return (
    <group>
      <group position={[0, camY, 0]}>
        <SkyDome stops={[[0, sky("#4f8fe0", "#070a24")], [0.45, sky("#8cc8f4", "#141a4c")], [0.5, sky("#cfe9fb", "#2a3a8a")], [0.55, sky("#cfe9fb", "#2a3a8a")], [1, sky("#a7d47a", "#141a4c")]]} />
        {up > 0.05 ? <Stars n={700} r={240} size={2.2} opacity={up} /> : null}
      </group>
      <hemisphereLight args={["#e8f4ff", "#7aa860", 1.25]} />
      <directionalLight position={[10, 30, 14]} intensity={1.6} color="#fff6e8" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={64} shadow-camera-bottom={-2} shadow-camera-far={120} shadow-bias={-0.0005} />
      {/* the ground: grass, a road, little houses and trees */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={toon("#8fcf6a")} receiveShadow>
        <circleGeometry args={[220, 64]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 3]} material={toon("#8a8f9c")} receiveShadow>
        <planeGeometry args={[220, 2.4]} />
      </mesh>
      {Array.from({ length: 26 }, (_, i) => {
        const x = (hash(i * 2.1) - 0.5) * 60;
        const z = -6 - hash(i * 3.3) * 40;
        if (Math.abs(x) < 3 && z > -10) return null;
        return hash(i * 5.5) > 0.45 ? (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.7, 0]} material={toon(["#f2e6d0", "#f5d5c5", "#dfe8f2"][i % 3])} castShadow receiveShadow>
              <boxGeometry args={[1.6, 1.4, 1.4]} />
            </mesh>
            <mesh position={[0, 1.75, 0]} rotation={[0, Math.PI / 4, 0]} material={toon(["#d0563f", "#3d5fa8", "#5b3a2e"][i % 3])} castShadow>
              <coneGeometry args={[1.25, 0.8, 4]} />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.5, 0]} material={toon("#7a5236")}>
              <cylinderGeometry args={[0.12, 0.15, 1, 8]} />
            </mesh>
            <mesh position={[0, 1.4, 0]} material={toon("#3f9d4a")} castShadow>
              <sphereGeometry args={[0.8, 16, 12]} />
            </mesh>
          </group>
        );
      })}
      {/* the clouds and the plane */}
      {Array.from({ length: 34 }, (_, i) => {
        // clouds at several heights so the climb rushes past them; none right in the camera's way
        const y = 9 + hash(i * 2.9) * 34;
        const x = (hash(i * 7.1) - 0.5) * 36;
        const z = -6 - hash(i * 4.4) * 26 + (i % 3) * 5;
        const clear = Math.abs(x - 0.4) < 3.5 && z > -4;
        return clear ? null : <Cloud key={i} pos={[x, y, z]} s={2 + hash(i) * 1.8} seed={i + 10} />;
      })}
      <Plane pos={[-14 + plane * 26, 25, -10]} />
      {/* the line where space starts */}
      <Fx>
        <mesh position={[0, SPACE_Y, -6]} material={flat("#5fe3ff", 2.4, { additive: true })}>
          <boxGeometry args={[260, 0.12, 0.12]} />
        </mesh>
        <mesh position={[0, SPACE_Y, -6.2]} material={flat("#5fe3ff", 0.6, { additive: true, opacity: 0.35 })}>
          <planeGeometry args={[260, 1.6]} />
        </mesh>
      </Fx>
      <Label text={"SPACE  ·  100 km"} h={bigLabel ? 4.2 : 0.6} pos={[0.4, SPACE_Y + (bigLabel ? 3.4 : 0.75), -5.9]} o={{ size: 120, color: "#ffffff", stroke: "#0d1a3a", strokeW: 18 }} glow={1.15} />
      {/* the stack */}
      {stack > 0
        ? Array.from({ length: 11 }, (_, i) => <Mountain key={i} n={i + 1} y={i * MOUNT_H * 0.985} s={1} show={(stack * 11 - i) * 1.6} />)
        : null}
    </group>
  );
};
