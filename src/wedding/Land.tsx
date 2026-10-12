import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CLOUDS, NOISE, SKY } from "../tsunami/glsl";
import { L, SUN, hash } from "./flight";

/**
 * The venue: a mown lawn on a terrace over a lake, a stone balustrade along the shore, the lake itself
 * (it reflects the sky, the clouds and the mountains: a reflection worked out in its shader from the same
 * ridge line the mountains are built from), mountains across the water with snow on top and evening haze,
 * green hills and vineyards behind, cypresses and olives round the lawn, and the villa.
 */

export const WATER_Y = -2.1;
const SHORE = L.lake.shore;

/* ------------------------------------------------------------------ */
/* The mountains: a ridge line round the north, as height(azimuth, distance)                        */
/* ------------------------------------------------------------------ */

const fbm1 = (x: number, seed: number) => {
  let s = 0;
  let a = 1;
  let f = 1;
  for (let o = 0; o < 6; o++) {
    const i = Math.floor(x * f);
    const t = x * f - i;
    const u = t * t * (3 - 2 * t);
    const h0 = hash(i * 1.37 + seed * 91.7 + o * 13.1);
    const h1 = hash((i + 1) * 1.37 + seed * 91.7 + o * 13.1);
    s += a * (h0 + (h1 - h0) * u);
    a *= 0.5;
    f *= 2.07;
  }
  return s / 1.97;
};

/** Height (m) of the range at azimuth a (radians from north, + east) and distance d (m). */
export const mountainH = (a: number, d: number) => {
  const north = Math.cos(a);
  if (north < -0.05) return 0;
  // three layers of ridges: near wooded hills, the main range, a far snowy wall
  const near = 160 + 260 * fbm1(a * 3.2 + 7, 1);
  const main = 520 + 900 * Math.pow(fbm1(a * 2.1 + 3, 2), 1.6);
  const far = 900 + 1500 * Math.pow(fbm1(a * 1.3 + 11, 3), 1.8);
  const ridgeOf = (h: number, d0: number, w: number) => h * Math.exp(-(((d - d0) / w) ** 2));
  const shape =
    ridgeOf(near, 1900, 520) + ridgeOf(main, 3600, 900) + ridgeOf(far, 6800, 1500) + 40 * fbm1(a * 40 + d * 0.004, 4);
  const fade = Math.min(1, (north + 0.05) / 0.45);
  // the far shore: the land comes up out of the water
  const shoreRamp = Math.min(1, Math.max(0, (d - 1050) / 500));
  return shape * fade * shoreRamp * shoreRamp * (3 - 2 * shoreRamp);
};

