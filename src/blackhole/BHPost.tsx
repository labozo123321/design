import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Lens and body effects on the HDR picture, before tone mapping:
 *  - stretch: spaghettification. The picture is pulled out along the fall (vertically) and squeezed
 *    across it, smeared into streaks running in towards the centre, colours splitting apart;
 *  - tear: bright seams ripping across the view at the very end;
 *  - ca: plain chromatic fringing from the visor.
 */
const FxShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStretch: { value: 0 },
    uTear: { value: 0 },
    uCA: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1080 / 1920 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStretch;
    uniform float uTear;
    uniform float uCA;
    uniform float uTime;
    uniform float uAspect;
    uniform float uFade;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
    vec2 warp(vec2 uv, float k) {
      vec2 p = uv - 0.5;
      // squeezed across, pulled out along the fall
      p.x *= 1.0 + 0.75 * k;
      p.y *= 1.0 - 0.42 * k;
      // and a pinch towards the middle
      float r2 = dot(p * vec2(1.0 / uAspect, 1.0), p * vec2(1.0 / uAspect, 1.0));
      p *= 1.0 - 0.18 * k * r2;
      return p + 0.5;
    }
    vec3 tap(vec2 uv) { return texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb; }
    void main() {
      float s = uStretch;
      vec3 col;
      if (s < 1e-4 && uCA < 1e-3) {
        col = tap(vUv);
      } else {
        // streaks in towards the centre (a zoom blur), wider as the stretch grows; colours pulled apart
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float f = float(i) / 9.0;
          float z = 1.0 - 0.22 * s * f;
          float w = 1.0 - 0.6 * f;
          vec2 base = (warp(vUv, s) - 0.5) * z + 0.5;
          vec2 d = (base - 0.5);
          float ca = uCA / 1080.0 + 0.012 * s;
          acc.r += tap(base + d * ca * 1.0).r * w;
          acc.g += tap(base).g * w;
          acc.b += tap(base - d * ca * 1.0).b * w;
          wsum += w;
        }
        col = acc / wsum;
      }
      // seams of light tearing across
      if (uTear > 1e-3) {
        float y = vUv.y;
        float band = 0.0;
        for (int k = 0; k < 6; k++) {
          float fk = float(k);
          float yc = hash(fk + 1.3 + floor(uTime * 9.0) * 0.17);
          float w = 0.002 + 0.02 * hash(fk + 7.1) * uTear;
          band += exp(-pow((y - yc) / w, 2.0)) * step(hash(fk + 3.7 + floor(uTime * 9.0)), uTear * 1.2);
        }
        col += vec3(1.6, 1.3, 1.1) * band * uTear * 6.0;
        col = mix(col, vec3(4.0, 3.6, 3.2), smoothstep(0.75, 1.0, uTear));
      }
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
};

export type Fx = { stretch: number; tear: number; ca: number; fade: number };

/** Bloom (anything brighter than white glows), the effects above, then tone mapping and sRGB. */
export const BHPost: React.FC<{
  strength: number;
  radius: number;
  threshold: number;
  fx: Fx;
  t: number;
  toneMapping: THREE.ToneMapping;
  exposure: number;
}> = ({ strength, radius, threshold, fx, t, toneMapping, exposure }) => {
  const gl = useThree((s) => s.gl);
  gl.toneMapping = toneMapping;
  gl.toneMappingExposure = exposure;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(size.clone(), strength, radius, threshold);
    composer.addPass(bloom);
    const fxp = new ShaderPass(FxShader);
    fxp.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(fxp);
    composer.addPass(new OutputPass());
    return { composer, bloom, fxp };
  }, [gl, scene, camera]);
  post.bloom.strength = strength;
  post.bloom.radius = radius;
  post.bloom.threshold = threshold;
  const u = post.fxp.uniforms;
  u.uStretch.value = fx.stretch;
  u.uTear.value = fx.tear;
  u.uCA.value = fx.ca;
  u.uTime.value = t;
  u.uFade.value = fx.fade;
  useFrame(() => post.composer.render(), 1);
  return null;
};
