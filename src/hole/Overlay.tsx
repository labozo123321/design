import React from "react";
import { Easing, interpolate } from "remotion";
import { T } from "./timeline";

/**
 * Text only, no voice: the title, an instrument readout (depth, temperature, gravity, speed, time since you
 * jumped), a cut-away Earth with a dot for where you are, and short fact cards as you pass each landmark.
 */

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const W = 1080;
const H = 1920;
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const SHADOW = "0 3px 18px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.7)";

/* ------------------------------------------------------------------ */
/* Readouts                                                             */
/* ------------------------------------------------------------------ */

export const depthText = (km: number) =>
  km < 1 ? `${fmt(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${fmt(km)} km`;
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

const Row: React.FC<{ label: string; value: string; mono: string; hi?: number; color?: string }> = ({
  label,
  value,
  mono,
  hi = 0,
  color,
}) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 18, height: 50 }}>
    <div
      style={{
        width: 150,
        fontFamily: mono,
        fontSize: 22,
        letterSpacing: "0.16em",
        color: "rgba(255,255,255,0.62)",
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: mono,
        fontSize: 38,
        color: color ?? "#fff",
        transform: `scale(${1 + 0.18 * hi})`,
        transformOrigin: "left center",
        letterSpacing: "0.02em",
      }}
    >
      {value}
    </div>
  </div>
);

/** Earth cut in half, the tunnel straight through the middle, a glowing dot where you are. */
const Gauge: React.FC<{ frac: number; mono: string }> = ({ frac, mono }) => {
  const R = 96;
  const cx = 110;
  const cy = 112;
  const y = cy - R + 2 * R * frac;
  const ring = (r: number, c: string) => <circle cx={cx} cy={cy} r={r} fill={c} />;
  return (
    <svg width={260} height={230} style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="hg-you">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.35" stopColor="#7FE6FF" />
          <stop offset="1" stopColor="#7FE6FF" stopOpacity={0} />
        </radialGradient>
      </defs>
      {ring(R + 3, "rgba(120,170,255,0.25)")}
      {ring(R, "#6B4A33")}
      {ring(R * 0.985, "#C1441A")}
      {ring(R * 0.546, "#F08A1C")}
      {ring(R * 0.192, "#FFE7A8")}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="rgba(10,10,14,0.85)" strokeWidth={4} />
      <line x1={cx} y1={cy - R} x2={cx} y2={y} stroke="#7FE6FF" strokeWidth={2.5} />
      <circle cx={cx} cy={y} r={16} fill="url(#hg-you)" />
      <circle cx={cx} cy={y} r={4.5} fill="#fff" />
      <text
        x={cx + 26}
        y={y + 7}
        fontFamily={mono}
        fontSize={20}
        fill="#fff"
        style={{ letterSpacing: "0.12em" }}
      >
        YOU
      </text>
    </svg>
  );
};

