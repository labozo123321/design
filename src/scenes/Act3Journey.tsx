import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PHONE, PhoneFrame } from "../components/PhoneFrame";
import { SoftBackdrop } from "../components/SoftBackdrop";
import { TextColumn } from "../components/Type";
import { COLORS, FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp, SPRING } from "../lib/anim";
import { useSafeId } from "../lib/ids";
import { Pt, smoothPath } from "../lib/paths";
import { LookNoFurtherLine } from "./Act3LookNoFurther";
import { SceneProps } from "./types";

/* ---------- layout ---------- */
const PHONE_POS = { cx: 540, cy: 860 };
const SCREEN = { w: PHONE.w - PHONE.bezel * 2, h: PHONE.h - PHONE.bezel * 2 };
const NODES: Pt[] = Array.from({ length: 10 }).map((_, k) => ({
  x: Math.round(SCREEN.w / 2 + 150 * Math.sin(k * 0.9 + 0.4)),
  y: 1000 - k * 77,
}));
const LABELS: Record<number, string> = {
  0: "Setup",
  2: "Portfolio",
  4: "First client",
  6: "First $100",
  9: "$1,000",
};
const PATH = smoothPath(NODES);
const LIGHT_AT = [22, 28, 34, 40, 46];
const CURRENT = LIGHT_AT.length - 1;
const CTA_AT = 52;
const ZOOM_START = 65;

/** Phone CTA, in screen coordinates. The next scene picks it up at 1.6× scale. */
export const PHONE_CTA = { w: 450, h: 82, cy: 1121 } as const;
export const CTA_ZOOM = 1.6;
export const CTA_TARGET_Y = 600;
const CTA_ABS_Y = PHONE_POS.cy - PHONE.h / 2 + PHONE.bezel + PHONE_CTA.cy;

/** The outreach button, shared with the next scene. */
export const OutreachButton: React.FC<{
  scale?: number;
  pressed?: number;
  glow?: number;
  label?: string;
}> = ({ scale = 1, pressed = 0, glow = 0, label = "Write my outreach" }) => (
  <div
    style={{
      width: PHONE_CTA.w * scale,
      height: PHONE_CTA.h * scale,
      borderRadius: (PHONE_CTA.h * scale) / 2,
      background: `linear-gradient(180deg, #27A06B 0%, ${COLORS.emerald} 55%, ${COLORS.emeraldDeep} 100%)`,
      boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.28), 0 0 0 1.5px rgba(200,161,90,0.55), 0 ${18 * scale}px ${
        40 * scale
      }px -${14 * scale}px rgba(31,138,91,${0.6 + glow * 0.4}), 0 0 ${60 * glow * scale}px rgba(31,138,91,${glow * 0.7})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14 * scale,
      transform: `scale(${1 - pressed * 0.05})`,
      fontFamily: FONTS.sans,
      fontWeight: 600,
      fontSize: 28 * scale,
      letterSpacing: "-0.01em",
      color: "#F6F3EC",
    }}
  >
    <svg width={26 * scale} height={26 * scale} viewBox="0 0 24 24">
      <path d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z" fill={COLORS.goldLight} />
    </svg>
    {label}
  </div>
);

const StatusBar: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 30,
      height: 40,
      padding: "0 46px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontFamily: FONTS.sans,
      fontWeight: 600,
      fontSize: 25,
      color: "#F4F1EA",
    }}
  >
    <span>9:41</span>
    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <svg width={30} height={20} viewBox="0 0 30 20">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 8} y={14 - i * 4} width={5.5} height={6 + i * 4} rx={1.5} fill="#F4F1EA" />
        ))}
      </svg>
      <svg width={44} height={22} viewBox="0 0 44 22">
        <rect
          x={1}
          y={1}
          width={36}
          height={20}
          rx={6}
          fill="none"
          stroke="rgba(244,241,234,0.5)"
          strokeWidth={2}
        />
        <rect x={4} y={4} width={26} height={14} rx={3.5} fill="#F4F1EA" />
        <rect x={39} y={7} width={3} height={8} rx={1.5} fill="rgba(244,241,234,0.5)" />
      </svg>
    </span>
  </div>
);

