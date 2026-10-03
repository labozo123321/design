import React from "react";
import { interpolate, spring } from "remotion";
import { CLAMP, ramp, EASE } from "../lib/anim";

export type CursorKey = { f: number; x: number; y: number };

/**
 * Human-feeling cursor path: each leg is driven by a spring and bows slightly
 * off the straight line, like a wrist arc.
 */
export const cursorAt = (frame: number, fps: number, keys: CursorKey[]) => {
  let x = keys[0].x;
  let y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    const p = spring({
      frame: frame - a.f,
      fps,
      config: { damping: 24, stiffness: 150, mass: 0.6 },
      durationInFrames: Math.max(1, b.f - a.f),
    });
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bow = Math.sin(Math.PI * Math.min(1, p)) * 0.08;
    x += dx * p - dy * bow;
    y += dy * p + dx * bow;
  }
  return { x, y };
};

type CursorProps = {
  x: number;
  y: number;
  frame: number;
  /** Frames where a click lands (press + ripple). */
  clicks?: number[];
  /** Ripple colour; pick contrast against the surface. */
  rippleColor?: string;
  opacity?: number;
  scale?: number;
};

const ARROW = "M0 0 L0 25.5 L6.4 19.6 L10.6 29.4 L14.7 27.6 L10.6 18.1 L18.9 18.1 Z";

/** macOS-style arrow cursor with press feedback and click ripples. Tip sits on (x, y). */
export const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  frame,
  clicks = [],
  rippleColor = "rgba(14,26,46,0.55)",
  opacity = 1,
  scale = 2.3,
}) => {
  if (opacity <= 0.001) return null;
  let press = 0;
  for (const c of clicks) {
    const d = frame - c;
    if (d >= -2 && d <= 4) press = Math.max(press, interpolate(d, [-2, 0, 4], [0, 1, 0], CLAMP));
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity, pointerEvents: "none" }}>
      {clicks.map((c) => {
        const d = frame - c;
        if (d < 0 || d > 16) return null;
        const p = ramp(d, 0, 16, EASE.ui);
        return (
          <React.Fragment key={c}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 160 * p,
                height: 160 * p,
                marginLeft: -80 * p,
                marginTop: -80 * p,
                borderRadius: "50%",
                border: `4px solid ${rippleColor}`,
                opacity: 1 - p,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 70,
                height: 70,
                marginLeft: -35,
                marginTop: -35,
                borderRadius: "50%",
                background: rippleColor,
                opacity: 0.35 * (1 - ramp(d, 0, 8)),
                transform: `scale(${0.4 + 0.6 * p})`,
              }}
            />
          </React.Fragment>
        );
      })}
      <svg
        width={22 * scale}
        height={32 * scale}
        viewBox="-1.5 -1.5 22 32"
        style={{
          position: "absolute",
          left: x - 1.5 * scale,
          top: y - 1.5 * scale,
          transform: `scale(${1 - press * 0.12})`,
          transformOrigin: `${1.5 * scale}px ${1.5 * scale}px`,
          filter: "drop-shadow(0 5px 7px rgba(0,0,0,0.32))",
          overflow: "visible",
        }}
      >
        <path d={ARROW} fill="#0D0F14" stroke="#FFFFFF" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
