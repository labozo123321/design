import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { WeddingPost } from "./WeddingPost";
import { WeddingWorld } from "./WeddingWorld";
import { CUE, DURATION, FPS, camAt, smooth } from "./flight";

/**
 * POV: you're the drone carrying the wedding rings. A lakeside wedding at golden hour, seen from the
 * drone a nine-year-old ring bearer is flying: down the aisle, into the officiant's face, up into the
 * sunset, through the reception tent, the champagne tower and the cake. Then everyone's faces, and the dog.
 */

export const WEDDING_DURATION = DURATION;

export const Wedding: React.FC = () => {
  const frame = useCurrentFrame();
  const u = frame / FPS;
  const prev = camAt(Math.max(0, frame - 1));
  // the feed breaking up after the crash, black, then back (with everyone there)
  const glitch = u < CUE.glitch + 0.85 ? smooth(CUE.glitch, CUE.glitch + 0.75, u) : 1 - smooth(CUE.glitch + 1.0, CUE.feedBack + 0.1, u);
  // frosting on the lens from the moment it goes into the cake: thick at first, and when the picture comes
  // back just smears round the edges
  const frost = smooth(CUE.cakeHit + 0.03, CUE.cakeHit + 0.15, u) * (u < CUE.feedBack - 0.5 ? 1 + 0.55 * (1 - smooth(CUE.rest, CUE.glitch, u)) : 0.4);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={1080}
        height={1920}
        shadows
        camera={{ fov: 74, near: 0.02, far: 30000, position: [0, 2, 0] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        <WeddingWorld frame={frame} />
        <WeddingPost
          prev={prev}
          blur={frame === 0 || Math.abs(u - CUE.feedBack) < 0.6 ? 0 : 1}
          grade={{
            ca: 0.0015 + 0.004 * glitch,
            flash: 0,
            freeze: 0,
            vhs: 0,
            tilt: 0,
            dark: 0,
            time: u,
            sat: 1.08,
            con: 1.04,
            barrel: 1,
            glitch,
            frost,
            seed: 3.7,
            // champagne on the lens through the tower
            drops: smooth(CUE.towerHit, CUE.towerHit + 0.4, u) * (1 - smooth(CUE.cakeHit - 0.2, CUE.cakeHit, u)),
            dropT: Math.max(0, u - CUE.towerHit) * 0.3,
          }}
          bloom={0.25}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
