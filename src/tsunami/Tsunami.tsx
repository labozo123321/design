import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Html5Audio as Audio, staticFile, useCurrentFrame } from "remotion";
import { PinPost } from "../pinball/PinPost";
import type { Pose } from "../pinball/camera";
import { BeachWorld } from "./BeachWorld";
import { CUT, FPS, camAt, rumbleAt } from "./world";

/**
 * The random ending of "POV: you're a pinball": hard cut to a beach where the sea pulls back and a tsunami
 * comes in, then a hard cut to black. Rendered on its own and spliced onto the pinball piece; the
 * soundtrack is the pinball bed from 70 s.
 */

export const TSUNAMI_AT = 70 * FPS;

const poseOf = (frame: number): Pose => {
  const c = camAt(frame);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(c.pitch, c.yaw, c.roll, "YXZ"));
  return { pos: new THREE.Vector3(c.x, c.y, c.z), quat, fov: c.fov } as unknown as Pose;
};

export const Tsunami: React.FC = () => {
  const frame = useCurrentFrame();
  const u = frame / FPS;
  const r = rumbleAt(u);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {u < CUT ? (
        <ThreeCanvas
          width={1080}
          height={1920}
          shadows
          camera={{ fov: 68, near: 0.04, far: 30000, position: [0, 1.7, -0.8] }}
          gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <BeachWorld frame={frame} />
          <PinPost
            prev={poseOf(Math.max(0, frame - 1))}
            blur={frame === 0 ? 0 : 1}
            grade={{
              ca: 0.0018 + 0.007 * r,
              flash: 0,
              freeze: 0,
              vhs: 0,
              tilt: 0,
              dark: 0,
              time: u,
              sat: 1.14,
              con: 1.07,
            }}
            bloom={0.2}
          />
        </ThreeCanvas>
      ) : null}
      <Audio src={staticFile("pinball/bed.mp3")} trimBefore={TSUNAMI_AT} />
    </AbsoluteFill>
  );
};
