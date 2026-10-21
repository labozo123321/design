import React from "react";
import { smoother } from "../script";
import type { Rolled } from "./hud";

/**
 * Text that rolls vertically when it changes, like a mechanical counter: the new text rises into place while
 * the old one leaves upward, both seen through a window cut exactly from the cap line to just under the
 * baseline (Inter's metrics), so a rolling glyph never pokes out above or below its neighbours. When old and
 * new have the same length only the characters that changed roll (tabular figures keep every slot the same
 * width); otherwise the whole string rolls. The window has generous side room, so nothing is cut sideways.
 */

// Inter's vertical metrics (em): hhea ascender / descender, cap height
const ASC = 0.96875;
const DESC = 0.2421875;
const CAP = 0.727;

/** the rolling window inside a line box of height h for font size fs: from just above the cap line to just
 *  below the baseline (deep enough for a comma) */
export const rollWindow = (h: number, fs: number) => {
  const baseline = (h - (ASC + DESC) * fs) / 2 + ASC * fs;
  const top = baseline - CAP * fs - 0.05 * fs;
  const bottom = baseline + 0.17 * fs;
  return { top, height: bottom - top };
};

const SLACK = 24;

export const Roll: React.FC<{
  r: Rolled;
  /** line-box height (px) */
  h: number;
  /** font size (px), for the window */
  fs: number;
  /** which edge a different-length string hangs from while it rolls */
  align?: "left" | "right";
  style?: React.CSSProperties;
}> = ({ r, h, fs, align = "left", style }) => {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "stretch",
    height: h,
    lineHeight: `${h}px`,
    whiteSpace: "pre",
    ...style,
  };
  if (r.k >= 1 || r.prev === r.text) return <span style={base}>{r.text}</span>;
  const e = smoother(r.k);
  const w = rollWindow(h, fs);
  const D = w.height;
  /** a slot: an invisible copy of `now` sizes it; the window over it shows `now` rising and `was` leaving */
  const slot = (now: string, was: string, key: number | string, side: "left" | "right" = "left") => (
    <span key={key} style={{ position: "relative", display: "inline-block", height: h }}>
      <span style={{ visibility: "hidden" }}>{now}</span>
      <span style={{ position: "absolute", left: -SLACK, right: -SLACK, top: w.top, height: D, overflow: "hidden" }}>
        <span style={{ position: "absolute", [side]: SLACK, top: -w.top + (1 - e) * D, opacity: Math.min(1, e * 1.5) }}>{now}</span>
        <span style={{ position: "absolute", [side]: SLACK, top: -w.top - e * D, opacity: 1 - e * 0.85 }}>{was}</span>
      </span>
    </span>
  );
  if (r.prev.length === r.text.length) {
    return <span style={base}>{[...r.text].map((c, i) => (r.prev[i] === c ? <span key={i}>{c}</span> : slot(c, r.prev[i], i)))}</span>;
  }
  return <span style={base}>{slot(r.text, r.prev, "all", align)}</span>;
};
