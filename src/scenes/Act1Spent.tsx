import React from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } from "remotion";
import { NoirLight } from "../components/NoirLight";
import { BEATS } from "../timeline";
import { COLORS } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP, EASE, ramp } from "../lib/anim";
import { shake } from "../lib/noise";
import { useSafeId } from "../lib/ids";
import { SceneProps } from "./types";

const CARD = { w: 700, h: 1000, cx: 540, cy: 830 };

/** Seeded junk digits: real-looking numbers that are always blurred out. */
const blurredAmount = (seed: string, intDigits: number) => {
  const d = (k: number) => Math.floor(random(`${seed}-${k}`) * 10);
  const int = Array.from({ length: intDigits })
    .map((_, i) => d(i))
    .join("");
  const withComma = int.length > 3 ? `${int.slice(0, -3)},${int.slice(-3)}` : int;
  return `${withComma}.${d(10)}${d(11)}`;
};

const ROWS: { label: string; hours?: string; digits: number; minus?: boolean }[] = [
  { label: "REGULAR", hours: "80.00", digits: 4 },
  { label: "OVERTIME", hours: "12.50", digits: 3 },
  { label: "FED TAX", digits: 3, minus: true },
  { label: "STATE TAX", digits: 3, minus: true },
  { label: "SOC SEC", digits: 3, minus: true },
  { label: "HEALTH", digits: 3, minus: true },
];

const Blurred: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 9 }) => (
  <span style={{ filter: `blur(${amount}px)`, display: "inline-block" }}>{children}</span>
);

/**
 * 180–240 · A paycheck stub slides into a hard overhead light. The amounts are
 * blurred out. A red SPENT stamp slams down (SFX @ 200).
 */
