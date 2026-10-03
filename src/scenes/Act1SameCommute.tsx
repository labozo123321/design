import React from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { BarShape } from "../components/AlarmDigits";
import { NoirLight } from "../components/NoirLight";
import { ClockFace, ClockGlass, SmearedHand } from "../components/WallClock";
import { LetterReveal, TextColumn } from "../components/Type";
import { HEIGHT, WIDTH } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, lerp, ramp } from "../lib/anim";
import { Bar, clockHandSpecs, handBar, layoutSevenSeg, nearestBarAngle, tickBar } from "../lib/geometry";
import { shake } from "../lib/noise";
import { useSafeId } from "../lib/ids";
import { ALARM } from "./Act1Alarm";
import { SceneProps } from "./types";

export const CLOCK = { cx: 540, cy: 830, R: 300 } as const;

type Role = "tick" | "minute" | "hour" | "spare" | "pin";
type MorphPair = { from: Bar; to: Bar; role: Role; spin: number; delay: number };

const angleFromCentre = (b: Bar) =>
  ((Math.atan2(b.cx - CLOCK.cx, -(b.cy - CLOCK.cy)) * 180) / Math.PI + 360) % 360;
const angularDistance = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * Match-cut morph map. "6:00" has 18 lit segments + 2 colon dots:
 *  - the first 0's left verticals become the hands (pointing at 12 and 6, i.e. 6:00),
 *  - 12 segments fly to the hour ticks (assigned by angle around the clock),
 *  - the leftovers dissolve outward, the colon collapses into the centre pin.
 */
