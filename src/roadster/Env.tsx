import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/**
 * The reflections: a night at the test site baked into an environment map once: a black sky with a faint
 * glow along the horizon, the floodlight banks as hot panels, blue washes off the ramp, red LED lines low
 * down, a pale ground. Everything shiny (the paint, the visor, the steel) picks these up.
 */

const envScene = () => {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: /* glsl */ `
        varying vec3 vP;
        void main() {
          float y = vP.y;
          vec3 sky = mix(vec3(0.018, 0.022, 0.035), vec3(0.004, 0.005, 0.01), smoothstep(0.0, 0.5, y));
          // a glow on the horizon (the town to the north-east, the site's lights)
          float hz = exp(-abs(y) * 16.0);
          sky += vec3(0.09, 0.07, 0.06) * hz * (0.6 + 0.4 * max(0.0, -vP.z));
          // the ground: dark tarmac with the light pooled on it
          vec3 ground = vec3(0.035, 0.035, 0.04) * (0.6 + 0.4 * smoothstep(-0.5, 0.0, y));
          gl_FragColor = vec4(y > 0.0 ? sky : ground, 1.0);
        }`,
    }),
  );
  s.add(sky);
  const panel = (pos: THREE.Vector3, w: number, h: number, color: THREE.Color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // floodlight banks round the site
  const flood = new THREE.Color(1, 0.96, 0.9).multiplyScalar(7);
  for (const [x, y, z] of [
    [-30, 14, -20],
    [-30, 14, -70],
    [24, 12, -40],
    [24, 12, -95],
    [-12, 10, 30],
  ])
    panel(new THREE.Vector3(x, y, z).normalize().multiplyScalar(40), 3.2, 1.6, flood);
  // blue washes (the ramp, the beams)
  const blue = new THREE.Color(0.25, 0.45, 1.0).multiplyScalar(3.5);
  panel(new THREE.Vector3(0, 10, -40).normalize().multiplyScalar(42), 6, 14, blue);
  panel(new THREE.Vector3(30, 6, 10).normalize().multiplyScalar(42), 4, 6, blue.clone().multiplyScalar(0.6));
  // red LED lines low down
  const red = new THREE.Color(1.0, 0.06, 0.04).multiplyScalar(6);
  for (const a of [-0.9, -0.3, 0.4, 1.3, 2.2, 3.0]) panel(new THREE.Vector3(Math.sin(a) * 40, 0.6, Math.cos(a) * 40), 14, 0.25, red);
  // a soft white overhead (a big diffuse panel), so the tops of things read
  panel(new THREE.Vector3(0, 40, 0), 30, 30, new THREE.Color(0.06, 0.065, 0.08));
  return s;
};

export const useNightEnv = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(envScene(), 0.02);
    pm.dispose();
    return rt.texture;
  }, [gl]);
  scene.environment = env;
  return env;
};

export const NightEnv: React.FC = () => {
  useNightEnv();
  return null;
};