/** The readout and the gauge, bottom left. */
export const Instruments: React.FC<{ frame: number; mono: string }> = ({ frame, mono }) => {
  const t = frame / 30;
  const o = interpolate(t, [3.3, 4.0, 64.4, 65.2], [0, 1, 1, 0], CLAMP);
  if (o <= 0.001) return null;
  const f = Math.max(0, Math.min(T.frames - 1, frame));
  const km = T.depth[f];
  const temp = T.temp[f];
  const g = T.g[f];
  const kmh = T.speed[f] * 3.6;
  const el = T.elapsed[f];
  const frac = Math.min(1, T.dist[f] / 12742);
  // highlights: gravity at its peak at the core-mantle boundary, zero at the centre
  const gHi =
    smooth(33.6, 34.2, t) * (1 - smooth(35.6, 36.4, t)) + smooth(47.3, 47.6, t) * (1 - smooth(49.4, 50.2, t));
  const gCol = gHi > 0.05 ? (t < 40 ? "#FF9A6A" : "#7FE6FF") : undefined;
  const hotCol =
    temp > 500
      ? `rgb(255,${Math.round(255 - 150 * Math.min(1, (temp - 500) / 3000))},${Math.round(255 - 215 * Math.min(1, (temp - 500) / 2000))})`
      : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 1150,
        opacity: o,
        textShadow: "0 1px 8px rgba(0,0,0,0.8)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -64,
          top: -40,
          width: 640,
          height: 560,
          background: "radial-gradient(ellipse 60% 55% at 30% 55%, rgba(0,0,0,0.42), rgba(0,0,0,0) 75%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <Gauge frac={frac} mono={mono} />
        <div style={{ marginTop: 8 }}>
          <Row label="DEPTH" value={depthText(km)} mono={mono} />
          <Row label="TEMP" value={`${fmt(temp)} °C`} mono={mono} color={hotCol} />
          <Row label="GRAVITY" value={`${g.toFixed(2)} g`} mono={mono} hi={gHi} color={gCol} />
          <Row label="SPEED" value={`${fmt(kmh)} km/h`} mono={mono} />
          <Row label="TIME" value={`T+ ${clock(el)}`} mono={mono} />
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Fact cards                                                           */
/* ------------------------------------------------------------------ */

type Icon =
  | "metro"
  | "crystal"
  | "mine"
  | "drill"
  | "layers"
  | "diamond"
  | "water"
  | "flame"
  | "iron"
  | "magnet"
  | "sun"
  | "centre"
  | "up"
  | "palm";
type Card = { at: number; until: number; small: string; big: string; tag: string; icon: Icon };

export const CARDS: Card[] = [
  {
    at: 6.55,
    until: 8.25,
    small: "deeper than the world's deepest",
    big: "metro station",
    tag: "105 m",
    icon: "metro",
  },
  { at: 8.7, until: 10.8, small: "the cave of", big: "giant crystals", tag: "300 m", icon: "crystal" },
  { at: 12.1, until: 14.3, small: "the deepest", big: "mine on Earth", tag: "4 km", icon: "mine" },
  { at: 15.2, until: 17.5, small: "the deepest hole", big: "ever dug", tag: "12.3 km", icon: "drill" },
  { at: 18.3, until: 20.5, small: "the crust ends.", big: "the mantle", tag: "35 km", icon: "layers" },
  { at: 21.3, until: 23.5, small: "this is where", big: "diamonds form", tag: "150 km", icon: "diamond" },
  {
    at: 24.0,
    until: 26.2,
    small: "the rock here may hold as much",
    big: "water as the oceans",
    tag: "520 km",
    icon: "water",
  },
  {
    at: 27.0,
    until: 29.3,
    small: "the rock here is",
    big: "hotter than lava",
    tag: "over 2,000 °C",
    icon: "flame",
  },
  { at: 33.9, until: 36.4, small: "an ocean of", big: "liquid iron", tag: "2,890 km", icon: "iron" },
  {
    at: 37.8,
    until: 40.2,
    small: "this is where",
    big: "Earth's magnetic field",
    tag: "is made",
    icon: "magnet",
  },
  { at: 43.0, until: 45.3, small: "as hot as the surface of", big: "the Sun", tag: "5,400 °C", icon: "sun" },
  {
    at: 47.75,
    until: 50.3,
    small: "the centre of the Earth",
    big: "you're weightless",
    tag: "35,708 km/h",
    icon: "centre",
  },
  {
    at: 50.8,
    until: 53.0,
    small: "now gravity pulls you back",
    big: "you're falling up",
    tag: "slowing down",
    icon: "up",
  },
  {
    at: 64.9,
    until: 67.7,
    small: "38 minutes later",
    big: "the other side of the world",
    tag: "12,742 km",
    icon: "palm",
  },
];

const IconFor: React.FC<{ icon: Icon }> = ({ icon }) => {
  const S = { width: 88, height: 88, viewBox: "-44 -44 88 88" };
  switch (icon) {
    case "metro":
      return (
        <svg {...S}>
          <rect x={-26} y={-32} width={52} height={56} rx={12} fill="#D9DDE3" />
          <rect x={-19} y={-24} width={38} height={22} rx={4} fill="#2B3440" />
          <rect x={-26} y={4} width={52} height={7} fill="#1F5FA8" />
          <circle cx={-14} cy={16} r={4} fill="#FFF3C4" />
          <circle cx={14} cy={16} r={4} fill="#FFF3C4" />
          <path d="M-18 24 L-26 38 M18 24 L26 38" stroke="#9AA3AE" strokeWidth={4} />
        </svg>
      );
    case "crystal":
      return (
        <svg {...S}>
          <path d="M-6 36 L-16 -6 L-4 -36 L8 -6 Z" fill="#DDF1F4" stroke="#8FCADB" strokeWidth={2} />
          <path d="M6 36 L20 -2 L32 -18 L28 8 Z" fill="#F1E6C9" stroke="#C9B48A" strokeWidth={2} />
          <path d="M-10 36 L-30 6 L-34 -10 L-20 10 Z" fill="#CFE6E8" stroke="#8FCADB" strokeWidth={2} />
        </svg>
      );
    case "mine":
      return (
        <svg {...S}>
          <path d="M-30 6 Q0 -40 30 6 Z" fill="#F2C230" />
          <rect x={-34} y={4} width={68} height={8} rx={4} fill="#D9A520" />
          <circle cx={0} cy={-10} r={7} fill="#FFF6D0" />
          <path d="M-24 34 L24 22" stroke="#8A6A3A" strokeWidth={5} />
          <path d="M14 14 L34 30 L28 36 Z" fill="#9AA3AE" />
        </svg>
      );
    case "drill":
      return (
        <svg {...S}>
          <path d="M0 -36 L-18 30 L18 30 Z" fill="none" stroke="#C9CDD3" strokeWidth={4} />
          <path d="M-12 8 L12 8 M-7 -12 L7 -12" stroke="#C9CDD3" strokeWidth={3} />
          <path d="M0 30 L0 44" stroke="#F2C230" strokeWidth={5} />
        </svg>
      );
    case "layers":
      return (
        <svg {...S}>
          <path d="M-36 -18 L36 -18 L36 -8 L-36 -8 Z" fill="#8C6B55" />
          <path d="M-36 -8 L36 -8 L36 14 L-36 14 Z" fill="#5E6B3A" />
          <path d="M-36 14 L36 14 L36 34 L-36 34 Z" fill="#C1441A" />
          <path d="M-36 -26 L36 -26 L36 -18 L-36 -18 Z" fill="#A0896C" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...S}>
          <path
            d="M-30 -10 L-16 -28 L16 -28 L30 -10 L0 32 Z"
            fill="#DFF4FF"
            stroke="#8FCDEB"
            strokeWidth={2}
          />
          <path
            d="M-30 -10 L30 -10 M-16 -28 L-6 -10 L0 32 L6 -10 L16 -28"
            stroke="#8FCDEB"
            strokeWidth={2}
            fill="none"
          />
        </svg>
      );
    case "water":
      return (
        <svg {...S}>
          <path d="M0 -36 C12 -16 26 -2 26 14 A26 26 0 0 1 -26 14 C-26 -2 -12 -16 0 -36 Z" fill="#3E8FE0" />
          <path d="M-12 12 A12 12 0 0 0 2 26" stroke="#BFE3FF" strokeWidth={5} fill="none" />
        </svg>
      );
    case "flame":
      return (
        <svg {...S}>
          <path
            d="M0 36 C-28 34 -30 6 -12 -10 C-10 4 -2 6 0 -2 C2 -14 -4 -26 6 -38 C16 -20 30 -6 26 14 C24 30 12 36 0 36 Z"
            fill="#FF8A2A"
          />
          <path d="M0 34 C-12 32 -14 18 -4 8 C-2 16 4 16 6 8 C14 18 14 32 0 34 Z" fill="#FFE29A" />
        </svg>
      );
    case "iron":
      return (
        <svg {...S}>
          <path d="M0 -36 C14 -14 26 0 26 14 A26 26 0 0 1 -26 14 C-26 0 -14 -14 0 -36 Z" fill="#F08A1C" />
          <path d="M-10 10 A12 12 0 0 0 4 24" stroke="#FFE7A8" strokeWidth={5} fill="none" />
        </svg>
      );
    case "magnet":
      return (
        <svg {...S}>
          <circle r={14} fill="#F08A1C" />
          {[16, 24, 33].map((r) => (
            <ellipse
              key={r}
              cx={0}
              cy={0}
              rx={r * 0.55}
              ry={r}
              fill="none"
              stroke="#7FE6FF"
              strokeWidth={2.4}
              transform="rotate(0)"
            />
          ))}
          {[16, 24, 33].map((r) => (
            <ellipse
              key={`b${r}`}
              cx={0}
              cy={0}
              rx={r}
              ry={r * 0.55}
              fill="none"
              stroke="#7FE6FF"
              strokeWidth={1.2}
              opacity={0.5}
            />
          ))}
        </svg>
      );
    case "sun":
      return (
        <svg {...S}>
          {Array.from({ length: 12 }).map((_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return (
              <path
                key={k}
                d={`M${Math.cos(a) * 24} ${Math.sin(a) * 24} L${Math.cos(a) * 36} ${Math.sin(a) * 36}`}
                stroke="#FFD24A"
                strokeWidth={4}
              />
            );
          })}
          <circle r={19} fill="#FFC22E" />
        </svg>
      );
    case "centre":
      return (
        <svg {...S}>
          <circle r={34} fill="#C1441A" />
          <circle r={19} fill="#F08A1C" />
          <circle r={7} fill="#FFE7A8" />
          <circle r={3} fill="#fff" />
        </svg>
      );
    case "up":
      return (
        <svg {...S}>
          <path d="M0 -34 L22 -8 L8 -8 L8 32 L-8 32 L-8 -8 L-22 -8 Z" fill="#7FE6FF" />
        </svg>
      );
    case "palm":
      return (
        <svg {...S}>
          <path d="M4 36 Q0 6 -4 -18" stroke="#8A6A3A" strokeWidth={5} fill="none" />
          <path
            d="M-4 -18 Q-26 -30 -36 -10 M-4 -18 Q-18 -38 0 -40 M-4 -18 Q14 -36 30 -24 M-4 -18 Q22 -16 34 4"
            stroke="#4E9A4F"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
          />
          <path d="M-40 36 Q0 26 40 36 Z" fill="#E8D7A8" />
        </svg>
      );
  }
};

