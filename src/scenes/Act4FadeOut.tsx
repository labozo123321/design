import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TitleLockup } from "../components/TitleLockup";
import { T } from "../timeline";
import { COLORS } from "../theme";
import { EASE, ramp } from "../lib/anim";
import { TITLE_Y, titlePush } from "./Act4Title";
import { SceneProps } from "./types";

/**
 * 1060–1080 · Fade to black with grain only. The global grain layer eases back
 * to its frame-0 level, so the last frame flows straight into the first.
 */
export const Act4FadeOut: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const fade = 1 - ramp(frame, 0, 13, EASE.noir);
  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      {fade > 0 ? (
        <AbsoluteFill
          style={{
            opacity: fade,
            transform: `scale(${titlePush(T.title.duration + T.titleGlitch.duration + frame)})`,
          }}
        >
          <TitleLockup mark={1} rules={1} tagline={1} y={TITLE_Y} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
