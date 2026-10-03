import React from "react";
import { AbsoluteFill } from "remotion";
import { SAFE } from "../theme";

/** Dev overlay (toggle with the `showSafeArea` prop): where text may live. */
export const SafeAreaGuides: React.FC = () => {
  const zone: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255,40,90,0.22)",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...zone, left: 0, right: 0, bottom: 0, height: SAFE.bottom }}>platform UI · 300px</div>
      <div
        style={{
          ...zone,
          top: 0,
          bottom: SAFE.bottom,
          right: 0,
          width: SAFE.right,
          writingMode: "vertical-rl",
        }}
      >
        like / comment rail · 140px
      </div>
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top: SAFE.top,
          right: SAFE.right,
          bottom: SAFE.bottom,
          outline: "3px dashed rgba(60,255,170,0.9)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 0,
          bottom: 0,
          width: 1,
          background: "rgba(60,255,170,0.4)",
        }}
      />
    </AbsoluteFill>
  );
};
