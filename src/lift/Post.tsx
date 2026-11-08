import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * The cartoon's picture after the render: ink lines (where depth folds or the surface creases), depth of
 * field, bloom on the glows, the camera's motion blur on whip moves, then the grade (exposure,
 * saturation, contrast, vignette, a little grain, fades and flashes) and FXAA.
 *
 * Layer 1 is for things that get no ink and cast no lines (holograms, stars, glows, the sky).
 */

export const FX_LAYER = 1;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

class ScenePass extends Pass {
  copy: FullScreenQuad;
  normalMat = new THREE.MeshNormalMaterial();
  constructor(
    public scene: THREE.Scene,
    public camera: THREE.Camera,
    public rt: THREE.WebGLRenderTarget,
    public normalRT: THREE.WebGLRenderTarget,
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
    const cam = this.camera;
    cam.layers.enable(0);
    cam.layers.enable(FX_LAYER);
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, cam);
    // normals of the solid things only
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMat;
    cam.layers.disable(FX_LAYER);
    const cc = renderer.getClearColor(new THREE.Color());
    const ca = renderer.getClearAlpha();
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.normalRT);
    renderer.clear();
    const sm = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.render(this.scene, cam);
    renderer.shadowMap.enabled = sm;
    renderer.setClearColor(cc, ca);
    cam.layers.enable(FX_LAYER);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;
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

const VIEWZ = /* glsl */ `
  #include <packing>
  uniform float uNear;
  uniform float uFar;
  float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }`;

