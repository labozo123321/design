import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP } from "../lib/anim";
import { PFONTS } from "../promo/fonts";
import { OUTLINE } from "./Arena";
import { CALLOUTS } from "./choreo";

/** Fighting-game move callout: "OVERTHINKING USES" + the thought being thrown, big and held. */
export const Callout: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = [...CALLOUTS].reverse().find(([a, b]) => frame >= a && frame < b);
  if (!c) return null;
  const [a, b, text] = c;
  const s = spring({ frame: frame - a, fps, config: { damping: 12, stiffness: 260, mass: 0.7 } });
  const out = interpolate(frame, [b - 5, b], [1, 0], CLAMP);
  const jit = frame - a < 6 ? Math.sin(frame * 7) * 6 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: 1440,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: out,
        transform: `translateX(${(1 - s) * 700 + jit}px) rotate(-3deg)`,
      }}
    >
      <div
        style={{
          fontFamily: PFONTS.comic,
          fontSize: 34,
          letterSpacing: "0.12em",
          color: "#FFC93C",
          textShadow: OUTLINE,
          marginBottom: -4,
        }}
      >
        OVERTHINKING USES
      </div>
      <div
        style={{
          background: "linear-gradient(90deg, #8E1B28, #E0303F)",
          border: "5px solid #12060C",
          borderRadius: 14,
          padding: "8px 28px 4px",
          boxShadow: "0 10px 0 #12060C",
          fontFamily: PFONTS.comic,
          fontSize: text.length > 16 ? 70 : 82,
          lineHeight: 1,
          letterSpacing: "0.03em",
          color: "#fff",
          textShadow: OUTLINE,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
};
