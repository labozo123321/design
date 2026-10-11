import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { setArtFont } from "./art";
import { Backbox } from "./Backbox";
import { roomTexture, envMap } from "./env";
import { Inserts, Lighting } from "./Lights";
import { Monster } from "./Monster";
import { Bumpers, Ctx, Flippers, OtherBalls, Teeth } from "./Parts";
import { Plunger, Table } from "./Table";
import { showAt } from "./show";
import { M, T, clampF } from "./timeline";

/** Video time for flashes and jolts: frozen in the freeze frame, nothing during the rewind. */
export const fxTime = (t: number) => (t < M.freeze ? t : t < M.rewind[0] ? M.freeze : t < M.rewind[1] ? -100 : t);

/** How far the plunger is pulled back (0..1): slowly, a wobble at full stretch, then let go. */
export const plungerPull = (t: number) => {
  if (t < M.plunge + 0.6) return 0;
  if (t < M.launch - 1.2) return Math.min(1, (t - M.plunge - 0.6) / 2.4) ** 0.8;
  if (t < M.launch) return 1 + 0.03 * Math.sin(t * 40) * (t - (M.launch - 1.2));
  return Math.max(0, 1 - (t - M.launch) / 0.03);
};

export type CamShake = { yaw: number; pitch: number; roll: number };

const Rig: React.FC<{ frame: number; fov: number; shake: CamShake }> = ({ frame, fov, shake }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const f = clampF(frame);
  const p = T.you[f];
  const d = T.fwd[f];
  camera.position.set(p[0], p[1], p[2]);
  const target = new THREE.Vector3(p[0] + d[0], p[1] + d[1], p[2] + d[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.rotateY(shake.yaw);
  camera.rotateX(shake.pitch);
  camera.rotateZ(shake.roll);
  camera.fov = fov;
  camera.near = 0.003;
  camera.far = 30;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

export const PinballWorld: React.FC<{ frame: number; fov: number; shake: CamShake; font: string }> = ({ frame, fov, shake, font }) => {
  setArtFont(font);
  const t = frame / 30;
  const te = fxTime(t);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    scene.background = roomTexture();
    scene.environment = envMap(gl);
    scene.backgroundIntensity = 0.55;
    scene.environmentIntensity = 0.8;
  }, [scene, gl]);
  const f = clampF(frame);
  const cam = new THREE.Vector3(...(T.you[f] as [number, number, number]));
  const ctx: Ctx = { frame, t, te, cam, cold: t < M.rewind[1] };
  const show = showAt(t, te, frame);
  // inside the monster's mouth from the chomp until you're spat back out past its lips
  const inside = t >= M.chomp + 0.02 && t < M.burp + 0.12;
  return (
    <>
      <Rig frame={frame} fov={fov} shake={shake} />
      <Lighting show={show} />
      <Table />
      <Plunger pull={plungerPull(t)} />
      <Inserts show={show} />
      <Bumpers ctx={ctx} lit={show.gi} />
      <Flippers ctx={ctx} />
      <Teeth ctx={ctx} />
      <Monster ctx={ctx} inside={inside} />
      <OtherBalls ctx={ctx} />
      <Backbox lines={show.dmd} frame={frame} extra={show.dmdExtra} glow={show.glass} font={font} />
    </>
  );
};
