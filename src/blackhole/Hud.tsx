import React from "react";
import { interpolate } from "remotion";
import { EV, T, camAt, clampF } from "./timeline";
import { skyCentre, toScreen } from "./project";

/**
 * Everything drawn on the helmet's visor: no voice, just the instruments, the status line, a map, short
 * fact cards, the title and the question at the end. Every number comes from track.json (the physics).
 */

const W = 1080;
const H = 1920;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const sm = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const CYAN = "#9BEFFF";
const AMBER = "#FFC46B";
const RED = "#FF5A4E";
const SHADOW = "0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.8)";

export type Fonts = { hud: string; mono: string; head: string };

/* ------------------------------------------------------------------ */
/* number formats                                                       */
/* ------------------------------------------------------------------ */

const commas = (n: number) => Math.round(n).toLocaleString("en-US");
const SUP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
};
export const sci = (x: number, digits = 2) => {
  if (x === 0) return "0";
  if (x < 1e4) return x < 10 ? x.toFixed(2) : commas(x);
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  return `${m.toFixed(digits)}×10${String(e)
    .split("")
    .map((c) => SUP[c])
    .join("")}`;
};

export const distText = (km: number) => {
  if (km <= 0) return "0 m";
  if (km >= 10) return `${commas(km)} km`;
  if (km >= 1) return `${km.toFixed(2)} km`;
  const m = km * 1000;
  if (m >= 1) return `${m.toFixed(m >= 100 ? 0 : 2)} m`;
  if (m >= 1e-3) return `${(m * 1e3).toFixed(m >= 0.1 ? 0 : 2)} mm`;
  if (m >= 1e-6) return `${(m * 1e6).toFixed(m >= 1e-4 ? 0 : 2)} µm`;
  if (m >= 1e-9) return `${(m * 1e9).toFixed(1)} nm`;
  return `${(m * 1e12).toFixed(1)} pm`;
};

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
export const earthText = (s: number) => {
  const DAY = 86400;
  const YEAR = 365.25 * DAY;
  if (s < DAY) return hms(s);
  if (s < YEAR) return `${Math.floor(s / DAY)} d ${hms(s % DAY).slice(0, -3)}`;
  return `${Math.floor(s / YEAR)} yr ${String(Math.floor((s % YEAR) / DAY)).padStart(3, "0")} d`;
};

/* ------------------------------------------------------------------ */
/* the visor itself                                                     */
/* ------------------------------------------------------------------ */

/** The helmet's visor: dark rim, curved glass, a faint reflection, HUD corner marks. */
export const Visor: React.FC<{ t: number; tint: number; crack: number }> = ({ t, tint, crack }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
    <defs>
      <radialGradient id="bh-rim" cx="50%" cy="48%" r="75%">
        <stop offset="0.62" stopColor="#000" stopOpacity={0} />
        <stop offset="0.86" stopColor="#000" stopOpacity={0.55} />
        <stop offset="1" stopColor="#000" stopOpacity={0.95} />
      </radialGradient>
      <linearGradient id="bh-glare" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#CFE8FF" stopOpacity={0.09} />
        <stop offset="0.45" stopColor="#CFE8FF" stopOpacity={0} />
      </linearGradient>
    </defs>
    {/* auto-darkening visor against the blueshifted glare */}
    {tint > 0.001 ? <rect width={W} height={H} fill="#06101C" opacity={tint} /> : null}
    <rect width={W} height={H} fill="url(#bh-rim)" />
    <path
      d={`M 40 ${H * 0.42} Q 60 ${H * 0.12} ${W * 0.42} 46`}
      stroke="url(#bh-glare)"
      strokeWidth={70}
      fill="none"
      opacity={0.8 + 0.2 * Math.sin(t * 0.3)}
    />
    {/* corner brackets */}
    {[
      [70, 190, 1, 1],
      [W - 70, 190, -1, 1],
      [70, H - 330, 1, -1],
      [W - 70, H - 330, -1, -1],
    ].map(([x, y, sx, sy], i) => (
      <path
        key={i}
        d={`M ${x} ${y + sy * 46} L ${x} ${y} L ${x + sx * 46} ${y}`}
        stroke={CYAN}
        strokeOpacity={0.35}
        strokeWidth={3}
        fill="none"
      />
    ))}
    {crack > 0.001 ? (
      <g stroke="#E8F6FF" strokeOpacity={0.55 * crack} strokeWidth={2} fill="none">
        <path d="M 820 260 L 760 330 L 790 390 L 700 470 L 720 540" />
        <path d="M 760 330 L 690 320 L 640 360" />
        <path d="M 790 390 L 880 430 L 930 520" />
        <path d="M 700 470 L 610 500" />
      </g>
    ) : null}
  </svg>
);

