import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { neutralPoint, type Shape } from "../coaster/face/sculpt";
import { hairMask } from "../coaster/face/Head";

/**
 * Real haircuts for close-ups: hair cards (thin ribbons with strands painted on them) grown over the scalp
 * along a comb field, kept off the skin by the skull's own shape, cut at a line where the cut ends, lit with a
 * strand highlight (Kajiya-Kay) along their length. In head space (sculpt.ts): origin between the ears at eye
 * level, +z out of the face, +y up, +x the person's left.
 *
 *  crop     a textured crop: short messy tufts pushed forward to a choppy fringe, the sides faded
 *  twists   sponge twists standing up on top of a fade
 *  curtain  a middle part, the fringe falling to the brows and swept apart like curtains
 *  mushroom the bowl: everything from the crown down and out, cut straight across the brows
 *  flow     swept back off the forehead, over the ears, flicking out at the nape (and it can flip forward)
 *  pony     pulled back into a ponytail, a few strands loose at the temples
 *  bun      pulled up into a bun, a pencil through it
 *  combover a horseshoe round the sides, long strands from a low part laid across the bald top (they lift)
 *  short    a plain short cut (the kids in the background)
 */

export type Cut = "crop" | "twists" | "curtain" | "mushroom" | "flow" | "pony" | "bun" | "combover" | "short";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/* ------------------------------------------------------------------ */
/* The skull: its radius along any direction from the head's origin       */
/* ------------------------------------------------------------------ */

const NA = 128;
const NE = 72;
const tables = new WeakMap<Shape, Float32Array>();
const skullTable = (sh: Shape) => {
  let t = tables.get(sh);
  if (t) return t;
  t = new Float32Array(NA * NE);
  const v = V();
  const u = V();
  const P = V();
  for (let ie = 0; ie < NE; ie++) {
    const el = -Math.PI / 2 + ((ie + 0.5) / NE) * Math.PI;
    for (let ia = 0; ia < NA; ia++) {
      const az = -Math.PI + ((ia + 0.5) / NA) * Math.PI * 2;
      v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      u.copy(v);
      // find the sphere direction whose skin point lies along v
      for (let it = 0; it < 7; it++) {
        neutralPoint(sh, u, P);
        P.normalize();
        u.add(v.clone().sub(P)).normalize();
      }
      t[ie * NA + ia] = neutralPoint(sh, u, P).length();
    }
  }
  tables.set(sh, t);
  return t;
};

/** The skin's distance from the origin along the direction d (normalised). */
export const skullR = (sh: Shape, d: THREE.Vector3) => {
  const t = skullTable(sh);
  const az = Math.atan2(d.x, d.z);
  const el = Math.asin(Math.max(-1, Math.min(1, d.y)));
  const fa = ((az + Math.PI) / (Math.PI * 2)) * NA - 0.5;
  const fe = Math.max(0, Math.min(NE - 1.001, ((el + Math.PI / 2) / Math.PI) * NE - 0.5));
  const ia = Math.floor(fa);
  const ie = Math.floor(fe);
  const ka = fa - ia;
  const ke = fe - ie;
  const a0 = ((ia % NA) + NA) % NA;
  const a1 = (a0 + 1) % NA;
  const r00 = t[ie * NA + a0];
  const r01 = t[ie * NA + a1];
  const r10 = t[(ie + 1) * NA + a0];
  const r11 = t[(ie + 1) * NA + a1];
  return (r00 * (1 - ka) + r01 * ka) * (1 - ke) + (r10 * (1 - ka) + r11 * ka) * ke;
};

/** Keep p at least off above the skin (and off the neck below the skull). */
const pushOut = (sh: Shape, p: THREE.Vector3, off: number) => {
  const r = p.length();
  const d = p.clone().divideScalar(r);
  const rs = skullR(sh, d) + off;
  if (r < rs) p.copy(d.multiplyScalar(rs));
  // the neck: a column below the skull, a little behind the ears
  if (p.y < sh.chinY + 0.02) {
    const c = V(0, p.y, -0.012);
    const q = V(p.x, 0, p.z - c.z);
    const rn = 0.056 + off;
    const l = q.length();
    if (l < rn) {
      q.multiplyScalar(rn / Math.max(1e-5, l));
      p.x = q.x;
      p.z = q.z + c.z;
    }
  }
  return p;
};

/** Put p on the skin, off above it (along its direction from the origin). */
const toSkin = (sh: Shape, p: THREE.Vector3, off: number) => {
  const d = p.clone().normalize();
  return p.copy(d.multiplyScalar(skullR(sh, d) + off));
};

