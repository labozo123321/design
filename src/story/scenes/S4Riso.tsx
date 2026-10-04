import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SFONTS } from "../fonts";
import { Grain, useSpring } from "../kit";
import { lineAt, seqDuration } from "../timeline";

const R = { paper: "#F4EFE4", pink: "#FF48B0", blue: "#0078BF", yellow: "#FFE800", ink: "#1D1D35" };

const Magnifier = ({ c }: { c: string }) => (
  <g fill="none" stroke={c} strokeWidth={16} strokeLinecap="round">
    <circle cx={78} cy={78} r={46} />
    <line x1={112} y1={112} x2={160} y2={160} strokeWidth={22} />
  </g>
);
const Bubble = ({ c }: { c: string }) => (
  <g>
    <path
      d="M20 40 Q20 18 42 18 L150 18 Q172 18 172 40 L172 108 Q172 130 150 130 L76 130 L40 166 L46 130 L42 130 Q20 130 20 108 Z"
      fill={c}
    />
    {[60, 96, 132].map((x) => (
      <circle key={x} cx={x} cy={74} r={10} fill={R.paper} />
    ))}
  </g>
);
const Receipt = ({ c }: { c: string }) => (
  <g>
    <path d="M40 14 L152 14 L152 170 L134 156 L114 170 L96 156 L78 170 L58 156 L40 170 Z" fill={c} />
    <path
      d="M66 92 L88 114 L128 66"
      stroke={R.paper}
      strokeWidth={16}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </g>
);
const Loop = ({ c, spin }: { c: string; spin: number }) => (
  <g transform={`rotate(${spin} 96 92)`} fill="none" stroke={c} strokeWidth={18} strokeLinecap="round">
    <path d="M40 92 A56 56 0 0 1 140 58" />
    <path d="M152 92 A56 56 0 0 1 52 126" />
    <path d="M118 44 L144 58 L132 84" strokeWidth={14} strokeLinejoin="round" />
    <path d="M74 140 L48 126 L60 100" strokeWidth={14} strokeLinejoin="round" />
  </g>
);

const CARDS = [
  { text: ["FIND YOUR", "FIRST CLIENT"], a: R.pink, b: R.blue, rot: -3, from: -1 },
  { text: ["MAKE", "THE ASK"], a: R.blue, b: R.pink, rot: 2.5, from: 1 },
  { text: ["GET", "PAID"], a: R.yellow, b: R.pink, rot: -2, from: -1 },
  { text: ["THEN DO IT", "AGAIN"], a: R.pink, b: R.blue, rot: 3, from: 1 },
];

/** Misregistered two-ink text: a colour plate and an ink plate a few pixels apart, multiplied. */
const TwoInk: React.FC<{ lines: string[]; size: number; ghost: string; off: number }> = ({
  lines,
  size,
  ghost,
  off,
}) => (
  <div
    style={{
      position: "relative",
      fontFamily: SFONTS.riso,
      fontSize: size,
      lineHeight: 1.02,
      whiteSpace: "nowrap",
    }}
  >
    <div style={{ position: "absolute", left: off, top: off * 0.6, color: ghost, mixBlendMode: "multiply" }}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
    <div style={{ position: "relative", color: R.ink, mixBlendMode: "multiply" }}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  </div>
);

/** 04 · Risograph print: four cards slap down, one per line. */
export const S4Riso: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring();
  const id = "riso" as const;
  const againAt = lineAt(id, 3);
  const loopSpin = Math.max(0, frame - againAt) * 9;
  const drift = (frame / seqDuration(id)) * 30;

  return (
    <AbsoluteFill style={{ background: R.paper, overflow: "hidden" }}>
      {/* halftone field */}
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern
            id="riso-dots"
            width={22}
            height={22}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(15) translate(0 ${drift})`}
          >
            <circle cx={11} cy={11} r={4} fill={R.blue} />
          </pattern>
          <linearGradient id="riso-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
            <stop offset="1" stopColor="#fff" stopOpacity={0.45} />
          </linearGradient>
          <mask id="riso-mask">
            <rect width={1080} height={1920} fill="url(#riso-fade)" />
          </mask>
        </defs>
        <rect width={1080} height={1920} fill="url(#riso-dots)" mask="url(#riso-mask)" opacity={0.5} />
      </svg>

      {CARDS.map((c, i) => {
        const at = lineAt(id, i) - 3;
        if (frame < at) return null;
        const s = sp(at, { damping: 13, stiffness: 320, mass: 0.7 });
        const bounce = frame >= againAt ? sp(againAt + 4 + i * 3, { damping: 8, stiffness: 300 }) : 1;
        const lift = frame >= againAt + 4 + i * 3 ? (1 - bounce) * 30 : 0;
        const top = 210 + i * 292;
        const off = 7 + Math.sin(frame * 0.5 + i) * 1.5;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 100,
              top: top - lift,
              width: 840,
              height: 262,
              transform: `translateX(${(1 - s) * c.from * 1100}px) rotate(${c.rot + (1 - s) * c.from * 14}deg) scale(${1 + (1 - s) * 0.25})`,
            }}
          >
            {/* misregistered card plates */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: c.a,
                mixBlendMode: "multiply",
                opacity: 0.9,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translate(${off}px, ${off * 0.5}px)`,
                border: `5px solid ${R.ink}`,
                mixBlendMode: "multiply",
              }}
            />
            <svg
              width={840}
              height={262}
              style={{ position: "absolute", inset: 0, mixBlendMode: "multiply" }}
            >
              <defs>
                <pattern
                  id={`ht-${i}`}
                  width={14}
                  height={14}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <circle cx={7} cy={7} r={3.2} fill={c.b} />
                </pattern>
                <linearGradient id={`hf-${i}`} x1="1" y1="0" x2="0.3" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity={0.9} />
                  <stop offset="1" stopColor="#fff" stopOpacity={0} />
                </linearGradient>
                <mask id={`hm-${i}`}>
                  <rect width={840} height={262} fill={`url(#hf-${i})`} />
                </mask>
              </defs>
              <rect width={840} height={262} fill={`url(#ht-${i})`} mask={`url(#hm-${i})`} />
            </svg>
            <div style={{ position: "absolute", left: 40, top: 40 }}>
              <TwoInk lines={c.text} size={i === 0 || i === 3 ? 54 : 76} ghost={c.b} off={off} />
            </div>
            <svg
              width={190}
              height={190}
              viewBox="0 0 190 190"
              style={{ position: "absolute", right: 34, top: 36, mixBlendMode: "multiply" }}
            >
              <g transform={`translate(${off} ${off * 0.4})`} opacity={0.75}>
                {i === 0 ? <Magnifier c={c.b} /> : null}
                {i === 1 ? <Bubble c={c.b} /> : null}
                {i === 2 ? <Receipt c={R.pink} /> : null}
                {i === 3 ? <Loop c={c.b} spin={loopSpin} /> : null}
              </g>
              {i === 0 ? <Magnifier c={R.ink} /> : null}
              {i === 1 ? <Bubble c={R.ink} /> : null}
              {i === 2 ? <Receipt c={R.ink} /> : null}
              {i === 3 ? <Loop c={R.ink} spin={loopSpin} /> : null}
            </svg>
          </div>
        );
      })}
      <Grain id="riso" opacity={0.4} />
    </AbsoluteFill>
  );
};
