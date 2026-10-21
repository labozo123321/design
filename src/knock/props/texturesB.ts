import * as THREE from "three";
import { canvasTex, mat, rand } from "../../roadster/materials";

/**
 * Builders and procedural textures for the house fabric and the outside props (props set B): a geometry
 * cache, deterministic hashes and tiling noise, an ImageData texture painter, a mitred profile sweep (for
 * mouldings, rails and casings), a closed thin-sheet builder (cloth), and every texture those props use:
 * satin paint, a soft room environment for reflections, oak, the treadmill's belt, grips and console, the
 * laundry's fabrics, plush, asphalt shingles (laid out to the roof's own courses), autumn leaves, snow, rain
 * on glass (redrawn per frame, deterministic), frosted glass, pine needles and halos.
 * Everything is cached and deterministic (rand(seed) and integer hashes, never Math.random()).
 */

export { mat, canvasTex, rand };

// ------------------------------------------------------------------------------------------------ caches
const geoCache = new Map<string, THREE.BufferGeometry>();
/** A geometry made once per key. */
export const geoB = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
};
const anyCache = new Map<string, unknown>();
/** Anything made once per key. */
export const onceB = <T>(key: string, make: () => T): T => {
  if (!anyCache.has(key)) anyCache.set(key, make());
  return anyCache.get(key) as T;
};

// ------------------------------------------------------------------------------------------------ math
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const sstep = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const fract = (x: number) => x - Math.floor(x);
export const lerpN = (a: number, b: number, k: number) => a + (b - a) * k;
/** An integer hash of up to three ints to [0, 1). */
export const hash3 = (x: number, y = 0, z = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
/** Tiling value noise (period p cells), smooth. */
export const vnoise = (x: number, y: number, p: number, seed = 0) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const m = (v: number) => ((v % p) + p) % p;
  const a = hash3(m(xi), m(yi), seed);
  const b = hash3(m(xi + 1), m(yi), seed);
  const c = hash3(m(xi), m(yi + 1), seed);
  const d = hash3(m(xi + 1), m(yi + 1), seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
/** Tiling fbm in [0, 1) over u, v in [0, 1) with a base period of p cells. */
export const fbm = (u: number, v: number, p: number, oct = 4, seed = 0) => {
  let s = 0;
  let amp = 0.5;
  let tot = 0;
  let per = p;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(u * per, v * per, per, seed + o * 17);
    tot += amp;
    amp *= 0.5;
    per *= 2;
  }
  return s / tot;
};

// ------------------------------------------------------------------------------------------------ textures
type RGBA = [number, number, number, number];
/** A texture painted per pixel (rgba 0..255). */
export const pixelTex = (key: string, w: number, h: number, fn: (x: number, y: number) => RGBA | [number, number, number], srgb = true, repeat?: [number, number]) =>
  canvasTex(
    key,
    w,
    h,
    (g) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const c = fn(x, y);
          const i = (y * w + x) * 4;
          img.data[i] = c[0];
          img.data[i + 1] = c[1];
          img.data[i + 2] = c[2];
          img.data[i + 3] = c.length > 3 ? (c as RGBA)[3] : 255;
        }
      g.putImageData(img, 0, 0);
    },
    repeat,
    srgb,
  );

/** A texture that shares a cached one's image with its own repeat (and wrap). */
export const withRepeat = (t: THREE.Texture, rx: number, ry: number) => {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
};

