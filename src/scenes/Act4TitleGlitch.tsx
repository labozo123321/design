import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GlitchSlice } from "../components/GlitchSlice";
import { TitleLockup } from "../components/TitleLockup";
import { BEATS, T } from "../timeline";
import { COLORS } from "../theme";
import { TITLE_Y, titlePush } from "./Act4Title";
import { SceneProps } from "./types";

/**
 * 1020–1060 · The title holds, then a final 3-frame glitch hit (SFX @ 1022):
 * the horror tries to come back. Frame 1 tears, frame 2 shows the wrong words
 * in red (with the REC HUD flashing back on the global layer), frame 3 inverts.
 */
export const Act4TitleGlitch: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const hit = frame - BEATS.titleGlitch;
  const active = hit >= 0 && hit < BEATS.titleGlitchLen;
  const intensity = !active ? 0 : [1, 0.75, 0.55][hit];
  const corrupt = hit === 1;
  const invert = hit === 2;
  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      <GlitchSlice intensity={intensity} seed="title-hit" maxShift={230} rgb={26} background={COLORS.black}>
        <AbsoluteFill
          style={{
            background: COLORS.black,
            transform: `scale(${titlePush(T.title.duration + frame)})`,
            filter: invert ? "invert(1)" : undefined,
          }}
        >
          <TitleLockup mark={1} rules={1} tagline={1} y={TITLE_Y} corrupt={corrupt} />
        </AbsoluteFill>
      </GlitchSlice>
    </AbsoluteFill>
  );
};
