import React from "react";
import { Html5Audio as Audio, Sequence, staticFile } from "remotion";
import { FB, HITS, IMPACTS, SHOTS } from "./choreo";
import VOICE from "./voice.json";

const MASTER = 0.7;
type Cue = { frame: number; file: string; volume: number };
const fx = (n: string) => `fight/sfx/${n}.mp3`;

const CUES: Cue[] = [
  { frame: 0, file: fx("bell"), volume: 0.45 },
  // dashes and leaps
  ...[60, 86, 120, 166, 194, 206, 306, 488, 520, 532].map((f) => ({
    frame: f,
    file: fx("whoosh"),
    volume: 0.4,
  })),
  ...[126, 316].map((f) => ({ frame: f + 2, file: fx("whoosh-long"), volume: 0.4 })),
  // every landed hit
  ...HITS.filter((h) => h.dmg > 0 || h.f === FB.clash).map((h, i) => ({
    frame: h.f,
    file: fx(h.f === FB.clash ? "clash" : h.power >= 0.9 ? "heavy" : i % 2 ? "punch-b" : "punch-a"),
    volume: h.power >= 0.9 ? 0.45 : 0.35 + h.power * 0.3,
  })),
  // big impacts get a boom underneath
  ...IMPACTS.filter(([f]) => f !== FB.finalHit).map(([f]) => ({ frame: f, file: fx("crash"), volume: 0.22 })),
  ...[150, 240, 345, 553].map((f) => ({
    frame: f,
    file: fx("crash"),
    volume: f === 150 ? 0.25 : f === 553 ? 0.25 : 0.4,
  })),
  // thought projectiles
  ...SHOTS.map((s) => ({ frame: s.from, file: fx("fireball"), volume: s.size > 2 ? 0.6 : 0.4 })),
  ...SHOTS.filter((s) => s.fate !== "miss").map((s) => ({
    frame: s.to,
    file: fx("shatter"),
    volume: s.size > 2 ? 0.6 : 0.4,
  })),
  { frame: 408, file: fx("charge"), volume: 0.35 },
  { frame: 440, file: fx("charge"), volume: 0.4 },
  ...FB.heartbeats.map((f) => ({ frame: f, file: fx("heartbeat"), volume: 0.75 })),
  // finisher
  { frame: FB.finalHit, file: fx("ko-boom"), volume: 0.42 },
  // the cut
  { frame: FB.cut - 4, file: fx("scratch"), volume: 0.55 },
  { frame: FB.send, file: "sfx/ui-click.mp3", volume: 0.7 },
  { frame: FB.send + 2, file: "sfx/sent.mp3", volume: 0.55 },
  { frame: FB.toast, file: "sfx/chime-confirm.mp3", volume: 0.55 },
  { frame: FB.end, file: "promo/sfx/whoosh.mp3", volume: 0.35 },
  { frame: FB.pill, file: "promo/sfx/pop.mp3", volume: 0.4 },
];

const VO: { frame: number; key: keyof typeof VOICE; volume: number }[] = [
  { frame: FB.roundVo, key: "round", volume: 0.95 },
  { frame: FB.fightVo, key: "fight", volume: 1 },
  { frame: FB.finishVo, key: "finish", volume: 0.95 },
  { frame: FB.koVo, key: "ko", volume: 1 },
  { frame: FB.emailVo, key: "email", volume: 1 },
  { frame: FB.endVo, key: "end", volume: 1 },
];

/** Music ducks under the announcer and narrator. */
const duck = (f: number) => {
  for (const v of VO) {
    const len = VOICE[v.key].frames;
    if (f >= v.frame - 3 && f < v.frame + len + 4) return 0.55;
  }
  return 1;
};

export const FightAudio: React.FC = () => (
  <>
    <Audio src={staticFile("fight/music.mp3")} volume={(f) => 0.75 * duck(f) * MASTER} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, c.frame)} name={c.file} layout="none">
        <Audio src={staticFile(c.file)} volume={c.volume * MASTER} />
      </Sequence>
    ))}
    {VO.map((v) => (
      <Sequence key={v.key} from={v.frame} name={`vo ${v.key}`} layout="none">
        <Audio src={staticFile(VOICE[v.key].file)} volume={v.volume} />
      </Sequence>
    ))}
  </>
);
