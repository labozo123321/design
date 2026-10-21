import React from "react";
import { F } from "./fonts";
import { Roll } from "./Roll";
import { hexRGB, rgba, NORA_BLUE, YOUR_AMBER, TINTS } from "./hud";
import type { HudState, DotState, RGB } from "./hud";

/**
 * The HUD band (y = 200..470). Left: the year over the ages (Nora first). Right: the clock over the date line
 * of milestone nights. Centre: 'GOODNIGHT KNOCKS', the four-drum odometer, the knock glyph and the status
 * line. The centre block sits on the ages/date baseline, below the big numerals, because at 84 px the clock
 * reaches x = 619 and the label would otherwise touch it.
 */

// ---- layout (px, in the 1080x1920 frame)
export const HUD_LAYOUT = {
  left: 72,
  right: 1008,
  /** the big numerals' line box (84 px type, ink from y = 214 to 276) */
  bigTop: 204,
  /** the 22 px lines (ages, date): line box top, baseline at y = 314 */
  smallTop: 293,
  /** the centre block */
  labelTop: 298,
  drumsTop: 324,
  drumW: 46,
  drumH: 76,
  drumGap: 6,
  underlineY: 405,
  dotY: 424,
  statusTop: 440,
  barY: 464,
  barW: 220,
};
const L = HUD_LAYOUT;
const DRUMS_W = 4 * L.drumW + 3 * L.drumGap;
const DRUMS_X = 540 - DRUMS_W / 2;
const SHADOW = "0 1px 2px rgba(0,0,0,0.45), 0 0 18px rgba(0,0,0,0.38)";
/** small type keeps its opacity in its colour so its shadow stays full strength over bright pillows */
const SHADOW_SMALL = "0 1px 2px rgba(0,0,0,0.65), 0 0 10px rgba(0,0,0,0.5)";
const BLUE = hexRGB(NORA_BLUE);
const AMBER = hexRGB(YOUR_AMBER);
const GOLD = hexRGB(TINTS.gold);
const WHITE: RGB = [255, 255, 255];
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---------------------------------------------------------------- the odometer

