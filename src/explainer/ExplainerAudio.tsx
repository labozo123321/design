import React from "react";
import { Html5Audio as Audio, interpolate, Sequence, staticFile } from "remotion";
import { E, EB, EX_DURATION, ExSceneId } from "./timeline";
import { CLAMP } from "../lib/anim";

const MASTER = 0.72;
type Cue = { frame: number; file: string; volume: number };
const at = (s: ExSceneId, f: number) => E[s].from + f;
const sfx = (f: string) => `sfx/${f}.mp3`;
const promo = (f: string) => `promo/sfx/${f}.mp3`;

/** UI sound design, reusing the trailer and promo SFX libraries. */
export const EXPLAINER_CUES: Cue[] = [
  // hook
  ...EB.hookWords.map((w) => ({ frame: at("hook", w), file: promo("pop"), volume: 0.35 })),
  { frame: at("hook", 52), file: sfx("swoosh"), volume: 0.35 },
  { frame: at("hook", EB.hookWipe), file: promo("whoosh"), volume: 0.5 },
  // 01 path
  { frame: at("path", EB.pathPhone), file: sfx("swoosh"), volume: 0.4 },
  ...EB.pathChecks.map((c, i) => ({ frame: at("path", c), file: sfx(`pop-${i + 1}`), volume: 0.5 })),
  { frame: at("path", EB.pathCurrent), file: sfx("pop-5"), volume: 0.55 },
  { frame: at("path", EB.pathCardOut), file: sfx("swoosh"), volume: 0.45 },
  // 02 move
  ...EB.moveSteps.map((s, i) => ({ frame: at("move", s), file: sfx(`tick-${i + 1}`), volume: 0.5 })),
  ...EB.moveSteps.map((s) => ({ frame: at("move", s + 2), file: sfx("pop-chip"), volume: 0.3 })),
  { frame: at("move", EB.moveDone), file: sfx("chime-confirm"), volume: 0.5 },
  { frame: at("move", EB.moveDone), file: promo("confetti"), volume: 0.4 },
  // 03 regulars
  { frame: at("regulars", 0), file: sfx("whip"), volume: 0.5 },
  { frame: at("regulars", EB.regType), file: sfx("typing-look"), volume: 0.4 },
  { frame: at("regulars", EB.regSave), file: sfx("ui-click"), volume: 0.55 },
  { frame: at("regulars", EB.regTap), file: sfx("ui-click"), volume: 0.6 },
  { frame: at("regulars", EB.regTap + 4), file: sfx("swoosh"), volume: 0.35 },
  { frame: at("regulars", EB.regSent), file: sfx("sent"), volume: 0.5 },
  // 04 money
  { frame: at("money", 0), file: sfx("swoosh"), volume: 0.4 },
  ...EB.moneyTabs.map((t) => ({ frame: at("money", t), file: sfx("ui-click"), volume: 0.45 })),
  { frame: at("money", EB.moneyTap), file: sfx("ui-click"), volume: 0.6 },
  { frame: at("money", EB.moneyStep), file: promo("pop"), volume: 0.5 },
  { frame: at("money", EB.moneyBadge), file: promo("unlock"), volume: 0.4 },
  { frame: at("money", E.money.duration - 14), file: promo("whoosh"), volume: 0.5 },
  // end
  { frame: at("end", EB.endWord), file: promo("pop"), volume: 0.45 },
  { frame: at("end", EB.endPill), file: sfx("chime-confirm"), volume: 0.45 },
];

const musicVolume = (f: number) =>
  interpolate(f, [0, 2, EX_DURATION - 12, EX_DURATION], [0.9, 0.9, 0.9, 0], CLAMP);

/** duck: 0..1 multiplier per frame, used by the voiceover cut to sit the music under the voice. */
export const ExplainerAudio: React.FC<{ duck?: (f: number) => number; sfxGain?: number }> = ({
  duck = () => 1,
  sfxGain = 1,
}) => (
  <>
    <Audio src={staticFile("explainer/music.mp3")} volume={(f) => musicVolume(f) * duck(f) * MASTER} />
    {EXPLAINER_CUES.map((c, i) => (
      <Sequence key={i} from={c.frame} name={c.file} layout="none">
        <Audio src={staticFile(c.file)} volume={c.volume * sfxGain * MASTER} />
      </Sequence>
    ))}
  </>
);
