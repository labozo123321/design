import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Teaser, TeaserProps } from "./Teaser";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline";
import { Promo } from "./promo/Promo";
import { PROMO_DURATION } from "./promo/timeline";

const defaultProps: TeaserProps = { showSafeArea: false };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Teaser"
      component={Teaser}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
    />
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={PROMO_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
