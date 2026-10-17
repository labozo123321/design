import React from "react";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { CUE, SEGS, smooth } from "./timeline";
import type { Seg } from "./timeline";

/**
 * On top of the picture: the title over the walk up to the car; the phone's recording frame over the
 * replay from the crowd (a red dot and its clock, the focus square finding the car); a fade at the end.
 * No other words.
 */

const MONT = loadMontserrat("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

const pop = (t: number, t0: number, dur = 0.24, over = 1.12) => {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.6 ? (u / 0.6) * over : over + (1 - over) * ((u - 0.6) / 0.4);
};

const Title: React.FC<{ v: number }> = ({ v }) => {
  const t0 = 0.3;
  const t1 = 3.7;
  const a = smooth(t0, t0 + 0.12, v) * (1 - smooth(t1 - 0.3, t1, v));
  if (a <= 0) return null;
  const stroke = {
    WebkitTextStroke: "9px #111",
    paintOrder: "stroke fill" as const,
    textShadow: "0 6px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.35)",
  };
  return (
    <div style={{ position: "absolute", left: 56, right: 56, top: 250, textAlign: "center", opacity: a }}>
      <div style={{ fontFamily: MONT.fontFamily, fontWeight: 900, fontSize: 70, color: "#FFD23F", transform: `scale(${pop(v, t0)})`, ...stroke }}>POV:</div>
      <div style={{ fontFamily: MONT.fontFamily, fontWeight: 800, fontSize: 70, lineHeight: 1.08, color: "#FFFFFF", transform: `scale(${pop(v, t0 + 0.18)})`, marginTop: 4, ...stroke }}>
        you're driving the new Tesla Roadster at its demo
      </div>
    </div>
  );
};

/** A phone recording: the red dot and the clock, a thin focus square, the edges a little darker. */
const PhoneUI: React.FC<{ v: number }> = ({ v }) => {
  const seg = SEGS.find((s) => s.name === "replay")!;
  const t = v - seg.v0;
  const a = smooth(0, 0.12, t) * (1 - smooth(seg.v1 - seg.v0 - 0.12, seg.v1 - seg.v0, t));
  if (a <= 0) return null;
  const secs = 14 + t;
  const mm = Math.floor(secs / 60);
  const ss = Math.floor(secs % 60);
  const blink = Math.floor(t * 1.6) % 2 === 0;
  const focus = 1 - smooth(0.2, 0.9, t);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: a }}>
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 160px rgba(0,0,0,0.55)" }} />
      <div style={{ position: "absolute", top: 92, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(220,38,38,0.92)", borderRadius: 12, padding: "8px 20px" }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: blink ? "#FFFFFF" : "rgba(255,255,255,0.35)" }} />
          <div style={{ fontFamily: MONT.fontFamily, fontWeight: 600, fontSize: 34, color: "#FFFFFF", letterSpacing: 1 }}>
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      </div>
      {focus > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: 540 - 90,
            top: 820 - 90,
            width: 180,
            height: 180,
            border: "3px solid rgba(255,214,10,0.95)",
            opacity: focus,
            transform: `scale(${1 + 0.25 * focus})`,
          }}
        />
      ) : null}
      {/* the shutter button and the zoom pill, low down */}
      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 118, height: 118, borderRadius: 59, border: "6px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: "#E53935" }} />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 300, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ fontFamily: MONT.fontFamily, fontWeight: 700, fontSize: 28, color: "#FFD60A", background: "rgba(0,0,0,0.45)", borderRadius: 26, padding: "8px 18px" }}>2x</div>
      </div>
    </div>
  );
};

export const Overlay: React.FC<{ frame: number; seg: Seg; fps: number }> = ({ frame, seg, fps }) => {
  const v = frame / fps;
  const fadeOut = smooth(CUE.end - 0.7, CUE.end - 0.05, v);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Title v={v} />
      {seg === "replay" ? <PhoneUI v={v} /> : null}
      {fadeOut > 0 ? <div style={{ position: "absolute", inset: 0, background: "#000", opacity: fadeOut }} /> : null}
    </div>
  );
};
