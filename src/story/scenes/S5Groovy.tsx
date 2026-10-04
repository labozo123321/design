import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP } from "../../lib/anim";
import { SFONTS } from "../fonts";
import { Grain, useSpring } from "../kit";
import { lineAt, wordAt } from "../timeline";

const G = {
  cream: "#F6E7C8",
  sand: "#EFD8AE",
  brown: "#4A2C1D",
  orange: "#E8772E",
  mustard: "#F2B33D",
  olive: "#7A8B3A",
  rust: "#B9472A",
};
const STRIPES = [G.rust, G.orange, G.mustard, G.olive];

/** Chunky 70s type: a stack of offset colour shadows. */
const groovyShadow = (d: number) =>
  STRIPES.map((c, i) => `${(i + 1) * d}px ${(i + 1) * d}px 0 ${c}`).join(", ");

const KEYWORDS = ["every win.", "streak.", "stack up."];

/** 05 · 70s groovy: "Log every win. Keep your streak. Watch your progress stack up." */
export const S5Groovy: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring();
  const id = "groovy" as const;
  const L = [0, 1, 2].map((k) => lineAt(id, k));
  const current = frame >= L[2] - 2 ? 2 : frame >= L[1] - 2 ? 1 : 0;

  return (
    <AbsoluteFill style={{ background: G.cream, overflow: "hidden" }}>
      {/* sunburst rising from the bottom */}
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${frame * 0.4}deg at 50% 108%, ${G.sand} 0deg 7.5deg, ${G.cream} 7.5deg 15deg)`,
        }}
      />
      {/* rainbow arcs, top right */}
      <svg
        width={520}
        height={520}
        style={{ position: "absolute", right: -230, top: -250, transform: "scale(0.85)" }}
      >
        {[G.brown, G.rust, G.orange, G.mustard].map((c, i) => {
          const s = sp(4 + i * 3, { damping: 14, stiffness: 140 });
          return (
            <circle
              key={c}
              cx={260}
              cy={260}
              r={240 - i * 48}
              fill="none"
              stroke={c}
              strokeWidth={40}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - s}
              transform="rotate(90 260 260)"
            />
          );
        })}
      </svg>

      {/* keyword headline, swaps per line with a bouncy wave */}
      <div style={{ position: "absolute", left: 90, right: 140, top: 290, height: 260 }}>
        {KEYWORDS.map((k, i) => {
          if (i !== current) return null;
          return (
            <div
              key={k}
              style={{
                fontFamily: SFONTS.groovy,
                fontSize: i === 0 ? 132 : 150,
                color: G.cream,
                textShadow: groovyShadow(5),
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {k.split("").map((ch, j) => {
                const s = sp(L[i] - 4 + j * 1.2, { damping: 8, stiffness: 260 });
                const wave = Math.sin(frame * 0.18 - j * 0.6) * 6;
                return (
                  <span
                    key={j}
                    style={{
                      display: "inline-block",
                      transform: `translateY(${(1 - s) * 120 + wave}px) rotate(${(1 - s) * -30}deg)`,
                      opacity: Math.min(1, s * 2),
                      whiteSpace: "pre",
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* line 0: win pills stack up */}
      {[0, 1, 2].map((i) => {
        const at = wordAt(id, 0, 1) + i * 5;
        if (frame < at) return null;
        const s = sp(at, { damping: 10, stiffness: 220 });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 110 + [0, 18, -10][i],
              top: 880 - i * 120 - (1 - s) * 600,
              width: 380,
              height: 104,
              borderRadius: 52,
              background: [G.orange, G.mustard, G.olive][i],
              border: `6px solid ${G.brown}`,
              boxShadow: `8px 8px 0 ${G.brown}`,
              display: "flex",
              alignItems: "center",
              gap: 18,
              paddingLeft: 26,
              boxSizing: "border-box",
              transform: `rotate(${[-3, 2, -1][i]}deg)`,
              fontFamily: SFONTS.groovy,
              fontSize: 54,
              color: G.cream,
              textShadow: `3px 3px 0 ${G.brown}`,
            }}
          >
            <svg width={58} height={58} viewBox="0 0 58 58">
              <circle cx={29} cy={29} r={27} fill={G.cream} stroke={G.brown} strokeWidth={4} />
              <path
                d="M16 30 L26 40 L43 19"
                stroke={G.brown}
                strokeWidth={7}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            win
          </div>
        );
      })}

      {/* line 1: streak badge, a ring of seven days */}
      {frame >= L[1] - 4
        ? (() => {
            const s = sp(L[1] - 4, { damping: 9, stiffness: 180 });
            const flicker = 1 + Math.sin(frame * 0.7) * 0.04;
            return (
              <svg
                width={360}
                height={360}
                viewBox="0 0 360 360"
                style={{
                  position: "absolute",
                  left: 590,
                  top: 640,
                  transform: `scale(${s}) rotate(${(1 - s) * 90}deg)`,
                }}
              >
                <circle cx={180} cy={180} r={150} fill={G.brown} />
                <circle cx={180} cy={180} r={128} fill={G.mustard} />
                {Array.from({ length: 7 }).map((_, d) => {
                  const a = (d / 7) * Math.PI * 2 - Math.PI / 2;
                  const on = frame >= wordAt(id, 1, 1) + d * 2;
                  return (
                    <circle
                      key={d}
                      cx={180 + Math.cos(a) * 139}
                      cy={180 + Math.sin(a) * 139}
                      r={on ? 14 : 9}
                      fill={on ? G.cream : G.rust}
                      stroke={G.brown}
                      strokeWidth={4}
                    />
                  );
                })}
                <g transform={`translate(180 196) scale(${flicker}) translate(-180 -196)`}>
                  <path
                    d="M180 90 C200 140 250 160 250 210 A70 70 0 0 1 110 210 C110 180 125 165 140 150 C142 175 152 185 165 188 C160 150 165 120 180 90 Z"
                    fill={G.rust}
                    stroke={G.brown}
                    strokeWidth={8}
                    strokeLinejoin="round"
                  />
                  <path
                    d="M180 160 C192 185 214 196 214 220 A34 34 0 0 1 146 220 C146 200 166 190 180 160 Z"
                    fill={G.cream}
                  />
                </g>
              </svg>
            );
          })()
        : null}

      {/* line 2: bars stack up */}
      {[110, 160, 205, 245, 290, 330].map((h, i) => {
        const at = wordAt(id, 2, 2) - 4 + i * 3;
        const grow = frame >= at ? sp(at, { damping: 10, stiffness: 150 }) : 0;
        const settle = interpolate(frame, [at, at + 40], [0.9, 1], CLAMP);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 110 + i * 136,
              top: 1370 - h * grow * settle,
              width: 112,
              height: h * grow * settle,
              borderRadius: "56px 56px 0 0",
              background: [G.rust, G.orange, G.mustard, G.olive, G.orange, G.mustard][i],
              border: grow > 0.01 ? `6px solid ${G.brown}` : "none",
              borderBottom: "none",
              boxSizing: "border-box",
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 90,
          width: 840,
          top: 1370,
          height: 10,
          background: G.brown,
          borderRadius: 5,
        }}
      />
      <Grain id="gr" opacity={0.35} />
    </AbsoluteFill>
  );
};
