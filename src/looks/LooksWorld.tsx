import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { Gym, SOFTBOX, FACE } from "./Gym";
import type { Pose } from "./LooksPost";

RectAreaLightUniformsLib.init();

/**
 * Everything in the picture for one frame: the camera, the gym's light (the high-bay lamps from above, the
 * windows), the softboxes as soft area lights (and their strobes on the flash), the set, the people.
 */

const Rig: React.FC<{ c: Pose; near?: number }> = ({ c, near = 0.03 }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = near;
  camera.far = 200;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

/** The softboxes' light: a big soft key from the left (an area light for its softness, a spot in it for the
 * shadows under the nose and the chin), a fill from the right, a hair light from behind on a boom; the
 * strobes on the flash. */
const StudioLights: React.FC<{ flash: number; modelling?: number; subject?: THREE.Vector3; edit?: number }> = ({ flash, modelling = 1, subject = FACE, edit = 0 }) => {
  const lights = useMemo(
    () =>
      SOFTBOX.map((s, i) => {
        const l = new THREE.RectAreaLight("#FFF3E6", 1, s.r * 1.7, s.r * 1.7);
        l.position.copy(s.at);
        l.lookAt(FACE);
        l.userData.base = i === 0 ? 3.6 : 3.4;
        return l;
      }),
    [],
  );
  const spots = useMemo(() => {
    const key = new THREE.SpotLight("#FFF1E2", 1, 0, 0.42, 0.9, 0);
    key.position.copy(SOFTBOX[0].at);
    key.castShadow = !(globalThis as { __noKeyShadow?: boolean }).__noKeyShadow && !(globalThis as { __perf?: Record<string, boolean> }).__perf?.noShadow;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.6;
    key.shadow.camera.far = 6;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 6;
    key.userData.base = 2.3;
    const hair = new THREE.SpotLight("#FFE9D2", 1, 0, 0.36, 1, 0);
    hair.position.set(0.55, 2.75, -0.95);
    hair.userData.base = 2.6;
    return [key, hair];
  }, []);
  lights.forEach((l) => {
    l.intensity = l.userData.base * (modelling + 3.2 * flash);
  });
  spots.forEach((l, i) => {
    l.intensity = l.userData.base * (modelling + 3.2 * flash) * (i === 1 ? 1 + 1.6 * edit : 1 + 0.12 * edit);
    if (i === 1) l.color.set("#FFE9D2").lerp(new THREE.Color("#BFD8FF"), edit);
    l.target.position.copy(subject);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      {lights.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {spots.map((l, i) => (
        <primitive key={`s${i}`} object={l} />
      ))}
      {spots.map((l, i) => (
        <primitive key={`t${i}`} object={l.target} />
      ))}
    </>
  );
};

/** The gym's own light: the lamps overhead (a soft top light with shadows), daylight from the windows. */
const GymLights: React.FC = () => {
  const top = useMemo(() => {
    const l = new THREE.DirectionalLight("#F2F4FF", 1.25);
    l.position.set(1.5, 14, 4);
    l.target.position.set(0, 0, 2);
    l.castShadow = !(globalThis as { __perf?: Record<string, boolean> }).__perf?.noShadow;
    l.shadow.mapSize.set(2048, 2048);
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -10;
    cam.right = 10;
    cam.top = 14;
    cam.bottom = -8;
    cam.near = 1;
    cam.far = 40;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 4;
    return l;
  }, []);
  const window = useMemo(() => {
    const l = new THREE.DirectionalLight("#DDE7FF", 0.55);
    l.position.set(-12, 9, 3);
    l.target.position.set(0, 1, 2);
    return l;
  }, []);
  return (
    <>
      <hemisphereLight args={["#E6ECF6", "#8C6C4A", 0.85]} />
      <primitive object={top} />
      <primitive object={top.target} />
      <primitive object={window} />
      <primitive object={window.target} />
    </>
  );
};

export const LooksWorld: React.FC<{ cam: Pose; flash: number; children?: React.ReactNode; near?: number; stoolTilt?: number; stoolAt?: THREE.Vector3; subject?: THREE.Vector3; edit?: number }> = ({
  cam,
  flash,
  children,
  near,
  stoolTilt,
  stoolAt,
  subject,
  edit = 0,
}) => {
  return (
    <>
      <Rig c={cam} near={near} />
      <color attach="background" args={["#000000"]} />
      <GymLights />
      <StudioLights flash={flash} subject={subject} edit={edit} />
      <Gym flash={flash} stoolTilt={stoolTilt} stoolAt={stoolAt} />
      {children}
    </>
  );
};
