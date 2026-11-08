import React from "react";
import { canvasTex, flat, hash, toon, clamp01, smooth } from "../toon";
import { Fx } from "../Fx";
import { SkyDome, Cloud, Label } from "./common";

/**
 * A steel cable hanging from a blimp, far down through the clouds with a weight on the end. It
 * stretches, necks near the top, throws sparks, and snaps: the long part falls away.
 * stretch: 0..1 before the break; snap: seconds since it broke (< 0: not yet).
 */

const TOP = 34;
const NECK = 30;
const BOTTOM = -40;

const wireTex = () =>
  canvasTex(
    "steel-wire",
    64,
    256,
    (g) => {
      g.fillStyle = "#9aa3b2";
      g.fillRect(0, 0, 64, 256);
      g.strokeStyle = "#7c8494";
      g.lineWidth = 10;
      for (let i = -4; i < 12; i++) {
        g.beginPath();
        g.moveTo(0, i * 32);
        g.lineTo(64, i * 32 + 40);
        g.stroke();
      }
      g.strokeStyle = "#c4cad6";
      g.lineWidth = 3;
      for (let i = -4; i < 12; i++) {
        g.beginPath();
        g.moveTo(0, i * 32 + 8);
        g.lineTo(64, i * 32 + 48);
        g.stroke();
      }
    },
    { repeat: [1, 40] },
  );

export const Steel: React.FC<{ t: number; stretch: number; snap: number }> = ({ t, stretch, snap }) => {
  const broken = snap >= 0;
  const fall = broken ? 4.9 * snap * snap * 2.2 : 0;
  const neckR = 0.22 * (1 - 0.7 * smooth(0.25, 1, stretch));
  const wobble = Math.sin(t * 30) * 0.02 * stretch;
  const wire = toon("#ffffff", { map: wireTex() });
  return (
    <group>
      <SkyDome stops={[[0, "#3f86de"], [0.45, "#86c3f2"], [0.5, "#cbe7fb"], [1, "#9ccff5"]]} />
      <hemisphereLight args={["#f2f8ff", "#9bbbe0", 1.3]} />
      <directionalLight position={[8, 20, 12]} intensity={1.5} color="#fffaf0" />
      {Array.from({ length: 22 }, (_, i) => (
        <Cloud key={i} pos={[(hash(i * 3.1) - 0.5) * 50, -30 + hash(i * 1.7) * 70, -14 - hash(i * 5.3) * 30]} s={2.5 + hash(i) * 2.5} seed={i + 40} />
      ))}
      {/* the blimp */}
      <group position={[0, TOP + 4.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={toon("#f4f5f8")} scale={[1, 1, 1]}>
          <capsuleGeometry args={[2.6, 7, 10, 28]} />
        </mesh>
        <mesh position={[-5.6, 1.6, 0]} material={toon("#e5484d")}>
          <boxGeometry args={[1.6, 2.2, 0.15]} />
        </mesh>
        <mesh position={[-5.6, 0, 1.6]} rotation={[Math.PI / 2, 0, 0]} material={toon("#e5484d")}>
          <boxGeometry args={[1.6, 2.2, 0.15]} />
        </mesh>
        <mesh position={[0, -2.9, 0]} material={toon("#c9ced8")}>
          <boxGeometry args={[2.4, 0.9, 1.4]} />
        </mesh>
      </group>
      {/* the cable: top stub, neck, the long rest */}
      <mesh position={[0, (TOP + NECK) / 2 + 0.5, 0]} material={wire}>
        <cylinderGeometry args={[0.22, 0.22, TOP - NECK + 1, 16]} />
      </mesh>
      {!broken ? (
        <mesh position={[wobble, NECK, 0]} material={toon("#b7bfcc", { emissive: "#ff6a2a", ei: smooth(0.5, 1, stretch) * 0.8 })}>
          <cylinderGeometry args={[neckR, neckR, 1.2 + stretch * 0.8, 16]} />
        </mesh>
      ) : (
        <mesh position={[0, NECK + 0.2 - Math.min(0.4, snap * 3), 0]} material={toon("#b7bfcc")} rotation={[0, 0, Math.sin(snap * 20) * Math.exp(-snap * 3) * 0.3]}>
          <coneGeometry args={[0.22, 0.6, 16]} />
        </mesh>
      )}
      <group position={[wobble * 0.5, -fall, 0]} rotation={[0, 0, broken ? Math.min(0.25, snap * 0.12) : 0]}>
        <mesh position={[0, (NECK - 0.6 + BOTTOM) / 2, 0]} material={wire}>
          <cylinderGeometry args={[0.22, 0.22, NECK - 0.6 - BOTTOM, 16]} />
        </mesh>
        {broken ? (
          <mesh position={[0, NECK - 0.6, 0]} rotation={[Math.PI, 0, 0]} material={toon("#b7bfcc")}>
            <coneGeometry args={[0.22, 0.6, 16]} />
          </mesh>
        ) : null}
        {/* the weight */}
        <mesh position={[0, BOTTOM - 1.4, 0]} material={toon("#3a3f4c")}>
          <cylinderGeometry args={[1.6, 1.9, 2.6, 24]} />
        </mesh>
        <Label text="10 t" h={0.9} pos={[0, BOTTOM - 1.3, 1.92]} o={{ size: 120, color: "#ffffff" }} fx={false} />
      </group>
      {/* sparks at the neck */}
      <Fx>
        {Array.from({ length: 28 }, (_, i) => {
          const born = hash(i * 1.3) * 1.2;
          const life = 0.45;
          const pre = stretch > 0.45 ? (t * 1.0 + born) % 1.2 : -1;
          const age = broken ? snap - hash(i) * 0.1 : pre;
          if (age < 0 || age > life || (!broken && stretch < 0.45)) return null;
          const a = hash(i * 2.7) * Math.PI * 2;
          const sp = (broken ? 6 : 3) * (0.4 + hash(i * 3.9));
          const x = Math.cos(a) * sp * age;
          const y = NECK + Math.sin(a) * sp * age * 0.6 - 9.8 * age * age;
          const z = (hash(i * 4.4) - 0.5) * sp * age;
          return (
            <mesh key={i} position={[x, y, z]} material={flat("#ffd27a", 3, { additive: true, opacity: clamp01(1 - age / life) })}>
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
          );
        })}
      </Fx>
    </group>
  );
};
