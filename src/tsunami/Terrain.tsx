import React, { useMemo } from "react";
import * as THREE from "three";
import { NOISE, SKY } from "./glsl";
import { SUN, fbm, groundY, reefAt, shoreZ, smooth, vnoise } from "./world";

/**
 * The ground: the beach, the sea floor the sea leaves behind, the headlands and the jungle hills. A height
 * field, finest where you stand. Colour and wetness are per vertex; sand grain, ripples, wet gloss and the
 * horizon haze are added in the shader.
 */

const NX = 241;
const NZ = 401;
// sinh spacing: 0.65 m across and 0.43 m deep around you, coarsening to tens of metres far off
const XS = Array.from({ length: NX }, (_, i) => 13 * Math.sinh(6 * ((i / (NX - 1)) * 2 - 1)));
const ZS = Array.from({ length: NZ }, (_, j) => 17.2 * Math.sinh(10 * (j / (NZ - 1) - 0.5347)));

const C = (hex: string) => new THREE.Color(hex);
const DRY = C("#DDBF8C");
const DAMP = C("#BFA175");
const WET = C("#9E8561");
const BED = C("#8E7B5B");
const ALGAE = C("#566239");
const ROCK = C("#5E554B");
const CLIFF = C("#77695A");
const JUNGLE = C("#355A26");
const JUNGLE2 = C("#4C7230");
const GRASS = C("#97A65E");

let geoCache: THREE.BufferGeometry | null = null;
const terrainGeo = () => {
  if (geoCache) return geoCache;
  const n = NX * NZ;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const wet = new Float32Array(n);
  const pool = new Float32Array(n);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const x = XS[i];
      const z = ZS[j];
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundY(x, z);
      pos[k * 3 + 2] = z;
    }
  const idx: number[] = [];
  for (let j = 0; j < NZ - 1; j++)
    for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i;
      const b = a + 1;
      const c = a + NX;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const x = pos[k * 3];
    const y = pos[k * 3 + 1];
    const z = pos[k * 3 + 2];
    const d = z - shoreZ(x);
    const steep = 1 - nrm.getY(k);
    const nz = vnoise(x / 9, z / 9);
    let w = 0;
    if (d < 0 || y < 0.6) {
      // sea floor and the wet beach
      c.copy(BED).lerp(WET, smooth(-25, 0, d));
      c.lerp(ALGAE, smooth(0.58, 0.8, vnoise(x / 23 + 4, z / 23 - 2)) * smooth(-12, -40, d) * 0.85);
      const reef = reefAt(x, z);
      if (reef > 0.05) c.lerp(ROCK, smooth(0.05, 0.4, reef));
      if (y > -0.05) c.lerp(DAMP, smooth(0.0, 0.3, y));
      if (y > 0.18) c.lerp(DRY, smooth(0.18, 0.45, y));
      w = 1 - smooth(0.12, 0.3, y);
      // where tide pools can be left behind (their outlines are drawn per pixel)
      pool[k] = smooth(-6, -12, d) * (1 - smooth(0.02, 0.08, reef));
    } else {
      // the dry beach, beach grass at the back, then jungle and rock on the steep bits
      c.copy(DRY).multiplyScalar(0.94 + 0.12 * nz);
      c.lerp(GRASS, smooth(48, 75, d) * smooth(0.45, 0.6, vnoise(x / 11, z / 11)) * 0.8);
      const jungle = smooth(80, 125, d);
      c.lerp(fbm(x / 40, z / 40, 3) > 0.5 ? JUNGLE : JUNGLE2, jungle);
    }
    // the headlands: jungle on top, rock where it's steep and down at the waterline
    c.lerp(CLIFF, smooth(0.35, 0.6, steep) * smooth(2, 6, y + 4 * steep));
    if (y > 8 && steep < 0.35) c.lerp(JUNGLE, smooth(8, 16, y) * (1 - smooth(0.25, 0.35, steep)));
    col[k * 3] = c.r;
    col[k * 3 + 1] = c.g;
    col[k * 3 + 2] = c.b;
    wet[k] = w;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aWet", new THREE.BufferAttribute(wet, 1));
  g.setAttribute("aPool", new THREE.BufferAttribute(pool, 1));
  geoCache = g;
  return g;
};

/** Per-frame inputs: the water level in the shallows (for the caustics) and the time. */
export const TERRAIN_U = { uLevel: { value: -10 }, uTime: { value: 0 } };