const Odometer: React.FC<{ h: HudState }> = ({ h }) => {
  const o = h.odometer;
  const tint = h.tint;
  const W = L.drumW;
  const H = L.drumH;
  const PITCH = H;
  const BASE = H / 2 + 24; // a 64 px digit's baseline, its 48 px ink centred in the window
  const ink = rgba(tint, 1);
  return (
    <div
      style={{
        position: "absolute",
        left: DRUMS_X,
        top: L.drumsTop,
        width: DRUMS_W,
        height: H,
        opacity: o.dim,
        filter: o.glow > 0.01 ? `drop-shadow(0 0 ${(12 * o.glow).toFixed(1)}px ${rgba(GOLD, 0.6 * o.glow)})` : undefined,
      }}
    >
      <svg width={DRUMS_W} height={H} viewBox={`0 0 ${DRUMS_W} ${H}`} style={{ overflow: "visible", display: "block" }}>
        <defs>
          <linearGradient id="kn-drum-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.62" />
            <stop offset="0.2" stopColor="#000" stopOpacity="0.16" />
            <stop offset="0.5" stopColor="#000" stopOpacity="0" />
            <stop offset="0.8" stopColor="#000" stopOpacity="0.16" />
            <stop offset="1" stopColor="#000" stopOpacity="0.62" />
          </linearGradient>
          <linearGradient id="kn-drum-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.2" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.8" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="kn-drum-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ink} stopOpacity="0" />
            <stop offset="0.5" stopColor={ink} stopOpacity="0.55" />
            <stop offset="1" stopColor={ink} stopOpacity="0" />
          </linearGradient>
          <mask id="kn-drum-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <rect x="0" y="0" width={W} height={H} fill="url(#kn-drum-fade)" />
          </mask>
          <clipPath id="kn-drum-clip">
            <rect x="0" y="0" width={W} height={H} rx="7" />
          </clipPath>
          {o.drums.map((d, i) =>
            d.blur > 0 ? (
              <filter key={i} id={`kn-odo-blur-${i}`} x="-20%" y="-30%" width="140%" height="160%">
                <feGaussianBlur stdDeviation={`0 ${d.blur.toFixed(2)}`} />
              </filter>
            ) : null,
          )}
        </defs>
        {o.drums.map((d, i) => {
          const f = Math.floor(d.pos);
          const fr = d.pos - f;
          const span = d.blur > 6 ? 3 : 1;
          const digits: React.ReactNode[] = [];
          for (let k = f - span; k <= f + 1 + span; k++) {
            const y = BASE + (k - d.pos) * PITCH;
            if (y < -PITCH || y > H + PITCH) continue;
            digits.push(
              <text key={k} x={W / 2} y={y.toFixed(2)} textAnchor="middle" fontFamily={F.ui} fontWeight={200} fontSize={64} fill={ink}>
                {((k % 10) + 10) % 10}
              </text>,
            );
          }
          // the lit edge between two digit faces as it passes the window (only while a roll is readable)
          const edge = fr > 0.02 && fr < 0.98 && d.blur < 7 ? Math.sin(Math.PI * fr) : 0;
          const edgeY = H / 2 + (0.5 - fr) * PITCH;
          return (
            <g key={i} transform={`translate(${i * (W + L.drumGap)},0)`}>
              <rect x="0" y="0" width={W} height={H} rx="7" fill="rgba(8,10,14,0.42)" />
              {/* a drum spinning too fast to read becomes a soft lit smear */}
              {d.blur > 5 ? <rect x="5" y="0" width={W - 10} height={H} rx="5" fill={ink} opacity={(0.16 * Math.min(1, (d.blur - 5) / 9)).toFixed(3)} /> : null}
              <g clipPath="url(#kn-drum-clip)">
                <g mask="url(#kn-drum-mask)">
                  <g filter={d.blur > 0 ? `url(#kn-odo-blur-${i})` : undefined}>{digits}</g>
                </g>
                {edge > 0 ? <rect x="4" y={(edgeY - 0.75).toFixed(2)} width={W - 8} height="1.5" fill="url(#kn-drum-edge)" opacity={(0.9 * edge).toFixed(3)} /> : null}
              </g>
              <rect x="0" y="0" width={W} height={H} rx="7" fill="url(#kn-drum-shade)" />
              <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="6.5" fill="none" stroke={ink} strokeOpacity="0.16" />
              {/* the drum's lit top edge */}
              <rect x="6" y="1" width={W - 12} height="1" fill="url(#kn-drum-edge)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/** The underline below the drums: tint, then grey with two detent stops while locked (35.3-59.1); on the
 *  unlock a short gold glint runs out along it from the centre. */
const Underline: React.FC<{ h: HudState }> = ({ h }) => {
  const o = h.odometer;
  const grey: RGB = [141, 148, 155];
  const c = mix(h.tint, grey, o.lock);
  const a = 0.34 + 0.5 * o.lock;
  const t = h.t;
  const sweep = t >= 59.1 && t < 59.9 ? (t - 59.1) / 0.8 : -1;
  return (
    <>
      <div style={{ position: "absolute", left: DRUMS_X, top: L.underlineY, width: DRUMS_W, height: 1, background: rgba(c, a) }} />
      {o.lock > 0.01
        ? [DRUMS_X, DRUMS_X + DRUMS_W - 2].map((x, i) => (
            <div key={i} style={{ position: "absolute", left: x, top: L.underlineY - 5 * o.lock, width: 2, height: 1 + 5 * o.lock, background: rgba(grey, 0.9 * o.lock) }} />
          ))
        : null}
      {sweep >= 0
        ? [-1, 1].map((s) => {
            const x = 540 + s * (DRUMS_W / 2) * sweep;
            const a2 = Math.sin(Math.PI * sweep);
            return (
              <div
                key={s}
                style={{
                  position: "absolute",
                  left: x - 18,
                  top: L.underlineY - 1,
                  width: 36,
                  height: 3,
                  borderRadius: 2,
                  background: `radial-gradient(closest-side, ${rgba(GOLD, 0.95 * a2)}, ${rgba(GOLD, 0)})`,
                }}
              />
            );
          })
        : null}
    </>
  );
};

// ---------------------------------------------------------------- the knock glyph

export const DOT_X = { N: [469, 493, 517], Y: [563, 587, 611] };
const Dot: React.FC<{ x: number; y: number; d: DotState; col: RGB }> = ({ x, y, d, col }) => {
  const core = mix(col, WHITE, 0.4 * d.bloom);
  const a = 0.16 + 0.84 * d.on;
  const glow = d.on > 0.02 || d.bloom > 0.02;
  const shadows = [`inset 0 0 0 1px ${rgba(col, 0.32 * (1 - d.on))}`];
  if (glow) {
    shadows.push(`0 0 ${(4 + 5 * d.on + 12 * d.bloom).toFixed(1)}px ${(0.5 + 2.5 * d.bloom).toFixed(1)}px ${rgba(col, 0.42 * d.on + 0.4 * d.bloom)}`);
    shadows.push(`0 0 ${(16 + 22 * d.bloom).toFixed(1)}px 0px ${rgba(col, 0.16 * d.on + 0.22 * d.bloom)}`);
  }
  const r = d.ring >= 0 ? 5 + 15 * (1 - Math.pow(1 - d.ring, 2.2)) : 0;
  return (
    <>
      <div style={{ position: "absolute", left: x - 5, top: y - 5, width: 10, height: 10, borderRadius: 5, background: rgba(core, a), boxShadow: shadows.join(", ") }} />
      {d.ring >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: x - r,
            top: y - r,
            width: 2 * r,
            height: 2 * r,
            borderRadius: r,
            boxSizing: "border-box",
            border: `1.5px solid ${rgba(col, 0.6 * Math.pow(1 - d.ring, 1.6))}`,
          }}
        />
      ) : null}
    </>
  );
};
const Glyph: React.FC<{ h: HudState }> = ({ h }) => (
  <>
    {h.dots.N.map((d, i) => (
      <Dot key={`n${i}`} x={DOT_X.N[i]} y={L.dotY} d={d} col={BLUE} />
    ))}
    <div style={{ position: "absolute", left: 539.5, top: L.dotY - 11, width: 1, height: 22, background: rgba(h.tint, 0.55) }} />
    {h.dots.Y.map((d, i) => (
      <Dot key={`y${i}`} x={DOT_X.Y[i]} y={L.dotY} d={d} col={AMBER} />
    ))}
  </>
);

// ---------------------------------------------------------------- the status line

const Status: React.FC<{ h: HudState }> = ({ h }) => {
  const s = h.status;
  const line: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: L.statusTop,
    width: 1080,
    height: 22,
    display: "flex",
    justifyContent: "center",
    fontFamily: F.ui,
    fontWeight: 500,
    fontSize: 18,
    lineHeight: "22px",
    letterSpacing: "0.16em",
    whiteSpace: "pre",
    color: rgba(h.tint, 0.65),
    textShadow: SHADOW_SMALL,
  };
  return (
    <>
      {s.last.alpha > 0.002 && s.last.num.text ? (
        <div style={{ ...line, opacity: s.last.alpha, paddingLeft: "0.16em" }}>
          <span>LAST KNOCK · </span>
          <span style={{ display: "inline-flex", transform: s.shiver.dy ? `translateY(${s.shiver.dy.toFixed(2)}px)` : undefined, opacity: s.shiver.alpha }}>
            <Roll r={s.last.num} h={22} fs={18} style={{ fontVariantNumeric: "tabular-nums" }} />
          </span>
          <span>{s.last.suffix}</span>
        </div>
      ) : null}
      {s.waiting.alpha > 0.002 ? (
        <>
          <div style={{ ...line, opacity: s.waiting.alpha, paddingLeft: "0.16em" }}>WAITING FOR AN ANSWER</div>
          <div style={{ position: "absolute", left: 540 - L.barW / 2, top: L.barY, width: L.barW, height: 2, borderRadius: 1, background: rgba(h.tint, 0.2 * s.waiting.alpha) }} />
          <div
            style={{
              position: "absolute",
              left: 540 - L.barW / 2,
              top: L.barY,
              width: L.barW * s.waiting.progress,
              height: 2,
              borderRadius: 1,
              background: rgba(h.tint, 0.85 * s.waiting.alpha),
              boxShadow: `0 0 6px ${rgba(h.tint, 0.35 * s.waiting.alpha)}`,
            }}
          />
        </>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- the whole band

export const Hud: React.FC<{ h: HudState }> = ({ h }) => {
  if (h.alpha <= 0.001) return null;
  const ink = rgba(h.tint, 1);
  const big: React.CSSProperties = { fontFamily: F.ui, fontWeight: 200, fontSize: 84, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.005em" };
  const small: React.CSSProperties = { fontFamily: F.ui, fontWeight: 500, fontSize: 22, letterSpacing: "0.18em", fontVariantNumeric: "tabular-nums" };
  const e = h.endK;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, opacity: h.alpha, color: ink, textShadow: SHADOW }}>
      {h.sides > 0.001 ? (
        <div style={{ position: "absolute", inset: 0, opacity: h.sides }}>
          {/* LEFT: the year over the ages, Nora first, split by a hairline like the wall */}
          <div style={{ position: "absolute", left: L.left, top: L.bigTop, height: 84 }}>
            <Roll r={h.year} h={84} fs={84} style={big} />
          </div>
          <div style={{ position: "absolute", left: L.left, top: L.smallTop, height: 26, display: "flex", whiteSpace: "pre", color: rgba(h.tint, 0.7), textShadow: SHADOW_SMALL, ...small }}>
            <span style={{ lineHeight: "26px" }}>NORA </span>
            <Roll r={h.ages.nora} h={26} fs={22} style={small} />
            <span style={{ width: 1, height: 18, marginTop: 4, marginLeft: "0.42em", marginRight: "0.6em", background: rgba(h.tint, 0.75), boxShadow: "0 0 4px rgba(0,0,0,0.5)" }} />
            <span style={{ lineHeight: "26px" }}>YOU </span>
            <Roll r={h.ages.you} h={26} fs={22} style={small} />
          </div>
          {/* RIGHT: the clock over the milestone date */}
          <div style={{ position: "absolute", right: 1080 - L.right, top: L.bigTop, height: 84, display: "flex", justifyContent: "flex-end", opacity: h.clock.flicker ? 0.86 : 1 }}>
            <Roll r={h.clock} h={84} fs={84} align="right" style={big} />
          </div>
          {h.date.alpha > 0.001 ? (
            <div style={{ position: "absolute", right: 1080 - L.right, top: L.smallTop, height: 26, lineHeight: "26px", whiteSpace: "pre", marginRight: "-0.18em", opacity: h.date.alpha, color: rgba(h.tint, 0.7), textShadow: SHADOW_SMALL, ...small }}>
              {h.date.text}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* CENTRE: label, drums, glyph, status; for the end card it shrinks to 70% at the top */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 520,
          transformOrigin: `540px ${L.labelTop}px`,
          transform: e > 0 ? `translateY(${(-88 * e).toFixed(2)}px) scale(${(1 - 0.3 * e).toFixed(4)})` : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 540 - 360,
            top: 276,
            width: 720,
            height: 236,
            background: "radial-gradient(closest-side, rgba(0,0,0,0.42), rgba(0,0,0,0.24) 52%, rgba(0,0,0,0.07) 82%, rgba(0,0,0,0))",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: L.labelTop,
            width: 1080,
            textAlign: "center",
            fontFamily: F.ui,
            fontWeight: 500,
            fontSize: 16,
            lineHeight: "20px",
            letterSpacing: "0.24em",
            paddingLeft: "0.24em",
            boxSizing: "border-box",
            color: rgba(h.tint, 0.62),
            textShadow: SHADOW_SMALL,
          }}
        >
          GOODNIGHT KNOCKS
        </div>
        <Odometer h={h} />
        <Underline h={h} />
        <Glyph h={h} />
        <Status h={h} />
      </div>
    </div>
  );
};
