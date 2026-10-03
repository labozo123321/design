import React from "react";
import { AbsoluteFill } from "remotion";
import { PFONTS } from "../fonts";

/** Cream dotted-grid paper. */
export const Paper: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#F6EEDD",
      backgroundImage:
        "radial-gradient(rgba(60,40,20,0.16) 2px, transparent 2.5px), radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.7), transparent 60%)",
      backgroundSize: "40px 40px, 100% 100%",
    }}
  />
);

/** Strip of washi tape with torn ends. */
export const Tape: React.FC<{ w?: number; color?: string; angle?: number; style?: React.CSSProperties }> = ({
  w = 220,
  color = "rgba(136,204,45,0.72)",
  angle = 0,
  style,
}) => {
  const teeth = 7;
  const h = 56;
  const zig = (x0: number, dir: 1 | -1) =>
    Array.from({ length: teeth + 1 })
      .map((_, i) => `${x0 + (i % 2 ? 7 * dir : 0)},${(i / teeth) * h}`)
      .join(" ");
  return (
    <svg
      width={w + 16}
      height={h}
      style={{ position: "absolute", transform: `rotate(${angle}deg)`, overflow: "visible", ...style }}
    >
      <polygon
        points={`${zig(8, -1)} ${zig(w + 8, 1)
          .split(" ")
          .reverse()
          .join(" ")}`}
        fill={color}
      />
      <rect x={8} y={8} width={w} height={6} fill="rgba(255,255,255,0.35)" />
    </svg>
  );
};

/** Die-cut sticker: white border, soft shadow, slight curl. */
export const Sticker: React.FC<{
  children: React.ReactNode;
  bg: string;
  color?: string;
  angle?: number;
  size?: number;
  round?: boolean;
}> = ({ children, bg, color = "#141414", angle = 0, size = 46, round = false }) => (
  <div
    style={{
      display: "inline-block",
      transform: `rotate(${angle}deg)`,
      background: bg,
      color,
      border: "8px solid #fff",
      borderRadius: round ? 999 : 28,
      padding: round ? "26px 30px" : "16px 30px 12px",
      fontFamily: PFONTS.marker,
      fontSize: size,
      lineHeight: 1.05,
      boxShadow: "0 14px 26px -8px rgba(60,40,20,0.45), 0 2px 0 rgba(0,0,0,0.08)",
      whiteSpace: "nowrap",
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

/** Hand-drawn marker loop, drawn on with stroke-dashoffset. */
export const MarkerLoop: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  progress: number;
  color?: string;
}> = ({ cx, cy, rx, ry, progress, color = "#E8202A" }) => {
  const pts: string[] = [];
  const turns = 1.15;
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * Math.PI * 2 - 2.6;
    const wob = 1 + 0.04 * Math.sin(i * 0.9) + (i / n) * 0.06;
    pts.push(`${cx + Math.cos(t) * rx * wob},${cy + Math.sin(t) * ry * wob}`);
  }
  const d = `M ${pts.join(" L ")}`;
  const len = Math.PI * (rx + ry) * turns * 1.08;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - Math.min(1, Math.max(0, progress)))}
        opacity={0.92}
      />
    </svg>
  );
};

/** Marker arrow from (x1,y1) to (x2,y2), drawn on. */
export const MarkerArrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress: number;
  color?: string;
}> = ({ x1, y1, x2, y2, progress, color = "#141414" }) => {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25;
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.25;
  const a = Math.atan2(y2 - my, x2 - mx);
  const head = (s: number) => `${x2 + Math.cos(a + Math.PI - s) * 40},${y2 + Math.sin(a + Math.PI - s) * 40}`;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <path
        d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
      {p > 0.92 ? (
        <polyline
          points={`${head(0.5)} ${x2},${y2} ${head(-0.5)}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
};
