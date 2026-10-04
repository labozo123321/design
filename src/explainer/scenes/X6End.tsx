import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EB } from "../timeline";
import { UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { BADGE } from "./X5Money";

const WORD = "FourFig";
const ORBIT = [
  { c: UI.blue, kind: "square", r: 380, s: 70, speed: 0.012, phase: 0.3 },
  { c: UI.gold, kind: "tri", r: 430, s: 80, speed: -0.01, phase: 2.1 },
  { c: "#FF5C8A", kind: "pill", r: 400, s: 110, speed: 0.009, phase: 4.0 },
  { c: "#FFFFFF", kind: "circle", r: 350, s: 50, speed: -0.014, phase: 5.2 },
];

/** 780–900 · End card on lime: wordmark, tagline, coming soon, orbiting shapes. */
export const X6End: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (at: number, d = 10, k = 200) =>
    spring({ frame: frame - at, fps, config: { damping: d, stiffness: k } });
  const tag = pop(EB.endWord + 22, 14, 160);
  const pill = pop(EB.endPill, 9, 220);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${BADGE.x}px ${BADGE.y}px, #A6E24A, ${UI.lime} 50%, #6FB51F)`,
      }}
    >
      {ORBIT.map((o, i) => {
        const a = o.phase + frame * o.speed * 3;
        const p = pop(4 + i * 4, 9, 160);
        const x = 540 + Math.cos(a) * o.r;
        const y = 900 + Math.sin(a) * o.r * 1.25;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - o.s / 2,
              top: y - o.s / 2,
              width: o.s,
              height: o.kind === "pill" ? o.s * 0.45 : o.s,
              background: o.c,
              borderRadius: o.kind === "circle" || o.kind === "pill" ? 999 : 18,
              clipPath: o.kind === "tri" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined,
              transform: `scale(${p}) rotate(${frame * 2 + i * 40}deg)`,
              opacity: 0.95,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 760,
          display: "flex",
          justifyContent: "center",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 172,
          letterSpacing: "-0.035em",
          lineHeight: 1,
        }}
      >
        {[...WORD].map((ch, i) => {
          const p = pop(EB.endWord + i * 2, 8, 230);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: i < 4 ? UI.bg : "#FFFFFF",
                WebkitTextStroke: i < 4 ? undefined : `7px ${UI.bg}`,
                paintOrder: "stroke fill",
                opacity: frame >= EB.endWord + i * 2 ? 1 : 0,
                transform: `translateY(${(1 - p) * 120}px) rotate(${(1 - p) * 12}deg)`,
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
          top: 970,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 800,
          fontSize: 56,
          color: UI.bg,
          opacity: tag,
          transform: `translateY(${(1 - tag) * 30}px)`,
        }}
      >
        Your side hustle, mapped.
      </div>
      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 1110,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${pill})`,
        }}
      >
        <div
          style={{
            background: UI.bg,
            color: UI.lime,
            fontFamily: PFONTS.app,
            fontWeight: 900,
            fontSize: 40,
            padding: "22px 54px",
            borderRadius: 999,
            boxShadow: "0 14px 0 rgba(0,0,0,0.2)",
          }}
        >
          Coming soon
        </div>
      </div>
    </AbsoluteFill>
  );
};
