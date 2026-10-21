import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { useThree } from "@react-three/fiber";
import { NFRAMES } from "./script";
import { Overlay } from "./Overlay";
import { World } from "./World";
import { FPS } from "./script";

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

const GHOST_OF = 22.49;
const ghostK = (t: number) => {
  const s = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  return 0.38 * s(65.4, 65.85, t) * (1 - s(66.45, 66.9, t));
};

export const KnockVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const props = getInputProps() as { cam?: string; hide?: string[]; t?: number; noOverlay?: boolean };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas width={1080} height={1920} shadows camera={{ fov: 30, near: 0.05, far: 200, position: [0, 10, 2] }} gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}>
        <World frame={frame} cam={props.cam} hide={props.hide ?? []} tOverride={props.t} />
      </ThreeCanvas>
      {/* the double exposure: the storm night of 2009 (her on your floor) over this one (you on hers) */}
      {ghostK(frame / FPS) > 0 && !props.cam ? (
        <AbsoluteFill style={{ opacity: ghostK(frame / FPS), mixBlendMode: "screen" }}>
          <ThreeCanvas width={1080} height={1920} shadows camera={{ fov: 30, near: 0.05, far: 200, position: [0, 10, 2] }} gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}>
            <World frame={frame} hide={props.hide ?? []} tOverride={props.t} ghost={GHOST_OF} />
          </ThreeCanvas>
        </AbsoluteFill>
      ) : null}
      {!props.noOverlay && !props.cam ? <Overlay frame={frame} /> : null}
    </AbsoluteFill>
  );
};

/** The overlay alone, on a transparent frame: rendered on its own and laid over the picture afterwards, so
 * the HUD and captions can change without re-rendering the 3D. */
export const KnockOverlayOnly: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Overlay frame={frame} />
    </AbsoluteFill>
  );
};