let matCache: THREE.MeshStandardMaterial | null = null;
const terrainMat = () => {
  if (matCache) return matCache;
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.75,
    fog: false,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSun = { value: SUN.clone() };
    sh.uniforms.uLevel = TERRAIN_U.uLevel;
    sh.uniforms.uTime = TERRAIN_U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aWet;\nattribute float aPool;\nvarying float vWet;\nvarying float vPool;\nvarying vec3 vWp;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWet = aWet;\nvPool = aPool;\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying float vWet;\nvarying float vPool;\nvarying vec3 vWp;\nuniform vec3 uSun;\nuniform float uLevel;\nuniform float uTime;\n${NOISE}\n${SKY}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float camD = length(vWp - cameraPosition);
        // tide pools: organic outlines from noise, mirror-still water over darker sand
        float pn = tsNoise(vWp.xz / 6.5 + vec2(11.0, 5.0)) * 0.8 + tsNoise(vWp.xz / 1.9) * 0.2;
        float pool = vPool * smoothstep(0.645, 0.665, pn);
        float near = exp(-camD / 35.0);
        // sand grain and little dark flecks, faded out with distance so nothing shimmers
        float grain = tsNoise(vWp.xz * 9.0) * 0.6 + tsNoise(vWp.xz * 31.0) * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * grain, near);
        diffuseColor.rgb *= mix(1.0, 0.94 + 0.06 * tsNoise(vWp.xz * 0.9), exp(-camD / 300.0));
        // wet sand is darker
        diffuseColor.rgb *= mix(1.0, 0.82, clamp(vWet, 0.0, 1.0));
        diffuseColor.rgb *= mix(1.0, 0.62, pool);
        {
          // under a thin sheet of water: darker, and the rippling bright lines of caustics
          float wd = uLevel - vWp.y;
          if (wd > 0.0 && camD < 45.0) {
            vec2 q = vWp.xz;
            float a = tsNoise(q * 2.4 + vec2(uTime * 0.7, uTime * 0.45));
            float b = tsNoise(q * 2.9 - vec2(uTime * 0.55, -uTime * 0.35) + 7.3);
            float cs = pow(clamp(1.0 - abs(a - b) * 2.4, 0.0, 1.0), 7.0);
            float k = smoothstep(0.0, 0.02, wd) * exp(-wd * 1.2) * (1.0 - smoothstep(25.0, 45.0, camD));
            diffuseColor.rgb *= 1.0 - 0.12 * k;
            diffuseColor.rgb += vec3(0.55, 0.6, 0.5) * cs * k * 0.9;
          }
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.95, 0.34, clamp(vWet, 0.0, 1.0)), 0.05, pool);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          // ripple marks in the wet sand, and a fine bumpiness everywhere
          float rk = clamp(vWet, 0.0, 1.0) * (1.0 - pool);
          vec2 q = vWp.xz;
          float ph = q.y * 17.0 + q.x * 2.5 + tsNoise(q * 0.7) * 9.0;
          float fade = exp(-camD / 22.0);
          vec2 g = vec2(2.5, 17.0) * cos(ph) * 0.0045 * rk * fade;
          float e = 0.05;
          float b0 = tsNoise(q * 6.0);
          g += vec2(tsNoise(q * 6.0 + vec2(e * 6.0, 0.0)) - b0, tsNoise(q * 6.0 + vec2(0.0, e * 6.0)) - b0) / e * 0.012 * fade * (1.0 - pool);
          normal = normalize(normal + (viewMatrix * vec4(-g.x, 0.0, -g.y, 0.0)).xyz);
        }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        {
          vec3 vd = normalize(vWp - cameraPosition);
          float hz = 1.0 - exp(-length(vWp - cameraPosition) / 7000.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyCol(vec3(vd.x, max(vd.y, 0.003), vd.z)), hz * 0.78);
        }`,
      );
  };
  m.customProgramCacheKey = () => "tsunamiTerrain";
  matCache = m;
  return m;
};

export const Terrain: React.FC = () => {
  const geo = useMemo(terrainGeo, []);
  const mat = useMemo(terrainMat, []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
};

/** Jungle on the hills behind the beach and on the headlands: rounded canopies of every green. */
export const Jungle: React.FC = () => {
  const mesh = useMemo(() => {
    const R = rngLocal(808);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
    const pts: { x: number; y: number; z: number; s: number; c: THREE.Color }[] = [];
    const greens = ["#2F5A22", "#3B6B2A", "#24481B", "#4A7A31", "#355F26"].map((h) => new THREE.Color(h));
    for (let k = 0; k < 20000 && pts.length < 900; k++) {
      const x = (R() * 2 - 1) * 900;
      const z = -650 + R() * 1150;
      const y = groundY(x, z);
      const d = z - shoreZ(x);
      const onHills = d > 105 && y > 2.5;
      const onHead = y > 12;
      if (!onHills && !onHead) continue;
      const s = 3.5 + R() * 5.5;
      pts.push({ x, y: y + s * 0.45, z, s, c: greens[k % 5].clone().multiplyScalar(0.85 + R() * 0.3) });
    }
    const m = new THREE.InstancedMesh(geo, mat, pts.length);
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, R() * 6.3, 0);
      o.scale.set(p.s, p.s * 0.78, p.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, p.c);
    });
    m.frustumCulled = false;
    return m;
  }, []);
  return <primitive object={mesh} />;
};

const rngLocal = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An island out on the horizon to the left, blue with distance. */
export const Island: React.FC = () => {
  const geo = useMemo(() => {
    const out = new THREE.BufferGeometry();
    const segs = 96;
    const rings = 24;
    const pos: number[] = [];
    const col: number[] = [];
    const wet: number[] = [];
    const idx: number[] = [];
    const green = C("#3E5A33");
    const rock = C("#7A6E62");
    for (let r = 0; r <= rings; r++) {
      const rr = r / rings;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const x = Math.cos(a) * rr * 1700;
        const z = Math.sin(a) * rr * 900;
        const h =
          260 * Math.pow(Math.max(0, 1 - rr * rr), 1.3) * (0.8 + 0.4 * fbm(x / 400 + 3, z / 400, 3)) -
          20 * rr;
        pos.push(x, h, z);
        const c = green.clone().lerp(rock, smooth(0.8, 1.0, rr));
        col.push(c.r, c.g, c.b);
        wet.push(0);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = r * segs + s;
        const b = r * segs + ((s + 1) % segs);
        idx.push(a, b, a + segs, b, b + segs, a + segs);
      }
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute("aWet", new THREE.Float32BufferAttribute(wet, 1));
    out.setAttribute("aPool", new THREE.Float32BufferAttribute(wet, 1));
    out.setIndex(idx);
    out.computeVertexNormals();
    return out;
  }, []);
  return <mesh geometry={geo} position={[-2900, -6, -8200]} material={terrainMat()} />;
};
