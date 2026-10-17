import React, { useMemo } from "react";
import * as THREE from "three";
import type { CarState } from "./path";
import { LANES, RAMP } from "./path";
import { FLOODS } from "./Venue";

/**
 * The site's light: a faint blue night sky; three floodlight towers' worth of warm white; a follow spot
 * from a tower that keeps the car lit (and casts the car's shadow); the car's own headlights; the blue wash
 * up the ramp; the red glow off the lineup's LED strips.
 */

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const spot = (color: string, angle: number, penumbra: number) => {
  const l = new THREE.SpotLight(color, 1, 0, angle, penumbra, 0);
  return l;
};

export const SiteLights: React.FC<{ car: CarState; k?: number; follow?: THREE.Vector3; followK?: number; shadows?: boolean }> = ({ car, k = 1, follow, followK = 1, shadows = true }) => {
  const L = useMemo(() => {
    const floods = [0, 1, 3, 4].map((i) => {
      const l = spot("#FFF1DE", 0.62, 0.75);
      l.position.copy(FLOODS[i].at);
      l.target.position.copy(FLOODS[i].aim);
      l.userData.base = 6.5;
      return l;
    });
    const fol = spot("#F2F5FF", 0.11, 0.55);
    fol.position.set(-33, 13.5, -40);
    fol.castShadow = true;
    fol.shadow.mapSize.set(2048, 2048);
    fol.shadow.camera.near = 8;
    fol.shadow.camera.far = 160;
    fol.shadow.bias = -0.00012;
    fol.shadow.normalBias = 0.02;
    fol.shadow.radius = 3;
    fol.userData.base = 3.4;
    const head = spot("#F4F7FF", 0.5, 0.65);
    head.userData.base = 6;
    const ramp = spot("#3D6BFF", 0.55, 0.6);
    ramp.position.set(RAMP.x + 7, 0.5, RAMP.entryZ + 10);
    ramp.target.position.set(RAMP.x, 9, RAMP.entryZ - 10);
    ramp.userData.base = 7.0;
    const ramp2 = spot("#7F5CFF", 0.5, 0.6);
    ramp2.position.set(RAMP.x - 8, 0.5, RAMP.entryZ - 2);
    ramp2.target.position.set(RAMP.x, 12, RAMP.entryZ - 12);
    ramp2.userData.base = 5.0;
    const red = new THREE.PointLight("#FF2A1A", 1, 22, 1.4);
    red.position.set(LANES.b, 1.6, -45);
    red.userData.base = 4;
    return { floods, fol, head, ramp, ramp2, red };
  }, []);
  // the follow spot tracks the car (or whatever it's told to)
  const tgt = follow ?? car.pos.clone().add(V3(0, 0.6, 0));
  L.fol.target.position.copy(tgt);
  L.fol.intensity = L.fol.userData.base * k * followK;
  L.fol.castShadow = shadows;
  // re-aim so the cone always holds the car: wider when it's close
  const d = L.fol.position.distanceTo(tgt);
  L.fol.angle = THREE.MathUtils.clamp(5.5 / d, 0.07, 0.4);
  // headlights: from the nose, a little down
  const nose = V3(0, 0.55, -2.25).applyQuaternion(car.quat).add(car.pos);
  const ahead = V3(0, -0.6, -14).applyQuaternion(car.quat).add(car.pos);
  L.head.position.copy(nose);
  L.head.target.position.copy(ahead);
  L.head.intensity = L.head.userData.base * k;
  for (const l of [...L.floods, L.ramp, L.ramp2]) l.intensity = l.userData.base * k;
  L.red.intensity = L.red.userData.base * k;
  const all = [...L.floods, L.fol, L.head, L.ramp, L.ramp2];
  return (
    <>
      <hemisphereLight args={["#3A4870", "#101012", 1.1 * k]} />
      {all.map((l, i) => (
        <React.Fragment key={i}>
          <primitive object={l} />
          <primitive object={l.target} />
        </React.Fragment>
      ))}
      <primitive object={L.red} />
    </>
  );
};
