import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { getInputProps } from "remotion";
import { frameAt } from "./track";
import { SkyDome, SkyEnv } from "./Sky";
import { Track3D } from "./Track3D";
import { Terrain, undergroundAt } from "./Terrain";
import { Station } from "./Station";
import { Rides } from "./Rides";
import { Scenery } from "./Scenery";
import { PhotoMast, Splash } from "./Effects";
import { Train } from "./Train";
import { Rider } from "./Rider";
import { RIDERS, YOU_RIDER } from "./riders";
import { MARK, sAt } from "./track";
import { FPS, SUN, camAt, photoCam, type Cam } from "./world";

/**
 * Everything in the picture, for one frame: the rig (your eyes), the sky and its light, the sun with a
 * shadow box that follows you, the ground, the coaster and the train.
 */

const Rig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.quaternion.copy(c.quat);
  camera.fov = c.fov;
  camera.near = 0.03;
  camera.far = 30000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

/** The sun, casting shadows in a box round the point you are looking at (and below you). */
/** How strongly the sky lights everything (dark in the tunnel). */
const EnvLevel: React.FC<{ k: number }> = ({ k }) => {
  const scene = useThree((st) => st.scene);
  scene.environmentIntensity = k;
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
  light.intensity = 2.6 * k;
  light.color.set("#FFD2A1");
  const cam = light.shadow.camera as THREE.OrthographicCamera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 50;
  cam.far = 600;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 0.03;
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

export const frontCam = (frame: number, dist = 4.2, up = 0.6, side = 0.0, fov = 40): Cam => {
  const f = frameAt(sAt(frame));
  const target = f.P.clone().addScaledVector(f.U, 0.2).addScaledVector(f.T, -3.0);
  const pos = f.P.clone().addScaledVector(f.T, dist).addScaledVector(f.U, up).addScaledVector(f.R, side);
  const m = new THREE.Matrix4().lookAt(pos, target, f.U);
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov, f };
};

/**
 * mode "ride": your eyes. "photo": the on-ride camera at the bottom of the drop (your own face shows,
 * and the flash fires).
 */
export const CoasterWorld: React.FC<{ frame: number; mode?: "ride" | "photo" }> = ({ frame, mode = "ride" }) => {
  const debug = (getInputProps() as { cam?: string }).cam;
  const c =
    mode === "photo"
      ? photoCam(debug === "you")
      : debug === "front"
        ? frontCam(frame)
        : debug === "near"
          ? frontCam(frame, 1.6, 0.35, 0.3, 50)
          : debug === "wide"
            ? frontCam(frame, 14, 5, 9, 60)
            : debug === "hand"
              ? frontCam(frame, 1.1, 0.25, 0.05, 40)
              : camAt(frame);
  const u = frame / FPS;
  // the shadow box: round the train, and stretched toward what you look at
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat);
  const focus = c.pos.clone().addScaledVector(look, 18);
  const s = sAt(frame);
  const under = undergroundAt(c.pos.y);
  const chainShift = u * 6.8;
  void s;
  void MARK;
  return (
    <>
      <Rig c={c} />
      <SkyEnv />
      <SkyDome cam={c.pos} />
      <hemisphereLight args={["#AFC4E8", "#6B5F45", 0.55 * (1 - 0.92 * under)]} />
      <EnvLevel k={1 - 0.9 * under} />
      <Sun focus={focus} r={70} k={1 - under} />
      {under > 0.01 ? (
        <>
          {/* the strip lights near you light the walls */}
          <pointLight position={c.pos.clone().addScaledVector(c.f.U, 1.6).addScaledVector(c.f.T, 2)} intensity={6 * under} distance={9} decay={1.6} color="#FFE2C0" />
          <pointLight position={c.pos.clone().addScaledVector(c.f.U, 1.6).addScaledVector(c.f.T, 9)} intensity={5 * under} distance={9} decay={1.6} color="#FFE2C0" />
        </>
      ) : null}
      {mode === "photo" ? (
        // the flash on the camera mast
        <pointLight position={c.pos.clone().addScaledVector(c.f.U, 0.6)} intensity={2.6} distance={14} decay={1.5} color="#FFF4E8" />
      ) : null}
      <Terrain time={u} />
      <Track3D chainShift={chainShift} />
      <Station frame={frame} cam={c.pos} />
      <Rides t={u + 40} />
      <Scenery t={u} />
      <Splash t={u} />
      {mode === "photo" ? null : <PhotoMast t={u} />}
      <Train frame={frame}>
        {(row) => (
          <>
            {RIDERS.filter((r) => r.row === row).map((r) => (
              <Rider key={`${r.row}-${r.seat}`} sc={r} frame={frame} hi={r.person.name === "sister"} />
            ))}
            {row === 0 ? <Rider sc={YOU_RIDER} frame={frame} noHead={mode !== "photo"} /> : null}
          </>
        )}
      </Train>
    </>
  );
};
