import React from "react";
import { random } from "remotion";
import { BEATS, SceneId, T } from "../timeline";
import { COLORS, SAFE } from "../theme";
import { FONTS } from "../fonts";

/** Security-cam clock per scene: the footage jumps through the same day. */
const CLOCK_BASES: [SceneId, number][] = [
  ["alarm", 6 * 3600], //                      06:00:00 AM
  ["everyMorning", 6 * 3600 + 9 * 60 + 12], // 06:09:12 AM
  ["sameCommute", 7 * 3600 + 41 * 60 + 3], //  07:41:03 AM
  ["sameDesk", 9 * 3600 + 2], //               09:00:02 AM
  ["spent", 17 * 3600], //                     05:00:00 PM
  ["sameLife", 23 * 3600 + 59 * 60 + 51], //   11:59:51 PM
];

const pad = (n: number) => String(n).padStart(2, "0");

export const formatClock = (secs: number) => {
  const s = ((Math.floor(secs) % 86400) + 86400) % 86400;
  const h24 = Math.floor(s / 3600);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${pad(h12)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)} ${h24 < 12 ? "AM" : "PM"}`;
};

const timestampAt = (frame: number) => {
  let base = CLOCK_BASES[0];
  for (const entry of CLOCK_BASES) if (frame >= T[entry[0]].from) base = entry;
  return formatClock(base[1] + (frame - T[base[0]].from) / 30);
};

export const REC_WINDOW = {
  on: T.alarm.from + BEATS.recOn,
  stop: T.blackout.from + BEATS.recStop,
};

type RecHudProps = {
  frame: number;
  /** Force the HUD on (the title-card glitch callback). */
  force?: boolean;
};

/** Blinking REC dot, camera label and a security-cam timestamp in IBM Plex Mono. */
export const RecHud: React.FC<RecHudProps> = ({ frame, force = false }) => {
  const live = frame >= REC_WINDOW.on && frame < REC_WINDOW.stop;
  if (!live && !force) return null;

  const dotOn = force || (frame - REC_WINDOW.on) % 30 < 18;
  const showText = force || frame < T.blackout.from;

  // During the "forever" glitch the clock itself loses its grip.
  const g = frame - T.sameLife.from;
  const scrambled = g >= BEATS.foreverAt && g < BEATS.foreverAt + BEATS.foreverLen;
  const time = force
    ? "06:00:00 AM"
    : scrambled
      ? `${pad(Math.floor(random(`ts-h-${frame}`) * 99))}:${pad(Math.floor(random(`ts-m-${frame}`) * 99))}:${pad(
          Math.floor(random(`ts-s-${frame}`) * 99),
        )} --`
      : timestampAt(frame);

  const text: React.CSSProperties = {
    fontFamily: FONTS.mono,
    fontWeight: 500,
    fontSize: 34,
    letterSpacing: "0.08em",
    color: "rgba(237,230,218,0.9)",
    textShadow: "0 0 8px rgba(237,230,218,0.35)",
    lineHeight: 1,
  };

  return (
    <>
      <div style={{ position: "absolute", left: SAFE.left, top: SAFE.top, ...text }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: "#C0161D",
              boxShadow: `0 0 16px ${COLORS.blood}, 0 0 4px #ff4a4a`,
              opacity: dotOn ? 1 : 0,
            }}
          />
          <span style={{ opacity: showText ? 1 : 0 }}>REC</span>
        </div>
        <div style={{ marginTop: 18, opacity: showText ? 1 : 0 }}>{time}</div>
      </div>
      <div
        style={{
          position: "absolute",
          right: SAFE.right,
          top: SAFE.top,
          opacity: showText ? 0.75 : 0,
          ...text,
        }}
      >
        CAM 01
      </div>
    </>
  );
};
