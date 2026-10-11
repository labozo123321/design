import React, { useState } from "react";
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  Html5Audio as Audio,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont as loadLuckiest } from "@remotion/google-fonts/LuckiestGuy";
import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadVT323 } from "@remotion/google-fonts/VT323";
import { PinballWorld } from "./PinballWorld";
import { PinPost, Grade } from "./PinPost";
import { Overlay } from "./Overlay";
import { fxTime, impactAt, poseAt } from "./camera";
import { KEY } from "./show";
import { M } from "./timeline";
import { DEBUG } from "./debug";

const LUCKIEST = loadLuckiest("normal", { weights: ["400"], subsets: ["latin"] });
const BANGERS = loadBangers("normal", { weights: ["400"], subsets: ["latin"] });
const FREDOKA = loadFredoka("normal", { weights: ["500", "600"], subsets: ["latin"] });
const MONTSERRAT = loadMontserrat("normal", { weights: ["800"], subsets: ["latin"] });
const VT323 = loadVT323("normal", { weights: ["400"], subsets: ["latin"] });

const FONTS = {
  comic: BANGERS.fontFamily,
  round: FREDOKA.fontFamily,
  meme: MONTSERRAT.fontFamily,
  vcr: VT323.fontFamily,
  title: LUCKIEST.fontFamily,
};

const W = 1080;
const H = 1920;

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

const decay = (t: number, t0: number, k: number) => (t >= t0 ? Math.exp(-(t - t0) / k) : 0);

/** The grade for this frame: hits, the freeze, the tape, the tilt. */
const gradeAt = (frame: number): Grade => {
  const t = frame / 30;
  const te = fxTime(t);
  const hit = Math.min(1.5, impactAt(frame));
  const freeze = t >= M.freeze && t < M.rewind[0] ? 1 : 0;
  const vhs = t >= M.rewind[0] && t < M.rewind[1] ? 1 : 0;
  const tiltK = t >= KEY.tilt ? Math.exp(-(t - KEY.tilt) / 0.9) : 0;
  const flash =
    0.05 * hit +
    0.4 * decay(te, KEY.chomp, 0.08) +
    0.3 * decay(te, KEY.burp, 0.1) +
    0.6 * decay(te, KEY.jackpot, 0.12) +
    0.25 * decay(te, M.launch, 0.07) +
    (freeze ? 0.5 * decay(t, M.freeze, 0.05) : 0);
  return {
    ca: 0.0025 + 0.012 * Math.min(1, hit) + 0.012 * vhs,
    flash,
    freeze,
    vhs,
    tilt: tiltK * (0.55 + 0.45 * Math.sin((t - KEY.tilt) * 18)),
    dark: 0,
    time: t,
  };
};

export const Pinball: React.FC = () => {
  const frame = useCurrentFrame();
  const ready = useFontsReady();
  const t = frame / 30;
  const pose = poseAt(frame);
  // motion blur from the previous frame's camera, except across the cut into the rewind and in the
  // freeze frame
  const cut = frame === Math.round(M.rewind[0] * 30) || (t >= M.freeze && t < M.rewind[0]);
  const prev = poseAt(Math.max(0, frame - 1));
  const te = fxTime(t);
  const bloom = 0.55 + 0.6 * decay(te, KEY.jackpot, 0.5) + 0.3 * decay(te, KEY.chomp, 0.3);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {ready ? (
        <ThreeCanvas
          width={W}
          height={H}
          camera={{ fov: 84, near: 0.003, far: 30, position: [0.25, 0.0135, -0.1] }}
          gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <PinballWorld frame={frame} pose={pose} font={LUCKIEST.fontFamily} />
          <PinPost
            prev={prev}
            blur={cut || DEBUG.has("noblur") ? 0 : 1}
            grade={gradeAt(frame)}
            bloom={DEBUG.has("nobloom") ? 0 : bloom}
          />
        </ThreeCanvas>
      ) : null}
      <Overlay frame={frame} fonts={FONTS} />
      <Audio src={staticFile("pinball/bed.mp3")} />
    </AbsoluteFill>
  );
};