/** A CSS colour's sRGB bytes (THREE.Color holds linear values; getHex() gives sRGB back). */
export const hexRGB = (h: string): [number, number, number] => {
  const n = new THREE.Color(h).getHex();
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const cl255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const shade = (c: [number, number, number], k: number, add = 0): [number, number, number] => [cl255(c[0] * k + add), cl255(c[1] * k + add), cl255(c[2] * k + add)];
export const mixC = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [cl255(a[0] + (b[0] - a[0]) * k), cl255(a[1] + (b[1] - a[1]) * k), cl255(a[2] + (b[2] - a[2]) * k)];

// ------------------------------------------------------------------------------------------------ geometry builder
/** Accumulates vertices and triangles; every triangle is wound to agree with the normal it is meant to face. */
export class GB {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  withColor = false;
  v(p: THREE.Vector3, n: THREE.Vector3, u = 0, w = 0, c?: [number, number, number, number]) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, w);
    if (c) {
      this.withColor = true;
      this.col.push(c[0], c[1], c[2], c[3]);
    } else this.col.push(1, 1, 1, 1);
    return this.pos.length / 3 - 1;
  }
  P(i: number) {
    return new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }
  N(i: number) {
    return new THREE.Vector3(this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]);
  }
  /** A triangle facing (roughly) `face`, or the average of its vertex normals. */
  t(a: number, b: number, c: number, face?: THREE.Vector3) {
    const pa = this.P(a);
    const n = this.P(b).sub(pa).cross(this.P(c).sub(pa));
    const want = face ?? this.N(a).add(this.N(b)).add(this.N(c));
    if (n.dot(want) < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }
  q(a: number, b: number, c: number, d: number, face?: THREE.Vector3) {
    this.t(a, b, c, face);
    this.t(a, c, d, face);
  }
  build(computeNormals = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.withColor) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.idx);
    if (computeNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A closed profile loop in (a, b): a across the moulding (in the path's plane), b out of that plane. */
export type Prof = [number, number][];

/**
 * Sweep a closed profile along a polyline lying in a plane (normal `planeN`), with mitred joints. The
 * profile's a axis is planeN x direction (in the plane, to the left of travel when planeN faces you), b is
 * planeN. Profile corners sharper than `crease` degrees stay hard. Open paths get flat end caps.
 */
export const sweep = (path: THREE.Vector3[], prof: Prof, planeN: THREE.Vector3, o: { closed?: boolean; caps?: boolean; crease?: number; uvScale?: number } = {}) => {
  const closed = !!o.closed;
  const caps = o.caps ?? !closed;
  const crease = Math.cos(((o.crease ?? 38) * Math.PI) / 180);
  const us = o.uvScale ?? 1;
  const N = planeN.clone().normalize();
  const nP = path.length;
  const nSeg = closed ? nP : nP - 1;
  const dir = (j: number) => path[(j + 1) % nP].clone().sub(path[j]).normalize();
  const side = (j: number) => new THREE.Vector3().crossVectors(N, dir(j)).normalize();
  const mitre = (j: number) => {
    // at path vertex j
    const hasPrev = closed || j > 0;
    const hasNext = closed || j < nP - 1;
    if (hasPrev && hasNext) {
      const n1 = side((j - 1 + nSeg) % nSeg);
      const n2 = side(j % nSeg);
      return n1.clone().add(n2).divideScalar(1 + n1.dot(n2));
    }
    return side(hasNext ? j : j - 1);
  };
  // the profile's edge normals and its smoothing
  const np = prof.length;
  const area = prof.reduce((s, p, i) => s + p[0] * prof[(i + 1) % np][1] - prof[(i + 1) % np][0] * p[1], 0);
  const sgn = area > 0 ? 1 : -1;
  const en = prof.map((p, i) => {
    const q = prof[(i + 1) % np];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    return [(sgn * dy) / l, (-sgn * dx) / l] as [number, number];
  });
  const vn = (i: number, e: number): [number, number] => {
    // normal at profile vertex i, for edge e (e = i or i - 1)
    const a = en[(i - 1 + np) % np];
    const b = en[i % np];
    if (a[0] * b[0] + a[1] * b[1] > crease) {
      const x = a[0] + b[0];
      const y = a[1] + b[1];
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    }
    return en[e % np];
  };
  const perim: number[] = [0];
  for (let i = 0; i < np; i++) perim.push(perim[i] + Math.hypot(prof[(i + 1) % np][0] - prof[i][0], prof[(i + 1) % np][1] - prof[i][1]));
  const gb = new GB();
  let along = 0;
  for (let j = 0; j < nSeg; j++) {
    const p0 = path[j];
    const p1 = path[(j + 1) % nP];
    const len = p0.distanceTo(p1);
    const s = side(j);
    const m0 = mitre(j);
    const m1 = mitre((j + 1) % nP);
    for (let i = 0; i < np; i++) {
      const A = prof[i];
      const B = prof[(i + 1) % np];
      const na = vn(i, i);
      const nb = vn((i + 1) % np, i);
      const NA = s.clone().multiplyScalar(na[0]).addScaledVector(N, na[1]);
      const NB = s.clone().multiplyScalar(nb[0]).addScaledVector(N, nb[1]);
      const pt = (base: THREE.Vector3, m: THREE.Vector3, q: [number, number]) => base.clone().addScaledVector(m, q[0]).addScaledVector(N, q[1]);
      const a0 = gb.v(pt(p0, m0, A), NA, along * us, perim[i] * us);
      const b0 = gb.v(pt(p0, m0, B), NB, along * us, perim[i + 1] * us);
      const b1 = gb.v(pt(p1, m1, B), NB, (along + len) * us, perim[i + 1] * us);
      const a1 = gb.v(pt(p1, m1, A), NA, (along + len) * us, perim[i] * us);
      gb.q(a0, b0, b1, a1);
    }
    along += len;
  }
  if (caps && !closed) {
    const tri = THREE.ShapeUtils.triangulateShape(
      prof.map((p) => new THREE.Vector2(p[0], p[1])),
      [],
    );
    for (const end of [0, nP - 1]) {
      const d = end === 0 ? dir(0).negate() : dir(nP - 2);
      const m = mitre(end);
      const base = path[end];
      const ids = prof.map((p) => gb.v(base.clone().addScaledVector(m, p[0]).addScaledVector(N, p[1]), d, p[0] * us, p[1] * us));
      for (const t of tri) gb.t(ids[t[0]], ids[t[1]], ids[t[2]], d);
    }
  }
  return gb.build();
};

/** A straight extrusion of a closed (y, z) profile along x from x0 to x1, capped. */
export const sweepX = (prof: Prof, x0: number, x1: number, crease?: number) => sweep([new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 0, 0)], prof, new THREE.Vector3(0, 0, 1), { crease });

/** A rounded rectangle profile (centre cx, cy; half sizes hx, hy; corner radius r). */
export const rrect = (hx: number, hy: number, r: number, cx = 0, cy = 0, n = 4): Prof => {
  const out: Prof = [];
  const rr = Math.min(r, hx, hy);
  const cs: [number, number, number][] = [
    [hx - rr, hy - rr, 0],
    [-hx + rr, hy - rr, Math.PI / 2],
    [-hx + rr, -hy + rr, Math.PI],
    [hx - rr, -hy + rr, (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of cs)
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + x + rr * Math.cos(a), cy + y + rr * Math.sin(a)]);
    }
  return out;
};
export const ellipseP = (a: number, b: number, n = 16, cx = 0, cy = 0): Prof => Array.from({ length: n }, (_, i) => [cx + a * Math.cos((i / n) * Math.PI * 2), cy + b * Math.sin((i / n) * Math.PI * 2)]);

/**
 * A closed thin sheet (cloth, a towel, a sweater): the surface P(u, v) on the outside, offset inward along
 * its normal by `thick`, and the four edges stitched. u, v in [0, 1]; the texture spans (uvU, uvV) repeats.
 * `side` flips which way counts as outside.
 */
export const sheetSolid = (P: (u: number, v: number) => THREE.Vector3, nu: number, nv: number, thick: number, uvU = 1, uvV = 1, side = 1) => {
  const G: THREE.Vector3[][] = [];
  const Nn: THREE.Vector3[][] = [];
  for (let i = 0; i <= nu; i++) {
    G.push([]);
    for (let j = 0; j <= nv; j++) G[i].push(P(i / nu, j / nv));
  }
  for (let i = 0; i <= nu; i++) {
    Nn.push([]);
    for (let j = 0; j <= nv; j++) {
      const du = G[Math.min(nu, i + 1)][j].clone().sub(G[Math.max(0, i - 1)][j]);
      const dv = G[i][Math.min(nv, j + 1)].clone().sub(G[i][Math.max(0, j - 1)]);
      const n = du.cross(dv);
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
      Nn[i].push(n.normalize().multiplyScalar(side));
    }
  }
  const gb = new GB();
  const outer: number[][] = [];
  const inner: number[][] = [];
  for (let i = 0; i <= nu; i++) {
    outer.push([]);
    inner.push([]);
    for (let j = 0; j <= nv; j++) {
      outer[i].push(gb.v(G[i][j], Nn[i][j], (i / nu) * uvU, (j / nv) * uvV));
      inner[i].push(gb.v(G[i][j].clone().addScaledVector(Nn[i][j], -thick), Nn[i][j].clone().negate(), (i / nu) * uvU, (j / nv) * uvV));
    }
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      gb.q(outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j + 1]);
      gb.q(inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]);
    }
  // edges: each edge strip faces away from the sheet's interior along the surface
  const edge = (pts: [number, number][], out: (i: number, j: number) => THREE.Vector3) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, j0] = pts[k];
      const [i1, j1] = pts[k + 1];
      const f = out(i0, j0).add(out(i1, j1)).normalize();
      const a = gb.v(G[i0][j0], f, 0, 0);
      const b = gb.v(G[i1][j1], f, 0, 0);
      const c = gb.v(G[i1][j1].clone().addScaledVector(Nn[i1][j1], -thick), f, 0, 0);
      const d = gb.v(G[i0][j0].clone().addScaledVector(Nn[i0][j0], -thick), f, 0, 0);
      gb.q(a, b, c, d, f);
    }
  };
  const tu = (i: number, j: number, s: number) => G[Math.min(nu, Math.max(0, i + s))][j].clone().sub(G[i][j]).multiplyScalar(-1).normalize();
  const tv = (i: number, j: number, s: number) => G[i][Math.min(nv, Math.max(0, j + s))].clone().sub(G[i][j]).multiplyScalar(-1).normalize();
  edge(Array.from({ length: nv + 1 }, (_, j) => [0, j] as [number, number]), (i, j) => tu(i, j, 1));
  edge(Array.from({ length: nv + 1 }, (_, j) => [nu, j] as [number, number]), (i, j) => tu(i, j, -1));
  edge(Array.from({ length: nu + 1 }, (_, i) => [i, 0] as [number, number]), (i, j) => tv(i, j, 1));
  edge(Array.from({ length: nu + 1 }, (_, i) => [i, nv] as [number, number]), (i, j) => tv(i, j, -1));
  return gb.build();
};

