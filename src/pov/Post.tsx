import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Takes over rendering: the scene goes into an HDR, multisampled target, gets a bloom (anything brighter
 * than white glows: the sun, lit windows, neon, sparkles), then ACES tone mapping and sRGB on the way out.
 */
export const Post: React.FC<{ strength: number; radius: number; threshold: number }> = ({
  strength,
  radius,
  threshold,
}) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(size.clone(), strength, radius, threshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
  }, [gl, scene, camera]);
  post.bloom.strength = strength;
  post.bloom.radius = radius;
  post.bloom.threshold = threshold;
  useFrame(() => post.composer.render(), 1);
  return null;
};
