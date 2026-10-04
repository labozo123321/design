import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, EASE } from "../../lib/anim";
import { SFONTS } from "../fonts";
import { Grain, useSpring } from "../kit";
import { OVER, lineAt, wordAt } from "../timeline";

const H = { bg: "#EFE6D2", red: "#D7392B", blue: "#1F4E9C", yellow: "#F2B630", ink: "#151515" };

/** The path: a bold S from bottom left to top right, with five step stops along it. */
const PATH = "M130 1340 C130 1150 520 1210 540 1060 C560 900 220 930 240 780 C260 640 700 700 900 640";
const STOPS = [
  { x: 130, y: 1340 },
  { x: 470, y: 1150 },
  { x: 470, y: 960 },
  { x: 260, y: 790 },
  { x: 640, y: 680 },
];

/** 03 · Bauhaus poster: "FourFig does. One clear path, broken into small steps you can actually finish." */
export const S3Bauhaus: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring();
  const id = "bauhaus" as const;
  const l0 = lineAt(id, 0);
  const l1 = lineAt(id, 1);
  const pathAt = wordAt(id, 1, 0);
  const stepsAt = wordAt(id, 1, 5);
  const finishAt = wordAt(id, 1, 10);

  const circle = sp(Math.min(l0 - 6, OVER), { damping: 11, stiffness: 160 });
  const square = sp(Math.min(l0 - 1, OVER + 5), { damping: 10, stiffness: 200 });
  const tri = sp(Math.min(l0 + 4, OVER + 10), { damping: 10, stiffness: 200 });
  const word = sp(l0 + 1, { damping: 14, stiffness: 260 });
  const does = sp(wordAt(id, 0, 1), { damping: 9, stiffness: 300 });
  // title climbs to the top band once the path starts
  const up = interpolate(frame, [l1 - 4, l1 + 14], [0, 1], { ...CLAMP, easing: EASE.whip });
  const draw = interpolate(frame, [pathAt, wordAt(id, 1, 3) + 6], [0, 1], { ...CLAMP, easing: EASE.uiInOut });
  const spin = frame * 0.6;

  return (
    <AbsoluteFill style={{ background: H.bg, overflow: "hidden" }}>
      {/* poster shapes */}
      <div
        style={{
          position: "absolute",
          left: 540 - 330 + up * 280,
          top: 330 - 120 * up,
          width: 660,
          height: 660,
          borderRadius: "50%",
          background: H.red,
          transform: `scale(${circle * (1 - up * 0.62)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90 - up * 10,
          top: 260 - up * 60,
          width: 230,
          height: 230,
          background: H.blue,
          transform: `translateX(${(1 - square) * -500 - up * 420}px) rotate(${(1 - square) * -90 - up * 40}deg)`,
        }}
      />
      <svg
        width={300}
        height={270}
        style={{
          position: "absolute",
          left: 690 + up * 120,
          top: 820 - up * 620,
          transform: `translateY(${(1 - tri) * 700}px) rotate(${spin * up}deg) scale(${1 - up * 0.55})`,
        }}
      >
        <polygon points="150,0 300,260 0,260" fill={H.yellow} />
      </svg>
      {/* thick rule */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 1080 - up * 760,
          height: 26,
          width: 900 * interpolate(frame, [l0 + 2, l0 + 14], [0, 1], { ...CLAMP, easing: EASE.whip }),
          background: H.ink,
          opacity: 1 - up,
        }}
      />

      {/* wordmark */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 580 - up * 420,
          fontFamily: SFONTS.poster,
          color: H.ink,
          fontSize: 190 - up * 86,
          lineHeight: 0.9,
          letterSpacing: "-0.04em",
          transform: `translateY(${(1 - word) * 160}px)`,
          opacity: Math.min(1, word * 2),
        }}
      >
        FourFig
        <div
          style={{
            color: H.blue,
            fontSize: 150 - up * 70,
            transform: `scale(${does}) rotate(${(1 - does) * -20}deg)`,
            transformOrigin: "0% 50%",
            opacity: frame >= wordAt(id, 0, 1) ? 1 : 0,
          }}
        >
          does.
        </div>
      </div>

      {/* the path, and its steps */}
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <path
          d={PATH}
          stroke={H.ink}
          strokeWidth={30}
          fill="none"
          strokeLinecap="butt"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
        {STOPS.map((s, i) => {
          const at = stepsAt - 4 + i * 4;
          const pop = sp(at, { damping: 9, stiffness: 260 });
          const done = frame >= finishAt + i * 2;
          const col = [H.red, H.blue, H.yellow, H.red, H.blue][i];
          const last = i === STOPS.length - 1;
          if (frame < at) return null;
          return (
            <g key={i} transform={`translate(${s.x} ${s.y}) scale(${pop})`}>
              {last ? (
                <rect
                  x={-58}
                  y={-58}
                  width={116}
                  height={116}
                  fill={done ? H.ink : H.bg}
                  stroke={H.ink}
                  strokeWidth={12}
                />
              ) : (
                <circle r={54} fill={done ? col : H.bg} stroke={H.ink} strokeWidth={12} />
              )}
              <text
                y={18}
                textAnchor="middle"
                fontFamily={SFONTS.poster}
                fontSize={52}
                fill={done ? (last ? H.yellow : col === H.yellow ? H.ink : H.bg) : H.ink}
              >
                {done && last ? "✓" : i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* step labels, poster style */}
      {frame >= stepsAt ? (
        <div
          style={{
            position: "absolute",
            left: 640,
            top: 1210,
            fontFamily: SFONTS.poster,
            fontSize: 64,
            lineHeight: 0.95,
            color: H.ink,
            transform: `translateX(${(1 - sp(stepsAt, { damping: 14, stiffness: 200 })) * 500}px)`,
          }}
        >
          small
          <br />
          <span style={{ color: H.red }}>steps.</span>
        </div>
      ) : null}
      <Grain id="bh" opacity={0.3} />
    </AbsoluteFill>
  );
};