/** A tube along a smooth curve with closed end caps (round section). */
export const tubeCapped = (curve: THREE.Curve<THREE.Vector3>, r: number, seg = 48, radial = 10) => {
  const t = new THREE.TubeGeometry(curve, seg, r, radial, false);
  const gb = new GB();
  const pos = t.attributes.position as THREE.BufferAttribute;
  const nor = t.attributes.normal as THREE.BufferAttribute;
  const uv = t.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) gb.v(new THREE.Vector3().fromBufferAttribute(pos, i), new THREE.Vector3().fromBufferAttribute(nor, i), uv.getX(i), uv.getY(i));
  const idx = t.index!;
  for (let i = 0; i < idx.count; i += 3) gb.idx.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  for (const end of [0, 1]) {
    const c = curve.getPointAt(end);
    const d = curve.getTangentAt(end).normalize();
    if (end === 0) d.negate();
    const ci = gb.v(c, d, 0.5, 0.5);
    const ring = end === 0 ? 0 : seg;
    for (let k = 0; k < radial; k++) {
      const a = ring * (radial + 1) + k;
      const b = ring * (radial + 1) + k + 1;
      const pa = gb.v(new THREE.Vector3().fromBufferAttribute(pos, a), d, 0, 0);
      const pb = gb.v(new THREE.Vector3().fromBufferAttribute(pos, b), d, 0, 0);
      gb.t(ci, pa, pb, d);
    }
  }
  return gb.build();
};

// ======================================================================================= environment
/** A soft room-and-window environment for reflections (glass, chrome, brass): dim, slightly cool. */
export const envB = () =>
  onceB("envB", () => {
    const t = canvasTex(
      "envB",
      512,
      256,
      (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#5C6878");
        sky.addColorStop(0.45, "#3A4250");
        sky.addColorStop(0.52, "#2A2622");
        sky.addColorStop(1, "#14110E");
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        // a bright window and a warm lamp, soft
        const blob = (x: number, y: number, rx: number, ry: number, c: string) => {
          const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
          grd.addColorStop(0, c);
          grd.addColorStop(1, "rgba(0,0,0,0)");
          g.save();
          g.translate(x, y);
          g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
          g.translate(-x, -y);
          g.fillStyle = grd;
          g.fillRect(x - Math.max(rx, ry), y - Math.max(rx, ry), 2 * Math.max(rx, ry), 2 * Math.max(rx, ry));
          g.restore();
        };
        g.fillStyle = "rgba(210,225,240,0.75)";
        g.fillRect(150, 70, 70, 52);
        g.fillStyle = "rgba(40,50,60,0.9)";
        g.fillRect(183, 70, 4, 52);
        g.fillRect(150, 94, 70, 4);
        blob(390, 104, 70, 46, "rgba(255,214,160,0.32)");
        blob(60, 40, 90, 30, "rgba(200,210,230,0.35)");
      },
      undefined,
      true,
    );
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });

// ======================================================================================= paint, wood
/** Satin paint's fine roller stipple (a bump map). */
export const stippleBump = () =>
  pixelTex(
    "b-stipple",
    256,
    256,
    (x, y) => {
      const v = 128 + 70 * (fbm(x / 256, y / 256, 32, 2, 3) - 0.5) + 30 * (hash3(x, y, 9) - 0.5);
      return [v, v, v];
    },
    false,
    [6, 6],
  );

