import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { Pose } from "./camera";

/**
 * The picture after the render, on HDR:
 *  - motion blur from the camera's own movement, except on the cockpit when we're in it (the dash, the
 *    yoke, his hands ride with the camera: only the world outside the glass smears);
 *  - depth of field for the bullet time (the car sharp, the lineup and the lights soft);
 *  - bloom (the floods, the LED lines, the beams, the lasers);
 *  - the grade: exposure, contrast and saturation, the launch's punch (a zoom smear from the middle, a
 *    little chromatic fringing), the white-out at a flash, a vignette, grain; the phone's look for the
 *    replay (a touch flatter, sharper, cooler, a rolling exposure);
 *  - FXAA, then ACES tone mapping and sRGB.
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
  constructor(public uniforms: Record<string, THREE.IUniform>, frag: string, defines: Record<string, string> = {}) {
    super();
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms, vertexShader: VERT, fragmentShader: frag, defines }));
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const MB_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform mat4 uCamWorld;
  uniform mat4 uPrevViewProj;
  uniform mat4 uCarInv;
  uniform mat4 uCarDelta;
  uniform vec2 uP;
  uniform float uFar;
  uniform float uShutter;
  uniform float uMax;
  uniform float uAspect;
  varying vec2 vUv;
  ${DEPTH_FN}
  vec2 velocityAt(vec2 uv) {
    float w = viewDist(texture2D(tDepth, uv).x);
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 view = vec3(ndc.x * w / uP.x, ndc.y * w / uP.y, -w);
    vec4 world = uCamWorld * vec4(view, 1.0);
    // a point on the car was where the car was a frame ago (in the car it barely moves at all)
    vec3 local = (uCarInv * world).xyz;
    bool onCar = abs(local.x) < 1.14 && local.y > 0.025 && local.y < 1.4 && abs(local.z) < 2.4;
    vec4 wPrev = onCar ? uCarDelta * world : world;
    vec4 prev = uPrevViewProj * wPrev;
    vec2 puv = prev.w > 1e-5 ? prev.xy / prev.w * 0.5 + 0.5 : uv;
    return (uv - puv) * uShutter;
  }
  void main() {
    vec4 c0 = texture2D(tDiffuse, vUv);
    vec2 vel = velocityAt(vUv);
    vec2 asp = vec2(1.0 / uAspect, 1.0);
    float len = length(vel * asp);
    if (len > uMax) vel *= uMax / len;
    if (len < 0.0007) { gl_FragColor = c0; return; }
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float t = float(i) / 15.0 - 0.5;
      vec2 uv = clamp(vUv + vel * t, vec2(0.0005), vec2(0.9995));
      float wgt = 1.0 - abs(t) * 0.6;
      acc += texture2D(tDiffuse, uv).rgb * wgt;
      wsum += wgt;
    }
    gl_FragColor = vec4(acc / wsum, c0.a);
  }`;

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
  uniform sampler2D tDepth;
  uniform float uFar;
  uniform float uTime;
  uniform float uAspect;
  uniform float uExposure;
  uniform float uSat;
  uniform float uCon;
  uniform float uPunch;
  uniform float uFlash;
  uniform float uPhone;
  uniform float uCA;
  uniform float uVig;
  uniform float uGrain;
  uniform float uFade;
  uniform vec3 uTint;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 tap(vec2 uv) { return texture2D(tDiffuse, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
  ${DEPTH_FN}
  void main() {
    vec2 c = vUv - 0.5;
    // (the punch smears the world, not the cockpit round you)
    float far = smoothstep(1.6, 4.0, viewDist(texture2D(tDepth, vUv).x));
    float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) * 4.0;
    // the launch: a zoom smear out from the middle, stronger toward the edges
    vec3 col = vec3(0.0);
    if (uPunch * far > 0.001) {
      float wsum = 0.0;
      for (int i = 0; i < 12; i++) {
        float t = float(i) / 11.0;
        float s = 1.0 - uPunch * far * 0.06 * t * smoothstep(0.02, 0.6, r2);
        float wgt = 1.0 - t * 0.7;
        vec2 uv = 0.5 + c * s;
        vec2 dir = c * (uCA * (0.5 + 1.5 * r2));
        col += vec3(tap(uv + dir).r, tap(uv).g, tap(uv - dir).b) * wgt;
        wsum += wgt;
      }
      col /= wsum;
    } else {
      vec2 dir = c * (uCA * (0.5 + 1.5 * r2));
      col = vec3(tap(vUv + dir).r, tap(vUv).g, tap(vUv - dir).b);
    }
    col *= uExposure;
    // the phone: a touch flatter and cooler, a little sharpened by its own processing
    if (uPhone > 0.0) {
      vec3 n = tap(vUv + vec2(1.0 / 1080.0, 0.0)) + tap(vUv - vec2(1.0 / 1080.0, 0.0)) + tap(vUv + vec2(0.0, 1.0 / 1920.0)) + tap(vUv - vec2(0.0, 1.0 / 1920.0));
      col = mix(col, col + (col - n * 0.25 * uExposure) * 0.6, uPhone);
      col = mix(col, col * vec3(0.94, 1.0, 1.08) + 0.004, uPhone);
    }
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(l), col, uSat), 0.0);
    col = pow(col / 0.18, vec3(uCon)) * 0.18;
    col *= uTint;
    // vignette, grain
    float v = smoothstep(0.98, 0.2, length(c * vec2(1.0, 1.1)));
    col *= mix(1.0 - uVig, 1.0, v);
    float g = hash(gl_FragCoord.xy * 0.5 + fract(uTime * 7.31) * 113.0) - 0.5;
    col += g * uGrain * (0.35 + col);
    col = col * (1.0 + 3.0 * uFlash) + uFlash * 0.8;
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
  exposure?: number;
  sat?: number;
  con?: number;
  punch?: number;
  flash?: number;
  phone?: number;
  ca?: number;
  vig?: number;
  grain?: number;
  fade?: number;
  tint?: [number, number, number];
};

export const RoadsterPost: React.FC<{ prev: Pose; blur: number; car: { now: THREE.Matrix4; prev: THREE.Matrix4 }; look: Look; bloom: number; lens?: { focus: number; aperture: number } }> = ({ prev, blur, car, look, bloom, lens }) => {
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
      { tDiffuse: { value: null }, tDepth: { value: depth }, uFar: { value: 3000 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxR: { value: 0.012 }, uAspect: { value: size.x / size.y } },
      DOF_FRAG,
    );
    composer.addPass(dof);
    const mb = new ShaderPass(
      {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        uCamWorld: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uP: { value: new THREE.Vector2(1, 1) },
        uFar: { value: 3000 },
        uShutter: { value: 0.5 },
        uMax: { value: 0.05 },
        uAspect: { value: size.x / size.y },
        uCarInv: { value: new THREE.Matrix4() },
        uCarDelta: { value: new THREE.Matrix4() },
      },
      MB_FRAG,
    );
    composer.addPass(mb);
    const bloomPass = new UnrealBloomPass(size.clone(), 0.6, 0.55, 2.4);
    composer.addPass(bloomPass);
    const grade = new ShaderPass(
      {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        uFar: { value: 3000 },
        uTime: { value: 0 },
        uAspect: { value: size.x / size.y },
        uExposure: { value: 1 },
        uSat: { value: 1 },
        uCon: { value: 1 },
        uPunch: { value: 0 },
        uFlash: { value: 0 },
        uPhone: { value: 0 },
        uCA: { value: 0 },
        uVig: { value: 0.25 },
        uGrain: { value: 0.012 },
        uFade: { value: 1 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      GRADE_FRAG,
    );
    composer.addPass(grade);
    const fxaa = new ShaderPass({ tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1 / size.x, 1 / size.y) } }, FXAA_FRAG);
    composer.addPass(fxaa);
    composer.addPass(new OutputPass());
    return { composer, dof, mb, bloomPass, grade };
  }, [gl, scene, camera]);

  const prevCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  prevCam.position.copy(prev.pos);
  prevCam.quaternion.copy(prev.quat);
  prevCam.fov = prev.fov;
  prevCam.aspect = camera.aspect;
  prevCam.near = camera.near;
  prevCam.far = camera.far;
  prevCam.updateProjectionMatrix();
  prevCam.updateMatrixWorld();
  const u = post.mb.uniforms;
  u.uPrevViewProj.value.multiplyMatrices(prevCam.projectionMatrix, prevCam.matrixWorldInverse);
  u.uShutter.value = 0.36 * blur;
  u.uFar.value = camera.far;
  u.uCarInv.value.copy(car.now).invert();
  u.uCarDelta.value.multiplyMatrices(car.prev, u.uCarInv.value);
  post.mb.enabled = blur > 0.001;
  post.dof.uniforms.uFar.value = camera.far;
  post.dof.uniforms.uFocus.value = lens?.focus ?? 6;
  post.dof.uniforms.uAperture.value = lens?.aperture ?? 0;
  post.dof.enabled = (lens?.aperture ?? 0) > 0;
  post.bloomPass.strength = bloom;
  const g = post.grade.uniforms;
  g.uTime.value = look.time;
  g.uFar.value = camera.far;
  g.uExposure.value = look.exposure ?? 1;
  g.uSat.value = look.sat ?? 1.05;
  g.uCon.value = look.con ?? 1.05;
  g.uPunch.value = look.punch ?? 0;
  g.uFlash.value = look.flash ?? 0;
  g.uPhone.value = look.phone ?? 0;
  g.uCA.value = look.ca ?? 0.0006;
  g.uVig.value = look.vig ?? 0.28;
  g.uGrain.value = look.grain ?? 0.012;
  g.uFade.value = look.fade ?? 1;
  const tint = look.tint ?? [1, 1, 1];
  g.uTint.value.set(tint[0], tint[1], tint[2]);
  useFrame(() => {
    camera.updateMatrixWorld();
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uP.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    post.composer.render();
  }, 1);
  return null;
};
