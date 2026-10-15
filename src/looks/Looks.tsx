import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { LooksPost, type Pose } from "./LooksPost";
import { LooksWorld } from "./LooksWorld";
import { BPM, CUE, DURATION, EDITS, FPS, editAt, holdAt, smooth, vnoise, wAt } from "./timeline";
import { KIDS_IN_ORDER, PHOTOG, FRIEND, TEACHER } from "./cast";
import { KidFigure, SEAT_LIFT } from "./People";
import { NEUTRAL } from "../coaster/face/sculpt";
import { Hand, OPEN, RELAX, mixHand } from "../coaster/Hand";
import { ActFigure, castAt, stoolTiltAt } from "./Kids";
import { look, shotAt, type Shot } from "./camera";
import { Overlay } from "./Overlay";

/**
 * POV: you're the school photographer in the looksmaxing era. Picture day in the gym: one kid after another
 * sits down and does "the face" (each a sigma edit in his head: phonk, slow motion, the dark grade) and the
 * flash shows what the photo actually looks like. Then the photographer turns the camera round. Then the
 * yearbook.
 */

export const LOOKS_DURATION = DURATION;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const debugCam = (kind: string): Pose => {
  if (kind === "wide") return look(V3(0, 1.4, 2.6), V3(0, 1.3, 0), 58);
  if (kind === "high") return look(V3(5, 7, 9), V3(0, 1, 0), 60);
  if (kind === "back") return look(V3(0.3, 1.6, -1.0), V3(0, 1.4, 6), 70);
  if (kind === "face") return look(V3(0, 1.4, 2.6), V3(0, 1.39, 0), 7.5);
  if (kind === "photo") return look(V3(0, 1.37, 2.6), V3(0, 1.31, 0), 12.5);
  if (kind === "top") return look(V3(0.2, 2.05, 0.9), V3(0, 1.47, 0), 20);
  if (kind === "side") return look(V3(2.2, 1.45, 1.2), V3(0, 1.25, 0), 22);
  if (kind === "overview") return look(V3(4.5, 3.2, 6.5), V3(-0.5, 0.9, 1.5), 50);
  return look(V3(0, 1.36, 2.6), V3(0, 1.27, 0), 18);
};

/** The flash cues (video seconds) and when each photo's hold ends. */
const FLASHES = [...KIDS_IN_ORDER.map((k) => [CUE[`${k.key}.flash`], CUE[`${k.key}.photoEnd`]]), [CUE["photog.flash"], CUE["photog.photoEnd"]]];

/** The strobes (3D lights): the pop, and a flash-lit look while the photo is held. */
const strobeAt = (v: number) => {
  let s = 0;
  for (const [a, b] of FLASHES) {
    if (v >= a && v < a + 0.5) s = Math.max(s, Math.exp(-(v - a) / 0.05));
    if (v >= a && v < b) s = Math.max(s, 0.22);
  }
  return s;
};
/** The white-out on screen at the flash. */
const whiteAt = (v: number) => {
  let s = 0;
  for (const [a] of FLASHES) if (v >= a - 1 / FPS && v < a + 0.6) s = Math.max(s, v < a ? 0.4 : Math.exp(-(v - a) / 0.09));
  return s;
};
/** The held photo as a print (0..1). */
const printAt = (v: number) => {
  let s = 0;
  for (const [a, b] of FLASHES) if (v >= a && v < b + 0.2) s = Math.max(s, smooth(a + 0.05, a + 0.3, v) * (1 - smooth(b - 0.1, b + 0.05, v)));
  return s;
};
/** The phonk's beat in the edits: a kick on every beat (decaying), harder on the bar. */
export const beatAt = (v: number) => {
  for (const [a, b] of EDITS) {
    if (v >= a && v < b) {
      const p = 60 / BPM;
      const n = Math.floor((v - a) / p);
      const since = v - a - n * p;
      return { kick: Math.exp(-since / 0.09) * (n % 4 === 0 ? 1.3 : 1), n };
    }
  }
  return { kick: 0, n: 0 };
};

const GESTURES = KIDS_IN_ORDER.filter((k) => k.key !== "mogger").map((k) => CUE[`${k.key}.gesture`]);
const sleeve = new THREE.MeshStandardMaterial({ color: "#7A8FB0", roughness: 0.85 });

/** The photographer's hand in front of the lens: "chin up a bit" (camera space). */
const GestureHand: React.FC<{ v: number; shot: Shot }> = ({ v, shot }) => {
  const g = GESTURES.find((t) => v >= t - 0.05 && v < t + 0.75);
  if (g === undefined) return null;
  const a = smooth(g - 0.05, g + 0.15, v) * (1 - smooth(g + 0.55, g + 0.75, v));
  const flick = Math.max(0, Math.sin(((v - g) / 0.22) * Math.PI)) * smooth(g + 0.1, g + 0.2, v) * (1 - smooth(g + 0.5, g + 0.6, v));
  const m = new THREE.Matrix4().makeBasis(V3(-1, 0, 0), V3(0, 0, 1), V3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m).premultiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.5 * flick - 0.15));
  return (
    <group position={shot.pose.pos} quaternion={shot.pose.quat}>
      <group position={[0.07, -0.3 + 0.17 * a, -0.42]} quaternion={q}>
        <Hand pose={mixHand(OPEN, RELAX, 0.35 + 0.4 * flick)} tone={PHOTOG.who.skin.tone} side={1} scale={1} />
        <mesh position={[0, 0.13, 0]} material={sleeve}>
          <cylinderGeometry args={[0.032, 0.036, 0.2, 16]} />
        </mesh>
      </group>
    </group>
  );
};

