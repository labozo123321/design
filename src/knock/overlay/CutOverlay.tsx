import React from "react";
import { smooth, smoother } from "../script";
import { CUT_FPS, blackAt, outAt, segAt } from "../cut";
import { F } from "./fonts";
import { Roll } from "./Roll";

/**
 * The simple cut's overlay, as DOM in the 1080x1920 frame, a pure function of the cut's frame. Little on
 * screen and nothing hurried:
 *  - the fades through black between the four nights (laid over the picture),
 *  - the title at the start,
 *  - one quiet line at the top: the year on the left, the goodnight-knock count on the right (it rolls only
 *    when a knock is answered),
 *  - two short captions a night (three on the last), each held for several seconds,
 *  - the end card: the title again and the question.
 * Clear of Instagram's UI: nothing above y = 200, nothing below the captions' baseline (y = 1430).
 */

const INK = "#FFF6EA";
const SHADOW = "0 0 3px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.45), 0 0 18px rgba(0,0,0,0.38)";
const SHADOW_SMALL = "0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.75), 0 0 10px rgba(0,0,0,0.55)";

// ------------------------------------------------------------------------------------------- captions
type Cap = { t0: number; t1: number; lines: string[] };
const CAPS: Cap[] = [
  // 2004 (her knocks 5.2-6.2, yours 8.7-9.8)
  { t0: 4.4, t1: 7.0, lines: ["your first night in your own room."] },
  { t0: 7.3, t1: 11.2, lines: ["she made up the knock."] },
  // 2009 (your eleven knocks 13.4-15.5; she's up at 16.6, across the house 18.9-22.7, down by 26)
  { t0: 13.3, t1: 17.4, lines: ["eleven knocks meant come here."] },
  { t0: 20.0, t1: 26.6, lines: ["she always came."] },
  // 2013 (her knocks 29.1-29.8 and 33.2-34.1; you roll over at 34.8 and answer 35.8-37.1)
  { t0: 28.2, t1: 31.9, lines: ["her last night home."] },
  { t0: 32.6, t1: 38.6, lines: ["you almost didn’t answer."] },
  // 2025 (your knocks 45.7-46.8; her answer 50.4-51.4; you're up at 55.0, across the house 57.2-61.3)
  { t0: 40.3, t1: 43.9, lines: ["twelve years later."] },
  { t0: 45.5, t1: 49.6, lines: ["this time, you knocked first."] },
  { t0: 57.4, t1: 61.4, lines: ["and this time, you went to her."] },
];
const CAP_FADE = 0.5;
const CAP_BASELINE = 1430;
const CAP_LINE = 64;
const CAP_SIZE = 54;

