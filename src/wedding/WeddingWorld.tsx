import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { getInputProps } from "remotion";
import { SkyDome, SkyEnv } from "./Sky";
import { Lake, Lawn, Mountains, ShoreWall, Trees, Villa, Vines } from "./Land";
import { Ceremony } from "./Ceremony";
import { Tent } from "./Tent";
import { Treats } from "./Treats";
import { People } from "./People";
import { Dog } from "./Dog";
import { DroneParts, GrassPatch, RingOnRibbon } from "./Drone";
import { CakeBurst, FlyingHat, GLASS_BREAK, TowerBurst } from "./Effects";
import { CUE_W, L, SUN, camAt, smooth, span, wAt, type Cam } from "./flight";

/**
 * Everything in the picture for one frame: the rig (the drone's camera), the evening sky and its light,
 * the sun with a shadow box that follows what the camera looks at, the land, and (from the other files)
 * the ceremony, the tent, everyone in them, the drone's own props and the ring box.
 */

const Rig: React.FC<{ c: Cam; near?: number }> = ({ c, near = 0.02 }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = near;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

const Sun: React.FC<{ focus: THREE.Vector3; r: number; k: number }> = ({ focus, r, k }) => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    return l;
  }, []);
  light.position.copy(focus).addScaledVector(SUN, 300);
  light.target.position.copy(focus);
  light.target.updateMatrixWorld();
  light.intensity = 2.8 * k;
  light.color.set("#FFC890");
  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 50;
  cam.far = 700;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.02;
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

/** Debug views: a camera following the drone from behind and above, or a high view of the venue. */
const debugCam = (frame: number, kind: string): Cam | null => {
  const c = camAt(frame);
  if (kind === "chase") {
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(c.quat).setY(0).normalize();
    const pos = c.pos.clone().addScaledVector(back, 3.2).add(new THREE.Vector3(0, 1.4, 0));
    const m = new THREE.Matrix4().lookAt(pos, c.pos, new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: 60 };
  }
  if (kind === "venue") {
    const pos = new THREE.Vector3(10, 38, 42);
    const m = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(12, 0, 2), new THREE.Vector3(0, 1, 0));
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: 55 };
  }
  return null;
};

/** The family dog: beside the kid at the start, watching the drone; at the end, with the rings. */
const DOG_END = new THREE.Vector3(...L.dogEnd);
const CAM_END = new THREE.Vector3(24.02, 1.12, -7.42);
const WeddingDog: React.FC<{ w: number }> = ({ w }) => {
  if (w < CUE_W.feedBack - 1) {
    if (w > CUE_W.reveal + 3) return null;
    const start = new THREE.Vector3(...L.dog);
    return (
      <Dog
        at={start}
        yaw={-0.25}
        scale={0.92}
        pose={{
          look: camAt(Math.round(w * 30)).pos,
          tilt: 0.35 * span(w, 3.7, 5.2, 0.3) - 0.15 * span(w, 0.6, 1.8, 0.3),
          pant: 0.8 * (1 - span(w, 1.7, 3.0, 0.3)),
          tongue: 0.9 * (1 - span(w, 1.7, 3.0, 0.3)),
          wag: 0.6 + 0.4 * span(w, 3.5, 6, 0.4),
          t: w,
          perk: span(w, 1.6, 3.4, 0.3),
          blink: (w % 3.3) < 0.12 ? 1 : 0,
        }}
      />
    );
  }
  const yaw = Math.atan2(-(CAM_END.x - DOG_END.x), -(CAM_END.z - DOG_END.z));
  return (
    <Dog
      at={DOG_END}
      yaw={yaw}
      pose={{
        look: CAM_END,
        tilt: 0.4 * smooth(CUE_W.tilt - 0.2, CUE_W.tilt + 0.4, w),
        pant: 0.15,
        tongue: 0,
        wag: 1,
        t: w,
        perk: smooth(CUE_W.tilt - 0.2, CUE_W.tilt + 0.4, w),
        blink: (w % 2.9) < 0.12 ? 1 : 0,
        box: true,
        frosting: true,
      }}
    />
  );
};

export const WeddingWorld: React.FC<{ frame: number }> = ({ frame }) => {
  const debug = (getInputProps() as { cam?: string }).cam ?? "";
  const c = debugCam(frame, debug) ?? camAt(frame);
  const w = wAt(frame);
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat);
  const focus = c.pos.clone().addScaledVector(look, 14);
  focus.y = Math.max(0, Math.min(focus.y, 4));
  return (
    <>
      {/* in the crashes, don't draw the bits right on the lens */}
      <Rig c={c} near={debug ? 0.02 : w > CUE_W.cakeHit - 0.08 ? 0.085 : Math.abs(w - CUE_W.towerHit) < 0.6 ? 0.06 : 0.02} />
      <SkyEnv />
      <SkyDome cam={c.pos} />
      <hemisphereLight args={["#B4C6E6", "#5E5640", 0.6]} />
      <Sun focus={focus} r={36} k={1} />
      <Lake t={w} />
      <Mountains />
      <Lawn />
      <ShoreWall />
      <Trees />
      <Vines />
      <Villa />
      <Ceremony t={w} />
      <Tent t={w} swing={0.1 * Math.sin((w - CUE_W.chandelier) * 3.1) * Math.exp(-Math.max(0, w - CUE_W.chandelier) / 2.5) * smooth(CUE_W.chandelier - 0.1, CUE_W.chandelier + 0.1, w)} />
      <Treats
        t={w}
        hideGlass={(i) => GLASS_BREAK[i] !== null && w >= (GLASS_BREAK[i] as number)}
        cakeGone={w >= CUE_W.cakeHit ? 1 : 0}
        pour={0}
      />
      <People w={w} cam={c.pos} />
      <WeddingDog w={w} />
      <GrassPatch frame={frame} />
      <RingOnRibbon frame={frame} />
      <FlyingHat w={w} />
      <TowerBurst w={w} />
      <CakeBurst w={w} />
      {debug ? null : <DroneParts frame={frame} c={c} />}
    </>
  );
};
