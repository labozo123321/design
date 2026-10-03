import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { TextColumn, TypedText } from "../components/Type";
import { BEATS, T } from "../timeline";
import { FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, SPRING } from "../lib/anim";
import { Act3Search, CLEAR_BUTTON } from "./Act3Search";
import { SceneProps } from "./types";

const PHRASE = "Look no further";
const TYPE_START = BEATS.lookType;
const TYPE_END = 17;
const IRIS_LEN = 11;

export const LOOK_TYPE: React.CSSProperties = {
  fontFamily: FONTS.sans,
  fontWeight: 600,
  fontSize: 104,
  letterSpacing: "-0.04em",
  lineHeight: 1,
  color: "#F4F1EA",
  whiteSpace: "nowrap",
};

/** The finished line, also used by the next scene as it gets pushed away. */
export const LookNoFurtherLine: React.FC<{
  period: number;
  frame: number;
  typed?: number;
  caret?: boolean;
}> = ({ period, frame, typed = PHRASE.length, caret = false }) => (
  <div style={{ ...LOOK_TYPE, position: "relative" }}>
    <TypedText
      text={PHRASE}
      visible={typed}
      frame={frame}
      caret={caret}
      typing={typed < PHRASE.length}
      caretColor="#F4F1EA"
    />
    <span
      style={{
        position: "absolute",
        display: "inline-block",
        opacity: period > 0 ? 1 : 0,
        transform: `translateY(${(1 - period) * -90}px) scale(${1 + (1 - period) * 0.8})`,
        transformOrigin: "50% 80%",
      }}
    >
      .
    </span>
  </div>
);

/**
 * 630–660 · Iris: a navy circle opens from the clear button the cursor just
 * hit. "Look no further" types on, a beat, then the period lands with a click
 * (SFX @ 655).
 */
export const Act3LookNoFurther: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const iris = interpolate(frame, [0, IRIS_LEN], [0, 2300], { ...CLAMP, easing: EASE.whip });
  const typed = interpolate(frame, [TYPE_START, TYPE_END], [0, PHRASE.length], CLAMP);
  // +1 so the period is already landing on the click frame itself.
  const period =
    frame >= BEATS.periodClick
      ? spring({ frame: frame - BEATS.periodClick + 1, fps, config: SPRING.pop })
      : 0;
  const nudge = frame >= BEATS.periodClick ? Math.exp(-(frame - BEATS.periodClick) / 2) * 5 : 0;

  return (
    <AbsoluteFill>
      {frame < IRIS_LEN ? (
        <Sequence from={-T.search.duration} layout="none">
          <Act3Search duration={T.search.duration} />
        </Sequence>
      ) : null}
      <AbsoluteFill style={{ clipPath: `circle(${iris}px at ${CLEAR_BUTTON.x}px ${CLEAR_BUTTON.y}px)` }}>
        <SoftBackdrop tone="dark" />
        <TextColumn y={FOCUS_Y} style={{ transform: `translateY(calc(-50% + ${nudge}px))` }}>
          <LookNoFurtherLine period={period} frame={frame} typed={typed} caret={frame < BEATS.periodClick} />
        </TextColumn>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
