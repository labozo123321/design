import React from "react";
import { HEIGHT, WIDTH } from "../timeline";
import { COLORS } from "../theme";
import { Bar, barPoints, layoutSevenSeg, sevenSegMetrics } from "../lib/geometry";
import { useSafeId } from "../lib/ids";

/** One bar (LED segment, clock tick or hand). Dots render as rounded squares. */
export const BarShape: React.FC<{ bar: Bar; fill: string; gap?: number; opacity?: number }> = ({
  bar,
  fill,
  gap = 0,
  opacity = 1,
}) =>
  bar.kind === "dot" ? (
    <rect
      x={bar.cx - bar.len / 2}
      y={bar.cy - bar.thick / 2}
      width={bar.len}
      height={bar.thick}
      rx={bar.thick * 0.18}
      fill={fill}
      opacity={opacity}
    />
  ) : (
    <polygon
      points={barPoints(bar.len, bar.thick, gap)}
      transform={`translate(${bar.cx.toFixed(2)} ${bar.cy.toFixed(2)}) rotate(${bar.angle.toFixed(2)})`}
      fill={fill}
      opacity={opacity}
    />
  );

type AlarmDigitsProps = {
  text?: string;
  cx: number;
  cy: number;
  /** digit height in px */
  height: number;
  color?: string;
  ghostColor?: string;
  /** 0..1 overall power (flicker on/off) */
  power?: number;
  /** 0..1 bloom around lit segments */
  glow?: number;
  /** 0..1 visibility of the unlit "8" segments */
  ghost?: number;
  /** px red/cyan split on lit segments (distortion on the beeps) */
  chroma?: number;
  /** mirrored reflection on the nightstand */
  reflection?: number;
};

/** Big seven-segment alarm clock display, drawn as SVG polygons. */
export const AlarmDigits: React.FC<AlarmDigitsProps> = ({
  text = "6:00",
  cx,
  cy,
  height,
  color = COLORS.led,
  ghostColor = COLORS.ledGhost,
  power = 1,
  glow = 0.8,
  ghost = 1,
  chroma = 0,
  reflection = 0,
}) => {
  const glowId = useSafeId("led-glow");
  const spillId = useSafeId("led-spill");
  const reflId = useSafeId("led-refl");
  const fadeId = useSafeId("led-fade");
  const bars = layoutSevenSeg(text, cx, cy, height);
  const lit = bars.filter((b) => b.lit);
  const m = sevenSegMetrics(text, height);
  if (power <= 0.001) return null;

  const litGroup = (fill: string) => lit.map((b) => <BarShape key={b.key} bar={b} fill={fill} />);
  const floorY = cy + height / 2 + 26;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      <defs>
        <filter id={glowId} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation={height * 0.045} />
        </filter>
        <filter id={reflId} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={5} />
        </filter>
        <radialGradient id={spillId}>
          <stop offset="0%" stopColor={color} stopOpacity={0.55} />
          <stop offset="55%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
        <linearGradient
          id={fadeId}
          x1="0"
          y1={floorY}
          x2="0"
          y2={floorY + height * 0.8}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#fff" stopOpacity={1} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${fadeId}-m`}>
          <rect x={0} y={floorY} width={WIDTH} height={height} fill={`url(#${fadeId})`} />
        </mask>
      </defs>

      {/* light spilling onto the wall behind */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={m.totalW * 0.95}
        ry={height * 1.35}
        fill={`url(#${spillId})`}
        opacity={0.55 * glow * power}
      />

      {/* unlit segments */}
      <g opacity={ghost * Math.min(1, power * 1.4)}>
        {bars.map((b) => (
          <BarShape key={b.key} bar={b} fill={ghostColor} />
        ))}
      </g>

      {/* nightstand reflection */}
      {reflection > 0 ? (
        <g mask={`url(#${fadeId}-m)`} opacity={reflection * power}>
          <g filter={`url(#${reflId})`} transform={`translate(0 ${2 * floorY}) scale(1 -1)`}>
            {litGroup(color)}
          </g>
        </g>
      ) : null}

      {/* bloom */}
      <g filter={`url(#${glowId})`} opacity={glow * power}>
        {litGroup(color)}
      </g>

      {/* chromatic split */}
      {chroma > 0.05 ? (
        <>
          <g transform={`translate(${-chroma} 0)`} style={{ mixBlendMode: "screen" }} opacity={0.9 * power}>
            {litGroup(COLORS.fringeRed)}
          </g>
          <g
            transform={`translate(${chroma} ${chroma * 0.3})`}
            style={{ mixBlendMode: "screen" }}
            opacity={0.75 * power}
          >
            {litGroup(COLORS.fringeCyan)}
          </g>
        </>
      ) : null}

      {/* lit core */}
      <g opacity={power}>{litGroup(color)}</g>
    </svg>
  );
};
