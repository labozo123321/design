import React from "react";
import { Easing, interpolate } from "remotion";
import { T } from "./timeline";

/**
 * Text only, no voice: as the gravity readout passes a real place's gravity, a card says where you'd be
 * standing (Venus, Mars, the Moon, Pluto...), and one altitude milestone on the way up.
 */

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** When the fading gravity reaches g (same schedule as the physics: 1 g until 4 s, 0 at 32 s). */
const whenG = (g: number) => 4 + 28 * (1 - g);
const whenAlt = (m: number) => T.y.findIndex((y) => y >= m) / T.fps;

type Icon = "venus" | "earth" | "mars" | "moon" | "pluto" | "station" | "everest";
type Card = { at: number; until: number; small: string; big: string; tag: string; icon: Icon };

export const CARDS: Card[] = [
  {
    at: whenG(0.904),
    until: whenG(0.904) + 2.5,
    small: "this is the gravity on",
    big: "Venus",
    tag: "0.90 g",
    icon: "venus",
  },
  {
    at: whenG(0.5),
    until: whenG(0.5) + 2.4,
    small: "this is",
    big: "half Earth's gravity",
    tag: "0.50 g",
    icon: "earth",
  },
  {
    at: whenG(0.378),
    until: whenG(0.378) + 2.6,
    small: "this is the gravity on",
    big: "Mars",
    tag: "0.38 g",
    icon: "mars",
  },
  {
    at: whenG(0.165),
    until: 29.3, // gone before the blink as the last leap leaves the ground
    small: "this is the gravity on",
    big: "the Moon",
    tag: "0.17 g",
    icon: "moon",
  },
  {
    at: whenG(0.063),
    until: whenG(0) - 0.55,
    small: "this is the gravity on",
    big: "Pluto",
    tag: "0.06 g",
    icon: "pluto",
  },
  {
    at: whenG(0),
    until: whenG(0) + 2.8,
    small: "this is how it feels on the",
    big: "Space Station",
    tag: "0.00 g",
    icon: "station",
  },
  {
    at: whenAlt(8849),
    until: whenAlt(8849) + 2.6,
    small: "you're now higher than",
    big: "Mount Everest",
    tag: "8,849 m",
    icon: "everest",
  },
];

const Planet: React.FC<{ id: string; stops: [string, string, string]; children?: React.ReactNode }> = ({
  id,
  stops,
  children,
}) => (
  <svg width={84} height={84} viewBox="-42 -42 84 84">
    <defs>
      <radialGradient id={`${id}-b`} cx="-0.25" cy="-0.3" r="1.25">
        <stop offset="0" stopColor={stops[0]} />
        <stop offset="0.55" stopColor={stops[1]} />
        <stop offset="1" stopColor={stops[2]} />
      </radialGradient>
      <radialGradient id={`${id}-s`} cx="0.75" cy="0.7" r="0.95">
        <stop offset="0" stopColor="#000" stopOpacity={0.55} />
        <stop offset="0.6" stopColor="#000" stopOpacity={0.15} />
        <stop offset="1" stopColor="#000" stopOpacity={0} />
      </radialGradient>
      <clipPath id={`${id}-c`}>
        <circle r={34} />
      </clipPath>
    </defs>
    <circle r={34} fill={`url(#${id}-b)`} />
    <g clipPath={`url(#${id}-c)`}>{children}</g>
    <circle r={34} fill={`url(#${id}-s)`} />
    <circle r={34} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
  </svg>
);