const CardView: React.FC<{ card: Card; t: number; serif: string; mono: string }> = ({
  card,
  t,
  serif,
  mono,
}) => {
  const inK = interpolate(t, [card.at, card.at + 0.28], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.back(2)),
  });
  const fadeIn = interpolate(t, [card.at, card.at + 0.18], [0, 1], CLAMP);
  const out = interpolate(t, [card.until, card.until + 0.35], [0, 1], {
    ...CLAMP,
    easing: Easing.in(Easing.quad),
  });
  const o = fadeIn * (1 - out);
  if (o <= 0.001) return null;
  const long = card.big.length > 15;
  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        right: 50,
        top: 270,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: o,
        transform: `translateY(${-14 * out}px) scale(${0.9 + 0.1 * inK})`,
        transformOrigin: "50% 40%",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          top: -60,
          bottom: -50,
          background:
            "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(6,6,10,0.5), rgba(6,6,10,0.22) 55%, rgba(6,6,10,0) 80%)",
          zIndex: -1,
        }}
      />
      <div
        style={{
          fontFamily: mono,
          fontSize: 31,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.92)",
          textShadow: SHADOW,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        {card.small}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))", display: "flex" }}>
          <IconFor icon={card.icon} />
        </div>
        <div
          style={{
            fontFamily: serif,
            fontSize: long ? 64 : 88,
            lineHeight: 1.0,
            color: "#fff",
            textShadow: SHADOW,
            whiteSpace: "nowrap",
          }}
        >
          {card.big}
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: mono,
          fontSize: 28,
          color: "#fff",
          padding: "6px 18px",
          borderRadius: 999,
          background: "rgba(10,14,22,0.5)",
          border: "1px solid rgba(255,255,255,0.3)",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
        }}
      >
        {card.tag}
      </div>
    </div>
  );
};

