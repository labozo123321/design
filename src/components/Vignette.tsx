import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Barrel-shaped vignette: an elliptical falloff plus a rounded "CRT bezel"
 * inner shadow, so the corners close in like an old lens.
 */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.8 }) => {
  if (strength <= 0.002) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 78% 62% at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,${
            0.55 * strength
          }) 82%, rgba(0,0,0,${0.92 * strength}) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -30,
          borderRadius: 140,
          boxShadow: `inset 0 0 160px 70px rgba(0,0,0,${0.6 * strength})`,
        }}
      />
    </AbsoluteFill>
  );
};
