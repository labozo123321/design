import * as THREE from "three";
import { HR, HX, HZ } from "./timeline";

/** An emissive colour above 1 (linear), so the bloom picks it up. */
export const hot = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

const glowCache = new Map<string, THREE.MeshBasicMaterial>();
/** Unlit glowing material (lamps, windows, LEDs), cached by colour and strength. */
export const glowMat = (hex: string, k: number) => {
  const key = `${hex}:${k}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: hot(hex, k), toneMapped: true });
    glowCache.set(key, m);
  }
  return m;
};

const stdCache = new Map<string, THREE.MeshStandardMaterial>();
export const std = (hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const key = `${hex}:${JSON.stringify(opts)}`;
  let m = stdCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, ...opts });
    stdCache.set(key, m);
  }
  return m;
};

/**
 * Makes a material skip whatever lies inside the shaft's cylinder (plus `margin`): tunnels, galleries and the
 * cave cross the shaft, but only the parts out in the rock should show; inside, the shaft is empty.
 */
export const clipOutsideShaft = <M extends THREE.Material>(m: M, margin = 0.02): M => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClipAxis = { value: new THREE.Vector3(HX, HZ, (HR + margin) * (HR + margin)) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vClipW;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vClipW;\nuniform vec3 uClipAxis;")
      .replace(
        "void main() {",
        "void main() {\n  { vec2 cq = vClipW.xz - uClipAxis.xy; if (dot(cq, cq) < uClipAxis.z) discard; }",
      );
  };
  m.customProgramCacheKey = () => `clipShaft${margin}`;
  return m;
};

/** Seeded PRNG (mulberry32): the same numbers in every render tab. */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** World position of a point on (or `dr` beyond) the shaft wall at angle th (0 = +z, +pi/2 = +x). */
export const onWall = (th: number, y: number, dr = 0) =>
  new THREE.Vector3(HX + Math.sin(th) * (HR + dr), y, HZ + Math.cos(th) * (HR + dr));