const Captions: React.FC<{ t: number }> = ({ t }) => {
  const c = CAPS.find((x) => t >= x.t0 && t < x.t1);
  if (!c) return null;
  const kin = smoother((t - c.t0) / CAP_FADE);
  const kout = smoother((c.t1 - t) / CAP_FADE);
  const a = Math.min(kin, kout) * (1 - blackAt(t));
  if (a <= 0.001) return null;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <filter id="kc-cap-shadow" x="-10%" y="-60%" width="120%" height="220%">
          <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#000" floodOpacity="0.7" result="soft" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="tightA" />
          <feFlood floodColor="#000" floodOpacity="0.7" />
          <feComposite in2="tightA" operator="in" result="tight" />
          <feMerge>
            <feMergeNode in="tight" />
            <feMergeNode in="soft" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(0 ${(6 * (1 - kin)).toFixed(2)})`} opacity={(0.94 * a).toFixed(3)} filter="url(#kc-cap-shadow)">
        {c.lines.map((l, i) => (
          <text key={i} x={540} y={CAP_BASELINE - (c.lines.length - 1 - i) * CAP_LINE} textAnchor="middle" fontFamily={F.serif} fontStyle="italic" fontWeight={400} fontSize={CAP_SIZE} fill={INK}>
            {l}
          </text>
        ))}
      </g>
    </svg>
  );
};

// ------------------------------------------------------------------------------------------- the count
/** The goodnight knocks so far: [cut second it rolls at (null: never in this night), before, after]. */
const COUNTS: { year: string; at: number | null; a: number; b: number }[] = [
  { year: "2004", at: outAt(6.7), a: 0, b: 1 },
  // (2009: her answer is coming over; it rolls as she arrives)
  { year: "2009", at: outAt(20.7), a: 1718, b: 1719 },
  { year: "2013", at: outAt(34.8), a: 3215, b: 3216 },
  { year: "2025", at: outAt(59.1), a: 3216, b: 3217 },
];
const ROLL = 0.7;
const pad4 = (n: number) => String(n).padStart(4, "0");

const Hud: React.FC<{ t: number }> = ({ t }) => {
  const seg = segAt(t);
  const c = COUNTS.find((x) => x.year === seg.year) ?? COUNTS[3];
  // (in after the title; out for the end card; and through black between the nights); it leaves the frame
  // to whoever crosses the hallway under it (her in 2009; you in 2025, and it stays out after)
  const walk = Math.max(smooth(18.5, 19.1, t) * (1 - smooth(22.5, 23.1, t)), smooth(55.3, 55.9, t));
  const a = smooth(4.2, 4.9, t) * (1 - blackAt(t)) * (1 - walk);
  if (a <= 0.001) return null;
  const k = c.at === null ? 1 : smoother((t - c.at) / ROLL);
  const num = { text: pad4(k > 0 ? c.b : c.a), prev: pad4(c.a), k: c.at === null || t < c.at ? 1 : k };
  const year = { text: seg.year, prev: seg.year, k: 1 };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, opacity: a, color: INK, textShadow: SHADOW }}>
      <div style={{ position: "absolute", left: 72, top: 208, height: 84 }}>
        <Roll r={year} h={84} fs={84} style={{ fontFamily: F.ui, fontWeight: 300, fontSize: 84, letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" }} />
      </div>
      <div style={{ position: "absolute", right: 72, top: 212, textAlign: "right" }}>
        <div style={{ fontFamily: F.ui, fontWeight: 600, fontSize: 30, lineHeight: "36px", letterSpacing: "0.14em", marginRight: "-0.14em", color: "rgba(255,246,234,0.92)", textShadow: SHADOW_SMALL }}>GOODNIGHT KNOCKS</div>
        <div style={{ marginTop: 4, height: 64, display: "flex", justifyContent: "flex-end" }}>
          <Roll r={num} h={64} fs={60} align="right" style={{ fontFamily: F.ui, fontWeight: 300, fontSize: 60, letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums" }} />
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------------- title, end
const TitleText: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: size, lineHeight: `${Math.round(size * 1.14)}px`, letterSpacing: "-0.01em", textShadow: "0 2px 16px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.35)" }}>
    POV: you had a secret knock
    <br />
    with your sister
  </div>
);

const Title: React.FC<{ t: number }> = ({ t }) => {
  const a = smooth(0.5, 1.2, t) * (1 - smooth(3.6, 4.3, t));
  if (a <= 0.001) return null;
  return (
    <div style={{ position: "absolute", left: 120, top: 1096, width: 840, textAlign: "center", opacity: a, color: INK, transform: `translateY(${(8 * (1 - smoother((t - 0.5) / 0.9))).toFixed(2)}px)` }}>
      <TitleText size={58} />
    </div>
  );
};

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  const scrim = 0.28 * smooth(64.5, 65.3, t);
  const kt = smooth(65.0, 65.8, t);
  const kq = smooth(66.3, 67.1, t);
  if (scrim <= 0.001) return null;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${scrim.toFixed(3)})` }} />
      <div style={{ position: "absolute", left: 100, top: 1170, width: 880, textAlign: "center", opacity: kt, color: INK, transform: `translateY(${(8 * (1 - kt)).toFixed(2)}px)` }}>
        <TitleText size={60} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 1400,
          width: 880,
          textAlign: "center",
          opacity: kq,
          color: INK,
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 40,
          letterSpacing: "0.04em",
          textShadow: "0 2px 14px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)",
        }}
      >
        WHAT WAS YOUR SECRET SIGNAL?
      </div>
    </>
  );
};

// ------------------------------------------------------------------------------------------- the frame
export const CutOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / CUT_FPS;
  const black = blackAt(t);
  // a gentle darkening behind the top line so it holds over the posters and the lit hallway, and under the
  // captions so they hold over the patterned bedding
  const scrim = 0.42 * (1 - black);
  const capScrim = 0.26 * (1 - black);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, overflow: "hidden", pointerEvents: "none" }}>
      {black > 0.001 ? <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${black.toFixed(4)})` }} /> : null}
      {scrim > 0.002 ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 560, background: `linear-gradient(to bottom, rgba(0,0,0,${scrim.toFixed(3)}) 0%, rgba(0,0,0,${(scrim * 0.75).toFixed(3)}) 45%, rgba(0,0,0,0) 100%)` }} />
      ) : null}
      {capScrim > 0.002 ? (
        <div style={{ position: "absolute", left: 0, top: 1240, width: 1080, height: 360, background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${capScrim.toFixed(3)}) 50%, rgba(0,0,0,0) 100%)` }} />
      ) : null}
      <EndCard t={t} />
      <Hud t={t} />
      <Title t={t} />
      <Captions t={t} />
    </div>
  );
};