/** The skin's outward normal at a point near it (from the radius table's slope). */
const normalAt = (sh: Shape, p: THREE.Vector3) => {
  const d = p.clone().normalize();
  const e = 0.02;
  const t1 = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const a = t1.clone().addScaledVector(d, -t1.dot(d)).normalize();
  const b = V().crossVectors(d, a);
  const r0 = skullR(sh, d);
  const ra = skullR(sh, d.clone().addScaledVector(a, e).normalize());
  const rb = skullR(sh, d.clone().addScaledVector(b, e).normalize());
  // the surface rises by dr over e*r0 along each tangent: tilt the radial normal against it
  return d
    .clone()
    .addScaledVector(a, -(ra - r0) / (e * r0))
    .addScaledVector(b, -(rb - r0) / (e * r0))
    .normalize();
};

/** Evenly spread directions over the sphere (a Fibonacci lattice). */
const fib = (n: number, i: number, out = V()) => {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const a = i * 2.399963229728653;
  return out.set(Math.sin(a) * r, y, Math.cos(a) * r);
};

type Root = { p: THREE.Vector3; n: THREE.Vector3; id: number };
/** Roots on the scalp: n spread over the sphere, kept where the cut's mask says there's hair. */
const scalpRoots = (sh: Shape, n: number, keep: (p: THREE.Vector3, n: THREE.Vector3) => boolean, mask: "base" | "combover" = "base") => {
  const out: Root[] = [];
  const d = V();
  const P = V();
  for (let i = 0; i < n; i++) {
    fib(n, i, d);
    // jitter so the lattice doesn't show
    d.x += (hash(i * 3.1) - 0.5) * 0.02;
    d.y += (hash(i * 5.7) - 0.5) * 0.02;
    d.z += (hash(i * 7.3) - 0.5) * 0.02;
    d.normalize();
    neutralPoint(sh, d, P);
    if (hairMask(sh, mask, P) < 0.6) continue;
    const nn = normalAt(sh, P);
    if (!keep(P, nn)) continue;
    out.push({ p: P.clone(), n: nn, id: i });
  }
  return out;
};

const tangent = (v: THREE.Vector3, n: THREE.Vector3) => {
  const t = v.clone().addScaledVector(n, -v.dot(n));
  return t.lengthSq() < 1e-10 ? V(0, -1, 0).addScaledVector(n, n.y).normalize() : t.normalize();
};

/* ------------------------------------------------------------------ */
/* Growing a strand                                                       */
/* ------------------------------------------------------------------ */

type Grow = {
  len: number;
  /** points along it */
  M?: number;
  /** height off the skin at the root, and how far it lifts toward the tip (volume) */
  off0?: number;
  off1?: number;
  /** where it wants to go at p (a fraction s of the way along), and how hard it turns toward it */
  field: (p: THREE.Vector3, s: number, d: THREE.Vector3) => THREE.Vector3;
  bend?: number;
  gravity?: number;
  /** stop here (a cut line) */
  stop?: (p: THREE.Vector3, s: number) => boolean;
  /** stays on the skin (no lift) for the first part */
  hug?: number;
};

const grow = (sh: Shape, r: Root, g: Grow) => {
  const M = g.M ?? 10;
  const off0 = g.off0 ?? 0.0018;
  const off1 = g.off1 ?? 0.006;
  const pts: THREE.Vector3[] = [];
  const p = r.p.clone().addScaledVector(r.n, off0);
  let d = tangent(g.field(p, 0, r.n), r.n);
  pts.push(p.clone());
  const step = g.len / M;
  for (let j = 1; j <= M; j++) {
    const s = j / M;
    const want = g.field(p, s, d);
    d = d.clone().lerp(want, g.bend ?? 0.35);
    if (g.gravity) d.y -= g.gravity * s;
    d.normalize();
    const prev = p.clone();
    p.addScaledVector(d, step);
    const lift = off0 + (off1 - off0) * smooth(g.hug ?? 0, 1, s);
    pushOut(sh, p, lift);
    // keep the step length after the push (no bunching against the skull)
    const dv = p.clone().sub(prev);
    if (dv.lengthSq() > 1e-12) {
      d = dv.normalize();
      p.copy(prev).addScaledVector(d, step);
      pushOut(sh, p, lift);
    }
    if (g.stop && g.stop(p, s)) {
      if (pts.length >= 2) break;
    }
    pts.push(p.clone());
  }
  return pts;
};

/* ------------------------------------------------------------------ */
/* Cards: ribbons along strands, with the strand's direction for the highlight                    */
/* ------------------------------------------------------------------ */

type Card = { pts: THREE.Vector3[]; w: number; shade: number; variant: number; flat?: THREE.Vector3[]; seed?: number };

