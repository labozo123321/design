import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { ChromaticText } from "../components/ChromaticText";
import { GlitchSlice } from "../components/GlitchSlice";
import { TextColumn } from "../components/Type";
import { FLASH_HITS } from "../timeline";
import { COLORS, FOCUS_Y } from "../theme";
import { FONTS } from "../fonts";
import { CLAMP } from "../lib/anim";
import { SceneProps } from "./types";

/** Fit each word inside the 800px text column. */
const sizeFor = (word: string) => Math.min(250, Math.floor(790 / (word.length * 0.42)));

/**
 * 330–390 · Flash frames. Short words, 2–4 frames each, alternating ink on
 * bone and bone on ink, accelerating like a pulse. Every hit has an SFX cue.
 */
export const Act2FlashWords: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const idx = FLASH_HITS.findIndex((h) => frame >= h.at && frame < h.at + h.len);

  if (idx === -1) {
    // Between hits: black, with a fading retinal afterimage of the last word.
    const prev = [...FLASH_HITS].reverse().findIndex((h) => frame >= h.at + h.len);
    const last = prev === -1 ? null : FLASH_HITS[FLASH_HITS.length - 1 - prev];
    const since = last ? frame - (last.at + last.len) : 99;
    const ghost = interpolate(since, [0, 4], [0.16, 0], CLAMP);
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        {last && ghost > 0 ? (
          <TextColumn y={FOCUS_Y}>
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: sizeFor(last.word),
                lineHeight: 1,
                color: COLORS.bone,
                opacity: ghost,
                filter: "blur(3px)",
              }}
            >
              {last.word}
            </div>
          </TextColumn>
        ) : null}
      </AbsoluteFill>
    );
  }

  const hit = FLASH_HITS[idx];
  const local = frame - hit.at;
  const lightFlash = idx % 2 === 0;
  const bg = lightFlash ? COLORS.bone : "#050505";
  const fg = lightFlash ? "#0A0A0A" : COLORS.bone;
  const r = (k: string) => random(`flash-${idx}-${k}`);
  const dx = (r("x") - 0.5) * 70;
  const dy = (r("y") - 0.5) * 160;
  const scale = interpolate(local, [0, hit.len], [1.07, 0.98]) * (0.94 + r("s") * 0.12);
  const glitch = idx % 3 === 2 ? 0.45 : 0;

  return (
    <AbsoluteFill style={{ background: bg }}>
      <GlitchSlice
        intensity={glitch}
        seed={`flash-${idx}`}
        maxShift={90}
        rgb={10}
        mosaic={false}
        background={bg}
      >
        <AbsoluteFill style={{ background: bg, transform: `translate(${dx}px, ${dy}px) scale(${scale})` }}>
          <TextColumn y={FOCUS_Y}>
            <ChromaticText
              offset={lightFlash ? 3 : 5}
              color={fg}
              mode={lightFlash ? "multiply" : "screen"}
              fringeOpacity={lightFlash ? 0.6 : 0.8}
            >
              <div style={{ fontFamily: FONTS.serif, fontSize: sizeFor(hit.word), lineHeight: 1 }}>
                {hit.word}
              </div>
            </ChromaticText>
          </TextColumn>
        </AbsoluteFill>
      </GlitchSlice>
    </AbsoluteFill>
  );
};