export const Looks: React.FC = () => {
  const frame = useCurrentFrame();
  const props = getInputProps() as { cam?: string; lineup?: boolean; noKeyShadow?: boolean; still?: number; perf?: Record<string, boolean> };
  (globalThis as { __noKeyShadow?: boolean }).__noKeyShadow = !!props.noKeyShadow;
  (globalThis as { __perf?: Record<string, boolean> }).__perf = props.perf ?? {};
  if (props.lineup !== undefined) return <Lineup frame={frame} cam={props.cam} />;
  const v = frame / FPS;
  const tw = wAt(frame);
  const edit = editAt(frame);
  const hold = holdAt(frame);
  const yearbook = v >= CUE.yearbook;
  const shot = shotAt(frame);
  const prev = shotAt(Math.max(0, frame - 1));
  const cam = props.cam ? debugCam(props.cam) : shot.pose;
  const acts = yearbook || props.perf?.noCast ? [] : castAt(tw, frame, shot.pose.pos, shot.pose.quat);
  const strobe = strobeAt(v);
  const white = whiteAt(v);
  const print = printAt(v);
  const beat = beatAt(v);
  const kick = beat.kick * edit;
  const on = smooth(0.0, 0.35, v);
  const still = props.still !== undefined;
  // the photographer's own on-camera flash, in the selfie
  const selfieFlash = v >= CUE["photog.flash"] && v < CUE["photog.photoEnd"] ? Math.max(0.35, Math.exp(-(v - CUE["photog.flash"]) / 0.06)) : 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {!yearbook ? (
        <ThreeCanvas
          width={1080}
          height={1920}
          shadows
          camera={{ fov: 21, near: 0.03, far: 200, position: [0, 1.4, 2.6] }}
          gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}
        >
          <LooksWorld cam={cam} flash={strobe} stoolTilt={stoolTiltAt(tw)} subject={shot.light ?? shot.face ?? undefined} near={0.03} edit={edit}>
            {acts.map((a, i) => (
              <ActFigure key={`${a.role}-${a.kid.key}-${i > 30 ? i : ""}`} act={a} t={tw} />
            ))}
            {props.cam ? null : <GestureHand v={v} shot={shot} />}
            {selfieFlash > 0 ? <pointLight position={shot.pose.pos} intensity={9 * selfieFlash} distance={0} decay={0} color="#F4F6FF" /> : null}
          </LooksWorld>
          <LooksPost
            prev={props.cam ? cam : prev.pose}
            blur={hold || props.cam ? 0 : shot.blur}
            lens={{ focus: props.cam ? cam.pos.distanceTo(V3(0, 1.3, 0)) : shot.focus, aperture: props.cam ? 0.004 : shot.aperture }}
            grade={{
              time: v,
              edit: still ? 0 : edit,
              zoom: 1 + 0.045 * kick,
              shake: [vnoise(v * 23, 5) * 0.004 * kick, vnoise(v * 19, 6) * 0.004 * kick],
              letter: still ? 0 : edit,
              flash: still ? 0 : white,
              print: still ? 0 : print,
              on,
              ca: 0.0008 + 0.005 * kick + 0.002 * edit,
              sat: 1.04,
              con: 1.03,
            }}
            bloom={0.22 + 0.1 * edit}
          />
        </ThreeCanvas>
      ) : null}
      {!still && !props.cam ? <Overlay frame={frame} shot={shot} edit={edit} print={print} white={white} hold={!!hold} /> : null}
    </AbsoluteFill>
  );
};

/** Debug: the cast one by one on the stool, an expression per frame. */
const Lineup: React.FC<{ frame: number; cam?: string }> = ({ frame, cam: camKind }) => {
  const cam = debugCam(camKind ?? "portrait");
  const all = [...KIDS_IN_ORDER, PHOTOG, FRIEND, TEACHER];
  const kid = all[Math.floor(frame / 4) % all.length];
  const ex = frame % 4;
  const e = { ...NEUTRAL, ...[{}, { smile: 0.8, squint: 0.2 }, { jut: 1, brow: -0.5, squint: 0.3 }, { squint: 1, brow: -1 }][ex] };
  const feet: [THREE.Vector3, THREE.Vector3] = [V3(-0.12, 0.25, -0.2), V3(0.12, 0.25, -0.2)];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ThreeCanvas width={1080} height={1920} shadows camera={{ fov: 21, near: 0.03, far: 200, position: [0, 1.4, 2.6] }} gl={{ antialias: false, logarithmicDepthBuffer: true, preserveDrawingBuffer: true }}>
        <LooksWorld cam={cam} flash={0}>
          <KidFigure kid={kid} pose={{ sit: true, lift: SEAT_LIFT, e, look: cam.pos, feet }} at={V3(0, 0, 0)} yaw={Math.PI - 0.42} t={frame / 30} extras={{ gum: kid.key === "gum", glow: 0 }} />
        </LooksWorld>
        <LooksPost
          prev={cam}
          blur={0}
          lens={{ focus: cam.pos.distanceTo(V3(0, 1.4, 0)), aperture: 0.016 }}
          grade={{ time: frame / 30, edit: 0, zoom: 1, shake: [0, 0], letter: 0, flash: 0, print: 0, on: 1, ca: 0.001, sat: 1.04, con: 1.03 }}
          bloom={0.22}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
