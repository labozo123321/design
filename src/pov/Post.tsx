import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** A shockwave ring sweeping out from the middle of the frame: bends the picture, splits colour, flashes. */
const RippleShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    radius: { value: 0 },
    strength: { value: 0 },
    width: { value: 0.09 },
    aspect: { value: 1080 / 1920 },
    flash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float radius;
    uniform float strength;
    uniform float width;
    uniform float aspect;
    uniform float flash;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      p.x *= aspect;
      float d = length(p);
      float x = (d - radius) / width;
      float ring = exp(-x * x * 2.0);
      vec2 dir = d > 1e-4 ? p / d : vec2(0.0);
      dir.x /= aspect;
      vec2 o = dir * strength * x * ring;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - o).r;
      col.g = texture2D(tDiffuse, vUv - o * 1.25).g;
      col.b = texture2D(tDiffuse, vUv - o * 1.5).b;
      col *= 1.0 + flash * ring;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export type Ripple = { radius: number; strength: number; flash: number };

/**
 * Takes over rendering: the scene goes into an HDR, multisampled target, gets a bloom (anything brighter
 * than white glows: the sun, lit windows, neon, sparkles), the pulse ripple, then ACES tone mapping and
 * sRGB on the way out.
 */
export const Post: React.FC<{
  strength: number;
  radius: number;
  threshold: number;
  ripple: Ripple;
  /** Optional tone curve for the OutputPass (default: whatever the renderer has, ACES). */
  toneMapping?: THREE.ToneMapping;
}> = ({ strength, radius, threshold, ripple, toneMapping }) => {
  const gl = useThree((s) => s.gl);
  if (toneMapping !== undefined && gl.toneMapping !== toneMapping) gl.toneMapping = toneMapping;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(size.clone(), strength, radius, threshold);
    composer.addPass(bloom);
    const wave = new ShaderPass(RippleShader);
    wave.uniforms.aspect.value = size.x / size.y;
    composer.addPass(wave);
    composer.addPass(new OutputPass());
    return { composer, bloom, wave };
  }, [gl, scene, camera]);
  post.bloom.strength = strength;
  post.bloom.radius = radius;
  post.bloom.threshold = threshold;
  post.wave.enabled = ripple.strength > 1e-4 || ripple.flash > 1e-3;
  post.wave.uniforms.radius.value = ripple.radius;
  post.wave.uniforms.strength.value = ripple.strength;
  post.wave.uniforms.flash.value = ripple.flash;
  useFrame(() => post.composer.render(), 1);
  return null;
};