/** The flow in the wind and in the flip, bent from its still strands (cheap: no regrowing). */
const flowMove = (sh: Shape, base: Card[], wind: number, flip: number, t: number): Card[] => {
  const crown = V(0, sh.eyeY + sh.h * 0.92, -0.035);
  const flipA = 1.5 * Math.PI * smooth(0, 1, flip);
  const axis = V(1, 0, 0);
  return base.map((c) => {
    const n = c.pts.length;
    const pts = c.pts.map((p0, j) => {
      const s = j / (n - 1);
      const q = p0.clone();
      if (wind > 0) {
        // the tips stream back and up, fluttering
        q.x += 0.005 * wind * Math.sin(t * 31 + (c.seed ?? 0) + s * 6) * s;
        q.y += 0.012 * wind * s * s;
        q.z -= 0.03 * wind * s * s;
      }
      if (flip > 0) {
        // each point swings round the crown (over the top), the roots staying put; the ends hang over the face
        const rel = q.sub(crown);
        q.copy(crown).add(rel.applyAxisAngle(axis, flipA * smooth(0, 0.35, s)));
        q.y -= 0.035 * smooth(0.5, 1, flip) * s * s;
        q.z += 0.012 * smooth(0.5, 1, flip) * s;
      }
      return j === 0 ? q : pushOut(sh, q, 0.004 + 0.012 * s);
    });
    return { ...c, pts, flat: pts.map((p) => p.clone().normalize()) };
  });
};

const buildCards = (sh: Shape, cards: Card[], geo: THREE.BufferGeometry) => {
  const pos: number[] = [];
  const nor: number[] = [];
  const tan: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let base = 0;
  const side = V();
  for (const c of cards) {
    const n = c.pts.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = c.pts[Math.max(0, i - 1)];
      const b = c.pts[Math.min(n - 1, i + 1)];
      const T = b.clone().sub(a).normalize();
      // lie flat on the head: the card's face looks out from the skull
      const N = c.flat ? c.flat[i] : normalAt(sh, c.pts[i]);
      side.crossVectors(T, N).normalize();
      const nn = V().crossVectors(side, T).normalize();
      const w = c.w * (1 - 0.55 * Math.pow(t, 1.5));
      const p = c.pts[i];
      pos.push(p.x + side.x * w * 0.5, p.y + side.y * w * 0.5, p.z + side.z * w * 0.5, p.x - side.x * w * 0.5, p.y - side.y * w * 0.5, p.z - side.z * w * 0.5);
      nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      tan.push(T.x, T.y, T.z, T.x, T.y, T.z);
      const u0 = c.variant * 0.25;
      uv.push(u0 + 0.005, t, u0 + 0.245, t);
      // darker toward the roots (the hair underneath), each card a little different
      const k = c.shade * (0.5 + 0.5 * smooth(0, 0.45, t));
      col.push(k, k, k, k, k, k);
      if (i < n - 1) idx.push(base + 2 * i, base + 2 * i + 1, base + 2 * i + 2, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2);
    }
    base += 2 * n;
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
};

/** Tubes along strands (twists), with the same attributes. */
const buildTubes = (tubes: { pts: THREE.Vector3[]; r: number; shade: number; twist: number }[], geo: THREE.BufferGeometry) => {
  const pos: number[] = [];
  const nor: number[] = [];
  const tan: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const RAD = 7;
  let base = 0;
  for (const tb of tubes) {
    const n = tb.pts.length;
    if (n < 2) continue;
    let ref = V(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const T = tb.pts[Math.min(n - 1, i + 1)].clone().sub(tb.pts[Math.max(0, i - 1)]).normalize();
      const A = V().crossVectors(T, ref).normalize();
      if (A.lengthSq() < 0.5) A.set(1, 0, 0);
      const B = V().crossVectors(T, A).normalize();
      ref = B.clone();
      // the twist: a two-strand rope, a bump that spirals along it; rounded off at the tip
      const tip = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.82) / 0.18, 2)));
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const rope = 1 + 0.22 * Math.cos(2 * a - t * tb.twist);
        const r = tb.r * (1 - 0.3 * t) * rope * (i === n - 1 ? 0.15 : tip);
        const nv = A.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        const p = tb.pts[i].clone().addScaledVector(nv, r);
        pos.push(p.x, p.y, p.z);
        nor.push(nv.x, nv.y, nv.z);
        tan.push(T.x, T.y, T.z);
        uv.push(j / RAD, t);
        const k = tb.shade * (0.55 + 0.45 * smooth(0, 0.5, t)) * (0.85 + 0.15 * Math.cos(2 * a - t * tb.twist));
        col.push(k, k, k);
      }
      if (i < n - 1)
        for (let j = 0; j < RAD; j++) {
          const a = base + i * (RAD + 1) + j;
          const b = a + RAD + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    base += n * (RAD + 1);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
};

