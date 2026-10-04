import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Backdrop, StepLabel } from "../kit";
import { EB } from "../timeline";
import { AppShell, PathNode, StageCard, UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { CLAMP, EASE, ramp } from "../../lib/anim";

export const PHONE_AT = { cx: 540, cy: 1050, scale: 0.9 };
const SCREEN_ORIGIN = {
  x: PHONE_AT.cx - (300 - 14) * PHONE_AT.scale,
  y: PHONE_AT.cy - (620 - 14) * PHONE_AT.scale,
};
/** Path nodes in screen space, bottom → top. */
const NODES = [
  { x: 160, y: 1000 },
  { x: 390, y: 880 },
  { x: 190, y: 760 },
  { x: 400, y: 640 },
  { x: 240, y: 500 },
  { x: 410, y: 330 },
];
const CURRENT = 4;
const CARD_Y = 590; // continue-card top, screen space (before scroll)
const SCROLL = 230;
/** Where the lifted card ends up (the next scene starts from here). */
export const CARD_TARGET = { cx: 540, cy: 900, scale: 1.5, width: 480 };

export const ContinueCardBody: React.FC = () => (
  <>
    <div style={{ color: UI.lime, fontWeight: 900, fontSize: 18, letterSpacing: "0.14em" }}>CONTINUE</div>
    <div style={{ fontWeight: 900, fontSize: 32, marginTop: 6 }}>Make your first ask</div>
    <div style={{ color: UI.muted, fontWeight: 700, fontSize: 21, marginTop: 6 }}>
      One priced message to one person
    </div>
  </>
);

/** 120–300 · 01 Follow the path: nodes check off, the current stage lights up, its card lifts out. */
export const X2Path: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - EB.pathPhone, fps, config: { damping: 15, stiffness: 110 } });
  const scroll = interpolate(frame, [EB.pathChecks[0], EB.pathCurrent], [0, SCROLL], {
    ...CLAMP,
    easing: EASE.uiInOut,
  });
  const lift = ramp(frame, EB.pathCardOut, duration - 4, EASE.whip);
  const cardIn = spring({
    frame: frame - (EB.pathCurrent + 8),
    fps,
    config: { damping: 14, stiffness: 170 },
  });
  const glow = 0.5 + 0.5 * Math.sin((frame - EB.pathCurrent) / 4);

  // continue card: screen → absolute
  const cardScreen = { x: 46, y: CARD_Y + scroll };
  const from = {
    x: SCREEN_ORIGIN.x + cardScreen.x * PHONE_AT.scale,
    y: SCREEN_ORIGIN.y + cardScreen.y * PHONE_AT.scale,
    s: PHONE_AT.scale,
  };
  const to = {
    x: CARD_TARGET.cx - (CARD_TARGET.width * CARD_TARGET.scale) / 2,
    y: CARD_TARGET.cy - 120,
    s: CARD_TARGET.scale,
  };
  const cx = from.x + (to.x - from.x) * lift;
  const cy = from.y + (to.y - from.y) * lift - Math.sin(lift * Math.PI) * 120;
  const cs = from.s + (to.s - from.s) * lift;
  const shrink = 1 - lift * 0.08;

  // wipe-in: the lime circle from the hook shrinks into the step badge
  const wipe = 1 - ramp(frame, 0, 12, EASE.whip);

  return (
    <AbsoluteFill>
      <Backdrop />
      <StepLabel n="01" title="Follow the path" at={6} />

      <div
        style={{
          position: "absolute",
          left: PHONE_AT.cx - 300,
          top: PHONE_AT.cy - 620,
          transform: `translateY(${(1 - enter) * 1300}px) scale(${PHONE_AT.scale * shrink}) rotate(${(1 - enter) * 8}deg)`,
          opacity: 1 - lift * 0.5,
        }}
      >
        <PhoneFrame screenBackground={UI.bg}>
          <AppShell title="Journey" tab="Journey">
            <div
              style={{ position: "absolute", left: 0, right: 0, top: 280, bottom: 140, overflow: "hidden" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: -280,
                  height: 1400,
                  transform: `translateY(${scroll}px)`,
                }}
              >
                <svg width={572} height={1400} style={{ position: "absolute", inset: 0 }}>
                  <path
                    d={`M ${NODES.map((n) => `${n.x} ${n.y}`).join(" L ")}`}
                    fill="none"
                    stroke={UI.line}
                    strokeWidth={8}
                    strokeDasharray="4 18"
                    strokeLinecap="round"
                  />
                </svg>
                {NODES.map((n, i) => {
                  const doneAt = EB.pathChecks[i];
                  const done = doneAt !== undefined && frame >= doneAt;
                  const current = i === CURRENT && frame >= EB.pathCurrent;
                  const at = current ? EB.pathCurrent : (doneAt ?? 0);
                  const pop = spring({ frame: frame - at, fps, config: { damping: 9, stiffness: 220 } });
                  return (
                    <PathNode
                      key={i}
                      x={n.x}
                      y={n.y}
                      state={current ? 2 : done ? 1 : 0}
                      pop={done || current ? pop : 1}
                      glow={current ? glow : 0}
                    />
                  );
                })}
                {lift <= 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 46,
                      top: CARD_Y,
                      width: 480,
                      transform: `translateY(${(1 - cardIn) * 40}px)`,
                      opacity: frame >= EB.pathCurrent + 8 ? cardIn : 0,
                      background: UI.card,
                      borderRadius: 24,
                      border: `2px solid ${UI.line}`,
                      padding: "22px 26px",
                      boxSizing: "border-box",
                      fontFamily: PFONTS.app,
                      color: "#fff",
                    }}
                  >
                    <ContinueCardBody />
                  </div>
                ) : null}
              </div>
            </div>
          </AppShell>
        </PhoneFrame>
      </div>

      {lift > 0 ? (
        <div
          style={{
            position: "absolute",
            left: cx,
            top: cy,
            transformOrigin: "0 0",
            transform: `scale(${cs})`,
          }}
        >
          <StageCard
            label="STAGE 1 · 3 STEPS"
            title="Make your first ask"
            sub="One priced message to one person"
            width={480}
            style={{ boxShadow: `0 30px 60px -20px rgba(0,0,0,0.7), 0 0 ${lift * 50}px ${UI.blue}55` }}
          />
        </div>
      ) : null}

      {wipe > 0 ? (
        <AbsoluteFill style={{ background: UI.lime, clipPath: `circle(${wipe * 2300}px at 194px 184px)` }} />
      ) : null}
    </AbsoluteFill>
  );
};
