import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Cursor, cursorAt } from "../../components/Cursor";
import { Backdrop, StepLabel } from "../kit";
import { EB } from "../timeline";
import { AppShell, Field, Glyph, ListRow, UI } from "../ui";
import { PFONTS } from "../../promo/fonts";
import { CLAMP, EASE, ramp } from "../../lib/anim";
import { PHONE_AT } from "./X2Path";

const S = PHONE_AT.scale;
const ORIGIN = { x: PHONE_AT.cx - (300 - 14) * S, y: PHONE_AT.cy - (620 - 14) * S };
const abs = (x: number, y: number) => ({ x: ORIGIN.x + x * S, y: ORIGIN.y + y * S });

const CARD = { x: 22, y: 330, w: 528, h: 410 };
const SAVE = { x: CARD.x + 370, y: CARD.y + 212, w: 134, h: 74 };
const ASK = { x: CARD.x + 24, y: CARD.y + 306, w: 480, h: 68 };
const NAME = "Dana";
const MESSAGE = "Hey Dana, loved working with you. Want to book round two?";

/** 450–630 · 03 Turn clients into regulars: save who paid, tap Ask for a repeat, message goes out. */
export const X4Regulars: React.FC<{ duration: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const push = interpolate(frame, [0, 12], [1, 0], { ...CLAMP, easing: EASE.whip });
  const typed = Math.floor(interpolate(frame, [EB.regType, EB.regType + 12], [0, NAME.length], CLAMP));
  const saved = frame >= EB.regSave + 2;
  const savePress = interpolate(frame, [EB.regSave - 1, EB.regSave, EB.regSave + 4], [0, 1, 0], CLAMP);
  const askPress = interpolate(frame, [EB.regTap - 1, EB.regTap, EB.regTap + 4], [0, 1, 0], CLAMP);
  const bubble = spring({ frame: frame - (EB.regTap + 4), fps, config: { damping: 14, stiffness: 150 } });
  const streamed = Math.floor(
    interpolate(frame, [EB.regTap + 8, EB.regSent - 4], [0, MESSAGE.length], CLAMP),
  );
  const sent = spring({ frame: frame - EB.regSent, fps, config: { damping: 9, stiffness: 220 } });
  const rows = (i: number) =>
    spring({ frame: frame - (14 + i * 4), fps, config: { damping: 14, stiffness: 180 } });

  const saveAbs = abs(SAVE.x + SAVE.w / 2, SAVE.y + SAVE.h / 2);
  const askAbs = abs(ASK.x + ASK.w / 2, ASK.y + ASK.h / 2);
  const fieldAbs = abs(CARD.x + 180, SAVE.y + 37);
  const cursor = cursorAt(frame, fps, [
    { f: 18, x: 980, y: 1500 },
    { f: EB.regType - 6, x: fieldAbs.x, y: fieldAbs.y + 10 },
    { f: EB.regSave - 6, x: saveAbs.x, y: saveAbs.y + 6 },
    { f: EB.regTap - 8, x: askAbs.x + 40, y: askAbs.y + 6 },
    { f: EB.regTap + 14, x: askAbs.x + 40, y: askAbs.y + 6 },
    { f: EB.regTap + 34, x: 880, y: 1560 },
  ]);

  return (
    <AbsoluteFill>
      <Backdrop hue={UI.gold} />
      <AbsoluteFill style={{ transform: `translateX(${push * 1150}px)` }}>
        <StepLabel n="03" title="Turn clients into regulars" at={8} color={UI.gold} />
        <div
          style={{
            position: "absolute",
            left: PHONE_AT.cx - 300,
            top: PHONE_AT.cy - 620,
            transform: `scale(${S})`,
          }}
        >
          <PhoneFrame screenBackground={UI.bg}>
            <AppShell title="Jobs" tab="Jobs" streak={1} today="1/3 today">
              <div
                style={{
                  position: "absolute",
                  left: 30,
                  top: 286,
                  fontFamily: PFONTS.app,
                  fontWeight: 900,
                  fontSize: 26,
                }}
              >
                Your next job
              </div>
              <div
                style={{
                  position: "absolute",
                  left: CARD.x,
                  top: CARD.y,
                  width: CARD.w,
                  height: CARD.h,
                  borderRadius: 28,
                  border: `3px solid ${UI.gold}`,
                  boxShadow: `0 0 30px ${UI.gold}33`,
                  fontFamily: PFONTS.app,
                  color: "#fff",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 22,
                    top: -18,
                    background: UI.gold,
                    color: "#0E1119",
                    fontWeight: 900,
                    fontSize: 18,
                    letterSpacing: "0.08em",
                    padding: "6px 12px",
                    borderRadius: 8,
                  }}
                >
                  LAST PAYER
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    right: 24,
                    top: 40,
                    fontWeight: 900,
                    fontSize: 36,
                    lineHeight: 1.12,
                  }}
                >
                  Who paid you on <span style={{ color: UI.lime }}>Oct 2</span>?
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 24,
                    right: 24,
                    top: 130,
                    fontWeight: 700,
                    fontSize: 22,
                    color: "#C9CFDB",
                    lineHeight: 1.35,
                  }}
                >
                  Name them once and Jobs greets them by name.
                </div>
                <Field
                  value={NAME.slice(0, typed)}
                  placeholder="Their name"
                  caret={frame >= EB.regType - 4 && frame < EB.regSave}
                  style={{ position: "absolute", left: 24, top: 212, width: 330 }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 370,
                    top: 212,
                    width: SAVE.w,
                    height: SAVE.h,
                    borderRadius: 20,
                    border: `2px solid ${saved ? UI.lime : UI.line}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 24,
                    color: saved ? UI.lime : "#fff",
                    transform: `scale(${1 - savePress * 0.06})`,
                  }}
                >
                  {saved ? "Saved ✓" : "Save"}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: ASK.x - CARD.x,
                    top: ASK.y - CARD.y,
                    width: ASK.w,
                    height: ASK.h,
                    borderRadius: 34,
                    background: UI.lime,
                    boxShadow: `0 ${6 - askPress * 5}px 0 #5E9A16`,
                    transform: `translateY(${askPress * 5}px)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 24,
                    letterSpacing: "0.1em",
                    color: "#0E1119",
                  }}
                >
                  ASK FOR A REPEAT
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 22,
                  right: 22,
                  top: 770,
                  borderRadius: 28,
                  border: `2px solid ${UI.line}`,
                  overflow: "hidden",
                }}
              >
                {[
                  { label: "Next client", c: "#FF5C8A", g: "map" as const },
                  { label: "Boards", c: UI.blue, g: "case" as const },
                  { label: "Live postings", c: UI.gold, g: "bolt" as const },
                ].map((r, i) => (
                  <div
                    key={r.label}
                    style={{ transform: `translateX(${(1 - rows(i)) * 300}px)`, opacity: rows(i) }}
                  >
                    <ListRow
                      label={r.label}
                      color={r.c}
                      glyph={<Glyph kind={r.g} color={r.c} />}
                      last={i === 2}
                    />
                  </div>
                ))}
              </div>
            </AppShell>
          </PhoneFrame>
        </div>

        {/* the repeat ask, flying out of the phone */}
        {frame >= EB.regTap + 4 ? (
          <div
            style={{
              position: "absolute",
              left: 150 + (1 - bubble) * (askAbs.x - 150 - 200),
              top: 1270 + (1 - bubble) * (askAbs.y - 1270),
              width: 640,
              transform: `scale(${0.4 + 0.6 * bubble})`,
              transformOrigin: "50% 0",
              opacity: Math.min(1, bubble * 2),
            }}
          >
            <div
              style={{
                background: UI.lime,
                color: "#0E1119",
                borderRadius: "34px 34px 34px 10px",
                padding: "24px 30px",
                fontFamily: PFONTS.app,
                fontWeight: 800,
                fontSize: 32,
                lineHeight: 1.3,
                boxShadow: "0 24px 50px -16px rgba(0,0,0,0.6)",
                minHeight: 128,
                boxSizing: "border-box",
              }}
            >
              {MESSAGE.slice(0, streamed)}
            </div>
            {frame >= EB.regSent ? (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                  transform: `scale(${sent})`,
                  transformOrigin: "100% 0",
                }}
              >
                <span style={{ fontFamily: PFONTS.app, fontWeight: 900, fontSize: 26, color: UI.lime }}>
                  Sent ✓
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <Cursor
          x={cursor.x}
          y={cursor.y}
          frame={frame}
          clicks={[EB.regSave, EB.regTap]}
          rippleColor="rgba(136,204,45,0.9)"
          opacity={ramp(frame, 16, 22)}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
