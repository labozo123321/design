import React, { useState } from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";
import { loadFont as loadLuckiest } from "@remotion/google-fonts/LuckiestGuy";
import { Post } from "../pov/Post";
import { PinballWorld } from "./PinballWorld";

const LUCKIEST = loadLuckiest("normal", { weights: ["400"], subsets: ["latin"] });

const W = 1080;
const H = 1920;
const NO_RIPPLE = { radius: 0, strength: 0, flash: 0 };

/** Wait for the fonts the canvases draw with (the playfield art, the backglass). */
const useFontsReady = () => {
  const [handle] = useState(() => delayRender("pinball fonts"));
  const [ready, setReady] = useState(false);
  useState(() => {
    Promise.all([LUCKIEST.waitUntilDone(), document.fonts.load(`100px "${LUCKIEST.fontFamily}"`)])
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch(() => {
        setReady(true);
        continueRender(handle);
      });
    return 0;
  });
  return ready;
};

export const Pinball: React.FC = () => {
  const frame = useCurrentFrame();
  const ready = useFontsReady();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {ready ? (
        <ThreeCanvas
          width={W}
          height={H}
          camera={{ fov: 84, near: 0.003, far: 30, position: [0.25, 0.0135, -0.1] }}
          gl={{ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <PinballWorld frame={frame} fov={84} shake={{ yaw: 0, pitch: 0, roll: 0 }} font={LUCKIEST.fontFamily} />
          <Post strength={0.55} radius={0.5} threshold={1.0} ripple={NO_RIPPLE} />
        </ThreeCanvas>
      ) : null}
    </AbsoluteFill>
  );
};
