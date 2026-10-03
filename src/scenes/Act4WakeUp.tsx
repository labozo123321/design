import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TextColumn } from "../components/Type";
import { COLORS, FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp } from "../lib/anim";
import { SceneProps } from "./types";

/** 900–960 · "Wake up different." Very large serif, gold on black, tracking out slowly. */
export const Act4WakeUp: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const fadeIn = ramp(frame, 2, 20, EASE.editorial);
  const fadeOut = 1 - ramp(frame, duration - 9, duration - 1, EASE.noir);
  const tracking = interpolate(frame, [0, duration], [-0.01, 0.055], CLAMP);
  const scale = interpolate(frame, [0, duration], [1, 1.035], CLAMP);

  const line: React.CSSProperties = {
    fontFamily: FONTS.serif,
    fontSize: 172,
    lineHeight: 0.98,
    letterSpacing: `${tracking}em`,
    paddingLeft: `${tracking}em`,
    whiteSpace: "nowrap",
    backgroundImage: `linear-gradient(180deg, ${COLORS.goldLight} 0%, ${COLORS.gold} 55%, ${COLORS.goldDeep} 100%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };

  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      <TextColumn
        y={FOCUS_Y}
        style={{
          opacity: fadeIn * fadeOut,
          filter: fadeIn < 1 ? `blur(${(1 - fadeIn) * 12}px)` : undefined,
          transform: `translateY(-50%) scale(${scale})`,
        }}
      >
        <div style={line}>Wake up</div>
        <div style={line}>different.</div>
      </TextColumn>
    </AbsoluteFill>
  );
};
