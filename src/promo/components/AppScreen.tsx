import React from "react";
import { Freeze, OffthreadVideo, staticFile } from "remotion";
import { PhoneFrame } from "../../components/PhoneFrame";
import { APP, PFONTS } from "../fonts";
import { DEMO } from "../timeline";

/** Source frame for a clip that starts playing at `startAt` (scene-local) at `rate`, then holds. */
export const clipFrame = (frame: number, from: number, to: number, startAt: number, rate = 1) =>
  Math.round(Math.min(to, Math.max(from, from + (frame - startAt) * rate)));

/** A frame of the real app recording, filling its container, with a clean status bar. */
export const AppVideo: React.FC<{ srcFrame: number; style?: React.CSSProperties }> = ({
  srcFrame,
  style,
}) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: APP.bg, ...style }}>
    <Freeze frame={srcFrame}>
      <OffthreadVideo
        src={staticFile("app/demo.mp4")}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Freeze>
    {/* replaces the recorded status bar (and its screen-recording pill) */}
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: `${DEMO.statusBar * 100}%`,
        background: APP.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 44px 0",
        fontFamily: PFONTS.app,
        fontWeight: 800,
        fontSize: 24,
        color: "#fff",
      }}
    >
      <span>9:41</span>
      <svg width={84} height={22} viewBox="0 0 84 22">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 7} y={14 - i * 4} width={5} height={6 + i * 4} rx={1.5} fill="#fff" />
        ))}
        <rect
          x={44}
          y={3}
          width={34}
          height={17}
          rx={5}
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={2}
        />
        <rect x={47} y={6} width={24} height={11} rx={3} fill="#fff" />
      </svg>
    </div>
  </div>
);

/** The app inside a phone. */
export const AppPhone: React.FC<{ srcFrame: number; children?: React.ReactNode }> = ({
  srcFrame,
  children,
}) => (
  <PhoneFrame screenBackground={APP.bg}>
    <AppVideo srcFrame={srcFrame} />
    {children}
  </PhoneFrame>
);

/** Absolute position of a point on the app screen (fractions) for a phone centred at (cx, cy). */
export const screenPoint = (
  fx: number,
  fy: number,
  phone: { cx: number; cy: number; scale: number; angle: number },
) => {
  const W = 600;
  const H = 1240;
  const B = 14;
  const lx = (B + fx * (W - 2 * B) - W / 2) * phone.scale;
  const ly = (B + fy * (H - 2 * B) - H / 2) * phone.scale;
  const a = (phone.angle * Math.PI) / 180;
  return {
    x: phone.cx + lx * Math.cos(a) - ly * Math.sin(a),
    y: phone.cy + lx * Math.sin(a) + ly * Math.cos(a),
  };
};
