import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Overlay } from "./Overlay";
import { FPS, smooth } from "./script";

/**
 * The overlay alone over a stand-in for the picture: the overhead two-room plan (hallway strip at the top,
 * two beds with their pillows against the seam, the front windows at the bottom), lit roughly by era, so type
 * and timing can be judged over both dark floors and the bright hallway.
 */
const Room: React.FC<{ t: number }> = ({ t }) => {
  // era grade: warm childhood, the storm's blue-violet, the drift's slate, the payoff's gold
  const storm = smooth(15, 15.2, t) * (1 - smooth(22.3, 22.5, t));
  const drift = smooth(36, 37, t) * (1 - smooth(59.1, 60, t));
  const floor = storm > 0.5 ? "#1E1F3A" : drift > 0.5 ? "#232A33" : "#2B2A30";
  const hall = t < 3.0 ? 0.85 : t > 47.5 && t < 66.8 ? 0.55 : 0.12;
  const flashes = [10.4, 13.9, 15.0, 15.8, 19.5, 36.0, 37.0, 38.8, 49.0];
  const flash = Math.max(0, ...flashes.map((f) => (t >= f && t < f + 3 / FPS ? 1 - (t - f) * 10 : 0)));
  return (
    <AbsoluteFill style={{ background: floor }}>
      {/* hallway beyond the back wall */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 330, background: `linear-gradient(to bottom, rgba(255,214,150,${hall * 0.75}), rgba(255,196,120,${hall * 0.45}))` }} />
      <div style={{ position: "absolute", left: 0, top: 330, width: 1080, height: 26, background: "#D8D0C2" }} />
      {/* doors */}
      <div style={{ position: "absolute", left: 48, top: 300, width: 170, height: 60, background: "#3A3530" }} />
      <div style={{ position: "absolute", left: 862, top: 300, width: 170, height: 60, background: "#3A3530" }} />
      {/* beds */}
      {[-1, 1].map((s) => (
        <React.Fragment key={s}>
          <div style={{ position: "absolute", left: s < 0 ? 300 : 552, top: 356, width: 228, height: 560, borderRadius: 12, background: s < 0 ? "#5B4A86" : "#3E5368" }} />
          <div style={{ position: "absolute", left: s < 0 ? 330 : 572, top: 380, width: 178, height: 96, borderRadius: 30, background: "#E9E4DA" }} />
          <div style={{ position: "absolute", left: s < 0 ? 380 : 618, top: 400, width: 74, height: 84, borderRadius: 37, background: "#E8BFA4" }} />
        </React.Fragment>
      ))}
      {/* the shared wall's cut top */}
      <div style={{ position: "absolute", left: 528, top: 330, width: 24, height: 1300, background: "#E8E2D6" }} />
      <div style={{ position: "absolute", left: 534, top: 330, width: 12, height: 1300, background: "#2A221C" }} />
      {/* front wall and windows, porch roof */}
      <div style={{ position: "absolute", left: 0, top: 1630, width: 1080, height: 26, background: "#D8D0C2" }} />
      {[120, 340, 740, 960].map((x) => (
        <div key={x} style={{ position: "absolute", left: x - 70, top: 1630, width: 140, height: 26, background: "#7FA3C8" }} />
      ))}
      <div style={{ position: "absolute", left: 0, top: 1656, width: 1080, height: 264, background: "repeating-linear-gradient(0deg, #3B3A3F 0 14px, #343338 14px 28px)" }} />
      {/* a streetlight shaft across the floor */}
      <div style={{ position: "absolute", left: 60, top: 980, width: 960, height: 420, background: "linear-gradient(160deg, rgba(190,210,255,0.0), rgba(190,210,255,0.10), rgba(190,210,255,0.0))" }} />
      {flash > 0 ? <AbsoluteFill style={{ background: `rgba(255,255,255,${(0.7 * flash).toFixed(3)})` }} /> : null}
    </AbsoluteFill>
  );
};

export const OverlayTest: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Room t={frame / FPS} />
      <Overlay frame={frame} />
    </AbsoluteFill>
  );
};