/* ------------------------------------------------------------------ */
/* The material: strands on a card, a highlight along them                */
/* ------------------------------------------------------------------ */

const texCache: Record<string, THREE.Texture> = {};
/** Four card variants side by side: strands from the root (v = 0) toward the tip, ending at different
 * lengths, sparser at the card's edges. R: coverage (alpha), G: brightness. */
const cardTexture = () =>
  (texCache.cards ??= (() => {
    const W = 512;
    const H = 512;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    for (let vtt = 0; vtt < 4; vtt++) {
      const x0 = vtt * 128;
      for (let i = 0; i < 46; i++) {
        const u = hash(vtt * 100 + i * 1.37);
        // denser in the middle of the card
        const x = x0 + 8 + 112 * (0.5 + (u - 0.5) * (0.6 + 0.4 * hash(i * 2.9 + vtt)));
        const len = H * (0.62 + 0.38 * Math.pow(hash(vtt * 31 + i * 4.1), 0.6));
        const wob = (hash(i * 6.1 + vtt) - 0.5) * 10;
        const br = Math.round(150 + 105 * hash(i * 9.7 + vtt * 3));
        g.strokeStyle = `rgb(255,${br},0)`;
        g.lineWidth = 2.2 + 2.6 * hash(i * 1.9 + vtt * 7);
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x, H);
        g.bezierCurveTo(x + wob * 0.3, H - len * 0.35, x + wob, H - len * 0.7, x + wob * 1.6, H - len);
        g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    t.flipY = true;
    return t;
  })());

const KK_FRAG = `
  {
    // Kajiya-Kay: light glancing along the strands; a sharp white lobe and a broader one in the hair's colour
    vec3 Th = normalize(vTanV);
    vec3 Hh = normalize(directLight.direction + geometryViewDir);
    float th1 = dot(Th, Hh);
    float s1 = pow(max(0.0, 1.0 - th1 * th1), 0.5 * uKK.x);
    vec3 H2 = normalize(Hh - geometryNormal * 0.18);
    float th2 = dot(Th, H2);
    float s2 = pow(max(0.0, 1.0 - th2 * th2), 0.5 * uKK.y);
    float vis = smoothstep(-0.25, 0.35, dot(geometryNormal, directLight.direction));
    reflectedLight.directSpecular += directLight.color * vis * (uKK.z * s1 * mix(vec3(1.0), uTint, 0.35) + uKK.w * s2 * uTint);
  }
`;

const matCache: Record<string, THREE.MeshStandardMaterial> = {};
export const hairCardMaterial = (color: string, solid = false) =>
  (matCache[`${color}${solid}`] ??= (() => {
    const tex = cardTexture();
    const m = new THREE.MeshStandardMaterial({
      color,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
      alphaMap: solid ? null : tex,
      alphaTest: solid ? 0 : 0.42,
    });
    const tint = new THREE.Color(color).lerp(new THREE.Color("#FFE2B8"), 0.25);
    m.onBeforeCompile = (s) => {
      s.uniforms.uKK = { value: new THREE.Vector4(solid ? 60 : 140, 24, solid ? 0.06 : 0.12, solid ? 0.2 : 0.3) };
      s.uniforms.uTint = { value: tint };
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aTan;\nvarying vec3 vTanV;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTanV = normalize((modelViewMatrix * vec4(aTan, 0.0)).xyz);");
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vTanV;\nuniform vec4 uKK;\nuniform vec3 uTint;")
        .replace(
          "#include <lights_physical_pars_fragment>",
          THREE.ShaderChunk.lights_physical_pars_fragment.replace(
            "reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;",
            "reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;\n" + KK_FRAG,
          ),
        );
      if (!solid)
        // the strands' brightness from the texture's green
        s.fragmentShader = s.fragmentShader.replace(
          "#include <alphamap_fragment>",
          "#include <alphamap_fragment>\n  diffuseColor.rgb *= 0.7 + 0.45 * texture2D(alphaMap, vAlphaMapUv).g;",
        );
    };
    m.customProgramCacheKey = () => `haircard-${solid}`;
    return m;
  })());

/* ------------------------------------------------------------------ */
/* The cuts                                                               */
/* ------------------------------------------------------------------ */

export type HairParams = {
  /** wind from the front (0..1): the flow and the comb-over blow back */
  wind?: number;
  /** the flow flipped forward over the face (0..1) */
  flip?: number;
  /** the comb-over lifted off the scalp (radians) */
  lift?: number;
  t?: number;
};

const top = (sh: Shape, p: THREE.Vector3) => smooth(sh.eyeY + 0.03, sh.eyeY + 0.062, p.y);

type Built = { cards: Card[]; tubes?: { pts: THREE.Vector3[]; r: number; shade: number; twist: number }[]; extra?: "scrunchie" | "pencil" };

export const cutCards = (sh: Shape, cut: Cut, hp: HairParams): Built => {
  const cards: Card[] = [];
  const t = hp.t ?? 0;
  const wind = hp.wind ?? 0;
  const ey = sh.eyeY;
  const shade = (id: number) => 0.82 + 0.3 * hash(id * 0.731);
  if (cut === "crop" || cut === "short") {
    const N = cut === "crop" ? 5200 : 3000;
    const roots = scalpRoots(sh, N, (p) => p.y > ey + 0.012 - 0.03 * smooth(0.02, -0.06, p.z) && top(sh, p) > (cut === "crop" ? 0.2 : 0.05));
    for (const r of roots) {
      const T = top(sh, r.p);
      // tufts: neighbours share a direction and a length, so the ends clump into points
      const cell = Math.floor(r.p.x / 0.011) * 7 + Math.floor(r.p.z / 0.011) * 131 + Math.floor(r.p.y / 0.011) * 17;
      const ca = (hash(cell) - 0.5) * 1.1;
      const cl = 0.75 + 0.5 * hash(cell * 1.7);
      const len = (cut === "crop" ? 0.012 + 0.04 * T : 0.012 + 0.024 * T) * cl * (0.85 + 0.3 * hash(r.id));
      const fwd = V(Math.sin(ca) * 0.6, -0.15, 1).normalize();
      const field = (p: THREE.Vector3, s: number) => {
        const n = normalAt(sh, p);
        // on top: forward, the tuft's own angle; low on the sides: down
        const want = fwd.clone().lerp(V(0, -1, -0.2), 1 - T).addScaledVector(n, cut === "crop" ? 0.35 * (1 - s) : 0.15);
        return tangent(want, n).addScaledVector(n, cut === "crop" ? 0.25 * (1 - s) * T : 0);
      };
      const pts = grow(sh, r, {
        len,
        M: 7,
        off0: 0.0016,
        off1: 0.0035 + (cut === "crop" ? 0.008 : 0.004) * T,
        field,
        bend: 0.3,
        gravity: 0.05,
        // the fringe: a choppy line well above the brows
        stop: (p) => p.z > 0.02 && p.y < ey + 0.036 + 0.004 * Math.sin(p.x * 900) + 0.012 * Math.abs(p.x) / 0.05,
      });
      cards.push({ pts, w: 0.0042 + 0.0024 * hash(r.id * 2.3), shade: shade(r.id), variant: r.id % 4 });
    }
    return { cards };
  }
  if (cut === "twists") {
    const roots = scalpRoots(sh, 2400, (p) => top(sh, p) > 0.55 && p.z < 0.06);
    const tubes = roots.map((r) => {
      const len = 0.026 + 0.02 * hash(r.id * 1.3);
      const lean = V((hash(r.id * 2.1) - 0.5) * 0.5, 0.25, (hash(r.id * 3.7) - 0.5) * 0.5 - 0.1);
      const pts = grow(sh, r, {
        len,
        M: 7,
        off0: 0.0006,
        off1: 0.004,
        field: (p) => normalAt(sh, p).add(lean).normalize(),
        bend: 0.5,
        gravity: 0.35,
      });
      return { pts, r: 0.0034 + 0.0008 * hash(r.id * 5.1), shade: shade(r.id), twist: 20 + 8 * hash(r.id) };
    });
    return { cards, tubes };
  }
  if (cut === "curtain") {
    const roots = scalpRoots(sh, 5600, (p) => p.y > ey + 0.0 - 0.04 * smooth(0.0, -0.06, p.z));
    for (const r of roots) {
      const sx = r.p.x >= 0 ? 1 : -1;
      const front = smooth(-0.03, 0.03, r.p.z);
      const len = (0.06 + 0.05 * front) * (0.85 + 0.3 * hash(r.id));
      const field = (p: THREE.Vector3, s: number) => {
        const n = normalAt(sh, p);
        // away from the part, forward over the forehead, then down and out: the curtains
        const fwdness = smooth(-0.02, 0.04, p.z);
        const want = V(sx * (0.55 + 0.6 * s * fwdness), -0.35 - 0.6 * s, 0.7 * fwdness - 0.4 * (1 - fwdness));
        return tangent(want, n);
      };
      const pts = grow(sh, r, {
        len,
        M: 10,
        off0: 0.0018,
        off1: 0.0065 + 0.004 * top(sh, r.p),
        field,
        bend: 0.25,
        gravity: 0.12,
        stop: (p) => {
          // the curtains: to the brows in the middle, rising to the temples; the sides and back: mid-ear, nape
          const ax = Math.abs(p.x);
          if (p.z > 0.035) return p.y < ey + 0.024 + 0.25 * Math.max(0, ax - 0.012) + 0.0025 * Math.sin(p.x * 700);
          if (p.z > -0.02) return p.y < ey - 0.006;
          return p.y < ey - 0.05;
        },
      });
      cards.push({ pts, w: 0.0055 + 0.0025 * hash(r.id * 2.3), shade: shade(r.id), variant: r.id % 4 });
    }
    return { cards };
  }
  if (cut === "mushroom") {
    const crown = V(0, ey + sh.h * 0.95, -0.03);
    const roots = scalpRoots(sh, 6000, (p) => p.y > ey - 0.01 - 0.03 * smooth(0.0, -0.06, p.z));
    for (const r of roots) {
      const field = (p: THREE.Vector3, s: number) => {
        const n = normalAt(sh, p);
        const away = p.clone().sub(crown);
        away.y = Math.min(away.y, 0) - 0.02;
        return tangent(away.normalize().add(V(0, -0.5 * s, 0)), n);
      };
      const pts = grow(sh, r, {
        len: 0.13,
        M: 12,
        off0: 0.002,
        off1: 0.008 + 0.006 * top(sh, r.p),
        field,
        bend: 0.3,
        gravity: 0.08,
        stop: (p) => {
          // the bowl: straight across the brows, over the tops of the ears, the nape
          const az = Math.atan2(p.x, p.z);
          const c = Math.cos(az);
          const yCut = c > 0 ? ey + 0.004 + 0.024 * c : ey + 0.004 + 0.04 * c;
          return p.y < yCut + 0.0012 * Math.sin(az * 90);
        },
      });
      cards.push({ pts, w: 0.0058 + 0.0024 * hash(r.id * 2.3), shade: shade(r.id), variant: r.id % 4 });
    }
    return { cards };
  }
  if (cut === "flow") {
    const roots = scalpRoots(sh, 5200, (p) => p.y > ey - 0.02 - 0.05 * smooth(0.0, -0.06, p.z));
    for (const r of roots) {
      const front = smooth(-0.02, 0.05, r.p.z);
      const sx = r.p.x >= 0 ? 1 : -1;
      const len = (0.1 + 0.05 * hash(r.id * 1.9)) * (1 - 0.25 * smooth(ey + 0.02, ey - 0.02, r.p.y));
      const field = (p: THREE.Vector3, s: number) => {
        const n = normalAt(sh, p);
        // up off the forehead (the swoop), back over the top, down behind the ears; the wind pushes it back
        const b = V(sx * 0.18, s < 0.25 ? 0.6 * front : -0.2 - 0.9 * s, -1 - 0.6 * wind);
        return tangent(b.normalize(), n).addScaledVector(n, (0.5 * front * (1 - s) + 0.2 * wind) * (1 - s));
      };
      let pts = grow(sh, r, {
        len,
        M: 12,
        off0: 0.002,
        off1: 0.011 + 0.01 * front + 0.006 * wind,
        field,
        bend: 0.3,
        gravity: 0.18 * (1 - 0.6 * wind),
        hug: 0.0,
      });
      // the flick at the ends: out and up
      pts = pts.map((p, j) => {
        const s = j / (pts.length - 1);
        const out = V(p.x, 0, p.z + 0.01).normalize();
        const k = smooth(0.7, 1, s);
        return p.clone().addScaledVector(out, 0.012 * k).add(V(0, 0.008 * k, 0));
      });
      cards.push({ pts, w: 0.0062 + 0.003 * hash(r.id * 2.3), shade: shade(r.id), variant: r.id % 4, seed: r.id });
    }
    return { cards };
  }
  if (cut === "pony" || cut === "bun") {
    const tie = cut === "pony" ? V(0, ey + 0.05, -sh.d * 1.07 - 0.008) : V(0, ey + 0.085, -sh.d * 0.98 - 0.01);
    const roots = scalpRoots(sh, 5000, () => true);
    for (const r of roots) {
      const field = (p: THREE.Vector3) => {
        const n = normalAt(sh, p);
        return tangent(tie.clone().sub(p).normalize(), n);
      };
      const pts = grow(sh, r, {
        len: r.p.distanceTo(tie) * 1.35,
        M: 12,
        off0: 0.0016,
        off1: 0.0032,
        field,
        bend: 0.55,
        stop: (p) => p.distanceTo(tie) < 0.012,
      });
      cards.push({ pts, w: 0.006 + 0.002 * hash(r.id * 2.3), shade: shade(r.id), variant: r.id % 4 });
    }
    if (cut === "pony") {
      // the tail: from the tie, out and down the back, swinging a little
      const sw = 0.006 * Math.sin(t * 2.1);
      for (let i = 0; i < 260; i++) {
        const a = hash(i * 3.3) * Math.PI * 2;
        const rr = Math.sqrt(hash(i * 5.1));
        const ox = Math.cos(a) * rr;
        const oz = Math.sin(a) * rr;
        const len = 0.17 + 0.05 * hash(i * 7.7);
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= 12; j++) {
          const s = j / 12;
          const spread = 0.008 + 0.016 * Math.sin(Math.PI * Math.min(1, s * 1.3)) * (1 - 0.4 * s);
          const y = tie.y - 0.005 - len * Math.pow(s, 0.85);
          const z = tie.z - 0.022 * Math.sin(Math.PI * Math.min(1, s * 1.8)) + 0.012 * s;
          pts.push(V(ox * spread + sw * s * s, y, z + oz * spread * 0.8));
        }
        cards.push({ pts: pts.map((p) => pushOut(sh, p, 0.006)), w: 0.007, shade: shade(i + 9000), variant: i % 4 });
      }
      // two loose strands at the temples
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const root = V(sx * 0.052, ey + 0.035 - 0.003 * k, 0.055 - 0.004 * k);
          const pts: THREE.Vector3[] = [];
          for (let j = 0; j <= 8; j++) {
            const s = j / 8;
            pts.push(pushOut(sh, root.clone().add(V(sx * 0.008 * s, -0.06 * s, -0.004 * s + 0.003 * Math.sin(s * 5 + k))), 0.002));
          }
          cards.push({ pts, w: 0.0026, shade: 0.9, variant: k % 4 });
        }
      }
      return { cards, extra: "scrunchie" };
    }
    // the bun: strands wound round it
    for (let i = 0; i < 160; i++) {
      const ax = V(hash(i * 1.1) - 0.5, hash(i * 2.2) - 0.5, hash(i * 3.3) - 0.5).normalize();
      const u = V().crossVectors(ax, V(0, 1, 0)).normalize();
      if (u.lengthSq() < 0.5) u.set(1, 0, 0);
      const w2 = V().crossVectors(ax, u);
      const R = 0.024 + 0.006 * hash(i * 4.4);
      const a0 = hash(i * 5.5) * Math.PI * 2;
      const c = tie.clone().add(V(0, 0.006, -0.018));
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 14; j++) {
        const a = a0 + (j / 14) * Math.PI * 1.6;
        pts.push(c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(w2, Math.sin(a) * R * 0.75));
      }
      const flat = pts.map((p) => p.clone().sub(c).normalize());
      cards.push({ pts, w: 0.009, shade: shade(i + 7000), variant: i % 4, flat });
    }
    return { cards, extra: "pencil" };
  }
  if (cut === "combover") {
    const lift = hp.lift ?? 0;
    // the horseshoe: short and neat, combed down and back
    const roots = scalpRoots(sh, 4200, () => true, "combover");
    for (const r of roots) {
      const pts = grow(sh, r, {
        len: 0.016 + 0.008 * hash(r.id),
        M: 5,
        off0: 0.0015,
        off1: 0.004,
        field: (p) => tangent(V(0, -1, -0.6), normalAt(sh, p)),
        bend: 0.4,
      });
      cards.push({ pts, w: 0.0048, shade: shade(r.id), variant: r.id % 4 });
    }
    // the strands: from a low part over the left ear, laid over the top to the right; lift raises them
    // from the part like a lid, and they wave
    const partX = sh.w * 0.93;
    for (let i = 0; i < 52; i++) {
      const z = 0.074 - (i / 51) * 0.145 + (hash(i * 3.1) - 0.5) * 0.006;
      const root = V(partX, ey + 0.046 + 0.006 * hash(i), z);
      toSkin(sh, root, 0.002);
      const pts: THREE.Vector3[] = [];
      const M = 14;
      const li = lift * (0.8 + 0.4 * hash(i * 1.3));
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -li);
      for (let j = 0; j <= M; j++) {
        const s = j / M;
        const ang = 0.22 + s * 2.55;
        let p = V(Math.cos(ang) * sh.w, ey + 0.01 + Math.sin(ang) * sh.h * 0.93, z * (1 - 0.12 * Math.sin(Math.PI * s)));
        // laid flat on the bald top (a little loft where it crosses the crown)
        toSkin(sh, p, 0.0024 + 0.0018 * Math.sin(Math.PI * s));
        // lifted about the part, waving as it goes
        if (li > 0) {
          p = root.clone().add(p.clone().sub(root).applyQuaternion(q));
          p.y += 0.006 * Math.sin(t * 23 + s * 6 + i) * s * Math.min(1, li);
          p.z += 0.004 * Math.sin(t * 17 + s * 4 + i * 2) * s * Math.min(1, li);
        }
        pts.push(p);
      }
      cards.push({ pts, w: 0.0045 + 0.002 * hash(i * 2.7), shade: shade(i + 500), variant: i % 4 });
    }
    return { cards };
  }
  return { cards };
};

