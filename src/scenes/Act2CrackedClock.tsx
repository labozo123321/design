import React from "react";
import { AbsoluteFill, Freeze, interpolate, useCurrentFrame } from "remotion";
import { GlitchSlice } from "../components/GlitchSlice";
import { NoirLight } from "../components/NoirLight";
import { LetterReveal, TextColumn } from "../components/Type";
import { CrackLines, WallClock } from "../components/WallClock";
import { BEATS, T } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, ramp, steps } from "../lib/anim";
import { makeCracks } from "../lib/paths";
import { shake } from "../lib/noise";
import { Act2Balance } from "./Act2Balance";
import { CLOCK } from "./Act1SameCommute";
import { SceneProps } from "./types";

export const IMPACT = { x: CLOCK.cx + 70, y: CLOCK.cy - 90 };
const CRACKS = makeCracks("wall-clock", IMPACT.x, IMPACT.y, CLOCK.R * 1.35);

/** Glitch cut in from the balance screen. */
const CUT_IN: ("old" | "new")[] = ["old", "new", "old", "new", "new", "old"];
/** Second hand keeps trying to reach 12 and snapping back. */
const TWITCHES = [9, 17, 25, 33, 41, 49, 57, 65, 73, 81];

/**
 * 450–510 · The wall clock again, stuck at 5:57:59. The second hand twitches
 * and can't get to 12; the glass cracks in three hits. "they told you to wait."
 */
export const Act2CrackedClock: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const inCut = frame < CUT_IN.length;
  const showOld = inCut && CUT_IN[frame] === "old";

  // Second hand at 59 s lunges toward 12 and bounces back, again and again.
  const twitch = TWITCHES.reduce((acc, t) => {
    const d = frame - t;
    return d < 0 ? acc : acc + 5.2 * Math.exp(-d / 1.8) * Math.cos(d * 1.9);
  }, 0);
  const second = Math.min(359, 354 + twitch);

  const burstP = BEATS.crackBursts.map((b) => ramp(frame, b, b + 4, steps(4)));
  const sinceBurst = Math.min(...BEATS.crackBursts.map((b) => (frame >= b ? frame - b : 99)));
  const hit = sinceBurst < 6 ? Math.exp(-sinceBurst / 1.6) : 0;
  const s = shake("cracked", frame, 1.5 + hit * 14, 0.9);
  // Linear creep (no end anchor) so the ink-bleed scene can keep running this clock seamlessly.
  const push = 1 + frame * 0.001;
  const glitch = inCut ? interpolate(frame, [0, CUT_IN.length], [1, 0.3], CLAMP) : hit > 0.6 ? 0.18 : 0;

  return (
    <AbsoluteFill style={{ background: COLORS.noir }}>
      <GlitchSlice intensity={glitch} seed="cracked" maxShift={160} rgb={16} background={COLORS.noir}>
        {showOld ? (
          <Freeze frame={T.balance.duration - 1}>
            <Act2Balance duration={T.balance.duration} />
          </Freeze>
        ) : (
          <AbsoluteFill style={{ background: COLORS.noir }}>
            <NoirLight x={300} y={420} radius={980} intensity={1} hardness={0.75} />
            <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) scale(${push})` }}>
              <WallClock
                cx={CLOCK.cx}
                cy={CLOCK.cy}
                R={CLOCK.R}
                hour={5 * 30 + 57 * 0.5}
                minute={57 * 6}
                second={second}
              >
                <CrackLines
                  cracks={CRACKS}
                  progress={burstP}
                  clip={{ cx: CLOCK.cx, cy: CLOCK.cy, r: CLOCK.R * 0.96 }}
                />
              </WallClock>
              {/* impact flash */}
              <AbsoluteFill
                style={{
                  background: `radial-gradient(circle at ${IMPACT.x}px ${IMPACT.y}px, rgba(237,230,218,0.5), rgba(237,230,218,0) 340px)`,
                  opacity: hit * 0.9,
                }}
              />
            </AbsoluteFill>
            <TextColumn y={1420}>
              <LetterReveal
                text="they told you to wait."
                frame={frame}
                start={16}
                stagger={1.1}
                fade={8}
                blur={4}
                style={{
                  fontFamily: FONTS.serif,
                  fontSize: 58,
                  color: "rgba(237,230,218,0.86)",
                  letterSpacing: "0.01em",
                }}
              />
            </TextColumn>
          </AbsoluteFill>
        )}
      </GlitchSlice>
    </AbsoluteFill>
  );
};
