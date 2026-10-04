import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { E, ExSceneId } from "./timeline";
import { ExplainerAudio } from "./ExplainerAudio";
import { X1Hook } from "./scenes/X1Hook";
import { X2Path } from "./scenes/X2Path";
import { X3Move } from "./scenes/X3Move";
import { X4Regulars } from "./scenes/X4Regulars";
import { X5Money } from "./scenes/X5Money";
import { X6End } from "./scenes/X6End";
import "../promo/fonts";

const SCENES: Record<ExSceneId, React.FC<{ duration: number }>> = {
  hook: X1Hook,
  path: X2Path,
  move: X3Move,
  regulars: X4Regulars,
  money: X5Money,
  end: X6End,
};

/** How FourFig works: pure motion graphics, the app UI rebuilt and animated (no footage). */
export const ExplainerScenes: React.FC = () => (
  <>
    {(Object.keys(SCENES) as ExSceneId[]).map((id) => {
      const Scene = SCENES[id];
      return (
        <Sequence key={id} name={id} from={E[id].from} durationInFrames={E[id].duration}>
          <Scene duration={E[id].duration} />
        </Sequence>
      );
    })}
  </>
);

export const Explainer: React.FC = () => (
  <AbsoluteFill style={{ background: "#0A0D14" }}>
    <ExplainerScenes />
    <ExplainerAudio />
  </AbsoluteFill>
);
