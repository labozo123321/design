import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number };

/**
 * The photographer's camera, on the HDR picture:
 *  - depth of field: a portrait lens focused on the face (the backdrop softens, the gym melts, the
 *    photographer's hand in front of the lens is a blur), a single-pass gather on a golden-angle spiral;
 *  - motion blur from the camera's own movement (pans, the whip round to the selfie);
 *  - bloom (the softboxes, the lamps, the flash, a glass-skin glare);
 *  - the grade: the "sigma edit" (drained colour, hard contrast, crushed cold blacks, heavy grain, fringing,
 *    a vignette, letterbox bars, zoom kicks and shake on the beat), the flash's white-out, the printed photo
 *    held after it (warmer, softer, in a white border), the camera powering on;
 *  - then ACES tone mapping and sRGB.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const DEPTH_FN = /* glsl */ `
  // logarithmic depth back to view distance: d = log2(1 + w) / log2(far + 1)
  float viewDist(float d) { return pow(uFar + 1.0, d) - 1.0; }
`;

class DofPass extends Pass {
  quad: FullScreenQuad;
  uniforms: Record<string, THREE.IUniform>;
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uFar: { value: 200 },
      uFocus: { value: 2.6 },
      uAperture: { value: 0.0 },
      uMaxR: { value: 0.02 },
      uAspect: { value: 1080 / 1920 },
    };
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform sampler2D tDepth;
          uniform float uFar;
          uniform float uFocus;
          uniform float uAperture;
          uniform float uMaxR;
          uniform float uAspect;
          varying vec2 vUv;
          ${DEPTH_FN}
          // circle of confusion (as a fraction of the picture's height), signed: + behind focus, - in front
          float coc(float dist) {
            float c = uAperture * (1.0 / uFocus - 1.0 / max(dist, 0.05));
            return clamp(c, -uMaxR, uMaxR);
          }
          void main() {
            vec4 c0 = texture2D(tDiffuse, vUv);
            if (uAperture <= 0.0) { gl_FragColor = c0; return; }
            float d0 = viewDist(texture2D(tDepth, vUv).x);
            float r0 = abs(coc(d0));
            // scatter as gather: every sample whose own blur disc reaches this pixel adds to it
            vec3 acc = c0.rgb;
            float wsum = 1.0;
            const float GOLDEN = 2.39996323;
            for (int i = 0; i < 40; i++) {
              float fi = float(i) + 0.5;
              float rr = uMaxR * sqrt(fi / 40.0);
              float a = fi * GOLDEN;
              vec2 uv = clamp(vUv + vec2(cos(a) / uAspect, sin(a)) * rr, vec2(0.0005), vec2(0.9995));
              vec3 sc = texture2D(tDiffuse, uv).rgb;
              float ds = viewDist(texture2D(tDepth, uv).x);
              float rs = abs(coc(ds));
              // something behind the pixel can't spread over it further than the pixel itself is blurred
              if (ds > d0) rs = min(rs, r0);
              float m = smoothstep(rr - 0.0015, rr + 0.0015, rs);
              acc += sc * m;
              wsum += m;
            }
            gl_FragColor = vec4(acc / wsum, c0.a);
          }`,
      }),
    );
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

class MotionBlurPass extends Pass {
  quad: FullScreenQuad;
  uniforms: Record<string, THREE.IUniform>;
  depth: THREE.Texture | null = null;
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uCamWorld: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uP: { value: new THREE.Vector2(1, 1) },
      uFar: { value: 200 },
      uShutter: { value: 0.5 },
      uMax: { value: 0.06 },
      uAspect: { value: 1080 / 1920 },
    };
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform sampler2D tDepth;
          uniform mat4 uCamWorld;
          uniform mat4 uPrevViewProj;
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
            vec4 prev = uPrevViewProj * world;
            vec2 puv = prev.xy / max(prev.w, 1e-5) * 0.5 + 0.5;
            if (prev.w <= 1e-5) puv = uv;
            return (uv - puv) * uShutter;
          }
          void main() {
            vec4 c0 = texture2D(tDiffuse, vUv);
            vec2 vel = velocityAt(vUv);
            vec2 asp = vec2(1.0 / uAspect, 1.0);
            float len = length(vel * asp);
            if (len > uMax) vel *= uMax / len;
            if (len < 0.0008) { gl_FragColor = c0; return; }
            vec3 acc = vec3(0.0);
            float wsum = 0.0;
            for (int i = 0; i < 16; i++) {
              float t = float(i) / 15.0 - 0.5;
              vec2 uv = clamp(vUv + vel * t, vec2(0.0005), vec2(0.9995));
              float w = 1.0 - abs(t) * 0.6;
              acc += texture2D(tDiffuse, uv).rgb * w;
              wsum += w;
            }
            gl_FragColor = vec4(acc / wsum, c0.a);
          }`,
      }),
    );
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depth;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1080 / 1920 },
    uEdit: { value: 0 },
    uZoom: { value: 1 },
    uShake: { value: new THREE.Vector2() },
    uLetter: { value: 0 },
    uFlash: { value: 0 },
    uPhoto: { value: 0 },
    uPrint: { value: 0 },
    uOn: { value: 1 },
    uCA: { value: 0 },
    uGrain: { value: 0.012 },
    uVig: { value: 0.22 },
    uSat: { value: 1 },
    uCon: { value: 1 },
    uWarm: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uEdit;
    uniform float uZoom;
    uniform vec2 uShake;
    uniform float uLetter;
    uniform float uFlash;
    uniform float uPhoto;
    uniform float uPrint;
    uniform float uOn;
    uniform float uCA;
    uniform float uGrain;
    uniform float uVig;
    uniform float uSat;
    uniform float uCon;
    uniform float uWarm;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 tap(vec2 uv) { return texture2D(tDiffuse, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
    void main() {
      // the printed photo sits inside a white border: map the picture into the inner rectangle
      float inset = 0.055 * uPrint;
      vec2 border = vec2(inset * 1.0 / uAspect * uAspect, inset);
      vec2 uv0 = vUv;
      vec2 inner = (vUv - border) / (1.0 - 2.0 * border);
      bool inPhoto = all(greaterThanEqual(inner, vec2(0.0))) && all(lessThanEqual(inner, vec2(1.0)));
      vec2 uv = uPrint > 0.0 ? inner : uv0;
      // the edit's zoom kicks and shake
      uv = 0.5 + (uv - 0.5) / uZoom + uShake;
      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) * 4.0;
      vec2 dir = c * (uCA * (0.5 + 1.5 * r2));
      vec3 col;
      col.r = tap(uv + dir).r;
      col.g = tap(uv).g;
      col.b = tap(uv - dir).b;
      // base grade
      {
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = max(mix(vec3(l), col, uSat), 0.0);
        col = pow(col / 0.18, vec3(uCon)) * 0.18;
        col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), uWarm);
      }
      // the sigma edit: colour drained to a cold steel, hard contrast, crushed blacks
      if (uEdit > 0.0) {
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 steel = vec3(l) * vec3(0.88, 0.97, 1.12);
        vec3 e = mix(col, steel, 0.86);
        e = pow(max(e, 0.0) / 0.2, vec3(1.45)) * 0.2;
        e = max(e - 0.012, 0.0) * 1.05;
        col = mix(col, e, uEdit);
      }
      // the printed photo: a touch warmer and softer, blacks lifted like paper
      if (uPrint > 0.0) {
        col = mix(col, col * vec3(1.04, 1.0, 0.95) * 0.95 + 0.012, uPrint);
      }
      // vignette (heavier in the edit) and grain (much heavier in the edit)
      float v = smoothstep(0.95, 0.2, length((vUv - 0.5) * vec2(1.0, 1.15)));
      col *= mix(1.0 - (uVig + 0.45 * uEdit), 1.0, v);
      float g = (hash(gl_FragCoord.xy * 0.5 + fract(uTime * 7.31) * 113.0) - 0.5);
      col += g * (uGrain + 0.07 * uEdit) * (0.4 + col);
      // the flash: everything blown toward white for a moment
      col = col * (1.0 + 3.0 * uFlash) + uFlash * 0.9;
      // outside the print: the white border (with a faint paper texture)
      if (uPrint > 0.0 && !inPhoto) {
        vec3 paper = vec3(0.97, 0.965, 0.95) * (0.97 + 0.03 * hash(floor(gl_FragCoord.xy * 0.5)));
        col = paper * (1.0 + 2.0 * uFlash);
      }
      // the edit's letterbox bars
      float bar = 0.11 * uLetter;
      if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      // powering on
      col *= uOn;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export type Grade = {
  time: number;
  edit: number;
  zoom: number;
  shake: [number, number];
  letter: number;
  flash: number;
  print: number;
  on: number;
  ca: number;
  sat?: number;
  con?: number;
  warm?: number;
  grain?: number;
};

