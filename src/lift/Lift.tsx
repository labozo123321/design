import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { useThree } from "@react-three/fiber";
import { Cam, camBlur, camQuat } from "./rig";
import { LiftPost } from "./Post";
import { Captions } from "./Captions";
import { FPS } from "./timeline";
import { shotAt } from "./shots";
import { fontReady, onFontReady } from "./fonts";

/**
 * POV: rockets terrify you, so you build an elevator to space. A narrated 3D cartoon in the reel format
 * it copies: second person, a secret master plan, quick cuts on the words, word-by-word captions, the
 * little round-headed cast, a hologram globe in a war room, and a wink at the end.
 */

export const CamRig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(camQuat(c));
  camera.fov = c.fov;
  camera.near = c.near ?? 0.1;
  camera.far = c.far ?? 3000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

export const Lift: React.FC = () => {
  const frame = useCurrentFrame();
  // the canvas waits for the font, so no label is ever drawn in a fallback face
  const [fontOk, setFontOk] = useState(fontReady());
  useEffect(() => {
    onFontReady(() => setFontOk(true));
  }, []);
  const props = getInputProps() as { noCaptions?: boolean; t?: number };
  const t = props.t ?? frame / FPS;
  const { shot, u } = shotAt(t);
  const st = shot.make(t, u);
  // the camera half a frame ago (same shot), for the motion blur
  const prevT = Math.max(shot.t0, t - 0.5 / FPS);
  const prev = prevT < t ? shot.make(prevT, prevT - shot.t0).cam : st.cam;
  const blur = st.blur === false ? { dir: [0, 0] as [number, number], zoom: 0 } : camBlur(st.cam, prev, 0.6, 1080 / 1920, st.blurRef);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {fontOk ? (
      <ThreeCanvas
        width={1080}
        height={1920}
        shadows
        camera={{ fov: 35, near: 0.1, far: 400, position: [0, 1, 5] }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
      >
        <CamRig c={st.cam} />
        {st.content}
        <LiftPost
          grade={{ time: t, ...(st.grade ?? {}) }}
          lens={st.lens ?? { focus: 5, aperture: 0 }}
          bloom={st.bloom ?? { strength: 0.4, radius: 0.35, threshold: 1.05 }}
          blur={blur}
          ink={st.ink}
        />
      </ThreeCanvas>
      ) : null}
      {!props.noCaptions ? <Captions t={t} /> : null}
    </AbsoluteFill>
  );
};

/** The captions alone, on a transparent frame: rendered at full size and laid over the picture. */
export const LiftCaptionsOnly: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Captions t={frame / FPS} />
    </AbsoluteFill>
  );
};
