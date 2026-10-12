import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash } from "./flight";

/**
 * Flowers for everything: a rose (three rings of cupped petals round a tight bud), a leaf, a sprig of
 * baby's breath; and bouquets of them as instance lists (position, rotation, scale, colour) that the
 * arch, the aisle, the bride, the tables and the cake all use.
 */

/** One petal: a cupped, slightly curled quad strip, base at the origin, opening up +y. */
const petal = (w: number, h: number, cup: number, curl: number) => {
  const g = new THREE.PlaneGeometry(w, h, 4, 5);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) + h / 2;
    const u = y / h;
    // narrow at the base, round at the top; cupped across, curled back at the tip
    const width = Math.sin(Math.PI * (0.18 + 0.82 * u)) * (0.55 + 0.45 * u);
    const xx = x * width;
    const z = cup * (xx / (w / 2)) ** 2 * w * 0.5 - curl * u * u * h;
    p.setXYZ(i, xx, y, z);
  }
  g.computeVertexNormals();
  return g;
};

let roseGeo: THREE.BufferGeometry | null = null;
/** A rose head about 1 unit across (scale to ~0.06 m). */
export const rose = () => {
  if (roseGeo) return roseGeo;
  const parts: THREE.BufferGeometry[] = [];
  const rings: [number, number, number, number, number][] = [
    // count, petal width, height, tilt out, curl
    [3, 0.42, 0.42, 0.15, 0.0],
    [5, 0.55, 0.5, 0.42, 0.06],
    [6, 0.62, 0.52, 0.78, 0.12],
    [7, 0.66, 0.5, 1.05, 0.2],
  ];
  rings.forEach(([n, w, h, tilt, curl], ri) => {
    for (let k = 0; k < n; k++) {
      const g = petal(w, h, 0.5, curl);
      g.rotateX(-tilt);
      g.translate(0, 0, 0.05 + ri * 0.05);
      g.rotateY((k / n) * Math.PI * 2 + ri * 0.7);
      parts.push(g);
    }
  });
  // the bud in the middle
  const bud = new THREE.SphereGeometry(0.12, 10, 8);
  bud.scale(1, 1.4, 1);
  bud.translate(0, 0.2, 0);
  parts.push(bud.toNonIndexed());
  roseGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  roseGeo.computeVertexNormals();
  roseGeo.translate(0, -0.15, 0);
  return roseGeo;
};

let leafGeo: THREE.BufferGeometry | null = null;
/** A leaf, 1 unit long, lying along +y, folded a little along its vein. */
export const leaf = () => {
  if (leafGeo) return leafGeo;
  const g = new THREE.PlaneGeometry(0.42, 1, 4, 6);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) + 0.5;
    const width = Math.sin(Math.PI * Math.min(1, y * 1.05)) ** 0.8;
    p.setXYZ(i, x * width, y, Math.abs(x * width) * 0.35 - y * y * 0.12);
  }
  g.computeVertexNormals();
  leafGeo = g;
  return g;
};

let sprigGeo: THREE.BufferGeometry | null = null;
/** Baby's breath: a cloud of tiny white flowers on fine stems (1 unit tall). */
export const sprig = () => {
  if (sprigGeo) return sprigGeo;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 26; k++) {
    const a = hash(k * 3.1) * Math.PI * 2;
    const r = hash(k * 5.7) * 0.35;
    const b = new THREE.IcosahedronGeometry(0.035 + hash(k) * 0.02, 0);
    b.translate(Math.cos(a) * r, 0.6 + hash(k * 9.1) * 0.4, Math.sin(a) * r);
    parts.push(b);
  }
  sprigGeo = mergeGeometries(parts)!;
  return sprigGeo;
};

export type Bloom = { kind: "rose" | "leaf" | "sprig"; m: THREE.Matrix4; c: THREE.Color };

export const ROSE_COLS = ["#FFF8F2", "#F7E1DC", "#F2C7C0", "#E8A9A0", "#FBEFE6", "#F4D6B8"];

/**
 * A cluster of flowers round a centre: roses facing outward over a hemisphere (dome up, or a spray toward
 * `dir`), leaves tucked between, sprigs of baby's breath. Size in metres across.
 */
export const bouquet = (
  centre: THREE.Vector3,
  size: number,
  seed: number,
  opts: { dir?: THREE.Vector3; roses?: number; cols?: string[]; spread?: number } = {},
): Bloom[] => {
  const out: Bloom[] = [];
  const dir = (opts.dir ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
  const n = opts.roses ?? Math.max(4, Math.round(size * 40));
  const cols = opts.cols ?? ROSE_COLS;
  const spread = opts.spread ?? 1.2;
  const basis = new THREE.Matrix4();
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(dir, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
  basis.makeBasis(t1, dir, t2);
  const r = (k: number) => hash(seed * 31.7 + k * 1.913);
  const place = (k: number, polarMax: number) => {
    // a point on a dome round dir
    const az = r(k) * Math.PI * 2;
    const pol = Math.sqrt(r(k + 0.5)) * polarMax;
    const local = new THREE.Vector3(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az));
    return local.applyMatrix4(basis);
  };
  for (let k = 0; k < n; k++) {
    const nrm = place(k * 3, spread);
    const s = size * (0.14 + 0.06 * r(k * 7));
    const p = centre.clone().addScaledVector(nrm, size * 0.42);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r(k * 11) * 6.28));
    out.push({ kind: "rose", m: new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)), c: new THREE.Color(cols[Math.floor(r(k * 13) * cols.length)]) });
  }
  for (let k = 0; k < Math.round(n * 1.4); k++) {
    const nrm = place(k * 5 + 101, spread * 1.15);
    const s = size * (0.16 + 0.1 * r(k * 17));
    const p = centre.clone().addScaledVector(nrm, size * 0.38);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r(k * 19) * 6.28));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4));
    const green = new THREE.Color().setHSL(0.26 + r(k * 23) * 0.06, 0.35, 0.22 + r(k * 29) * 0.1);
    out.push({ kind: "leaf", m: new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)), c: green });
  }
  for (let k = 0; k < Math.round(n * 0.5); k++) {
    const nrm = place(k * 7 + 211, spread);
    const s = size * (0.22 + 0.1 * r(k * 31));
    const p = centre.clone().addScaledVector(nrm, size * 0.32);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    out.push({ kind: "sprig", m: new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)), c: new THREE.Color("#FFFFFF") });
  }
  return out;
};

const matCache: Record<string, THREE.Material> = {};
export const flowerMats = () => ({
  rose: (matCache.rose ??= new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color("#ffffff"), side: THREE.DoubleSide })),
  leaf: (matCache.leaf ??= new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, side: THREE.DoubleSide })),
  sprig: (matCache.sprig ??= new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 })),
});

/** Instanced meshes for a list of blooms (one per kind). */
export const bloomMeshes = (list: Bloom[], extra?: (m: THREE.Material) => THREE.Material) => {
  const mats = flowerMats();
  const out: THREE.InstancedMesh[] = [];
  for (const kind of ["rose", "leaf", "sprig"] as const) {
    const items = list.filter((b) => b.kind === kind);
    if (!items.length) continue;
    const geo = kind === "rose" ? rose() : kind === "leaf" ? leaf() : sprig();
    const mat = extra ? extra(mats[kind]) : mats[kind];
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((b, i) => {
      im.setMatrixAt(i, b.m);
      im.setColorAt(i, b.c);
    });
    im.castShadow = kind !== "sprig";
    im.receiveShadow = true;
    im.frustumCulled = false;
    out.push(im);
  }
  return out;
};
