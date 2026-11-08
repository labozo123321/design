import React from "react";
import { Composition } from "remotion";
import { Lift, LiftCaptionsOnly } from "./Lift";
import { LIFT_FRAMES } from "./timeline";

export const LiftRoot: React.FC = () => (
  <>
    <Composition id="Lift" component={Lift} durationInFrames={LIFT_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="LiftCaptions" component={LiftCaptionsOnly} durationInFrames={LIFT_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
