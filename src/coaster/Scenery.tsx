import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TR } from "./track";
import { PATHS, PLAN, PLAZAS, groundY, lakeD } from "./Terrain";
import { RIDE_SPOTS } from "./Rides";

/**
 * Everything else that makes it a park: trees (round shade trees, palms by the lake, a belt of woods round
 * the edge), lamp posts along the paths, food and game stalls with striped awnings along the midway, people
 * walking the paths, the car park, and beyond it all low hills and a city on the horizon.
 *
 * Nothing is placed where the coaster runs low, on its supports, on a path, in the lake or on a ride.
 */

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ------------------------------------------------------------------ */
/* Where things may go                                                  */
/* ------------------------------------------------------------------ */

const CELL = 1.0;
const NG = Math.round(PLAN.size / CELL);
type Occ = Uint8Array; // 0 free lawn, 1 path, 2 blocked
let occCache: Occ | null = null;
const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - PLAN.x0) / CELL);
  const j = Math.floor((z - PLAN.z0) / CELL);
  return i < 0 || j < 0 || i >= NG || j >= NG ? -1 : j * NG + i;
};
const mark = (o: Occ, x: number, z: number, r: number, v: number) => {
  const n = Math.ceil(r / CELL);
  const ci = Math.floor((x - PLAN.x0) / CELL);
  const cj = Math.floor((z - PLAN.z0) / CELL);
  for (let dj = -n; dj <= n; dj++)
    for (let di = -n; di <= n; di++) {
      if (di * di + dj * dj > n * n) continue;
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
      o[j * NG + i] = Math.max(o[j * NG + i], v);
    }
};
export const occupancy = (): Occ => {
  if (occCache) return occCache;
  const o = new Uint8Array(NG * NG);
  // paths and plazas
  for (const p of PATHS)
    for (let k = 0; k < p.pts.length - 1; k++) {
      const [x0, z0] = p.pts[k];
      const [x1, z1] = p.pts[k + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 0; s <= L; s += 0.5) mark(o, x0 + ((x1 - x0) * s) / L, z0 + ((z1 - z0) * s) / L, p.w / 2 + 0.5, 1);
    }
  for (const pl of PLAZAS) {
    if (pl.kind === "rect") {
      for (let x = pl.v[0]; x <= pl.v[2]; x += 0.5) for (let z = pl.v[1]; z <= pl.v[3]; z += 0.5) mark(o, x, z, 0.5, 1);
    } else {
      for (let a = 0; a < Math.PI * 2; a += 0.05)
        for (let r = 0; r <= 1; r += 0.05) mark(o, pl.v[0] + Math.cos(a) * pl.v[2] * r, pl.v[1] + Math.sin(a) * pl.v[3] * r, 0.6, 1);
    }
  }
  // the coaster: everywhere it runs below 22 m, a wide berth; its supports
  const P = TR.P as number[];
  for (let i = 0; i < P.length / 3; i += 2) {
    const y = P[i * 3 + 1];
    if (y < 24) mark(o, P[i * 3], P[i * 3 + 2], y < 8 ? 7 : 5, 2);
  }
  for (const sp of TR.supports as { pts: number[][] }[]) {
    const b = sp.pts[sp.pts.length - 1];
    mark(o, b[0], b[2], 4, 2);
  }
  // the station, the rides
  for (let x = -54; x <= 4; x += 1) for (let z = -14; z <= 10; z += 1) mark(o, x, z, 1, 2);
  mark(o, RIDE_SPOTS.WHEEL.x, RIDE_SPOTS.WHEEL.z, 30, 2);
  mark(o, RIDE_SPOTS.TOWER.x, RIDE_SPOTS.TOWER.z, 10, 2);
  mark(o, 18, -86, 14, 2);
  mark(o, -130, -70, 12, 2);
  mark(o, -30, -100, 14, 2);
  mark(o, -262, -48, 26, 2);
  for (let x = 130; x <= 330; x += 3) for (let z = -70; z <= -10; z += 3) mark(o, x, z, 3, 2);
  occCache = o;
  return o;
};
const free = (o: Occ, x: number, z: number) => {
  const c = cellOf(x, z);
  if (c < 0) return true;
  return o[c] === 0 && lakeD(x, z) > 1.14;
};

/* ------------------------------------------------------------------ */
/* Trees                                                                */
/* ------------------------------------------------------------------ */

