import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

/**
 * Clean UI backdrop: soft off-white (or deep navy) with slow drifting tinted
 * blooms, so the glass cards have something to refract.
 */
export const SoftBackdrop: React.FC<{ tone: "light" | "dark"; drift?: number }> = ({ tone, drift = 0 }) => {
  const frame = useCurrentFrame() + drift;
  const t = frame / 30;
  const light = tone === "light";
  const blooms = light
    ? [
        {
          x: 260 + Math.sin(t * 0.7) * 60,
          y: 520 + Math.cos(t * 0.5) * 50,
          r: 520,
          c: "rgba(31,138,91,0.16)",
        },
        {
          x: 860 + Math.cos(t * 0.6) * 50,
          y: 980 + Math.sin(t * 0.8) * 70,
          r: 560,
          c: "rgba(200,161,90,0.22)",
        },
        { x: 420 + Math.sin(t * 0.5) * 80, y: 1500, r: 620, c: "rgba(14,26,46,0.10)" },
      ]
    : [
        { x: 540, y: 820, r: 760, c: "rgba(40,64,112,0.55)" },
        { x: 240 + Math.sin(t * 0.6) * 60, y: 380, r: 520, c: "rgba(31,138,91,0.14)" },
        { x: 900 + Math.cos(t * 0.5) * 60, y: 1380, r: 560, c: "rgba(200,161,90,0.12)" },
      ];
  return (
    <AbsoluteFill style={{ background: light ? COLORS.offWhite : COLORS.navy }}>
      {blooms.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x - b.r,
            top: b.y - b.r,
            width: b.r * 2,
            height: b.r * 2,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${b.c} 0%, rgba(0,0,0,0) 70%)`,
          }}
        />
      ))}
      {!light ? (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 50% 45%, rgba(0,0,0,0) 40%, rgba(4,8,16,0.65) 100%)",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