/** For the water's reflection: the highest elevation angle of the range at each azimuth, seen from the lawn. */
const RIDGE_N = 1024;
const ridgeTexture = (() => {
  let tex: THREE.DataTexture | null = null;
  return () => {
    if (tex) return tex;
    const data = new Uint8Array(RIDGE_N * 4);
    for (let i = 0; i < RIDGE_N; i++) {
      const a = (i / RIDGE_N) * Math.PI * 2 - Math.PI;
      let best = -1;
      let bestD = 4000;
      for (let d = 1500; d < 9000; d += 60) {
        const e = Math.atan2(mountainH(a, d) - WATER_Y - 2, d);
        if (e > best) {
          best = e;
          bestD = d;
        }
      }
      // elevation (0..0.5 rad) and distance, as bytes
      data[i * 4] = Math.round(Math.min(1, Math.max(0, best) / 0.5) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, bestD / 9000) * 255);
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    tex = new THREE.DataTexture(data, RIDGE_N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
})();

/** Shared GLSL: the mountains' colour for a direction (lit from the low sun, hazy with distance). The lake's
 *  reflection has no normal to light with: it passes the facing-away shade (most of what faces us is in
 *  the shadow of the evening sun behind the range). */
const MOUNTAIN_COL = /* glsl */ `
vec3 mountainCol(vec3 d, float frac, float dist01, vec3 N, float lit) {
  vec2 hz = normalize(d.xz + vec2(1e-5, 0.0));
  float toSun = dot(hz, normalize(uSun.xz)) * 0.5 + 0.5;
  vec3 forest = vec3(0.045, 0.07, 0.045);
  vec3 rock = vec3(0.2, 0.17, 0.16);
  vec3 snow = vec3(0.92, 0.9, 0.95);
  vec3 alb = mix(forest, rock, smoothstep(0.35, 0.75, frac));
  alb = mix(alb, snow, smoothstep(0.8, 0.92, frac) * smoothstep(0.3, 0.55, dist01));
  // light: the low sun on the slopes that face it, blue sky light on the rest
  float sunL = max(dot(N, uSun), 0.0) * lit;
  vec3 c = alb * (vec3(2.1, 1.35, 0.75) * sunL + vec3(0.28, 0.34, 0.48) * (0.6 + 0.4 * N.y));
  // aerial perspective: near ridges deep and clear, far ones paler and bluer, toward the sun all of it
  // dissolves into the glow
  vec3 hazeCol = mix(vec3(0.3, 0.38, 0.58), skyCol(vec3(d.x, 0.03, d.z)), 0.3 + 0.45 * pow(toSun, 3.0));
  float k = 1.0 - exp(-(0.04 + dist01 * 1.55));
  k = mix(k, 1.0, pow(toSun, 8.0) * 0.4);
  return mix(c, hazeCol, clamp(k, 0.0, 0.95));
}`;

/* ------------------------------------------------------------------ */
/* Lake                                                                 */
/* ------------------------------------------------------------------ */

const LAKE_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const LAKE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun;
uniform float uTime;
uniform sampler2D uRidge;
varying vec3 vW;
${NOISE}
${SKY}
${CLOUDS}
${MOUNTAIN_COL}
float wv(vec2 p, float t) {
  // a few wave trains from different directions, broken up by noise
  float h = 0.0;
  float a = 0.5;
  float f = 0.7;
  vec2 dir = vec2(0.8, 0.6);
  for (int i = 0; i < 6; i++) {
    float ph = dot(p, dir) * f + t * (1.2 + 0.35 * float(i)) + tsNoise(p * 0.15 + float(i)) * 3.0;
    h += a * sin(ph);
    dir = mat2(0.62, -0.78, 0.78, 0.62) * dir;
    a *= 0.58;
    f *= 1.73;
  }
  return h;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(vW - cameraPosition);
  float dist = length(vW - cameraPosition);
  // ripples: finer near, calmer far (and the far water looks glassy)
  vec2 p = vW.xz * 0.6;
  float e = 0.05;
  float amp = 0.11 * exp(-dist / 900.0) + 0.012;
  float h0 = wv(p, uTime);
  vec3 N = normalize(vec3(-(wv(p + vec2(e, 0.0), uTime) - h0) / e * amp, 1.0, -(wv(p + vec2(0.0, e), uTime) - h0) / e * amp));
  vec3 R = reflect(V, N);
  R.y = abs(R.y);
  // what it reflects: the mountains if the ray is under their ridge, else the sky and its clouds
  float az = atan(R.x, -R.z);
  vec4 rid = texture2D(uRidge, vec2(az / 6.2831853 + 0.5, 0.5));
  rid.x *= 0.5;
  float el = asin(clamp(R.y, 0.0, 1.0));
  vec3 refl;
  if (el < rid.x) {
    refl = mountainCol(R, el / max(rid.x, 1e-3), rid.y, normalize(vec3(-R.x, 0.6, -R.z)), 0.5);
  } else {
    refl = skyCol(R);
    vec4 cl = skyClouds(R);
    refl = mix(refl, cl.rgb, cl.a);
  }
  // the sun's glitter path
  float s = max(dot(R, uSun), 0.0);
  refl += vec3(1.0, 0.75, 0.45) * (pow(s, 900.0) * 30.0 + pow(s, 120.0) * 1.2);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
  vec3 deep = vec3(0.02, 0.07, 0.08);
  vec3 col = mix(deep, refl, clamp(fres * 1.1, 0.0, 1.0));
  // shallows along our shore: a little green-brown, and the stones show through
  float sh = 1.0 - smoothstep(${(-SHORE).toFixed(1)}, ${(-SHORE + 5.0).toFixed(1)}, -vW.z);
  col = mix(col, col * vec3(0.8, 0.95, 0.85) + vec3(0.02, 0.03, 0.02), sh * 0.4);
  gl_FragColor = vec4(col, 1.0);
}`;

export const Lake: React.FC<{ t: number }> = ({ t }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: SUN.clone() }, uTime: { value: 0 }, uRidge: { value: ridgeTexture() } },
        vertexShader: LAKE_VERT,
        fragmentShader: LAKE_FRAG,
      }),
    [],
  );
  mat.uniforms.uTime.value = t;
  return (
    <mesh material={mat} position={[0, WATER_Y, SHORE - 4500]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[18000, 9000, 1, 1]} />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/* Mountains (geometry): polar heightfield beyond the lake                                     */
/* ------------------------------------------------------------------ */

const MTN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aFrac;
varying vec3 vW;
varying float vFrac;
varying float vDist;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vFrac = aFrac;
  vDist = length(w.xz);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const MTN_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun;
varying vec3 vW;
varying float vFrac;
varying float vDist;
varying vec3 vN;
${NOISE}
${SKY}
${MOUNTAIN_COL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vW - cameraPosition);
  // a little texture: forest grain low, scree and couloirs high
  float n = tsFbm(vW.xz * 0.004) * 0.5 + tsFbm(vW.xz * 0.02) * 0.25;
  float frac = clamp(vFrac + (n - 0.35) * 0.18, 0.0, 1.0);
  vec3 N = normalize(vN + vec3(tsFbm(vW.xz * 0.01) - 0.5, 0.0, tsFbm(vW.zx * 0.01 + 3.0) - 0.5) * 0.5);
  vec3 col = mountainCol(d, frac, clamp((vDist - 1500.0) / 7500.0, 0.0, 1.0), N, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const Mountains: React.FC = () => {
  const { geo, mat } = useMemo(() => {
    const NA = 360;
    const ND = 90;
    const pos: number[] = [];
    const frac: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= ND; j++) {
      const d = 1000 + Math.pow(j / ND, 1.3) * 8500;
      for (let i = 0; i <= NA; i++) {
        const a = -1.75 + (i / NA) * 3.5;
        const h = mountainH(a, d);
        pos.push(Math.sin(a) * d, WATER_Y + h - 6, -Math.cos(a) * d + SHORE);
        // how high up its own ridge this point is
        let top = 1;
        for (let dd = 1500; dd < 9000; dd += 250) top = Math.max(top, mountainH(a, dd));
        frac.push(Math.min(1, h / top));
      }
    }
    for (let j = 0; j < ND; j++)
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i;
        const b = a + NA + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aFrac", new THREE.Float32BufferAttribute(frac, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN.clone() } }, vertexShader: MTN_VERT, fragmentShader: MTN_FRAG, side: THREE.DoubleSide });
    return { geo: g, mat: m };
  }, []);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

/* ------------------------------------------------------------------ */
/* The lawn and the land round it                                       */
/* ------------------------------------------------------------------ */

/** Ground height: the lawn terrace, flat; rising into hills away from the lake. */
export const groundY = (x: number, z: number) => {
  if (z < SHORE) return WATER_Y - 0.4;
  const r = Math.hypot(x - 8, z - 6);
  const rise = Math.max(0, r - 48);
  const hills = rise * rise * 0.006 * (0.7 + 0.6 * Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.01));
  return Math.min(hills, 120);
};

/** Grass up close: thin blades of several greens, tiling every 0.7 m. */
const grassTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const N = 512;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6f6f6f";
    g.fillRect(0, 0, N, N);
    let n = 17;
    const r = () => hash(++n * 0.613);
    for (let k = 0; k < 14000; k++) {
      const x = r() * N;
      const y = r() * N;
      const len = 6 + r() * 16;
      const ang = -Math.PI / 2 + (r() - 0.5) * 1.2;
      const l = Math.round(60 + r() * 170);
      g.strokeStyle = `rgba(${l},${l},${l},${0.25 + r() * 0.35})`;
      g.lineWidth = 0.8 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 4, y + Math.sin(ang) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
      // wrap round the edges so it tiles
      if (x < 24 || y < 24 || x > N - 24 || y > N - 24) {
        g.save();
        g.translate(x < 24 ? N : x > N - 24 ? -N : 0, y < 24 ? N : y > N - 24 ? -N : 0);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.stroke();
        g.restore();
      }
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
})();

export const lawnMaterial = () => {
  // a standard material with its colour worked out in the shader: mown stripes, clover, worn patches,
  // the gravel paths, the aisle's runner left to the ceremony
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrass = { value: grassTex() };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWld;
uniform sampler2D uGrass;
${NOISE}
float gpath(vec2 p, vec2 a, vec2 b, float w) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return smoothstep(w, w - 0.25, length(p - a - ab * t));
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  vec2 q = vWld.xz;
  float n1 = tsFbm(q * 0.08);
  float n2 = tsFbm(q * 0.9 + 3.1);
  float n3 = tsFbm(q * 6.0 - 1.7);
  // mown stripes along the lawn, a little uneven
  float stripe = smoothstep(-0.25, 0.25, sin((q.x + n1 * 1.5) * 3.14159 / 1.6));
  vec3 g1 = vec3(0.16, 0.3, 0.07);
  vec3 g2 = vec3(0.23, 0.38, 0.1);
  vec3 gc = mix(g1, g2, stripe);
  gc *= 0.82 + 0.3 * n2 + 0.16 * n3;
  float blades = texture2D(uGrass, q / 0.7).r * 0.6 + texture2D(uGrass, q / 2.9 + 0.37).r * 0.4;
  gc *= 0.55 + 0.9 * blades;
  gc = mix(gc, vec3(0.32, 0.36, 0.12), smoothstep(0.62, 0.8, n1) * 0.5);
  // the hills: rougher meadow and vines
  float wild = smoothstep(46.0, 70.0, length(q - vec2(8.0, 6.0)));
  vec3 meadow = mix(vec3(0.24, 0.32, 0.1), vec3(0.42, 0.4, 0.16), n2);
  gc = mix(gc, meadow, wild);
  // gravel paths: from the villa to the lawn, along to the tent
  float gp = max(gpath(q, vec2(-4.0, 44.0), vec2(1.0, 18.5), 1.3), gpath(q, vec2(1.0, 18.5), vec2(17.6, 4.0), 1.1));
  vec3 gravel = vec3(0.62, 0.55, 0.45) * (0.85 + 0.3 * n3);
  gc = mix(gc, gravel, gp);
  diffuseColor.rgb = gc;`,
      );
  };
  m.customProgramCacheKey = () => "wedding-lawn";
  return m;
};