/** Oak along u (a handrail, a newel cap): long grain lines, a little figure, warm stain. */
export const oakGrainTex = (key: string, base = "#8A5A32", seed = 4) =>
  canvasTex(
    `b-oakGrain-${key}`,
    1024,
    128,
    (g, w, h) => {
      const r = rand(seed);
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 70; k++) {
        const y0 = r() * h;
        const amp = 1 + r() * 4;
        const ph = r() * 10;
        g.strokeStyle = `rgba(${40 + r() * 20},${22 + r() * 10},8,${0.08 + r() * 0.18})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.031 + ph * 3) * amp * 0.3;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // ray fleck
      for (let k = 0; k < 120; k++) {
        g.fillStyle = `rgba(230,190,140,${0.05 + r() * 0.08})`;
        g.fillRect(r() * w, r() * h, 3 + r() * 10, 1);
      }
    },
    [1, 1],
  );

// ======================================================================================= treadmill
/** The belt: black rubber with a fine diamond knurl, a diagonal lap seam, faint scuffs (u across, v along). */
export const beltTex = () =>
  pixelTex(
    "b-belt",
    256,
    1024,
    (x, y) => {
      const k1 = (x + y) % 8 < 1 ? 1 : 0;
      const k2 = (x - y + 4096) % 8 < 1 ? 1 : 0;
      let v = 40 + 10 * (k1 | k2) + 7 * (hash3(x, y, 3) - 0.5) + 10 * (fbm(x / 256, y / 1024, 4, 3, 5) - 0.5);
      // the lap seam: a diagonal line across at about v = 0.62
      const sy = 0.62 * 1024 + (x - 128) * 0.35;
      // the lap seam: a pale glued band with dark edges (it is what shows the belt moving)
      if (Math.abs(y - sy) < 3.5) v = 104 + 10 * (hash3(x, 7, 5) - 0.5);
      else if (Math.abs(y - sy) < 5.5) v = 20;
      // scuffs from shoes, lighter, in the two footfall lanes
      const lane = Math.min(Math.abs(x - 78), Math.abs(x - 178));
      v += 14 * Math.max(0, 1 - lane / 34) * fbm(x / 256, y / 1024, 16, 2, 11);
      return [v, v, v + 1];
    },
    true,
  );
/** The step rails' rubber grip insert: fine longitudinal ridges (u across, v along). */
export const gripTex = () =>
  pixelTex(
    "b-grip",
    64,
    256,
    (x, y) => {
      const ridge = Math.sin((x / 64) * Math.PI * 2 * 9) * 0.5 + 0.5;
      const v = 22 + 22 * ridge + 6 * (hash3(x, y, 1) - 0.5);
      return [v, v, v + 2];
    },
    true,
    [1, 6],
  );
/** Brushed aluminium: fine streaks along u (use as a map with a light colour). */
export const brushedTex = () =>
  pixelTex(
    "b-brushed",
    512,
    64,
    (x, y) => {
      const v = 196 + 26 * (vnoise(x / 120, y * 1.7, 4096, 7) - 0.5) + 14 * (hash3(Math.floor(x / 9), y, 2) - 0.5);
      return [v, v, v + 3];
    },
    true,
    [2, 2],
  );
/** The motor hood's top: moulded dark-grey plastic with a slot vent grille and a parting line. */
export const hoodTex = () =>
  canvasTex("b-hood", 512, 256, (g, w, h) => {
    g.fillStyle = "#5E646B";
    g.fillRect(0, 0, w, h);
    const r = rand(12);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    // vent slots (across, on the hood's top)
    for (let i = 0; i < 16; i++) {
      const x = 150 + i * 13;
      g.fillStyle = "#121315";
      g.beginPath();
      g.roundRect(x, 70, 6, 110, 3);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.fillRect(x + 6, 72, 1, 106);
    }
    // a parting line and a soft panel
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(24, 24, w - 48, h - 48, 22);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.07)";
    g.beginPath();
    g.roundRect(26, 26, w - 52, h - 52, 20);
    g.stroke();
  });

/** The console's face (u across, v up the face): a display window (lit when on), speed and incline keys,
 * a start key, programme keys and a speaker grille. Generic: icons only, no brand. */
export const consoleTex = (on: boolean) =>
  canvasTex(`b-console-${on ? 1 : 0}`, 1024, 384, (g, w, h) => {
    g.fillStyle = "#8F959C";
    g.fillRect(0, 0, w, h);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#2B2E33");
    bg.addColorStop(1, "#1C1E22");
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(10, 10, w - 20, h - 20, 26);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 2;
    g.stroke();
    // the display window
    const dx = 312;
    const dy = 46;
    const dw = 400;
    const dh = 150;
    g.fillStyle = "#0A0C0C";
    g.beginPath();
    g.roundRect(dx - 8, dy - 8, dw + 16, dh + 16, 14);
    g.fill();
    g.fillStyle = on ? "#0F2A2A" : "#101414";
    g.beginPath();
    g.roundRect(dx, dy, dw, dh, 8);
    g.fill();
    const seg = (x: number, y: number, s: number, ch: string, c: string) => {
      // a seven-segment glyph
      const S: Record<string, number[]> = {
        "0": [1, 1, 1, 1, 1, 1, 0],
        "1": [0, 1, 1, 0, 0, 0, 0],
        "2": [1, 1, 0, 1, 1, 0, 1],
        "3": [1, 1, 1, 1, 0, 0, 1],
        "4": [0, 1, 1, 0, 0, 1, 1],
        "5": [1, 0, 1, 1, 0, 1, 1],
        "6": [1, 0, 1, 1, 1, 1, 1],
        "7": [1, 1, 1, 0, 0, 0, 0],
        "8": [1, 1, 1, 1, 1, 1, 1],
        "9": [1, 1, 1, 1, 0, 1, 1],
      };
      const on7 = S[ch] ?? S["8"];
      const t = s * 0.16;
      const L = s * 0.5;
      const segs: [number, number, number, number][] = [
        [x + t, y, L, t],
        [x + t + L, y + t, t, L],
        [x + t + L, y + 2 * t + L, t, L],
        [x + t, y + 2 * t + 2 * L, L, t],
        [x, y + 2 * t + L, t, L],
        [x, y + t, t, L],
        [x + t, y + t + L, L, t],
      ];
      segs.forEach((sg, i) => {
        g.fillStyle = on7[i] ? c : "rgba(120,160,160,0.06)";
        g.fillRect(sg[0], sg[1], sg[2], sg[3]);
      });
    };
    const lit = on ? "#8FF2E2" : "rgba(0,0,0,0)";
    // (the readout turned half round in its window: the film only ever looks down on it from the runner's
    // back, and there it should read the right way up)
    g.save();
    g.translate(dx + dw / 2, dy + dh / 2);
    g.rotate(Math.PI);
    g.translate(-(dx + dw / 2), -(dy + dh / 2));
    if (on) {
      // time 12:07 . speed 3.2 . a little bar graph (the programme profile)
      seg(dx + 26, dy + 26, 70, "1", lit);
      seg(dx + 76, dy + 26, 70, "2", lit);
      g.fillStyle = lit;
      g.fillRect(dx + 132, dy + 50, 7, 7);
      g.fillRect(dx + 132, dy + 76, 7, 7);
      seg(dx + 148, dy + 26, 70, "0", lit);
      seg(dx + 198, dy + 26, 70, "7", lit);
      seg(dx + 278, dy + 26, 52, "3", lit);
      g.fillRect(dx + 318, dy + 98, 7, 7);
      seg(dx + 330, dy + 26, 52, "2", lit);
      for (let i = 0; i < 16; i++) {
        const hh = 6 + Math.round(18 * (0.5 + 0.5 * Math.sin(i * 0.7)));
        g.fillStyle = i < 9 ? lit : "rgba(143,242,226,0.25)";
        g.fillRect(dx + 26 + i * 22, dy + dh - 14 - hh, 16, hh);
      }
    } else {
      for (let i = 0; i < 4; i++) seg(dx + 26 + i * 60, dy + 26, 70, "8", "rgba(0,0,0,0)");
    }
    g.restore();
    // a soft reflection across the display glass
    const gl = g.createLinearGradient(dx, dy, dx + dw, dy + dh);
    gl.addColorStop(0, "rgba(255,255,255,0.10)");
    gl.addColorStop(0.4, "rgba(255,255,255,0.02)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.fillRect(dx, dy, dw, dh);
    // keys: rounded rubber pads with icons
    const key = (x: number, y: number, kw: number, kh: number, col: string, icon: (cx: number, cy: number) => void) => {
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath();
      g.roundRect(x - 2, y + 3, kw + 4, kh + 2, 12);
      g.fill();
      const kg = g.createLinearGradient(0, y, 0, y + kh);
      kg.addColorStop(0, col);
      kg.addColorStop(1, "#24272C");
      g.fillStyle = kg;
      g.beginPath();
      g.roundRect(x, y, kw, kh, 11);
      g.fill();
      g.fillStyle = "#D8DCE0";
      g.strokeStyle = "#D8DCE0";
      icon(x + kw / 2, y + kh / 2);
    };
    const up = (cx: number, cy: number) => {
      g.beginPath();
      g.moveTo(cx - 12, cy + 7);
      g.lineTo(cx, cy - 8);
      g.lineTo(cx + 12, cy + 7);
      g.closePath();
      g.fill();
    };
    const dn = (cx: number, cy: number) => {
      g.beginPath();
      g.moveTo(cx - 12, cy - 7);
      g.lineTo(cx, cy + 8);
      g.lineTo(cx + 12, cy - 7);
      g.closePath();
      g.fill();
    };
    const slope = (cx: number, cy: number) => {
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 14, cy + 8);
      g.lineTo(cx + 14, cy - 8);
      g.lineTo(cx + 14, cy + 8);
      g.closePath();
      g.stroke();
    };
    const run = (cx: number, cy: number) => {
      g.beginPath();
      g.moveTo(cx - 8, cy - 11);
      g.lineTo(cx + 12, cy);
      g.lineTo(cx - 8, cy + 11);
      g.closePath();
      g.fill();
    };
    // speed (left), incline (right)
    key(150, 60, 92, 60, "#3C4048", up);
    key(150, 140, 92, 60, "#3C4048", dn);
    key(60, 100, 72, 60, "#3C4048", slope);
    key(782, 60, 92, 60, "#3C4048", up);
    key(782, 140, 92, 60, "#3C4048", dn);
    key(892, 100, 72, 60, "#3C4048", slope);
    // start (green) below the display
    key(dx + dw / 2 - 70, 236, 140, 64, "#2F8F57", run);
    // programme keys
    for (let i = 0; i < 6; i++)
      key(dx - 120 + i * 112 - (i >= 3 ? -152 : 0), 318, 70, 40, "#3A3E46", (cx, cy) => {
        g.fillRect(cx - 14, cy - 2, 28, 4);
        for (let k = 0; k < i + 1; k++) g.fillRect(cx - 14 + k * 6, cy - 9, 3, 7);
      });
    // speaker grilles
    for (const sx of [70, 900])
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          g.fillStyle = "#0E0F11";
          g.beginPath();
          g.arc(sx + i * 12, 250 + j * 12, 3.4, 0, Math.PI * 2);
          g.fill();
        }
  });

// ======================================================================================= fabrics
/** Terry towelling: loop pile noise, a woven dobby band near both ends (v), a hem. */
export const terryTex = (key: string, color: string, band = "#FFFFFF") =>
  pixelTex(
    `b-terry-${key}-${color}`,
    256,
    256,
    (x, y) => {
      const c = hexRGB(color);
      const loops = 0.82 + 0.3 * hash3(x, y, 5) + 0.12 * (vnoise(x / 3, y / 3, 1024, 2) - 0.5);
      const v = y / 256;
      // a band at v in [0.06, 0.14] and [0.86, 0.94], and a flat hem at the very ends
      const inBand = (v > 0.06 && v < 0.14) || (v > 0.86 && v < 0.94);
      const hem = v < 0.025 || v > 0.975;
      let col = shade(c, loops);
      if (inBand) col = mixC(shade(c, 0.95), hexRGB(band), 0.55 + 0.25 * ((x >> 2) % 2));
      if (hem) col = shade(c, 0.86 + 0.1 * ((y + x) % 2));
      return col;
    },
    true,
  );
/** Knitwear: stockinette Vs in columns, or a cable stripe, tiling. */
export const knitTex = (key: string, color: string, kind: "plain" | "cable" = "plain") =>
  pixelTex(
    `b-knit-${key}-${color}-${kind}`,
    256,
    256,
    (x, y) => {
      const c = hexRGB(color);
      // stitches: 8 px columns, 6 px rows; each stitch a V of two slanted loops
      const cx = x % 8;
      const cy = (y + (cx < 4 ? cx : 7 - cx)) % 6;
      let k = 0.78 + 0.28 * Math.sin((cy / 6) * Math.PI) * (cx === 0 || cx === 7 ? 0.5 : 1);
      if (kind === "cable") {
        const col = Math.floor(x / 64);
        const lx = x % 64;
        if (lx > 18 && lx < 46) {
          // a twisted cable: two strands crossing every 48 px
          const t = ((y % 48) / 48) * Math.PI * 2;
          const s1 = 32 + 9 * Math.sin(t);
          const s2 = 32 - 9 * Math.sin(t);
          const d = Math.min(Math.abs(lx - s1), Math.abs(lx - s2));
          k = d < 6 ? 1.05 - d * 0.03 : 0.66;
        } else if (lx === 16 || lx === 17 || lx === 47 || lx === 48) k = 0.6;
        k *= 1 + 0.02 * col;
      }
      k += 0.05 * (hash3(x, y, 8) - 0.5);
      return shade(c, k);
    },
    true,
  );
/** Shirt cotton: plain weave with a pattern (plain, stripe, plaid or a fine oxford). */
export const cottonTex = (key: string, color: string, pattern: "plain" | "stripe" | "plaid" | "oxford" = "plain", accent = "#FFFFFF") =>
  pixelTex(
    `b-cotton-${key}-${color}-${pattern}-${accent}`,
    256,
    256,
    (x, y) => {
      const c = hexRGB(color);
      const a = hexRGB(accent);
      const weave = 0.94 + 0.08 * (((x + y) & 1) === 0 ? 1 : 0) + 0.04 * (hash3(x, y, 4) - 0.5);
      let col = shade(c, weave);
      if (pattern === "stripe") {
        const s = x % 32;
        if (s < 3) col = shade(a, weave);
        else if (s > 15 && s < 17) col = mixC(col, a, 0.5);
      } else if (pattern === "plaid") {
        const sx = x % 64;
        const sy = y % 64;
        const bx = sx < 18 ? 1 : sx > 30 && sx < 34 ? 0.6 : 0;
        const by = sy < 18 ? 1 : sy > 30 && sy < 34 ? 0.6 : 0;
        col = mixC(col, a, Math.min(1, (bx + by) * 0.42));
        if (bx > 0 && by > 0) col = shade(col, 0.82);
      } else if (pattern === "oxford") {
        col = mixC(col, [250, 250, 250], ((x >> 1) + (y >> 1)) % 2 ? 0.18 : 0);
      }
      return col;
    },
    true,
  );
/** Denim: a right-hand twill of indigo warp over white weft, faded. */
export const denimTex = () =>
  pixelTex(
    "b-denim",
    256,
    256,
    (x, y) => {
      const tw = (x + y * 1) % 4 < 3;
      const ind: [number, number, number] = [44, 66, 104];
      const wht: [number, number, number] = [200, 206, 214];
      let col = tw ? shade(ind, 0.9 + 0.25 * vnoise(x / 2, y / 40, 1024, 3)) : mixC(ind, wht, 0.6);
      col = mixC(col, wht, 0.12 * fbm(x / 256, y / 256, 4, 3, 9));
      return col;
    },
    true,
  );
/** A sock: ribbed (stripes along v), a contrast toe and heel band is drawn by UV. */
export const sockTex = (key: string, color: string, accent: string) =>
  pixelTex(
    `b-sock-${key}-${color}-${accent}`,
    128,
    256,
    (x, y) => {
      const c = hexRGB(color);
      const rib = 0.82 + 0.22 * (Math.sin((x / 128) * Math.PI * 2 * 12) * 0.5 + 0.5);
      const v = y / 256;
      let col = shade(c, rib + 0.04 * (hash3(x, y, 2) - 0.5));
      if (v > 0.86 || (v > 0.36 && v < 0.46)) col = shade(hexRGB(accent), 0.95 + 0.05 * hash3(x, y, 3));
      if (v < 0.18) col = mixC(col, hexRGB(accent), (x >> 3) % 2 ? 0.0 : 0.25);
      return col;
    },
    true,
  );
/** Plush (a dog bed's faux fur): soft clumps with fibre streaks; returns [map, bump]. */
export const plushTex = (key: string, color: string) => {
  const c = hexRGB(color);
  const map = pixelTex(
    `b-plush-${key}-${color}`,
    256,
    256,
    (x, y) => {
      const clump = fbm(x / 256, y / 256, 12, 3, 4);
      const fib = hash3(x, Math.floor(y / 3), 6);
      return shade(c, 0.72 + 0.4 * clump + 0.1 * (fib - 0.5));
    },
    true,
    [3, 2],
  );
  const bump = pixelTex(
    `b-plushB-${key}`,
    256,
    256,
    (x, y) => {
      const v = 128 + 110 * (fbm(x / 256, y / 256, 12, 3, 4) - 0.5) + 30 * (hash3(x, Math.floor(y / 3), 6) - 0.5);
      return [v, v, v];
    },
    false,
    [3, 2],
  );
  return { map, bump };
};
/** Heavy canvas (the dog bed's base): a basket weave. */
export const canvasWeaveTex = (key: string, color: string) =>
  pixelTex(
    `b-canvas-${key}-${color}`,
    128,
    128,
    (x, y) => {
      const c = hexRGB(color);
      const k = ((x >> 2) + (y >> 2)) % 2 ? 0.92 : 1.04;
      return shade(c, k + 0.05 * (hash3(x, y, 1) - 0.5));
    },
    true,
    [8, 4],
  );

// ======================================================================================= shingles
export type Course = { s0: number; s1: number; off: number };
/** The texture for an asphalt-shingle roof of width W by slope length S laid in `courses` (s from the top,
 * u across). Three-tab strips 0.914 m long with 0.305 m tabs; each course's keyways offset half a tab from
 * the last; each tab its own blend of granules; the odd darker strip, faint streaks. Returns colour and bump. */
export const shingleTex = (key: string, W: number, S: number, courses: Course[], base = "#625C57") => {
  const pxm = Math.min(380, 4096 / W);
  const w = Math.min(4096, Math.ceil(W * pxm));
  const h = Math.min(2048, Math.ceil(S * pxm));
  const ppmY = h / S;
  const ppmX = w / W;
  const b = hexRGB(base);
  const tabOf = (x: number, y: number) => {
    // which course, which tab, how far up the exposure (0 at the butt)
    const s = y / ppmY;
    let k = 0;
    for (let i = 0; i < courses.length; i++) if (s >= courses[i].s0 && s < courses[i].s1) k = i;
    const c = courses[k];
    const u = x / ppmX + c.off;
    const tab = Math.floor(u / 0.3048);
    const inTab = u / 0.3048 - tab;
    const up = (c.s1 - s) / (c.s1 - c.s0); // 0 at the butt (s1), 1 at the top of the exposure
    return { k, tab, inTab, up, strip: Math.floor(u / 0.9144) };
  };
  const colour = pixelTex(`b-shingle-${key}`, w, h, (x, y) => {
    const t = tabOf(x, y);
    const hk = hash3(t.k, t.tab, 11);
    const strip = hash3(t.k, t.strip, 12);
    let col = shade(b, 0.9 + 0.2 * hk + (strip < 0.1 ? -0.09 : 0));
    // granules: a speckle of darker and lighter grains, a few rust/olive ones (weathered-wood blend)
    const g = hash3(x, y, 13);
    if (g < 0.12) col = shade(col, 0.72);
    else if (g > 0.9) col = shade(col, 1.25);
    else if (g > 0.88) col = mixC(col, [120, 84, 58], 0.6);
    else if (g > 0.865) col = mixC(col, [96, 100, 72], 0.5);
    // the keyway slots: the course below shows through, in shadow
    const slot = Math.min(t.inTab, 1 - t.inTab) * 0.3048;
    if (slot < 0.0025 && t.up < 0.93) col = shade(col, 0.55 + 0.4 * t.up);
    // the butt edge: the tab above casts a soft shadow onto this one
    if (t.up < 0.07) col = shade(col, 0.62 + 0.38 * (t.up / 0.07));
    // faint streaks down the slope and a little grime toward the eave
    const st = vnoise((x / w) * 60, 0.5, 60, 21);
    col = shade(col, 1 - 0.1 * sstep(0.62, 0.9, st) * (y / h));
    return col;
  });
  const bump = pixelTex(
    `b-shingleB-${key}`,
    w,
    h,
    (x, y) => {
      const t = tabOf(x, y);
      let v = 150 + 30 * (hash3(t.k, t.tab, 11) - 0.5) + 60 * (hash3(x, y, 13) - 0.5);
      const slot = Math.min(t.inTab, 1 - t.inTab) * 0.3048;
      if (slot < 0.0045 && t.up < 0.93) v = 40;
      if (t.up < 0.03) v -= 50;
      return [v, v, v];
    },
    false,
  );
  return { colour, bump };
};

// ======================================================================================= leaves, snow
/** An atlas of dry leaves (4 x 2 cells, alpha): maples in red, orange and gold, oaks in brown, a birch,
 * an elm; veins, curled darker edges, a stem. Cell (i, j) spans u [i/4, (i+1)/4], v [j/2, (j+1)/2]. */
export const leafAtlas = () =>
  canvasTex(
    "b-leaves",
    1024,
    512,
    (g) => {
      const r = rand(31);
      const cells: { kind: "maple" | "oak" | "birch"; col: string; vein: string }[] = [
        { kind: "maple", col: "#B5401F", vein: "#E8A070" },
        { kind: "maple", col: "#D9822B", vein: "#F4C27A" },
        { kind: "maple", col: "#D7A93A", vein: "#F6DB8A" },
        { kind: "oak", col: "#7A5230", vein: "#B88A5C" },
        { kind: "oak", col: "#94683A", vein: "#C9A070" },
        { kind: "birch", col: "#C9A646", vein: "#EED98C" },
        { kind: "maple", col: "#8E2E22", vein: "#D27A5A" },
        { kind: "birch", col: "#A57A3A", vein: "#D6B47A" },
      ];
      cells.forEach((c, n) => {
        const cx = (n % 4) * 256 + 128;
        const cy = Math.floor(n / 4) * 256 + 128;
        g.save();
        g.translate(cx, cy);
        const path = new Path2D();
        if (c.kind === "maple") {
          // five broad lobes, each with a pointed tip and teeth; deep sinuses between them
          const lobes: [number, number][] = [
            [-Math.PI / 2, 112],
            [-Math.PI / 2 - 0.95, 98],
            [-Math.PI / 2 + 0.95, 98],
            [-Math.PI / 2 - 1.95, 66],
            [-Math.PI / 2 + 1.95, 66],
          ];
          const pts: [number, number][] = [];
          for (let a = 0; a < Math.PI * 2; a += 0.02) {
            const ang = a - Math.PI;
            let rr = 52;
            for (const [l, len] of lobes) {
              const d = Math.atan2(Math.sin(ang - l), Math.cos(ang - l));
              // a lobe: broad near the centre, pointed at its tip
              rr = Math.max(rr, len * Math.max(0, 1 - Math.abs(d) / 0.42) ** 0.75 + 52 * Math.exp(-(d * d) / 0.5));
            }
            rr *= 1 + 0.045 * Math.sin(a * 38);
            if (Math.sin(ang) > 0.75) rr = Math.min(rr, 50);
            pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
          }
          pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
          path.closePath();
        } else if (c.kind === "oak") {
          // an elongated leaf with rounded lobes
          const pts: [number, number][] = [];
          for (let t = 0; t <= 1; t += 0.01) {
            const y = -110 + t * 200;
            const env = Math.sin(Math.PI * Math.min(1, t * 1.08)) * 52;
            const lob = 1 + 0.32 * Math.sin(t * Math.PI * 9);
            pts.push([env * lob, y]);
          }
          for (let t = 1; t >= 0; t -= 0.01) {
            const y = -110 + t * 200;
            const env = Math.sin(Math.PI * Math.min(1, t * 1.08)) * 52;
            const lob = 1 + 0.32 * Math.sin(t * Math.PI * 9 + 0.6);
            pts.push([-env * lob, y]);
          }
          pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
          path.closePath();
        } else {
          // an ovate, finely toothed leaf: pointed tip (up), rounded base
          const pts: [number, number][] = [];
          const half = (t: number) => 64 * Math.pow(Math.sin(Math.PI * t), 0.85) * (1 - 0.28 * (1 - t)) * (1 + 0.03 * Math.sin(t * 90));
          for (let t = 0; t <= 1; t += 0.01) pts.push([half(t), 92 - t * 205]);
          for (let t = 1; t >= 0; t -= 0.01) pts.push([-half(t), 92 - t * 205]);
          pts.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
          path.closePath();
        }
        const grd = g.createRadialGradient(0, 0, 10, 0, 0, 120);
        grd.addColorStop(0, c.col);
        grd.addColorStop(0.75, c.col);
        grd.addColorStop(1, "#4A2E18");
        g.fillStyle = grd;
        g.fill(path);
        // mottling
        g.save();
        g.clip(path);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? "60,30,10" : "255,220,150"},${0.05 + r() * 0.1})`;
          g.beginPath();
          g.arc((r() - 0.5) * 220, (r() - 0.5) * 220, 3 + r() * 12, 0, Math.PI * 2);
          g.fill();
        }
        // veins
        g.strokeStyle = c.vein;
        g.globalAlpha = 0.65;
        g.lineWidth = 3;
        const veins = c.kind === "maple" ? [-1.9, -0.95, 0, 0.95, 1.9] : [0];
        for (const v of veins) {
          g.beginPath();
          g.moveTo(0, 40);
          g.lineTo(Math.sin(v) * 100, -Math.cos(v) * 100);
          g.stroke();
        }
        if (c.kind !== "maple") {
          g.lineWidth = 1.5;
          for (let k = -4; k <= 4; k++) {
            g.beginPath();
            g.moveTo(0, k * 20);
            g.lineTo(46, k * 20 - 24);
            g.moveTo(0, k * 20);
            g.lineTo(-46, k * 20 - 24);
            g.stroke();
          }
        }
        g.globalAlpha = 1;
        g.restore();
        // the dry, darker rim
        g.strokeStyle = "rgba(50,28,12,0.55)";
        g.lineWidth = 3;
        g.stroke(path);
        // the stem
        g.strokeStyle = "#5A3A1E";
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, c.kind === "maple" ? 40 : 88);
        g.lineTo(4, 124);
        g.stroke();
        g.restore();
      });
    },
    undefined,
    true,
  );

