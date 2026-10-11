import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { NOISE, SKY } from "./glsl";
import {
  SUN,
  YOU,
  crestH,
  flowAt,
  frontZ,
  groundY,
  rng,
  smooth,
  waterAt,
  waveAt,
  type Wave,
  type WaterPt,
} from "./world";

/**
 * The sea: one height field from your feet to 16 km out, rebuilt every frame on a grid whose rows bunch up
 * round you and round the wave's face wherever it is. Per vertex it carries the water depth (the shallows are
 * see-through), foam and how far up the wave's face it is (for the light through the crest). Then the spray
 * blowing back off the crest and the mist thrown up ahead of its foot.
 */

const NXW = 200;
const NZW = 440;
// across the bay: 0.45 m apart in front of you, out to 9 km either side
const XW = Float64Array.from({ length: NXW }, (_, i) => 5.54 * Math.sinh(8.08 * ((i / (NXW - 1)) * 2 - 1)));
const FAR = -16000;

/** Rows from the beach out to sea: fine round you, fine across the face of the wave. */
const fillRows = (zf: number, D: number, out: Float64Array) => {
  for (let scale = 1; ; scale *= 1.12) {
    let z = 6;
    let n = 0;
    while (n < NZW - 1 && z > FAR) {
      out[n++] = z;
      const cam = 0.3 + 0.03 * Math.abs(z - YOU.z);
      const fr = 0.35 + 0.004 * D + 0.05 * Math.abs(z - zf);
      z -= Math.min(cam, fr, 900) * scale;
    }
    if (z <= FAR) {
      for (; n < NZW; n++) out[n] = FAR;
      return;
    }
  }
};

const WATER_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aDepth;
attribute float aFoam;
attribute float aFace;
varying vec3 vW;
varying vec3 vN;
varying float vDepth;
varying float vFoam;
varying float vFace;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vDepth = aDepth;
  vFoam = aFoam;
  vFace = aFace;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const WATER_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun;
uniform float uSunVis;
uniform float uFrontZ;
uniform float uTime;
uniform float uFlow;
varying vec3 vW;
varying vec3 vN;
varying float vDepth;
varying float vFoam;
varying float vFace;
${NOISE}
${SKY}

