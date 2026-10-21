import React from "react";
import { clamp, smoother } from "../script";
import { F } from "./fonts";
import { CHAT } from "./hud";
import type { ChatBubble } from "./hud";
import { Heart, NoraAvatar, Popper } from "./Art";

/**
 * The chat card of b7 (42.3-47.3): 860 x 620 px centred at y = 980, dark frosted glass with a 28 px radius and
 * a 24 px backdrop blur. A header with Nora's avatar (her at 9, braids and the yellow clip) and 'Nora (bossy)';
 * one exchange at a time, centred in the thread (each new bubble eases the exchange up to make room), each
 * screen scrolling away for the next; your heart tapback lands on 'hbd' at 46.6. Generic styling: no app
 * chrome, no read receipts, no typing dots.
 */

export const CHAT_CARD = { x: 110, y: 670, w: 860, h: 620, r: 28 };
const C = CHAT_CARD;
const HEADER = 104;
const INPUT = 92;
const BODY = C.h - HEADER - INPUT;
const PAD_X = 46; // your bubbles end at x = 924, clear of the right icon rail
const SEP_H = 24;
const SEP_GAP = 18;
const LINE_H = 42;
const BUB_PAD_T = 16;
const BUB_PAD_B = 18;
const GAP = 14;
/** where the exchange is centred in the thread area (0 top, 1 bottom) */
const CENTRE = 0.5;
const NORA_BUBBLE = "#2E4766";
const YOUR_BUBBLE = "#6B4A24";
const ARRIVE = 0.22;
const SCROLL = 0.45;

/** explicit line breaks: the first bubble's line ends on the exclamation marks, the poppers start line two */
const LINES: Record<string, string[]> = {
  "HAPPY BIRTHDAY LITTLE BRO!!! 🎉🎉 come visit!!": ["HAPPY BIRTHDAY LITTLE BRO!!!", "🎉🎉 come visit!!"],
};
const linesOf = (b: ChatBubble) => LINES[b.text] ?? [b.text];
const bubbleH = (b: ChatBubble) => linesOf(b).length * LINE_H + BUB_PAD_T + BUB_PAD_B;

/** a line of bubble text, with drawn poppers in place of the emoji */
const TextLine: React.FC<{ s: string }> = ({ s }) => {
  const parts = s.split("🎉");
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(<Popper key={`p${i}`} size={40} seed={i} />);
    if (p) out.push(<span key={`s${i}`}>{p}</span>);
  });
  return <div style={{ height: LINE_H, whiteSpace: "pre" }}>{out}</div>;
};