const IconFor: React.FC<{ icon: Icon }> = ({ icon }) => {
  switch (icon) {
    case "venus":
      return (
        <Planet id="ve" stops={["#FCEBC0", "#E2B66A", "#A9762F"]}>
          <ellipse cx={-4} cy={-12} rx={40} ry={5} fill="rgba(255,248,225,0.35)" />
          <ellipse cx={6} cy={6} rx={40} ry={6} fill="rgba(170,120,50,0.25)" />
          <ellipse cx={-8} cy={20} rx={40} ry={4} fill="rgba(255,248,225,0.25)" />
        </Planet>
      );
    case "earth":
      return (
        <Planet id="ea" stops={["#7CC8FF", "#2C7BC9", "#123E78"]}>
          <path d="M-22 -12 q8 -14 20 -8 q6 8 -4 14 q-10 2 -8 12 q-10 2 -8 -18z" fill="#4E9A4F" />
          <path d="M8 4 q12 -6 18 4 q2 12 -10 16 q-6 -4 -8 -20z" fill="#5FAA55" />
          <path d="M-30 6 q20 -6 40 2" stroke="rgba(255,255,255,0.7)" strokeWidth={3} fill="none" />
        </Planet>
      );
    case "mars":
      return (
        <Planet id="ma" stops={["#F49A62", "#C2552A", "#6E2611"]}>
          <ellipse cx={-6} cy={4} rx={14} ry={6} fill="rgba(90,30,10,0.4)" />
          <ellipse cx={14} cy={-10} rx={8} ry={5} fill="rgba(90,30,10,0.35)" />
          <ellipse cx={-2} cy={-31} rx={14} ry={5} fill="rgba(255,255,255,0.85)" />
        </Planet>
      );
    case "moon":
      return (
        <Planet id="mo" stops={["#F4F4F2", "#C3C3C0", "#7A7A78"]}>
          {[
            [-12, -8, 7],
            [10, -14, 5],
            [6, 10, 9],
            [-16, 14, 4],
            [18, 4, 3],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="rgba(90,90,88,0.35)" stroke="rgba(255,255,255,0.25)" />
          ))}
        </Planet>
      );
    case "pluto":
      return (
        <Planet id="pl" stops={["#F2E4CE", "#C9A786", "#6E5038"]}>
          {/* the heart */}
          <path d="M4 18 l-14 -14 a7 7 0 0 1 14 -6 a7 7 0 0 1 14 6 z" fill="rgba(255,250,240,0.8)" />
          <ellipse cx={-18} cy={-14} rx={10} ry={6} fill="rgba(90,60,40,0.4)" />
        </Planet>
      );
    case "station":
      return (
        <svg width={92} height={84} viewBox="-46 -42 92 84">
          <rect x={-40} y={-3} width={80} height={6} rx={2} fill="#D9DDE3" />
          {[-34, -20, 20, 34].map((x) => (
            <g key={x}>
              <rect
                x={x - 5}
                y={-30}
                width={10}
                height={24}
                fill="#C9A23E"
                stroke="#8C6E22"
                strokeWidth={1}
              />
              <rect x={x - 5} y={6} width={10} height={24} fill="#C9A23E" stroke="#8C6E22" strokeWidth={1} />
            </g>
          ))}
          <rect x={-9} y={-9} width={18} height={18} rx={4} fill="#EEF1F5" stroke="#9AA3AE" />
          <rect x={-4} y={9} width={8} height={14} rx={3} fill="#EEF1F5" stroke="#9AA3AE" />
        </svg>
      );
    case "everest":
      return (
        <svg width={92} height={84} viewBox="-46 -42 92 84">
          <path d="M-44 36 L-6 -32 L10 -6 L18 -16 L44 36 Z" fill="#5E6E86" />
          <path d="M-6 -32 L6 -10 L0 -12 L-6 -6 L-12 -12 L-18 -10 Z" fill="#F4F6FA" />
          <path d="M18 -16 L26 0 L20 -2 L14 -8 Z" fill="#F4F6FA" />
        </svg>
      );
  }
};

export const GravityCaptions: React.FC<{ t: number; serif: string; mono: string }> = ({ t, serif, mono }) => (
  <>
    {CARDS.filter((c) => t >= c.at - 0.05 && t <= c.until + 0.4).map((c) => (
      <CardView key={c.big} card={c} t={t} serif={serif} mono={mono} />
    ))}
  </>
);

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
  const shadow = "0 3px 18px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.6)";
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 300,
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
          top: -50,
          bottom: -40,
          background:
            "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(8,10,18,0.42), rgba(8,10,18,0.18) 55%, rgba(8,10,18,0) 80%)",
          zIndex: -1,
        }}
      />
      <div
        style={{
          fontFamily: mono,
          fontSize: 33,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.92)",
          textShadow: shadow,
          marginBottom: 10,
        }}
      >
        {card.small}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.55))", display: "flex" }}>
          <IconFor icon={card.icon} />
        </div>
        <div
          style={{
            fontFamily: serif,
            fontSize: card.big.length > 12 ? 70 : 92,
            lineHeight: 1.0,
            color: "#fff",
            textShadow: shadow,
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
          background: "rgba(10,14,22,0.45)",
          border: "1px solid rgba(255,255,255,0.28)",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
        }}
      >
        {card.tag}
      </div>
    </div>
  );
};
