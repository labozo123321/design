import React from "react";
import { CAPTIONS, FPS, TITLE, clamp, smooth, smoother } from "../script";
import { F } from "./fonts";

/**
 * Captions: lowercase italic serif, 44 px, line height 1.25, warm white at 94% with a soft shadow, centred at
 * x = 540 (every line measures under 800 px, inside x = 90..930). The LAST line's baseline sits exactly on
 * y = 1430 (drawn as SVG text so the baseline is exact), so a second line grows upward, never into the
 * bottom UI. In over 10 frames with a 6 px rise, out over 10 frames, one at a time.
 */
export const CAPTION_BASELINE = 1430;
const LINE = 55; // 44 px x 1.25
const FADE = 10 / FPS;
/** two captions read better as two beats (the joke's 'briefly.' lands on its own line) */
const BREAKS: Record<string, string[]> = {
  "every night. even when you weren't speaking.": ["every night.", "even when you weren't speaking."],
  "mom turned her room into a gym. briefly.": ["mom turned her room into a gym.", "briefly."],
};
const typeset = (s: string) => s.replace(/'/g, "’");

/** The caption on screen at t (or null) with its opacity and rise. */
export const captionAt = (t: number) => {
  const c = CAPTIONS.find((x) => t >= x.t0 && t < x.t1);
  if (!c) return null;
  const kin = clamp((t - c.t0) / FADE);
  const kout = clamp((c.t1 - t) / FADE);
  return { text: c.text, lines: (BREAKS[c.text] ?? [c.text]).map(typeset), alpha: smoother(kin) * smoother(kout), rise: 6 * (1 - smoother(kin)) };
};

export const Captions: React.FC<{ t: number }> = ({ t }) => {
  const c = captionAt(t);
  if (!c || c.alpha <= 0.001) return null;
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <filter id="kn-cap-shadow" x="-10%" y="-60%" width="120%" height="220%">
          {/* the spec's soft shadow (0 2 12 px, 55%), plus a faint tight one so letters hold over the wall's white cut top */}
          <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#000" floodOpacity="0.55" result="soft" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="tightA" />
          <feFlood floodColor="#000" floodOpacity="0.32" />
          <feComposite in2="tightA" operator="in" result="tight" />
          <feMerge>
            <feMergeNode in="tight" />
            <feMergeNode in="soft" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(0 ${c.rise.toFixed(2)})`} opacity={(0.94 * c.alpha).toFixed(3)} filter="url(#kn-cap-shadow)">
        {c.lines.map((l, i) => (
          <text
            key={i}
            x={540}
            y={CAPTION_BASELINE - (c.lines.length - 1 - i) * LINE}
            textAnchor="middle"
            fontFamily={F.serif}
            fontStyle="italic"
            fontWeight={400}
            fontSize={44}
            fill="#FFF6EA"
          >
            {l}
          </text>
        ))}
      </g>
    </svg>
  );
};

/**
 * The title card (0.2-3.0 s), over the floor at the foot of the beds (y = 1080..1300): the line in 58 px
 * sentence-case sans at 600, the subtitle in 20 px caps tracked 0.28em. In over 0.3 s (the title un-blurs and
 * settles 10 px, the subtitle's tracking closes in just after), out from 2.6 to 3.0.
 */
export const Title: React.FC<{ t: number }> = ({ t }) => {
  const a = smooth(TITLE.t0, TITLE.t0 + 0.3, t) * (1 - smooth(2.6, TITLE.t1, t));
  if (a <= 0.001) return null;
  const k1 = smoother((t - TITLE.t0) / 0.55);
  const k2 = smoother((t - TITLE.t0 - 0.18) / 0.6);
  const out = smooth(2.6, TITLE.t1, t);
  const blur = 5 * (1 - k1) + 3 * out;
  const ls = 0.28 + 0.12 * (1 - k2);
  return (
    <div style={{ position: "absolute", left: 120, top: 1096, width: 840, textAlign: "center", opacity: a, color: "#FFF6EA" }}>
      <div
        style={{
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 58,
          lineHeight: "66px",
          letterSpacing: "-0.01em",
          transform: `translateY(${(10 * (1 - k1)).toFixed(2)}px)`,
          filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : undefined,
          textShadow: "0 2px 16px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.35)",
        }}
      >
        POV: you had a secret knock
        <br />
        with your sister
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: F.ui,
          fontWeight: 500,
          fontSize: 20,
          lineHeight: "24px",
          letterSpacing: `${ls.toFixed(3)}em`,
          paddingLeft: `${ls.toFixed(3)}em`,
          opacity: 0.8 * k2,
          textShadow: "0 1px 10px rgba(0,0,0,0.6)",
        }}
      >
        {TITLE.sub}
      </div>
    </div>
  );
};