export const Act1Spent: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const inkId = useSafeId("stamp-ink");
  const paperId = useSafeId("paper");
  const impact = BEATS.spentImpact;

  // Light snaps on with a fluorescent stutter, buzzes before the glitch out.
  const lightOn = [0.25, 0, 1, 0.6, 1][frame] ?? 1;
  const buzz = frame > duration - 12 && random(`spent-buzz-${frame}`) > 0.6 ? 0.55 : 1;
  const impactFlicker = frame === impact + 1 ? 0.7 : 1;
  const light = lightOn * buzz * impactFlicker;

  // Slide in under the light (noir: slow deceleration).
  const slide = ramp(frame, 1, 17, EASE.noir);
  const cardY = interpolate(slide, [0, 1], [1250, 0]);
  const cardRot = interpolate(slide, [0, 1], [-10, -3]);

  // Stamp falls and accelerates into the paper.
  const fall = ramp(frame, impact - 9, impact, Easing.in(Easing.cubic));
  const stamped = frame >= impact;
  const stampScale = stamped ? 1 : interpolate(fall, [0, 1], [2.6, 1]);
  const stampOpacity = stamped ? 0.93 : interpolate(fall, [0, 0.25, 1], [0, 0.35, 0.93]);
  const stampRot = stamped ? -12 : interpolate(fall, [0, 1], [-24, -12]);

  // Impact: jolt, shake, settle.
  const since = frame - impact;
  const jolt = since >= 0 ? Math.exp(-since / 3) * Math.cos(since * 1.7) : 0;
  const s = shake("spent", frame, since >= 0 ? 16 * Math.exp(-since / 4) : 0, 0.9);
  const push = interpolate(frame, [impact, duration], [1, 1.08], { ...CLAMP, easing: EASE.noir });

  const mono: React.CSSProperties = { fontFamily: FONTS.mono, color: "#1B1813" };

  return (
    <AbsoluteFill style={{ background: COLORS.noir }}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <defs>
          {/* distressed rubber-stamp ink: speckled knock-out + rough edge */}
          <filter id={inkId} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={11} result="speck" />
            <feColorMatrix
              in="speck"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 4.1"
              result="holes"
            />
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={4} result="rough" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="rough"
              scale={7}
              xChannelSelector="R"
              yChannelSelector="G"
              result="edged"
            />
            <feComposite in="edged" in2="holes" operator="in" />
          </filter>
          <filter id={paperId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves={3} seed={3} />
            <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.18  0 0 0 0 0.14  0 0 0 0.09 0" />
          </filter>
        </defs>
      </svg>

      <NoirLight x={540} y={780} radius={640} intensity={light * 2.1} hardness={1} stretch={1.4} />

      <AbsoluteFill
        style={{
          transform: `translate(${s.x}px, ${s.y + jolt * 7}px) rotate(${s.r}deg) scale(${push})`,
          transformOrigin: `${CARD.cx}px ${CARD.cy}px`,
        }}
      >
        {/* hard shadow, thrown down-right by the overhead light */}
        <div
          style={{
            position: "absolute",
            left: CARD.cx - CARD.w / 2 + 34,
            top: CARD.cy - CARD.h / 2 + 46,
            width: CARD.w,
            height: CARD.h,
            background: "#000",
            opacity: 0.8 * light,
            filter: "blur(4px)",
            transform: `translateY(${cardY}px) rotate(${cardRot}deg) skewX(-5deg)`,
          }}
        />
        {/* the stub (and the stamp, which must not be clipped by the paper) */}
        <div
          style={{
            position: "absolute",
            left: CARD.cx - CARD.w / 2,
            top: CARD.cy - CARD.h / 2,
            width: CARD.w,
            height: CARD.h,
            transform: `translateY(${cardY}px) rotate(${cardRot}deg)`,
            filter: `brightness(${0.35 + 0.65 * light})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: COLORS.bone,
              overflow: "hidden",
              padding: "70px 64px 56px",
              boxSizing: "border-box",
              ...mono,
            }}
          >
            <svg width={CARD.w} height={CARD.h} style={{ position: "absolute", inset: 0 }}>
              <rect width={CARD.w} height={CARD.h} filter={`url(#${paperId})`} />
            </svg>
            {/* perforation */}
            <div
              style={{
                position: "absolute",
                left: 24,
                right: 24,
                top: 26,
                borderTop: "4px dotted rgba(27,24,19,0.35)",
              }}
            />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "0.14em" }}>EARNINGS STATEMENT</div>
              <div
                style={{
                  marginTop: 22,
                  fontSize: 24,
                  letterSpacing: "0.06em",
                  opacity: 0.75,
                  lineHeight: 1.6,
                }}
              >
                <div>PERIOD&nbsp;&nbsp;&nbsp;&nbsp;03/01-03/15</div>
                <div>EMPLOYEE&nbsp;&nbsp;#004417</div>
              </div>
              <div style={{ margin: "30px 0 24px", borderTop: "2px dashed rgba(27,24,19,0.45)" }} />
              {ROWS.map((r, i) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    fontSize: 27,
                    lineHeight: 1.95,
                    letterSpacing: "0.04em",
                  }}
                >
                  <span style={{ width: 210 }}>{r.label}</span>
                  <span style={{ width: 120, opacity: 0.7 }}>{r.hours ?? ""}</span>
                  <span style={{ width: 210, textAlign: "right" }}>
                    <Blurred>
                      {r.minus ? "-" : ""}
                      {blurredAmount(`row-${i}`, r.digits - (r.minus ? 1 : 0))}
                    </Blurred>
                  </span>
                </div>
              ))}
              <div style={{ margin: "26px 0 28px", borderTop: "2px dashed rgba(27,24,19,0.45)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "0.1em" }}>NET PAY</span>
                <span style={{ fontSize: 52, fontWeight: 600 }}>
                  <Blurred amount={15}>${blurredAmount("net", 4)}</Blurred>
                </span>
              </div>
              <div
                style={{
                  marginTop: 64,
                  fontSize: 20,
                  letterSpacing: "0.32em",
                  opacity: 0.55,
                  textAlign: "center",
                }}
              >
                NON-NEGOTIABLE
              </div>
            </div>
          </div>

          {/* SPENT */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 560,
              transform: `translate(-50%, -50%) rotate(${stampRot}deg) scale(${stampScale})`,
              opacity: stampOpacity,
              mixBlendMode: "multiply",
              filter: `url(#${inkId})`,
            }}
          >
            <div
              style={{
                border: `9px solid ${COLORS.blood}`,
                padding: 10,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  border: `3px solid ${COLORS.blood}`,
                  borderRadius: 6,
                  padding: "6px 34px 2px",
                  fontFamily: FONTS.sans,
                  fontWeight: 700,
                  fontSize: 150,
                  letterSpacing: "0.1em",
                  lineHeight: 1,
                  color: COLORS.blood,
                  paddingLeft: "calc(34px + 0.1em)",
                }}
              >
                SPENT
              </div>
            </div>
          </div>
        </div>

        {/* paper dust kicked up by the impact */}
        {since >= 0 && since < 14
          ? Array.from({ length: 18 }).map((_, i) => {
              const a = random(`dust-a-${i}`) * Math.PI * 2;
              const v = 18 + random(`dust-v-${i}`) * 30;
              const p = since / 14;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: CARD.cx + Math.cos(a) * (200 + v * since),
                    top: CARD.cy - 270 + Math.sin(a) * (90 + v * since * 0.6),
                    width: 4 + random(`dust-s-${i}`) * 5,
                    height: 4 + random(`dust-s-${i}`) * 5,
                    borderRadius: "50%",
                    background: COLORS.bone,
                    opacity: 0.7 * (1 - p),
                  }}
                />
              );
            })
          : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
