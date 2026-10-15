import React, { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
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

/** Depth of field in two steps: the scatter-as-gather blur at half resolution (40 taps over a golden-angle
 * disc), which also says how blurred each place is; then at full resolution the sharp picture wherever
 * nothing's blurred, the half-res blur wherever something is (so the in-focus face keeps every pixel). */
class DofPass extends Pass {
  quad: FullScreenQuad;
  mix: FullScreenQuad;
  half: THREE.WebGLRenderTarget;
  depth: THREE.Texture | null = null;
  uniforms: Record<string, THREE.IUniform>;
  constructor(w: number, h: number) {
    super();
    this.half = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.HalfFloatType });
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      tHalf: { value: this.half.texture },
      uFar: { value: 200 },
      uFocus: { value: 2.6 },
      uAperture: { value: 0.0 },
      uMaxR: { value: 0.02 },
      uAspect: { value: 1080 / 1920 },
    };
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
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
            // alpha: how much of this place is blur (its own, or something in front spreading over it)
            gl_FragColor = vec4(acc / wsum, max(1.0 - 1.0 / wsum, smoothstep(0.0008, 0.003, r0)));
          }`,
      }),
    );
    this.mix = new FullScreenQuad(
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse;
          uniform sampler2D tHalf;
          varying vec2 vUv;
          void main() {
            vec4 c0 = texture2D(tDiffuse, vUv);
            vec4 b = texture2D(tHalf, vUv);
            gl_FragColor = vec4(mix(c0.rgb, b.rgb, smoothstep(0.03, 0.4, b.a)), c0.a);
          }`,
      }),
    );
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = this.depth;
    renderer.setRenderTarget(this.half);
    this.quad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.mix.render(renderer);
  }
}

/** FXAA (the compact console version), on the finished sRGB picture: edges smoothed along their direction. */
const FXAA = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, resolution: { value: new THREE.Vector2(1 / 1080, 1 / 1920) } },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      #ifdef PASSTHROUGH
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);
      return;
      #endif
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
    }`,
};

/** The scene into its own target (colour and depth), then its colour copied into the chain's buffer. */
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
        depthTest: false,
        depthWrite: false,
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
      // the printed photo: the frame shrinks a little into a card with a white border (deeper at the bottom),
      // tipped a touch, over a dark table; the picture inside is the frame's middle (cropped, not squashed)
      float sc = 1.0 - 0.09 * uPrint;
      float ang = -0.03 * uPrint;
      vec2 sq = (vUv - 0.5) * vec2(uAspect, 1.0);
      sq = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * sq / sc;
      vec2 card = sq / vec2(uAspect, 1.0) + 0.5;
      bool onCard = all(greaterThanEqual(card, vec2(0.0))) && all(lessThanEqual(card, vec2(1.0)));
      float bx = 0.05 * uPrint;
      vec2 bLo = vec2(bx, bx * uAspect * 2.6);
      vec2 bHi = vec2(bx, bx * uAspect);
      vec2 inner = (card - bLo) / (1.0 - bLo - bHi);
      bool inPhoto = all(greaterThanEqual(inner, vec2(0.0))) && all(lessThanEqual(inner, vec2(1.0)));
      float innerAsp = (1.0 - 2.0 * bx) * uAspect / (1.0 - bLo.y - bHi.y);
      vec2 crop = innerAsp > uAspect ? vec2(1.0, uAspect / innerAsp) : vec2(innerAsp / uAspect, 1.0);
      vec2 uv0 = vUv;
      vec2 uv = uPrint > 0.0 ? 0.5 + (inner - 0.5) * crop : uv0;
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
        // shadows lifted (a dark face keeps its features), the highlights held (a pale one doesn't go to
        // white), then the hard contrast round the middle
        vec3 e = pow(max(mix(col, steel, 0.8), 0.0), vec3(0.85)) * 0.85;
        e = pow(e / 0.18, vec3(1.25)) * 0.18;
        // a soft shoulder: lit pale skin stays skin, not paper
        e = e / (1.0 + e * 0.6) * 1.35;
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
      // the card's white border (a faint paper texture), and the dark table round it with the card's shadow
      if (uPrint > 0.0 && !inPhoto) {
        vec3 paper = vec3(0.97, 0.965, 0.95) * (0.97 + 0.03 * hash(floor(gl_FragCoord.xy * 0.5)));
        if (onCard) col = paper * (1.0 + 2.0 * uFlash);
        else {
          vec2 d = max(max(-card, card - 1.0), 0.0) * vec2(uAspect, 1.0);
          float shadow = smoothstep(0.0, 0.05, length(d - vec2(0.0, 0.008)));
          vec3 table = mix(tap(vUv) * 0.2, vec3(0.04, 0.036, 0.036), 0.5);
          col = mix(col, table * (0.35 + 0.65 * shadow), uPrint);
        }
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
    const perf0 = (globalThis as { __perf?: Record<string, boolean> }).__perf ?? {};
    // (no multisampling: in software GL it costs as much as the rest put together; FXAA at the end instead)
    const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: perf0.msaa ? 4 : 0, depthTexture: depth });
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new ScenePass(scene, camera, sceneRT));
    const dof = new DofPass(size.x, size.y);
    dof.depth = depth;
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
        depthTest: false,
        depthWrite: false,
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
    // FXAA on the graded HDR picture (its edge test on a compressed luminance), then tone mapping and sRGB
    const fxaa = new (class extends Pass {
      quad = new FullScreenQuad(new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false, uniforms: THREE.UniformsUtils.clone(FXAA.uniforms), vertexShader: FXAA.vertexShader, fragmentShader: FXAA.fragmentShader, defines: perf0.passthrough ? { PASSTHROUGH: "" } : {} }));
      get uniforms() {
        return (this.quad.material as THREE.ShaderMaterial).uniforms;
      }
      render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
        this.uniforms.tDiffuse.value = readBuffer.texture;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
      }
    })();
    fxaa.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    if (!perf0.noFxaa) composer.addPass(fxaa);
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
  const pf = (globalThis as { __perf?: Record<string, boolean> }).__perf ?? {};
  post.mb.enabled = blur > 0.001 && !pf.noMB;
  post.dof.uniforms.uFar.value = camera.far;
  post.dof.uniforms.uFocus.value = lens.focus;
  post.dof.uniforms.uAperture.value = lens.aperture;
  post.dof.enabled = lens.aperture > 0 && !pf.noDof;
  post.bloomPass.strength = bloom;
  post.bloomPass.enabled = !pf.noBloom;
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
    const perf = (globalThis as { __perf?: Record<string, boolean> }).__perf;
    if (perf?.noPost) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }
    camera.updateMatrixWorld();
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uP.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    post.composer.render();
  }, 1);
  return null;
};
