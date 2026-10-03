import React from "react";
import { AbsoluteFill, Freeze, interpolate, random, useCurrentFrame } from "remotion";
import { ChromaticText } from "../components/ChromaticText";
import { GlitchSlice } from "../components/GlitchSlice";
import { NoirLight } from "../components/NoirLight";
import { TextColumn } from "../components/Type";
import { BEATS, T } from "../timeline";
import { COLORS, FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, steps } from "../lib/anim";
import { shake } from "../lib/noise";
import { Act1Spent } from "./Act1Spent";
import { SceneProps } from "./types";

/** Glitch-cut pattern for the transition in: which layer shows on each frame. */
const CUT_IN: ("old" | "new")[] = ["old", "old", "new", "old", "new", "new", "old", "new"];

/**
 * 240–300 · Glitch slice transition out of SPENT. "same life" sits there, then
 * glitches into "same life. forever." for a split second and back.
 */
export const Act1SameLife: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const inCut = frame < CUT_IN.length;
  const showOld = inCut && CUT_IN[frame] === "old";

  const g = frame - BEATS.foreverAt;
  const forever = g >= 0 && g < BEATS.foreverLen;
  const aftershock = frame === BEATS.foreverAt + 14;
  const breakdown = interpolate(frame, [duration - 10, duration], [0, 1], { ...CLAMP, easing: steps(5) });

  const cutGlitch = inCut ? interpolate(frame, [0, CUT_IN.length], [1, 0.25], CLAMP) : 0;
  const glitch = Math.max(cutGlitch, forever ? 0.85 : 0, aftershock ? 0.5 : 0, breakdown * 0.9);
  const aberration = 1.8 + (forever ? 18 : 0) + (aftershock ? 8 : 0) + breakdown * 22 + (inCut ? 10 : 0);
  const s = shake("same-life", frame, 2 + breakdown * 10 + (forever ? 8 : 0), 0.8);
  const push = interpolate(frame, [0, duration], [1, 1.07], { ...CLAMP, easing: EASE.noir });
  const textIn = interpolate(frame, [2, 9], [0, 1], { ...CLAMP, easing: steps(4) });

  return (
    <AbsoluteFill style={{ background: COLORS.noir }}>
      <GlitchSlice
        intensity={glitch}
        seed="same-life"
        hold={1}
        maxShift={190}
        rgb={20}
        background={COLORS.noir}
      >
        {showOld ? (
          <Freeze frame={T.spent.duration - 1}>
            <Act1Spent duration={T.spent.duration} />
          </Freeze>
        ) : (
          <AbsoluteFill style={{ background: COLORS.noir }}>
            <NoirLight x={540} y={500} radius={700} intensity={0.6} hardness={0.5} />
            <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) scale(${push})` }}>
              <TextColumn y={FOCUS_Y} style={{ opacity: textIn }}>
                <ChromaticText offset={aberration} angle={random(`sl-ang-${frame}`) * 0.4 - 0.2}>
                  <div style={{ fontFamily: FONTS.serif, fontSize: 132, lineHeight: 1.05 }}>
                    same life
                    {/* the full stop only exists while the lie is visible; absolute so centring never shifts */}
                    <span style={{ position: "absolute", opacity: forever ? 1 : 0 }}>.</span>
                  </div>
                </ChromaticText>
                <div
                  style={{
                    fontFamily: FONTS.serif,
                    fontSize: 132,
                    lineHeight: 1.05,
                    color: "#C3181E",
                    opacity: forever ? 1 : aftershock ? 0.3 : 0,
                    position: "absolute",
                    top: "100%",
                  }}
                >
                  forever.
                </div>
              </TextColumn>
            </AbsoluteFill>
          </AbsoluteFill>
        )}
      </GlitchSlice>
    </AbsoluteFill>
  );
};
