import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP } from "../lib/anim";
import { APP, PFONTS } from "../promo/fonts";
import { BRAND, FB } from "./choreo";
import { POSES, Stick, mix } from "./rig";

/** End card in the app's look. The hero gives a thumbs up; OVERTHINKING is still face down. Local frames. */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = spring({ frame: frame - 4, fps, config: { damping: 11, stiffness: 200 } });
  const hero = spring({ frame, fps, config: { damping: 12, stiffness: 160 } });
  const tag = spring({
    frame: frame - (FB.endVo - FB.end) - 22,
    fps,
    config: { damping: 15, stiffness: 200 },
  });
  const pill = spring({ frame: frame - (FB.pill - FB.end), fps, config: { damping: 10, stiffness: 220 } });
  const thumbs = interpolate(frame, [10, 20], [0, 1], CLAMP);
  const hop = Math.abs(Math.sin(frame * 0.18)) * 10 * thumbs;
  const fade = interpolate(frame, [118, 128], [1, 0], CLAMP);
  const split = BRAND.search(/[A-Z](?=[a-z]*$)/);
  return (
    <AbsoluteFill
      style={{ background: `radial-gradient(ellipse at 50% 42%, #18202E 0%, ${APP.bg} 65%)`, opacity: fade }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 2px, transparent 2px)",
          backgroundSize: "40px 40px",
        }}
      />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(540 ${640 - hop}) scale(${1.5 * hero})`}>
          <Stick
            pose={mix(POSES.victory, POSES.thumbs, thumbs)}
            face={1}
            color="#F4F4F4"
            back="#A9AAB8"
            band={APP.lime}
            bandPhase={frame * 0.5}
          />
        </g>
        {/* the defeated boss, small and sulking */}
        <g transform="translate(820 1340) scale(0.55)" opacity={0.85}>
          <Stick pose={POSES.down} face={-1} color="#E0303F" back="#8E1B28" eyes="#FFE36A" />
        </g>
        <ellipse cx={540} cy={646} rx={70 * hero} ry={10} fill="#000" opacity={0.4} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 720,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 170,
          letterSpacing: "-0.04em",
          color: "#fff",
          transform: `scale(${word})`,
        }}
      >
        {BRAND.slice(0, split)}
        <span style={{ color: APP.lime }}>{BRAND.slice(split)}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 930,
          textAlign: "center",
          fontFamily: PFONTS.app,
          fontWeight: 800,
          fontSize: 50,
          lineHeight: 1.2,
          color: "#E8ECF4",
          opacity: tag,
          transform: `translateY(${(1 - tag) * 24}px)`,
        }}
      >
        We'll walk you through
        <br />
        the <span style={{ color: APP.lime }}>scary parts.</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 140,
          top: 1130,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: APP.lime,
            color: APP.bg,
            fontFamily: PFONTS.app,
            fontWeight: 900,
            fontSize: 40,
            letterSpacing: "0.08em",
            padding: "16px 40px",
            borderRadius: 999,
            boxShadow: `0 8px 0 ${APP.limeDark}`,
            transform: `scale(${pill})`,
          }}
        >
          COMING SOON
        </div>
      </div>
    </AbsoluteFill>
  );
};
