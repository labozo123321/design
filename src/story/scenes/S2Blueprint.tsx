import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, EASE } from "../../lib/anim";
import { SFONTS } from "../fonts";
import { Grain, useSpring } from "../kit";
import { OVER, lineAt, seqDuration, wordAt } from "../timeline";

const B = {
  bg: "#0E3A70",
  deep: "#0A2C57",
  line: "#E8F1FF",
  faint: "rgba(232,241,255,0.16)",
  stamp: "#FF6B5B",
};

/** Paths of the storefront schematic, drawn in order. [d, start offset, length in frames] */
const PARTS: [string, number, number][] = [
  ["M40 620 L860 620", 0, 14],
  ["M170 620 L170 330 L730 330 L730 620", 4, 20],
  ["M140 330 L450 150 L760 330", 12, 16],
  ["M380 620 L380 450 L520 450 L520 620", 20, 12],
  ["M220 400 L330 400 L330 520 L220 520 Z", 24, 12],
  ["M570 400 L680 400 L680 520 L570 520 Z", 27, 12],
  [
    "M170 330 Q205 370 240 330 Q275 370 310 330 Q345 370 380 330 Q415 370 450 330 Q485 370 520 330 Q555 370 590 330 Q625 370 660 330 Q695 370 730 330",
    30,
    14,
  ],
];

const Dim: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  label: string;
  q: number;
}> = ({ x1, y1, x2, y2, t, label, q }) => {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g opacity={t}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={B.line} strokeWidth={2} strokeDasharray="8 6" />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) =>
        vertical ? (
          <line key={i} x1={x - 14} y1={y} x2={x + 14} y2={y} stroke={B.line} strokeWidth={2} />
        ) : (
          <line key={i} x1={x} y1={y - 14} x2={x} y2={y + 14} stroke={B.line} strokeWidth={2} />
        ),
      )}
      <rect x={mx - 62} y={my - 24} width={124} height={48} fill={B.bg} />
      <text
        x={mx}
        y={my + 12}
        textAnchor="middle"
        fontFamily={SFONTS.hand}
        fontSize={34}
        fill={q > 0.5 ? B.stamp : B.line}
        transform={`rotate(${vertical ? -90 : 0} ${mx} ${my})`}
      >
        {q > 0.5 ? "???" : label}
      </text>
    </g>
  );
};

/** 02 · Blueprint: "But turning it into a side hustle? Nobody hands you the plan." */
export const S2Blueprint: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring();
  const id = "blueprint" as const;
  const l0 = lineAt(id, 0);
  const l1 = lineAt(id, 1);
  const drift = interpolate(frame, [0, seqDuration(id)], [0, -40]);
  const title = sp(OVER, { damping: 14, stiffness: 160 });
  const dims = interpolate(frame, [l0 + 30, l0 + 40], [0, 1], CLAMP);
  const qs = (k: number) => (frame >= wordAt(id, 1, 0) + k * 4 ? 1 : 0);
  const stampAt = wordAt(id, 1, 4) - 2;
  const stamp = sp(stampAt, { damping: 11, stiffness: 300, mass: 0.6 });
  const shake =
    frame >= stampAt && frame < stampAt + 6 ? Math.sin(frame * 3.3) * (stampAt + 6 - frame) * 1.6 : 0;
  const block = sp(l1 - 4, { damping: 16, stiffness: 160 });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${B.bg} 0%, ${B.deep} 100%)`,
        overflow: "hidden",
      }}
    >
      {/* grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${B.faint} 2px, transparent 2px), linear-gradient(90deg, ${B.faint} 2px, transparent 2px), linear-gradient(rgba(232,241,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(232,241,255,0.07) 1px, transparent 1px)`,
          backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
          backgroundPosition: `0 ${drift}px, 0 ${drift}px, 0 ${drift}px, 0 ${drift}px`,
        }}
      />
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        {/* handwritten title */}
        <div
          style={{
            position: "absolute",
            left: 90,
            right: 140,
            top: 230,
            fontFamily: SFONTS.hand,
            fontSize: 92,
            color: B.line,
            lineHeight: 1.05,
            opacity: title,
            transform: `translateY(${(1 - title) * 30}px)`,
          }}
        >
          side hustle<span style={{ color: B.stamp }}>?</span>
          <svg width={560} height={30} style={{ display: "block", marginTop: 4 }}>
            <path
              d="M6 18 Q140 4 280 16 T554 12"
              stroke={B.line}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - interpolate(frame, [OVER + 6, OVER + 20], [0, 1], CLAMP)}
            />
          </svg>
        </div>

        {/* schematic */}
        <svg
          width={900}
          height={700}
          viewBox="0 0 900 700"
          style={{ position: "absolute", left: 90, top: 460 }}
        >
          {PARTS.map(([d, o, len], i) => (
            <path
              key={i}
              d={d}
              stroke={B.line}
              strokeWidth={5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={
                1 - interpolate(frame, [l0 + o, l0 + o + len], [0, 1], { ...CLAMP, easing: EASE.uiInOut })
              }
            />
          ))}
          <Dim x1={170} y1={670} x2={730} y2={670} t={dims} label="6.0 m" q={qs(0)} />
          <Dim x1={800} y1={150} x2={800} y2={620} t={dims} label="4.5 m" q={qs(1)} />
          <Dim x1={60} y1={330} x2={60} y2={620} t={dims} label="3.0 m" q={qs(2)} />
        </svg>

        {/* title block: the plan field stays empty */}
        <div
          style={{
            position: "absolute",
            left: 470,
            top: 1210,
            width: 470,
            border: `3px solid ${B.line}`,
            fontFamily: SFONTS.tech,
            color: B.line,
            transform: `translateX(${(1 - block) * 600}px)`,
          }}
        >
          {[
            ["PROJECT", "SIDE HUSTLE"],
            ["REV", "0"],
            ["PLAN", ""],
          ].map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                borderTop: i ? `2px solid ${B.line}` : undefined,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              <div
                style={{ width: 150, padding: "8px 14px", borderRight: `2px solid ${B.line}`, opacity: 0.7 }}
              >
                {k}
              </div>
              <div style={{ padding: "8px 14px", minHeight: 30 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* stamp */}
        {frame >= stampAt ? (
          <div
            style={{
              position: "absolute",
              left: 150,
              top: 690,
              padding: "14px 30px",
              border: `8px solid ${B.stamp}`,
              borderRadius: 14,
              color: B.stamp,
              fontFamily: SFONTS.tech,
              fontWeight: 700,
              fontSize: 76,
              letterSpacing: "0.06em",
              lineHeight: 1,
              textAlign: "center",
              transform: `rotate(-12deg) scale(${2.4 - 1.4 * stamp})`,
              opacity: Math.min(1, stamp * 1.6) * 0.92,
              background: "rgba(14,58,112,0.55)",
            }}
          >
            PLAN NOT
            <br />
            INCLUDED
          </div>
        ) : null}
      </AbsoluteFill>
      <Grain id="bp" opacity={0.18} blend="screen" />
    </AbsoluteFill>
  );
};
