import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Cursor, cursorAt } from "../components/Cursor";
import { GlassCard } from "../components/GlassCard";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { TypedText } from "../components/Type";
import { BEATS } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp, SPRING } from "../lib/anim";
import { SceneProps } from "./types";

const QUERY = "how to make money on the side";
const TYPE_START = BEATS.searchType;
const TYPE_RATE = 1.6; // characters per frame
const RESULTS_AT = 31;
const STRIKES = BEATS.searchStrikes;
const JUNK = ["get rich quick", "crypto course", "drop shipping guru"];

export const SEARCH_BAR = { x: 140, y: 600, w: 800, h: 132 } as const;
/** The clear (×) button inside the bar: the iris in the next scene opens from here. */
export const CLEAR_BUTTON = {
  x: SEARCH_BAR.x + SEARCH_BAR.w - 56,
  y: SEARCH_BAR.y + SEARCH_BAR.h / 2,
} as const;

const Magnifier: React.FC = () => (
  <svg
    width={48}
    height={48}
    viewBox="0 0 24 24"
    fill="none"
    stroke={COLORS.ink}
    strokeWidth={2.4}
    strokeLinecap="round"
  >
    <circle cx={10.5} cy={10.5} r={6.5} />
    <path d="M15.5 15.5 L21 21" />
  </svg>
);

const AdTag: React.FC = () => (
  <span
    style={{
      fontFamily: FONTS.sans,
      fontWeight: 600,
      fontSize: 22,
      letterSpacing: "0.04em",
      color: COLORS.inkSoft,
      border: `1.5px solid rgba(14,26,46,0.25)`,
      borderRadius: 8,
      padding: "4px 10px",
    }}
  >
    Ad
  </span>
);

/**
 * 585–630 · A glassy search bar slides up. The cursor clicks in and types
 * "how to make money on the side". Junk results flicker in and get struck
 * through in red, one after another.
 */
export const Act3Search: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const whiteout = interpolate(frame, [0, 7], [1, 0], { ...CLAMP, easing: EASE.ui });
  const barIn = spring({ frame: frame - 1, fps, config: SPRING.snappy });
  const focused = frame >= BEATS.searchClick;
  const typed = interpolate(
    frame,
    [TYPE_START, TYPE_START + QUERY.length / TYPE_RATE],
    [0, QUERY.length],
    CLAMP,
  );
  const typing = frame >= TYPE_START && typed < QUERY.length;

  // Results flicker in like a bad signal (a nod to the horror), then settle.
  const flicker = [0.5, 0, 1, 0.3, 1][frame - RESULTS_AT] ?? (frame > RESULTS_AT ? 1 : 0);
  const resultsIn = spring({ frame: frame - RESULTS_AT, fps, config: SPRING.snappy });

  const cursor = cursorAt(frame, fps, [
    { f: 3, x: 980, y: 1500 },
    { f: 10, x: 470, y: SEARCH_BAR.y + 70 },
    { f: 16, x: 470, y: SEARCH_BAR.y + 70 },
    { f: 24, x: 640, y: 1110 },
    { f: 33, x: 640, y: 1110 },
    { f: 41, x: CLEAR_BUTTON.x + 4, y: CLEAR_BUTTON.y + 6 },
  ]);

  return (
    <AbsoluteFill>
      <SoftBackdrop tone="light" />

      {/* search bar */}
      <div
        style={{
          position: "absolute",
          left: SEARCH_BAR.x,
          top: SEARCH_BAR.y,
          width: SEARCH_BAR.w,
          height: SEARCH_BAR.h,
          transform: `translateY(${(1 - barIn) * 360}px) scale(${0.94 + 0.06 * barIn})`,
          opacity: Math.min(1, barIn * 1.4),
        }}
      >
        <GlassCard
          radius={SEARCH_BAR.h / 2}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 30px",
            boxSizing: "border-box",
            gap: 20,
            outline: focused ? "3px solid rgba(14,26,46,0.85)" : "3px solid rgba(14,26,46,0)",
            outlineOffset: 4,
          }}
        >
          <Magnifier />
          <div
            style={{
              flex: 1,
              fontFamily: FONTS.sans,
              fontWeight: 500,
              fontSize: 42,
              letterSpacing: "-0.025em",
              color: COLORS.ink,
              whiteSpace: "nowrap",
              position: "relative",
            }}
          >
            {typed < 1 ? (
              <span style={{ color: "rgba(14,26,46,0.38)", position: "absolute", left: 0 }}>Search</span>
            ) : null}
            <TypedText
              text={QUERY}
              visible={typed}
              frame={frame}
              typing={typing}
              caret={focused}
              caretColor={COLORS.ink}
            />
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: "rgba(14,26,46,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: typed > 2 ? 1 : 0,
            }}
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 22 22"
              stroke={COLORS.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
            >
              <path d="M5 5 L17 17 M17 5 L5 17" />
            </svg>
          </div>
        </GlassCard>
      </div>

      {/* junk results */}
      <div
        style={{
          position: "absolute",
          left: SEARCH_BAR.x,
          top: SEARCH_BAR.y + SEARCH_BAR.h + 30,
          width: SEARCH_BAR.w,
          opacity: flicker,
          transform: `translateY(${(1 - resultsIn) * -30}px)`,
        }}
      >
        <GlassCard radius={36} style={{ padding: "18px 0" }}>
          {JUNK.map((label, i) => {
            const strike = ramp(frame, STRIKES[i], STRIKES[i] + 4, EASE.ui);
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  padding: "30px 36px",
                  borderTop: i === 0 ? undefined : "1.5px solid rgba(14,26,46,0.08)",
                  opacity: 1 - strike * 0.45,
                }}
              >
                <svg
                  width={38}
                  height={38}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(14,26,46,0.45)"
                  strokeWidth={2.2}
                >
                  <circle cx={10.5} cy={10.5} r={6.5} />
                  <path d="M15.5 15.5 L21 21" strokeLinecap="round" />
                </svg>
                <span
                  style={{
                    position: "relative",
                    fontFamily: FONTS.sans,
                    fontWeight: 500,
                    fontSize: 46,
                    letterSpacing: "-0.03em",
                    color: COLORS.ink,
                  }}
                >
                  {label}
                  <span
                    style={{
                      position: "absolute",
                      left: -6,
                      top: "54%",
                      height: 5,
                      borderRadius: 3,
                      width: `calc(${strike * 100}% + ${strike * 12}px)`,
                      background: COLORS.blood,
                    }}
                  />
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <AdTag />
                </span>
              </div>
            );
          })}
        </GlassCard>
      </div>

      <Cursor x={cursor.x} y={cursor.y} frame={frame} clicks={[BEATS.searchClick, BEATS.searchClear]} />
      <AbsoluteFill style={{ background: "#FFFDF8", opacity: whiteout }} />
    </AbsoluteFill>
  );
};
