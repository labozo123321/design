import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { LooksPost, type Pose } from "./LooksPost";
import { LooksWorld } from "./LooksWorld";
import { DURATION, FPS } from "./timeline";
import { KIDS_IN_ORDER, PHOTOG, FRIEND, TEACHER } from "./cast";
import { KidFigure, SEAT_LIFT } from "./People";
import { NEUTRAL } from "../coaster/face/sculpt";

/**
 * POV: you're the school photographer in the looksmaxing era. Picture day in the gym: one kid after another
 * sits down and does "the face" (each a sigma edit in his head: phonk, slow motion, the dark grade) and the
 * flash shows what the photo actually looks like. Then the photographer turns the camera round. Then the
 * yearbook.
 */

export const LOOKS_DURATION = DURATION;

const look = (pos: THREE.Vector3, at: THREE.Vector3, fov: number): Pose => {
  const m = new THREE.Matrix4().lookAt(pos, at, new THREE.Vector3(0, 1, 0));
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov };
};

const debugCam = (kind: string): Pose => {
  if (kind === "wide") return look(new THREE.Vector3(0, 1.4, 2.6), new THREE.Vector3(0, 1.3, 0), 58);
  if (kind === "high") return look(new THREE.Vector3(5, 7, 9), new THREE.Vector3(0, 1, 0), 60);
  if (kind === "back") return look(new THREE.Vector3(0.3, 1.6, -1.0), new THREE.Vector3(0, 1.4, 6), 70);
  if (kind === "face") return look(new THREE.Vector3(0, 1.4, 2.6), new THREE.Vector3(0, 1.39, 0), 7.5);
  if (kind === "photo") return look(new THREE.Vector3(0, 1.37, 2.6), new THREE.Vector3(0, 1.31, 0), 12.5);
  if (kind === "top") return look(new THREE.Vector3(0.2, 2.05, 0.9), new THREE.Vector3(0, 1.47, 0), 20);
  if (kind === "side") return look(new THREE.Vector3(2.2, 1.45, 1.2), new THREE.Vector3(0, 1.25, 0), 22);
  return look(new THREE.Vector3(0, 1.36, 2.6), new THREE.Vector3(0, 1.27, 0), 18);
};

export const Looks: React.FC = () => {
  const frame = useCurrentFrame();
  const u = frame / FPS;
  const props = getInputProps() as { cam?: string; lineup?: boolean; noKeyShadow?: boolean };
  (globalThis as { __noKeyShadow?: boolean }).__noKeyShadow = !!props.noKeyShadow;
  const cam = debugCam(props.cam ?? "portrait");
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas
        width={1080}
        height={1920}
        shadows
        camera={{ fov: 21, near: 0.03, far: 200, position: [0, 1.4, 2.6] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
      >
        <LooksWorld cam={cam} flash={0}>
          {props.lineup !== undefined
            ? (() => {
                // debug: one of the cast on the stool, an expression per frame
                const all = [...KIDS_IN_ORDER, PHOTOG, FRIEND, TEACHER];
                const kid = all[Math.floor(frame / 4) % all.length];
                const ex = frame % 4;
                const e = { ...NEUTRAL, ...[{}, { smile: 0.8, squint: 0.2 }, { jut: 1, brow: -0.5, squint: 0.3 }, { squint: 1, brow: -1 }][ex] };
                const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(-0.12, 0.25, -0.2), new THREE.Vector3(0.12, 0.25, -0.2)];
                return <KidFigure kid={kid} pose={{ sit: true, lift: SEAT_LIFT, e, look: cam.pos, feet }} at={new THREE.Vector3(0, 0, 0)} yaw={Math.PI - 0.42} t={frame / 30} extras={{ gum: kid.key === "gum", glow: 0 }} />;
              })()
            : null}
        </LooksWorld>
        <LooksPost
          prev={cam}
          blur={0}
          lens={{ focus: cam.pos.distanceTo(new THREE.Vector3(0, 1.4, 0)), aperture: 0.016 }}
          grade={{ time: u, edit: 0, zoom: 1, shake: [0, 0], letter: 0, flash: 0, print: 0, on: 1, ca: 0.001, sat: 1.04, con: 1.03 }}
          bloom={0.22}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
