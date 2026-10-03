import React from "react";
import { Html5Audio as Audio, interpolate, Sequence, staticFile } from "remotion";
import { P, PB, PROMO_DURATION } from "./timeline";
import { CLAMP } from "../lib/anim";

const MASTER = 0.72;

type Cue = { frame: number; file: string; volume: number };
const at = (scene: keyof typeof P, local: number) => P[scene].from + local;

/** Every SFX hit, read from the promo timeline. Files: public/promo/sfx/*.mp3 */
export const PROMO_CUES: Cue[] = [
  // arcade
  { frame: at("arcade", PB.pressStart), file: "start", volume: 0.6 },
  ...PB.jumps.map((j) => ({ frame: at("arcade", j - 6), file: "jump", volume: 0.35 })),
  ...PB.jumps.map((j) => ({ frame: at("arcade", j), file: "coin", volume: 0.5 })),
  { frame: at("arcade", PB.unlocked), file: "unlock", volume: 0.55 },
  { frame: at("arcade", PB.arcadeWipe), file: "pixel-sweep", volume: 0.45 },
  // comic
  { frame: at("comic", 6), file: "whoosh", volume: 0.5 },
  ...PB.captions.map((c) => ({ frame: at("comic", c), file: "pop", volume: 0.5 })),
  ...PB.bubbles.map((b, i) => ({ frame: at("comic", b), file: `bubble-${i + 1}`, volume: 0.55 })),
  { frame: at("comic", PB.zoom), file: "punch", volume: 0.7 },
  { frame: at("comic", PB.cleared), file: "clear", volume: 0.55 },
  // scrapbook
  { frame: at("scrapbook", 0), file: "paper", volume: 0.5 },
  { frame: at("scrapbook", PB.phoneDrop + 9), file: "slap", volume: 0.6 },
  { frame: at("scrapbook", PB.headline), file: "slap", volume: 0.35 },
  { frame: at("scrapbook", PB.headline + 15), file: "slap", volume: 0.35 },
  { frame: at("scrapbook", PB.circle), file: "marker", volume: 0.5 },
  ...PB.stickers.map((s) => ({ frame: at("scrapbook", s), file: "sticker", volume: 0.55 })),
  { frame: at("scrapbook", PB.scrapWipe), file: "pixel-sweep", volume: 0.45 },
  // boss
  { frame: at("boss", 2), file: "boss", volume: 0.5 },
  ...PB.hits.map((h) => ({ frame: at("boss", h - 8), file: "throw", volume: 0.3 })),
  ...PB.hits.map((h) => ({ frame: at("boss", h), file: "hit", volume: 0.5 })),
  { frame: at("boss", PB.tap), file: "tap", volume: 0.6 },
  { frame: at("boss", PB.tap), file: "hit", volume: 0.5 },
  { frame: at("boss", PB.xp), file: "powerup", volume: 0.5 },
  { frame: at("boss", PB.tap + 18), file: "poof", volume: 0.5 },
  { frame: at("boss", PB.defeated), file: "victory", volume: 0.55 },
  // finale
  { frame: at("finale", 0), file: "confetti", volume: 0.7 },
  { frame: at("finale", PB.tagline), file: "whoosh", volume: 0.35 },
  { frame: at("finale", PB.pill), file: "pop", volume: 0.55 },
  { frame: at("finale", PB.pill), file: "confetti", volume: 0.4 },
  { frame: at("finale", PB.hero), file: "land", volume: 0.5 },
  { frame: at("finale", PB.hero + 27), file: "coin", volume: 0.5 },
];

const musicVolume = (f: number) =>
  interpolate(f, [0, 3, PROMO_DURATION - 10, PROMO_DURATION], [0.9, 0.9, 0.9, 0], CLAMP);

export const PromoAudio: React.FC = () => (
  <>
    <Audio src={staticFile("promo/music.mp3")} volume={(f) => musicVolume(f) * MASTER} />
    {PROMO_CUES.map((c, i) => (
      <Sequence key={i} from={c.frame} name={`sfx ${c.file}`} layout="none">
        <Audio src={staticFile(`promo/sfx/${c.file}.mp3`)} volume={c.volume * MASTER} />
      </Sequence>
    ))}
  </>
);
