import React from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { GlitchSlice } from "../components/GlitchSlice";
import { NoirLight } from "../components/NoirLight";
import { TextColumn } from "../components/Type";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp, steps } from "../lib/anim";
import { polyLength, polyPath, Pt } from "../lib/paths";
import { stepRandom } from "../lib/noise";
import { SceneProps } from "./types";

/** Tick frames: fast at first, slowing as the balance drains. */
const TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 17, 20, 23, 27, 31, 36, 42];
const SETTLE = 44;
const MINUS_AT = 47;
const ROLL = 3;

/** Integer places left: the number literally loses digits as it falls. */
const placesAt = (f: number) => (f < 12 ? 4 : f < 23 ? 3 : f < 36 ? 2 : 1);

const tickIndex = (f: number) => {
  let k = -1;
  TICKS.forEach((t, i) => {
    if (f >= t) k = i;
  });
  return k;
};

const digitFor = (k: number, slot: number) => String(Math.floor(random(`bal-${k}-${slot}`) * 10));

const SPARK: Pt[] = Array.from({ length: 26 }).map((_, i) => ({
  x: 150 + i * 31,
  y: 1090 + i * 9.5 + (random(`spark-${i}`) - 0.5) * 70 - (i % 5 === 2 ? 40 : 0),
}));
const SPARK_LEN = polyLength(SPARK);

/** One mono character cell with an odometer roll from above. */
const Slot: React.FC<{ from: string; to: string; roll: number; dim?: boolean }> = ({
  from,
  to,
  roll,
  dim,
}) => (
  <span
    style={{
      position: "relative",
      display: "inline-block",
      width: "0.6em",
      height: "1.1em",
      overflow: "hidden",
    }}
  >
    <span
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translateY(${(roll - 1) * 100}%)`,
        filter: roll > 0 && roll < 1 ? "blur(3px)" : undefined,
        opacity: dim ? 0.55 : 1,
      }}
    >
      {to}
    </span>
    {roll < 1 ? (
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translateY(${roll * 100}%)`,
          filter: roll > 0 ? "blur(3px)" : undefined,
          opacity: dim ? 0.55 : 1,
        }}
      >
        {from}
      </span>
    ) : null}
  </span>
);

/**
 * 390–450 · A bank balance in big mono digits ticks down, slowing near the
 * bottom. Never a readable amount: digits flicker to underscores, places drop
 * away, and it settles on "$ _.__" before glitching negative.
 */
export const Act2Balance: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const k = tickIndex(frame);
  const tickStart = TICKS[Math.max(0, k)];
  const roll = ramp(frame, tickStart, tickStart + ROLL, Easing.out(Easing.cubic));
  const places = placesAt(frame);
  const settled = frame >= SETTLE;
  const minus = frame >= MINUS_AT;

  const slots: React.ReactNode[] = [];
  const intSlots = places;
  const total = intSlots + 2;
  for (let i = 0; i < total; i++) {
    const slotId = total - i; // stable id counted from the right
    const flicker = stepRandom(`bal-fl-${slotId}`, frame, 1) < (settled ? 0.06 : 0.38);
    const underscore = settled ? !flicker : flicker;
    const to = underscore ? "_" : digitFor(k, slotId);
    const from = digitFor(k - 1, slotId);
    const rolls = !settled && (slotId <= 2 || random(`bal-r-${k}-${slotId}`) < 0.5);
    if (i === intSlots) slots.push(<span key="dot">.</span>);
    if (places === 4 && i === 1) slots.push(<span key="comma">,</span>);
    slots.push(<Slot key={slotId} from={from} to={to} roll={rolls ? roll : 1} dim={underscore} />);
  }

  const glitch =
    frame >= MINUS_AT && frame < MINUS_AT + 3
      ? 0.9
      : frame >= duration - 7
        ? interpolate(frame, [duration - 7, duration - 1], [0.3, 1], { ...CLAMP, easing: steps(3) })
        : stepRandom("bal-g", frame) > 0.93
          ? 0.25
          : 0;

  const spark = ramp(frame, 0, SETTLE, EASE.noir);
  const head = SPARK[Math.min(SPARK.length - 1, Math.floor(spark * (SPARK.length - 1)))];

  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <GlitchSlice intensity={glitch} seed="balance" maxShift={150} rgb={18} background="#050505">
        <AbsoluteFill style={{ background: "#050505" }}>
          <NoirLight x={540} y={640} radius={660} intensity={0.75} hardness={0.7} />
          <TextColumn y={660}>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 36,
                letterSpacing: "0.2em",
                color: "rgba(237,230,218,0.72)",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <svg width={22} height={18} viewBox="0 0 22 18">
                <path d="M0 0 H22 L11 18 Z" fill={COLORS.blood} />
              </svg>
              available balance
            </div>
          </TextColumn>
          <TextColumn y={830}>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontWeight: 500,
                fontSize: 132,
                lineHeight: 1.1,
                color: COLORS.bone,
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                textShadow: "0 0 18px rgba(237,230,218,0.18)",
              }}
            >
              <span
                style={{
                  color: "#C3181E",
                  width: minus ? "0.6em" : 0,
                  overflow: "hidden",
                  display: "inline-block",
                }}
              >
                -
              </span>
              <span>$</span>
              <span style={{ width: "0.35em", display: "inline-block" }} />
              {slots}
            </div>
          </TextColumn>
          <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
            <path
              d={polyPath(SPARK)}
              fill="none"
              stroke="rgba(237,230,218,0.32)"
              strokeWidth={3}
              strokeDasharray={SPARK_LEN}
              strokeDashoffset={SPARK_LEN * (1 - spark)}
              strokeLinejoin="round"
            />
            <circle cx={head.x} cy={head.y} r={8} fill="#C3181E" opacity={spark > 0 ? 1 : 0} />
            <line
              x1={150}
              y1={1420}
              x2={930}
              y2={1420}
              stroke="rgba(237,230,218,0.12)"
              strokeWidth={2}
              strokeDasharray="6 10"
            />
          </svg>
        </AbsoluteFill>
      </GlitchSlice>
    </AbsoluteFill>
  );
};
