import React from "react";
import { AbsoluteFill, Html5Audio as Audio, Sequence, interpolate, staticFile } from "remotion";
import { CLAMP } from "../lib/anim";
import "../promo/fonts";
import "./fonts";
import { Caption, Reveal, WipeKind } from "./kit";
import { S1Paper } from "./scenes/S1Paper";
import { S2Blueprint } from "./scenes/S2Blueprint";
import { S3Bauhaus } from "./scenes/S3Bauhaus";
import { S4Riso } from "./scenes/S4Riso";
import { S5Groovy } from "./scenes/S5Groovy";
import { S6End } from "./scenes/S6End";
import { LINES, SC, STORY_DURATION, StorySceneId, lineAbs, seqDuration, seqFrom } from "./timeline";

const SCENES: { id: StorySceneId; C: React.FC; wipe: WipeKind }[] = [
  { id: "paper", C: S1Paper, wipe: "iris" },
  { id: "blueprint", C: S2Blueprint, wipe: "tear" },
  { id: "bauhaus", C: S3Bauhaus, wipe: "iris" },
  { id: "riso", C: S4Riso, wipe: "blinds" },
  { id: "groovy", C: S5Groovy, wipe: "sun" },
  { id: "end", C: S6End, wipe: "split" },
];

const MASTER = 0.8;
type Cue = { frame: number; file: string; volume: number };
const sfx = (n: string) => `sfx/${n}.mp3`;
const promo = (n: string) => `promo/sfx/${n}.mp3`;
const word = (id: StorySceneId, k: number, w: number) => LINES[SC[id].lines[k]].words[w].at;

/** Sound effects, all cued off the voice timings. */
const CUES: Cue[] = [
  // paper
  ...[0, 1, 2].map((w) => ({ frame: word("paper", 0, w) - 2, file: promo("paper"), volume: 0.35 })),
  { frame: word("paper", 0, 3) - 2, file: promo("sticker"), volume: 0.4 },
  ...[1, 3, 5, 7].map((w, i) => ({
    frame: word("paper", 1, w) - 3,
    file: promo(`bubble-${(i % 3) + 1}`),
    volume: 0.45,
  })),
  // blueprint
  { frame: SC.blueprint.from - 6, file: promo("paper"), volume: 0.5 },
  { frame: lineAbs("blueprint", 0), file: promo("marker"), volume: 0.35 },
  { frame: word("blueprint", 1, 4) - 2, file: sfx("strike"), volume: 0.5 },
  { frame: word("blueprint", 1, 4) - 2, file: sfx("thud-heavy"), volume: 0.35 },
  // bauhaus
  { frame: SC.bauhaus.from - 8, file: promo("whoosh"), volume: 0.45 },
  { frame: lineAbs("bauhaus", 0) - 6, file: sfx("hit-1"), volume: 0.4 },
  { frame: lineAbs("bauhaus", 0) - 1, file: sfx("hit-2"), volume: 0.35 },
  { frame: lineAbs("bauhaus", 0) + 4, file: sfx("hit-3"), volume: 0.35 },
  { frame: word("bauhaus", 1, 0), file: sfx("swoosh"), volume: 0.35 },
  ...[0, 1, 2, 3, 4].map((i) => ({
    frame: word("bauhaus", 1, 5) - 4 + i * 4,
    file: sfx(`pop-${i + 1}`),
    volume: 0.4,
  })),
  { frame: word("bauhaus", 1, 10), file: sfx("chime-confirm"), volume: 0.4 },
  // riso
  { frame: SC.riso.from - 8, file: sfx("whip"), volume: 0.4 },
  ...[0, 1, 2, 3].map((k) => ({
    frame: lineAbs("riso", k) - 1,
    file: promo(k % 2 ? "punch" : "slap"),
    volume: 0.42,
  })),
  { frame: lineAbs("riso", 3) + 4, file: sfx("whoosh-reversed"), volume: 0.3 },
  // groovy
  { frame: SC.groovy.from - 8, file: promo("whoosh"), volume: 0.45 },
  ...[0, 1, 2].map((i) => ({ frame: word("groovy", 0, 1) + i * 5, file: promo("land"), volume: 0.35 })),
  { frame: lineAbs("groovy", 1) - 4, file: promo("powerup"), volume: 0.3 },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({
    frame: word("groovy", 2, 2) - 4 + i * 3,
    file: sfx("tick-2"),
    volume: 0.3,
  })),
  // end
  { frame: SC.end.from - 6, file: sfx("swoosh"), volume: 0.4 },
  { frame: lineAbs("end", 0) + 2, file: sfx("title-hit"), volume: 0.5 },
  { frame: lineAbs("end", 1) + 34, file: sfx("chime-confirm"), volume: 0.4 },
];

/** Music drops about 8 dB under the voice. */
const duck = (f: number) => {
  let d = 1;
  for (const l of LINES) {
    const v = interpolate(
      f,
      [l.from - 5, l.from, l.from + l.duration, l.from + l.duration + 8],
      [0, 1, 1, 0],
      CLAMP,
    );
    d = Math.min(d, 1 - v * 0.6);
  }
  return d;
};
const musicVolume = (f: number) =>
  interpolate(f, [STORY_DURATION - 20, STORY_DURATION], [0.9, 0], CLAMP) * duck(f);

/** Brand-new 30 s spot: six art styles, voice-driven edit, male voiceover, synced captions. */
export const Story: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {SCENES.map(({ id, C, wipe }) => (
      <Sequence key={id} name={id} from={seqFrom(id)} durationInFrames={seqDuration(id)}>
        {id === "paper" ? (
          <C />
        ) : (
          <Reveal kind={wipe}>
            <C />
          </Reveal>
        )}
      </Sequence>
    ))}
    {/* captions, skipped on the end card where the words are on screen */}
    {LINES.map((l, i) =>
      l.scene === "end" ? null : (
        <Sequence key={l.file} from={l.from} durationInFrames={l.duration + 7} name={`cc ${l.text}`}>
          <Caption index={i} offset={l.from} />
        </Sequence>
      ),
    )}
    <Audio src={staticFile("story/music.mp3")} volume={(f) => musicVolume(f) * MASTER} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, c.frame)} name={c.file} layout="none">
        <Audio src={staticFile(c.file)} volume={c.volume * MASTER} />
      </Sequence>
    ))}
    {LINES.map((l) => (
      <Sequence key={l.file} from={l.from} name={`vo ${l.text}`} layout="none">
        <Audio src={staticFile(l.file)} volume={1} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
