import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CircleCheck } from "../../components/Checkmark";
import { Confetti } from "../../promo/components/Confetti";
import { Backdrop, Chip, StepLabel } from "../kit";
import { EB } from "../timeline";
import { StageCard, UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { EASE, ramp } from "../../lib/anim";
import { CARD_TARGET } from "./X2Path";

const STEPS = ["Pick one person", "Write a priced offer", "Hit send"];
const CARD = { x: CARD_TARGET.cx - (CARD_TARGET.width * CARD_TARGET.scale) / 2, y: CARD_TARGET.cy - 120 };

const Flame: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size * 0.75} height={size} viewBox="0 0 12 16">
    <path
      d="M6 0 C7 4 12 6 12 10 A6 6 0 0 1 0 10 C0 7 2 6 3 4 C3.5 6 4.5 7 5.5 7 C5.5 4.5 5 2 6 0 Z"
      fill="#0E1119"
    />
  </svg>
);

/** 300–450 · 02 Do the next move: the lifted card becomes a checklist, steps tick, stage clears. */
export const X3Move: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const grow = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 140 } });
  const done = frame >= EB.moveDone;
  const stamp = spring({ frame: frame - EB.moveDone, fps, config: { damping: 8, stiffness: 220 } });
  const streak = spring({ frame: frame - EB.moveDone - 8, fps, config: { damping: 10, stiffness: 200 } });
  const exit = ramp(frame, duration - 12, duration, EASE.whip);
  const ticked = EB.moveSteps.filter((s) => frame >= s).length;

  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ transform: `translateX(${-exit * 1150}px)` }}>
        <StepLabel n="02" title="Do the next move" at={2} />

        <div
          style={{
            position: "absolute",
            left: CARD.x,
            top: CARD.y,
            transformOrigin: "0 0",
            transform: `scale(${CARD_TARGET.scale})`,
          }}
        >
          <StageCard
            label={done ? "STAGE 1 · CLEARED" : "STAGE 1 · 3 STEPS"}
            title="Make your first ask"
            sub="One priced message to one person"
            width={CARD_TARGET.width}
            style={{
              borderLeftColor: done ? UI.lime : UI.blue,
              boxShadow: `0 30px 60px -20px rgba(0,0,0,0.7), 0 0 ${done ? 60 : 30}px ${done ? UI.lime : UI.blue}44`,
            }}
          >
            <div style={{ overflow: "hidden", maxHeight: grow * 320 }}>
              <div style={{ display: "flex", gap: 6, margin: "20px 0 8px" }}>
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 4,
                      background: i < ticked ? UI.lime : UI.line,
                    }}
                  />
                ))}
              </div>
              {STEPS.map((label, i) => {
                const at = EB.moveSteps[i];
                const t = ramp(frame, at, at + 6, EASE.ui);
                const f = spring({ frame: frame - at, fps, config: { damping: 9, stiffness: 240 } });
                return (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "14px 0",
                      borderTop: i ? `2px solid ${UI.line}` : undefined,
                    }}
                  >
                    <div style={{ position: "relative", width: 40, height: 40 }}>
                      <svg
                        width={40}
                        height={40}
                        viewBox="0 0 100 100"
                        style={{ position: "absolute", inset: 0 }}
                      >
                        <circle cx={50} cy={50} r={44} fill="none" stroke={UI.line} strokeWidth={8} />
                      </svg>
                      <CircleCheck
                        size={40}
                        ring={0}
                        fill={frame >= at ? f : 0}
                        check={t}
                        color={UI.lime}
                        checkColor="#0E1119"
                        style={{ position: "absolute", inset: 0 }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: PFONTS.app,
                        fontWeight: 800,
                        fontSize: 25,
                        color: frame >= at ? "#fff" : UI.muted,
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </StageCard>
          {done ? (
            <div
              style={{
                position: "absolute",
                right: -18,
                top: -30,
                transform: `scale(${stamp}) rotate(${8 - (1 - stamp) * 30}deg)`,
                background: UI.lime,
                color: "#0E1119",
                fontFamily: PFONTS.app,
                fontWeight: 900,
                fontSize: 20,
                letterSpacing: "0.08em",
                padding: "10px 16px",
                borderRadius: 14,
                boxShadow: "0 10px 20px -6px rgba(0,0,0,0.5)",
              }}
            >
              CLEARED
            </div>
          ) : null}
        </div>

        {/* XP chips float up from the card */}
        {EB.moveSteps.map((s) => {
          const t = frame - s;
          if (t < 0 || t > 24) return null;
          const p = spring({ frame: t, fps, config: { damping: 10, stiffness: 220 } });
          return (
            <div
              key={s}
              style={{
                position: "absolute",
                left: 600,
                top: CARD.y - 40 - t * 5,
                transform: `scale(${p})`,
                opacity: t > 18 ? 1 - (t - 18) / 6 : 1,
              }}
            >
              <Chip color={UI.gold}>+50 XP</Chip>
            </div>
          );
        })}

        {done ? (
          <div
            style={{
              position: "absolute",
              left: 140,
              right: 140,
              top: 1500,
              display: "flex",
              justifyContent: "center",
              transform: `scale(${streak})`,
            }}
          >
            <Chip color={UI.lime}>
              <Flame size={38} /> Streak 1
            </Chip>
          </div>
        ) : null}
        <Confetti t={frame - EB.moveDone} x={540} y={CARD.y + 100} count={90} power={0.75} seed="move-done" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
