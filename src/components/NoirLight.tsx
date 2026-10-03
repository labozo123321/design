import React from "react";
import { AbsoluteFill } from "remotion";

type NoirLightProps = {
  /** centre of the light pool */
  x: number;
  y: number;
  /** radius of the pool in px */
  radius: number;
  /** 0..1 */
  intensity: number;
  /** 0 = soft falloff, 1 = hard-edged practical light */
  hardness?: number;
  /** vertical stretch of the pool */
  stretch?: number;
};

/** One harsh key light: a hard-edged pool of bone-white light on black. */
export const NoirLight: React.FC<NoirLightProps> = ({
  x,
  y,
  radius,
  intensity,
  hardness = 0.6,
  stretch = 1.25,
}) => {
  if (intensity <= 0.001) return null;
  const a = intensity;
  const edge = 0.45 + hardness * 0.3;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse ${radius}px ${radius * stretch}px at ${x}px ${y}px, rgba(237,230,218,${
          0.2 * a
        }) 0%, rgba(237,230,218,${0.13 * a}) ${edge * 60}%, rgba(237,230,218,${0.05 * a}) ${edge * 100}%, rgba(237,230,218,0) 100%)`,
      }}
    />
  );
};