/** Snow's surface: white with a faint blue in the hollows and sparkling grains. */
export const snowTex = () =>
  pixelTex(
    "b-snow",
    256,
    256,
    (x, y) => {
      const n = fbm(x / 256, y / 256, 8, 4, 3);
      const sp = hash3(x, y, 9) > 0.985 ? 1 : 0;
      const k = 0.9 + 0.1 * n;
      return [cl255(232 * k + sp * 30), cl255(238 * k + sp * 25), cl255(248 * k + sp * 10)];
    },
    true,
    [6, 6],
  );
export const snowBump = () =>
  pixelTex(
    "b-snowB",
    256,
    256,
    (x, y) => {
      const v = 128 + 120 * (fbm(x / 256, y / 256, 6, 4, 5) - 0.5);
      return [v, v, v];
    },
    false,
    [6, 6],
  );
// ======================================================================================= glass
/** Frosted glass (a dome): a soft milky gradient with fine etched stipple and a faint swirl. */
export const frostTex = () =>
  pixelTex(
    "b-frost",
    256,
    256,
    (x, y) => {
      const n = fbm(x / 256, y / 256, 24, 3, 2);
      const v = 220 + 30 * (n - 0.5) + 10 * (hash3(x, y, 2) - 0.5);
      return [cl255(v), cl255(v * 0.985), cl255(v * 0.96)];
    },
    true,
    [2, 1],
  );

