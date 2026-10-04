import React from "react";
import {
  AbsoluteFill,
  Html5Audio as Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ExplainerScenes } from "../explainer/Explainer";
import { ExplainerAudio } from "../explainer/ExplainerAudio";
import { E } from "../explainer/timeline";
import { UI } from "../explainer/ui";
import { PFONTS } from "../promo/fonts";
import VO from "./vo.json";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const LINES = VO.lines;

/** Music drops about 8 dB under the voice, with short fades either side of each line. */
const duck = (f: number) => {
  let d = 1;
  for (const l of LINES) {
    const v = interpolate(
      f,
      [l.from - 6, l.from, l.from + l.duration, l.from + l.duration + 10],
      [0, 1, 1, 0],
      CLAMP,
    );
    d = Math.min(d, 1 - v * 0.62);
  }
  return d;
};

/** Captions are skipped on the hook and end card, where the same words are already on screen. */
const CAPTIONED = LINES.filter((l) => l.from >= E.path.from && l.from < E.end.from);

const Caption: React.FC<{ line: (typeof LINES)[number] }> = ({ line }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 220 } });
  const out = interpolate(frame, [line.duration + 2, line.duration + 7], [1, 0], CLAMP);
  const abs = line.from + frame;
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: 330,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(pop, out),
        transform: `translateY(${(1 - pop) * 16}px) scale(${0.96 + 0.04 * pop})`,
      }}
    >
      <div
        style={{
          background: "rgba(8,10,16,0.82)",
          border: `2px solid ${UI.line}`,
          borderRadius: 26,
          padding: "16px 26px",
          fontFamily: PFONTS.app,
          fontWeight: 900,
          fontSize: 40,
          lineHeight: 1.22,
          textAlign: "center",
          color: "#fff",
          boxShadow: "0 18px 40px -14px rgba(0,0,0,0.7)",
        }}
      >
        {line.words.map((w, i) => {
          const on = abs >= w.at;
          return (
            <span key={i} style={{ color: on ? "#fff" : "rgba(255,255,255,0.38)" }}>
              {w.w}
              {i < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** The Explainer, narrated: same picture, a voiceover, ducked music and synced captions. */
export const ExplainerVO: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0D14" }}>
    <ExplainerScenes />
    {CAPTIONED.map((l) => (
      <Sequence key={l.file} from={l.from} durationInFrames={l.duration + 8} name={`cc ${l.text}`}>
        <Caption line={l} />
      </Sequence>
    ))}
    <ExplainerAudio duck={duck} sfxGain={0.75} />
    {LINES.map((l) => (
      <Sequence key={l.file} from={l.from} name={`vo ${l.text}`} layout="none">
        <Audio src={staticFile(l.file)} volume={1} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
