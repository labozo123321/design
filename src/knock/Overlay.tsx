import React from "react";
import { FPS, smooth } from "./script";
import { hudState } from "./overlay/hud";
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
export const Overlay: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / FPS;
  const h = hudState(t);
  // a gentle darkening behind the HUD so its thin numerals hold over the lit hallway at the top of frame
  const day = (t >= 8 && t < 10.4) || (t >= 13.9 && t < 15) || (t >= 36 && t < 47.5) ? 1 : 0;
  const scrim = (0.3 + 0.15 * day) * smooth(3.0, 3.5, t);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, overflow: "hidden", pointerEvents: "none" }}>
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
