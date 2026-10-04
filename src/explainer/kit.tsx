import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PFONTS } from "../promo/fonts";
import { UI } from "./ui";

/** Dark stage with slow colour blooms and a faint dot grid. */
export const Backdrop: React.FC<{ hue?: string }> = ({ hue = UI.lime }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ background: "#0A0D14" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${30 + Math.sin(t * 0.7) * 8}% ${28 + Math.cos(t * 0.5) * 6}%, ${hue}33, transparent 45%), radial-gradient(circle at ${
            75 + Math.cos(t * 0.6) * 8
          }% ${72 + Math.sin(t * 0.4) * 6}%, ${UI.blue}2a, transparent 50%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 2px, transparent 2.5px)",
          backgroundSize: "44px 44px",
          backgroundPosition: `0 ${-frame * 0.6}px`,
        }}
      />
    </AbsoluteFill>
  );
};

/** "01 · Follow the path" header: number pops, title slides up word by word. */
export const StepLabel: React.FC<{ n: string; title: string; at?: number; color?: string }> = ({
  n,
  title,
  at = 0,
  color = UI.lime,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const num = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 190 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        right: 140,
        top: 130,
        display: "flex",
        alignItems: "center",
        gap: 26,
      }}
    >
      <div
        style={{
          width: 108,
          height: 108,
          flex: "none",
          borderRadius: 30,
          background: color,
          color: "#0E1119",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 52,
          transform: `scale(${num}) rotate(${(1 - num) * -30}deg)`,
          boxShadow: `0 16px 40px -10px ${color}99`,
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 58,
          lineHeight: 1.02,
          color: "#fff",
          letterSpacing: "-0.02em",
        }}
      >
        {title.split(" ").map((w, i) => {
          const p = spring({ frame: frame - at - 4 - i * 2, fps, config: { damping: 15, stiffness: 200 } });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                opacity: Math.min(1, p * 1.5),
                transform: `translateY(${(1 - p) * 40}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Lime circle that grows from (x, y) to cover the frame (progress 0→1). */
export const CircleWipe: React.FC<{ progress: number; x: number; y: number; color?: string }> = ({
  progress,
  x,
  y,
  color = UI.lime,
}) =>
  progress <= 0 ? null : (
    <AbsoluteFill style={{ background: color, clipPath: `circle(${progress * 2300}px at ${x}px ${y}px)` }} />
  );

/** Small floating chip, e.g. "+50 XP". */
export const Chip: React.FC<{ children: React.ReactNode; color: string; text?: string }> = ({
  children,
  color,
  text = "#0E1119",
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "14px 26px",
      borderRadius: 999,
      background: color,
      color: text,
      fontFamily: PFONTS.app,
      fontWeight: 900,
      fontSize: 36,
      boxShadow: `0 14px 30px -10px ${color}aa`,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);
