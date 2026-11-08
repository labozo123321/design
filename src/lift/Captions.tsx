import React from "react";
import { AbsoluteFill } from "remotion";
import { CAPTIONS } from "./timeline";
import { LIFT_FONT } from "./fonts";

export const CAPTION_FONT = LIFT_FONT;

/**
 * Word-by-word captions as in the reel: one to three words at a time, white, heavy and rounded, with a
 * dark outline and a soft shadow, centred a little below the middle of the frame.
 */
export const Captions: React.FC<{ t: number }> = ({ t }) => {
  const c = CAPTIONS.find((x) => t >= x.show && t < x.hide);
  if (!c) return null;
  const age = t - c.show;
  const pop = Math.min(1, age / 0.07);
  const scale = 0.94 + 0.06 * pop;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: 1344,
          transform: `translateY(-50%) scale(${scale})`,
          textAlign: "center",
          fontFamily: CAPTION_FONT,
          fontWeight: 900,
          fontSize: 58,
          lineHeight: 1.1,
          letterSpacing: 0.5,
          color: "#ffffff",
          WebkitTextStroke: "11px #121216",
          paintOrder: "stroke fill",
          textShadow: "0 5px 10px rgba(0,0,0,0.45)",
        }}
      >
        {c.text}
      </div>
    </AbsoluteFill>
  );
};
