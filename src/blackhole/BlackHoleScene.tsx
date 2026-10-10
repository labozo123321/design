import React, { useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { continueRender, delayRender, staticFile } from "remotion";
import { rockTexture } from "../hole/rock";
import { BH_FRAG, BH_VERT } from "./bhShader";
import { BH_DURATION, EV, T_RS, camAt, earthAt } from "./timeline";

/** Places the camera at the origin looking where the track says; the shader puts you at uPos itself. */
export const Rig: React.FC<{ frame: number }> = ({ frame }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(frame);
  const m = new THREE.Matrix4().lookAt(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(...c.fwd),
    new THREE.Vector3(...c.up),
  );
  camera.position.set(0, 0, 0);
  camera.quaternion.setFromRotationMatrix(m);
  camera.fov = c.fov;
  camera.near = 0.01;
  camera.far = 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

const FACES = ["px", "nx", "py", "ny", "pz", "nz"];
let sky: THREE.CubeTexture | null = null;
let skyReady: Promise<void> | null = null;

/**
 * The galactic-centre sky (scripts/generate-bh-sky.py), loaded once per tab. The render is held until it's
 * in, then the canvas is drawn again (it last drew before the pictures had arrived).
 */
const useSky = () => {
  const [handle] = useState(() => delayRender("black hole sky"));
  const advance = useThree((s) => s.advance);
  if (!sky) {
    skyReady = new Promise<void>((resolve, reject) => {
      sky = new THREE.CubeTextureLoader().load(
        FACES.map((f) => staticFile(`blackhole/sky_${f}.jpg`)),
        () => resolve(),
        undefined,
        (e) => reject(e),
      );
      sky.colorSpace = THREE.SRGBColorSpace;
      sky.generateMipmaps = true;
      sky.minFilter = THREE.LinearMipmapLinearFilter;
      sky.magFilter = THREE.LinearFilter;
      sky.anisotropy = 8;
    });
  }
  useMemo(() => {
    skyReady!
      .then(() => {
        advance(performance.now());
        continueRender(handle);
      })
      .catch((e) => {
        console.error("black hole sky failed to load", e);
        continueRender(handle);
      });
  }, [handle, advance]);
  return sky!;
};

/**
 * The noise tile (shared with the Hole composition) with plain trilinear filtering: lensing squeezes the
 * disk's images hundreds of times more in one direction than the other, far past what anisotropic
 * filtering can follow, and its few taps along the long axis alias into a plaid.
 */
let noise: THREE.DataTexture | null = null;
const noiseTexture = () => {
  if (!noise) {
    noise = rockTexture().clone();
    noise.anisotropy = 1;
    noise.needsUpdate = true;
  }
  return noise;
};

/** Time for the disk's rotation (units of r_s / c): Earth's clock on the way in, then slowed right down. */
const diskTime = (frame: number) => {
  const t = frame / 30;
  const cap = Math.round(EV.descend * 30);
  // the ending replays the opening shot: run on into frame 0 so the loop doesn't jump
  if (t >= EV.end + 0.5) return ((t - BH_DURATION / 30) * (earthAt(30) - earthAt(0))) / T_RS;
  if (frame <= cap) return earthAt(frame) / T_RS;
  return earthAt(cap) / T_RS + (t - EV.descend) * 0.6;
};
/** Seconds for the slow drifts in the picture, also running on into frame 0 at the end. */
const loopTime = (frame: number) => {
  const t = frame / 30;
  return t >= EV.end + 0.5 ? t - BH_DURATION / 30 : t;
};

export const BlackHoleView: React.FC<{
  frame: number;
  skyGain: number;
  starGain: number;
  diskGain: number;
  inside: number;
  debris: number;
}> = ({ frame, skyGain, starGain, diskGain, inside, debris }) => {
  const skyTex = useSky();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BH_VERT,
        fragmentShader: BH_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uInvProj: { value: new THREE.Matrix4() },
          uCamWorld: { value: new THREE.Matrix4() },
          uPos: { value: new THREE.Vector3() },
          uEps: { value: 1 },
          uBeta: { value: new THREE.Vector3() },
          uSky: { value: null },
          uNoise: { value: noiseTexture() },
          uSkyGain: { value: 1 },
          uStarGain: { value: 1 },
          uDiskGain: { value: 1 },
          uDiskT: { value: 0 },
          uFlow: { value: 0 },
          uPx: { value: 5e-4 },
          uTime: { value: 0 },
          uInside: { value: 0 },
          uDebris: { value: 0 },
          uShiftMax: { value: 8 },
        },
      }),
    [],
  );
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.frustumCulled = false;
    m.renderOrder = -10;
    const size = new THREE.Vector2();
    m.onBeforeRender = (renderer, _s, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const u = mat.uniforms;
      (u.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
      (u.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
      renderer.getDrawingBufferSize(size);
      u.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / size.y;
    };
    return m;
  }, [mat]);
  const c = camAt(frame);
  const u = mat.uniforms;
  u.uSky.value = skyTex;
  (u.uPos.value as THREE.Vector3).set(...c.pos);
  u.uEps.value = c.eps;
  (u.uBeta.value as THREE.Vector3).set(...c.beta);
  u.uDiskT.value = diskTime(frame);
  u.uFlow.value = loopTime(frame);
  u.uTime.value = frame / 30;
  u.uSkyGain.value = skyGain;
  u.uStarGain.value = starGain;
  u.uDiskGain.value = diskGain;
  u.uInside.value = inside;
  u.uDebris.value = debris;
  return <primitive object={mesh} />;
};
