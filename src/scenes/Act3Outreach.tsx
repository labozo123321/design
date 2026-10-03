import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Cursor, cursorAt } from "../components/Cursor";
import { GlassCard } from "../components/GlassCard";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { TypedText } from "../components/Type";
import { BEATS } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, SPRING } from "../lib/anim";
import { CTA_TARGET_Y, CTA_ZOOM, OutreachButton } from "./Act3Journey";
import { SceneProps } from "./types";

const MESSAGE = "Hi Dana, loved your bakery’s new photos.\nWant a site to match? I can sketch one.";
const CARD_AT = 12;
const STREAM_START = 15;
const STREAM_END = 33;

/**
 * 735–780 · The cursor taps "Write my outreach". A draft streams into a chat
 * bubble, two short friendly lines. A small "Sent" tag pops in.
 */
export const Act3Outreach: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tap = BEATS.outreachTap;

  const pressed = interpolate(frame, [tap - 1, tap, tap + 4], [0, 1, 0], CLAMP);
  const glow = interpolate(frame, [tap, tap + 3, tap + 16], [0, 1, 0.25], CLAMP);
  const lift = spring({ frame: frame - (tap + 2), fps, config: SPRING.snappy });
  const buttonY = interpolate(lift, [0, 1], [CTA_TARGET_Y, 400]);
  const buttonScale = interpolate(lift, [0, 1], [CTA_ZOOM, 1.42]);
  const card = spring({ frame: frame - CARD_AT, fps, config: SPRING.snappy });
  const streamed = interpolate(frame, [STREAM_START, STREAM_END], [0, MESSAGE.length], CLAMP);
  const streaming = frame >= STREAM_START && streamed < MESSAGE.length;
  const sent = spring({ frame: frame - BEATS.outreachSent, fps, config: SPRING.pop });
  const sentNudge = interpolate(frame, [BEATS.outreachSent - 2, BEATS.outreachSent + 4], [0, 1], {
    ...CLAMP,
    easing: EASE.ui,
  });

  const cursor = cursorAt(frame, fps, [
    { f: 0, x: 900, y: 1320 },
    { f: 7, x: 640, y: CTA_TARGET_Y + 30 },
    { f: 13, x: 640, y: 450 },
    { f: 22, x: 800, y: 1300 },
  ]);

  return (
    <AbsoluteFill>
      <SoftBackdrop tone="dark" />

      <div
        style={{
          position: "absolute",
          left: 540,
          top: buttonY,
          transform: `translate(-50%, -50%) scale(${buttonScale})`,
        }}
      >
        <OutreachButton
          pressed={pressed}
          glow={glow}
          label={frame >= tap + 2 && streaming ? "Writing" : "Write my outreach"}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 140,
          width: 800,
          top: 560,
          opacity: Math.min(1, card * 1.4),
          transform: `translateY(${(1 - card) * 240}px) scale(${0.96 + 0.04 * card})`,
        }}
      >
        <GlassCard tone="dark" radius={40} style={{ padding: "34px 36px 36px" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: FONTS.sans }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                background: `linear-gradient(135deg, ${COLORS.goldLight}, ${COLORS.goldDeep})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 30,
                color: COLORS.navy,
              }}
            >
              D
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 32, color: "#F4F1EA", letterSpacing: "-0.02em" }}>
                Dana
              </div>
              <div style={{ fontWeight: 500, fontSize: 23, color: "rgba(244,241,234,0.5)", marginTop: 2 }}>
                Bakery owner
              </div>
            </div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 21,
                color: COLORS.gold,
                border: `1.5px solid rgba(200,161,90,0.6)`,
                borderRadius: 999,
                padding: "8px 16px",
                letterSpacing: "0.02em",
              }}
            >
              AI draft
            </div>
          </div>
          <div style={{ height: 1.5, background: "rgba(244,241,234,0.08)", margin: "28px 0" }} />
          {/* bubble */}
          <div
            style={{
              background: "linear-gradient(180deg, rgba(31,138,91,0.32), rgba(31,138,91,0.2))",
              border: "1.5px solid rgba(31,138,91,0.55)",
              borderRadius: "30px 30px 10px 30px",
              padding: "26px 30px",
              fontFamily: FONTS.sans,
              fontWeight: 400,
              fontSize: 34,
              lineHeight: 1.36,
              letterSpacing: "-0.01em",
              color: "#F4F1EA",
              transform: `translateY(${-sentNudge * 8}px)`,
            }}
          >
            <TypedText
              text={MESSAGE}
              visible={streamed}
              frame={frame}
              typing={streaming}
              caret={frame < BEATS.outreachSent}
              caretColor={COLORS.emerald}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18, height: 52 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: COLORS.emerald,
                borderRadius: 999,
                padding: "0 22px",
                height: 52,
                fontFamily: FONTS.sans,
                fontWeight: 600,
                fontSize: 25,
                color: "#F6F3EC",
                transform: `scale(${sent})`,
                transformOrigin: "100% 50%",
                opacity: frame >= BEATS.outreachSent ? 1 : 0,
                boxShadow: "0 10px 24px -10px rgba(31,138,91,0.9)",
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F6F3EC"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5 L9.6 17 L19 7.5" />
              </svg>
              Sent
            </div>
          </div>
        </GlassCard>
      </div>

      <Cursor x={cursor.x} y={cursor.y} frame={frame} clicks={[tap]} rippleColor="rgba(244,241,234,0.7)" />
    </AbsoluteFill>
  );
};
