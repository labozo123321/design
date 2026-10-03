import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AlarmDigits } from "../components/AlarmDigits";
import { BEATS } from "../timeline";
import { COLORS, FOCUS_Y } from "../theme";
import { CLAMP, EASE } from "../lib/anim";
import { SceneProps } from "./types";

export const ALARM = { cx: 540, cy: FOCUS_Y, height: 300 } as const;

/** Power-on flicker pattern (step function), one value per frame from power-on. */
const POWER_ON = [1, 0, 0.75, 0.1, 0, 1, 0.55, 1];

export const alarmPower = (frame: number, onAt: number) => {
  const d = frame - onAt;
  if (d < 0) return 0;
  return d < POWER_ON.length ? POWER_ON[d] : 1;
};

/** Distorted beep envelope: a hard 4-frame spike on every beep. */
export const beepPulse = (frame: number, beeps: number[]) =>
  beeps.reduce((acc, b) => {
    const d = frame - b;
    return d >= 0 && d < 4 ? Math.max(acc, [1, 0.75, 0.4, 0.15][d]) : acc;
  }, 0);

/**
 * 0–45 · Black. Grain fades in (global layer), REC HUD pops on, then the alarm
 * flickers on at 6:00 and starts beeping (SFX @ 15).
 */
export const Act1Alarm: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const power = alarmPower(frame, BEATS.alarmPowerOn);
  const pulse = beepPulse(frame, BEATS.alarmBeeps);
  const push = interpolate(frame, [0, duration], [1, 1.035], { ...CLAMP, easing: EASE.noir });

  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <AlarmDigits
          {...ALARM}
          power={power * (0.82 + 0.18 * pulse)}
          glow={0.7 + 0.6 * pulse}
          chroma={pulse * 9}
          reflection={0.22}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
