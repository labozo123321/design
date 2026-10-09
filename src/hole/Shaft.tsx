import React, { useMemo } from "react";
import * as THREE from "three";
import { rockTexture } from "./rock";
import { SHAFT_FRAG, SHAFT_VERT } from "./shaftShader";
import { EV, HR, HX, HZ, KNOT_KM, knotWalls, surfY } from "./timeline";

/** The outer-core cavern's radius (m): the shaft runs down its middle as a glass tube. */
export const CAVERN_R = 160;

export type ShaftLight = {
  sunDir: THREE.Vector3;
  sunCol: THREE.Color;
  skyCol: THREE.Color;
};

/**
 * Everything underground (the shaft wall, the cavern of the outer core), ray-cast on a full-screen quad.
 * It writes depth, so the set pieces placed along the shaft sort against it like any other mesh.
 */
export const Shaft: React.FC<{
  frame: number;
  side: number;
  blur: number;
  light: ShaftLight;
  hot: number;
}> = ({ frame, side, blur, light, hot }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        depthTest: true,
        depthWrite: true,
        uniforms: {
          uTex: { value: rockTexture() },
          uInvProj: { value: new THREE.Matrix4() },
          uCamWorld: { value: new THREE.Matrix4() },
          uCamPos: { value: new THREE.Vector3() },
          uLogFC: { value: 0 },
          uSurf: { value: 0 },
          uAxis: { value: new THREE.Vector2(HX, HZ) },
          uR: { value: HR },
          uRC: { value: CAVERN_R },
          uKW: { value: new Float32Array(24) },
          uKD: { value: new Float32Array(KNOT_KM) },
          uBlur: { value: 0 },
          uTime: { value: 0 },
          uSide: { value: 0 },
          uSunDir: { value: new THREE.Vector3() },
          uSunCol: { value: new THREE.Color() },
          uSkyCol: { value: new THREE.Color() },
          uLampK: { value: 1 },
          uLampCol: { value: new THREE.Color(1.0, 0.8, 0.56) },
          uTrainW: { value: EV.train },
          uTrainR: { value: 2.9 },
          uCaveW: { value: EV.cave },
          uMineW: { value: EV.mine },
          uDiaW: { value: EV.diamonds },
          uHot: { value: 0 },
        },
      }),
    [],
  );
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    m.frustumCulled = false;
    m.renderOrder = 1;
    // the camera's matrices at draw time (the composer renders after React has placed the camera)
    m.onBeforeRender = (_r, _s, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const u = mat.uniforms;
      (u.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
      (u.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
      (u.uCamPos.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
      u.uLogFC.value = 2.0 / Math.log2(cam.far + 1.0);
    };
    return m;
  }, [mat]);
  const u = mat.uniforms;
  u.uSurf.value = surfY(frame);
  (u.uKW.value as Float32Array).set(knotWalls(side));
  u.uBlur.value = blur;
  u.uTime.value = frame / 30;
  u.uSide.value = side;
  (u.uSunDir.value as THREE.Vector3).copy(light.sunDir);
  (u.uSunCol.value as THREE.Color).copy(light.sunCol);
  (u.uSkyCol.value as THREE.Color).copy(light.skyCol);
  u.uHot.value = hot;
  return <primitive object={mesh} />;
};
