import React from "react";
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GlassCard } from "../components/GlassCard";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { WhipPan } from "../components/WhipPan";
import { BEATS, T } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { EASE, ramp, SPRING } from "../lib/anim";
import { Act3Outreach } from "./Act3Outreach";
import { SceneProps } from "./types";

const WHIP_LEN = 8;
const FILL_AT = 5;
const CHIPS_AT = BEATS.progressChips;
const BOSS_AT = BEATS.progressBoss;

export const THERMO = { cx: 262, top: 370, bottom: 1270, w: 120, bulbR: 92 } as const;
const FILL_FROM = 0.05;
const FILL_TO = 0.46;

const Flame: React.FC = () => (
  <svg width={46} height={46} viewBox="0 0 24 24">
    <path
      d="M12 2.5c.6 3.2 4.8 5.3 4.8 10.1A4.8 4.8 0 0 1 12 17.4a4.8 4.8 0 0 1-4.8-4.8c0-2.2 1.2-3.6 2.3-4.8.2 1.5 1 2.6 2.1 3 .1-3 .1-5.4.4-8.3z"
      fill={COLORS.gold}
    />
    <path
      d="M12 21.5c-2.6 0-4.2-1.5-4.2-3.4"
      stroke={COLORS.gold}
      strokeWidth={1.6}
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

const Bolt: React.FC = () => (
  <svg width={42} height={42} viewBox="0 0 24 24">
    <path d="M13.5 2 L5 13.5 h6 L10 22 l9-12h-6.2z" fill={COLORS.emerald} />
  </svg>
);

const Shield: React.FC = () => (
  <svg
    width={34}
    height={34}
    viewBox="0 0 24 24"
    fill="none"
    stroke={COLORS.gold}
    strokeWidth={2}
    strokeLinejoin="round"
  >
    <path d="M12 2.5 L20 5.5 V11.5 C20 16.3 16.6 20 12 21.5 C7.4 20 4 16.3 4 11.5 V5.5 Z" />
    <path d="M8.5 12 L11 14.5 L15.8 9.6" strokeLinecap="round" />
  </svg>
);

const Chip: React.FC<{ pop: number; children: React.ReactNode; top: number }> = ({ pop, children, top }) => (
  <div
    style={{
      position: "absolute",
      left: 410,
      top,
      transform: `scale(${pop})`,
      transformOrigin: "0% 50%",
      opacity: Math.min(1, pop * 2),
    }}
  >
    <GlassCard
      radius={999}
      style={{
        height: 112,
        padding: "0 40px 0 30px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: FONTS.sans,
        fontWeight: 600,
        fontSize: 48,
        letterSpacing: "-0.03em",
        color: COLORS.ink,
      }}
    >
      {children}
    </GlassCard>
  </div>
);

const ProgressBoard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = interpolate(
    spring({ frame: frame - FILL_AT, fps, config: SPRING.fill }),
    [0, 1],
    [FILL_FROM, FILL_TO],
  );
  const chip1 = spring({ frame: frame - CHIPS_AT[0], fps, config: SPRING.pop });
  const chip2 = spring({ frame: frame - CHIPS_AT[1], fps, config: SPRING.pop });
  const flip = spring({ frame: frame - BOSS_AT, fps, config: { damping: 15, stiffness: 120, mass: 0.8 } });

  const innerTop = THERMO.top + 20;
  const innerBottom = THERMO.bottom + 40;
  const level = innerBottom - (innerBottom - innerTop) * fill;

  return (
    <AbsoluteFill>
      <SoftBackdrop tone="light" drift={40} />

      {/* thermometer */}
      <GlassCard
        radius={THERMO.w / 2}
        style={{
          position: "absolute",
          left: THERMO.cx - THERMO.w / 2,
          top: THERMO.top,
          width: THERMO.w,
          height: THERMO.bottom - THERMO.top + 60,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: THERMO.cx - THERMO.bulbR,
          top: THERMO.bottom + 60 - THERMO.bulbR * 0.9,
          width: THERMO.bulbR * 2,
          height: THERMO.bulbR * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle at 38% 35%, #2FAE77, ${COLORS.emerald} 55%, ${COLORS.emeraldDeep})`,
          boxShadow: "0 24px 50px -18px rgba(21,96,63,0.7), inset 0 2px 0 rgba(255,255,255,0.3)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: THERMO.cx - 38,
          width: 76,
          top: level,
          bottom: 1920 - (THERMO.bottom + 90),
          borderRadius: 38,
          background: `linear-gradient(0deg, ${COLORS.emerald} 0%, #3E9E6A 55%, ${COLORS.gold} 100%)`,
          boxShadow: "0 0 30px rgba(31,138,91,0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: THERMO.cx - 30,
          top: THERMO.top + 28,
          width: 12,
          height: THERMO.bottom - THERMO.top - 60,
          borderRadius: 6,
          background: "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0))",
        }}
      />
      {/* stage ticks + labels live on the left so the right column stays clear */}
      {Array.from({ length: 10 }).map((_, i) => {
        const y = innerBottom - 30 - ((innerBottom - 30 - innerTop - 10) * i) / 9;
        const w = i % 3 === 0 ? 26 : 16;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: THERMO.cx - THERMO.w / 2 - 10 - w,
              top: y,
              width: w,
              height: 3,
              borderRadius: 2,
              background: "rgba(14,26,46,0.28)",
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          right: 1080 - (THERMO.cx - THERMO.w / 2 - 46),
          top: innerTop - 6,
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: 24,
          color: COLORS.inkSoft,
        }}
      >
        Goal
      </div>
      {/* level marker: a gold notch riding the top of the fill */}
      <div
        style={{
          position: "absolute",
          left: THERMO.cx - THERMO.w / 2 - 44,
          top: level - 9,
          width: 0,
          height: 0,
          borderTop: "9px solid transparent",
          borderBottom: "9px solid transparent",
          borderLeft: `16px solid ${COLORS.gold}`,
          opacity: ramp(frame, FILL_AT + 2, FILL_AT + 8),
        }}
      />

      <Chip pop={chip1} top={372}>
        <Flame /> Streak 12
      </Chip>
      <Chip pop={chip2} top={512}>
        <Bolt />
        <span style={{ color: COLORS.emeraldDeep }}>+250 XP</span>
      </Chip>

      {/* boss mission flips in */}
      <div
        style={{
          position: "absolute",
          left: 410,
          top: 676,
          width: 530,
          transformOrigin: "0% 50%",
          transform: `perspective(1800px) rotateY(${(1 - flip) * -96}deg)`,
          opacity: flip > 0.02 ? 1 : 0,
          backfaceVisibility: "hidden",
        }}
      >
        <div
          style={{
            borderRadius: 40,
            padding: "44px 42px 44px",
            background: "linear-gradient(160deg, #15233F 0%, #0B1426 100%)",
            boxShadow:
              "inset 0 0 0 1.5px rgba(200,161,90,0.45), 0 40px 80px -30px rgba(11,20,38,0.6), 0 12px 24px -12px rgba(11,20,38,0.4)",
            fontFamily: FONTS.sans,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Shield />
            <span style={{ fontWeight: 600, fontSize: 30, color: COLORS.gold, letterSpacing: "0.01em" }}>
              Boss mission
            </span>
          </div>
          <div
            style={{
              marginTop: 24,
              fontWeight: 600,
              fontSize: 52,
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
              color: "#F4F1EA",
            }}
          >
            Pitch 3 local businesses
          </div>
          <div style={{ marginTop: 14, fontWeight: 500, fontSize: 26, color: "rgba(244,241,234,0.55)" }}>
            Due Friday
          </div>
          <div style={{ marginTop: 34, display: "flex", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 10,
                  borderRadius: 5,
                  background: i === 0 ? COLORS.emerald : "rgba(244,241,234,0.14)",
                }}
              />
            ))}
          </div>
          <div
            style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span style={{ fontWeight: 500, fontSize: 27, color: "rgba(244,241,234,0.6)" }}>1 of 3</span>
            <span
              style={{
                fontWeight: 600,
                fontSize: 25,
                color: COLORS.gold,
                border: "1.5px solid rgba(200,161,90,0.6)",
                borderRadius: 999,
                padding: "8px 16px",
              }}
            >
              +500 XP
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * 780–810 · Whip pan with directional motion blur. A thermometer tracker fills
 * partway on a spring, "Streak 12" and "+250 XP" pop in, a Boss mission card
 * flips in.
 */
export const Act3Progress: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const whip = ramp(frame, 0, WHIP_LEN, EASE.whip);
  return (
    <AbsoluteFill style={{ background: COLORS.navy }}>
      <WhipPan
        progress={whip}
        outgoing={
          <Sequence from={-T.outreach.duration} layout="none">
            <Act3Outreach duration={T.outreach.duration} />
          </Sequence>
        }
        incoming={<ProgressBoard />}
      />
    </AbsoluteFill>
  );
};