// short wind waves: the glitter on the surface
vec2 rippleGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * 0.06 * cos(dot(p, vec2(0.8, 0.6)) * 2.1 - t * 4.5);
  g += vec2(-0.5, 0.86) * 0.05 * cos(dot(p, vec2(-0.5, 0.86)) * 3.3 - t * 5.6 + 1.3);
  g += vec2(0.2, 0.98) * 0.045 * cos(dot(p, vec2(0.2, 0.98)) * 5.2 - t * 7.1 + 2.1);
  g += vec2(-0.9, 0.42) * 0.035 * cos(dot(p, vec2(-0.9, 0.42)) * 7.9 - t * 8.8 + 0.4);
  g += vec2(0.62, -0.78) * 0.03 * cos(dot(p, vec2(0.62, -0.78)) * 11.0 - t * 10.3 + 4.0);
  float n = tsNoise(p * 0.15 + t * 0.05);
  return g * (0.55 + 0.9 * n);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 N0 = normalize(vN);
  if (!gl_FrontFacing) N0 = -N0;
  float fineK = exp(-dist / 90.0) * (1.0 - smoothstep(0.05, 0.3, vFace));
  vec2 rg = rippleGrad(vW.xz, uTime) * mix(0.3, 1.0, fineK) * (1.0 - smoothstep(0.1, 0.6, vFace) * 0.8);
  vec3 N = normalize(N0 + vec3(-rg.x, 0.0, -rg.y));
  // the face of the wave: big sheets and ridges of water dragged up it, so it isn't a painted wall
  float faceK = smoothstep(0.02, 0.15, vFace);
  if (faceK > 0.0) {
    vec2 fq = vec2(vW.x * 0.09, vW.y * 0.05 - uTime * 0.35);
    float e = 0.35;
    float f0 = tsFbm(fq);
    float fx = tsFbm(fq + vec2(e, 0.0)) - f0;
    float fy = tsFbm(fq + vec2(0.0, e)) - f0;
    N = normalize(N + (vec3(-fx, -fy * 0.5, 0.0) / e) * 0.9 * faceK);
  }
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.002;
  vec3 refl = skyCol(R);
  // the wave's shadow falls on everything shoreward of it once it covers the sun
  float sunOn = vW.z > uFrontZ + 2.0 ? uSunVis : 1.0;
  float sd = max(dot(R, uSun), 0.0);
  float sharp = mix(2200.0, 240.0, smoothstep(40.0, 1500.0, dist));
  vec3 sunC = vec3(1.0, 0.8, 0.56);
  vec3 spec = sunC * sunOn * (pow(sd, sharp) * sharp * 0.012 + pow(sd, 40.0) * 0.12);
  float dep = max(vDepth, 0.0);
  vec3 shallow = vec3(0.07, 0.4, 0.38);
  vec3 deep = vec3(0.01, 0.065, 0.095);
  vec3 body = mix(shallow, deep, 1.0 - exp(-dep * 0.4));
  // greener and lighter toward the top of the face, where it's thin; murky with sand low down
  body = mix(body, vec3(0.025, 0.11, 0.1), smoothstep(0.35, 0.95, vFace) * 0.8);
  body = mix(body, vec3(0.05, 0.055, 0.04), smoothstep(0.45, 0.0, vFace) * faceK * 0.8);
  body = mix(body, body * vec3(0.75, 0.8, 0.85), faceK);
  // big blotches of lighter and darker water across the face
  body *= mix(1.0, 0.7 + 0.6 * tsNoise(vec2(vW.x * 0.045, vW.y * 0.03 - uTime * 0.2)), faceK);
  float lam = max(dot(N0, uSun), 0.0);
  vec3 skyAmb = vec3(0.55, 0.62, 0.76);
  body *= skyAmb * 0.75 + sunC * (0.2 + 0.8 * lam) * 0.9 * sunOn;
  // sunlight through the thin top of the wave when you look toward the sun through it
  float back = pow(max(dot(-V, uSun), 0.0), 3.0);
  float thin = smoothstep(0.4, 0.95, vFace);
  body += vec3(0.06, 0.55, 0.42) * back * thin * 1.5;
  vec3 col = mix(body, refl, F) + spec;
  // foam: carried up the beach with the wash and out with the sea, streaked up the face of the wave
  float shoreK = smoothstep(-90.0, -3.0, vW.z) * (1.0 - smoothstep(0.02, 0.2, vFace));
  vec2 fp = vW.xz - vec2(0.0, uFlow * shoreK);
  // streaks of foam dragged up the middle of the face (thin, broken, moving up)
  // soft sheets of foam dragged up the face (long, broken, drifting up)
  float streak = smoothstep(0.58, 0.8, tsFbm(vec2(vW.x * 0.11, vW.y * 0.03 - uTime * 0.45))) * smoothstep(0.35, 0.7, tsNoise(vec2(vW.x * 0.07 + 3.0, vW.y * 0.04 + uTime * 0.2)));
  float midFace = smoothstep(0.12, 0.35, vFace) * (1.0 - smoothstep(0.6, 0.8, vFace));
  float fo = clamp(vFoam, 0.0, 1.0);
  // clumpy whitewater (crest, toe, breakers); on the face it's sampled up the face, not across the sea
  vec2 cq = mix(fp * 0.55, vec2(vW.x * 0.1, vW.y * 0.1 + vW.z * 0.03), faceK);
  float fn = tsFbm(cq + vec2(uTime * 0.05, -uTime * 0.25 * faceK)) * 0.7 + tsNoise(cq * 4.0) * 0.3;
  float foamAmt = smoothstep(1.0 - fo, 1.0 - fo + 0.3, fn) * smoothstep(0.0, 0.08, fo);
  foamAmt = max(foamAmt, smoothstep(0.6, 0.85, fo) * (0.85 + 0.15 * fn));
  foamAmt = max(foamAmt, streak * midFace * 0.22);
  // lace: the net of bubbles on a thin wash of water over sand
  float lw = smoothstep(0.35, 0.015, dep) * smoothstep(-0.002, 0.004, dep) * exp(-dist / 60.0) * (1.0 - faceK);
  if (lw > 0.0) {
    float ln = tsFbm(fp * 2.6 + vec2(0.0, uTime * 0.12));
    float ridge = 1.0 - abs(2.0 * ln - 1.0);
    float lace = smoothstep(0.88, 0.96, ridge) * (0.45 + 0.55 * tsNoise(fp * 14.0));
    foamAmt = max(foamAmt, lace * lw * 0.75);
  }
  vec3 foamLit = vec3(0.95, 0.96, 0.97) * (skyAmb * 0.62 + sunC * (0.2 + 0.95 * max(dot(N0, uSun), 0.0)) * sunOn);
  foamLit += vec3(1.0, 0.86, 0.62) * pow(max(dot(-V, uSun), 0.0), 2.0) * 0.75;
  foamLit *= 1.0 + 0.6 * smoothstep(300.0, 2000.0, dist);
  col = mix(col, foamLit, foamAmt);
  float alpha = 1.0 - exp(-dep * 2.4);
  alpha = max(alpha, 0.14 * smoothstep(0.0, 0.06, dep));
  alpha = max(alpha, foamAmt * smoothstep(-0.01, 0.02, dep));
  alpha = max(alpha, F * smoothstep(0.0, 0.05, dep));
  alpha = clamp(alpha, 0.0, 1.0);
  float hz = 1.0 - exp(-dist / 9000.0);
  vec3 vd = -V;
  col = mix(col, skyCol(vec3(vd.x, max(vd.y, 0.003), vd.z)), hz * 0.8);
  gl_FragColor = vec4(col, alpha);
}`;

let waterMatCache: THREE.ShaderMaterial | null = null;
export const waterMat = () => {
  if (waterMatCache) return waterMatCache;
  waterMatCache = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: SUN.clone() },
      uSunVis: { value: 1 },
      uFrontZ: { value: -1e5 },
      uTime: { value: 0 },
      uFlow: { value: 0 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  return waterMatCache;
};

const makeGrid = (nx: number, nz: number) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3));
  g.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
  g.setAttribute("aFoam", new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
  g.setAttribute("aFace", new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // rows run from the beach out to sea (z decreasing): wind so the faces look up
      idx.push(a, b, c, b, d, c);
    }
  g.setIndex(idx);
  return g;
};

const ZR = new Float64Array(NZW);
const PT: WaterPt = { y: 0, foam: 0, face: 0 };
const YS = new Float64Array(NXW * NZW);

/** The sea surface for this moment. */
const buildSea = (g: THREE.BufferGeometry, u: number, w: Wave) => {
  fillRows(frontZ(0, w), w.D, ZR);
  const pos = g.attributes.position.array as Float32Array;
  const dep = g.attributes.aDepth.array as Float32Array;
  const foam = g.attributes.aFoam.array as Float32Array;
  const face = g.attributes.aFace.array as Float32Array;
  const nrm = g.attributes.normal.array as Float32Array;
  for (let j = 0; j < NZW; j++) {
    const z = ZR[j];
    for (let i = 0; i < NXW; i++) {
      const k = j * NXW + i;
      const x = XW[i];
      const gy = groundY(x, z);
      waterAt(x, z, u, gy, w, PT);
      YS[k] = PT.y;
      pos[k * 3] = x;
      pos[k * 3 + 1] = PT.y;
      pos[k * 3 + 2] = z;
      dep[k] = PT.y - gy;
      foam[k] = PT.foam;
      face[k] = PT.face;
    }
  }
  for (let j = 0; j < NZW; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(NZW - 1, j + 1);
    const dz = ZR[j1] - ZR[j0];
    for (let i = 0; i < NXW; i++) {
      const k = j * NXW + i;
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(NXW - 1, i + 1);
      const sx = (YS[j * NXW + i1] - YS[j * NXW + i0]) / (XW[i1] - XW[i0]);
      const sz = Math.abs(dz) > 1e-6 ? (YS[j1 * NXW + i] - YS[j0 * NXW + i]) / dz : 0;
      const l = Math.hypot(sx, 1, sz);
      nrm[k * 3] = -sx / l;
      nrm[k * 3 + 1] = 1 / l;
      nrm[k * 3 + 2] = -sz / l;
    }
  }
  for (const a of ["position", "normal", "aDepth", "aFoam", "aFace"]) g.attributes[a].needsUpdate = true;
  g.computeBoundingSphere();
};

/* ------------------------------------------------------------------ */
/* Spray                                                                */
/* ------------------------------------------------------------------ */

const SPRAY_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
uniform vec3 uSun;
varying float vAlpha;
varying float vGlow;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 700.0);
  vec3 vd = normalize(wp.xyz - cameraPosition);
  vGlow = pow(max(dot(vd, uSun), 0.0), 5.0);
  vAlpha = aAlpha;
  #include <logdepthbuf_vertex>
}`;
const SPRAY_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vAlpha;
varying float vGlow;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = 1.0 - r2;
  a *= a * vAlpha;
  vec3 col = vec3(0.9, 0.92, 0.95) + vec3(2.0, 1.5, 0.9) * vGlow * 1.5;
  gl_FragColor = vec4(col * a, a);
}`;

type Drop = {
  x: number;
  ph: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  s: number;
  toe: boolean;
};
const NSP = 6500;
const NTOE = 2400;
const DROPS: Drop[] = (() => {
  const r = rng(4242);
  const out: Drop[] = [];
  for (let k = 0; k < NSP + NTOE; k++) {
    const toe = k >= NSP;
    const e = r() * 2 - 1;
    out.push({
      x: Math.sign(e) * Math.pow(Math.abs(e), 1.5) * 300,
      ph: r(),
      vx: (r() - 0.5) * 3,
      vy: toe ? 1 + r() * 4 : 2.5 + r() * 8,
      vz: toe ? 3 + r() * 6 : -(3 + r() * 9),
      life: toe ? 0.9 + r() * 0.9 : 1.3 + r() * 1.5,
      s: 0.35 + r() * 0.9,
      toe,
    });
  }
  return out;
})();

const buildSpray = (g: THREE.BufferGeometry, u: number) => {
  const pos = g.attributes.position.array as Float32Array;
  const size = g.attributes.aSize.array as Float32Array;
  const alpha = g.attributes.aAlpha.array as Float32Array;
  for (let k = 0; k < DROPS.length; k++) {
    const p = DROPS[k];
    const age = (u + p.ph * p.life) % p.life;
    const ub = u - age;
    const w = waveAt(ub);
    const hc = crestH(p.x, w);
    const height = (hc - w.L) * w.appear;
    const fw = Math.max(4, 0.62 * height);
    let a = 0;
    if (w.appear > 0.4 && height > 8) {
      const zFront = frontZ(p.x, w);
      if (p.toe) {
        const gy = Math.max(groundY(p.x, zFront + 1), w.L);
        pos[k * 3] = p.x + p.vx * age;
        pos[k * 3 + 1] = gy + 0.4 + p.vy * age - 4.9 * age * age * 0.5;
        pos[k * 3 + 2] = zFront + 1 + p.vz * age;
        a = 0.09 * smooth(500, 140, w.D);
        size[k] = p.s * (2.4 + 4.5 * age);
      } else {
        pos[k * 3] = p.x + p.vx * age;
        pos[k * 3 + 1] = w.L + height + p.vy * age - 1.6 * age * age;
        pos[k * 3 + 2] = zFront - fw + p.vz * age;
        a = 0.3 * (0.35 + 0.65 * smooth(1800, 250, w.D));
        size[k] = p.s * (1.6 + 3.6 * age) * (0.6 + height / 18);
      }
      a *= smooth(0, 0.15, age) * Math.pow(1 - age / p.life, 1.4);
    }
    if (a <= 0.002) {
      pos[k * 3 + 1] = -1e4;
      a = 0;
    }
    alpha[k] = a;
  }
  for (const n of ["position", "aSize", "aAlpha"]) g.attributes[n].needsUpdate = true;
  g.computeBoundingSphere();
};

/* ------------------------------------------------------------------ */

export const Sea: React.FC<{ u: number; sunVis: number; fov: number }> = ({ u, sunVis, fov }) => {
  const gl = useThree((s) => s.gl);
  const bufH = useMemo(() => gl.getDrawingBufferSize(new THREE.Vector2()).y, [gl]);
  const sea = useMemo(() => makeGrid(NXW, NZW), []);
  const spray = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = DROPS.length;
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  }, []);
  const sprayMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1000 }, uSun: { value: SUN.clone() } },
        vertexShader: SPRAY_VERT,
        fragmentShader: SPRAY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    [],
  );
  const w = waveAt(u);
  buildSea(sea, u, w);
  const mat = waterMat();
  mat.uniforms.uSunVis.value = sunVis;
  mat.uniforms.uFrontZ.value = w.appear > 0 ? frontZ(0, w) : -1e5;
  mat.uniforms.uTime.value = u;
  mat.uniforms.uFlow.value = flowAt(u);
  const showSpray = w.appear > 0.4;
  if (showSpray) buildSpray(spray, u);
  sprayMat.uniforms.uScale.value = bufH / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
  return (
    <group>
      <mesh geometry={sea} material={mat} renderOrder={1} frustumCulled={false} />
      {showSpray ? (
        <points geometry={spray} material={sprayMat} renderOrder={3} frustumCulled={false} />
      ) : null}
    </group>
  );
};
