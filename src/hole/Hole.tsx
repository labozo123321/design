import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Html5Audio as Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadDMSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import { Post } from "../pov/Post";
import { HoleWorld } from "./HoleWorld";
import { EndQuestion, FactCards, Instruments, Title, centreFlash } from "./Overlay";
import { T } from "./timeline";

const SERIF = loadDMSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const MONO = loadMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;
const W = 1080;
const H = 1920;
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Bloom eases off where the whole frame glows (deep mantle, core), so it doesn't wash everything out. */
const bloomAt = (t: number) => {
  const deep = Math.min(1, Math.max(0, (t - 26) / 4)) * Math.min(1, Math.max(0, (57 - t) / 3));
  return 0.68 - 0.3 * deep;
};

const Grain: React.FC<{ frame: number }> = ({ frame }) => (
  <svg
    width={W}
    height={H}
    style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay" }}
  >
    <filter id="hole-grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.8"
        numOctaves={1}
        seed={Math.floor(frame / 2) % 50}
      />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#hole-grain)" />
  </svg>
);

export const Hole: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const f = Math.max(0, Math.min(T.frames - 1, frame));
  // the faster you go, the more the picture tears at the edges
  const speed = T.vis[f];
  const ca = Math.min(5, speed / 30) + 9 * Math.max(0, 1 - Math.abs(t - 47.5) / 0.5);
  const flash = centreFlash(t);
  const ripple =
    t > 47.45 && t < 49
      ? {
          radius: (t - 47.45) * 0.95 - 0.03,
          strength: 0.05 * Math.exp(-(t - 47.45) * 1.6),
          flash: 0.6 * Math.exp(-(t - 47.45) * 2.4),
        }
      : { radius: 0, strength: 0, flash: 0 };
  const vign = 0.4 + 0.22 * Math.min(1, speed / 150) + interpolate(t, [69, 72], [0, 0.3], CLAMP);
  const fadeOut = interpolate(t, [71.2, 72], [0, 1], CLAMP);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ filter: ca > 0.3 ? "url(#hole-ca)" : undefined }}>
        <ThreeCanvas
          width={W}
          height={H}
          shadows
          camera={{ fov: 74, near: 0.04, far: 2e7, position: [-8, 1.7, 9.6] }}
          gl={{ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <HoleWorld frame={frame} />
          <Post
            strength={bloomAt(t)}
            radius={0.6}
            threshold={1.0}
            ripple={ripple}
            toneMapping={THREE.NeutralToneMapping}
          />
        </ThreeCanvas>
      </AbsoluteFill>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="hole-ca" x="0" y="0" width="100%" height="100%">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="r"
          />
          <feOffset in="r" dx={ca} dy={0} result="r2" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="g"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="b"
          />
          <feOffset in="b" dx={-ca} dy={0} result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
      </svg>
      {flash > 0.001 ? <AbsoluteFill style={{ background: "#FFF8EC", opacity: flash }} /> : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 50%, rgba(0,0,0,${vign}) 100%)`,
        }}
      />
      <Grain frame={frame} />

      <Title t={t} serif={SERIF} />
      <Instruments frame={frame} mono={MONO} />
      <FactCards t={t} serif={SERIF} mono={MONO} />
      <EndQuestion t={t} serif={SERIF} />
      {fadeOut > 0.001 ? <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} /> : null}
      <Audio src={staticFile("hole/bed.mp3")} />
    </AbsoluteFill>
  );
};
