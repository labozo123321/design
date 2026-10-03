import React from "react";
import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { AlarmDigits } from "../components/AlarmDigits";
import { COLORS } from "../theme";
import { CLAMP, EASE, ramp } from "../lib/anim";
import { ALARM, alarmPower } from "./Act1Alarm";
import { SceneProps } from "./types";

const POWER_ON = 3;
const TURN_START = 12;
const TURN_END = 46;

/**
 * 840–900 · Hard cut to black. The alarm from frame 0 is back at 6:00, same
 * spot, but no REC this time. The digits slowly turn from red to gold.
 */
export const Act4AlarmGold: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const turn = ramp(frame, TURN_START, TURN_END, EASE.noir);
  const color = interpolateColors(turn, [0, 0.5, 1], [COLORS.led, "#C0603A", COLORS.gold]);
  const ghost = interpolateColors(turn, [0, 1], [COLORS.ledGhost, "#1A1408"]);
  const powerDown = interpolate(frame, [duration - 8, duration - 1], [1, 0], { ...CLAMP, easing: EASE.noir });
  const push = interpolate(frame, [0, duration], [1, 1.05], { ...CLAMP, easing: EASE.noir });

  return (
    <AbsoluteFill style={{ background: COLORS.black }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <AlarmDigits
          {...ALARM}
          color={color}
          ghostColor={ghost}
          power={alarmPower(frame, POWER_ON) * powerDown}
          glow={0.75 + turn * 0.35}
          reflection={0.22}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