const leafTex = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 256, 256);
    const r = rng(5);
    for (let k = 0; k < 2600; k++) {
      const x = r() * 256;
      const y = r() * 256;
      const l = r();
      g.fillStyle = `rgba(${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},${l > 0.5 ? 255 : 0},${0.12 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(x, y, 2 + r() * 4, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
})();

/** A round shade tree: trunk, branches, a lumpy canopy (unit height ~1, scaled per instance). */
const shadeTree = () => {
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.45, 7);
  trunk.translate(0, 0.225, 0);
  const blobs: THREE.BufferGeometry[] = [];
  const r = rng(9);
  const centers: [number, number, number, number][] = [
    [0, 0.68, 0, 0.3],
    [0.17, 0.62, 0.08, 0.22],
    [-0.15, 0.6, -0.1, 0.23],
    [0.05, 0.83, -0.12, 0.2],
    [-0.08, 0.78, 0.15, 0.2],
    [0.12, 0.5, -0.17, 0.18],
  ];
  for (const [x, y, z, s] of centers) {
    const b = new THREE.IcosahedronGeometry(s, 2);
    const p = b.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (r() - 0.5) * 0.18;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
    }
    b.computeVertexNormals();
    blobs.push(b);
  }
  const canopy = mergeGeometries(blobs.map((b) => b.toNonIndexed()))!;
  // spherical-ish uvs for the leaf texture
  const p = canopy.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) * 1.5;
    uv[i * 2 + 1] = p.getY(i) * 3;
  }
  canopy.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return { trunk, canopy };
};

const palm = () => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push(new THREE.Vector3(0.08 * u * u, u, 0));
  }
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.03, 6, false);
  const fronds: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const f = new THREE.ConeGeometry(0.06, 0.55, 3);
    f.rotateX(Math.PI / 2);
    f.scale(1, 0.25, 1);
    f.translate(0, 0, 0.27);
    f.rotateX(0.35);
    f.rotateY(a);
    f.translate(0.08, 1.0, 0);
    fronds.push(f);
  }
  return { trunk, fronds: mergeGeometries(fronds.map((g) => g.toNonIndexed()))! };
};

const Trees: React.FC = () => {
  const data = useMemo(() => {
    const o = occupancy();
    const r = rng(21);
    const shade: THREE.Matrix4[] = [];
    const palms: THREE.Matrix4[] = [];
    const shadeCol: THREE.Color[] = [];
    const tryPlace = (x: number, z: number, kind: "shade" | "palm", h: number) => {
      if (!free(o, x, z)) return false;
      const y = groundY(x, z);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * Math.PI * 2, 0)),
        new THREE.Vector3(h * (0.85 + r() * 0.3), h, h * (0.85 + r() * 0.3)),
      );
      if (kind === "shade") {
        shade.push(m);
        shadeCol.push(new THREE.Color().setHSL(0.22 + r() * 0.08, 0.45 + r() * 0.2, 0.22 + r() * 0.1));
      } else palms.push(m);
      mark(o, x, z, h * 0.25, 2);
      return true;
    };
    // groves in the lawns, palms round the lake
    for (let k = 0; k < 2600; k++) {
      const x = PLAN.x0 + r() * PLAN.size;
      const z = PLAN.z0 + r() * PLAN.size;
      const ld = lakeD(x, z);
      if (ld < 1.5 && r() < 0.6) tryPlace(x, z, "palm", 9 + r() * 5);
      else tryPlace(x, z, "shade", 9 + r() * 7);
    }
    // a belt of woods round the edge of the park
    for (let k = 0; k < 1800; k++) {
      const a = r() * Math.PI * 2;
      const rad = 300 + r() * 220;
      const x = -55 + Math.cos(a) * rad;
      const z = 5 + Math.sin(a) * rad;
      if (z > 180 && z < 360 && x > -200 && x < 140) continue; // the car park
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(14 + r() * 8, 12 + r() * 8, 14 + r() * 8));
      shade.push(m);
      shadeCol.push(new THREE.Color().setHSL(0.24 + r() * 0.06, 0.4, 0.18 + r() * 0.08));
    }
    return { shade, palms, shadeCol };
  }, []);
  const meshes = useMemo(() => {
    const st = shadeTree();
    const pm = palm();
    const leaf = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, map: leafTex() });
    const bark = new THREE.MeshStandardMaterial({ color: "#5A4532", roughness: 0.95 });
    const frond = new THREE.MeshStandardMaterial({ color: "#3F6B2A", roughness: 0.85, side: THREE.DoubleSide });
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], cols?: THREE.Color[]) => {
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      if (cols) cols.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      return im;
    };
    return [
      mk(st.trunk, bark, data.shade),
      mk(st.canopy, leaf, data.shade, data.shadeCol),
      mk(pm.trunk, bark, data.palms),
      mk(pm.fronds, frond, data.palms),
    ];
  }, [data]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Lamps, stalls, benches                                               */
/* ------------------------------------------------------------------ */

const awningTex = (a: string, b: string) => {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(i * 8, 0, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const Furniture: React.FC = () => {
  const data = useMemo(() => {
    const r = rng(33);
    const lamps: THREE.Matrix4[] = [];
    const stalls: { m: THREE.Matrix4; c: number }[] = [];
    // lamps every ~16 m along both sides of every path
    for (const p of PATHS)
      for (let k = 0; k < p.pts.length - 1; k++) {
        const [x0, z0] = p.pts[k];
        const [x1, z1] = p.pts[k + 1];
        const L = Math.hypot(x1 - x0, z1 - z0);
        const nx = -(z1 - z0) / L;
        const nz = (x1 - x0) / L;
        for (let s = 4; s < L; s += 16)
          for (const side of [-1, 1]) {
            const x = x0 + ((x1 - x0) * s) / L + nx * side * (p.w / 2 + 0.6);
            const z = z0 + ((z1 - z0) * s) / L + nz * side * (p.w / 2 + 0.6);
            if (lakeD(x, z) < 1.12) continue;
            lamps.push(new THREE.Matrix4().makeTranslation(x, groundY(x, z), z));
          }
      }
    // stalls along the midway's north side and the lake front
    const mid = PATHS[0].pts;
    for (let k = 0; k < mid.length - 1; k++) {
      const [x0, z0] = mid[k];
      const [x1, z1] = mid[k + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const ang = Math.atan2(z1 - z0, x1 - x0);
      for (let s = 6; s < L - 4; s += 9 + r() * 4) {
        const x = x0 + ((x1 - x0) * s) / L;
        const z = z0 + ((z1 - z0) * s) / L - 10.5;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -ang, 0)), new THREE.Vector3(1, 1, 1));
        stalls.push({ m, c: Math.floor(r() * 4) });
      }
    }
    return { lamps, stalls };
  }, []);
  const meshes = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6);
    pole.translate(0, 2.1, 0);
    const head = new THREE.SphereGeometry(0.28, 10, 8);
    head.translate(0, 4.3, 0);
    const lp = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: "#2C2F35", roughness: 0.5, metalness: 0.5 }), data.lamps.length);
    const lh = new THREE.InstancedMesh(head, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.1, 1.4) }), data.lamps.length);
    data.lamps.forEach((m, i) => {
      lp.setMatrixAt(i, m);
      lh.setMatrixAt(i, m);
    });
    for (const im of [lp, lh]) {
      im.frustumCulled = false;
      out.push(im);
    }
    lp.castShadow = true;
    // stalls: a booth, a counter, an awning (four colourways)
    const cols: [string, string][] = [
      ["#E8463A", "#F4F1EA"],
      ["#3E8FD8", "#F4F1EA"],
      ["#F2C14E", "#E8463A"],
      ["#4EB36A", "#F4F1EA"],
    ];
    const booth = new THREE.BoxGeometry(4.2, 2.6, 3.2);
    booth.translate(0, 1.3, 0);
    const awn = new THREE.BoxGeometry(4.6, 0.08, 1.6);
    awn.rotateX(-0.35);
    awn.translate(0, 2.7, 2.1);
    const roof = new THREE.ConeGeometry(3.3, 1.2, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, 0.78);
    roof.translate(0, 3.2, 0);
    cols.forEach(([a, b], ci) => {
      const list = data.stalls.filter((s) => s.c === ci);
      if (!list.length) return;
      const mats = [
        new THREE.MeshStandardMaterial({ color: "#F4F1EA", roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ map: awningTex(a, b), roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: a, roughness: 0.7 }),
      ];
      [booth, awn, roof].forEach((g, gi) => {
        const im = new THREE.InstancedMesh(g, mats[gi], list.length);
        list.forEach((s, i) => im.setMatrixAt(i, s.m));
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        out.push(im);
      });
    });
    return out;
  }, [data]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* People on the paths                                                  */
/* ------------------------------------------------------------------ */

type Walker = { path: number; s0: number; speed: number; off: number; h: number; shirt: THREE.Color; pants: THREE.Color; skin: THREE.Color };
const pathLen = (pts: [number, number][]) => {
  let L = 0;
  for (let k = 0; k < pts.length - 1; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
  return L;
};
const along = (pts: [number, number][], s: number) => {
  let rest = s;
  for (let k = 0; k < pts.length - 1; k++) {
    const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    if (rest <= L || k === pts.length - 2) {
      const u = Math.max(0, Math.min(1, rest / L));
      const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u;
      const z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u;
      return { x, z, dx: (pts[k + 1][0] - pts[k][0]) / L, dz: (pts[k + 1][1] - pts[k][1]) / L };
    }
    rest -= L;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
};

const Crowd: React.FC<{ t: number; avoid?: THREE.Vector3 }> = ({ t, avoid }) => {
  const walkers = useMemo(() => {
    const r = rng(77);
    const out: Walker[] = [];
    const skins = ["#F3D2B5", "#EBC09C", "#D9A37A", "#C08A60", "#9A6844", "#6E4730"];
    const shirts = ["#E05A4F", "#3E6FB0", "#F2C14E", "#4E9A6A", "#7B5BA6", "#F4F1EA", "#2F2F3A", "#E98A3B", "#5DA9C9", "#C94F7C"];
    PATHS.forEach((p, pi) => {
      const L = pathLen(p.pts);
      const n = Math.round((L * p.w) / 70);
      for (let k = 0; k < n; k++)
        out.push({
          path: pi,
          s0: r() * L,
          speed: (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.6) * (r() < 0.15 ? 0 : 1),
          off: (r() - 0.5) * (p.w - 1.2),
          h: 1.55 + r() * 0.35 - (r() < 0.15 ? 0.45 : 0),
          shirt: new THREE.Color(shirts[Math.floor(r() * shirts.length)]),
          pants: new THREE.Color(["#2E3A55", "#3B4A6B", "#262A33", "#6B5A47", "#9A9A92"][Math.floor(r() * 5)]),
          skin: new THREE.Color(skins[Math.floor(r() * skins.length)]),
        });
    });
    return out;
  }, []);
  const meshes = useMemo(() => {
    const body = new THREE.CapsuleGeometry(0.17, 0.42, 4, 8);
    body.translate(0, 1.15, 0);
    body.scale(1, 1, 0.7);
    const legs = new THREE.CapsuleGeometry(0.15, 0.62, 4, 8);
    legs.scale(1, 1, 0.75);
    legs.translate(0, 0.45, 0);
    const head = new THREE.SphereGeometry(0.11, 10, 8);
    head.translate(0, 1.62, 0);
    const mk = (g: THREE.BufferGeometry) => {
      const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }), walkers.length);
      im.castShadow = true;
      im.frustumCulled = false;
      return im;
    };
    const b = mk(body);
    const l = mk(legs);
    const h = mk(head);
    walkers.forEach((w, i) => {
      b.setColorAt(i, w.shirt);
      l.setColorAt(i, w.pants);
      h.setColorAt(i, w.skin);
    });
    return { b, l, h };
  }, [walkers]);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  walkers.forEach((w, i) => {
    const pts = PATHS[w.path].pts;
    const L = pathLen(pts);
    const s = (((w.s0 + w.speed * t) % L) + L) % L;
    const a = along(pts, s);
    const x = a.x - a.dz * w.off;
    const z = a.z + a.dx * w.off;
    const dir = w.speed >= 0 ? 1 : -1;
    q.setFromEuler(new THREE.Euler(0, Math.atan2(-a.dx * dir, -a.dz * dir), 0));
    const bob = w.speed ? Math.abs(Math.sin(t * 5.5 + i)) * 0.04 : 0;
    // nobody walks right up to a camera on the ground (they'd be the low-detail kind)
    const near = avoid ? Math.hypot(x - avoid.x, z - avoid.z) < 40 : false;
    const k = near ? 0.0001 : w.h / 1.75;
    sc.set(k, k, k);
    m.compose(new THREE.Vector3(x, groundY(x, z) + bob, z), q, sc);
    meshes.b.setMatrixAt(i, m);
    meshes.l.setMatrixAt(i, m);
    meshes.h.setMatrixAt(i, m);
  });
  meshes.b.instanceMatrix.needsUpdate = true;
  meshes.l.instanceMatrix.needsUpdate = true;
  meshes.h.instanceMatrix.needsUpdate = true;
  return (
    <>
      <primitive object={meshes.b} />
      <primitive object={meshes.l} />
      <primitive object={meshes.h} />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Car park, hills, city                                                */
/* ------------------------------------------------------------------ */

const CarPark: React.FC = () => {
  const { lot, cars, glass } = useMemo(() => {
    const r = rng(55);
    const list: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const cols = ["#F4F1EA", "#1C1C1F", "#8C8F94", "#C0392B", "#2E4A7A", "#D9D4C7", "#4A4F57"];
    for (let row = 0; row < 12; row++)
      for (let k = 0; k < 46; k++) {
        if (r() < 0.22) continue;
        const x = -170 + k * 6.2;
        const z = 215 + row * 9 + (row % 2) * 5.2;
        list.push({
          m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + (r() - 0.5) * 0.08, 0)), new THREE.Vector3(1, 1, 1)),
          c: new THREE.Color(cols[Math.floor(r() * cols.length)]),
        });
      }
    const body = new THREE.BoxGeometry(1.85, 0.75, 4.4);
    body.translate(0, 0.62, 0);
    const cab = new THREE.BoxGeometry(1.6, 0.55, 2.3);
    cab.translate(0, 1.25, -0.2);
    const cars = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, metalness: 0.4 }), list.length);
    const glass = new THREE.InstancedMesh(cab, new THREE.MeshStandardMaterial({ color: "#20262E", roughness: 0.1, metalness: 0.3 }), list.length);
    list.forEach((l, i) => {
      cars.setMatrixAt(i, l.m);
      cars.setColorAt(i, l.c);
      glass.setMatrixAt(i, l.m);
    });
    cars.frustumCulled = glass.frustumCulled = false;
    const lot = new THREE.PlaneGeometry(310, 120);
    lot.rotateX(-Math.PI / 2);
    lot.translate(-30, 0.03, 268);
    return { lot, cars, glass };
  }, []);
  return (
    <>
      <mesh geometry={lot} material={new THREE.MeshStandardMaterial({ color: "#3A3B3E", roughness: 0.9 })} receiveShadow />
      <primitive object={cars} />
      <primitive object={glass} />
    </>
  );
};

const Distance: React.FC = () => {
  const { hills, city, windows } = useMemo(() => {
    // low hills in a ring from 1 to 5 km
    const g = new THREE.RingGeometry(900, 6000, 160, 12);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const d = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      const h = (Math.sin(a * 5 + 1.3) * 0.5 + 0.5) * 60 + (Math.sin(a * 13 + 0.4) * 0.5 + 0.5) * 30 + (Math.sin(a * 31) * 0.5 + 0.5) * 12;
      p.setY(i, h * Math.min(1, (d - 900) / 1400) - 2);
    }
    g.computeVertexNormals();
    // a city to the east-north-east: towers on a grid
    const r = rng(91);
    const blocks: THREE.BufferGeometry[] = [];
    const win: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 260; k++) {
      const a = -0.55 + r() * 0.75;
      const d = 1700 + r() * 900;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const w = 18 + r() * 30;
      const h = 20 + r() * r() * 160;
      const b = new THREE.BoxGeometry(w, h, w * (0.7 + r() * 0.6));
      b.translate(x, h / 2, z);
      blocks.push(b);
      if (r() < 0.6) {
        const lit = new THREE.BoxGeometry(w * 1.01, h * 0.8, 1);
        lit.translate(x, h * 0.45, z - w * 0.36);
        win.push(lit);
      }
    }
    return { hills: g, city: mergeGeometries(blocks)!, windows: win.length ? mergeGeometries(win)! : null };
  }, []);
  return (
    <>
      <mesh geometry={hills} material={new THREE.MeshStandardMaterial({ color: "#5D6E4A", roughness: 1 })} />
      <mesh geometry={city} material={new THREE.MeshStandardMaterial({ color: "#8A93A3", roughness: 0.6, metalness: 0.2 })} />
      {windows ? <mesh geometry={windows} material={new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.05, 0.7), transparent: true, opacity: 0.35 })} /> : null}
    </>
  );
};

export const Scenery: React.FC<{ t: number; avoid?: THREE.Vector3 }> = ({ t, avoid }) => (
  <>
    <Trees />
    <Furniture />
    <Crowd t={t} avoid={avoid} />
    <CarPark />
    <Distance />
  </>
);
