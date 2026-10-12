import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CoasterPost } from "./CoasterPost";
import { CoasterWorld } from "./CoasterWorld";
import { DURATION, FPS, camAt } from "./world";

/**
 * POV: your little sister wanted the front row. A first-person ride on a dive coaster at golden hour,
 * with no narration: the lift, the hold over the vertical drop, the drop into a tunnel, an Immelmann, a
 * splashdown, a zero-g roll, the swoop, the hop and the brakes; then the ride photo.
 */

export const COASTER_DURATION = DURATION;

export const Coaster: React.FC = () => {
  const frame = useCurrentFrame();
  const u = frame / FPS;
  const prev = camAt(Math.max(0, frame - 1));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={1080}
        height={1920}
        shadows
        camera={{ fov: 76, near: 0.03, far: 30000, position: [0, 2, 0] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        <CoasterWorld frame={frame} />
        <CoasterPost
          prev={prev}
          blur={frame === 0 ? 0 : 1}
          grade={{ ca: 0.0015, flash: 0, freeze: 0, vhs: 0, tilt: 0, dark: 0, time: u, sat: 1.1, con: 1.05 }}
          bloom={0.25}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
