import React from "react";
import { AbsoluteFill, random } from "remotion";

const COLORS = ["#88CC2D", "#F5A623", "#3BA3F5", "#FF5C8A", "#FFE14D", "#FFFFFF", "#9B6BFF"];

/**
 * Seeded confetti burst fired at frame 0 (relative `t` in frames) from (x, y).
 * Simple ballistic motion with drag, gravity and tumbling.
 */
export const Confetti: React.FC<{
  t: number;
  x: number;
  y: number;
  count?: number;
  seed?: string;
  power?: number;
}> = ({ t, x, y, count = 140, seed = "confetti", power = 1 }) => {
  if (t < 0) return null;
  const sec = t / 30;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const r = (k: string) => random(`${seed}-${i}-${k}`);
        const ang = -Math.PI / 2 + (r("a") - 0.5) * Math.PI * 1.5;
        const v = (900 + r("v") * 1500) * power;
        const drag = 2.2;
        const k = (1 - Math.exp(-drag * sec)) / drag;
        const px = x + Math.cos(ang) * v * k + Math.sin(sec * 4 + i) * 20;
        const py = y + Math.sin(ang) * v * k + 900 * sec * sec * 0.9;
        const w = 14 + r("w") * 16;
        const h = r("shape") < 0.3 ? w : w * 0.45;
        const spin = sec * (6 + r("s") * 10) + r("p") * 6;
        if (py > 2100) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: h,
              background: COLORS[i % COLORS.length],
              borderRadius: r("shape") < 0.3 ? "50%" : 3,
              transform: `rotate(${spin * 57}deg) scaleY(${Math.cos(spin * 1.7)})`,
              opacity: Math.min(1, 3 - sec),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
