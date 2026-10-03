import React from "react";
import { Html5Audio as Audio, interpolate, Sequence, staticFile } from "remotion";
import { DURATION, SFX, T } from "../timeline";
import { CLAMP } from "../lib/anim";

/**
 * SOUNDTRACK
 * ----------
 * Original score + sound design, synthesised by scripts/generate-audio.py into
 * public/score.mp3 and public/sfx/*.mp3 (no samples, no licensed music).
 *
 * Every SFX frame comes from src/timeline.ts, so retiming a scene moves its
 * sounds with it. The score is one 36 s track written to the default timing;
 * if you retime, regenerate it (see the script header).
 */

/**
 * Score automation: silent through the blackout (300–330, "no audio cue") and
 * the bass drop before the turn (530–540), soft head and tail for the loop.
 */
export const scoreVolume = (f: number) =>
  interpolate(
    f,
    [
      0,
      8,
      T.blackout.from - 1,
      T.blackout.from,
      T.blackout.to,
      T.blackout.to + 1,
      T.inkBleed.to - 10,
      T.inkBleed.to - 9,
      T.inkBleed.to,
      T.inkBleed.to + 1,
      T.search.from,
      T.checklist.to - 1,
      T.checklist.to,
      DURATION - 16,
      DURATION,
    ],
    // the Act 3 groove is dense, so it sits lower and the UI sounds ride on top
    [0, 0.9, 0.9, 0, 0, 0.9, 0.9, 0, 0, 0.9, 0.62, 0.62, 0.9, 0.9, 0],
    CLAMP,
  );

/** Master gain: keeps the summed mix under 0 dBFS true peak (about -14 LUFS). */
const MASTER = 0.8;

type Cue = {
  /** absolute frame the sound should hit */
  frame: number;
  file: string;
  volume: number;
  /** start this many frames early (for sounds that build into their hit) */
  leadIn?: number;
};

const many = (frames: readonly number[], file: (i: number) => string, volume: number): Cue[] =>
  frames.map((frame, i) => ({ frame, file: file(i), volume }));

export const CUES: Cue[] = [
  // ACT 1 · the routine
  { frame: SFX.alarmBeep, file: "alarm-beep-distorted", volume: 0.55 },
  { frame: SFX.cutHit, file: "hit-cut", volume: 0.8 },
  { frame: SFX.spentThud, file: "thud-heavy", volume: 1 },
  { frame: SFX.glitchIn, file: "glitch-in", volume: 0.5 },
  { frame: SFX.foreverGlitch, file: "glitch-forever", volume: 0.6 },
  // ACT 2 · the dread
  ...many(SFX.flashHits, (i) => `hit-${(i % 4) + 1}`, 0.5),
  { frame: SFX.balanceGlitch, file: "glitch-in", volume: 0.45 },
  { frame: SFX.glitchIn2, file: "glitch-forever", volume: 0.5 },
  ...many(SFX.crackHits, () => "crack", 0.8),
  { frame: SFX.reversedWhoosh, file: "whoosh-reversed", volume: 0.8, leadIn: 25 },
  // ACT 3 · the turn
  ...many(SFX.uiClicks, () => "ui-click", 0.6),
  { frame: SFX.typingSearch, file: "typing-search", volume: 0.45 },
  ...many(SFX.strikes, () => "strike", 0.35),
  { frame: SFX.iris, file: "swoosh", volume: 0.4 },
  { frame: SFX.typingLook, file: "typing-look", volume: 0.45 },
  { frame: SFX.periodClick, file: "click", volume: 0.8 },
  { frame: SFX.tiltIn, file: "swoosh", volume: 0.45 },
  ...many(SFX.nodePops, (i) => `pop-${i + 1}`, 0.45),
  { frame: SFX.ctaPop, file: "pop-chip", volume: 0.35 },
  { frame: SFX.zoom, file: "swoosh", volume: 0.35 },
  { frame: SFX.outreachTap, file: "ui-click", volume: 0.65 },
  { frame: SFX.sent, file: "sent", volume: 0.5 },
  { frame: SFX.whip, file: "whip", volume: 0.6 },
  ...many(SFX.chipPops, () => "pop-chip", 0.4),
  { frame: SFX.bossFlip, file: "flip", volume: 0.45 },
  ...many(SFX.checklistTicks, (i) => `tick-${i + 1}`, 0.45),
  { frame: SFX.confirmChime, file: "chime-confirm", volume: 0.6 },
  // ACT 4 · the title
  { frame: SFX.cutToBlack, file: "boom", volume: 0.65 },
  { frame: SFX.titleHit, file: "title-hit", volume: 0.8 },
  { frame: SFX.glitchStinger, file: "glitch-stinger", volume: 0.7 },
];

export const AudioSlot: React.FC = () => (
  <>
    <Audio src={staticFile("score.mp3")} volume={(f) => scoreVolume(f) * MASTER} />
    {CUES.map((cue, i) => (
      <Sequence key={i} from={cue.frame - (cue.leadIn ?? 0)} name={`sfx ${cue.file}`} layout="none">
        <Audio src={staticFile(`sfx/${cue.file}.mp3`)} volume={cue.volume * MASTER} />
      </Sequence>
    ))}
  </>
);
