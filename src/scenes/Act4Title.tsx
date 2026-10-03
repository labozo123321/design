import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TitleLockup } from "../components/TitleLockup";
import { COLORS, FOCUS_Y } from "../theme";
import { CLAMP, EASE, ramp } from "../lib/anim";
import { SceneProps } from "./types";

export const TITLE_Y = FOCUS_Y - 20;

/** Slow push shared by the three title scenes (absolute title frames, no reset between them). */
export const titlePush = (titleFrame: number) => 1 + titleFrame * 0.00028;

/**
 * 960–1020 · Title card. APP_NAME as a gold luxury wordmark, thin gold rules
 * grow out from the centre, "COMING SOON" in wide small caps.
 */
export const Act4Title: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const mark = ramp(frame, 0, 18, EASE.editorial);
  const rules = ramp(frame, 8, 30, EASE.uiInOut);
  const tagline = interpolate(frame, [18, 34], [0, 1], { ...CLAMP, easing: EASE.editorial });
  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      <AbsoluteFill style={{ transform: `scale(${titlePush(frame)})` }}>
        <TitleLockup mark={mark} rules={rules} tagline={tagline} y={TITLE_Y} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
