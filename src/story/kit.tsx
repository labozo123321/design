import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, EASE } from "../lib/anim";
import { PFONTS } from "../promo/fonts";
import { LINES, OVER } from "./timeline";

export type WipeKind = "tear" | "iris" | "blinds" | "sun" | "split";

/** Torn paper edge: a jagged line, seeded so it doesn't crawl between frames. */
const tornEdge = (y: number) => {
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * 100;
    const j = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    pts.push(`${x}% ${y + (j - 0.5) * 3.2}%`);
  }
  return pts;
};

/** Clips an incoming scene in over the first OVER frames, a different shape per style. */
export const Reveal: React.FC<{ kind: WipeKind; children: React.ReactNode }> = ({ kind, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, OVER], [0, 1], { ...CLAMP, easing: EASE.whip });
  if (t >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  let clipPath = "";
  if (kind === "tear") {
    const y = 104 - t * 112;
    clipPath = `polygon(${tornEdge(y).join(",")}, 100% 100%, 0% 100%)`;
  } else if (kind === "iris") {
    clipPath = `circle(${t * 120}% at 50% 42%)`;
  } else if (kind === "sun") {
    clipPath = `circle(${t * 140}% at 50% 100%)`;
  } else if (kind === "split") {
    clipPath = `inset(0 ${50 - t * 50}% 0 ${50 - t * 50}%)`;
  }
  if (kind === "blinds") {
    const n = 6;
    return (
      <AbsoluteFill>
        {Array.from({ length: n }).map((_, i) => {
          const ti = interpolate(frame, [i * 1.2, OVER - (n - 1 - i) * 0.3], [0, 1], {
            ...CLAMP,
            easing: EASE.whip,
          });
          const top = (i / n) * 100;
          return (
            <AbsoluteFill
              key={i}
              style={{ clipPath: `inset(${top}% ${100 - ti * 100}% ${100 - top - 100 / n - 0.2}% 0)` }}
            >
              {children}
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ clipPath }}>{children}</AbsoluteFill>;
};

/** Word-by-word caption in a dark pill, above the bottom safe zone. Reads works on any style. */
export const Caption: React.FC<{ index: number; offset: number }> = ({ index, offset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const line = LINES[index];
  const local = frame; // Sequence starts at line.from
  const pop = spring({ frame: local, fps, config: { damping: 16, stiffness: 240 } });
  const out = interpolate(local, [line.duration + 1, line.duration + 6], [1, 0], CLAMP);
  const abs = offset + frame;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: 1440,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(pop, out),
        transform: `translateY(${(1 - pop) * 14}px)`,
      }}
    >
      <div
        style={{
          background: "rgba(12,12,16,0.86)",
          borderRadius: 22,
          padding: "14px 24px",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 40,
          lineHeight: 1.2,
          textAlign: "center",
          color: "#fff",
          boxShadow: "0 16px 36px -14px rgba(0,0,0,0.6)",
        }}
      >
        {line.words.map((w, i) => {
          const on = abs >= w.at;
          const now = on && (i === line.words.length - 1 || abs < line.words[i + 1].at);
          return (
            <span key={i} style={{ color: now ? "#FFD84A" : on ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {w.w}
              {i < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Paper / print grain overlay. */
export const Grain: React.FC<{
  id: string;
  opacity: number;
  blend?: React.CSSProperties["mixBlendMode"];
}> = ({ id, opacity, blend = "multiply" }) => (
  <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity, mixBlendMode: blend }}>
    <filter id={`g-${id}`}>
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
      <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 1.1 -0.25" />
    </filter>
    <rect width="100%" height="100%" filter={`url(#g-${id})`} />
  </svg>
);

/** Spring helper bound to the current frame. */
export const useSpring = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) =>
    spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 180, mass: 0.8, ...config } });
};
