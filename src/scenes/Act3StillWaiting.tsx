import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LightLeak } from "../components/LightLeak";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, ramp, SPRING } from "../lib/anim";
import { SceneProps } from "./types";

const LINE_1 = [
  { word: "Still", at: 5 },
  { word: "waiting", at: 9 },
];
const LINE_2 = [
  { word: "for", at: 15 },
  { word: "a", at: 18 },
  { word: "way", at: 21 },
  { word: "out?", at: 24 },
];
const FLARE_START = 33;

const type: React.CSSProperties = {
  fontFamily: FONTS.sans,
  fontWeight: 600,
  fontSize: 118,
  letterSpacing: "-0.04em",
  lineHeight: 1.02,
  color: "#F7F3EC",
};

/**
 * 540–585 · From pure black a warm light leak blooms. Kinetic type builds word
 * by word on springs; line two drops in from above with overshoot. The leak
 * then burns out to white, which becomes the next scene's surface.
 */
export const Act3StillWaiting: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leak = ramp(frame, 0, 22, Easing.out(Easing.quad));
  const flare = ramp(frame, FLARE_START, duration - 1, Easing.in(Easing.quad));
  const textScale = interpolate(frame, [FLARE_START, duration], [1, 1.05], CLAMP);

  const rise = (at: number) => spring({ frame: frame - at, fps, config: SPRING.snappy });
  const drop = (at: number) => spring({ frame: frame - at, fps, config: SPRING.drop });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <LightLeak intensity={leak * 0.9} flare={flare} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 1920 - 2 * 830,
          transform: `scale(${textScale})`,
          opacity: 1 - flare * 0.9,
        }}
      >
        <div style={{ display: "flex", gap: "0.24em", ...type }}>
          {LINE_1.map(({ word, at }) => {
            const p = rise(at);
            return (
              <span
                key={word}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, p * 1.6),
                  transform: `translateY(${(1 - p) * 70}px)`,
                  filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        {/* line two is clipped to its own box so words drop in without crossing line one */}
        <div
          style={{
            display: "flex",
            gap: "0.24em",
            overflow: "hidden",
            padding: "8px 24px 44px",
            margin: "-8px -24px -44px",
            ...type,
          }}
        >
          {LINE_2.map(({ word, at }) => {
            const p = drop(at);
            return (
              <span
                key={word}
                style={{
                  display: "inline-block",
                  opacity: frame >= at ? Math.min(1, (frame - at + 1) / 3) : 0,
                  transform: `translateY(${(1 - p) * -150}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{ background: COLORS.offWhite, opacity: ramp(frame, duration - 3, duration - 1) * 0.6 }}
      />
    </AbsoluteFill>
  );
};
