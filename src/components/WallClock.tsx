import React from "react";
import { HEIGHT, WIDTH } from "../timeline";
import { COLORS } from "../theme";
import { Bar, clockHandSpecs, handBar, tickBar } from "../lib/geometry";
import { Crack } from "../lib/paths";
import { useSafeId } from "../lib/ids";
import { BarShape } from "./AlarmDigits";

type FaceProps = {
  cx: number;
  cy: number;
  R: number;
  /** 0..1 rim draw-in (stroke-dashoffset) */
  rim?: number;
  /** 0..1 face fill + detail */
  face?: number;
  /** 0..1 long hard shadow cast by the key light (top-left) */
  shadow?: number;
  color?: string;
};

/** Rim, face, minute dots and the long skewed noir shadow. Lives inside an <svg>. */
export const ClockFace: React.FC<FaceProps> = ({
  cx,
  cy,
  R,
  rim = 1,
  face = 1,
  shadow = 1,
  color = COLORS.bone,
}) => {
  const faceId = useSafeId("face");
  const shadowBlur = useSafeId("shadow-blur");
  const C = 2 * Math.PI * (R - R * 0.02);
  return (
    <g>
      <defs>
        <radialGradient id={faceId} cx="34%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#24221F" />
          <stop offset="55%" stopColor="#121110" />
          <stop offset="100%" stopColor="#070707" />
        </radialGradient>
        <filter id={shadowBlur} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={2.2} />
        </filter>
      </defs>
      {/* hard shadow: skewed copy of the disc thrown down-right */}
      <g
        opacity={0.82 * shadow}
        filter={`url(#${shadowBlur})`}
        transform={`translate(${cx + R * 0.32} ${cy + R * 0.42}) skewX(-18) scale(1 1.04) translate(${-cx} ${-cy})`}
      >
        <circle cx={cx} cy={cy} r={R * 1.01} fill="#000" />
      </g>
      <circle cx={cx} cy={cy} r={R} fill={`url(#${faceId})`} opacity={face} />
      {/* minute dots */}
      <g opacity={0.45 * face}>
        {Array.from({ length: 60 }).map((_, i) =>
          i % 5 === 0 ? null : (
            <circle
              key={i}
              cx={cx + R * 0.86 * Math.sin((i * Math.PI) / 30)}
              cy={cy - R * 0.86 * Math.cos((i * Math.PI) / 30)}
              r={R * 0.007}
              fill={color}
            />
          ),
        )}
      </g>
      <circle
        cx={cx}
        cy={cy}
        r={R - R * 0.02}
        fill="none"
        stroke={color}
        strokeWidth={R * 0.04}
        strokeDasharray={C}
        strokeDashoffset={C * (1 - rim)}
        transform={`rotate(-90 ${cx} ${cy})`}
        strokeLinecap="round"
      />
      <circle
        cx={cx}
        cy={cy}
        r={R * 0.94}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.18 * face}
      />
    </g>
  );
};

/** Glass highlight arc. */
export const ClockGlass: React.FC<{ cx: number; cy: number; R: number; opacity?: number }> = ({
  cx,
  cy,
  R,
  opacity = 1,
}) => {
  const id = useSafeId("glass");
  return (
    <g opacity={opacity}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.14} />
          <stop offset="60%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={`M ${cx - R * 0.82} ${cy - R * 0.1} A ${R * 0.84} ${R * 0.84} 0 0 1 ${cx + R * 0.2} ${cy - R * 0.8} A ${
          R * 1.1
        } ${R * 1.1} 0 0 0 ${cx - R * 0.82} ${cy - R * 0.1} Z`}
        fill={`url(#${id})`}
      />
    </g>
  );
};