const INK_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 uTexel;
  uniform float uThick;
  uniform float uStrength;
  uniform vec3 uInk;
  uniform float uFadeFar;
  varying vec2 vUv;
  ${VIEWZ}
  float invz(vec2 uv) { return 1.0 / max(viewZ(uv), 1e-4); }
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float z0 = viewZ(vUv);
    if (z0 > uFar * 0.98) { gl_FragColor = c; return; }
    float w0 = 1.0 / z0;
    vec3 n0 = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
    float e = 0.0;
    vec2 dirs[4];
    dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(0.0, 1.0); dirs[2] = vec2(0.7071, 0.7071); dirs[3] = vec2(0.7071, -0.7071);
    for (int i = 0; i < 4; i++) {
      vec2 o = dirs[i] * uThick * uTexel;
      float wp = invz(vUv + o);
      float wm = invz(vUv - o);
      // inverse depth is linear across a plane: a bump in it means a fold or an edge in front of something
      float lap = (w0 - 0.5 * (wp + wm)) / w0;
      e = max(e, smoothstep(0.012, 0.03, lap));
      vec3 np = normalize(texture2D(tNormal, vUv + o).xyz * 2.0 - 1.0);
      vec3 nm = normalize(texture2D(tNormal, vUv - o).xyz * 2.0 - 1.0);
      float crease = max(1.0 - dot(n0, np), 1.0 - dot(n0, nm));
      float near = step(abs(1.0 / wp - z0) / z0, 0.08) * step(abs(1.0 / wm - z0) / z0, 0.08);
      e = max(e, smoothstep(0.32, 0.6, crease) * near * 0.85);
    }
    float fade = 1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, z0);
    c.rgb = mix(c.rgb, uInk, clamp(e, 0.0, 1.0) * uStrength * fade);
    gl_FragColor = c;
  }`;

const DOF_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uMaxR;
  uniform float uAspect;
  varying vec2 vUv;
  ${VIEWZ}
  float coc(float d) { return clamp(uAperture * (1.0 / uFocus - 1.0 / max(d, 0.05)), -uMaxR, uMaxR); }
  void main() {
    vec4 c0 = texture2D(tDiffuse, vUv);
    float d0 = viewZ(vUv);
    float r0 = abs(coc(d0));
    vec3 acc = c0.rgb;
    float wsum = 1.0;
    for (int i = 0; i < 36; i++) {
      float fi = float(i) + 0.5;
      float rr = uMaxR * sqrt(fi / 36.0);
      float a = fi * 2.39996323;
      vec2 uv = clamp(vUv + vec2(cos(a) / uAspect, sin(a)) * rr, vec2(0.0005), vec2(0.9995));
      float ds = viewZ(uv);
      float rs = abs(coc(ds));
      if (ds > d0) rs = min(rs, r0);
      float m = smoothstep(rr - 0.0015, rr + 0.0015, rs);
      acc += texture2D(tDiffuse, uv).rgb * m;
      wsum += m;
    }
    gl_FragColor = vec4(acc / wsum, c0.a);
  }`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  uniform float uZoom;
  varying vec2 vUv;
  void main() {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float t = (float(i) + 0.5) / 16.0 - 0.5;
      vec2 uv = vUv + uDir * t + (vUv - 0.5) * uZoom * t;
      acc += texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    }
    gl_FragColor = vec4(acc / 16.0, 1.0);
  }`;

const GRADE_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uExposure;
  uniform float uSat;
  uniform float uCon;
  uniform float uVig;
  uniform float uGrain;
  uniform float uFade;
  uniform vec3 uFadeTo;
  uniform float uFlash;
  uniform vec3 uTint;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 c = vUv - 0.5;
    vec3 col = texture2D(tDiffuse, vUv).rgb * uExposure * uTint;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(l), col, uSat), 0.0);
    col = pow(col / 0.25, vec3(uCon)) * 0.25;
    float v = smoothstep(1.0, 0.22, length(c * vec2(1.0, 0.8)));
    col *= mix(1.0 - uVig, 1.0, v);
    float g = hash(gl_FragCoord.xy * 0.5 + fract(uTime * 7.31) * 113.0) - 0.5;
    col += g * uGrain * (0.25 + col);
    col = mix(col, vec3(1.8), uFlash);
    col = mix(uFadeTo, col, uFade);
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

export type Grade = {
  time: number;
  exposure?: number;
  sat?: number;
  con?: number;
  vig?: number;
  grain?: number;
  /** 1 = clear, 0 = all fadeTo */
  fade?: number;
  fadeTo?: [number, number, number];
  flash?: number;
  tint?: [number, number, number];
};
export type Lens = { focus: number; aperture: number; maxR?: number };
export type Blur = { dir: [number, number]; zoom: number };
export type Ink = { strength?: number; thick?: number; color?: [number, number, number]; fadeFar?: number };

export const LiftPost: React.FC<{ grade: Grade; lens: Lens; bloom: { strength: number; radius?: number; threshold?: number }; blur: Blur; ink?: Ink }> = ({ grade, lens, bloom, blur, ink }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthTexture: depth });
    const normalRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType });
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new ScenePass(scene, camera, sceneRT, normalRT));
    const texel = new THREE.Vector2(1 / size.x, 1 / size.y);
    const inkPass = new ShaderPass(
      {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        tNormal: { value: normalRT.texture },
        uTexel: { value: texel },
        uNear: { value: 0.1 },
        uFar: { value: 500 },
        uThick: { value: 1.6 },
        uStrength: { value: 0.85 },
        uInk: { value: new THREE.Vector3(0.03, 0.03, 0.05) },
        uFadeFar: { value: 120 },
      },
      INK_FRAG,
    );
    composer.addPass(inkPass);
    const dof = new ShaderPass(
      { tDiffuse: { value: null }, tDepth: { value: depth }, uNear: { value: 0.1 }, uFar: { value: 500 }, uFocus: { value: 6 }, uAperture: { value: 0 }, uMaxR: { value: 0.01 }, uAspect: { value: size.x / size.y } },
      DOF_FRAG,
    );
    composer.addPass(dof);
    const bloomPass = new UnrealBloomPass(size.clone(), 0.6, 0.5, 1.0);
    composer.addPass(bloomPass);
    const blurPass = new ShaderPass({ tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uZoom: { value: 0 } }, BLUR_FRAG);
    composer.addPass(blurPass);
    const gradePass = new ShaderPass(
      {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uSat: { value: 1 },
        uCon: { value: 1 },
        uVig: { value: 0.25 },
        uGrain: { value: 0.01 },
        uFade: { value: 1 },
        uFadeTo: { value: new THREE.Vector3(0, 0, 0) },
        uFlash: { value: 0 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
      },
      GRADE_FRAG,
    );
    composer.addPass(gradePass);
    composer.addPass(new ShaderPass({ tDiffuse: { value: null }, resolution: { value: texel } }, FXAA_FRAG));
    composer.addPass(new OutputPass());
    return { composer, inkPass, dof, bloomPass, blurPass, gradePass, scale: size.x / 1080 };
  }, [gl, scene, camera]);

  const near = camera.near;
  const far = camera.far;
  const ip = post.inkPass.uniforms;
  ip.uNear.value = near;
  ip.uFar.value = far;
  ip.uThick.value = (ink?.thick ?? 2.0) * (post.scale ?? 1);
  ip.uStrength.value = ink?.strength ?? 0.85;
  ip.uFadeFar.value = ink?.fadeFar ?? 120;
  if (ink?.color) ip.uInk.value.set(...ink.color);
  else ip.uInk.value.set(0.03, 0.03, 0.05);
  post.inkPass.enabled = (ink?.strength ?? 0.85) > 0;
  const d = post.dof.uniforms;
  d.uNear.value = near;
  d.uFar.value = far;
  d.uFocus.value = lens.focus;
  d.uAperture.value = lens.aperture;
  d.uMaxR.value = lens.maxR ?? 0.012;
  post.dof.enabled = lens.aperture > 0;
  post.bloomPass.strength = bloom.strength;
  post.bloomPass.radius = bloom.radius ?? 0.5;
  post.bloomPass.threshold = bloom.threshold ?? 1.0;
  post.bloomPass.enabled = bloom.strength > 0;
  const b = post.blurPass.uniforms;
  b.uDir.value.set(blur.dir[0], blur.dir[1]);
  b.uZoom.value = blur.zoom;
  post.blurPass.enabled = Math.hypot(blur.dir[0], blur.dir[1]) > 0.0015 || Math.abs(blur.zoom) > 0.004;
  const g = post.gradePass.uniforms;
  g.uTime.value = grade.time;
  g.uExposure.value = grade.exposure ?? 1;
  g.uSat.value = grade.sat ?? 1.08;
  g.uCon.value = grade.con ?? 1.04;
  g.uVig.value = grade.vig ?? 0.28;
  g.uGrain.value = grade.grain ?? 0.012;
  g.uFade.value = grade.fade ?? 1;
  g.uFadeTo.value.set(...(grade.fadeTo ?? [0, 0, 0]));
  g.uFlash.value = grade.flash ?? 0;
  g.uTint.value.set(...(grade.tint ?? [1, 1, 1]));
  useFrame(() => {
    post.composer.render();
  }, 1);
  return null;
};
