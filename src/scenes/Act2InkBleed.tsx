import React from "react";
import { AbsoluteFill, Easing, Sequence, useCurrentFrame } from "remotion";
import { InkBleed } from "../components/InkBleed";
import { BEATS, T } from "../timeline";
import { ramp } from "../lib/anim";
import { Act2CrackedClock, IMPACT } from "./Act2CrackedClock";
import { SceneProps } from "./types";

/**
 * 510–540 · Ink-bleed transition. Black ink seeps out of the crack's impact
 * point and swallows the frame (the clock keeps twitching underneath). Then
 * silence, and a reversed whoosh at 538 pulls us into the turn.
 */
export const Act2InkBleed: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const progress = ramp(frame, 0, BEATS.inkCovered, Easing.bezier(0.55, 0, 0.75, 0.6));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {frame < BEATS.inkCovered ? (
        // the cracked clock carries on beneath the ink
        <Sequence from={-T.crackedClock.duration} layout="none">
          <Act2CrackedClock duration={T.crackedClock.duration + duration} />
        </Sequence>
      ) : null}
      <InkBleed progress={progress} origin={IMPACT} seed="ink-bleed" />
    </AbsoluteFill>
  );
};
