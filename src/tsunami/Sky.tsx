import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CLOUDS, NOISE, SKY } from "./glsl";
import { SUN } from "./world";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
${NOISE}
${SKY}
${CLOUDS}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyCol(d);
  vec4 cl = skyClouds(d);
  col = mix(col, cl.rgb, cl.a);
  // the sun's disc, a touch bigger than life so it reads on a phone
  float sd = dot(d, uSun);
  col += vec3(1.0, 0.86, 0.62) * smoothstep(0.99978, 0.99992, sd) * 22.0 * (1.0 - cl.a * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

/** For the reflections: the sky without the sun's disc, and warm sand below the horizon. */
const ENV_FRAG = /* glsl */ `
uniform vec3 uSun;
varying vec3 vDir;
${NOISE}
${SKY}
${CLOUDS}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyCol(d);
  vec4 cl = skyClouds(d);
  col = mix(col, cl.rgb, cl.a);
  if (d.y < 0.0) col = mix(col, vec3(0.62, 0.5, 0.36), smoothstep(0.0, 0.12, -d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

/** The sky dome, drawn first behind everything, centred on the camera. */
export const SkyDome: React.FC<{ cam: THREE.Vector3 }> = ({ cam }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: SUN.clone() } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    [],
  );
  return (
    <mesh position={cam} scale={20000} renderOrder={-10} frustumCulled={false} material={mat}>
      <sphereGeometry args={[1, 64, 32]} />
    </mesh>
  );
};

/** Prefiltered sky for the reflections on wet sand, skin, paint and chrome; set as the scene environment. */
export const SkyEnv: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const env = useMemo(() => {
    const sc = new THREE.Scene();
    const m = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN.clone() } },
      vertexShader: VERT,
      fragmentShader: ENV_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), m));
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(sc, 0, 0.1, 1000);
    pm.dispose();
    return rt.texture;
  }, [gl]);
  scene.environment = env;
  return null;
};