export type Lens = { focus: number; aperture: number };

export const LooksPost: React.FC<{ prev: Pose; blur: number; grade: Grade; bloom: number; lens: Lens }> = ({ prev, blur, grade, bloom, lens }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const dof = new DofPass();
    dof.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(dof);
    const mb = new MotionBlurPass();
    mb.uniforms.uAspect.value = size.x / size.y;
    mb.depth = depth;
    composer.addPass(mb);
    const bloomPass = new UnrealBloomPass(size.clone(), 0.6, 0.5, 1.6);
    composer.addPass(bloomPass);
    const grade = new (class extends Pass {
      quad = new FullScreenQuad(
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
          vertexShader: GradeShader.vertexShader,
          fragmentShader: GradeShader.fragmentShader,
        }),
      );
      get uniforms() {
        return (this.quad.material as THREE.ShaderMaterial).uniforms;
      }
      render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
        this.uniforms.tDiffuse.value = readBuffer.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
      }
    })();
    grade.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    return { composer, dof, mb, bloomPass, grade, depth };
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
  u.uShutter.value = 0.4 * blur;
  u.uFar.value = camera.far;
  post.mb.enabled = blur > 0.001;
  post.dof.uniforms.uFar.value = camera.far;
  post.dof.uniforms.uFocus.value = lens.focus;
  post.dof.uniforms.uAperture.value = lens.aperture;
  post.dof.enabled = lens.aperture > 0;
  post.bloomPass.strength = bloom;
  const g = post.grade.uniforms;
  g.uTime.value = grade.time;
  g.uEdit.value = grade.edit;
  g.uZoom.value = grade.zoom;
  g.uShake.value.set(grade.shake[0], grade.shake[1]);
  g.uLetter.value = grade.letter;
  g.uFlash.value = grade.flash;
  g.uPrint.value = grade.print;
  g.uOn.value = grade.on;
  g.uCA.value = grade.ca;
  g.uSat.value = grade.sat ?? 1;
  g.uCon.value = grade.con ?? 1;
  g.uWarm.value = grade.warm ?? 0;
  g.uGrain.value = grade.grain ?? 0.012;
  useFrame(() => {
    camera.updateMatrixWorld();
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uP.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    post.composer.render();
  }, 1);
  return null;
};
