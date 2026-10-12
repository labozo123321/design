import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Head, type Person } from "./face/Head";
import { NEUTRAL, ADULT_F, type Expr } from "./face/sculpt";
import { SISTER, YOU } from "./cast";
import { SkyEnv } from "./Sky";

/** A studio check of the faces: a few people and expressions, close up, in warm low sun. */

const SET: { who: Person; e: Partial<Expr>; yaw: number; pitch?: number; label: string }[] = [
  { who: SISTER, e: { smile: 0.7, eyeYaw: 0.0 }, yaw: 0, label: "sister smile" },
  { who: SISTER, e: { lidL: 0.42, lidR: 0.45, chew: 0.6, jaw: 0.1, eyePitch: -0.1 }, yaw: 0.6, label: "sister bored" },
  { who: SISTER, e: { pucker: 0.9, puff: 0.5, lidL: 0.35, lidR: 0.35 }, yaw: -0.4, label: "sister bubble" },
  { who: YOU, e: { jaw: 1, wide: 0.6, squint: 0.9, brow: 0.8, lidL: 0.8, lidR: 0.8 }, yaw: 0.25, label: "you scream" },
  {
    who: { ...YOU, name: "f", shape: ADULT_F, skin: { tone: "#C98E66", blush: 0.4, freckles: 0, lip: "#B06060", seed: 11, browTint: "#2A1A12" }, iris: "#3B2A1E", hair: { style: "pony", color: "#1E1612" }, brow: "#1E1612", lashes: 0.9 },
    e: { smile: 0.9, jaw: 0.35, squint: 0.3 },
    yaw: -0.3,
    label: "woman laugh",
  },
  { who: SISTER, e: { smile: 1, jaw: 0.45, squint: 0.5 }, yaw: 0.25, label: "sister laugh" },
];

export const FaceTest: React.FC = () => {
  const frame = useCurrentFrame();
  const it = SET[frame % SET.length];
  const e: Expr = { ...NEUTRAL, ...it.e };
  return (
    <AbsoluteFill style={{ background: "#222" }}>
      <ThreeCanvas width={1080} height={1920} camera={{ fov: 30, near: 0.01, far: 100, position: [0, -0.01, 0.62] }} gl={{ antialias: true }}>
        <SkyEnv />
        <color attach="background" args={["#3A3F4A"]} />
        <directionalLight position={[-1.5, 0.6, 1.2]} intensity={2.6} color="#FFD2A1" />
        <hemisphereLight args={["#AFC4E8", "#6B5F45", 0.5]} />
        <group rotation={[it.pitch ?? 0, it.yaw, 0]} position={[0, -0.01, 0]}>
          <Head person={it.who} e={e} hi rider={false} />
        </group>
      </ThreeCanvas>
      <div style={{ position: "absolute", top: 40, left: 40, color: "#fff", fontSize: 40, fontFamily: "sans-serif" }}>{it.label}</div>
    </AbsoluteFill>
  );
};
