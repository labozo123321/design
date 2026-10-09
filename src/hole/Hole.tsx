import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Post } from "../pov/Post";
import { HoleWorld } from "./HoleWorld";

const W = 1080;
const H = 1920;
const NO_RIPPLE = { radius: 0, strength: 0, flash: 0 };

/** Bloom eases off where the whole frame glows (deep mantle, core), so it doesn't wash everything out. */
const bloomAt = (t: number) => {
  const deep = Math.min(1, Math.max(0, (t - 26) / 4)) * Math.min(1, Math.max(0, (57 - t) / 3));
  return 0.68 - 0.3 * deep;
};

export const Hole: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={W}
        height={H}
        shadows
        camera={{ fov: 74, near: 0.04, far: 2e7, position: [-8, 1.7, 9.6] }}
        gl={{ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        <HoleWorld frame={frame} />
        <Post
          strength={bloomAt(t)}
          radius={0.6}
          threshold={1.0}
          ripple={NO_RIPPLE}
          toneMapping={THREE.NeutralToneMapping}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
