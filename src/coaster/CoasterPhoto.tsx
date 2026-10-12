import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill } from "remotion";
import { CoasterPost } from "./CoasterPost";
import { CoasterWorld } from "./CoasterWorld";
import { PHOTO_FRAME, photoCam } from "./world";

/**
 * The ride photo (a still, 1920x1080): the on-ride camera at the bottom of the drop, the flash firing, the
 * front row coming at it. Rendered once to public/coaster/photo.png; the ending shows it on the booth's
 * screen.
 *
 *     npx remotion still CoasterPhoto public/coaster/photo.png --gl=swangle
 */
export const CoasterPhoto: React.FC = () => {
  const c = photoCam();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={1920}
        height={1080}
        shadows
        camera={{ fov: 30, near: 0.03, far: 30000, position: [0, 2, 0] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        <CoasterWorld frame={PHOTO_FRAME} mode="photo" />
        <CoasterPost
          prev={{ pos: c.pos, quat: c.quat, fov: c.fov }}
          blur={0}
          grade={{ ca: 0.001, flash: 0.0, freeze: 0, vhs: 0, tilt: 0, dark: 0, time: 0, sat: 1.12, con: 1.08 }}
          bloom={0.2}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
