import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { loadFont as loadChakra } from "@remotion/google-fonts/ChakraPetch";
import { loadFont as loadJetMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadInterTight } from "@remotion/google-fonts/InterTight";
import { BHPost } from "./BHPost";
import { BlackHoleView, Rig } from "./BlackHoleScene";
import { DotFlare, EndQuestion, FactCards, Fonts, Instruments, MiniMap, Title, Visor } from "./Hud";
import { Suit, SuitLight } from "./Suit";
import { skyCentre } from "./project";
import { EV, camAt } from "./timeline";

const FONTS: Fonts = {
  hud: loadChakra("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily,
  mono: loadJetMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily,
  head: loadInterTight("normal", { weights: ["500", "800", "900"], subsets: ["latin"] }).fontFamily,
};

const W = 1080;
const H = 1920;
const sm = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const Grain: React.FC<{ frame: number }> = ({ frame }) => (
  <svg
    width={W}
    height={H}
    style={{ position: "absolute", inset: 0, opacity: 0.06, mixBlendMode: "overlay" }}
  >
    <filter id="bh-grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.8"
        numOctaves={1}
        seed={Math.floor(frame / 2) % 50}
      />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#bh-grain)" />
  </svg>
);

/** The camera's orientation (for things in camera space: your arms, the lights on them). */
const camQuat = (frame: number) => {
  const c = camAt(frame);
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(...c.fwd),
    new THREE.Vector3(...c.up),
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
};

/** What lights your gloves: the disk's glow on the way in, the dot of blueshifted sky, the red gas inside. */
const suitLight = (frame: number, quat: THREE.Quaternion): SuitLight => {
  const t = frame / 30;
  if (t < EV.descend) {
    return {
      dir: new THREE.Vector3(0.15, 0.45, -1).normalize(),
      color: new THREE.Color(1.0, 0.74, 0.46).multiplyScalar(2.2),
      dir2: new THREE.Vector3(-0.2, -0.8, -0.6).normalize(),
      color2: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(1.6),
      sky: new THREE.Color(0.32, 0.3, 0.32),
      ground: new THREE.Color(0.55, 0.34, 0.16),
    };
  }
  if (t < EV.horizon) {
    const d = new THREE.Vector3(...skyCentre(camAt(frame))).applyQuaternion(quat.clone().invert());
    return {
      dir: d.normalize(),
      color: new THREE.Color(0.62, 0.8, 1.0).multiplyScalar(2.8),
      dir2: new THREE.Vector3(0, 1, 0.3).normalize(),
      color2: new THREE.Color(0.2, 0.28, 0.45),
      sky: new THREE.Color(0.08, 0.1, 0.16),
      ground: new THREE.Color(0.02, 0.02, 0.03),
    };
  }
  const k = 0.6 + 1.6 * sm(EV.horizon, EV.end, t) ** 2;
  return {
    dir: new THREE.Vector3(0, 0.2, -1).normalize(),
    color: new THREE.Color(1.0, 0.32, 0.14).multiplyScalar(1.5 * k),
    dir2: new THREE.Vector3(0.3, -0.9, -0.4).normalize(),
    color2: new THREE.Color(1.0, 0.45, 0.2).multiplyScalar(k),
    sky: new THREE.Color(0.08, 0.06, 0.1),
    ground: new THREE.Color(0.3, 0.08, 0.04),
  };
};

export const BlackHole: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const live = t < EV.end + 0.5 ? 1 : 0;
  // inside the horizon: the gas ahead of you fades up, then brightens as you near the centre
  const inside = sm(EV.horizon - 0.1, EV.horizon + 2.2, t) * live;
  const debris = sm(EV.horizon, EV.end, t) * live;
  const quat = camQuat(frame);
  // thrusters shaking you: hard while braking, a buzz while hovering
  const shake =
    0.05 * sm(EV.brake, EV.brake + 0.5, t) * (1 - sm(EV.hover - 0.3, EV.hover + 1, t)) +
    0.015 * sm(EV.descend, EV.descend + 0.5, t) * (1 - sm(EV.release - 0.2, EV.release + 0.2, t));
  // spaghettification and the end
  const stretch = sm(62.0, 66.0, t) ** 1.6 * live;
  const tear = sm(65.1, 66.0, t) * live;
  const fade = live ? 1 : sm(EV.end + 0.5, EV.end + 1.1, t);
  const ca = 2.5 + 10 * stretch;
  // the dot of sky: glare from the visor, and the visor darkening against it
  const flare = sm(41.6, 44.5, t) * (1 - sm(52.2, 52.9, t));
  const tint = 0.3 * sm(42.5, 45, t) * (1 - sm(52.0, 53.0, t));
  const bloom = 0.5 + 0.35 * sm(41.5, 44, t) * (1 - sm(52, 53, t)) + 0.15 * stretch;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={W}
        height={H}
        camera={{ fov: 64, near: 0.01, far: 100, position: [0, 0, 0] }}
        gl={{ antialias: false, preserveDrawingBuffer: true }}
      >
        <Rig frame={frame} />
        <BlackHoleView
          frame={frame}
          skyGain={0.14}
          starGain={1.1}
          diskGain={0.55}
          inside={inside}
          debris={debris}
        />
        <Suit t={live ? t : -1} quat={quat} shake={shake} stretch={stretch} light={suitLight(frame, quat)} />
        <BHPost
          strength={bloom}
          radius={0.55}
          threshold={1.0}
          fx={{ stretch, tear, ca, fade }}
          t={t}
          toneMapping={THREE.NeutralToneMapping}
          exposure={1}
        />
      </ThreeCanvas>
      <DotFlare frame={frame} k={flare} />
      <Visor t={t} tint={tint} crack={0} />
      <Grain frame={frame} />
      <Title t={t} f={FONTS} />
      <Instruments frame={frame} f={FONTS} glitch={sm(63, 66, t) * live} />
      <MiniMap frame={frame} f={FONTS} />
      <FactCards t={t} f={FONTS} y={1250} />
      <EndQuestion t={t} f={FONTS} />
    </AbsoluteFill>
  );
};