/** A hand drawn with a motion smear trailing `smear` degrees behind it. */
export const SmearedHand: React.FC<{
  bar: (deg: number) => Bar;
  deg: number;
  smear: number;
  fill: string;
}> = ({ bar, deg, smear, fill }) => {
  const ghosts = smear > 2 ? 10 : 0;
  return (
    <g>
      {Array.from({ length: ghosts }).map((_, i) => {
        const k = (i + 1) / ghosts;
        return <BarShape key={i} bar={bar(deg - smear * k)} fill={fill} opacity={0.22 * (1 - k)} />;
      })}
      <BarShape bar={bar(deg)} fill={fill} />
    </g>
  );
};

type CrackProps = {
  cracks: Crack[];
  /** draw progress per burst index */
  progress: number[];
  clip: { cx: number; cy: number; r: number };
};

/** Glass cracks drawn on with stroke-dashoffset, clipped to the clock face. */
export const CrackLines: React.FC<CrackProps> = ({ cracks, progress, clip }) => {
  const clipId = useSafeId("crack-clip");
  return (
    <g clipPath={`url(#${clipId})`}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={clip.cx} cy={clip.cy} r={clip.r} />
        </clipPath>
      </defs>
      {cracks.map((c, i) => {
        const p = progress[c.burst] ?? 0;
        if (p <= 0) return null;
        const off = c.len * (1 - p);
        return (
          <g key={i}>
            <path
              d={c.d}
              fill="none"
              stroke="rgba(0,0,0,0.7)"
              strokeWidth={c.width + 2.5}
              strokeDasharray={c.len}
              strokeDashoffset={off}
              strokeLinejoin="bevel"
              transform="translate(1.5 1.5)"
            />
            <path
              d={c.d}
              fill="none"
              stroke={COLORS.bone}
              strokeWidth={c.width}
              strokeDasharray={c.len}
              strokeDashoffset={off}
              strokeLinejoin="bevel"
              opacity={0.92}
            />
          </g>
        );
      })}
    </g>
  );
};

type WallClockProps = {
  cx: number;
  cy: number;
  R: number;
  /** angles in degrees, clockwise from 12 */
  hour: number;
  minute: number;
  second?: number | null;
  smearHour?: number;
  smearMinute?: number;
  rim?: number;
  face?: number;
  shadow?: number;
  color?: string;
  secondColor?: string;
  children?: React.ReactNode;
};

/** Office wall clock (noir): skewed shadow, face, ticks, hands, glass. */
export const WallClock: React.FC<WallClockProps> = ({
  cx,
  cy,
  R,
  hour,
  minute,
  second = null,
  smearHour = 0,
  smearMinute = 0,
  rim = 1,
  face = 1,
  shadow = 1,
  color = COLORS.bone,
  secondColor = COLORS.blood,
  children,
}) => {
  const spec = clockHandSpecs(R);
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      <ClockFace cx={cx} cy={cy} R={R} rim={rim} face={face} shadow={shadow} color={color} />
      {Array.from({ length: 12 }).map((_, i) => (
        <BarShape key={i} bar={tickBar(cx, cy, R, i)} fill={color} />
      ))}
      {children}
      <SmearedHand
        bar={(d) => handBar(cx, cy, d, spec.hour.len, spec.hour.thick, spec.hour.tail)}
        deg={hour}
        smear={smearHour}
        fill={color}
      />
      <SmearedHand
        bar={(d) => handBar(cx, cy, d, spec.minute.len, spec.minute.thick, spec.minute.tail)}
        deg={minute}
        smear={smearMinute}
        fill={color}
      />
      {second !== null ? (
        <BarShape
          bar={handBar(cx, cy, second, spec.second.len, spec.second.thick, spec.second.tail)}
          fill={secondColor}
        />
      ) : null}
      <circle cx={cx} cy={cy} r={R * 0.045} fill={color} />
      <circle cx={cx} cy={cy} r={R * 0.018} fill="#0A0A0A" />
      <ClockGlass cx={cx} cy={cy} R={R} opacity={face} />
    </svg>
  );
};
