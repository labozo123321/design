import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Teaser, TeaserProps } from "./Teaser";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline";
import { Promo } from "./promo/Promo";
import { PROMO_DURATION } from "./promo/timeline";
import { Explainer } from "./explainer/Explainer";
import { EX_DURATION } from "./explainer/timeline";
import { Iso, ISO_DURATION } from "./iso/Iso";
import { ExplainerVO } from "./voiceover/ExplainerVO";
import { Story } from "./story/Story";
import { Fight } from "./fight/Fight";
import { WhatIf } from "./whatif/WhatIf";
import { Pov } from "./pov/Pov";
import { POV_DURATION } from "./pov/timeline";
import { Hole } from "./hole/Hole";
import { HOLE_DURATION } from "./hole/timeline";
import { BlackHole } from "./blackhole/BlackHole";
import { Pinball } from "./pinball/Pinball";
import { PB_DURATION } from "./pinball/timeline";
import { Tsunami } from "./tsunami/Tsunami";
import { Coaster, COASTER_DURATION } from "./coaster/Coaster";
import { FaceTest } from "./coaster/FaceTest";
import { CoasterPhoto } from "./coaster/CoasterPhoto";
import { FRAMES as TSUNAMI_FRAMES } from "./tsunami/world";
import { BH_DURATION } from "./blackhole/timeline";
import { WI_DURATION } from "./whatif/timeline";
import { FIGHT_DURATION } from "./fight/choreo";
import { STORY_DURATION } from "./story/timeline";

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
    <Composition
      id="Explainer"
      component={Explainer}
      durationInFrames={EX_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="ExplainerVO"
      component={ExplainerVO}
      durationInFrames={EX_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Story"
      component={Story}
      durationInFrames={STORY_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Fight"
      component={Fight}
      durationInFrames={FIGHT_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="WhatIf"
      component={WhatIf}
      durationInFrames={WI_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Pov"
      component={Pov}
      durationInFrames={POV_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Hole"
      component={Hole}
      durationInFrames={HOLE_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Pinball"
      component={Pinball}
      durationInFrames={PB_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Tsunami"
      component={Tsunami}
      durationInFrames={TSUNAMI_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
      <Composition
        id="Coaster"
        component={Coaster}
        durationInFrames={COASTER_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition id="CoasterFaceTest" component={FaceTest} durationInFrames={6} fps={30} width={1080} height={1920} />
      <Composition id="CoasterPhoto" component={CoasterPhoto} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition
      id="BlackHole"
      component={BlackHole}
      durationInFrames={BH_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="Iso"
      component={Iso}
      durationInFrames={ISO_DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