const Check: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F6F3EC"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 12.5 L10.2 16.5 L18 8" />
  </svg>
);

/**
 * 660–735 · 3D perspective tilt-in: the phone rises and eases flat. Inside, a
 * 10-stage journey lights up node by node from the bottom (emerald = done,
 * gold = current). Ends by zooming into the outreach button.
 */
export const Act3Journey: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const lineId = useSafeId("journey-line");
  const { fps } = useVideoConfig();

  const tilt = spring({ frame, fps, config: SPRING.tilt });
  const exitText = ramp(frame, 0, 11, EASE.ui);
  const zoom = ramp(frame, ZOOM_START, duration - 1, EASE.whip);
  const fadeOthers = 1 - ramp(zoom, 0, 0.55);

  const lit = LIGHT_AT.filter((t) => frame >= t).length;
  const current = lit - 1;
  const lastLight = LIGHT_AT[Math.max(0, current)];
  const lineTo = (k: number) => (k <= 0 ? 0 : PATH.cum[k] / PATH.total);
  const lineProgress =
    current < 0
      ? 0
      : interpolate(frame, [lastLight - 1, lastLight + 4], [lineTo(current - 1), lineTo(current)], {
          ...CLAMP,
          easing: EASE.uiInOut,
        });
  const ctaIn = spring({ frame: frame - CTA_AT, fps, config: SPRING.snappy });
  const pulse = 0.5 + 0.5 * Math.sin((frame - LIGHT_AT[CURRENT]) / 3.2);

  const completedPills = Math.max(0, current);

  return (
    <AbsoluteFill>
      <SoftBackdrop tone="dark" />

      {/* "Look no further." gets pushed up and out by the phone */}
      {exitText < 1 ? (
        <TextColumn
          y={FOCUS_Y}
          style={{
            transform: `translateY(calc(-50% - ${exitText * 320}px)) scale(${1 - exitText * 0.08})`,
            opacity: 1 - exitText,
            filter: `blur(${exitText * 8}px)`,
          }}
        >
          <LookNoFurtherLine period={1} frame={frame} />
        </TextColumn>
      ) : null}

      {/* zoom-through wrapper (origin = the CTA) */}
      <div
        style={{
          position: "absolute",
          left: PHONE_POS.cx - PHONE.w / 2,
          top: PHONE_POS.cy - PHONE.h / 2,
          width: PHONE.w,
          height: PHONE.h,
          transformOrigin: `${PHONE.w / 2}px ${PHONE.bezel + PHONE_CTA.cy}px`,
          transform: `translateY(${(CTA_TARGET_Y - CTA_ABS_Y) * zoom}px) scale(${1 + (CTA_ZOOM - 1) * zoom})`,
        }}
      >
        {/* 3D tilt-in wrapper */}
        <div
          style={{
            width: "100%",
            height: "100%",
            transformOrigin: "50% 100%",
            transform: `perspective(2400px) translateY(${(1 - tilt) * 1150}px) rotateX(${(1 - tilt) * 62}deg) rotateZ(${
              (1 - tilt) * -9
            }deg) scale(${0.86 + 0.14 * tilt})`,
          }}
        >
          <PhoneFrame hardware={fadeOthers} screenBackground={`rgba(10,18,34,${fadeOthers})`}>
            <div style={{ position: "absolute", inset: 0, opacity: fadeOthers }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse 80% 50% at 50% 70%, rgba(31,138,91,0.16), rgba(0,0,0,0) 70%), linear-gradient(180deg, #0E1A33 0%, #0A1222 60%, #08101E 100%)",
                }}
              />
              <StatusBar />
              {/* header */}
              <div style={{ position: "absolute", left: 40, right: 40, top: 104, fontFamily: FONTS.sans }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.gold, letterSpacing: "0.02em" }}>
                  Your path
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 46,
                    fontWeight: 600,
                    color: "#F4F1EA",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Stage {Math.max(1, lit)} of 10
                </div>
                <div style={{ marginTop: 22, display: "flex", gap: 6 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 4,
                        background:
                          i < completedPills
                            ? COLORS.emerald
                            : i === current
                              ? COLORS.gold
                              : "rgba(244,241,234,0.12)",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* journey path */}
              <svg width={SCREEN.w} height={SCREEN.h} style={{ position: "absolute", inset: 0 }}>
                <defs>
                  <linearGradient id={lineId} x1={0} y1={1000} x2={0} y2={640} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={COLORS.emerald} />
                    <stop offset="100%" stopColor={COLORS.gold} />
                  </linearGradient>
                </defs>
                <path
                  d={PATH.d}
                  fill="none"
                  stroke="rgba(244,241,234,0.12)"
                  strokeWidth={6}
                  strokeDasharray="2 14"
                  strokeLinecap="round"
                />
                <path
                  d={PATH.d}
                  fill="none"
                  stroke={`url(#${lineId})`}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeDasharray={PATH.total}
                  strokeDashoffset={PATH.total * (1 - lineProgress)}
                />
                {NODES.map((n, k) => {
                  const done = k < current;
                  const isCurrent = k === current;
                  const t = LIGHT_AT[k];
                  const pop = t !== undefined ? spring({ frame: frame - t, fps, config: SPRING.pop }) : 0;
                  const burst = t !== undefined ? ramp(frame, t, t + 12, EASE.ui) : 0;
                  const r = LABELS[k] ? 26 : 21;
                  const active = done || isCurrent;
                  const fill = isCurrent ? COLORS.gold : done ? COLORS.emerald : "#101B30";
                  return (
                    <g key={k}>
                      {active && burst > 0 && burst < 1 ? (
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={r * (1 + burst * 1.6)}
                          fill="none"
                          stroke={isCurrent ? COLORS.gold : COLORS.emerald}
                          strokeWidth={3}
                          opacity={1 - burst}
                        />
                      ) : null}
                      {isCurrent ? (
                        <circle cx={n.x} cy={n.y} r={r + 10 + pulse * 6} fill="rgba(200,161,90,0.18)" />
                      ) : null}
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r * (active ? 0.6 + 0.4 * pop : 1)}
                        fill={fill}
                        stroke={active ? "rgba(255,255,255,0.25)" : "rgba(244,241,234,0.22)"}
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}
              </svg>
              {/* node glyphs + labels (HTML for crisp type) */}
              {NODES.map((n, k) => {
                const done = k < current;
                const isCurrent = k === current;
                const label = LABELS[k];
                const right = n.x < SCREEN.w / 2;
                return (
                  <React.Fragment key={k}>
                    <div
                      style={{
                        position: "absolute",
                        left: n.x - 20,
                        top: n.y - 20,
                        width: 40,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: FONTS.sans,
                        fontWeight: 600,
                        fontSize: 19,
                        color: isCurrent ? "#0A1222" : "rgba(244,241,234,0.45)",
                      }}
                    >
                      {done ? <Check size={26} /> : k + 1}
                    </div>
                    {label ? (
                      <div
                        style={{
                          position: "absolute",
                          top: n.y - 18,
                          ...(right ? { left: n.x + 44 } : { right: SCREEN.w - n.x + 44 }),
                          fontFamily: FONTS.sans,
                          fontWeight: isCurrent ? 600 : 500,
                          fontSize: 28,
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                          color: isCurrent
                            ? COLORS.gold
                            : done
                              ? "rgba(244,241,234,0.9)"
                              : "rgba(244,241,234,0.4)",
                        }}
                      >
                        {label}
                      </div>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {/* home indicator */}
              <div
                style={{
                  position: "absolute",
                  left: SCREEN.w / 2 - 80,
                  bottom: 14,
                  width: 160,
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(244,241,234,0.5)",
                }}
              />
            </div>
            {/* CTA survives the zoom-through */}
            <div
              style={{
                position: "absolute",
                left: (SCREEN.w - PHONE_CTA.w) / 2,
                top: PHONE_CTA.cy - PHONE_CTA.h / 2,
                opacity: Math.min(1, ctaIn * 1.5),
                transform: `translateY(${(1 - ctaIn) * 60}px)`,
              }}
            >
              <OutreachButton />
            </div>
          </PhoneFrame>
        </div>
      </div>
    </AbsoluteFill>
  );
};
