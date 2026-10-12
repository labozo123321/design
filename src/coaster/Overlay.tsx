import React from "react";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import ENDING from "./ending.json";

/**
 * The only words: the title over the first seconds, and her "again?" at the end. No narration.
 */

const MONT = loadMontserrat("normal", { weights: ["600", "800", "900"], subsets: ["latin"] });
const FRED = loadFredoka("normal", { weights: ["600", "700"], subsets: ["latin"] });

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const pop = (t: number, t0: number, dur = 0.24, over = 1.12) => {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u < 0.6 ? (u / 0.6) * over : over + (1 - over) * ((u - 0.6) / 0.4);
};

const Title: React.FC<{ t: number }> = ({ t }) => {
  const t0 = 0.15;
  const t1 = 3.5;
  const a = smooth(t0, t0 + 0.12, t) * (1 - smooth(t1 - 0.25, t1, t));
  if (a <= 0) return null;
  const s1 = pop(t, t0);
  const s2 = pop(t, t0 + 0.18);
  const stroke = {
    WebkitTextStroke: "9px #111",
    paintOrder: "stroke fill" as const,
    textShadow: "0 6px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.35)",
  };
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 230, textAlign: "center", opacity: a }}>
      <div style={{ fontFamily: MONT.fontFamily, fontWeight: 900, fontSize: 70, color: "#FFD23F", transform: `scale(${s1})`, ...stroke }}>
        POV:
      </div>
      <div
        style={{
          fontFamily: MONT.fontFamily,
          fontWeight: 800,
          fontSize: 76,
          lineHeight: 1.08,
          color: "#FFFFFF",
          transform: `scale(${s2})`,
          marginTop: 4,
          ...stroke,
        }}
      >
        your little sister wanted the front row
      </div>
    </div>
  );
};

/** Her line at the end, in a speech bubble by her face. */
const Again: React.FC<{ t: number }> = ({ t }) => {
  const t0 = ENDING.rideEnd + ENDING.again;
  if (t < t0) return null;
  const s = pop(t, t0, 0.28, 1.18);
  const wob = Math.sin((t - t0) * 7) * 2 * Math.exp(-(t - t0) * 2);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", transform: `scale(${s}) rotate(${-3 + wob}deg)` }}>
        <div
          style={{
            fontFamily: FRED.fontFamily,
            fontWeight: 700,
            fontSize: 118,
            color: "#1B1B1F",
            background: "#FFFFFF",
            padding: "14px 54px 26px",
            borderRadius: 70,
            boxShadow: "0 10px 0 rgba(0,0,0,0.25)",
          }}
        >
          again?
        </div>
        <div
          style={{
            position: "absolute",
            left: "62%",
            bottom: -40,
            width: 0,
            height: 0,
            borderLeft: "26px solid transparent",
            borderRight: "26px solid transparent",
            borderTop: "48px solid #FFFFFF",
            transform: "rotate(-20deg)",
          }}
        />
      </div>
    </div>
  );
};

export const Overlay: React.FC<{ t: number }> = ({ t }) => (
  <>
    <Title t={t} />
    <Again t={t} />
  </>
);
