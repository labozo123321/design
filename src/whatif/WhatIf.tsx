import React from "react";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Html5Audio as Audio,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadDMSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/InterTight";
import { CLAMP } from "../lib/anim";
import { AIR_START, LINES, air, describe, gravity } from "./timeline";
import { World, skyAt } from "./World";

const SERIF = loadDMSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const SANS = loadInter("normal", { weights: ["700", "800"], subsets: ["latin"] }).fontFamily;
const GOLD = "#F5C451";
const SHADOW = "0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.6)";

/** Narration line on screen: serif, white, gold on the highlight words. */
const Caption: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = LINES[i];
  const next = LINES[i + 1]?.from ?? l.from + l.duration + 60;
  const hold = Math.min(next - l.from - 2, l.duration + 40);
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const out = interpolate(frame, [hold - 6, hold], [1, 0], CLAMP);
  const first = i === 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: first ? 300 : 270,
        textAlign: "center",
        fontFamily: SERIF,
        fontSize: first ? 82 : 62,
        lineHeight: 1.12,
        color: "#fff",
        textShadow: SHADOW,
        opacity: Math.min(s, out),
        transform: `translateY(${(1 - s) * 18}px)`,
      }}
    >
      {l.text.split(" ").map((w, k) => (
        <span key={k} style={{ color: l.highlight.includes(w) ? GOLD : undefined }}>
          {w}
          {k < l.text.split(" ").length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
};

/** The readout, styled like a broadcast lower-third: label, big serif number, descriptor. */
const Gauge: React.FC<{ label: string; value: number; sub: string; top: number; appear: number }> = ({
  label,
  value,
  sub,
  top,
  appear,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - appear, fps, config: { damping: 16, stiffness: 160 } });
  const pct = Math.round(value * 100);
  const tick = Math.max(0, 1 - (frame % 30) / 6) * (value < 1 && value > 0 ? 1 : 0);
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        top,
        opacity: s,
        transform: `translateX(${(1 - s) * -60}px)`,
        color: "#fff",
        textShadow: SHADOW,
      }}
    >
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: "0.08em" }}>{label}</div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 132,
          lineHeight: 1,
          transform: `scale(${1 + tick * 0.04})`,
          transformOrigin: "0 50%",
        }}
      >
        {pct}
        <span style={{ fontSize: 80 }}>%</span>
      </div>
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: "0.06em",
          color: pct === 0 ? GOLD : "#fff",
        }}
      >
        {sub}
      </div>
    </div>
  );
};

const Stars: React.FC<{ o: number }> = ({ o }) => {
  if (o <= 0.01) return null;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: o }}>
      {Array.from({ length: 140 }).map((_, i) => (
        <circle
          key={i}
          cx={random(`sx${i}`) * 1080}
          cy={random(`sy${i}`) * 1100}
          r={0.8 + random(`sr${i}`) * 1.8}
          fill="#fff"
          opacity={0.4 + random(`so${i}`) * 0.6}
        />
      ))}
    </svg>
  );
};

export const WhatIf: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const sky = skyAt(t);
  const a = air(t);
  const g = gravity(t);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(#${sky.top.getHexString()} 0%, #${sky.mid.getHexString()} 38%, #${sky.horizon.getHexString()} 60%)`,
      }}
    >
      <Stars o={1 - a} />
      <ThreeCanvas
        width={width}
        height={height}
        shadows
        camera={{ position: [0, 25, 40], fov: 40 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      >
        <World />
      </ThreeCanvas>
      {/* soft top shade so the serif captions always read */}
      <AbsoluteFill style={{ background: "linear-gradient(rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 32%)" }} />

      <Gauge label="GRAVITY" value={g} sub={describe(g)} top={900} appear={8} />
      <Gauge
        label="AIR PRESSURE"
        value={a}
        sub={a > 0.5 ? "AIR DRIFTING AWAY" : a > 0 ? "SOUND FADING" : "NO AIR. NO SOUND."}
        top={1150}
        appear={Math.round(AIR_START * fps)}
      />

      {LINES.map((l, i) => (
        <Sequence key={l.file} from={l.from} name={`cc ${i}`}>
          <Caption i={i} />
        </Sequence>
      ))}
      {LINES.map((l) => (
        <Sequence key={l.file} from={l.from} name={`vo ${l.text}`} layout="none">
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile("whatif/bed.mp3")} volume={0.9} />
    </AbsoluteFill>
  );
};
