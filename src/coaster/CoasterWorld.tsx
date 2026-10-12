import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { getInputProps } from "remotion";
import { frameAt } from "./track";
import { SkyDome, SkyEnv } from "./Sky";
import { Track3D } from "./Track3D";
import { Train } from "./Train";
import { Rider } from "./Rider";
import { RIDERS, YOU_RIDER } from "./riders";
import { MARK, sAt } from "./track";
import { FPS, SUN, camAt, type Cam } from "./world";

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
const Sun: React.FC<{ focus: THREE.Vector3; r: number }> = ({ focus, r }) => {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight();
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    return l;
  }, []);
  light.position.copy(focus).addScaledVector(SUN, 300);
  light.target.position.copy(focus);
  light.target.updateMatrixWorld();
  light.intensity = 2.6;
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

const Ground: React.FC = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[4000, 4000]} />
      <meshStandardMaterial color="#5E7A3A" roughness={0.95} />
    </mesh>
  );
};

/** A third-person look at the front of the train (for checking the riders, and the ride photo). */
export const frontCam = (frame: number, dist = 4.2, up = 0.6, side = 0.0, fov = 40): Cam => {
  const f = frameAt(sAt(frame));
  const target = f.P.clone().addScaledVector(f.U, 0.2).addScaledVector(f.T, -3.0);
  const pos = f.P.clone().addScaledVector(f.T, dist).addScaledVector(f.U, up).addScaledVector(f.R, side);
  const m = new THREE.Matrix4().lookAt(pos, target, f.U);
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov, f };
};

export const CoasterWorld: React.FC<{ frame: number }> = ({ frame }) => {
  const debug = (getInputProps() as { cam?: string }).cam;
  const c = debug === "front" ? frontCam(frame) : debug === "near" ? frontCam(frame, 1.6, 0.35, 0.3, 50) : camAt(frame);
  const u = frame / FPS;
  // the shadow box: round the train, and stretched toward what you look at
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat);
  const focus = c.pos.clone().addScaledVector(look, 18);
  const s = sAt(frame);
  const chainShift = Math.max(0, Math.min(s, MARK.lift1) - MARK.lift0) + u * 0;
  return (
    <>
      <Rig c={c} />
      <SkyEnv />
      <SkyDome cam={c.pos} />
      <hemisphereLight args={["#AFC4E8", "#6B5F45", 0.55]} />
      <Sun focus={focus} r={70} />
      <Ground />
      <Track3D chainShift={chainShift} />
      <Train frame={frame}>
        {(row) => (
          <>
            {RIDERS.filter((r) => r.row === row).map((r) => (
              <Rider key={`${r.row}-${r.seat}`} sc={r} frame={frame} hi={r.person.name === "sister"} />
            ))}
            {row === 0 ? <Rider sc={YOU_RIDER} frame={frame} noHead /> : null}
          </>
        )}
      </Train>
    </>
  );
};
