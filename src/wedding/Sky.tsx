import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CLOUDS, NOISE, SKY } from "../tsunami/glsl";
import { SUN } from "./flight";

/**
 * The golden-hour sky of the beach piece (same GLSL), with the wedding's sun: low over the mountains in the
 * north-west, beyond the lake.
 * The dome is drawn behind everything round the camera; the environment (for reflections on paint, chrome,
 * water and skin) is the same sky without the sun's disc, over warm ground.
 */

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
  float sd = dot(d, uSun);
  col += vec3(1.0, 0.86, 0.62) * smoothstep(0.99978, 0.99992, sd) * 22.0 * (1.0 - cl.a * 0.85);
  // below the horizon (seen past the edge of the world): hazy warm land
  if (d.y < 0.0) col = mix(col, vec3(0.5, 0.45, 0.38), smoothstep(0.0, 0.08, -d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

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
  if (d.y < 0.0) col = mix(col, vec3(0.42, 0.44, 0.3), smoothstep(0.0, 0.12, -d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

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
