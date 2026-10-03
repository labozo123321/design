import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CircleCheck } from "../components/Checkmark";
import { GlassCard } from "../components/GlassCard";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { BEATS, T } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp, SPRING } from "../lib/anim";
import { Act3Progress } from "./Act3Progress";
import { SceneProps } from "./types";

const ITEMS = ["Find your skill", "Land a client", "Get paid"];
const STACK_LEN = 8;
const BIG_AT = 12;
const BIG = { cx: 540, cy: 830, size: 300 };

/**
 * 810–840 · Card-stack push: the progress board sinks back as a checklist card
 * slides up. Items tick one by one, then a big circular checkmark draws in the
 * centre, completes on the chime (SFX @ 825) and pulses once.
 */
export const Act3Checklist: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stack = ramp(frame, 0, STACK_LEN, EASE.uiInOut);
  const cardIn = spring({ frame, fps, config: SPRING.snappy });
  const recede = ramp(frame, BIG_AT, BIG_AT + 6, EASE.ui);

  const ring = ramp(frame, BIG_AT, BIG_AT + 6, EASE.uiInOut);
  const fill = spring({ frame: frame - BIG_AT, fps, config: SPRING.pop });
  const check = ramp(frame, BIG_AT + 1, BEATS.confirmChime, EASE.ui);
  const pulseT = frame - (BEATS.confirmChime + 1);
  const pulse = pulseT >= 0 && pulseT <= 8 ? Math.sin((pulseT / 8) * Math.PI) * 0.09 : 0;
  const wave = ramp(frame, BEATS.confirmChime + 1, BEATS.confirmChime + 13, EASE.ui);
  const ticked = BEATS.checklistTicks.filter((t) => frame >= t).length;

  return (
    <AbsoluteFill>
      <SoftBackdrop tone="light" drift={70} />

      {stack < 1 ? (
        <AbsoluteFill
          style={{
            transform: `translateY(${-stack * 300}px) scale(${1 - stack * 0.18})`,
            borderRadius: 70 * stack,
            overflow: "hidden",
            opacity: 1 - stack,
            filter: `blur(${stack * 6}px)`,
          }}
        >
          <Sequence from={-T.progress.duration} layout="none">
            <Act3Progress duration={T.progress.duration} />
          </Sequence>
        </AbsoluteFill>
      ) : null}

      {/* checklist card */}
      <div
        style={{
          position: "absolute",
          left: 160,
          width: 760,
          top: 520,
          transform: `translateY(${(1 - cardIn) * 1100}px) scale(${1 - recede * 0.06})`,
          opacity: 1 - recede * 0.72,
          filter: recede > 0 ? `blur(${recede * 7}px)` : undefined,
        }}
      >
        <GlassCard radius={44} style={{ padding: "40px 48px 26px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: FONTS.sans,
              fontWeight: 600,
              fontSize: 26,
              color: COLORS.inkSoft,
              letterSpacing: "0.01em",
            }}
          >
            <span>Checklist</span>
            <span>{ticked} of 3</span>
          </div>
          {ITEMS.map((label, i) => {
            const t = BEATS.checklistTicks[i];
            const tf = spring({ frame: frame - t, fps, config: SPRING.pop });
            const tc = ramp(frame, t, t + 4, EASE.ui);
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 30,
                  padding: "30px 0",
                  borderTop: i === 0 ? undefined : "1.5px solid rgba(14,26,46,0.08)",
                  marginTop: i === 0 ? 14 : 0,
                }}
              >
                <div style={{ position: "relative", width: 66, height: 66 }}>
                  <svg
                    width={66}
                    height={66}
                    viewBox="0 0 100 100"
                    style={{ position: "absolute", inset: 0 }}
                  >
                    <circle cx={50} cy={50} r={46} fill="none" stroke="rgba(14,26,46,0.2)" strokeWidth={4} />
                  </svg>
                  <CircleCheck
                    size={66}
                    ring={0}
                    fill={tf}
                    check={tc}
                    color={COLORS.emerald}
                    style={{ position: "absolute", inset: 0 }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 600,
                    fontSize: 46,
                    letterSpacing: "-0.035em",
                    color: COLORS.ink,
                    opacity: interpolate(tc, [0, 1], [0.55, 1], CLAMP),
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </GlassCard>
      </div>

      {/* the big check */}
      {frame >= BIG_AT ? (
        <>
          <div
            style={{
              position: "absolute",
              left: BIG.cx - BIG.size / 2,
              top: BIG.cy - BIG.size / 2,
              width: BIG.size,
              height: BIG.size,
              borderRadius: "50%",
              border: `4px solid ${COLORS.emerald}`,
              transform: `scale(${1 + wave * 1.1})`,
              opacity: (1 - wave) * 0.6 * (wave > 0 ? 1 : 0),
            }}
          />
          <div
            style={{
              position: "absolute",
              left: BIG.cx - BIG.size / 2,
              top: BIG.cy - BIG.size / 2,
              width: BIG.size,
              height: BIG.size,
              transform: `scale(${1 + pulse})`,
              borderRadius: "50%",
              boxShadow: `0 30px 80px -20px rgba(31,138,91,${0.55 * fill}), 0 0 ${90 * pulse * 10}px rgba(31,138,91,${pulse * 4})`,
            }}
          >
            <CircleCheck
              size={BIG.size}
              ring={ring}
              fill={fill}
              check={check}
              color={COLORS.emerald}
              ringColor={COLORS.emeraldDeep}
            />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
