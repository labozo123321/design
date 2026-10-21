import React from "react";
import { FPS, smooth } from "./script";
import { dayLit, hudState } from "./overlay/hud";
import { Hud } from "./overlay/HudBand";
import { Captions, Title } from "./overlay/Captions";
import { Chat } from "./overlay/Chat";
import { EndCard } from "./overlay/EndCard";

/**
 * Everything drawn over the picture, as DOM in the 1080x1920 frame, a pure function of the frame: a soft
 * scrim under the HUD, the HUD band (y = 200..470), the title card, the b7 chat card, the captions (baseline
 * y = 1430) and the end card. Clear of Instagram's UI: nothing above y = 200, nothing below the captions,
 * nothing that matters right of x = 930 except the HUD's right-aligned clock up top.
 */
/** The picture's white flash frames (director: time-lapse night cuts and the era jumps). */
const FLASHES: [number, number][] = [
  [8.0, 8.067],
  [9.333, 9.4],
  [10.35, 10.45],
  [13.9, 13.967],
  [22.5, 22.55],
  [28.0, 28.05],
  [35.95, 36.05],
  [36.95, 37.05],
  [38.75, 38.85],
  [48.95, 49.05],
];

export const Overlay: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / FPS;
  const h = hudState(t);
  // a gentle darkening behind the HUD so its thin numerals hold over the lit hallway at the top of frame
  // (deeper while the picture is day-lit); it comes in after the hallway light clicks off at 3.0
  // (and in 2025's close shots, where the wall's pale cut top runs right behind the clock)
  const close25 = smooth(50.6, 51.2, t) * (1 - smooth(63.6, 64.2, t));
  const scrim = (0.3 + 0.22 * dayLit(t) + 0.18 * close25) * smooth(3.0, 3.5, t);
  // on the picture's white flash cuts the HUD's dark backing would print as a smudge: let the flash through
  const flash = FLASHES.some(([a, b]) => t >= a - 1e-6 && t < b);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, overflow: "hidden", pointerEvents: "none", opacity: flash ? 0.15 : 1 }}>
      {scrim > 0.002 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1080,
            height: 620,
            background: `linear-gradient(to bottom, rgba(0,0,0,${scrim.toFixed(3)}) 0%, rgba(0,0,0,${(scrim * 0.62).toFixed(3)}) 52%, rgba(0,0,0,0) 100%)`,
          }}
        />
      ) : null}
      <EndCard t={t} tint={h.tint} />
      <Hud h={h} />
      <Title t={t} />
      <Chat t={t} />
      <Captions t={t} />
    </div>
  );
};
