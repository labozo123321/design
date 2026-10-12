import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Html5Audio as Audio, staticFile, useCurrentFrame } from "remotion";
import { CoasterPost } from "./CoasterPost";
import { CoasterWorld } from "./CoasterWorld";
import { EndingWorld, endingCam, preloadPhoto } from "./Ending";
import { Overlay } from "./Overlay";
import { BEAT, DURATION, FPS, RIDE_END, camAt, smooth } from "./world";
import { gAt } from "./track";

/**
 * POV: your little sister wanted the front row. A first-person ride on a dive coaster at golden hour,
 * with no narration: the lift, the hold over the vertical drop (she blows a bubble), the drop into a
 * tunnel, an Immelmann, a splashdown, a zero-g roll, the swoop, the hop and the brakes; then the ride photo
 * at the booth, and her verdict.
 */

export const COASTER_DURATION = DURATION;
const CUT = Math.round(RIDE_END * FPS);

export const Coaster: React.FC = () => {
  const frame = useCurrentFrame();
  preloadPhoto();
  const u = frame / FPS;
  const ending = frame >= CUT;
  const prev = ending ? endingCam(Math.max(CUT, frame - 1)) : camAt(Math.max(0, frame - 1));
  // the lens: the on-ride camera's flash as you pass it; spray and water on the lens after the splash;
  // grey edges when the g's pile up
  const flash = ending ? 0 : 0.85 * Math.exp(-Math.max(0, u - BEAT.photo) / 0.06) * smooth(BEAT.photo - 0.034, BEAT.photo, u);
  const wet = ending ? 0 : smooth(BEAT.splash[0] + 0.2, BEAT.splash[0] + 0.4, u) * (1 - smooth(BEAT.zr[1], BEAT.zr[1] + 2.5, u));
  const mist = ending ? 0 : 0.3 * smooth(BEAT.splash[0] + 0.05, BEAT.splash[0] + 0.25, u) * (1 - smooth(BEAT.splash[0] + 0.45, BEAT.splash[1] + 0.3, u));
  let gn = 0;
  for (let k = 0; k < 5; k++) gn += gAt(frame - k).n / 5;
  const grey = ending ? 0 : 0.6 * smooth(3.3, 4.4, gn);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={1080}
        height={1920}
        shadows
        camera={{ fov: 76, near: 0.03, far: 30000, position: [0, 2, 0] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        {ending ? <EndingWorld frame={frame} /> : <CoasterWorld frame={frame} />}
        <CoasterPost
          prev={prev}
          blur={frame === 0 || frame === CUT ? 0 : 1}
          grade={{
            ca: 0.0015 + 0.004 * grey,
            flash,
            freeze: 0,
            vhs: 0,
            tilt: 0,
            dark: 0,
            time: u,
            sat: 1.1,
            con: 1.05,
            drops: wet,
            dropT: Math.max(0, u - BEAT.splash[0]),
            mist,
            grey,
          }}
          bloom={0.25}
        />
      </ThreeCanvas>
      <Overlay t={u} />
      <Audio src={staticFile("coaster/bed.mp3")} />
    </AbsoluteFill>
  );
};
