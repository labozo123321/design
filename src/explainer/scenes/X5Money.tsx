import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Cursor, cursorAt } from "../../components/Cursor";
import { Backdrop, Chip, CircleWipe, StepLabel } from "../kit";
import { EB } from "../timeline";
import { AppShell, Field, LimeButton, UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { CLAMP, EASE, ramp } from "../../lib/anim";
import { PHONE_AT } from "./X2Path";

const S = PHONE_AT.scale;
const ORIGIN = { x: PHONE_AT.cx - (300 - 14) * S, y: PHONE_AT.cy - (620 - 14) * S };
const abs = (x: number, y: number) => ({ x: ORIGIN.x + x * S, y: ORIGIN.y + y * S });

const TABS = ["1W", "1M", "3M", "1Y", "ALL"];
/** Chart shapes per range (0..1 heights). No values or axes: it shows the habit, not a number. */
const SETS = [
  [0.1, 0.1, 0.18, 0.18, 0.24, 0.24, 0.3, 0.3, 0.34, 0.34],
  [0.05, 0.1, 0.16, 0.24, 0.3, 0.38, 0.44, 0.5, 0.55, 0.6],
  [0.02, 0.06, 0.12, 0.2, 0.3, 0.38, 0.5, 0.58, 0.66, 0.7],
];
const CHART = { x: 50, y: 360, w: 470, h: 230 };
const BUTTON = { x: 48, y: 840, w: 476, h: 68 };
export const BADGE = { x: 540, y: 420 };

/** 630–780 · 04 Watch it add up: ranges switch, logging a win steps the chart up, a milestone pops. */
export const X5Money: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const draw = ramp(frame, 10, 34, EASE.uiInOut);
  const t1 = ramp(frame, EB.moneyTabs[0], EB.moneyTabs[0] + 8, EASE.uiInOut);
  const t2 = ramp(frame, EB.moneyTabs[1], EB.moneyTabs[1] + 8, EASE.uiInOut);
  const tab = frame >= EB.moneyTabs[1] ? 2 : frame >= EB.moneyTabs[0] ? 1 : 0;
  const bump = spring({ frame: frame - EB.moneyStep, fps, config: { damping: 10, stiffness: 180 } });
  const press = interpolate(frame, [EB.moneyTap - 1, EB.moneyTap, EB.moneyTap + 4], [0, 1, 0], CLAMP);
  const toast = spring({ frame: frame - EB.moneyStep, fps, config: { damping: 11, stiffness: 200 } });
  const badge = spring({ frame: frame - EB.moneyBadge, fps, config: { damping: 8, stiffness: 190 } });
  const wipe = ramp(frame, duration - 14, duration, EASE.whip);

  const heights = SETS[0].map((h0, i) => {
    let h = h0 + (SETS[1][i] - h0) * t1;
    h += (SETS[2][i] - SETS[1][i]) * t2;
    if (i === SETS[0].length - 1) h += 0.2 * bump;
    return h;
  });
  const dx = CHART.w / heights.length;
  let d = `M ${CHART.x} ${CHART.y + CHART.h}`;
  heights.forEach((h, i) => {
    const y = CHART.y + CHART.h * (1 - h);
    d += ` L ${CHART.x + i * dx} ${y} L ${CHART.x + (i + 1) * dx} ${y}`;
  });
  const area = `${d} L ${CHART.x + CHART.w} ${CHART.y + CHART.h} Z`;
  const btnAbs = abs(BUTTON.x + BUTTON.w / 2, BUTTON.y + BUTTON.h / 2);
  const tabAbs = (i: number) => abs(68 + i * 104, 640);
  const cursor = cursorAt(frame, fps, [
    { f: 20, x: 960, y: 1450 },
    { f: EB.moneyTabs[0] - 6, x: tabAbs(1).x, y: tabAbs(1).y + 8 },
    { f: EB.moneyTabs[1] - 6, x: tabAbs(2).x, y: tabAbs(2).y + 8 },
    { f: EB.moneyTap - 8, x: btnAbs.x + 30, y: btnAbs.y + 6 },
    { f: EB.moneyTap + 14, x: btnAbs.x + 30, y: btnAbs.y + 6 },
    { f: EB.moneyTap + 34, x: 870, y: 1560 },
  ]);

  return (
    <AbsoluteFill>
      <Backdrop hue={UI.blue} />
      <StepLabel n="04" title="Watch it add up" at={4} color={UI.blue} />
      <div
        style={{
          position: "absolute",
          left: PHONE_AT.cx - 300,
          top: PHONE_AT.cy - 620,
          transform: `translateY(${(1 - enter) * 1300}px) scale(${S})`,
        }}
      >
        <PhoneFrame screenBackground={UI.bg}>
          <AppShell title="Money" tab="Money" streak={1} today="2/3 today">
            <div
              style={{
                position: "absolute",
                left: 22,
                right: 22,
                top: 282,
                height: 420,
                borderRadius: 28,
                border: `2px solid ${UI.line}`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 26,
                  top: 22,
                  fontFamily: PFONTS.app,
                  fontWeight: 900,
                  fontSize: 18,
                  letterSpacing: "0.12em",
                  color: UI.muted,
                }}
              >
                EVERY WIN YOU LOG
              </div>
            </div>
            <svg width={572} height={1212} style={{ position: "absolute", inset: 0 }}>
              <defs>
                <linearGradient id="money-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={UI.lime} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={UI.lime} stopOpacity={0} />
                </linearGradient>
                <clipPath id="money-draw">
                  <rect x={CHART.x - 4} y={CHART.y - 60} width={(CHART.w + 8) * draw} height={CHART.h + 70} />
                </clipPath>
              </defs>
              <g clipPath="url(#money-draw)">
                <path d={area} fill="url(#money-area)" />
                <path d={d} fill="none" stroke={UI.lime} strokeWidth={5} strokeLinejoin="round" />
              </g>
            </svg>
            <div
              style={{
                position: "absolute",
                left: 30,
                right: 30,
                top: 610,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              {TABS.map((t, i) => (
                <div
                  key={t}
                  style={{
                    width: 76,
                    height: 56,
                    borderRadius: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: PFONTS.app,
                    fontWeight: 900,
                    fontSize: 22,
                    background: i === tab ? "#1E2636" : "transparent",
                    color: i === tab ? "#fff" : UI.muted,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 22,
                right: 22,
                top: 730,
                height: 200,
                borderRadius: 28,
                border: `2px solid ${UI.line}`,
                padding: "18px 26px",
                boxSizing: "border-box",
              }}
            >
              <Field value="" placeholder="Amount" prefix="$" />
            </div>
            <div style={{ position: "absolute", left: BUTTON.x, top: BUTTON.y, width: BUTTON.w }}>
              <LimeButton label="ADD INCOME" pressed={press} size={24} />
            </div>
            {frame >= EB.moneyStep ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 186,
                  display: "flex",
                  justifyContent: "center",
                  transform: `translateY(${(1 - toast) * -60}px)`,
                  opacity: Math.min(1, toast * 2),
                }}
              >
                <div
                  style={{
                    background: UI.lime,
                    color: "#0E1119",
                    fontFamily: PFONTS.app,
                    fontWeight: 900,
                    fontSize: 26,
                    padding: "12px 26px",
                    borderRadius: 999,
                  }}
                >
                  Logged ✓
                </div>
              </div>
            ) : null}
          </AppShell>
        </PhoneFrame>
      </div>

      {frame >= EB.moneyBadge ? (
        <div
          style={{
            position: "absolute",
            left: 140,
            right: 140,
            top: BADGE.y - 50,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${badge})`,
          }}
        >
          <Chip color={UI.blue} text="#fff">
            <svg width={40} height={40} viewBox="0 0 24 24">
              <path d="M12 2 l3 4 l5 1 l-3 4 l1 5 l-6-2 l-6 2 l1-5 l-3-4 l5-1 z" fill="#fff" />
            </svg>
            Diamond unlocked
          </Chip>
        </div>
      ) : null}

      <Cursor
        x={cursor.x}
        y={cursor.y}
        frame={frame}
        clicks={[...EB.moneyTabs, EB.moneyTap]}
        rippleColor="rgba(136,204,45,0.9)"
        opacity={ramp(frame, 18, 24) * (1 - wipe)}
      />
      <CircleWipe progress={wipe} x={BADGE.x} y={BADGE.y} />
    </AbsoluteFill>
  );
};
