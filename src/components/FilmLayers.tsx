import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ACTS, BEATS, DURATION, T } from "../timeline";
import { CLAMP } from "../lib/anim";
import { Grain } from "./Grain";
import { RecHud } from "./RecHud";
import { Scanlines } from "./Scanlines";
import { Vignette } from "./Vignette";

/** Grain level at frame 0 and at the last frame: the loop seam. */
export const GRAIN_SEAM = 0.06;

const GRAIN_KEYS: [number, number][] = [
  [0, GRAIN_SEAM],
  [30, 0.36], //                          "grain fades in"
  [T.blackout.from - 1, 0.36],
  [T.blackout.from, 0.14], //             blackout: the tape is still rolling
  [T.blackout.to - 1, 0.14],
  [T.blackout.to, 0.38], //               the dread
  [ACTS.turn.from - 1, 0.38],
  [ACTS.turn.from + 8, 0.2], //           the turn: grain lingers at 20%
  [ACTS.title.from - 1, 0.2],
  [ACTS.title.from, 0.22], //             the title: cleaner, editorial
  [T.fadeOut.from, 0.22],
  [DURATION, GRAIN_SEAM], //              back to the exact look of frame 0
];

export const grainLevel = (frame: number) =>
  interpolate(
    frame,
    GRAIN_KEYS.map(([f]) => f),
    GRAIN_KEYS.map(([, v]) => v),
    CLAMP,
  );

const inRange = (f: number, from: number, to: number) => f >= from && f < to;

/**
 * Film treatment that sits on top of every scene and changes per act:
 * found-footage grain, dust, scanlines and vignette in the horror acts, a
 * whisper of grain over the clean UI, and the REC HUD.
 */
export const FilmLayers: React.FC = () => {
  const frame = useCurrentFrame();
  const routine = inRange(frame, ACTS.routine.from, ACTS.routine.to);
  const dread = inRange(frame, ACTS.dread.from, ACTS.dread.to);
  const turn = inRange(frame, ACTS.turn.from, ACTS.turn.to);
  const hitStart = T.titleGlitch.from + BEATS.titleGlitch;
  const titleHit = inRange(frame, hitStart, hitStart + BEATS.titleGlitchLen);

  const vignette = routine || dread ? 0.85 : turn ? 0.16 : 0.72;
  const scan = titleHit ? 0.45 : routine ? 0.22 : dread ? 0.16 : 0;
  // Dust ramps in with the grain so frame 0 (the loop seam) is only black + grain.
  const dust = routine ? interpolate(frame, [0, 30], [0, 1], CLAMP) : dread ? 0.5 : titleHit ? 1 : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <Vignette strength={vignette} />
      <RecHud frame={frame} force={titleHit} />
      <Scanlines opacity={scan} roll={routine || dread ? 1 : 0} />
      <Grain opacity={grainLevel(frame)} blend="screen" dust={dust} />
      {turn ? <Grain opacity={0.2} blend="overlay" seed="grain-ui" frequency={0.95} /> : null}
    </AbsoluteFill>
  );
};
