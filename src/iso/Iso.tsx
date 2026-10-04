import React from "react";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Html5Audio as Audio,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONTS } from "../fonts";
import { APP_NAME } from "../theme";
import CUES from "./cues.json";
import { ISO } from "./look";
import { IsoWorld } from "./IsoWorld";

export const ISO_DURATION = CUES.duration;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Lowercase line, white with one gold word, rising softly out of a blur. */
const Line: React.FC<{
  words: { t: string; gold?: boolean }[];
  range: number[];
  top: number;
  size: number;
  weight?: number;
  delay?: number;
}> = ({ words, range, top, size, weight = 600, delay = 0 }) => {
  const frame = useCurrentFrame();
  const [a, b] = range;
  const out = b >= CUES.duration ? 0 : interpolate(frame, [b - 10, b], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top,
        textAlign: "center",
        fontFamily: FONTS.sans,
        fontWeight: weight,
        fontSize: size,
        letterSpacing: "-0.02em",
        color: "#F2F0EA",
        opacity: 1 - out,
      }}
    >
      {words.map((w, i) => {
        const at = a + delay + i * 5;
        const t = interpolate(frame, [at, at + 16], [0, 1], {
          ...CLAMP,
          easing: Easing.bezier(0.2, 0, 0, 1),
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              opacity: t,
              transform: `translateY(${(1 - t) * 18}px)`,
              filter: `blur(${(1 - t) * 8}px)`,
              color: w.gold ? ISO.gold : undefined,
              textShadow: w.gold ? `0 0 ${24 + 20 * t}px rgba(212,168,75,0.35)` : undefined,
            }}
          >
            {w.t}
          </span>
        );
      })}
    </div>
  );
};

/** Tilt-shift: soft blur bands at the top and bottom, sharp through the middle. */
const TiltShift: React.FC = () => (
  <>
    {[
      { top: 0, grad: "linear-gradient(to bottom, black 0%, black 18%, transparent 36%)" },
      { top: 0, grad: "linear-gradient(to top, black 0%, black 16%, transparent 34%)" },
    ].map((b, i) => (
      <AbsoluteFill
        key={i}
        style={{
          backdropFilter: "blur(7px)",
          WebkitMaskImage: b.grad,
          maskImage: b.grad,
        }}
      />
    ))}
  </>
);

export const Iso: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const fadeIn = interpolate(frame, [0, 10], [0, 1], CLAMP);
  const [t0] = CUES.text.title;
  const logo = interpolate(frame, [t0, t0 + 22], [0, 1], { ...CLAMP, easing: Easing.bezier(0.2, 0, 0, 1) });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 85% 60% at 50% 55%, #121A30 0%, ${ISO.void} 45%, ${ISO.voidDeep} 100%)`,
      }}
    >
      <Audio src={staticFile("iso/soundtrack.mp3")} />
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <ThreeCanvas
          orthographic
          width={width}
          height={height}
          shadows
          camera={{ position: [20, 20, 20], zoom: 100, near: 0.1, far: 200 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <IsoWorld />
        </ThreeCanvas>
      </AbsoluteFill>
      <TiltShift />
      {/* vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 75% 65% at 50% 52%, transparent 55%, rgba(3,4,8,0.65) 100%)",
        }}
      />

      <Line
        words={[{ t: "after" }, { t: "work.", gold: true }]}
        range={CUES.text.afterWork}
        top={330}
        size={96}
      />
      <Line
        words={[{ t: "one" }, { t: "step", gold: true }, { t: "at" }, { t: "a" }, { t: "time." }]}
        range={CUES.text.oneStep}
        top={300}
        size={84}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 400,
          textAlign: "center",
          opacity: logo,
          transform: `translateY(${(1 - logo) * 24}px)`,
          filter: `blur(${(1 - logo) * 10}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.sans,
            fontWeight: 700,
            fontSize: 150,
            letterSpacing: "-0.04em",
            color: "#F4F1EA",
            lineHeight: 1,
          }}
        >
          {APP_NAME.slice(0, 4)}
          <span style={{ color: ISO.gold, textShadow: "0 0 40px rgba(212,168,75,0.35)" }}>
            {APP_NAME.slice(4)}
          </span>
        </div>
        <div
          style={{
            margin: "36px auto 0",
            width: 120 * logo,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${ISO.gold}, transparent)`,
          }}
        />
      </div>
      <Line
        words={[
          { t: "your" },
          { t: "side" },
          { t: "income," },
          { t: "mapped", gold: true },
          { t: "out.", gold: true },
        ]}
        range={CUES.text.title}
        top={610}
        size={50}
        weight={500}
        delay={14}
      />
    </AbsoluteFill>
  );
};
