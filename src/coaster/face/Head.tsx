import React, { useMemo } from "react";
import * as THREE from "three";
import { markRider } from "../Train";
import {
  LID_T,
  deform,
  eyeCentre,
  eyeLids,
  frontZ,
  jawAngle,
  jawPivot,
  lidEdges,
  mouthShape,
  neutralPoint,
  type EyeLids,
  type Expr,
  type Shape,
} from "./sculpt";
import { IRIS_R, gumMap, irisMap, skinMaps, strandMaps, type SkinLook } from "./textures";

/**
 * A head with a face that acts: the sculpted skin (re-shaped every frame for the expression, with the open
 * mouth cut out of it), eyes that look about (glossy, with irises and catch-lights), lids that blink and
 * droop, lashes, brows, lips, teeth (with a gap where a milk tooth fell out, if they're seven), a tongue,
 * ears and hair: a cap with a hairline, bangs, and pigtails or a ponytail whose shape comes from the
 * dynamics (they stream in the wind).
 *
 * Built in head space (sculpt.ts): origin between the ears at eye level, facing +z.
 */

export type HairStyle = "pigtails" | "pony" | "short" | "buzz" | "curly" | "long" | "bun" | "combover" | "base" | "fade";
export type Person = {
  name: string;
  shape: Shape;
  skin: SkinLook;
  iris: string;
  hair: { style: HairStyle; color: string; bangs?: boolean; tie?: string };
  brow: string;
  /** lash strength 0..1 */
  lashes: number;
  /** missing upper front tooth (the left one) */
  gap?: boolean;
  /** a beard shadow */
  stubble?: number;
  /** skin that shines like glass (a ten-step routine): 0..1 */
  gloss?: number;
  /** metal braces on the front teeth */
  braces?: boolean;
};

const SEG_HI = { w: 128, h: 96 };
const SEG_LO = { w: 112, h: 84 };
const SEG_PORTRAIT = { w: 240, h: 180 };

type Base = { dirs: Float32Array; neutral: Float32Array; geo: THREE.BufferGeometry };
const baseCache: Record<string, Base> = {};
const baseFor = (sh: Shape, hi: boolean): Base => {
  const key = `${JSON.stringify(sh)}${hi}`;
  if (baseCache[key]) return baseCache[key];
  const seg = sh.portrait && hi ? SEG_PORTRAIT : hi ? SEG_HI : SEG_LO;
  const geo = new THREE.SphereGeometry(1, seg.w, seg.h);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const dirs = new Float32Array(pos.array);
  const neutral = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
    neutralPoint(sh, d, p);
    neutral[i * 3] = p.x;
    neutral[i * 3 + 1] = p.y;
    neutral[i * 3 + 2] = p.z;
  }
  baseCache[key] = { dirs, neutral, geo };
  return baseCache[key];
};

/** Light that wraps round the terminator with a warm tint: skin's look of light passing under it. */
const WRAPPED = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );",
  `float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.42 ) / 1.42 );
	vec3 sssI = directLight.color * ( vec3( wrapNL ) * vec3( 1.0, 0.93, 0.9 ) + vec3( 0.42, 0.1, 0.05 ) * max( 0.0, wrapNL - dotNL ) );
	reflectedLight.directDiffuse += sssI * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`,
);
export const skinShade = (s: { fragmentShader: string }) => {
  s.fragmentShader = s.fragmentShader.replace("#include <lights_physical_pars_fragment>", WRAPPED);
};

