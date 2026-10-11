import React from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { SunLight } from "../pov/PovWorld";
import { Boats, Beach, Fishes, SeaFloor } from "./Props";
import { Gulls } from "./Gulls";
import { People } from "./People";
import { Sea } from "./Sea";
import { SkyDome, SkyEnv } from "./Sky";
import { Island, Jungle, TERRAIN_U, Terrain } from "./Terrain";
import { You } from "./You";
import { FPS, SUN, YOU, camAt, drawAt, groundY, smooth, sunCover, swashAt, type Cam } from "./world";

const Rig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(c.pitch, c.yaw, c.roll);
  camera.fov = c.fov;
  camera.near = 0.04;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

const SHADOW_AT = new THREE.Vector3(0, 0, 1);

/** How strongly the sky lights everything through reflections (dimmer in the wave's shadow). */
const EnvLevel: React.FC<{ k: number }> = ({ k }) => {
  const scene = useThree((s) => s.scene);
  scene.environmentIntensity = k;
  return null;
};

export const BeachWorld: React.FC<{ frame: number }> = ({ frame }) => {
  const u = frame / FPS;
  const c = camAt(frame);
  const cam = new THREE.Vector3(c.x, c.y, c.z);
  // once the wave covers the sun, the beach is in its shadow
  const sunVis = 1 - sunCover(u);
  const wind = smooth(10.2, 15.5, u);
  const sky = new THREE.Color("#A9BDE3").lerp(new THREE.Color("#6F8AB8"), 1 - sunVis);
  const ground = new THREE.Color("#C2A47C").lerp(new THREE.Color("#5E5A55"), 1 - sunVis);
  const bodyZ = YOU.z + 0.25 * smooth(12.9, 13.6, u);
  TERRAIN_U.uLevel.value = drawAt(u) + swashAt(u);
  TERRAIN_U.uTime.value = u;
  return (
    <>
      <Rig c={c} />
      <SkyEnv />
      <SkyDome cam={cam} />
      <hemisphereLight args={[sky, ground, 0.62 - 0.4 * (1 - sunVis)]} />
      <EnvLevel k={0.35 + 0.65 * sunVis} />
      <SunLight
        position={SHADOW_AT.clone().addScaledVector(SUN, 160)}
        target={SHADOW_AT}
        intensity={2.5 * sunVis}
        color={new THREE.Color("#FFC98F")}
        size={2048}
        r={44}
        far={420}
        bias={-0.0004}
        normalBias={0.04}
      />
      {/* light thrown back off the bright sand, so faces turned to you aren't black */}
      <directionalLight position={[0, 6, 30]} intensity={0.18 + 0.1 * sunVis} color="#FFE2C4" />
      <Terrain />
      <Island />
      <Jungle />
      <SeaFloor />
      <Fishes u={u} />
      <Boats u={u} />
      <Beach u={u} wind={wind} />
      <People u={u} cam={cam} />
      <Gulls u={u} />
      <You pos={new THREE.Vector3(YOU.x, groundY(YOU.x, YOU.z), bodyZ)} yaw={c.yaw} />
      <Sea u={u} sunVis={sunVis} fov={c.fov} />
    </>
  );
};
