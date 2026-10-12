import React from "react";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

/**
 * The only words: the title over the first seconds, while the kid is still crouched over the controller.
 * No narration, no captions.
 */

const MONT = loadMontserrat("normal", { weights: ["800", "900"], subsets: ["latin"] });

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

export const Overlay: React.FC<{ t: number }> = ({ t }) => {
  const t0 = 0.15;
  // gone as the drone lifts off and comes up to the kid's face
  const t1 = 3.35;
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
    // low on the screen, over the grass: the kid's face is up top
    <div style={{ position: "absolute", left: 60, right: 60, top: 1180, textAlign: "center", opacity: a }}>
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
        you're the drone carrying the wedding rings
      </div>
    </div>
  );
};