export const Lawn: React.FC = () => {
  const geo = useMemo(() => {
    // from the shore wall south and out to the hills (the north edge sits exactly on the wall)
    const depth = 760 - SHORE;
    const g = new THREE.PlaneGeometry(900, depth, 225, 190);
    g.rotateX(-Math.PI / 2);
    g.translate(8, 0, SHORE + depth / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => lawnMaterial(), []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
};

/** The stone balustrade along the shore, and the wall dropping to the water. */
export const ShoreWall: React.FC = () => {
  const meshes = useMemo(() => {
    const stone = new THREE.MeshStandardMaterial({ color: "#CDBFA6", roughness: 0.85 });
    const wallStone = new THREE.MeshStandardMaterial({ color: "#A99A80", roughness: 0.95 });
    const x0 = -60;
    const x1 = 70;
    const wall = new THREE.BoxGeometry(x1 - x0, 2.6, 0.6);
    wall.translate((x0 + x1) / 2, WATER_Y + 1.1, SHORE - 0.3);
    const rail = new THREE.BoxGeometry(x1 - x0, 0.12, 0.34);
    rail.translate((x0 + x1) / 2, 0.92, SHORE + 0.05);
    const base = new THREE.BoxGeometry(x1 - x0, 0.14, 0.38);
    base.translate((x0 + x1) / 2, 0.07, SHORE + 0.05);
    // balusters: a turned profile, every 0.32 m
    const prof: THREE.Vector2[] = [
      [0.0, 0.0],
      [0.07, 0.0],
      [0.07, 0.06],
      [0.045, 0.12],
      [0.075, 0.32],
      [0.09, 0.42],
      [0.06, 0.55],
      [0.04, 0.62],
      [0.06, 0.66],
      [0.06, 0.72],
      [0.0, 0.72],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bal = new THREE.LatheGeometry(prof, 10);
    const n = Math.floor((x1 - x0) / 0.32);
    const im = new THREE.InstancedMesh(bal, stone, n);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x0 + 0.16 + i * 0.32, 0.14, SHORE + 0.05));
    im.castShadow = true;
    im.receiveShadow = true;
    // pillars every 4.5 m with urns of flowers on a few
    const pillar = new THREE.BoxGeometry(0.42, 1.1, 0.42);
    pillar.translate(0, 0.55, 0);
    const np = Math.floor((x1 - x0) / 4.5);
    const pm = new THREE.InstancedMesh(pillar, stone, np);
    for (let i = 0; i < np; i++) pm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x0 + i * 4.5, 0, SHORE + 0.05));
    pm.castShadow = true;
    pm.receiveShadow = true;
    const merged = mergeGeometries([rail, base].map((g) => g.toNonIndexed()))!;
    return { wall: new THREE.Mesh(wall, wallStone), rails: new THREE.Mesh(merged, stone), im, pm };
  }, []);
  return (
    <>
      <primitive object={meshes.wall} />
      <primitive object={meshes.rails} castShadow receiveShadow />
      <primitive object={meshes.im} />
      <primitive object={meshes.pm} />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Trees: cypresses, olives, round chestnuts                             */
/* ------------------------------------------------------------------ */

const leafTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7a7a7a";
    g.fillRect(0, 0, 256, 256);
    let n = 3;
    const r = () => hash(++n * 0.731);
    for (let k = 0; k < 3200; k++) {
      const l = r();
      g.fillStyle = `rgba(${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},${0.1 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(r() * 256, r() * 256, 1.5 + r() * 3.5, 0.8 + r() * 1.6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
})();

const lumpy = (g: THREE.BufferGeometry, amt: number, seed: number, uvScale: [number, number]) => {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash(Math.round(x * 97) * 3.1 + Math.round(y * 89) * 7.7 + Math.round(z * 83) * 1.3 + seed) - 0.5) * amt;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) * uvScale[0];
    uv[i * 2 + 1] = p.getY(i) * uvScale[1];
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
};

/** A cypress, 1 m tall (scaled): a narrow flame of foliage on a short trunk. */
const cypressGeo = () => {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const r = 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.7) * (1 - 0.35 * u) + 0.004;
    prof.push(new THREE.Vector2(r, 0.06 + u * 0.94));
  }
  const g = new THREE.LatheGeometry(prof, 14);
  return lumpy(g, 0.35, 5, [2, 6]);
};

/** An olive: a twisted grey trunk and a loose, silvery crown (unit height). */
const oliveGeo = () => {
  const blobs: THREE.BufferGeometry[] = [];
  const centers: [number, number, number, number][] = [
    [0, 0.72, 0, 0.3],
    [0.24, 0.66, 0.08, 0.22],
    [-0.22, 0.64, -0.1, 0.24],
    [0.06, 0.86, -0.14, 0.2],
    [-0.1, 0.8, 0.18, 0.2],
  ];
  centers.forEach(([x, y, z, s], k) => {
    const b = new THREE.IcosahedronGeometry(s, 2);
    b.translate(x, y, z);
    blobs.push(lumpy(b, 0.3, k * 3 + 1, [1.5, 3]).toNonIndexed());
  });
  return mergeGeometries(blobs)!;
};
const roundGeo = () => {
  const blobs: THREE.BufferGeometry[] = [];
  const centers: [number, number, number, number][] = [
    [0, 0.66, 0, 0.32],
    [0.18, 0.6, 0.1, 0.24],
    [-0.16, 0.58, -0.12, 0.25],
    [0.06, 0.82, -0.12, 0.22],
    [-0.08, 0.78, 0.17, 0.22],
    [0.14, 0.48, -0.18, 0.2],
  ];
  centers.forEach(([x, y, z, s], k) => {
    const b = new THREE.IcosahedronGeometry(s, 2);
    b.translate(x, y, z);
    blobs.push(lumpy(b, 0.22, k * 5 + 2, [1.5, 3]).toNonIndexed());
  });
  return mergeGeometries(blobs)!;
};
const trunkGeo = (h: number, r0: number, r1: number) => {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7);
  g.translate(0, h / 2, 0);
  return g;
};

type Tree = { kind: "cypress" | "olive" | "round"; x: number; z: number; h: number; c: number };

/** Where the trees stand: cypress avenues by the villa and the tent, olives on the slopes, a ring of
 *  big trees round the lawn, woods on the hills. Kept off the lawn, the tent, the aisle and the shore. */
export const TREES: Tree[] = (() => {
  const out: Tree[] = [];
  let n = 11;
  const r = () => hash(++n * 0.917);
  const clearOf = (x: number, z: number) =>
    z > SHORE + 3 &&
    !(x > -9 && x < 33 && z > -6 && z < 22) && // the lawn: ceremony and tent
    !(x > -9 && x < 12 && z > 22 && z < 50); // the villa's forecourt and path
  // cypress avenue along the path from the villa
  for (let k = 0; k < 9; k++) {
    for (const side of [-1, 1]) out.push({ kind: "cypress", x: -2.2 + side * 3.2 + k * 0.6, z: 48 - k * 3.4, h: 9 + r() * 3, c: r() });
  }
  // a line of cypresses behind the tent and along the west edge of the lawn
  for (let k = 0; k < 10; k++) out.push({ kind: "cypress", x: 34.5 + r() * 0.6, z: -5 + k * 3.0, h: 10 + r() * 4, c: r() });
  for (let k = 0; k < 9; k++) out.push({ kind: "cypress", x: -12.5 - r() * 0.6, z: -4 + k * 3.2, h: 9 + r() * 4, c: r() });
  // big round trees and olives round the lawn
  for (let k = 0; k < 220; k++) {
    const a = r() * Math.PI * 2;
    const d = 26 + r() * 50;
    const x = 10 + Math.cos(a) * d;
    const z = 12 + Math.sin(a) * d;
    if (!clearOf(x, z)) continue;
    out.push({ kind: r() < 0.55 ? "olive" : "round", x, z, h: r() < 0.5 ? 5 + r() * 3 : 9 + r() * 6, c: r() });
  }
  // woods on the hills
  for (let k = 0; k < 900; k++) {
    const a = r() * Math.PI * 2;
    const d = 80 + r() * 320;
    const x = 8 + Math.cos(a) * d;
    const z = 6 + Math.sin(a) * d;
    if (z < SHORE + 3) continue;
    out.push({ kind: r() < 0.2 ? "cypress" : "round", x, z, h: 10 + r() * 9, c: r() });
  }
  return out;
})();

export const Trees: React.FC = () => {
  const meshes = useMemo(() => {
    const leaf = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, map: leafTex() });
    const bark = new THREE.MeshStandardMaterial({ color: "#56473A", roughness: 0.95 });
    const oliveBark = new THREE.MeshStandardMaterial({ color: "#6E675E", roughness: 0.95 });
    const make = (kind: Tree["kind"], g: THREE.BufferGeometry, mat: THREE.Material, col: (t: Tree) => THREE.Color, sc: (t: Tree) => THREE.Vector3) => {
      const list = TREES.filter((t) => t.kind === kind);
      const im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((t, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, groundY(t.x, t.z), t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.c * 6.28, 0)), sc(t)));
        im.setColorAt(i, col(t));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      return im;
    };
    const s3 = (t: Tree, w = 1) => new THREE.Vector3(t.h * w, t.h, t.h * w);
    return [
      make("cypress", cypressGeo(), leaf, (t) => new THREE.Color().setHSL(0.27 + t.c * 0.04, 0.45, 0.13 + t.c * 0.05), (t) => s3(t)),
      make("cypress", trunkGeo(0.08, 0.02, 0.015), bark, () => new THREE.Color("#ffffff"), (t) => s3(t)),
      make("olive", oliveGeo(), leaf, (t) => new THREE.Color().setHSL(0.2 + t.c * 0.05, 0.18, 0.3 + t.c * 0.08), (t) => s3(t, 1.2)),
      make("olive", trunkGeo(0.55, 0.05, 0.03), oliveBark, () => new THREE.Color("#ffffff"), (t) => s3(t, 1.2)),
      make("round", roundGeo(), leaf, (t) => new THREE.Color().setHSL(0.23 + t.c * 0.07, 0.42 + t.c * 0.15, 0.18 + t.c * 0.08), (t) => s3(t, 0.95)),
      make("round", trunkGeo(0.5, 0.045, 0.03), bark, () => new THREE.Color("#ffffff"), (t) => s3(t, 0.95)),
    ];
  }, []);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Vineyards on the hills                                               */
/* ------------------------------------------------------------------ */

export const Vines: React.FC = () => {
  const im = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const list: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    // rows on the south-east slope
    for (let row = 0; row < 46; row++) {
      for (let seg = 0; seg < 14; seg++) {
        const x = 60 + seg * 6.2 + row * 1.1;
        const z = 40 + row * 3.1;
        const y = groundY(x, z);
        list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.18, 0)), new THREE.Vector3(6.0, 1.3 + hash(row * 31 + seg) * 0.25, 0.7)));
        cols.push(new THREE.Color().setHSL(0.24 + hash(row + seg * 7) * 0.05, 0.45, 0.2 + hash(row * 3 + seg) * 0.06));
      }
    }
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, map: leafTex() }), list.length);
    list.forEach((mm, i) => {
      m.setMatrixAt(i, mm);
      m.setColorAt(i, cols[i]);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }, []);
  return <primitive object={im} />;
};

/* ------------------------------------------------------------------ */
/* The villa: ochre walls, green shutters, a terracotta roof, a loggia   */
/* ------------------------------------------------------------------ */

export const Villa: React.FC = () => {
  const g = useMemo(() => {
    const wall = new THREE.MeshStandardMaterial({ color: "#D9A86A", roughness: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: "#A4502E", roughness: 0.8 });
    const shutter = new THREE.MeshStandardMaterial({ color: "#3E5B3A", roughness: 0.7 });
    const stone = new THREE.MeshStandardMaterial({ color: "#CDBFA6", roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: "#2A2620", roughness: 0.2, metalness: 0.4, emissive: new THREE.Color("#FFB466"), emissiveIntensity: 0.35 });
    const grp = new THREE.Group();
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
      return mesh;
    };
    const cx = -3;
    const cz = 58;
    box(26, 11, 13, cx, 5.5, cz, wall);
    // hipped roof
    const r = new THREE.ConeGeometry(18.5, 4.2, 4, 1);
    r.rotateY(Math.PI / 4);
    r.scale(1, 1, 0.52);
    const rm = new THREE.Mesh(r, roof);
    rm.position.set(cx, 13.1, cz);
    rm.castShadow = true;
    grp.add(rm);
    // a tower
    box(5, 15, 5, cx + 9, 7.5, cz - 2, wall);
    const tr = new THREE.ConeGeometry(3.9, 2.4, 4, 1);
    tr.rotateY(Math.PI / 4);
    const trm = new THREE.Mesh(tr, roof);
    trm.position.set(cx + 9, 16.2, cz - 2);
    grp.add(trm);
    // windows with shutters on the lawn side, two floors; a loggia of arches on the ground floor
    for (let fl = 0; fl < 2; fl++)
      for (let k = 0; k < 7; k++) {
        const x = cx - 10.5 + k * 3.5;
        const y = 3.0 + fl * 4.2;
        box(1.1, 1.9, 0.12, x, y, cz - 6.52, glass);
        box(0.55, 1.95, 0.1, x - 0.86, y, cz - 6.56, shutter);
        box(0.55, 1.95, 0.1, x + 0.86, y, cz - 6.56, shutter);
        box(1.5, 0.12, 0.3, x, y - 1.05, cz - 6.6, stone);
      }
    box(26.4, 0.3, 13.4, cx, 0.15, cz, stone);
    grp.position.y = groundY(cx, cz);
    return grp;
  }, []);
  return <primitive object={g} />;
};