/** The haircut, in head space. Static cuts are built once; the flow and the comb-over every frame they move. */
const builtCache = new WeakMap<Shape, Map<string, { built: Built; geo: THREE.BufferGeometry; tubeGeo: THREE.BufferGeometry | null }>>();
const stillCut = (sh: Shape, cut: Cut) => {
  let m = builtCache.get(sh);
  if (!m) builtCache.set(sh, (m = new Map()));
  let e = m.get(cut);
  if (!e) {
    const built = cutCards(sh, cut, {});
    e = { built, geo: buildCards(sh, built.cards, new THREE.BufferGeometry()), tubeGeo: built.tubes ? buildTubes(built.tubes, new THREE.BufferGeometry()) : null };
    m.set(cut, e);
  }
  return e;
};

export const CardHair: React.FC<{ sh: Shape; cut: Cut; color: string; params?: HairParams; tie?: string }> = ({ sh, cut, color, params = {}, tie = "#E46A9A" }) => {
  const still = stillCut(sh, cut);
  const flowMoving = cut === "flow" && ((params.wind ?? 0) > 0.001 || (params.flip ?? 0) > 0.001);
  const combMoving = cut === "combover" && (params.lift ?? 0) > 0.001;
  const key = flowMoving || combMoving ? `${params.wind}|${params.flip}|${params.lift}|${params.t}` : "still";
  const moved = useMemo(() => {
    if (flowMoving) return buildCards(sh, flowMove(sh, still.built.cards, params.wind ?? 0, params.flip ?? 0, params.t ?? 0), new THREE.BufferGeometry());
    if (combMoving) return buildCards(sh, cutCards(sh, cut, params).cards, new THREE.BufferGeometry());
    return null;
  }, [sh, cut, key]);
  // (a bent frame's geometry is thrown away when the next one replaces it)
  useEffect(() => () => moved?.dispose(), [moved]);
  const built = still.built;
  const geo = moved ?? still.geo;
  const tubeGeo = still.tubeGeo;
  const tieAt = cut === "pony" ? V(0, sh.eyeY + 0.05, -sh.d * 1.07 - 0.012) : V(0, sh.eyeY + 0.085, -sh.d * 0.98 - 0.022);
  return (
    <group>
      <mesh geometry={geo} material={hairCardMaterial(color)} castShadow receiveShadow />
      {tubeGeo ? <mesh geometry={tubeGeo} material={hairCardMaterial(color, true)} castShadow receiveShadow /> : null}
      {built.extra === "scrunchie" ? (
        <mesh position={tieAt} rotation={[0.35, 0, 0]} material={(matCache[`tie${tie}`] ??= new THREE.MeshStandardMaterial({ color: tie, roughness: 0.8 }))} castShadow>
          <torusGeometry args={[0.011, 0.0055, 10, 24]} />
        </mesh>
      ) : null}
      {built.extra === "pencil" ? (
        <group position={tieAt.clone().add(V(0, 0.008, -0.012))} rotation={[0.3, 0, 0.5]}>
          <mesh material={(matCache.pencil ??= new THREE.MeshStandardMaterial({ color: "#F2B705", roughness: 0.5 }))} castShadow>
            <cylinderGeometry args={[0.0038, 0.0038, 0.15, 6]} />
          </mesh>
          <mesh position={[0, 0.079, 0]} material={(matCache.eraser ??= new THREE.MeshStandardMaterial({ color: "#E88A9A", roughness: 0.8 }))}>
            <cylinderGeometry args={[0.0038, 0.0038, 0.01, 10]} />
          </mesh>
          <mesh position={[0, -0.082, 0]} material={(matCache.wood ??= new THREE.MeshStandardMaterial({ color: "#E8C79A", roughness: 0.7 }))}>
            <coneGeometry args={[0.0038, 0.012, 6]} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
};
