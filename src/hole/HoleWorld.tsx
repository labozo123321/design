import React from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { City, Planet } from "../pov/Ground";
import { Plaza } from "../pov/Plaza";
import { SunLight } from "../pov/PovWorld";
import { Clouds, SUN_DIR, SkyDome, Sun, horizonDip, skyColor } from "../pov/Sky";
import { Shaft } from "./Shaft";
import { Metro } from "./pieces/Metro";
import { Fossil } from "./pieces/Fossil";
import { Cave } from "./pieces/Cave";
import { Mine } from "./pieces/Mine";
import { Core } from "./pieces/Core";
import { rigAt } from "./rig";
import { rockTexture } from "./rock";
import { Spectators } from "./Spectators";
import { DiveArms, StandingBody } from "./HoleBody";
import { Island, MOON_DIR, NightSky } from "./Island";
import { EV, HR, HX, HZ, T_CENTRE, T_DROP, camAt, knotWalls, sideAt, surfY, visAt, wallAt } from "./timeline";

const Rig: React.FC<{ frame: number }> = ({ frame }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(frame);
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.order = "YXZ";
  camera.rotation.set(c.pitch, c.yaw, c.roll);
  camera.fov = c.fov;
  camera.near = 0.04;
  camera.far = 2e7;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

const SUN_COL = new THREE.Color("#FFFFFF").lerp(new THREE.Color("#FFB26E"), 0.8).multiplyScalar(2.9);
const DAY_SKY = new THREE.Color("#8FA7D8").multiplyScalar(0.95);
const MOON_COL = new THREE.Color("#9FB6E0").multiplyScalar(0.32);
const NIGHT_SKY = new THREE.Color("#1A2A4A").multiplyScalar(0.5);

/**
 * The plaza at golden hour, the fountain gone and a hole in its place. Its lights fade once you're down the
 * hole (`lightK`): three.js lights don't know about the rock in between, and from below you only see the
 * sky and the people at the rim against it.
 */
const Surface: React.FC<{ frame: number; cam: THREE.Vector3; lightK: number }> = ({ frame, cam, lightK }) => {
  const t = frame / 30;
  const c = camAt(frame);
  const alt = Math.max(0, c.y);
  const dip = horizonDip(alt);
  const horizon = skyColor(
    new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(dip), Math.sin(-dip + 0.012), -Math.cos(c.yaw) * Math.cos(dip)),
    alt,
  );
  const sunlit = new THREE.Color("#FFF4E6").lerp(new THREE.Color("#FFC39A"), 0.7);
  const shadowTarget = new THREE.Vector3(-2, 0, 6);
  return (
    <>
      <fog attach="fog" args={[horizon, 40, 2600]} />
      <SkyDome cam={cam} alt={alt} />
      <Sun cam={cam} alt={alt} />
      <hemisphereLight
        args={[
          skyColor(new THREE.Vector3(0, 1, 0), alt).lerp(new THREE.Color("#9DB6EA"), 0.35),
          "#8A6A50",
          0.92 * lightK,
        ]}
      />
      <ambientLight intensity={0.1 * lightK} />
      <SunLight
        position={shadowTarget.clone().addScaledVector(SUN_DIR, 90)}
        target={shadowTarget}
        intensity={2.9 * lightK}
        color={new THREE.Color("#FFFFFF").lerp(new THREE.Color("#FFB26E"), 0.8)}
        size={2048}
        r={46}
        far={220}
        bias={-0.0003}
        normalBias={0.03}
      />
      <Planet />
      <City t={t} alt={alt} hole={{ x: HX, z: HZ, r: HR + 0.05 }} />
      <Plaza t={t} g={1} hole />
      <Spectators t={t} cam={cam} />
      <Clouds cam={cam} sunlit={sunlit} />
    </>
  );
};

export const HoleWorld: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame / 30;
  const c = camAt(frame);
  const cam = new THREE.Vector3(c.x, c.y, c.z);
  const side = sideAt(frame);
  const wall = wallAt(frame);
  // the walls' speed past you: the visual scroll, or your fall back in at the end
  const speed = t > T_DROP ? 9.81 * (t - T_DROP) : visAt(frame);
  const blur = (speed * 0.5) / 30;
  const onCitySide = side === 0 && wall < 80 && t < T_CENTRE;
  // white heat swelling toward the centre, fading after the flip
  const hot =
    t < T_CENTRE ? Math.max(0, (t - 46.2) / 1.3) ** 2 * 3 : Math.max(0, 1 - (t - T_CENTRE) / 0.9) ** 2 * 3;
  const light =
    side === 0
      ? { sunDir: SUN_DIR, sunCol: SUN_COL, skyCol: DAY_SKY }
      : { sunDir: MOON_DIR, sunCol: MOON_COL, skyCol: NIGHT_SKY };
  const rig = rigAt(frame);
  const surf = surfY(frame);
  const kw = knotWalls(side);
  const near = (a: number, b: number) => wall > a && wall < b;
  const surfK = 1 - Math.min(1, Math.max(0, (t - 3.6) / 1.8));
  return (
    <>
      <Rig frame={frame} />
      <color attach="background" args={[side === 0 ? "#0A0A0C" : "#0B1322"]} />
      {onCitySide ? <Surface frame={frame} cam={cam} lightK={surfK * surfK} /> : null}
      <hemisphereLight args={[rig.env.sky, rig.env.ground, rig.env.k]} />
      {[...rig.lamps, rig.p3, rig.p4].map((l, i) => (
        <pointLight key={i} position={l.pos} color={l.color} intensity={l.intensity} distance={0} decay={2} />
      ))}
      <Shaft frame={frame} side={side} blur={blur} light={light} hot={hot} />
      {side === 0 && t < T_CENTRE ? (
        <>
          {wall < 130 ? <Metro y={surf - EV.train} t={t} /> : null}
          {near(20, 120) ? <Fossil y={surf - EV.fossils} th={-Math.PI / 2} /> : null}
          {near(35, 170) ? <Cave y={surf - EV.cave} /> : null}
          {near(110, 260) ? <Mine y={surf - EV.mine} /> : null}
        </>
      ) : null}
      {near(kw[18] - 520, kw[21] + 140) ? (
        <Core top={surf - kw[18]} bot={surf - kw[21]} t={t} blur={blur} tex={rockTexture()} />
      ) : null}
      {side === 1 ? <NightSky cam={cam} t={t} /> : null}
      {side === 1 && wall < 300 ? <Island t={t} cam={cam} y={surf} /> : null}

      {/* your own body */}
      <group position={cam} rotation={[0, c.yaw, 0]}>
        <StandingBody t={t} />
      </group>
      <group position={cam} rotation={new THREE.Euler(c.pitch, c.yaw, c.roll, "YXZ")}>
        <DiveArms t={t} speed={speed} />
      </group>
    </>
  );
};
