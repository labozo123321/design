import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Teaser, TeaserProps } from "./Teaser";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline";

const defaultProps: TeaserProps = { showSafeArea: false };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Teaser"
    component={Teaser}
    durationInFrames={DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={defaultProps}
  />
);
