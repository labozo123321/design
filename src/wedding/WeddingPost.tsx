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
 * (The pinball piece's post, adapted for a camera that rides a train.) The lens, on the HDR picture:
 *  - motion blur from the camera's own movement (each pixel's world position from the depth buffer,
 *    reprojected into the previous frame's camera: the floor streaks past, whip pans smear);
 *  - bloom (lamps, flashers, the display, glints on the chrome);
 *  - a grade: chromatic fringing on hits, a white flash, the freeze frame's warm faded still, the TILT's
 *    red throb, the VHS rewind (wobbling lines, tracking noise, colour bleed), grain and a vignette;
 *  - then ACES tone mapping and sRGB.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

class MotionBlurPass extends Pass {
  quad: FullScreenQuad;
  uniforms: Record<string, THREE.IUniform>;
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uCamWorld: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uP: { value: new THREE.Vector2(1, 1) },
      uFar: { value: 30 },
      uShutter: { value: 0.5 },
      uMax: { value: 0.05 },
      uAspect: { value: 1080 / 1920 },
    };
    const mat = new THREE.ShaderMaterial({
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
        vec2 velocityAt(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          // logarithmic depth: d = log2(1 + w) / log2(far + 1)
          float w = pow(uFar + 1.0, d) - 1.0;
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
          if (c0.a < 0.5) {
            gl_FragColor = vec4(c0.rgb, 1.0);
            return;
          }
          vec2 vel = velocityAt(vUv);
          vec2 asp = vec2(1.0 / uAspect, 1.0);
          float len = length(vel * asp);
          if (len > uMax) vel *= uMax / len;
          if (len < 0.0008) {
            gl_FragColor = vec4(c0.rgb, 1.0);
            return;
          }
          vec3 acc = vec3(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 14; i++) {
            float t = float(i) / 13.0 - 0.5;
            vec2 uv = clamp(vUv + vel * t, vec2(0.0005), vec2(0.9995));
            vec4 sm = texture2D(tDiffuse, uv);
            float w = (1.0 - abs(t) * 0.6) * step(0.5, sm.a);
            acc += sm.rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(wsum > 0.0 ? acc / wsum : c0.rgb, 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(mat);
  }
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1080 / 1920 },
    uCA: { value: 0 },
    uFlash: { value: 0 },
    uFreeze: { value: 0 },
    uVhs: { value: 0 },
    uTilt: { value: 0 },
    uDark: { value: 0 },
    uGrain: { value: 0.012 },
    uVig: { value: 0.32 },
    uSat: { value: 1 },
    uCon: { value: 1 },
    uDrops: { value: 0 },
    uDropT: { value: 0 },
    uGrey: { value: 0 },
    uMist: { value: 0 },
    uBarrel: { value: 0 },
    uGlitch: { value: 0 },
    uFrost: { value: 0 },
    uSeed: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uCA;
    uniform float uFlash;
    uniform float uFreeze;
    uniform float uVhs;
    uniform float uTilt;
    uniform float uDark;
    uniform float uGrain;
    uniform float uVig;
    uniform float uSat;
    uniform float uCon;
    uniform float uDrops;
    uniform float uDropT;
    uniform float uGrey;
    uniform float uMist;
    uniform float uBarrel;
    uniform float uGlitch;
    uniform float uFrost;
    uniform float uSeed;

    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise1(float x) { float i = floor(x); float f = fract(x); return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }
    vec3 tap(vec2 uv) { return texture2D(tDiffuse, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
    // water on the lens: drops in a few layers of cells, each sliding down at its own pace;
    // returns the uv offset (refraction) in xy and how much of a drop is here in z
    vec3 lensDrops(vec2 uv, float t) {
      vec3 acc = vec3(0.0);
      for (int L = 0; L < 2; L++) {
        float fl = float(L);
        float cells = 9.0 + fl * 7.0;
        vec2 g = vec2(uv.x * cells * uAspect, uv.y * cells);
        vec2 id = floor(g);
        float h = hash(id + fl * 17.0);
        float slide = t * (0.15 + 0.6 * h * h) * (h > 0.6 ? 1.0 : 0.15);
        g.y += slide * cells * 0.25;
        id = floor(g);
        h = hash(id + fl * 17.0);
        if (h > 0.3) continue;
        vec2 f = fract(g) - 0.5 - (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.5;
        float r = 0.09 + 0.14 * hash(id + 11.3);
        // drops are a little taller than wide, with a tail above
        vec2 q = f * vec2(1.0, 0.85);
        float d = length(q);
        float m = smoothstep(r, r * 0.8, d);
        acc.xy += -q / max(r, 1e-3) * m * 0.012 / cells * 8.0;
        acc.z = max(acc.z, m);
      }
      return acc;
    }
    float vn(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm2(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
    void main() {
      vec2 uv = vUv;
      // the drone camera's wide lens: a touch of barrel distortion
      if (uBarrel > 0.0) {
        vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
        float r2 = dot(c, c);
        uv = 0.5 + (uv - 0.5) * (1.0 - uBarrel * 0.25 + uBarrel * r2 * 0.6);
      }
      // the feed breaking up: rows torn sideways in blocks, frozen bands
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 38.0 + floor(uTime * 24.0) * 3.0);
        float tear = step(1.0 - uGlitch * 0.7, hash(vec2(band, floor(uTime * 24.0))));
        uv.x += (hash(vec2(band * 1.7, floor(uTime * 30.0))) - 0.5) * 0.18 * tear * uGlitch;
        float block = step(0.86, hash(floor(uv * vec2(12.0, 30.0)) + floor(uTime * 15.0)));
        uv = mix(uv, floor(uv * vec2(12.0, 30.0)) / vec2(12.0, 30.0) + 0.02, block * uGlitch * 0.8);
      }
      float vhs = uVhs;
      float dropMask = 0.0;
      if (uDrops > 0.0) {
        vec3 dr = lensDrops(vUv, uDropT);
        uv += dr.xy * uDrops;
        dropMask = dr.z * uDrops;
      }
      // VHS: lines wobble, a tracking band rolls up the picture tearing it sideways, the head-switch
      // noise chews the bottom edge
      float band = 0.0;
      if (vhs > 0.0) {
        float line = floor(uv.y * 540.0);
        uv.x += (noise1(line * 0.15 + uTime * 40.0) - 0.5) * 0.006 * vhs;
        float bpos = fract(uTime * 0.9);
        band = smoothstep(0.06, 0.0, abs(uv.y - bpos)) * vhs;
        uv.x += (hash(vec2(line, floor(uTime * 60.0))) - 0.5) * 0.06 * band;
        float head = smoothstep(0.035, 0.0, uv.y) * vhs;
        uv.x += (hash(vec2(line * 3.1, uTime)) - 0.5) * 0.05 * head;
      }
      // chromatic fringing: radial, stronger towards the edges; plus the tape's colour bleed
      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(1.0, 1.0 / uAspect * uAspect), c);
      vec2 dir = c * (uCA * (0.4 + 2.0 * r2));
      vec2 bleed = vec2(0.004 * vhs, 0.0);
      vec3 col;
      col.r = tap(uv + dir + bleed).r;
      col.g = tap(uv).g;
      col.b = tap(uv - dir - bleed).b;
      if (vhs > 0.0) {
        // softer, bluer, noisier, scanlines
        vec3 soft = (tap(uv + vec2(0.002, 0.0)) + tap(uv - vec2(0.002, 0.0))) * 0.5;
        col = mix(col, soft, 0.5 * vhs);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(l), 0.25 * vhs) * mix(vec3(1.0), vec3(0.92, 0.98, 1.12), vhs);
        col *= 1.0 - 0.18 * vhs * step(0.5, fract(gl_FragCoord.y * 0.5));
        col += (hash(uv * 900.0 + uTime) - 0.5) * 0.12 * vhs;
        col += band * vec3(0.6) * hash(vec2(floor(uv.y * 900.0), uTime * 7.0));
      }
      // the freeze frame: a warm, faded still
      if (uFreeze > 0.0) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(l) * vec3(1.12, 1.0, 0.82), 0.55 * uFreeze);
        col = mix(col, col * 0.94 + 0.02, 0.6 * uFreeze);
      }
      // the TILT: everything throbs red
      if (uTilt > 0.0) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(l * 1.6, l * 0.25, l * 0.2) + vec3(0.06, 0.0, 0.0), uTilt);
      }
      // optional richer colour (1, 1 = off): saturation, and contrast round mid-grey (linear light)
      if (uSat != 1.0 || uCon != 1.0) {
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = max(mix(vec3(l), col, uSat), 0.0);
        col = pow(col / 0.18, vec3(uCon)) * 0.18;
      }
      col *= 1.0 - uDark;
      // a hit's flash brightens what's there (and only a little lifts the blacks), so it doesn't fog
      col = col * (1.0 + 2.5 * uFlash) + uFlash * 0.12;
      // a drop catches the light at its rim and darkens a little at its edge
      col = mix(col, col * 0.82 + 0.035, dropMask * 0.35);
      // mist from the splash: a bright haze
      col = mix(col, vec3(0.75, 0.8, 0.82) * 0.9 + col * 0.25, uMist);
      // frosting on the lens: thick creamy smears from the edges in, the middle left clearer, softly lit
      if (uFrost > 0.0) {
        vec2 q = vUv * vec2(uAspect, 1.0) * 3.0 + uSeed;
        float n = fbm2(q) * 0.75 + fbm2(q * 3.1 + 7.0) * 0.25;
        vec2 cc = (vUv - 0.5) * vec2(1.0, 1.25);
        float edge = smoothstep(0.18, 0.62, length(cc)) + 0.35 * smoothstep(0.55, 0.2, vUv.y + vUv.x * 0.3);
        float m = smoothstep(0.52, 0.6, n + edge * 0.42 * uFrost - (1.0 - uFrost) * 0.6);
        float thick = smoothstep(0.55, 0.85, n + edge * 0.3);
        // a little light and shade on the cream's surface
        float sh = fbm2(q * 2.0 + 3.0);
        vec3 cream = vec3(1.0, 0.96, 0.88) * (0.78 + 0.32 * sh) * (0.9 + 0.1 * thick);
        // thin smears are see-through and blur what's behind
        vec3 behind = (tap(vUv + vec2(0.006, 0.0)) + tap(vUv - vec2(0.006, 0.0)) + tap(vUv + vec2(0.0, 0.006)) + tap(vUv - vec2(0.0, 0.006))) * 0.25;
        col = mix(col, behind, smoothstep(0.4, 0.55, n + edge * 0.4 * uFrost) * 0.6 * uFrost);
        col = mix(col, cream, m * (0.55 + 0.45 * thick));
      }
      // grey-out at high g: the edges drain of colour and darken
      if (uGrey > 0.0) {
        float r = length(c * vec2(1.0, 1.15));
        float k = smoothstep(0.25, 0.8, r) * uGrey;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, vec3(l) * 0.55, k);
      }
      // vignette and grain
      float v = smoothstep(0.85, 0.25, length(c * vec2(1.0, 1.25)));
      col *= mix(1.0 - uVig, 1.0, v);
      col += (hash(gl_FragCoord.xy + fract(uTime * 13.7) * 100.0) - 0.5) * uGrain;
      // static when the feed goes, and then black
      if (uGlitch > 0.0) {
        float st = hash(vUv * vec2(540.0, 960.0) + floor(uTime * 30.0) * 1.37);
        col = mix(col, vec3(st) * 0.55, smoothstep(0.45, 0.95, uGlitch));
        col *= 1.0 - smoothstep(0.92, 1.0, uGlitch) * 0.92;
      }
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export type Grade = {
  ca: number;
  flash: number;
  freeze: number;
  vhs: number;
  tilt: number;
  dark: number;
  time: number;
  /** optional: saturation and contrast (1 = unchanged) */
  sat?: number;
  con?: number;
  /** water on the lens (0..1) and its clock; grey-out; splash mist */
  drops?: number;
  dropT?: number;
  grey?: number;
  mist?: number;
  /** the drone lens: barrel distortion, the feed breaking up (0..1: tearing, static, black), frosting */
  barrel?: number;
  glitch?: number;
  frost?: number;
  seed?: number;
};

export const WeddingPost: React.FC<{ prev: Pose; blur: number; grade: Grade; bloom: number }> = ({
  prev,
  blur,
  grade,
  bloom,
}) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const post = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: depth,
    });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const mb = new MotionBlurPass();
    mb.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(mb);
    const bloomPass = new UnrealBloomPass(size.clone(), 0.6, 0.45, 1.75);
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
      render(
        renderer: THREE.WebGLRenderer,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
      ) {
        this.uniforms.tDiffuse.value = readBuffer.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
      }
    })();
    grade.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    return { composer, mb, bloomPass, grade };
  }, [gl, scene, camera]);

  // the previous frame's camera, for the reprojection
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
  u.uShutter.value = 0.38 * blur;
  u.uFar.value = camera.far;
  post.mb.enabled = blur > 0.001;
  post.bloomPass.strength = bloom;
  const g = post.grade.uniforms;
  g.uCA.value = grade.ca;
  g.uFlash.value = grade.flash;
  g.uFreeze.value = grade.freeze;
  g.uVhs.value = grade.vhs;
  g.uTilt.value = grade.tilt;
  g.uDark.value = grade.dark;
  g.uTime.value = grade.time;
  g.uSat.value = grade.sat ?? 1;
  g.uCon.value = grade.con ?? 1;
  g.uDrops.value = grade.drops ?? 0;
  g.uDropT.value = grade.dropT ?? 0;
  g.uGrey.value = grade.grey ?? 0;
  g.uMist.value = grade.mist ?? 0;
  g.uBarrel.value = grade.barrel ?? 0;
  g.uGlitch.value = grade.glitch ?? 0;
  g.uFrost.value = grade.frost ?? 0;
  g.uSeed.value = grade.seed ?? 0;
  useFrame(() => {
    // the current camera is set by the rig just before; read it at render time
    camera.updateMatrixWorld();
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uP.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    post.composer.render();
  }, 1);
  return null;
};
