import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { HEIGHT } from "../timeline";

type ScanlinesProps = {
  opacity?: number;
  /** px between lines */
  pitch?: number;
  /** VHS tracking band rolling down the frame */
  roll?: number;
};

/** CRT/VHS scanlines plus a slow rolling tracking band. */
export const Scanlines: React.FC<ScanlinesProps> = ({ opacity = 0.2, pitch = 4, roll = 1 }) => {
  const frame = useCurrentFrame();
  if (opacity <= 0.002) return null;
  const bandH = 220;
  const bandY = ((frame * 11) % (HEIGHT + bandH * 2)) - bandH;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          opacity,
          backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,0.85) 0px, rgba(0,0,0,0.85) 1px, rgba(255,255,255,0.03) 2px, transparent ${pitch}px)`,
        }}
      />
      {roll > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: bandY,
            height: bandH,
            opacity: roll,
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.045) 45%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.045) 55%, transparent)",
            mixBlendMode: "screen",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