const buildMorph = (): MorphPair[] => {
  const { cx, cy, R } = CLOCK;
  const spec = clockHandSpecs(R);
  const src = layoutSevenSeg("6:00", ALARM.cx, ALARM.cy, ALARM.height);
  const lit = src.filter((b) => b.lit && b.kind === "bar");
  const minuteSrc = lit.find((b) => b.key === "2-f") as Bar;
  const hourSrc = lit.find((b) => b.key === "2-e") as Bar;
  const pool = lit.filter((b) => b !== minuteSrc && b !== hourSrc);
  const pairs: MorphPair[] = [];

  for (let i = 0; i < 12; i++) {
    let best = 0;
    let bestD = Infinity;
    pool.forEach((b, j) => {
      const d = angularDistance(angleFromCentre(b), i * 30);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    const [from] = pool.splice(best, 1);
    pairs.push({
      from,
      to: tickBar(cx, cy, R, i),
      role: "tick",
      spin: i % 2 ? 180 : 0,
      delay: (i % 4) * 0.9,
    });
  }
  pairs.push({
    from: minuteSrc,
    to: handBar(cx, cy, 0, spec.minute.len, spec.minute.thick, spec.minute.tail),
    role: "minute",
    spin: 0,
    delay: 0,
  });
  pairs.push({
    from: hourSrc,
    to: handBar(cx, cy, 180, spec.hour.len, spec.hour.thick, spec.hour.tail),
    role: "hour",
    spin: 0,
    delay: 0,
  });
  for (const spare of pool) {
    const a = (angleFromCentre(spare) * Math.PI) / 180;
    pairs.push({
      from: spare,
      to: { ...spare, cx: cx + Math.sin(a) * R * 1.3, cy: cy - Math.cos(a) * R * 1.3, len: 0.1, thick: 0.1 },
      role: "spare",
      spin: 90,
      delay: 0.5,
    });
  }
  for (const dot of src.filter((b) => b.kind === "dot")) {
    pairs.push({
      from: dot,
      to: { ...dot, cx, cy, len: R * 0.09, thick: R * 0.09 },
      role: "pin",
      spin: 45,
      delay: 1,
    });
  }
  return pairs;
};

const MORPH = buildMorph();
const MORPH_START = 3;
const MORPH_LEN = 15;
const SPIN_START = MORPH_START + MORPH_LEN + 3;

const lerpBar = (p: MorphPair, m: number): Bar => ({
  ...p.from,
  cx: lerp(p.from.cx, p.to.cx, m),
  cy: lerp(p.from.cy, p.to.cy, m),
  len: lerp(p.from.len, p.to.len, m),
  thick: lerp(p.from.thick, p.to.thick, m),
  angle: lerp(p.from.angle, nearestBarAngle(p.from.angle, p.to.angle) + p.spin, m),
});

/** Minute-hand angle: accelerating "way too fast" spin. */
const spinAt = (frame: number) => {
  const t = Math.max(0, frame - SPIN_START);
  const deg = 2300 * Math.pow(t / 24, 2.3);
  const vel = t > 0 ? deg - 2300 * Math.pow(Math.max(0, t - 1) / 24, 2.3) : 0;
  return { deg, vel };
};

/**
 * 90–135 · Match cut. The alarm's 6:00 segments tear loose and reassemble as
 * an office wall clock (still reading 6:00), then the hands spin way too fast.
 * Noir: one key light top-left, a long skewed shadow, slow push-in.
 */
export const Act1SameCommute: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const glowId = useSafeId("morph-glow");
  const { cx, cy, R } = CLOCK;
  const spec = clockHandSpecs(R);

  const mAt = (delay: number) =>
    ramp(frame, MORPH_START + delay, MORPH_START + delay + MORPH_LEN, Easing.bezier(0.7, 0, 0.2, 1));
  const m = mAt(0);
  const color = interpolateColors(m, [0, 0.5, 1], [COLORS.led, "#C98C80", COLORS.bone]);
  const ghost = 1 - ramp(frame, 0, 6);
  const faceIn = ramp(frame, 7, 20, EASE.noir);
  const rim = ramp(frame, 8, 22, Easing.inOut(Easing.cubic));
  const light = ramp(frame, 8, 24, EASE.noir);

  const { deg, vel } = spinAt(frame);
  const minuteDeg = deg;
  const hourDeg = 180 + deg / 12;
  const spinning = frame >= SPIN_START;

  const tension = ramp(frame, 30, duration, Easing.in(Easing.quad));
  const s = shake("commute", frame, 1.5 + tension * 7, 0.5);
  const push = interpolate(frame, [0, duration], [1, 1.05], { ...CLAMP, easing: EASE.noir });

  const ghosts = layoutSevenSeg("6:00", ALARM.cx, ALARM.cy, ALARM.height);

  return (
    <AbsoluteFill style={{ background: COLORS.noir }}>
      <NoirLight x={300} y={420} radius={980} intensity={light} hardness={0.75} />
      <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px) scale(${push})` }}>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={13} />
            </filter>
          </defs>
          <ClockFace cx={cx} cy={cy} R={R} rim={rim} face={faceIn} shadow={light} color={COLORS.bone} />

          {/* unlit LED segments fade as the match cut begins */}
          <g opacity={ghost}>
            {ghosts.map((b) => (
              <BarShape key={b.key} bar={b} fill={COLORS.ledGhost} />
            ))}
          </g>

          {/* LED bloom dies as the segments cool to bone */}
          <g filter={`url(#${glowId})`} opacity={(1 - m) * 0.85}>
            {MORPH.map((p) => (
              <BarShape key={p.from.key} bar={lerpBar(p, mAt(p.delay))} fill={COLORS.led} />
            ))}
          </g>

          {MORPH.map((p) => {
            const mp = mAt(p.delay);
            if (p.role === "spare") {
              return <BarShape key={p.from.key} bar={lerpBar(p, mp)} fill={color} opacity={1 - mp} />;
            }
            if (p.role === "pin") {
              return (
                <BarShape
                  key={p.from.key}
                  bar={lerpBar(p, mp)}
                  fill={color}
                  opacity={1 - ramp(mp, 0.85, 1)}
                />
              );
            }
            if (spinning && p.role === "minute") {
              return (
                <SmearedHand
                  key={p.from.key}
                  bar={(d) => handBar(cx, cy, d, spec.minute.len, spec.minute.thick, spec.minute.tail)}
                  deg={minuteDeg}
                  smear={Math.min(160, vel * 0.85)}
                  fill={COLORS.bone}
                />
              );
            }
            if (spinning && p.role === "hour") {
              return (
                <SmearedHand
                  key={p.from.key}
                  bar={(d) => handBar(cx, cy, d, spec.hour.len, spec.hour.thick, spec.hour.tail)}
                  deg={hourDeg}
                  smear={Math.min(70, (vel / 12) * 0.85)}
                  fill={COLORS.bone}
                />
              );
            }
            return <BarShape key={p.from.key} bar={lerpBar(p, mp)} fill={color} />;
          })}

          <circle cx={cx} cy={cy} r={R * 0.045} fill={COLORS.bone} opacity={ramp(m, 0.85, 1)} />
          <circle cx={cx} cy={cy} r={R * 0.018} fill={COLORS.noir} opacity={ramp(m, 0.85, 1)} />
          <ClockGlass cx={cx} cy={cy} R={R} opacity={faceIn} />
        </svg>

        <TextColumn y={1330}>
          <LetterReveal
            text="same commute"
            frame={frame}
            start={17}
            stagger={1.7}
            fade={9}
            style={{ fontFamily: FONTS.serif, fontSize: 112, color: COLORS.bone }}
          />
        </TextColumn>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
