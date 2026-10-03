import React from "react";
import { interpolate } from "remotion";
// To enable audio: uncomment these two imports and the elements inside <AudioSlot />.
// (`Audio` from "remotion" is now called `Html5Audio`; the alias keeps the JSX readable.
//  `<Audio>` from "@remotion/media" works too if you prefer the WebCodecs-based tag.)
// import { Html5Audio as Audio, Sequence, staticFile } from "remotion";
// import { SFX } from "../timeline";
import { DURATION, T } from "../timeline";
import { CLAMP } from "../lib/anim";

/**
 * Score volume automation. Silence for the blackout (300–330, "no audio cue"),
 * the bass-drop silence right before the turn (530–540), soft head and tail so
 * the loop point is clean.
 */
export const scoreVolume = (f: number) =>
  interpolate(
    f,
    [
      0,
      10,
      T.blackout.from - 2,
      T.blackout.from,
      T.blackout.to,
      T.blackout.to + 2,
      T.inkBleed.to - 10,
      T.inkBleed.to - 8,
      T.inkBleed.to,
      T.inkBleed.to + 2,
      DURATION - 16,
      DURATION,
    ],
    [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
    CLAMP,
  );

/**
 * OPTIONAL AUDIO SLOT
 * -------------------
 * Drop files into /public and uncomment. Every cue reads its frame from
 * src/timeline.ts (SFX), so retiming a scene moves its sound with it.
 *
 *   CUE SHEET (absolute frames @ 30 fps, default timing)
 *   frame   15  sfx/alarm-beep-distorted.mp3   alarm beep, distorted
 *   frame   45  sfx/hit-cut.mp3                (optional) low hit on the hard cut
 *   frame  200  sfx/thud-heavy.mp3             SPENT stamp, heavy thud
 *   frame  240  sfx/glitch-in.mp3              (optional) glitch slice transition
 *   frame  270  sfx/glitch-forever.mp3         (optional) "same life. forever."
 *   frame  300  (nothing)                      total blackout, silence
 *   frames 330, 339, 347, 354, 360, 366, 371, 375, 379, 382, 385, 387
 *               sfx/hit-1.mp3 … hit-4.mp3      percussive hits on each flash frame
 *   frames 462, 474, 486  sfx/crack.mp3        (optional) glass crack bursts
 *   frame  530  (score drops out)              bass-drop silence
 *   frame  538  sfx/whoosh-reversed.mp3        reversed whoosh into the turn
 *   frame  655  sfx/click.mp3                  the period lands
 *   frame  744  sfx/tap.mp3                    (optional) cursor taps the button
 *   frame  780  sfx/whip.mp3                   (optional) whip pan
 *   frame  825  sfx/chime-confirm.mp3          satisfying confirm chime
 *   frame 1022  sfx/glitch-stinger.mp3         glitch stinger on the title
 */
export const AudioSlot: React.FC = () => {
  return (
    <>
      {/* SCORE ─ public/score.mp3, ducked by scoreVolume() */}
      {/* <Audio src={staticFile("score.mp3")} volume={(f) => scoreVolume(f)} /> */}

      {/* 15 · alarm beep, distorted */}
      {/* <Sequence from={SFX.alarmBeep} name="sfx alarm"><Audio src={staticFile("sfx/alarm-beep-distorted.mp3")} /></Sequence> */}

      {/* 45 · (optional) hit on the hard cut */}
      {/* <Sequence from={SFX.cutHit} name="sfx cut hit"><Audio src={staticFile("sfx/hit-cut.mp3")} /></Sequence> */}

      {/* 200 · SPENT stamp, heavy thud */}
      {/* <Sequence from={SFX.spentThud} name="sfx thud"><Audio src={staticFile("sfx/thud-heavy.mp3")} /></Sequence> */}

      {/* 240 · (optional) glitch slice in, 270 · (optional) "forever" glitch */}
      {/* <Sequence from={SFX.glitchIn} name="sfx glitch in"><Audio src={staticFile("sfx/glitch-in.mp3")} /></Sequence> */}
      {/* <Sequence from={SFX.foreverGlitch} name="sfx forever"><Audio src={staticFile("sfx/glitch-forever.mp3")} /></Sequence> */}

      {/* 330 … 387 · one percussive hit per flash frame (cycles hit-1 … hit-4) */}
      {/* {SFX.flashHits.map((f, i) => (
        <Sequence key={f} from={f} name={`sfx flash ${i + 1}`}>
          <Audio src={staticFile(`sfx/hit-${(i % 4) + 1}.mp3`)} />
        </Sequence>
      ))} */}

      {/* 462, 474, 486 · (optional) glass cracks */}
      {/* {SFX.crackHits.map((f) => (
        <Sequence key={f} from={f} name="sfx crack"><Audio src={staticFile("sfx/crack.mp3")} /></Sequence>
      ))} */}

      {/* 538 · reversed whoosh (score is silent 530 – 540) */}
      {/* <Sequence from={SFX.reversedWhoosh} name="sfx whoosh"><Audio src={staticFile("sfx/whoosh-reversed.mp3")} /></Sequence> */}

      {/* 655 · the period lands */}
      {/* <Sequence from={SFX.periodClick} name="sfx click"><Audio src={staticFile("sfx/click.mp3")} /></Sequence> */}

      {/* 744 · (optional) tap, 780 · (optional) whip */}
      {/* <Sequence from={SFX.outreachTap} name="sfx tap"><Audio src={staticFile("sfx/tap.mp3")} /></Sequence> */}
      {/* <Sequence from={SFX.whip} name="sfx whip"><Audio src={staticFile("sfx/whip.mp3")} /></Sequence> */}

      {/* 825 · confirm chime */}
      {/* <Sequence from={SFX.confirmChime} name="sfx chime"><Audio src={staticFile("sfx/chime-confirm.mp3")} /></Sequence> */}

      {/* 1022 · glitch stinger */}
      {/* <Sequence from={SFX.glitchStinger} name="sfx stinger"><Audio src={staticFile("sfx/glitch-stinger.mp3")} /></Sequence> */}
    </>
  );
};
