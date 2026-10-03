import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type LightLeakProps = {
  /** 0..1 strength of the leak. */
  intensity: number;
  /** 0..1 overexposure: the leak blooms until the frame burns to warm white. */
  flare?: number;
  /** Colour the burn settles into (the next scene's background). */
  burnTo?: string;
};

type Blob = { x: number; y: number; r: number; color: string };

/**
 * Warm film light leak: soft radial blooms drifting across the frame with a
 * screen blend, plus an optional overexposure flare used as a transition.
 */
export const LightLeak: React.FC<LightLeakProps> = ({ intensity, flare = 0, burnTo = "#F3F0E9" }) => {
  const frame = useCurrentFrame();
  if (intensity <= 0.001 && flare <= 0.001) return null;
  const t = frame / 30;

  const blobs: Blob[] = [
    {
      x: 900 - frame * 2.4 + Math.sin(t * 1.3) * 40,
      y: 260 + frame * 2.2 + Math.cos(t) * 50,
      r: 980,
      color: "rgba(226,140,62,0.85)",
    },
    {
      x: 1040 - frame * 1.2,
      y: 980 + Math.sin(t * 0.8) * 90,
      r: 760,
      color: "rgba(196,82,58,0.55)",
    },
    {
      x: 560 + Math.sin(t * 0.6) * 120,
      y: 40 + frame * 3.2,
      r: 720,
      color: "rgba(244,212,160,0.8)",
    },
    {
      x: 180 + frame * 2,
      y: 1620 - frame * 2.6,
      r: 640,
      color: "rgba(200,161,90,0.5)",
    },
  ];

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ mixBlendMode: "screen", opacity: intensity }}>
        {blobs.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x - b.r,
              top: b.y - b.r,
              width: b.r * 2,
              height: b.r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${b.color} 0%, rgba(0,0,0,0) 68%)`,
            }}
          />
        ))}
        {/* diagonal burn streak along the film edge */}
        <div
          style={{
            position: "absolute",
            left: -300,
            top: 520 + Math.sin(t * 0.9) * 60,
            width: 1800,
            height: 220,
            transform: "rotate(-28deg)",
            background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(255,206,150,0.32), rgba(0,0,0,0))",
            filter: "blur(30px)",
          }}
        />
      </AbsoluteFill>
      {flare > 0.001 ? (
        <AbsoluteFill
          style={{
            opacity: flare,
            background: `radial-gradient(ellipse 120% 90% at 68% 30%, #FFFDF8 0%, #FBF3E4 35%, ${burnTo} 100%)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
