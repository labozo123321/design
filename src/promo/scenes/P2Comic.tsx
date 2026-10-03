import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppPhone, clipFrame } from "../components/AppScreen";
import { Bubble, Burst, CaptionBox, Halftone, SpeedLines } from "../components/Comic";
import { PixelWipe } from "../components/Pixel";
import { DEMO, PB } from "../timeline";
import { CLAMP, EASE, ramp } from "../../lib/anim";

const PHONE = { cx: 540, cy: 930, scale: 0.86, angle: -4 };
const CAPTIONS = ["MEET YOUR SIDE-HUSTLE COACH", "10 STAGES. ONE NEXT MOVE."];
const BUBBLES: { text: string; x: number; y: number; tail: "left" | "right"; angle: number }[] = [
  { text: "STREAKS!", x: 120, y: 470, tail: "left", angle: -6 },
  { text: "XP!", x: 760, y: 700, tail: "right", angle: 5 },
  { text: "BOSS MISSIONS!", x: 150, y: 1290, tail: "left", angle: -3 },
];

/** 150–390 · Comic book: the real Journey screen in a panel, captions, bubbles, STAGE CLEARED. */
export const P2Comic: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (at: number, cfg = { damping: 9, stiffness: 200 }) =>
    spring({ frame: frame - at, fps, config: cfg });

  const enter = pop(6, { damping: 14, stiffness: 120 });
  const punch = frame >= PB.zoom ? Math.exp(-(frame - PB.zoom) / 6) * Math.cos((frame - PB.zoom) / 2) : 0;
  const src = clipFrame(frame, 30, DEMO.journey.to, PB.comicVideo, 0.5); // starts past the test-data card
  const captionIdx = frame >= PB.captions[1] ? 1 : frame >= PB.captions[0] ? 0 : -1;
  const capPop = captionIdx === 1 ? pop(PB.captions[1]) : captionIdx === 0 ? pop(PB.captions[0]) : 0;
  const cleared = pop(PB.cleared, { damping: 8, stiffness: 170 });

  return (
    <AbsoluteFill>
      <Halftone bg="#FFCF33" dot="#FF9F1C" size={24} shift={frame * 0.6} />
      {frame >= PB.zoom ? (
        <SpeedLines x={540} y={900} opacity={ramp(frame, PB.zoom, PB.zoom + 4)} spin={frame * 0.004} />
      ) : null}

      {/* comic page border */}
      <AbsoluteFill style={{ border: "14px solid #141414", margin: 34, background: "transparent" }} />

      <div
        style={{
          position: "absolute",
          left: PHONE.cx - 300,
          top: PHONE.cy - 620,
          transform: `translateY(${(1 - enter) * 1400}px) rotate(${PHONE.angle + (1 - enter) * 20}deg) scale(${
            PHONE.scale * (1 + punch * 0.12)
          })`,
          filter: "drop-shadow(18px 18px 0 #141414)",
        }}
      >
        <AppPhone srcFrame={src} />
      </div>

      {captionIdx >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: 140,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${capPop}) rotate(-2deg)`,
          }}
        >
          <CaptionBox size={54}>{CAPTIONS[captionIdx]}</CaptionBox>
        </div>
      ) : null}

      {BUBBLES.map((b, i) => {
        const p = pop(PB.bubbles[i]);
        if (frame < PB.bubbles[i] || frame >= PB.zoom) return null;
        return (
          <div
            key={b.text}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              transform: `scale(${p}) rotate(${b.angle}deg)`,
              transformOrigin: b.tail === "left" ? "20% 100%" : "80% 100%",
            }}
          >
            <Bubble size={b.text.length > 6 ? 54 : 70} tail={b.tail}>
              {b.text}
            </Bubble>
          </div>
        );
      })}

      {frame >= PB.cleared ? (
        <div
          style={{
            position: "absolute",
            left: 540 - 330,
            top: 300,
            transform: `scale(${cleared}) rotate(${-8 + (1 - cleared) * 30}deg)`,
          }}
        >
          <Burst text="STAGE CLEARED!" size={660} fontSize={104} fill="#88CC2D" color="#FFFFFF" />
        </div>
      ) : null}

      {/* pixel dissolve in from the arcade */}
      <PixelWipe
        progress={1 - interpolate(frame, [0, 12], [0, 1], { ...CLAMP, easing: EASE.uiInOut })}
        seed="arcade-out"
      />
    </AbsoluteFill>
  );
};