export const FactCards: React.FC<{ t: number; serif: string; mono: string }> = ({ t, serif, mono }) => (
  <>
    {CARDS.filter((c) => t >= c.at - 0.05 && t <= c.until + 0.4).map((c) => (
      <CardView key={c.big} card={c} t={t} serif={serif} mono={mono} />
    ))}
  </>
);

/* ------------------------------------------------------------------ */
/* Title, end question                                                  */
/* ------------------------------------------------------------------ */

export const Title: React.FC<{ t: number; serif: string }> = ({ t, serif }) => {
  const o = interpolate(t, [0.45, 0.6, 3.9, 4.5], [0, 1, 1, 0], CLAMP);
  if (o <= 0.001) return null;
  const slam = Math.max(0, t - 0.45);
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 860,
        textAlign: "center",
        opacity: o,
        fontFamily: serif,
        fontSize: 70,
        lineHeight: 1.08,
        color: "#fff",
        transform: `scale(${1 + 0.22 * Math.exp(-slam * 9)})`,
        textShadow: `${12 * Math.exp(-slam * 7)}px 0 0 rgba(255,90,40,0.75), ${-12 * Math.exp(-slam * 7)}px 0 0 rgba(60,200,255,0.75), 0 4px 26px rgba(0,0,0,0.85)`,
      }}
    >
      POV: you jump into a hole through the Earth
    </div>
  );
};

export const EndQuestion: React.FC<{ t: number; serif: string }> = ({ t, serif }) => {
  const o = interpolate(t, [69.4, 70.0], [0, 1], CLAMP);
  if (o <= 0.001) return null;
  const k = interpolate(t, [69.4, 69.8], [0, 1], { ...CLAMP, easing: Easing.out(Easing.back(2.2)) });
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 820,
        textAlign: "center",
        opacity: o,
        fontFamily: serif,
        fontSize: 84,
        color: "#fff",
        transform: `scale(${0.85 + 0.15 * k})`,
        textShadow: "0 4px 30px rgba(0,0,0,0.9)",
      }}
    >
      would you jump?
    </div>
  );
};

/** The white-out as you pass the centre (the camera flips inside it). */
export const centreFlash = (t: number) =>
  interpolate(t, [46.85, 47.4, 47.62, 48.5], [0, 1, 1, 0], { ...CLAMP, easing: Easing.inOut(Easing.quad) });

export { W as OVERLAY_W, H as OVERLAY_H };
