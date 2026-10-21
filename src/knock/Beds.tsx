import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, mat, rand } from "../roadster/materials";
import { trim } from "../home/materials";
import { BED, PILLOW, ROOM, WALL } from "./layout";
import { rippled } from "./ripple";

/**
 * The beds: a frame and a headboard against the back wall, the mattress, the pillow (its top a height
 * field with the dent of whoever lies on it), and the covers: a height field over the mattress lifted by
 * the body under it (capsules for the torso and the legs, so nothing under the covers can ever poke
 * through), smoothed, hanging over the outer edge and the foot as a skirt, with the sheet's turned-down band
 * at the top.
 *
 * side -1 is Nora's bed (against the wall's left face), +1 is yours.
 */

export type Capsule = { a: THREE.Vector3; b: THREE.Vector3; r: number };
export type HeadRest = { at: THREE.Vector3; r: number } | null;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** The bed's rectangle on the floor for a side, and its mattress top. */
export type BedSpec = { x0: number; x1: number; z0: number; z1: number; top: number };
export const bedRect = (side: -1 | 1): BedSpec => {
  const x0 = side < 0 ? -WALL.half - BED.w : WALL.half;
  return { x0, x1: x0 + BED.w, z0: ROOM.back, z1: ROOM.back + BED.len, top: BED.top };
};
/** The air mattress (2025): against the wall where her bed was, a little lower, no frame. */
export const airRect = (): BedSpec => ({ x0: -WALL.half - 0.99, x1: -WALL.half - 0.004, z0: ROOM.back + 0.04, z1: ROOM.back + 0.04 + 1.9, top: 0.45 });

const quiltingTex = () =>
  canvasTex(
    "mattressQuilt",
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#F4F1EA";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(150,140,125,0.45)";
      g.lineWidth = 2;
      for (let i = -h; i < w + h; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + h, h);
        g.stroke();
        g.beginPath();
        g.moveTo(i + h, 0);
        g.lineTo(i, h);
        g.stroke();
      }
    },
    [3, 6],
  );

/** Where the height of the covers must be at least (top of whatever is under them, plus the cloth). */
const capsuleTop = (caps: Capsule[], x: number, z: number) => {
  let top = -1;
  const p = V(x, 0, z);
  for (const c of caps) {
    // closest point on the segment, in plan
    const ab = V(c.b.x - c.a.x, 0, c.b.z - c.a.z);
    const L2 = ab.lengthSq();
    const t = L2 > 1e-8 ? Math.max(0, Math.min(1, ((p.x - c.a.x) * ab.x + (p.z - c.a.z) * ab.z) / L2)) : 0;
    const qx = c.a.x + ab.x * t;
    const qz = c.a.z + ab.z * t;
    const qy = c.a.y + (c.b.y - c.a.y) * t;
    const d2 = (p.x - qx) ** 2 + (p.z - qz) ** 2;
    if (d2 < c.r * c.r) top = Math.max(top, qy + Math.sqrt(c.r * c.r - d2));
  }
  return top;
};

/** The covers' heights on a grid (nx by nz) over x0..x1 (the mattress) and zTop..z1, given the body. */
const coverHeights = (x0: number, x1: number, zTop: number, z1: number, nx: number, nz: number, caps: Capsule[], loft: number, top: number) => {
  const req = new Float32Array(nx * nz);
  const h = new Float32Array(nx * nz);
  const base = top + 0.025 + loft;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((x1 - x0) * i) / (nx - 1);
      const z = zTop + ((z1 - zTop) * j) / (nz - 1);
      const ct = capsuleTop(caps, x, z);
      const r = ct > 0 ? ct + 0.02 : base;
      req[j * nx + i] = Math.max(base, r);
      h[j * nx + i] = Math.max(base, r + 0.015);
    }
  // soften (cloth spans the gaps between limbs), never dropping below what's required
  const tmp = new Float32Array(nx * nz);
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        let s = 0;
        let n = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const ii = Math.min(nx - 1, Math.max(0, i + di));
            const jj = Math.min(nz - 1, Math.max(0, j + dj));
            const wgt = 1 / (1 + di * di + dj * dj);
            s += h[jj * nx + ii] * wgt;
            n += wgt;
          }
        tmp[j * nx + i] = Math.max(req[j * nx + i], s / n);
      }
    h.set(tmp);
  }
  return h;
};

