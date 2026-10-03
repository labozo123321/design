import React from "react";
import { AbsoluteFill } from "remotion";
import { PFONTS } from "../fonts";

/** Pop-art halftone backdrop. */
export const Halftone: React.FC<{ bg: string; dot: string; size?: number; shift?: number }> = ({
  bg,
  dot,
  size = 22,
  shift = 0,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: bg,
      backgroundImage: `radial-gradient(${dot} 28%, transparent 30%)`,
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${shift}px ${shift * 0.6}px`,
    }}
  />
);

/** Radial speed lines bursting from a point. */
export const SpeedLines: React.FC<{ x: number; y: number; opacity?: number; spin?: number }> = ({
  x,
  y,
  opacity = 1,
  spin = 0,
}) => (
  <AbsoluteFill style={{ opacity }}>
    <svg width={1080} height={1920}>
      {Array.from({ length: 48 }).map((_, i) => {
        const a = (i / 48) * Math.PI * 2 + spin;
        const w = i % 3 === 0 ? 0.035 : 0.018;
        const r = 2400;
        return (
          <polygon
            key={i}
            points={`${x},${y} ${x + Math.cos(a - w) * r},${y + Math.sin(a - w) * r} ${x + Math.cos(a + w) * r},${
              y + Math.sin(a + w) * r
            }`}
            fill="#141414"
            opacity={0.85}
          />
        );
      })}
    </svg>
  </AbsoluteFill>
);

/** Spiky comic burst with a word inside. */
export const Burst: React.FC<{
  text: string;
  size: number;
  fill?: string;
  color?: string;
  spikes?: number;
  fontSize?: number;
}> = ({ text, size, fill = "#FFE14D", color = "#E8202A", spikes = 14, fontSize }) => {
  const pts = Array.from({ length: spikes * 2 })
    .map((_, i) => {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = (i % 2 ? 0.68 : 1) * (size / 2) * (0.92 + 0.08 * Math.sin(i * 2.7));
      return `${size / 2 + Math.cos(a) * r},${size / 2 + Math.sin(a) * r * 0.8}`;
    })
    .join(" ");
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <polygon points={pts} fill="#141414" transform="translate(10 12)" />
        <polygon points={pts} fill={fill} stroke="#141414" strokeWidth={8} strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: PFONTS.comic,
          fontSize: fontSize ?? size * 0.22,
          lineHeight: 0.95,
          color,
          WebkitTextStroke: "3px #141414",
          textShadow: "5px 5px 0 #141414",
          letterSpacing: "0.02em",
          padding: size * 0.18,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Yellow narration box. */
export const CaptionBox: React.FC<{
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}> = ({ children, size = 58, style }) => (
  <div
    style={{
      display: "inline-block",
      background: "#FFE14D",
      border: "6px solid #141414",
      boxShadow: "10px 10px 0 #141414",
      padding: "14px 26px 8px",
      fontFamily: PFONTS.comic,
      fontSize: size,
      lineHeight: 1,
      letterSpacing: "0.03em",
      color: "#141414",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Round speech bubble with a tail. */
export const Bubble: React.FC<{ children: React.ReactNode; size?: number; tail?: "left" | "right" }> = ({
  children,
  size = 54,
  tail = "left",
}) => (
  <div style={{ position: "relative", display: "inline-block" }}>
    <div
      style={{
        background: "#fff",
        border: "6px solid #141414",
        borderRadius: 60,
        padding: "16px 34px 10px",
        fontFamily: PFONTS.comic,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.03em",
        color: "#141414",
        boxShadow: "8px 8px 0 #141414",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
    <svg
      width={60}
      height={50}
      style={{
        position: "absolute",
        bottom: -40,
        [tail]: 50,
        transform: tail === "right" ? "scaleX(-1)" : undefined,
      }}
    >
      <polygon points="0,0 40,0 8,46" fill="#fff" stroke="#141414" strokeWidth={6} strokeLinejoin="round" />
      <rect x={3} y={-4} width={34} height={8} fill="#fff" />
    </svg>
  </div>
);
