import React from "react";
import { AbsoluteFill, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Confetti } from "../components/Confetti";
import { Coin, Hero, PixelText } from "../components/Pixel";
import { APP, PFONTS } from "../fonts";
import { PB } from "../timeline";
import { EASE, ramp } from "../../lib/anim";

const WORD = "FourFig";
const PILL = { y: 1190, w: 520, h: 110 };

/** 720–900 · Confetti, the FourFig wordmark bouncing in, COMING SOON, the hero gets one more coin. */
export const P5Finale: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (at: number, d = 9, k = 200) =>
    spring({ frame: frame - at, fps, config: { damping: d, stiffness: k } });
  const flash = 1 - ramp(frame, 0, 6);
  const tagline = pop(PB.tagline, 14, 160);
  const pill = pop(PB.pill, 8, 220);

  // hero: falls in from the top, lands on the pill, hops once for a coin
  const heroLand = PB.hero;
  const fallT = ramp(frame, heroLand - 12, heroLand, EASE.uiInOut);
  const hop =
    frame >= heroLand + 20 && frame < heroLand + 34
      ? Math.sin(((frame - heroLand - 20) / 14) * Math.PI) * 120
      : 0;
  const heroY = PILL.y - 16 * 9 - (1 - fallT) * 1300 - hop;

  return (
    <AbsoluteFill
      style={{ background: `radial-gradient(circle at 50% 45%, #A6E24A 0%, ${APP.lime} 45%, #6FB51F 100%)` }}
    >
      {/* rotating sunburst */}
      <AbsoluteFill style={{ transform: `rotate(${frame * 0.35}deg) scale(1.6)`, opacity: 0.22 }}>
        <svg width={1080} height={1920} viewBox="-540 -960 1080 1920">
          {Array.from({ length: 20 }).map((_, i) => {
            const a = (i / 20) * Math.PI * 2;
            const b = a + Math.PI / 20;
            return (
              <polygon
                key={i}
                points={`0,0 ${Math.cos(a) * 2000},${Math.sin(a) * 2000} ${Math.cos(b) * 2000},${Math.sin(b) * 2000}`}
                fill="#FFFFFF"
              />
            );
          })}
        </svg>
      </AbsoluteFill>

      {/* pixel coin rain */}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 60 + random(`rain-x-${i}`) * 900;
        const y = ((frame * (5 + random(`rain-v-${i}`) * 6) + random(`rain-y-${i}`) * 1920) % 2100) - 120;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, opacity: 0.85 }}>
            <Coin px={5} frame={frame + i * 3} />
          </div>
        );
      })}

      {/* app-icon style mark */}
      <div
        style={{
          position: "absolute",
          left: 540 - 95,
          top: 470,
          transform: `scale(${pop(PB.logo - 4, 8, 180)}) rotate(${(1 - pop(PB.logo - 4, 8, 180)) * -40}deg)`,
        }}
      >
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: 48,
            background: APP.bg,
            boxShadow: "0 24px 40px -12px rgba(0,0,0,0.35), inset 0 0 0 4px rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={110} height={110} viewBox="0 0 24 24">
            <path
              d="M3 17 L8 12 L12 15 L20 6"
              fill="none"
              stroke={APP.lime}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 6 H20 V11"
              fill="none"
              stroke={APP.lime}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* wordmark, letter by letter */}
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 700,
          display: "flex",
          justifyContent: "center",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 168,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        {[...WORD].map((ch, i) => {
          const p = pop(PB.logo + i * 2, 7, 230);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: i < 4 ? APP.bg : "#FFFFFF",
                WebkitTextStroke: i < 4 ? undefined : `6px ${APP.bg}`,
                paintOrder: "stroke fill",
                transform: `translateY(${(1 - p) * -260}px) scale(${0.6 + 0.4 * p})`,
                opacity: frame >= PB.logo + i * 2 ? 1 : 0,
                textShadow: "0 10px 0 rgba(0,0,0,0.18)",
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 925,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 800,
          fontSize: 56,
          color: APP.bg,
          transform: `translateY(${(1 - tagline) * 40}px)`,
          opacity: tagline,
        }}
      >
        level up your side hustle.
      </div>

      <div
        style={{
          position: "absolute",
          left: 540 - PILL.w / 2,
          top: PILL.y,
          width: PILL.w,
          height: PILL.h,
          borderRadius: 999,
          background: APP.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${pill})`,
          boxShadow: "0 14px 0 rgba(0,0,0,0.22)",
        }}
      >
        <PixelText size={34} color={APP.lime} shadow="#000">
          COMING SOON
        </PixelText>
      </div>

      {frame >= heroLand - 12 ? (
        <div style={{ position: "absolute", left: 540 - 54, top: heroY }}>
          <Hero frame={frame} jumping={fallT < 1 || hop > 2} px={9} />
        </div>
      ) : null}
      {frame >= heroLand + 27 && frame < heroLand + 46 ? (
        <div
          style={{
            position: "absolute",
            left: 540 - 35,
            top: PILL.y - 16 * 9 - 220 - (frame - heroLand - 27) * 6,
            opacity: frame > heroLand + 40 ? 0 : 1,
          }}
        >
          <Coin px={7} frame={frame} />
        </div>
      ) : null}

      <Confetti t={frame - 2} x={540} y={1000} seed="finale-a" />
      <Confetti t={frame - PB.pill} x={540} y={PILL.y} count={80} power={0.8} seed="finale-b" />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};