const Bubble: React.FC<{ b: ChatBubble; t: number; tapback?: number }> = ({ b, t, tapback }) => {
  const k = clamp((t - b.t) / ARRIVE);
  const nora = b.from === "N";
  const a = smoother(Math.min(1, k * 1.6));
  const s = 0.9 + 0.1 * smoother(k);
  let badge: React.ReactNode = null;
  if (tapback !== undefined && t >= tapback) {
    const u = (t - tapback) / 0.34;
    const sc = u < 0.6 ? 1.22 * smoother(u / 0.6) : 1.22 - 0.22 * smoother((u - 0.6) / 0.4);
    badge = (
      <div
        style={{
          position: "absolute",
          right: -22,
          top: -24,
          width: 46,
          height: 46,
          borderRadius: 23,
          boxSizing: "border-box",
          background: YOUR_BUBBLE,
          border: "3px solid #1A1E25",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${sc.toFixed(4)})`,
          opacity: clamp(u * 5),
          boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        }}
      >
        <Heart size={24} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: nora ? "flex-start" : "flex-end", height: bubbleH(b) }}>
      <div
        style={{
          position: "relative",
          boxSizing: "border-box",
          height: bubbleH(b),
          padding: `${BUB_PAD_T}px 26px ${BUB_PAD_B}px`,
          borderRadius: nora ? "30px 30px 30px 8px" : "30px 30px 8px 30px",
          background: nora ? NORA_BUBBLE : YOUR_BUBBLE,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          color: "#FFFFFF",
          fontFamily: F.ui,
          fontWeight: 400,
          fontSize: 34,
          lineHeight: `${LINE_H}px`,
          opacity: a,
          transform: `scale(${s.toFixed(4)})`,
          transformOrigin: nora ? "0% 100%" : "100% 100%",
        }}
      >
        {linesOf(b).map((l, i) => (
          <TextLine key={i} s={l} />
        ))}
        {badge}
      </div>
    </div>
  );
};

export const Chat: React.FC<{ t: number }> = ({ t }) => {
  if (t < CHAT.t0 || t > CHAT.t1 + 0.05) return null;
  const inK = smoother((t - CHAT.t0) / 0.4);
  const outK = smoother((t - (CHAT.t1 - 0.33)) / 0.33);
  const alpha = inK * (1 - outK);
  if (alpha <= 0.001) return null;
  const y = 70 * (1 - inK) + 60 * outK;
  // the continuous screen index: each later screen scrolls the last one away
  const S = CHAT.screens.slice(1).reduce((acc, s) => acc + smoother((t - s.t0) / SCROLL), 0);
  return (
    <div
      style={{
        position: "absolute",
        left: C.x,
        top: C.y,
        width: C.w,
        height: C.h,
        borderRadius: C.r,
        overflow: "hidden",
        background: "rgba(20,24,30,0.72)",
        backdropFilter: "blur(24px) saturate(1.15)",
        WebkitBackdropFilter: "blur(24px) saturate(1.15)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
        boxSizing: "border-box",
        opacity: alpha,
        transform: `translateY(${y.toFixed(2)}px) scale(${(0.985 + 0.015 * inK).toFixed(4)})`,
      }}
    >
      {/* header */}
      <div style={{ position: "absolute", left: 0, top: 0, width: C.w, height: HEADER, borderBottom: "1px solid rgba(255,255,255,0.08)", boxSizing: "border-box" }}>
        <div style={{ position: "absolute", left: 32, top: 23, width: 56, height: 56, borderRadius: 28, overflow: "hidden", boxShadow: "0 0 0 2px rgba(255,255,255,0.12)" }}>
          <NoraAvatar size={56} />
        </div>
        <div style={{ position: "absolute", left: 106, top: 0, height: HEADER, lineHeight: `${HEADER}px`, fontFamily: F.ui, fontWeight: 600, fontSize: 30, color: "#FFFFFF", letterSpacing: "-0.005em" }}>
          {CHAT.name}
        </div>
      </div>
      {/* the thread */}
      <div style={{ position: "absolute", left: 0, top: HEADER, width: C.w, height: BODY, overflow: "hidden" }}>
        {CHAT.screens.map((sc, si) => {
          const scrollY = (si - S) * BODY;
          if (Math.abs(scrollY) >= BODY) return null;
          // the exchange sits centred in the thread; each arriving bubble eases the column up by half its height
          const full = SEP_H + (SEP_GAP - GAP) + sc.bubbles.reduce((acc, b) => acc + bubbleH(b) + GAP, 0);
          const pending = sc.bubbles.reduce((acc, b) => acc + (bubbleH(b) + GAP) * (1 - smoother(clamp((t - b.t) / ARRIVE))), 0);
          const top = BODY * CENTRE - (full - pending) / 2;
          return (
            <div
              key={si}
              style={{
                position: "absolute",
                left: PAD_X,
                width: C.w - 2 * PAD_X,
                top: 0,
                transform: `translateY(${(scrollY + top).toFixed(2)}px)`,
                display: "flex",
                flexDirection: "column",
                gap: GAP,
              }}
            >
              <div
                style={{
                  height: SEP_H,
                  marginBottom: SEP_GAP - GAP,
                  lineHeight: `${SEP_H}px`,
                  textAlign: "center",
                  fontFamily: F.ui,
                  fontWeight: 500,
                  fontSize: 18,
                  letterSpacing: "0.16em",
                  paddingLeft: "0.16em",
                  color: "rgba(255,255,255,0.5)",
                  whiteSpace: "pre",
                }}
              >
                {sc.sep}
              </div>
              {sc.bubbles.map((b, bi) => (
                <Bubble key={bi} b={b} t={t} tapback={si === 2 && bi === 0 ? CHAT.tapback : undefined} />
              ))}
            </div>
          );
        })}
      </div>
      {/* an empty compose field: no typing, no receipts */}
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 28,
          top: C.h - INPUT + 16,
          height: 56,
          borderRadius: 28,
          border: "1.5px solid rgba(255,255,255,0.13)",
          background: "rgba(255,255,255,0.035)",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};
