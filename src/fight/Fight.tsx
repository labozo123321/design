import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { CLAMP } from "../lib/anim";
import { PFONTS } from "../promo/fonts";
import { Arena } from "./Arena";
import { EndCard } from "./EndCard";
import { FB, FIGHT_DURATION } from "./choreo";
import { Reality } from "./Reality";
import { FightAudio } from "./FightAudio";

/** Meme caption across the top, TikTok style: it frames the whole joke from the first frame. */
const MemeCaption: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= FB.end) return null;
  const real = frame >= FB.cut;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: 112,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          color: "#0B0B0D",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: real ? 50 : 44,
          lineHeight: 1.18,
          textAlign: "center",
          padding: "16px 26px",
          borderRadius: 18,
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
        }}
      >
        {real ? "what actually happened:" : "me sending ONE email for my side hustle:"}
      </div>
    </div>
  );
};

/** High-speed stickman fight, then the reveal: it was one email. */
export const Fight: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = frame >= FB.cut ? interpolate(frame, [FB.cut, FB.cut + 3], [1, 0], CLAMP) : 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={FB.cut} name="arena">
        <Arena />
      </Sequence>
      <Sequence from={FB.cut} durationInFrames={FB.end - FB.cut} name="reality">
        <Reality />
      </Sequence>
      <Sequence from={FB.end} durationInFrames={FIGHT_DURATION - FB.end} name="end">
        <EndCard />
      </Sequence>
      <MemeCaption />
      {flash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: flash }} /> : null}
      <FightAudio />
    </AbsoluteFill>
  );
};
