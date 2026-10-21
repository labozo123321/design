import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * The picture after the render, on HDR: a tilt-shift depth of field (the house reads as a precious
 * miniature: sharp at the focus, soft toward the top and bottom of frame), bloom on the practicals and the
 * rings, then the grade: exposure, the era's colour (warm gold, cool teen, slate drift, back to gold),
 * saturation and contrast, a soft halation, the white night-flash of the time-lapses, a vignette and fine
 * grain; FXAA; ACES and sRGB.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DEPTH_FN = /* glsl */ `float viewDist(float d) { return pow(uFar + 1.0, d) - 1.0; }`;

class ScenePass extends Pass {
  copy: FullScreenQuad;
  constructor(
    public scene: THREE.Scene,
    public camera: THREE.Camera,
    public rt: THREE.WebGLRenderTarget,
  ) {
    super();
    this.copy = new FullScreenQuad(
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: { tDiffuse: { value: rt.texture } },
        vertexShader: VERT,
        fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }",
      }),
    );
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
}

class ShaderPass extends Pass {
  quad: FullScreenQuad;
  constructor(public uniforms: Record<string, THREE.IUniform>, frag: string) {
    super();
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms, vertexShader: VERT, fragmentShader: frag }));
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const DOF_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform float uFar;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uMaxR;
  uniform float uAspect;
  varying vec2 vUv;
  ${DEPTH_FN}
  float coc(float d) { return clamp(uAperture * (1.0 / uFocus - 1.0 / max(d, 0.05)), -uMaxR, uMaxR); }
  void main() {
    vec4 c0 = texture2D(tDiffuse, vUv);
    float d0 = viewDist(texture2D(tDepth, vUv).x);
    float r0 = abs(coc(d0));
    if (uAperture <= 0.0) { gl_FragColor = c0; return; }
    vec3 acc = c0.rgb;
    float wsum = 1.0;
    for (int i = 0; i < 32; i++) {
      float fi = float(i) + 0.5;
      float rr = uMaxR * sqrt(fi / 32.0);
      float a = fi * 2.39996323;
      vec2 uv = clamp(vUv + vec2(cos(a) / uAspect, sin(a)) * rr, vec2(0.0005), vec2(0.9995));
      float ds = viewDist(texture2D(tDepth, uv).x);
      float rs = abs(coc(ds));
      if (ds > d0) rs = min(rs, r0);
      float m = smoothstep(rr - 0.0015, rr + 0.0015, rs);
      acc += texture2D(tDiffuse, uv).rgb * m;
      wsum += m;
    }
    gl_FragColor = vec4(acc / wsum, c0.a);
  }`;

const GRADE_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uAspect;
  uniform float uExposure;
  uniform float uSat;
  uniform float uCon;
  uniform float uFlash;
  uniform float uVig;
  uniform float uGrain;
  uniform float uFade;
  uniform float uLift;
  uniform vec3 uTint;
  uniform vec3 uShadowTint;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 c = vUv - 0.5;
    vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(l), col, uSat), 0.0);
    col = pow(col / 0.18, vec3(uCon)) * 0.18;
    // the era's colour: a tint over everything, and a little colour in the shadows
    float sh = 1.0 - smoothstep(0.0, 0.25, l);
    col *= mix(uTint, uTint * uShadowTint, sh);
    col += uLift * uShadowTint * 0.02;
    float v = smoothstep(0.98, 0.18, length(c * vec2(1.0, 0.82)));
    col *= mix(1.0 - uVig, 1.0, v);
    float g = hash(gl_FragCoord.xy * 0.5 + fract(uTime * 7.31) * 113.0) - 0.5;
    col += g * uGrain * (0.25 + col);
    col = mix(col, vec3(1.6, 1.55, 1.45), uFlash);
    col *= uFade;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }`;

const FXAA_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  varying vec2 vUv;
  void main() {
    vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * resolution).rgb;
    vec3 ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * resolution).rgb;
    vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * resolution).rgb;
    vec3 se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * resolution).rgb;
    vec3 m = texture2D(tDiffuse, vUv).rgb;
    vec3 L = vec3(0.299, 0.587, 0.114);
    float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
    lnw /= 1.0 + lnw; lne /= 1.0 + lne; lsw /= 1.0 + lsw; lse /= 1.0 + lse; lm /= 1.0 + lm;
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
    float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
    float reduce = max((lnw + lne + lsw + lse) * (0.25 / 8.0), 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * resolution;
    vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
    float lb = dot(b, L);
    lb /= 1.0 + lb;
    gl_FragColor = vec4((lb < lmin || lb > lmax) ? a : b, 1.0);
  }`;

export type Look = {
  time: number;
  exposure: number;
  sat: number;
  con: number;
  tint: [number, number, number];
  shadow: [number, number, number];
  lift?: number;
  flash?: number;
  vig?: number;
  grain?: number;
  fade?: number;
};

export const KnockPost: React.FC<{ look: Look; bloom: number; lens: { focus: number; aperture: number; maxR?: number } }> = ({ look, bloom, lens }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthTexture: depth });
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new ScenePass(scene, camera, sceneRT));
    const dof = new ShaderPass(
      { tDiffuse: { value: null }, tDepth: { value: depth }, uFar: { value: 200 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxR: { value: 0.008 }, uAspect: { value: size.x / size.y } },
      DOF_FRAG,
    );
    composer.addPass(dof);
    const bloomPass = new UnrealBloomPass(size.clone(), 0.5, 0.6, 1.6);
    composer.addPass(bloomPass);
    const grade = new ShaderPass(
      {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uAspect: { value: size.x / size.y },
        uExposure: { value: 1 },
        uSat: { value: 1 },
        uCon: { value: 1 },
        uFlash: { value: 0 },
        uVig: { value: 0.3 },
        uGrain: { value: 0.014 },
        uFade: { value: 1 },
        uLift: { value: 0 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      GRADE_FRAG,
    );
    composer.addPass(grade);
    const fxaa = new ShaderPass({ tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1 / size.x, 1 / size.y) } }, FXAA_FRAG);
    composer.addPass(fxaa);
    composer.addPass(new OutputPass());
    return { composer, dof, bloomPass, grade };
  }, [gl, scene, camera]);

  post.dof.uniforms.uFar.value = camera.far;
  post.dof.uniforms.uFocus.value = lens.focus;
  post.dof.uniforms.uAperture.value = lens.aperture;
  post.dof.uniforms.uMaxR.value = lens.maxR ?? 0.008;
  post.dof.enabled = lens.aperture > 0;
  post.bloomPass.strength = bloom;
  const g = post.grade.uniforms;
  g.uTime.value = look.time;
  g.uExposure.value = look.exposure;
  g.uSat.value = look.sat;
  g.uCon.value = look.con;
  g.uFlash.value = look.flash ?? 0;
  g.uVig.value = look.vig ?? 0.3;
  g.uGrain.value = look.grain ?? 0.014;
  g.uFade.value = look.fade ?? 1;
  g.uLift.value = look.lift ?? 0;
  g.uTint.value.set(...look.tint);
  g.uShadowTint.value.set(...look.shadow);
  useFrame(() => {
    post.composer.render();
  }, 1);
  return null;
};