const rainCanvases = new Map<number, { tex: THREE.CanvasTexture; c: HTMLCanvasElement; key: string }>();
/**
 * Rain on a window pane, as an RGBA overlay (u across, v up; tile 0.4 x 0.6 m): beaded droplets that come
 * and go, and running drops that slide down in steps, meandering, each leaving a thinning wet trail.
 * Redrawn when the time changes; one canvas per rain level (0.1 steps), shared by every pane.
 */
export const rainGlass = (amount: number, time: number) => {
  const lvl = Math.max(1, Math.min(10, Math.round(amount * 10)));
  let e = rainCanvases.get(lvl);
  if (!e) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 384;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    e = { tex, c, key: "" };
    rainCanvases.set(lvl, e);
  }
  const key = time.toFixed(3);
  if (e.key !== key) {
    e.key = key;
    const g = e.c.getContext("2d")!;
    const W = e.c.width;
    const H = e.c.height;
    g.clearRect(0, 0, W, H);
    const a = lvl / 10;
    const drop = (x: number, y: number, rx: number, ry: number, k: number) => {
      // a lens: a dark rim (refracted dark ground), a bright highlight up-left, a light lower lobe
      for (const dx of [-W, 0, W])
        for (const dy of [-H, 0, H]) {
          const X = x + dx;
          const Y = y + dy;
          if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
          g.fillStyle = `rgba(30,38,48,${0.14 * k})`;
          g.beginPath();
          g.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(225,236,248,${0.5 * k})`;
          g.beginPath();
          g.ellipse(X + rx * 0.1, Y + ry * 0.25, rx * 0.62, ry * 0.5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(255,255,255,${0.9 * k})`;
          g.beginPath();
          g.arc(X - rx * 0.3, Y - ry * 0.35, Math.max(0.6, rx * 0.22), 0, Math.PI * 2);
          g.fill();
        }
    };
    // beads: each lives ~3-6 s, fading in and out
    const nb = Math.round(260 * a);
    for (let i = 0; i < nb; i++) {
      const life = 3 + 3 * hash3(i, 1, 41);
      const cyc = Math.floor((time + hash3(i, 2, 41) * life) / life);
      const age = (time + hash3(i, 2, 41) * life) / life - cyc;
      const k = Math.min(1, age * 6, (1 - age) * 4);
      const x = hash3(i, cyc, 42) * W;
      const y = hash3(i, cyc, 43) * H;
      const rr = 1.2 + 2.6 * hash3(i, cyc, 44) ** 2;
      drop(x, y, rr, rr * 1.08, k);
    }
    // runners: a drop holds, then slides (a stick-slip), meandering, with a trail
    const nr = Math.round(16 * a);
    for (let i = 0; i < nr; i++) {
      const period = 2.2 + 2.5 * hash3(i, 5, 51);
      const ph = hash3(i, 6, 51) * period;
      const cyc = Math.floor((time + ph) / period);
      const age = ((time + ph) / period - cyc) * period;
      const x0 = hash3(i, cyc, 52) * W;
      const speed = 150 + 160 * hash3(i, cyc, 53);
      // stick-slip progress
      const prog = speed * (0.8 * age + 0.02 * (1 - Math.cos(age * 9 + i)));
      const y = prog - 20;
      if (y > H + 30) continue;
      const wob = (yy: number) => x0 + 5 * Math.sin(yy * 0.045 + i) + 3 * Math.sin(yy * 0.13 + i * 2);
      const rr = 2.6 + 2.0 * hash3(i, cyc, 54);
      // the trail (thin, broken, beaded)
      g.strokeStyle = "rgba(200,215,230,0.22)";
      g.lineWidth = rr * 0.7;
      g.lineCap = "round";
      g.beginPath();
      for (let yy = Math.max(-20, y - 160); yy < y; yy += 4) {
        const xx = wob(yy);
        if (yy === Math.max(-20, y - 160)) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.stroke();
      for (let yy = y - 150; yy < y - 8; yy += 14 + 10 * hash3(i, Math.floor(yy), 55)) {
        if (yy < -10) continue;
        drop(wob(yy), yy, rr * 0.35, rr * 0.4, 0.7);
      }
      drop(wob(y), y, rr, rr * 1.35, 1);
    }
    e.tex.needsUpdate = true;
  }
  return e.tex;
};

// ======================================================================================= glows
/** A soft round sprite (white centre fading out) for halos and light pools. */
export const haloB = () =>
  canvasTex("b-halo", 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.15, "rgba(255,255,255,0.6)");
    grd.addColorStop(0.42, "rgba(255,255,255,0.16)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
/** A thin ring (a splash's ripple). */
export const ringB = () =>
  canvasTex("b-ring", 128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.75, "rgba(255,255,255,0.3)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
/** Pine: dark needles over a darker core, for the garland's inner body (u along, v around). */
export const pineTex = () =>
  canvasTex(
    "b-pine",
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#14261A";
      g.fillRect(0, 0, w, h);
      const r = rand(23);
      for (let i = 0; i < 2600; i++) {
        const x = r() * w;
        const y = r() * h;
        const a = (r() - 0.5) * 1.6 + (r() < 0.5 ? 0 : Math.PI);
        const l = 6 + r() * 12;
        const gg = 60 + r() * 70;
        g.strokeStyle = `rgb(${20 + r() * 25},${gg},${30 + r() * 30})`;
        g.lineWidth = 1 + r() * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    },
    [6, 1],
  );
