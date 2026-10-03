import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { P, PromoSceneId } from "./timeline";
import { PromoAudio } from "./PromoAudio";
import { P1Arcade } from "./scenes/P1Arcade";
import { P2Comic } from "./scenes/P2Comic";
import { P3Scrapbook } from "./scenes/P3Scrapbook";
import { P4Boss } from "./scenes/P4Boss";
import { P5Finale } from "./scenes/P5Finale";
import "./fonts";

const SCENES: Record<PromoSceneId, React.FC<{ duration: number }>> = {
  arcade: P1Arcade,
  comic: P2Comic,
  scrapbook: P3Scrapbook,
  boss: P4Boss,
  finale: P5Finale,
};

/** Upbeat FourFig promo: 8-bit, comic book, scrapbook, pixel boss fight, confetti finale. */
export const Promo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {(Object.keys(SCENES) as PromoSceneId[]).map((id) => {
      const Scene = SCENES[id];
      return (
        <Sequence key={id} name={id} from={P[id].from} durationInFrames={P[id].duration}>
          <Scene duration={P[id].duration} />
        </Sequence>
      );
    })}
    <PromoAudio />
  </AbsoluteFill>
);