/**
 * The thrusters' glow on the visor's lower rim: a hard flicker while braking, a steady ember while you
 * hover, gone when they cut out.
 */
export const ThrusterGlow: React.FC<{ t: number }> = ({ t }) => {
  const brake = sm(EV.brake - 0.1, EV.brake + 0.4, t) * (1 - sm(EV.hover - 0.3, EV.hover + 1.0, t));
  const hover = sm(EV.hover - 0.3, EV.hover + 1.0, t) * (1 - sm(EV.release - 0.05, EV.release + 0.08, t));
  const flick = 0.75 + 0.25 * Math.sin(t * 47) * Math.sin(t * 13.3 + 1) + 0.1 * Math.sin(t * 91);
  const k = (brake * 0.55 + hover * 0.22) * flick;
  if (k < 0.003) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        mixBlendMode: "screen",
        opacity: k,
        background:
          "radial-gradient(ellipse 70% 32% at 50% 104%, rgba(255,150,60,0.95) 0%, rgba(255,90,30,0.45) 45%, rgba(255,60,20,0) 100%)",
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* instruments                                                          */
/* ------------------------------------------------------------------ */

const Label: React.FC<{ f: Fonts; children: React.ReactNode; color?: string }> = ({ f, children, color }) => (
  <div
    style={{
      fontFamily: f.hud,
      fontWeight: 600,
      fontSize: 22,
      letterSpacing: "0.22em",
      color: color ?? "rgba(155,239,255,0.75)",
      textShadow: SHADOW,
    }}
  >
    {children}
  </div>
);
const Value: React.FC<{ f: Fonts; children: React.ReactNode; size?: number; color?: string }> = ({
  f,
  children,
  size = 40,
  color,
}) => (
  <div
    style={{
      fontFamily: f.mono,
      fontWeight: 500,
      fontSize: size,
      color: color ?? "#F2FCFF",
      textShadow: SHADOW,
      lineHeight: 1.15,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

/** What's happening, top centre. */
export const statusAt = (t: number) => {
  if (t < EV.brake) return { text: "FREE FALL", color: CYAN, blink: false };
  if (t < EV.hover) return { text: "BRAKING · THRUSTERS FULL", color: AMBER, blink: false };
  if (t < EV.descend) return { text: "HOVERING · PHOTON SPHERE", color: AMBER, blink: false };
  if (t < EV.release) return { text: "HOVERING · DESCENDING", color: AMBER, blink: false };
  if (t < EV.horizon) return { text: "THRUSTERS OFF", color: RED, blink: true };
  if (t < 57) return { text: "EVENT HORIZON CROSSED", color: RED, blink: true };
  if (t < 61) return { text: "NO WAY OUT", color: RED, blink: false };
  if (t < EV.end) return { text: "⚠ TIDAL STRESS CRITICAL", color: RED, blink: true };
  return { text: "SIGNAL LOST", color: RED, blink: true };
};

export const Instruments: React.FC<{ frame: number; f: Fonts; glitch: number }> = ({ frame, f, glitch }) => {
  const t = frame / 30;
  const i = clampF(frame);
  const show = sm(3.55, 4.2, t) * (1 - sm(EV.end - 0.05, EV.end + 0.1, t));
  if (show < 0.001) return null;
  const st = statusAt(t);
  const blinkOn = !st.blink || Math.floor(t * 3) % 2 === 0;
  const inside = t >= EV.horizon;
  const thrust = T.thrust[i];
  const tidal = T.tidal[i];
  const speed = T.speed[i];
  const lapse = T.lapse[i];
  // a little jitter in the readouts as things fall apart at the end
  const jx = glitch * (Math.sin(frame * 12.9) * 6);
  const lapseText =
    lapse > 1.6
      ? `▶▶ TIME-LAPSE ×${commas(lapse)}`
      : lapse > 0.75
        ? "▶ REAL TIME"
        : `SLOW MOTION ×1/${commas(1 / Math.max(lapse, 1e-4))}`;
  const earthFrozen = t >= EV.release;
  const earthS = T.earth[Math.min(i, Math.round(EV.release * 30))];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: show, transform: `translateX(${jx}px)` }}>
      {/* status */}
      <div
        style={{
          position: "absolute",
          top: 214,
          left: 0,
          width: W,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: f.hud,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: "0.2em",
            color: st.color,
            padding: "8px 26px",
            border: `2px solid ${st.color}`,
            borderRadius: 8,
            background: "rgba(0,8,14,0.35)",
            opacity: blinkOn ? 1 : 0.35,
            textShadow: SHADOW,
          }}
        >
          {st.text}
        </div>
      </div>
      {/* left: distance, speed, thrust / tidal */}
      <div
        style={{
          position: "absolute",
          top: 300,
          left: 92,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <Label f={f}>{inside ? "INSIDE THE HORIZON" : "TO EVENT HORIZON"}</Label>
          <Value f={f}>{inside ? "—" : distText(T.distKm[i])}</Value>
        </div>
        <div>
          <Label f={f}>SPEED</Label>
          <Value f={f} size={34}>
            {inside ? "—" : `${speed.toFixed(3)} c`}
          </Value>
        </div>
        {thrust > 0 ? (
          <div>
            <Label f={f} color="rgba(255,196,107,0.85)">
              THRUST TO HOVER
            </Label>
            <Value f={f} size={34} color={AMBER}>
              {`${sci(thrust)} g`}
            </Value>
          </div>
        ) : null}
        {inside ? (
          <div>
            <Label f={f} color="rgba(255,120,110,0.9)">
              TIDAL STRETCH
            </Label>
            <Value f={f} size={34} color={tidal > 1 ? RED : "#F2FCFF"}>
              {`${tidal < 1 ? tidal.toFixed(4) : sci(tidal)} g`}
            </Value>
          </div>
        ) : null}
      </div>
      {/* right: clocks */}
      <div
        style={{
          position: "absolute",
          top: 300,
          right: 92,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-end",
          textAlign: "right",
        }}
      >
        <div>
          <Label f={f}>YOUR CLOCK</Label>
          <Value f={f}>{hms(T.tau[i])}</Value>
        </div>
        <div>
          <Label f={f}>EARTH CLOCK</Label>
          <Value f={f} color={earthFrozen && inside ? "rgba(242,252,255,0.35)" : undefined}>
            {inside ? "NO SIGNAL" : earthText(earthS)}
          </Value>
        </div>
        <Label f={f} color={lapse > 1.6 ? "rgba(155,239,255,0.9)" : lapse < 0.75 ? AMBER : undefined}>
          {lapseText}
        </Label>
        {inside ? (
          <div style={{ marginTop: 6 }}>
            <Label f={f} color="rgba(255,120,110,0.9)">
              TO SINGULARITY
            </Label>
            <Value f={f} size={44} color={RED}>
              {T.timeLeft[i] >= 10 ? `${T.timeLeft[i].toFixed(1)} s` : `${T.timeLeft[i].toFixed(3)} s`}
            </Value>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* the map                                                              */
/* ------------------------------------------------------------------ */

/** Top-down map, bottom left: the horizon, the photon sphere, the disk, and you (log scale out to 30 r_s). */
export const MiniMap: React.FC<{ frame: number; f: Fonts }> = ({ frame, f }) => {
  const t = frame / 30;
  const show = sm(3.7, 4.4, t) * (1 - sm(EV.end - 0.05, EV.end + 0.1, t));
  if (show < 0.001) return null;
  const R = 84;
  const cx = 100;
  const cy = 100;
  const rho = (r: number) => (R * Math.log(1 + r)) / Math.log(31);
  const i = clampF(frame);
  const at = (k: number) => {
    const p = T.pos[k];
    const r = Math.max(0.0, T.rVis[k]);
    const a = Math.atan2(p[0], p[2]);
    const rr = t >= EV.horizon && k === i ? Math.max(0, 1 - (t - EV.horizon) / (EV.end - EV.horizon)) : r;
    return [cx + rho(rr) * Math.sin(a), cy + rho(rr) * Math.cos(a) * -1] as const;
  };
  const trail: string[] = [];
  for (let k = 0; k <= i; k += 6) {
    const [x, y] = at(k);
    trail.push(`${trail.length ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const [yx, yy] = at(i);
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  return (
    <div style={{ position: "absolute", left: 74, top: 640, opacity: show }}>
      <svg width={200} height={236} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="bh-map-disk">
            <stop offset={rho(3) / rho(15)} stopColor="#FFB45A" stopOpacity={0.85} />
            <stop offset="1" stopColor="#FF7A2A" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={R + 8}
          fill="rgba(0,10,18,0.45)"
          stroke={CYAN}
          strokeOpacity={0.35}
          strokeWidth={2}
        />
        <circle cx={cx} cy={cy} r={rho(15)} fill="url(#bh-map-disk)" />
        <circle cx={cx} cy={cy} r={rho(3)} fill="#000" />
        <circle
          cx={cx}
          cy={cy}
          r={rho(1.5)}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.5}
          strokeDasharray="4 5"
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={rho(1)}
          fill="#000"
          stroke="#FFE2B8"
          strokeOpacity={0.9}
          strokeWidth={1.5}
        />
        <path d={trail.join(" ")} stroke={CYAN} strokeOpacity={0.55} strokeWidth={2} fill="none" />
        <circle cx={yx} cy={yy} r={9 + 6 * pulse} fill={t >= EV.horizon ? RED : CYAN} opacity={0.25} />
        <circle cx={yx} cy={yy} r={5.5} fill={t >= EV.horizon ? RED : "#FFFFFF"} />
        <text
          x={cx}
          y={cy + R + 38}
          textAnchor="middle"
          fontFamily={f.hud}
          fontWeight={600}
          fontSize={19}
          letterSpacing="0.2em"
          fill="rgba(155,239,255,0.75)"
        >
          SGR A* · TOP VIEW
        </text>
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* fact cards                                                           */
/* ------------------------------------------------------------------ */

type Card = { t0: number; t1: number; label: string; head: string; sub?: string; warn?: boolean };

export const CARDS: Card[] = [
  {
    t0: 3.9,
    t1: 8.3,
    label: "SAGITTARIUS A* · CENTRE OF OUR GALAXY",
    head: "4.3 million times the mass of the Sun",
  },
  {
    t0: 9.0,
    t1: 13.3,
    label: "ITS EVENT HORIZON",
    head: "25 million km across",
    sub: "18 Suns side by side",
  },
  {
    t0: 14.0,
    t1: 18.4,
    label: "THE DISK",
    head: "Gas orbiting at half the speed of light",
    sub: "the inner edge goes round every 33 minutes",
  },
  {
    t0: 19.1,
    t1: 23.6,
    label: "GRAVITY BENDS LIGHT",
    head: "You're seeing the back of the disk",
    sub: "its light bends over the top and underneath",
  },
  {
    t0: 34.6,
    t1: 38.4,
    label: "PHOTON SPHERE · 6 MILLION KM ABOVE THE HORIZON",
    head: "Here light itself goes in circles",
    sub: "half your sky is the black hole",
  },
  { t0: 40.8, t1: 44.6, label: "HOVERING LOWER", head: "The whole universe is shrinking to a dot" },
  { t0: 45.2, t1: 47.7, label: "1 KM ABOVE THE HORIZON", head: "1 second for you = 1 hour on Earth" },
  {
    t0: 48.0,
    t1: 50.0,
    label: "1 MICROMETRE ABOVE",
    head: "1 second for you = 3.6 years on Earth",
    warn: true,
  },
  {
    t0: 50.3,
    t1: 53.2,
    label: "THRUSTERS OFF",
    head: "You hovered for 16 seconds",
    sub: "On Earth, 8 years went by",
  },
  {
    t0: 53.8,
    t1: 57.0,
    label: "EVENT HORIZON",
    head: "You just crossed it",
    sub: "You didn't feel a thing. There's no way back.",
    warn: true,
  },
  {
    t0: 57.4,
    t1: 60.8,
    label: "THE SINGULARITY",
    head: "Horizon to centre: 66.5 s at most",
    sub: "firing your thrusters would only make it shorter",
    warn: true,
  },
  {
    t0: 61.2,
    t1: 65.6,
    label: "SPAGHETTIFICATION",
    head: "Your feet are pulled harder than your head",
    sub: "stretched thinner than a noodle",
    warn: true,
  },
];

export const FactCards: React.FC<{ t: number; f: Fonts; y: number }> = ({ t, f, y }) => (
  <>
    {CARDS.map((c, k) => {
      if (t < c.t0 - 0.05 || t > c.t1 + 0.05) return null;
      const a = sm(c.t0, c.t0 + 0.35, t) * (1 - sm(c.t1 - 0.3, c.t1, t));
      const rise = (1 - sm(c.t0, c.t0 + 0.45, t)) * 26;
      // the label types itself in
      const n = Math.round(interpolate(t, [c.t0, c.t0 + 0.5], [0, c.label.length], CLAMP));
      const acc = c.warn ? "#FF8A7E" : CYAN;
      return (
        <div
          key={k}
          style={{
            position: "absolute",
            left: 70,
            width: W - 140,
            top: y,
            opacity: a,
            transform: `translateY(${rise}px)`,
            textAlign: "center",
          }}
        >
          {/* a soft shade behind the words, for when they sit over the bright disk */}
          <div
            style={{
              position: "absolute",
              left: -80,
              right: -80,
              top: -70,
              bottom: -70,
              background:
                "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0) 100%)",
              zIndex: -1,
            }}
          />
          <div
            style={{
              fontFamily: f.hud,
              fontWeight: 700,
              fontSize: 25,
              letterSpacing: "0.2em",
              color: acc,
              textShadow: SHADOW,
              marginBottom: 14,
            }}
          >
            {c.label.slice(0, n)}
          </div>
          <div
            style={{
              fontFamily: f.head,
              fontWeight: 800,
              fontSize: 66,
              lineHeight: 1.06,
              color: "#FFFFFF",
              textShadow: "0 4px 26px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.9)",
            }}
          >
            {c.head}
          </div>
          {c.sub ? (
            <div
              style={{
                fontFamily: f.head,
                fontWeight: 500,
                fontSize: 38,
                lineHeight: 1.2,
                marginTop: 14,
                color: "rgba(255,255,255,0.88)",
                textShadow: SHADOW,
              }}
            >
              {c.sub}
            </div>
          ) : null}
        </div>
      );
    })}
  </>
);

/* ------------------------------------------------------------------ */
/* title and ending                                                     */
/* ------------------------------------------------------------------ */

export const Title: React.FC<{ t: number; f: Fonts }> = ({ t, f }) => {
  const a = sm(0.15, 0.6, t) * (1 - sm(2.95, 3.45, t));
  if (a < 0.001) return null;
  const s = 1 + 0.04 * sm(0, 3.6, t);
  return (
    <div
      style={{
        position: "absolute",
        top: 300,
        left: 0,
        width: W,
        textAlign: "center",
        opacity: a,
        transform: `scale(${s})`,
      }}
    >
      <div
        style={{
          fontFamily: f.hud,
          fontWeight: 700,
          fontSize: 46,
          letterSpacing: "0.3em",
          color: CYAN,
          textShadow: SHADOW,
        }}
      >
        POV:
      </div>
      <div
        style={{
          fontFamily: f.head,
          fontWeight: 900,
          fontSize: 104,
          lineHeight: 0.98,
          color: "#FFFFFF",
          marginTop: 10,
          textShadow: "0 6px 34px rgba(0,0,0,0.9)",
        }}
      >
        you fall into
        <br />a black hole
      </div>
      <div
        style={{
          fontFamily: f.hud,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.8)",
          marginTop: 22,
          textShadow: SHADOW,
          opacity: sm(0.9, 1.4, t),
        }}
      >
        EVERY NUMBER ON SCREEN IS REAL
      </div>
    </div>
  );
};

export const EndQuestion: React.FC<{ t: number; f: Fonts }> = ({ t, f }) => {
  const a = sm(EV.end + 0.7, EV.end + 1.2, t);
  if (a < 0.001) return null;
  return (
    <div style={{ position: "absolute", top: 1290, left: 0, width: W, textAlign: "center", opacity: a }}>
      <div
        style={{
          fontFamily: f.head,
          fontWeight: 800,
          fontSize: 84,
          color: "#FFFFFF",
          textShadow: "0 6px 34px rgba(0,0,0,0.9)",
        }}
      >
        would you go in?
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* the dot of sky                                                       */
/* ------------------------------------------------------------------ */

/**
 * Glare round the dot the whole universe has shrunk to (light falling in is blueshifted into X-rays):
 * a star-shaped diffraction flare from the visor.
 */
export const DotFlare: React.FC<{ frame: number; k: number }> = ({ frame, k }) => {
  if (k < 0.002) return null;
  const cam = camAt(frame);
  const p = toScreen(skyCentre(cam), cam);
  if (!p) return null;
  const t = frame / 30;
  const L = 260 + 520 * k;
  const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      <defs>
        <radialGradient id="bh-flare-core">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <stop offset="0.2" stopColor="#BFE0FF" stopOpacity={0.45} />
          <stop offset="1" stopColor="#4A7BFF" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="bh-flare-spike" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8FB8FF" stopOpacity={0} />
          <stop offset="0.5" stopColor="#E8F2FF" stopOpacity={0.9} />
          <stop offset="1" stopColor="#8FB8FF" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g transform={`translate(${p.x} ${p.y})`} opacity={k * flick}>
        <circle r={90 + 120 * k} fill="url(#bh-flare-core)" />
        {[0, 60, 120].map((a) => (
          <rect
            key={a}
            x={-L / 2}
            y={-1.6}
            width={L}
            height={3.2}
            fill="url(#bh-flare-spike)"
            transform={`rotate(${a + 15})`}
          />
        ))}
        {[30, 90, 150].map((a) => (
          <rect
            key={a}
            x={-L * 0.22}
            y={-0.9}
            width={L * 0.44}
            height={1.8}
            fill="url(#bh-flare-spike)"
            transform={`rotate(${a + 15})`}
            opacity={0.6}
          />
        ))}
      </g>
    </svg>
  );
};