/** The covers: top surface + the outer and foot skirts + the turned-down band, as one geometry. */
const coverGeometry = (side: -1 | 1, r: BedSpec, zTop: number, caps: Capsule[], loft: number, drape: number, inset = 0) => {
  // the wall side is tucked against the wall; the outer side hangs over
  const xWall = side < 0 ? r.x1 - 0.004 - inset * 0.3 : r.x0 + 0.004 + inset * 0.3;
  const xOut = side < 0 ? r.x0 - 0.02 + inset : r.x1 + 0.02 - inset;
  const x0 = Math.min(xWall, xOut);
  const x1 = Math.max(xWall, xOut);
  const z1 = r.z1 + 0.02 - inset * 0.6;
  const nx = 26;
  const nz = 44;
  const h = coverHeights(x0, x1, zTop, z1, nx, nz, caps, loft, r.top);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const at = (i: number, j: number) => h[j * nx + i];
  // top
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((x1 - x0) * i) / (nx - 1);
      const z = zTop + ((z1 - zTop) * j) / (nz - 1);
      // the edges round down a little toward the skirt
      const edgeOut = side < 0 ? i === 0 : i === nx - 1;
      const edgeFoot = j === nz - 1;
      const y = at(i, j) - (edgeOut || edgeFoot ? 0.02 : 0);
      pos.push(x, y, z);
      uv.push((x - r.x0) / 1.0, (z - r.z0) / 1.0);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  // skirts: the outer side and the foot hang down by `drape`, bellying out a little
  const base = pos.length / 3;
  const skirt = (pts: [number, number, number][], out: THREE.Vector3) => {
    const b0 = pos.length / 3;
    for (const [x, y, z] of pts) {
      for (let k = 0; k <= 4; k++) {
        const f = k / 4;
        const belly = Math.sin(f * Math.PI) * 0.012 + f * 0.01;
        pos.push(x + out.x * belly, y - f * (y - (r.top - drape)), z + out.z * belly);
        uv.push((x - r.x0) / 1.0 + (out.x !== 0 ? f * 0.3 : 0), (z - r.z0) / 1.0 + (out.z !== 0 ? f * 0.3 : 0));
      }
    }
    for (let p = 0; p < pts.length - 1; p++)
      for (let k = 0; k < 4; k++) {
        const a = b0 + p * 5 + k;
        idx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
      }
  };
  void base;
  const outI = side < 0 ? 0 : nx - 1;
  const outPts: [number, number, number][] = [];
  for (let j = 0; j < nz; j++) outPts.push([pos[(j * nx + outI) * 3], pos[(j * nx + outI) * 3 + 1], pos[(j * nx + outI) * 3 + 2]]);
  skirt(outPts, V(side < 0 ? -1 : 1, 0, 0));
  const footPts: [number, number, number][] = [];
  for (let i = 0; i < nx; i++) footPts.push([pos[((nz - 1) * nx + i) * 3], pos[((nz - 1) * nx + i) * 3 + 1], pos[((nz - 1) * nx + i) * 3 + 2]]);
  skirt(footPts, V(0, 0, 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the band: the sheet turned down over the top edge (the first rows of the grid, lifted a hair)
  const band: number[] = [];
  const bIdx: number[] = [];
  const rows = 4;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < nx; i++) {
      const o = (j * nx + i) * 3;
      band.push(pos[o], pos[o + 1] + 0.004, pos[o + 2]);
    }
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      bIdx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(band, 3));
  bg.setIndex(bIdx);
  bg.computeVertexNormals();
  return { cover: g, band: bg };
};

