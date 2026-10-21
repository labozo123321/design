import React from "react";
import { EVENTS, TITLE, smooth, smoother } from "../script";
import { F } from "./fonts";
import { rgba } from "./hud";
import type { RGB } from "./hud";

/**
 * The end card (67.5-71.5) over the held, dimmed final wide. The HUD's centre block has already shrunk to the
 * top (Hud.tsx). 67.6 the title at y = 560; 68.1 the 1 px hairline (the wall) draws down x = 540 from y = 760
 * to 1180; 68.3 the kids' half to its left (right-aligned, 30 px caps, its credit at 16 px); 68.8 the adults'
 * half to its right (left-aligned); 69.4 the question at y = 1380. Each fades in over 0.4 s. The two halves are
 * two different studies, each with its own credit, and each line pairs with the other across the wall
 * ('ABOUT HALF' sits on the second line of both).
 */

export const END = {
  t0: EVENTS.end_card,
  title: 67.6,
  wall: 68.1,
  left: 68.3,
  right: 68.8,
  cta: 69.4,
  titleY: 560,
  wallY0: 760,
  wallY1: 1180,
  ctaY: 1380,
  /** the extra dimming the overlay lays over the picture for legibility */
  scrim: 0.34,
};
const KIDS = ["AS KIDS, SIBLINGS", "SPEND ABOUT HALF", "THEIR FREE TIME", "TOGETHER."];
const KIDS_CREDIT = ["(DEMOGRAPHIC RESEARCH,", "2017)"];
const ADULTS = ["AS ADULTS, ONLY", "ABOUT HALF FEEL", "VERY CLOSE", "TO ONE."];
const ADULTS_CREDIT = ["(PEW RESEARCH CENTER,", "2025 SURVEY)"];
const CTA = "WHAT WAS YOUR SECRET SIGNAL?";
const GUTTER = 28; // from the hairline to each half
const STAT_LH = 38;
const CREDIT_LH = 22;

const fade = (t: number, t0: number) => smoother((t - t0) / 0.4);
const SHADOW = "0 2px 14px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)";

const Half: React.FC<{ side: -1 | 1; lines: string[]; credit: string[]; k: number; ink: string }> = ({ side, lines, credit, k, ink }) => {
  const blockH = lines.length * STAT_LH + 16 + credit.length * CREDIT_LH;
  const top = (END.wallY0 + END.wallY1) / 2 - blockH / 2;
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    width: 400,
    textAlign: side < 0 ? "right" : "left",
    opacity: k,
    transform: `translateX(${(side * 12 * (1 - k)).toFixed(2)}px)`,
    color: ink,
    textShadow: SHADOW,
  };
  if (side < 0) style.right = 1080 - (540 - GUTTER);
  else style.left = 540 + GUTTER;
  return (
    <div style={style}>
      <div style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 30, lineHeight: `${STAT_LH}px`, letterSpacing: "0.04em", marginRight: side < 0 ? "-0.04em" : 0, whiteSpace: "pre" }}>
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontFamily: F.ui, fontWeight: 500, fontSize: 16, lineHeight: `${CREDIT_LH}px`, letterSpacing: "0.14em", marginRight: side < 0 ? "-0.14em" : 0, opacity: 0.62, whiteSpace: "pre" }}>
        {credit.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
};

export const EndCard: React.FC<{ t: number; tint: RGB }> = ({ t, tint }) => {
  if (t < END.t0) return null;
  const ink = rgba(tint, 1);
  const scrim = END.scrim * smooth(END.t0, END.t0 + 0.6, t);
  const kt = fade(t, END.title);
  const kw = smoother((t - END.wall) / 0.7);
  const kl = fade(t, END.left);
  const kr = fade(t, END.right);
  const kc = fade(t, END.cta);
  const wallLen = (END.wallY1 - END.wallY0) * kw;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% 52%, rgba(4,6,10,${(scrim * 0.85).toFixed(3)}), rgba(4,6,10,${scrim.toFixed(3)}))` }} />
      {/* title */}
      <div
        style={{
          position: "absolute",
          left: 120,
          width: 840,
          top: END.titleY - 62,
          textAlign: "center",
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 54,
          lineHeight: "62px",
          letterSpacing: "-0.01em",
          color: ink,
          opacity: kt,
          transform: `translateY(${(8 * (1 - kt)).toFixed(2)}px)`,
          textShadow: SHADOW,
        }}
      >
        {TITLE.text.replace(" with ", "\u0000with ").split("\u0000").map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      {/* the wall */}
      {kw > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 539.5,
            top: END.wallY0,
            width: 1,
            height: wallLen,
            background: `linear-gradient(to bottom, ${rgba(tint, 0)}, ${rgba(tint, 0.85)} 7%, ${rgba(tint, 0.85)} 93%, ${rgba(tint, kw < 1 ? 0.85 : 0)})`,
            boxShadow: `0 0 8px ${rgba(tint, 0.25)}`,
          }}
        />
      ) : null}
      <Half side={-1} lines={KIDS} credit={KIDS_CREDIT} k={kl} ink={ink} />
      <Half side={1} lines={ADULTS} credit={ADULTS_CREDIT} k={kr} ink={ink} />
      {/* the question */}
      <div
        style={{
          position: "absolute",
          left: 120,
          width: 840,
          top: END.ctaY - 20,
          height: 40,
          lineHeight: "40px",
          textAlign: "center",
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 34,
          letterSpacing: "0.1em",
          paddingLeft: "0.1em",
          boxSizing: "border-box",
          color: ink,
          opacity: kc,
          transform: `translateY(${(8 * (1 - kc)).toFixed(2)}px)`,
          textShadow: SHADOW,
        }}
      >
        {CTA}
      </div>
    </div>
  );
};
