import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { useThree } from "@react-three/fiber";
import { NFRAMES } from "./script";
import { Overlay } from "./Overlay";
import { World } from "./World";

/**
 * POV: you had a secret knock with your sister. Told by the wall between your rooms: a roofless dollhouse
 * seen from above, two bedrooms either side of one wall, 2004 to Christmas Eve 2025.
 */

export const KNOCK_FRAMES = NFRAMES;

export type Cam = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number; near?: number };
export const Rig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = c.near ?? 0.05;
  camera.far = 200;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

export const KnockVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const props = getInputProps() as { cam?: string; hide?: string[]; t?: number; noOverlay?: boolean };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas width={1080} height={1920} shadows camera={{ fov: 30, near: 0.05, far: 200, position: [0, 10, 2] }} gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}>
        <World frame={frame} cam={props.cam} hide={props.hide ?? []} tOverride={props.t} />
      </ThreeCanvas>
      {!props.noOverlay && !props.cam ? <Overlay frame={frame} /> : null}
    </AbsoluteFill>
  );
};
