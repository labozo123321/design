import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Head, type Person } from "../coaster/face/Head";
import { NEUTRAL, ADULT_F, ADULT_M, type Expr } from "../coaster/face/sculpt";
import { SkyEnv } from "../coaster/Sky";

/** A studio check of older faces: the same man and woman at several ages, neutral and smiling. */

const man = (age: number, hair: string): Person => ({
  name: `m${age}`,
  shape: { ...ADULT_M, cheek: 0.3 + 0.1 * age, jaw: 0.75 - 0.15 * age },
  skin: { tone: "#E2B08E", blush: 0.35, freckles: 0.1, lip: "#B87A70", seed: 21, browTint: "#4A3A30", age },
  iris: "#4A6A7E",
  hair: { style: "short", color: hair },
  brow: hair,
  lashes: 0.3,
  stubble: 0.3,
});
const woman = (age: number, hair: string): Person => ({
  name: `w${age}`,
  shape: { ...ADULT_F, cheek: 0.35 + 0.1 * age },
  skin: { tone: "#D9A383", blush: 0.4, freckles: 0, lip: "#B06A66", seed: 33, browTint: "#3A2A22", age },
  iris: "#5A3A26",
  hair: { style: "bun", color: hair },
  brow: hair,
  lashes: 0.7,
});

const SET: { who: Person; e: Partial<Expr>; yaw: number; label: string }[] = [
  { who: man(0, "#3A2618"), e: {}, yaw: 0.25, label: "man 35" },
  { who: man(0.5, "#6A5A50"), e: {}, yaw: 0.25, label: "man 55" },
  { who: man(0.9, "#C8C4BE"), e: {}, yaw: 0.25, label: "man 72" },
  { who: man(0.9, "#C8C4BE"), e: { smile: 0.9, squint: 0.4 }, yaw: -0.2, label: "man 72 smile" },
  { who: woman(0.6, "#8A7A70"), e: { smile: 0.5 }, yaw: 0.3, label: "woman 60" },
  { who: woman(1.0, "#E2DED8"), e: { smile: 0.8, squint: 0.3 }, yaw: -0.25, label: "woman 78 smile" },
];

export const AgeTest: React.FC = () => {
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
        <group rotation={[0, it.yaw, 0]}>
          <Head person={it.who} e={e} hi rider />
        </group>
      </ThreeCanvas>
      <div style={{ position: "absolute", top: 40, left: 40, color: "#fff", fontSize: 40, fontFamily: "sans-serif" }}>{it.label}</div>
    </AbsoluteFill>
  );
};