/** The pillow: a soft slab across the head of the bed whose top dips where a head rests on it. */
const pillowGeometry = (r: BedSpec, rest: HeadRest, puff: number, pz = PILLOW.z, cxOverride?: number) => {
  const cx = cxOverride ?? (r.x0 + r.x1) / 2;
  const w = PILLOW.w;
  const d = PILLOW.d;
  const nx = 28;
  const nz = 18;
  const pos: number[] = [];
  const idx: number[] = [];
  const top = (u: number, v: number) => {
    // a cushion: full in the middle, pinched at the seams
    const e = Math.sin(Math.PI * u) ** 0.45 * Math.sin(Math.PI * v) ** 0.45;
    return r.top + 0.012 + PILLOW.h * puff * e;
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1);
      const v = j / (nz - 1);
      const x = cx - w / 2 + w * u;
      const z = pz - d / 2 + d * v;
      let y = top(u, v);
      if (rest) {
        const dd = Math.hypot(x - rest.at.x, z - rest.at.z);
        const R = rest.r * 1.25;
        if (dd < R) y = Math.min(y, rest.at.y - Math.sqrt(Math.max(0, R * R - dd * dd)) * 0.78 - 0.004);
        // the dent's soft rim
        y -= 0.01 * Math.exp(-(((dd - R) / 0.05) ** 2));
        y = Math.max(r.top + 0.01, y);
      }
      pos.push(x, y, z);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  // the underside, flat on the mattress (closes the shape)
  const b0 = pos.length / 3;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const o = (j * nx + i) * 3;
      pos.push(pos[o], r.top + 0.002, pos[o + 2]);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = b0 + j * nx + i;
      idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

export type BedLook = {
  frame: string;
  /** the covers (a material, e.g. a quilt) and the sheet/pillowcase */
  cover: THREE.MeshStandardMaterial;
  sheet: THREE.MeshStandardMaterial;
  pillowcase?: THREE.MeshStandardMaterial;
};

const cloth = (key: string, color: string) => mat(`bedCloth-${key}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
export const plainSheet = (color = "#F5F2EA") => cloth(`sheet${color}`, color);

/** One bed. kind: the twin bed (frame, headboard, mattress), the air mattress (2025), or "none" (only the
 * covers and pillow: on the floor). covers: the body under them and where they start (null: none); bag:
 * the covers are a sleeping bag (narrower, drawn in round the body, hanging only a little). rest: the head on
 * the pillow. */
export const Bed: React.FC<{
  side: -1 | 1;
  look: BedLook;
  kind?: "twin" | "air" | "none";
  spec?: BedSpec;
  covers?: { zTop: number; caps: Capsule[]; loft?: number; drape?: number; bag?: boolean } | null;
  rest?: HeadRest;
  pillow?: boolean;
  pillowAt?: { x: number; z: number };
  bare?: boolean;
}> = ({ side, look, kind = "twin", spec, covers, rest = null, pillow = true, pillowAt, bare = false }) => {
  const r = spec ?? (kind === "air" ? airRect() : bedRect(side));
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const len = r.z1 - r.z0;
  const wood = mat(`bedWood-${look.frame}`, () => new THREE.MeshStandardMaterial({ color: look.frame, roughness: 0.55 }));
  const mattress = rippled("mattress", new THREE.MeshStandardMaterial({ map: quiltingTex(), roughness: 0.9 }), 0.7);
  const vinyl = rippled("airVinyl", new THREE.MeshStandardMaterial({ color: "#5E6368", roughness: 0.55 }), 0.6);
  // (cloth: both sides drawn, so the skirts' windings don't matter)
  const cover = rippled(`cover-${look.cover.uuid}`, Object.assign(look.cover.clone(), { side: THREE.DoubleSide }), 0.8);
  const sheet = rippled(`sheet-${look.sheet.uuid}`, Object.assign(look.sheet.clone(), { side: THREE.DoubleSide }), 0.8);
  const pc = rippled(`pc-${(look.pillowcase ?? look.sheet).uuid}`, look.pillowcase ?? look.sheet, 0.9);
  const geo = useMemo(
    () => (covers ? coverGeometry(side, r, covers.zTop, covers.caps, covers.loft ?? (covers.bag ? 0.035 : 0.02), covers.drape ?? (covers.bag ? 0.03 : 0.24), covers.bag ? 0.2 : 0) : null),
    // the covers follow the body every frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, JSON.stringify(r), covers ? JSON.stringify(covers) : ""],
  );
  const pgeo = useMemo(
    () => pillowGeometry(r, rest, 1, pillowAt?.z ?? PILLOW.z, pillowAt?.x),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(r), rest ? `${rest.at.x.toFixed(4)},${rest.at.y.toFixed(4)},${rest.at.z.toFixed(4)},${rest.r}` : "", pillowAt?.x, pillowAt?.z],
  );
  const frameH = BED.frameH;
  return (
    <group>
      {kind === "twin" ? (
        <>
          {/* the frame: side rails, the foot board, legs; the headboard against the back wall */}
          <mesh position={[cx, frameH - 0.09, cz]} material={wood} castShadow receiveShadow>
            <boxGeometry args={[w + 0.04, 0.16, len + 0.02]} />
          </mesh>
          {[r.x0 + 0.03, r.x1 - 0.03].map((x, i) => (
            <mesh key={i} position={[x, (frameH - 0.17) / 2, r.z1 - 0.03]} material={wood} castShadow>
              <boxGeometry args={[0.05, frameH - 0.17, 0.05]} />
            </mesh>
          ))}
          <mesh position={[cx, 0.52, r.z1 + 0.012]} material={wood} castShadow receiveShadow>
            <boxGeometry args={[w + 0.06, 0.38, 0.025]} />
          </mesh>
          <mesh position={[cx, BED.headboardH / 2, r.z0 + 0.016]} material={wood} castShadow receiveShadow>
            <boxGeometry args={[w + 0.06, BED.headboardH, 0.03]} />
          </mesh>
          <mesh position={[cx, BED.headboardH + 0.015, r.z0 + 0.016]} material={trim()} castShadow>
            <boxGeometry args={[w + 0.1, 0.03, 0.05]} />
          </mesh>
          <mesh position={[cx, (frameH + r.top) / 2, cz]} material={mattress} castShadow receiveShadow>
            <boxGeometry args={[w - 0.01, r.top - frameH, len - 0.02]} />
          </mesh>
        </>
      ) : kind === "air" ? (
        // the air mattress: grey vinyl sides with a seam, a flocked top under the sheet
        <>
          <mesh position={[cx, r.top / 2, cz]} material={vinyl} castShadow receiveShadow>
            <boxGeometry args={[w, r.top, len]} />
          </mesh>
          <mesh position={[cx, r.top * 0.5, cz]} material={mat("airSeam", () => new THREE.MeshStandardMaterial({ color: "#4A4E52", roughness: 0.6 }))}>
            <boxGeometry args={[w + 0.006, 0.012, len + 0.006]} />
          </mesh>
        </>
      ) : null}
      {kind !== "none" && !bare ? (
        <mesh position={[cx, r.top + 0.002, cz]} rotation={[-Math.PI / 2, 0, 0]} material={sheet} receiveShadow>
          <planeGeometry args={[w - 0.012, len - 0.022]} />
        </mesh>
      ) : null}
      {pillow ? <mesh geometry={pgeo} material={pc} castShadow receiveShadow /> : null}
      {geo ? (
        <>
          <mesh geometry={geo.cover} material={cover} castShadow receiveShadow />
          {covers?.bag ? null : <mesh geometry={geo.band} material={sheet} receiveShadow />}
        </>
      ) : null}
    </group>
  );
};

export { rand };
