import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, CircleWipe } from "../kit";
import { EB } from "../timeline";
import { UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { EASE, ramp } from "../../lib/anim";

const LINES: { words: string[]; color: string }[] = [
  { words: ["Your", "side hustle,"], color: "#FFFFFF" },
  { words: ["one", "step"], color: UI.lime },
  { words: ["at a time."], color: "#FFFFFF" },
];

const SHAPES = [
  { x: 190, y: 520, s: 90, c: UI.lime, kind: "circle", at: 10 },
  { x: 860, y: 600, s: 80, c: UI.blue, kind: "square", at: 18 },
  { x: 230, y: 1280, s: 70, c: UI.gold, kind: "tri", at: 34 },
  { x: 830, y: 1210, s: 100, c: "#FF5C8A", kind: "pill", at: 42 },
];

/** 0–120 · Kinetic hook, then a lime circle wipe into step 01. */
export const X1Hook: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let w = 0;
  const underline = ramp(frame, 52, 64, EASE.uiInOut);

  return (
    <AbsoluteFill>
      <Backdrop />
      {SHAPES.map((sh, i) => {
        const p = spring({ frame: frame - sh.at, fps, config: { damping: 10, stiffness: 160 } });
        const fl = Math.sin(frame / 14 + i) * 14;
        const common: React.CSSProperties = {
          position: "absolute",
          left: sh.x - sh.s / 2,
          top: sh.y - sh.s / 2 + fl,
          width: sh.s,
          height: sh.kind === "pill" ? sh.s * 0.45 : sh.s,
          transform: `scale(${p}) rotate(${frame * (i % 2 ? 1.2 : -0.9)}deg)`,
          background: sh.kind === "tri" ? undefined : sh.c,
          borderRadius: sh.kind === "circle" || sh.kind === "pill" ? 999 : 20,
          opacity: 0.9,
        };
        return sh.kind === "tri" ? (
          <div
            key={i}
            style={{ ...common, background: sh.c, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
          />
        ) : (
          <div key={i} style={common} />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 690,
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 84,
          lineHeight: 1.12,
          letterSpacing: "-0.03em",
          textAlign: "center",
        }}
      >
        {LINES.map((line, li) => (
          <div key={li} style={{ color: line.color, position: "relative" }}>
            {line.words.map((word) => {
              const at = EB.hookWords[w++];
              const p = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 210 } });
              return (
                <span
                  key={word}
                  style={{
                    display: "inline-block",
                    margin: "0 0.12em",
                    opacity: frame >= at ? 1 : 0,
                    transform: `translateY(${(1 - p) * 80}px) scale(${0.7 + 0.3 * p})`,
                  }}
                >
                  {word}
                </span>
              );
            })}
            {li === 1 ? (
              <svg
                width={520}
                height={40}
                style={{ position: "absolute", left: "50%", marginLeft: -260, bottom: -26 }}
              >
                <path
                  d="M 10 26 Q 260 4 510 22"
                  fill="none"
                  stroke={UI.lime}
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={520}
                  strokeDashoffset={520 * (1 - underline)}
                />
              </svg>
            ) : null}
          </div>
        ))}
      </div>

      <CircleWipe progress={ramp(frame, EB.hookWipe, EB.hookWipe + 14, EASE.whip)} x={540} y={900} />
    </AbsoluteFill>
  );
};
