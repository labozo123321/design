import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ChromaticText } from "../components/ChromaticText";
import { NoirLight } from "../components/NoirLight";
import { LetterReveal, TextColumn } from "../components/Type";
import { COLORS, FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE } from "../lib/anim";
import { shake } from "../lib/noise";
import { SceneProps } from "./types";

/** 45–90 · Hard cut on a hit. "every morning", letter by letter, handheld shake. */
export const Act1EveryMorning: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  // The cut lands on a sound hit: a jolt that settles into a nervous handheld drift.
  const jolt = interpolate(frame, [0, 6], [14, 0], CLAMP);
  const s = shake("every-morning", frame, 5 + jolt);
  const flash = interpolate(frame, [0, 3], [0.12, 0], CLAMP);
  const push = interpolate(frame, [0, duration], [1, 1.06], { ...CLAMP, easing: EASE.noir });

  return (
    <AbsoluteFill style={{ background: COLORS.noir }}>
      <NoirLight x={540} y={420} radius={760} intensity={0.55} hardness={0.4} />
      <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg) scale(${push})` }}>
        <TextColumn y={FOCUS_Y}>
          <ChromaticText offset={1.8 + jolt * 0.4}>
            <LetterReveal
              text="every morning"
              frame={frame}
              start={4}
              stagger={2.2}
              fade={10}
              style={{ fontFamily: FONTS.serif, fontSize: 124, letterSpacing: "-0.005em" }}
            />
          </ChromaticText>
        </TextColumn>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: COLORS.bone, opacity: flash }} />
    </AbsoluteFill>
  );
};