/** Bubblegum pink, and a blank gum map for everyone without gum on their face. */
const GUM_COL = new THREE.Color("#FF86BC");
const NO_GUM = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/** Skin material: soft sheen, warm; the mouth's opening is discarded between the lips' inner edges. */
const skinMaterial = (sh: Shape, look: SkinLook, rider: boolean, gloss = 0) => {
  const maps = skinMaps(sh, look);
  const m = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    roughnessMap: maps.rough,
    roughness: 1 - 0.72 * gloss,
    sheen: 0.35,
    sheenColor: new THREE.Color("#FFB09A"),
    sheenRoughness: 0.55,
    clearcoat: 0.04 + 0.66 * gloss,
    clearcoatRoughness: 0.5 - 0.36 * gloss,
    // the inside of the head is what you see through the open mouth: dark
    side: THREE.DoubleSide,
  });
  const uniforms = {
    uLipX: { value: new THREE.Vector2(-0.02, 0.02) },
    uUp: { value: new Array(9).fill(0) },
    uLo: { value: new Array(9).fill(0) },
    uZMin: { value: 0.02 },
    uEyeC: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uEyeL: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uEyeR: { value: sh.eyeR },
    uGumMap: { value: NO_GUM },
    uGum: { value: 0 },
    uGumCol: { value: GUM_COL },
  };
  m.userData.mouth = uniforms;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    skinShade(s);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
  float crease = max(eyeCrease(vHead, uEyeC[0], -1.0, uEyeL[0]), eyeCrease(vHead, uEyeC[1], 1.0, uEyeL[1]));
  diffuseColor.rgb *= 1.0 - 0.72 * crease;
  vec2 gumS = texture2D(uGumMap, vMapUv).rg;
  float gumK = gumS.r * uGum;
  diffuseColor.rgb = mix(diffuseColor.rgb, uGumCol * (0.86 + 0.4 * gumS.g), gumK);`,
    );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.16, gumK);`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
  material.clearcoat = mix(material.clearcoat, 1.0, gumK);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.07, gumK);
  #endif`,
      );
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHead;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHead = position;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vHead;
uniform vec2 uLipX;
uniform float uUp[9];
uniform float uLo[9];
uniform float uZMin;
uniform vec3 uEyeC[2];
uniform vec4 uEyeL[2];
uniform float uEyeR;
uniform sampler2D uGumMap;
uniform float uGum;
uniform vec3 uGumCol;
/** How dark the crease of a shut eye is at P (0 none .. 1 on the line). */
float eyeCrease(vec3 P, vec3 C, float side, vec4 l) {
  vec3 d = P - C;
  if (d.z < -0.001 || length(d) > uEyeR * 1.7) return 0.0;
  float t = atan(d.x * side, d.z);
  float hw = t < 0.0 ? l.z * 0.86 : l.z;
  if (abs(t) >= hw * 1.05) return 0.0;
  float el = atan(d.y, length(d.xz));
  float k = min(1.0, abs(t) / hw);
  float c = max(0.0, cos(1.5707963 * k));
  float mid = (l.x + l.y) * 0.5;
  float corner = mid * 0.25 + l.w * (t / hw);
  float line = corner + (mid - corner) * pow(c, 0.8);
  float shut = smoothstep(0.08, -0.02, l.x - l.y);
  return shut * smoothstep(0.09, 0.0, abs(el - line)) * (0.4 + 0.6 * c);
}
bool inEye(vec3 P, vec3 C, float side, vec4 l) {
  vec3 d = P - C;
  if (d.z < -0.001 || length(d) > uEyeR * 1.7) return false;
  float t = atan(d.x * side, d.z);
  float hw = t < 0.0 ? l.z * 0.86 : l.z;
  if (abs(t) >= hw) return false;
  float el = atan(d.y, length(d.xz));
  float k = min(1.0, abs(t) / hw);
  float c = max(0.0, cos(1.5707963 * k));
  float sU = pow(c, 0.75) * (1.0 + 0.08 * sign(-t) * k);
  float sL = pow(c, 0.9);
  float mid = (l.x + l.y) * 0.5;
  float corner = mid * 0.25 + l.w * (t / hw);
  float up = corner + (l.x - corner) * sU;
  float lo = corner + (l.y - corner) * sL;
  return el < up && el > lo;
}
float lipAt(float arr[9], float t) {
  float x = clamp(t, 0.0, 8.0);
  int i = int(min(floor(x), 7.0));
  float k = x - float(i);
  float a = arr[0]; float b = arr[1];
  for (int j = 0; j < 8; j++) { if (j == i) { a = arr[j]; b = arr[j + 1]; } }
  return mix(a, b, k);
}`,
      )
      .replace(
        "void main() {",
        `void main() {
  if (inEye(vHead, uEyeC[0], -1.0, uEyeL[0]) || inEye(vHead, uEyeC[1], 1.0, uEyeL[1])) discard;
  if (vHead.z > uZMin && vHead.x > uLipX.x && vHead.x < uLipX.y) {
    float t = (vHead.x - uLipX.x) / (uLipX.y - uLipX.x) * 8.0;
    float up = lipAt(uUp, t);
    float lo = lipAt(uLo, t);
    if (vHead.y < up && vHead.y > lo) discard;
  }`,
      );
    // (dark down by the mouth; pink up by the eyes, where you see past a lid's corner into the socket)
    s.fragmentShader = s.fragmentShader.replace(
      /}\s*$/,
      `  if (!gl_FrontFacing) {
    float hi = smoothstep(uEyeC[0].y - uEyeR * 4.5, uEyeC[0].y - uEyeR * 1.2, vHead.y);
    gl_FragColor.rgb = mix(vec3(0.15, 0.045, 0.055), vec3(0.6, 0.36, 0.35), hi);
  }
}`,
    );
    if (rider) s.fragmentShader = s.fragmentShader.replace(/}\s*$/, "  gl_FragColor.a = 0.0;\n}");
  };
  m.customProgramCacheKey = () => `skin-mouth-${rider}`;
  return m;
};

const plain = (color: string, rough: number, extra: THREE.MeshPhysicalMaterialParameters = {}, skinLike = false) => {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, ...extra });
  if (skinLike) {
    m.onBeforeCompile = (s) => skinShade(s);
    m.customProgramCacheKey = () => "skinlike";
  }
  return markRider(m);
};

/** A tube along points with a radius profile r(t), t in [0, 1]. */
const taperTube = (pts: THREE.Vector3[], r: (t: number) => number, seg = 24, rad = 8, geo?: THREE.BufferGeometry) => {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(seg, false);
  const n = (seg + 1) * (rad + 1);
  const g = geo ?? new THREE.BufferGeometry();
  let pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count !== n) {
    pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    g.setAttribute("position", pos);
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++)
      for (let j = 0; j <= rad; j++) {
        uv[(i * (rad + 1) + j) * 2] = j / rad;
        uv[(i * (rad + 1) + j) * 2 + 1] = i / seg;
        if (i < seg && j < rad) {
          const a = i * (rad + 1) + j;
          const b = a + rad + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
  }
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const rr = r(t);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      N.copy(frames.normals[i])
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i], Math.sin(a));
      const k = i * (rad + 1) + j;
      pos.setXYZ(k, P.x + N.x * rr, P.y + N.y * rr, P.z + N.z * rr);
      nor.setXYZ(k, N.x, N.y, N.z);
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
};

/** A lip: a tube through pts with radii rs, its section an ellipse in the y-z plane (depth squashed). */
const lipTube = (pts: THREE.Vector3[], rs: number[], depth: number, g: THREE.BufferGeometry, seam = 0) => {
  const rad = 12;
  const n = pts.length;
  const cnt = n * (rad + 1);
  let pos = g.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count !== cnt) {
    pos = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
    g.setAttribute("position", pos);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < rad; j++) {
        const a = i * (rad + 1) + j;
        const b = a + rad + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    g.setIndex(idx);
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const p = pts[i];
      pos.setXYZ(i * (rad + 1) + j, p.x, p.y + Math.cos(a) * rs[i], p.z + Math.sin(a) * rs[i] * depth);
    }
  pos.needsUpdate = true;
  // the seam where the lips meet is darker (seam: +1 the upper lip's underside, -1 the lower's top)
  if (seam !== 0) {
    let col = g.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!col || col.count !== cnt) {
      col = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
      g.setAttribute("color", col);
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2;
        const toward = seam > 0 ? -Math.cos(a) : Math.cos(a);
        const k = 1 - 0.42 * Math.pow(Math.max(0, toward), 3);
        col.setXYZ(i * (rad + 1) + j, k, k * 0.95, k * 0.95);
      }
    col.needsUpdate = true;
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
};

/** Eyeball with the iris planar-mapped on its front (+z). */
const eyeballGeo = (r: number) => {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r;
    const y = p.getY(i) / r;
    const z = p.getZ(i) / r;
    // the cornea bulges a little over the iris
    const iris = Math.hypot(x, y) < IRIS_R * 2 && z > 0;
    if (iris) {
      const k = 1 - Math.hypot(x, y) / (IRIS_R * 2);
      p.setZ(i, (z + 0.06 * k * k) * r);
    }
    uv.setXY(i, z > 0 ? 0.5 + x * 0.5 : 0.02, z > 0 ? 0.5 + y * 0.5 : 0.02);
  }
  g.computeVertexNormals();
  return g;
};

/** The hair mask over the skull for a style (1 hair, 0 skin), from the neutral point. */
export const hairMask = (sh: Shape, style: HairStyle, p: THREE.Vector3, bangs = false) => {
  const ax = Math.abs(p.x);
  const s = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  // the hairline on the forehead, rounding back at the temples
  const fore = sh.eyeY + (sh.kid ? 0.062 : 0.058) - 0.018 * (ax / 0.055) ** 2;
  const front = p.z > 0 ? s(fore - 0.007, fore + 0.006, p.y) : 1;
  // in front of the ears down to the sideburns, round the ears, and down the back to the nape
  const side = s(-0.01, 0.02, -p.z) + s(0.62, 0.8, ax / sh.w) * s(sh.eyeY - 0.004, sh.eyeY + 0.01, p.y);
  const nape = s(sh.chinY + 0.035, sh.chinY + 0.05, p.y);
  const ed = Math.hypot((ax - sh.w) / 0.016, (p.y - (sh.eyeY - 0.012)) / 0.03, (p.z + 0.008) / 0.022);
  const ear = sh.portrait ? s(0.85, 1.25, ed) : ed < 1 ? 0 : 1;
  let m = Math.max(front, Math.min(1, side)) * nape * ear;
  if (p.z > 0.02 && p.y < fore - 0.01) m = 0;
  if (bangs && p.z > 0) {
    // a fringe over the forehead, its lower edge a little ragged, ending above the brows
    const yb = sh.eyeY + 0.031 + 0.006 * (ax / 0.05) ** 2 + 0.0018 * Math.sin(p.x * 700) + 0.001 * Math.sin(p.x * 1900 + 1);
    const fr = s(yb - 0.002, yb + 0.004, p.y) * (1 - s(0.05, 0.062, ax));
    m = Math.max(m, fr);
  }
  if (style === "buzz") m *= 0.999;
  if (style === "combover") {
    // a horseshoe round the sides and the back, below the crown; bald on top (the strands are drawn apart)
    const low = s(sh.eyeY + 0.052, sh.eyeY + 0.04, p.y);
    const sideOrBack = Math.max(s(0.046, 0.058, ax), s(-0.005, -0.035, p.z));
    m *= low * sideOrBack;
  }
  return m;
};

const HairCap: React.FC<{ sh: Shape; person: Person; mat: THREE.MeshPhysicalMaterial }> = ({ sh, person, mat }) => {
  const geo = useMemo(() => {
    const st = person.hair.style;
    const fine = st === "fade" || st === "base" || st === "combover";
    const g = fine ? new THREE.SphereGeometry(1, 256, 128) : new THREE.SphereGeometry(1, 160, 80);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const d = new THREE.Vector3();
    const p = new THREE.Vector3();
    const keep: number[] = [];
    const mask = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      d.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      neutralPoint(sh, d, p);
      const m = hairMask(sh, st, p, !!person.hair.bangs);
      mask[i] = m;
      // thickness: thin at the hairline, fuller over the crown; curly is big
      const fringe = person.hair.bangs && d.z > 0.3 && p.y < sh.eyeY + 0.075 ? 0.0035 : 0;
      const crown = Math.max(0, d.y) * 0.6 + Math.max(0, -d.z) * 0.3 + fringe / 0.01;
      const t =
        (st === "buzz" || st === "fade"
          ? 0.0018
          : st === "base"
            ? 0.0012 + 0.0022 * crown
          : st === "curly"
            ? 0.006 + 0.016 * crown
            : 0.0028 + (0.007 + (sh.kid ? 0.003 : 0)) * crown) * (0.35 + 0.65 * m);
      // locks: ridges running down from the crown
      const az = Math.atan2(d.x, d.z);
      const lock =
        st === "buzz" || st === "base" || st === "fade"
          ? 0
          : 0.0007 *
            (0.5 + 0.35 * Math.sin(az * 31 + 2.5 * Math.sin(az * 7 + d.y * 3)) + 0.15 * Math.sin(az * 77 + d.y * 9)) *
            (0.3 + 0.7 * m);
      const tt = t + lock;
      pos.setXYZ(i, p.x + d.x * tt, p.y + d.y * tt, p.z + d.z * tt);
    }
    const idx = g.index!;
    for (let k = 0; k < idx.count; k += 3) {
      const a = idx.getX(k);
      const b = idx.getX(k + 1);
      const c = idx.getX(k + 2);
      if (Math.max(mask[a], mask[b], mask[c]) > (fine ? 0.001 : 0.02)) keep.push(a, b, c);
    }
    g.setIndex(keep);
    g.setAttribute("aMask", new THREE.BufferAttribute(mask, 1));
    g.computeVertexNormals();
    return g;
  }, [sh, person.hair.style, person.hair.bangs]);
  // (a fade: millimetre stubble, opaque over the scalp)
  const buzz = person.hair.style === "fade";
  const capMat = useMemo(() => {
    const m = mat.clone();
    m.alphaHash = true;
    const rider = !!mat.userData.ridesWithYou;
    if (buzz) {
      m.anisotropy = 0;
      m.sheen = 0.25;
      m.roughness = 0.75;
      m.bumpScale = 0.15;
    }
    m.onBeforeCompile = (s2) => {
      s2.vertexShader = s2.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aMask;\nvarying float vMask;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMask = aMask;");
      s2.fragmentShader = s2.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vMask;")
        .replace(
          "#include <map_fragment>",
          buzz
            ? `#include <map_fragment>
  // a buzz cut: millimetre stubble over the scalp, thinning out at the hairline
  vec2 cell = floor(vMapUv * vec2(1500.0, 760.0));
  float hn = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float m = clamp((vMask - 0.2) * 1.8, 0.0, 1.0);
  diffuseColor.rgb = mix(uScalp, diffuseColor.rgb, m * (0.42 + 0.4 * hn));
  diffuseColor.a = clamp((vMask - 0.02) * 2.0, 0.0, 1.0);`
            : "#include <map_fragment>\n  diffuseColor.a = clamp((vMask - 0.25) * 2.2, 0.0, 1.0) * (0.55 + 0.9 * texture2D(map, vMapUv * vec2(3.0, 1.0)).r);",
        );
      if (buzz) {
        s2.uniforms.uScalp = { value: new THREE.Color(person.skin.tone).multiplyScalar(0.92) };
        s2.fragmentShader = s2.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uScalp;");
      }
      if (rider) s2.fragmentShader = s2.fragmentShader.replace(/}\s*$/, "  gl_FragColor.a = 0.0;\n}");
    };
    m.customProgramCacheKey = () => `haircap-${rider}-${buzz}`;
    return m;
  }, [mat, buzz, person.skin.tone]);
  return <mesh geometry={geo} material={capMat} castShadow />;
};

/** An ear: a shell with a hollow bowl and a rolled rim, +x outward. */
const earGeometry = (sh: Shape) => {
  const ek = sh.earK ?? 1;
  const H = (sh.kid ? 0.024 : 0.029) * ek;
  const g = new THREE.SphereGeometry(1, 28, 20);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // the bowl: the outer face dished in, deepest just below the middle
    if (x > 0) x -= 0.75 * x * Math.exp(-((y + 0.15) ** 2) / 0.25 - (z * z) / 0.3);
    // the lobe narrows at the bottom, the top is rounder
    const w = y < 0 ? 1 - 0.3 * (-y) ** 2 : 1;
    pos.setXYZ(i, x * 0.0055 * Math.pow(ek, 0.6), y * (H / 2), z * 0.0095 * ek * w);
  }
  g.computeVertexNormals();
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 14; k++) {
    const a = -0.6 * Math.PI + (k / 14) * 1.45 * Math.PI;
    pts.push(new THREE.Vector3(0.0032 * Math.pow(ek, 0.6), Math.sin(a) * (H / 2) * 0.9, -Math.cos(a) * 0.0088 * ek));
  }
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0017 * Math.pow(ek, 0.7), 8, false);
  const merged = new THREE.BufferGeometry();
  const a = g.toNonIndexed();
  const b = rim.toNonIndexed();
  const cnt = a.attributes.position.count + b.attributes.position.count;
  const P = new Float32Array(cnt * 3);
  const N = new Float32Array(cnt * 3);
  P.set(a.attributes.position.array as Float32Array, 0);
  P.set(b.attributes.position.array as Float32Array, a.attributes.position.count * 3);
  N.set(a.attributes.normal.array as Float32Array, 0);
  N.set(b.attributes.normal.array as Float32Array, a.attributes.position.count * 3);
  merged.setAttribute("position", new THREE.BufferAttribute(P, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  return merged;
};

/** Points along a lid edge (upper or lower) on the lid sphere, from the inner corner to the outer. */
const lidCurve = (sh: Shape, c: THREE.Vector3, side: number, l: EyeLids, upper: boolean, n = 16, lift = 0, rScale = 1) => {
  const rl = sh.eyeR * LID_T * rScale;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -l.half * 0.86 + (1.86 * l.half * i) / n;
    const ed = lidEdges(l, t);
    const el = (upper ? ed.up : ed.lo) + (upper ? lift : -lift);
    const dir = new THREE.Vector3(Math.sin(t) * side * Math.cos(el), Math.sin(el), Math.cos(t) * Math.cos(el));
    pts.push(c.clone().addScaledVector(dir, rl));
  }
  return pts;
};

/** Strands as thin flat ribbons (lashes, brow hairs): each from a root, along a direction, curling. */
const strandRibbons = (
  roots: { p: THREE.Vector3; dir: THREE.Vector3; curl: THREE.Vector3; len: number; w: number; taper?: number }[],
  geo: THREE.BufferGeometry,
  seg = 4,
) => {
  const nv = roots.length * (seg + 1) * 2;
  let pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count !== nv) {
    pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    geo.setAttribute("position", pos);
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const uv = new Float32Array(nv * 2);
    for (let k = 0; k < roots.length; k++)
      for (let i = 0; i <= seg; i++) {
        const o = (k * (seg + 1) + i) * 2;
        const u0 = (k * 0.137) % 1;
        uv[o * 2] = u0;
        uv[o * 2 + 1] = i / seg;
        uv[o * 2 + 2] = u0 + 0.06;
        uv[o * 2 + 3] = i / seg;
      }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let k = 0; k < roots.length; k++)
      for (let i = 0; i < seg; i++) {
        const a = (k * (seg + 1) + i) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    geo.setIndex(idx);
  }
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
  const side = new THREE.Vector3();
  const P = new THREE.Vector3();
  const D = new THREE.Vector3();
  roots.forEach((r, k) => {
    P.copy(r.p);
    D.copy(r.dir);
    side.crossVectors(r.dir, r.curl).normalize();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const w = r.w * (1 - (r.taper ?? 0.85) * t);
      const o = (k * (seg + 1) + i) * 2;
      pos!.setXYZ(o, P.x - side.x * w, P.y - side.y * w, P.z - side.z * w);
      pos!.setXYZ(o + 1, P.x + side.x * w, P.y + side.y * w, P.z + side.z * w);
      const nn = new THREE.Vector3().crossVectors(side, D).normalize();
      nor.setXYZ(o, nn.x, nn.y, nn.z);
      nor.setXYZ(o + 1, nn.x, nn.y, nn.z);
      P.addScaledVector(D, r.len / seg);
      D.addScaledVector(r.curl, 1.2 / seg).normalize();
    }
  });
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
};

const hashF = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** The upper lid's shadow on the eyeball: a cap over its top, darkest at the lid, fading to clear below. */
const lidShadowCache: Record<string, THREE.BufferGeometry> = {};
const lidShadowGeo = (r: number) =>
  (lidShadowCache[r] ??= (() => {
    const g = new THREE.SphereGeometry(r * 1.012, 32, 16, 0, Math.PI * 2, 0, 1.45);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      // the cap's opening faces down the eye's front: the shadow is the band just under the lid's edge
      const y = p.getY(i) / (r * 1.012);
      const el = Math.asin(Math.max(-1, Math.min(1, y)));
      const a = Math.min(1, Math.max(0, (el - 0.12) / 0.36));
      col[i * 4 + 3] = 0.55 * a * a * (3 - 2 * a);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    return g;
  })());
const lidShadowMat = new THREE.MeshBasicMaterial({ color: "#1A0E0C", vertexColors: true, transparent: true, depthWrite: false });

/** One eye: the ball (it looks about), the lids' margins along the cut in the skin, lashes. */
const Eye: React.FC<{
  sh: Shape;
  side: number;
  person: Person;
  e: Expr;
  rider: boolean;
}> = ({ sh, side, person, e, rider }) => {
  const r = sh.eyeR;
  const ball = useMemo(() => eyeballGeo(r), [r]);
  const ballMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      map: irisMap(person.iris, person.skin.seed),
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    });
    return rider ? markRider(m) : m;
  }, [person.iris, person.skin.seed, rider]);
  const marginMat = useMemo(
    () => plain(new THREE.Color(person.skin.tone).lerp(new THREE.Color("#E0907F"), 0.25).getStyle(), 0.4, {}, true),
    [person.skin.tone],
  );
  const lashMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#1E1512", roughness: 0.6, side: THREE.DoubleSide });
    return rider ? markRider(m) : m;
  }, [rider]);
  const socketMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: sh.portrait ? new THREE.Color(person.skin.tone).multiplyScalar(0.42).lerp(new THREE.Color("#5A2A2A"), 0.3) : "#D69A92", roughness: 0.35, side: THREE.BackSide });
    return rider ? markRider(m) : m;
  }, [rider, sh.portrait, person.skin.tone]);
  const geos = useMemo(
    () => ({ up: new THREE.BufferGeometry(), lo: new THREE.BufferGeometry(), lash: new THREE.BufferGeometry(), lash2: new THREE.BufferGeometry(), liner: new THREE.BufferGeometry() }),
    [],
  );
  const c = eyeCentre(sh, side);
  const l = eyeLids(sh, e, side);
  const shutK = 1 - 0.16 * Math.min(1, Math.max(0, 1 - (l.up - l.lo) / 0.12));
  const thick = sh.kid ? 0.00075 : 0.0009;
  taperTube(lidCurve(sh, c, side, l, true, 20, 0.02), (t) => thick * (0.4 + 0.6 * Math.sin(Math.PI * t) ** 0.5), 24, 6, geos.up);
  taperTube(lidCurve(sh, c, side, l, false, 20, 0.02), (t) => thick * 0.8 * (0.4 + 0.6 * Math.sin(Math.PI * t) ** 0.5), 24, 6, geos.lo);
  // lashes: rooted on the upper margin's outer edge, out and up, curling; a few short ones below
  const mkLashes = (upper: boolean, count: number, len0: number) => {
    const edge = lidCurve(sh, c, side, l, upper, count - 1, upper ? 0.035 : 0.03, 1.02);
    return edge
      .map((p, i) => {
        const t = i / (count - 1);
        const k = Math.sin(Math.PI * (0.12 + 0.8 * t));
        if (k < 0.2) return null;
        const out = p.clone().sub(c).normalize();
        const up = new THREE.Vector3(0, upper ? 1 : -1, 0);
        const dir = out.clone().multiplyScalar(0.75).addScaledVector(up, 0.35).normalize();
        // toward the temple the lashes sweep outward
        dir.x += side * 0.25 * (t - 0.4);
        dir.normalize();
        return {
          p,
          dir,
          curl: up.clone().addScaledVector(out, -0.2).normalize(),
          len: len0 * k * (0.8 + 0.4 * hashF(i, side)),
          w: upper ? 0.00013 : 0.0001,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  };
  const lashLen = (sh.kid ? 0.0052 : 0.005) * (0.55 + 0.6 * person.lashes);
  strandRibbons(mkLashes(true, sh.portrait ? 70 : 44, lashLen), geos.lash);
  // portraits: the dark line the lashes' roots make along the upper lid
  if (sh.portrait) taperTube(lidCurve(sh, c, side, l, true, 20, 0.05, 1.03), (t) => 0.00055 * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6), 24, 5, geos.liner);
  strandRibbons(mkLashes(false, 18, lashLen * 0.38), geos.lash2, 3);
  return (
    <>
      <mesh geometry={ball} material={ballMat} position={c} rotation={[-e.eyePitch, e.eyeYaw, 0]} scale={shutK} receiveShadow />
      {sh.portrait ? (
        <mesh geometry={lidShadowGeo(r)} material={lidShadowMat} position={c} rotation={[0.42 - l.up, 0, 0]} renderOrder={2} />
      ) : null}
      {/* the socket behind the eye: pink in the corners where you see past the eyeball */}
      <mesh material={socketMat} position={c} scale={r * 1.25 * shutK}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh geometry={geos.up} material={marginMat} />
      <mesh geometry={geos.lo} material={marginMat} />
      {person.lashes > 0 ? <mesh geometry={geos.lash} material={lashMat} /> : null}
      {sh.portrait ? <mesh geometry={geos.liner} material={lashMat} /> : null}
      {person.lashes > 0 ? <mesh geometry={geos.lash2} material={lashMat} /> : null}
    </>
  );
};

export const Head: React.FC<{
  person: Person;
  e: Expr;
  hi?: boolean;
  /** attached to the moving train (sharp under the motion blur) */
  rider?: boolean;
  /** pigtail/ponytail chains in head space (from the dynamics), root first */
  chains?: THREE.Vector3[][];
  /** wind strength 0..1 (flattens bangs, flutters) */
  wind?: number;
  /** a popped bubble's gum stuck over the lower face (0..1) */
  gum?: number;
  /** hair without the anisotropic highlight (a crowd in a low sun: grazing it, that lobe blows up into
   * pinpoints the bloom turns into flares) */
  plainHair?: boolean;
}> = ({ person, e, hi = false, rider = true, chains, gum = 0, plainHair = false }) => {
  const sh = person.shape;
  const base = baseFor(sh, hi);
  const geo = useMemo(() => {
    const g = base.geo.clone();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(base.neutral), 3));
    return g;
  }, [base]);
  const skin = useMemo(() => skinMaterial(sh, person.skin, rider, person.gloss ?? 0), [sh, person.skin, rider, person.gloss]);
  // ---- the skin for this expression
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(base.neutral[i * 3], base.neutral[i * 3 + 1], base.neutral[i * 3 + 2]);
    deform(sh, e, p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // ---- lips: the upper and lower lip as flattened tubes along the mouth, riding the skin; at rest they
  // meet at the lip line, and the jaw pulls the lower one away
  const ms = mouthShape(sh, e);
  const r0 = ((sh.kid ? 0.0021 : 0.0024) + 0.0007 * sh.lipFull) * (sh.lipK ?? 1);
  const N = 17;
  const upPts: THREE.Vector3[] = [];
  const loPts: THREE.Vector3[] = [];
  const upR: number[] = [];
  const loR: number[] = [];
  const upY: number[] = [];
  const loY: number[] = [];
  for (let i = 0; i < N; i++) {
    const k = (i / (N - 1)) * 2 - 1;
    const bow = 1 - k * k;
    const x0 = k * (sh.mouthW / 2);
    const ak = Math.abs(k);
    const ru = sh.portrait
      ? r0 * (0.12 + 0.88 * Math.pow(Math.max(0, 1 - Math.pow(ak, 1.7)), 0.85)) * (1 - 0.12 * Math.exp(-((k / 0.1) ** 2))) * (1 + 0.3 * e.pucker)
      : r0 * (0.35 + 0.65 * Math.pow(Math.max(0, bow), 0.5)) * (1 + 0.3 * e.pucker);
    const rl = sh.portrait
      ? r0 * 1.32 * (0.12 + 0.88 * Math.pow(Math.max(0, 1 - Math.pow(ak, 1.9)), 0.7)) * (1 + 0.3 * e.pucker)
      : r0 * 1.18 * (0.35 + 0.65 * Math.pow(Math.max(0, bow), 0.45)) * (1 + 0.3 * e.pucker);
    // a cupid's bow on the upper lip
    const cupid = sh.portrait
      ? 0.001 * Math.exp(-(((ak - 0.24) / 0.11) ** 2)) - 0.0005 * Math.exp(-((k / 0.07) ** 2))
      : 0.0006 * Math.exp(-(((Math.abs(k) - 0.28) / 0.12) ** 2)) - 0.0004 * Math.exp(-((k / 0.08) ** 2));
    const pu = frontZ(sh, x0, sh.mouthY + ru * 0.72 + cupid).p;
    deform(sh, e, pu);
    pu.y += ms.upper * Math.pow(Math.max(0, bow), 0.6);
    const pl = frontZ(sh, x0, sh.mouthY - rl * 0.72).p;
    deform(sh, e, pl);
    upPts.push(pu.clone().add(new THREE.Vector3(0, 0, -ru * (sh.portrait ? 0.42 : 0.3))));
    loPts.push(pl.clone().add(new THREE.Vector3(0, 0, -rl * (sh.portrait ? 0.4 : 0.3))));
    upR.push(ru);
    loR.push(rl);
  }
  // the hole between them (in the shader): their inner edges, resampled at 9 x positions
  const x0 = upPts[0].x;
  const x1 = upPts[N - 1].x;
  for (let j = 0; j < 9; j++) {
    const x = x0 + ((x1 - x0) * j) / 8;
    const f = ((x - x0) / (x1 - x0)) * (N - 1);
    const i = Math.min(N - 2, Math.floor(f));
    const k = f - i;
    upY.push(THREE.MathUtils.lerp(upPts[i].y - upR[i] * 0.9, upPts[i + 1].y - upR[i + 1] * 0.9, k));
    loY.push(THREE.MathUtils.lerp(loPts[i].y + loR[i] * 0.9, loPts[i + 1].y + loR[i + 1] * 0.9, k));
  }
  const mu = skin.userData.mouth;
  [-1, 1].forEach((side, k) => {
    const l = eyeLids(sh, e, side);
    mu.uEyeC.value[k].copy(eyeCentre(sh, side));
    mu.uEyeL.value[k].set(l.up, l.lo, l.half, l.tilt);
  });
  mu.uLipX.value.set(x0, x1);
  mu.uUp.value = upY;
  mu.uLo.value = loY;
  mu.uGum.value = gum;
  if (gum > 0) mu.uGumMap.value = gumMap(sh, person.skin.seed);
  const lipGeoU = useMemo(() => new THREE.BufferGeometry(), []);
  const lipGeoL = useMemo(() => new THREE.BufferGeometry(), []);
  lipTube(upPts, upR, sh.portrait ? 0.4 : 0.5, lipGeoU, sh.portrait ? 1 : 0);
  lipTube(loPts, loR, sh.portrait ? 0.46 : 0.56, lipGeoL, sh.portrait ? -1 : 0);
  const lipCol = useMemo(() => new THREE.Color(person.skin.tone).lerp(new THREE.Color(person.skin.lip), sh.portrait ? 0.8 : 0.55), [person.skin.lip, person.skin.tone, sh.portrait]);
  const lipMat = useMemo(
    () =>
      plain(lipCol.getStyle(), sh.portrait ? 0.46 : 0.38, { sheen: sh.portrait ? 0.05 : 0.15, sheenColor: new THREE.Color("#FFC0B0"), clearcoat: sh.portrait ? 0.15 : 0.25, clearcoatRoughness: 0.3, vertexColors: !!sh.portrait }, true),
    [lipCol, sh.portrait],
  );
  // under the gum the lips are pink film too
  (lipMat as THREE.MeshPhysicalMaterial).color.copy(lipCol).lerp(GUM_COL, 0.9 * gum);
  (lipMat as THREE.MeshPhysicalMaterial).roughness = 0.38 - 0.2 * gum;
  // the throat: a dark ball inside the head, so nothing inside it (the neck, a collar) shows through the mouth
  const throatMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#22080A" });
    return rider ? markRider(m) : m;
  }, [rider]);
  const hs = sh.w / 0.076;
  const toothMat = useMemo(() => plain("#F2EDE0", 0.25, { clearcoat: 0.5 }), []);
  const braceMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#C9CDD4", metalness: 1, roughness: 0.22 }), []);
  // the archwire through the upper brackets
  const braceWire = useMemo(() => {
    if (!person.braces) return null;
    const R = sh.mouthW * 0.5;
    const mz = frontZ(sh, 0, sh.mouthY).p.z;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const ang = (i / 12 - 0.5) * 2 * (sh.mouthW * 0.36) / R;
      pts.push(new THREE.Vector3(Math.sin(ang) * R * 0.92 + Math.sin(ang) * 0.0033, sh.mouthY + 0.0034, mz - 0.0075 + Math.cos(ang) * R * 0.55 - R * 0.55 + Math.cos(ang) * 0.0033));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.00032, 5, false);
  }, [person.braces, sh]);
  const tongueMat = useMemo(() => plain("#C25A5E", 0.4, { sheen: 0.4, sheenColor: new THREE.Color("#FF9A9A") }), []);
  const mouthZ = frontZ(sh, 0, sh.mouthY).p.z;
  const jp = jawPivot(sh);
  const ja = jawAngle(e);
  // teeth: an arc of rounded boxes behind each lip
  const teeth = useMemo(() => {
    const out: { x: number; z: number; ry: number; w: number; h: number; up: boolean; key: string }[] = [];
    const R = sh.mouthW * 0.5;
    const widths = sh.kid ? [0.0062, 0.0052, 0.0048, 0.0052] : [0.0082, 0.0064, 0.0056, 0.0062];
    for (const up of [true, false]) {
      let a = 0;
      for (let k = 0; k < 4; k++) {
        const w = widths[k] * (up ? 1 : 0.82);
        for (const sgn of [-1, 1]) {
          if (up && k === 0 && sgn === -1 && person.gap) continue;
          const ang = sgn * (a + w / 2 / R);
          out.push({
            x: Math.sin(ang) * R * 0.92,
            z: Math.cos(ang) * R * 0.55 - R * 0.55,
            ry: ang,
            w,
            h: (up ? 0.0095 : 0.0075) * (sh.kid ? 0.82 : 1) * (k === 2 ? 1.05 : 1),
            up,
            key: `${up}${k}${sgn}`,
          });
        }
        a += w / R;
      }
    }
    return out;
  }, [sh, person.gap]);
  const toothGeo = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.5, 0.6, 4, 8);
    return g;
  }, []);
  // hair
  const hairMat = useMemo(() => {
    const st = strandMaps();
    const m = new THREE.MeshPhysicalMaterial({
      color: person.hair.color,
      map: st.map,
      bumpMap: st.bump,
      bumpScale: 0.6,
      roughness: 0.42,
      sheen: 0.8,
      sheenColor: new THREE.Color(person.hair.color).lerp(new THREE.Color("#FFE6C0"), 0.5),
      sheenRoughness: 0.35,
      anisotropy: plainHair ? 0 : 0.7,
      anisotropyRotation: Math.PI / 2,
    });
    return rider ? markRider(m) : m;
  }, [person.hair.color, rider, plainHair]);
  // the pigtails: the same hair, but a thin tube is nearly all grazing angles, where sheen would grey it out
  const chainMat = useMemo(() => {
    const st = strandMaps();
    const m = new THREE.MeshPhysicalMaterial({
      color: person.hair.color,
      map: st.map,
      bumpMap: st.bump,
      bumpScale: 0.4,
      roughness: 0.55,
    });
    return rider ? markRider(m) : m;
  }, [person.hair.color, rider]);
  const browMat = useMemo(() => plain(person.brow, 0.75, { side: THREE.DoubleSide }), [person.brow]);
  const chainGeos = useMemo(() => (chains ?? []).map(() => new THREE.BufferGeometry()), [chains?.length]);
  const style = person.hair.style;
  const chainR = (t: number) =>
    style === "pigtails"
      ? 0.0165 * (0.75 + 0.5 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5)) * (1 - 0.82 * t ** 1.5)
      : 0.02 * (1 - 0.75 * t ** 1.3);
  (chains ?? []).forEach((pts, i) => {
    if (pts.length >= 3 && chainGeos[i]) taperTube(pts, chainR, 30, 12, chainGeos[i]);
  });
  // brows: short hairs lying on the skin along the brow, the inner ones pointing up, the rest outward
  const browGeos = useMemo(() => [new THREE.BufferGeometry(), new THREE.BufferGeometry()], []);
  [-1, 1].forEach((side, bi) => {
    const roots: { p: THREE.Vector3; dir: THREE.Vector3; curl: THREE.Vector3; len: number; w: number }[] = [];
    const n = sh.kid ? 150 : sh.portrait ? 340 : 190;
    for (let i = 0; i < n; i++) {
      const t = hashF(i, 3 + side);
      const v = hashF(i, 9 + side) - 0.5;
      const x = side * (sh.eyeX * 0.38 + t * sh.eyeX * 1.2);
      const arch = 0.0055 * Math.sin(Math.PI * Math.min(1, t * 1.2));
      const thick = (sh.kid ? 0.0042 : 0.0058) * (1 - 0.6 * t);
      const y = sh.eyeY + 0.0195 + arch - 0.0035 * t + v * thick;
      const f = frontZ(sh, x, y);
      const q = f.p.clone();
      deform(sh, e, q);
      const nrm = f.dir.clone();
      q.addScaledVector(nrm, 0.0006);
      // along the skin: inner hairs up, the rest toward the temple and a little down at the tail
      const along = new THREE.Vector3(side * (0.35 + 0.9 * t), 0.9 - 1.1 * t, 0);
      along.addScaledVector(nrm, -along.dot(nrm)).normalize();
      roots.push({ p: q, dir: along, curl: nrm.clone().negate(), len: 0.0032 + 0.0016 * hashF(i, 5), w: sh.kid ? 0.00016 : sh.portrait ? 0.00027 : 0.0002 });
    }
    strandRibbons(roots, browGeos[bi], 3);
  });
  const earGeo = useMemo(() => earGeometry(sh), [sh]);
  const earMat = useMemo(
    () =>
      plain(
        new THREE.Color(person.skin.tone).lerp(new THREE.Color("#E07F6E"), 0.15).getStyle(),
        0.55,
        { sheen: 0.3, sheenColor: new THREE.Color("#FF9C86") },
        true,
      ),
    [person.skin.tone],
  );
  return (
    <group>
      <mesh geometry={geo} material={skin} castShadow receiveShadow />
      {/* the mouth: teeth, tongue (the lower teeth and tongue ride the jaw); its dark is the inside of the head */}
      <mesh material={throatMat} position={[0, sh.mouthY + 0.02 * hs, -0.004 * hs]} scale={[0.044 * hs, 0.04 * hs, 0.046 * hs]}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      {teeth
        .filter((t) => t.up)
        .map((t) => (
          <mesh
            key={t.key}
            geometry={toothGeo}
            material={toothMat}
            position={[t.x, sh.mouthY + 0.0012 + ms.upper * 0.4, mouthZ - 0.0075 + t.z]}
            rotation={[0, t.ry, 0]}
            scale={[t.w, t.h, 0.0045]}
          />
        ))}
      <group position={[0, 0.0017 * (e.jut ?? 0), 0.011 * (e.jut ?? 0)]}>
      <group position={jp} rotation={[ja, 0, 0]}>
        <group position={jp.clone().negate()}>
          {teeth
            .filter((t) => !t.up)
            .map((t) => (
              <mesh
                key={t.key}
                geometry={toothGeo}
                material={toothMat}
                position={[t.x * 0.9, sh.mouthY - 0.0042, mouthZ - 0.0105 + t.z]}
                rotation={[0, t.ry, 0]}
                scale={[t.w, t.h, 0.004]}
              />
            ))}
          <mesh
            material={tongueMat}
            position={[0.007 * (e.tongue ?? 0), sh.mouthY - 0.0115 + 0.004 * (e.tongue ?? 0), mouthZ - 0.026 + 0.03 * (e.tongue ?? 0)]}
            scale={[sh.mouthW * (0.36 - 0.06 * (e.tongue ?? 0)), 0.006 + 0.002 * (e.tongue ?? 0), 0.017 + 0.006 * (e.tongue ?? 0)]}
          >
            <sphereGeometry args={[1, 18, 12]} />
          </mesh>
          {person.braces
            ? teeth
                .filter((t) => !t.up && Math.abs(t.x) < sh.mouthW * 0.36)
                .map((t) => (
                  <mesh
                    key={`bl${t.key}`}
                    material={braceMat}
                    position={[t.x * 0.9 + Math.sin(t.ry) * 0.0024, sh.mouthY - 0.0062, mouthZ - 0.0105 + t.z + Math.cos(t.ry) * 0.0024]}
                    rotation={[0, t.ry, 0]}
                  >
                    <boxGeometry args={[0.0026, 0.0024, 0.0012]} />
                  </mesh>
                ))
            : null}
        </group>
      </group>
      </group>
      {person.braces
        ? teeth
            .filter((t) => t.up && Math.abs(t.x) < sh.mouthW * 0.36)
            .map((t) => (
              <mesh
                key={`bu${t.key}`}
                material={braceMat}
                position={[t.x + Math.sin(t.ry) * 0.0026, sh.mouthY + 0.0034 + ms.upper * 0.4, mouthZ - 0.0075 + t.z + Math.cos(t.ry) * 0.0026]}
                rotation={[0, t.ry, 0]}
              >
                <boxGeometry args={[0.0028, 0.0026, 0.0013]} />
              </mesh>
            ))
        : null}
      {person.braces && braceWire ? <mesh material={braceMat} geometry={braceWire} position={[0, ms.upper * 0.4, 0]} /> : null}
      <mesh geometry={lipGeoU} material={lipMat} receiveShadow />
      <mesh geometry={lipGeoL} material={lipMat} receiveShadow />
      {[-1, 1].map((side) => (
        <Eye key={side} sh={sh} side={side} person={person} e={e} rider={rider} />
      ))}
      <mesh geometry={browGeos[0]} material={browMat} />
      <mesh geometry={browGeos[1]} material={browMat} />
      {[-1, 1].map((side) => (
        <mesh
          key={`ear${side}`}
          geometry={earGeo}
          material={earMat}
          position={[side * (sh.w * 0.955), sh.eyeY - 0.014 - 0.005 * ((sh.earK ?? 1) - 1), -0.014]}
          rotation={[0.1, side * -0.42, side * 0.06]}
          scale={[side, 1, 1]}
        />
      ))}
      <HairCap sh={sh} person={person} mat={hairMat} />
      {chainGeos.map((g, i) => (
        <mesh key={`ch${i}`} geometry={g} material={chainMat} castShadow />
      ))}
      {(chains ?? []).map((pts, i) =>
        pts.length && person.hair.tie ? (
          <mesh key={`tie${i}`} position={pts[0]} material={plain(person.hair.tie, 0.6)}>
            <torusGeometry args={[0.014, 0.006, 8, 18]} />
          </mesh>
        ) : null,
      )}
    </group>
  );
};
