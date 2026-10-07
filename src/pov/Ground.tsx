import React, { useMemo } from "react";
import * as THREE from "three";
import { random } from "remotion";
import { CITY_R, city, traffic } from "./city";
import { EARTH_R } from "./timeline";

/* ------------------------------------------------------------------ */
/* Planet: a log-polar cap on the true curvature                        */
/* ------------------------------------------------------------------ */

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, oct = 5) => {
  let f = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    f += a * noise(x, y);
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return f;
};

const LAND = {
  field1: new THREE.Color("#9DB46A"),
  field2: new THREE.Color("#C9B87A"),
  field3: new THREE.Color("#7FA05A"),
  forest: new THREE.Color("#3F6B3A"),
  suburb: new THREE.Color("#B7AE9E"),
  water: new THREE.Color("#2F6FA8"),
  ocean: new THREE.Color("#1D4F86"),
  rock: new THREE.Color("#A89A86"),
  snow: new THREE.Color("#F2F2F2"),
};

const landColor = (x: number, z: number, r: number) => {
  const base = landBase(x, z, r);
  // weather seen from altitude: swirling cloud cover away from the city
  const cl = fbm(x / 110000 - 4.3, z / 110000 + 8.1, 6);
  const cover = Math.min(1, Math.max(0, (cl - 0.56) * 4)) * Math.min(1, Math.max(0, (r - 30000) / 30000));
  return base.lerp(new THREE.Color("#F4F6FA"), cover * 0.9);
};

const landBase = (x: number, z: number, r: number) => {
  // large-scale geography first (reads from altitude), detail only close to the city
  const continent = fbm(x / 650000 + 3.1, z / 650000 - 1.7, 5);
  if (r > 120000 && continent < 0.4) {
    const depth = Math.min(1, (0.4 - continent) * 9);
    return new THREE.Color("#2E78B5").lerp(LAND.ocean, depth);
  }
  const shore = r > 120000 && continent < 0.43;
  const biome = fbm(x / 160000 - 6.2, z / 160000 + 2.4, 4);
  const regional =
    biome > 0.62
      ? new THREE.Color("#B59A6A")
      : biome > 0.5
        ? new THREE.Color("#8FA35E")
        : new THREE.Color("#5E8A47");
  const mount = fbm(x / 90000 + 9, z / 90000 + 4, 4);
  if (r > 60000 && mount > 0.68) return LAND.rock.clone().lerp(LAND.snow, Math.min(1, (mount - 0.68) * 14));
  const lake = fbm(x / 9000 + 5, z / 9000 - 2, 3);
  if (lake > 0.74 && r > 3000) return LAND.water.clone();
  if (shore) return new THREE.Color("#C9BE96");
  const detail = Math.max(0, 1 - r / 40000); // fields and suburbs only near the city
  const forest = fbm(x / 3500 - 7, z / 3500 + 3, 4);
  const patch = hash(Math.floor(x / 420), Math.floor(z / 420));
  let near = patch < 0.33 ? LAND.field1.clone() : patch < 0.66 ? LAND.field2.clone() : LAND.field3.clone();
  if (forest > 0.6) near = LAND.forest.clone();
  if (r < 6000) near = LAND.suburb.clone().lerp(LAND.field3, Math.max(0, (r - 3000) / 3000) * 0.7);
  return regional.lerp(near, detail);
};

export const Planet: React.FC = () => {
  const geo = useMemo(() => {
    const SEG = 512;
    const RINGS = 300;
    const r0 = CITY_R - 120;
    const r1 = 3.0e6;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= RINGS; k++) {
      const r = r0 * Math.pow(r1 / r0, k / RINGS);
      const y = -(r * r) / (EARTH_R + Math.sqrt(EARTH_R * EARTH_R - r * r)) - 0.3;
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2 + (k % 2) * (Math.PI / SEG);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.push(x, y, z);
        const c = landColor(x, z, r);
        c.offsetHSL(0, 0, (hash(s, k) - 0.5) * 0.02 * Math.max(0, 1 - r / 40000));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < RINGS; k++)
      for (let s = 0; s < SEG; s++) {
        const a = k * SEG + s;
        const b = k * SEG + ((s + 1) % SEG);
        const c = (k + 1) * SEG + s;
        const d = (k + 1) * SEG + ((s + 1) % SEG);
        idx.push(a, b, c, b, d, c); // counter-clockwise seen from above: faces (and normals) point up
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/* City ground: street grid                                             */
/* ------------------------------------------------------------------ */

let streetTex: THREE.Texture | null = null;
const streets = () => {
  if (streetTex) return streetTex;
  const N = 512;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const px = N / 96; // pixels per metre
  g.fillStyle = "#CFC8BB"; // block paving
  g.fillRect(0, 0, N, N);
  g.fillStyle = "#45484E"; // asphalt, 8 m each side of the cell edge
  g.fillRect(0, 0, N, 6 * px);
  g.fillRect(0, N - 6 * px, N, 6 * px);
  g.fillRect(0, 0, 6 * px, N);
  g.fillRect(N - 6 * px, 0, 6 * px, N);
  g.fillStyle = "#B9B2A6"; // sidewalks
  g.fillRect(6 * px, 6 * px, N - 12 * px, 2.2 * px);
  g.fillRect(6 * px, N - 8.2 * px, N - 12 * px, 2.2 * px);
  g.fillRect(6 * px, 6 * px, 2.2 * px, N - 12 * px);
  g.fillRect(N - 8.2 * px, 6 * px, 2.2 * px, N - 12 * px);
  g.strokeStyle = "#E8D27A"; // centre lines
  g.lineWidth = 1.2;
  g.setLineDash([3 * px, 3 * px]);
  g.beginPath();
  g.moveTo(10 * px, 0.6);
  g.lineTo(N - 10 * px, 0.6);
  g.moveTo(0.6, 10 * px);
  g.lineTo(0.6, N - 10 * px);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#EDEDED"; // crosswalks
  for (let k = 0; k < 6; k++) {
    g.fillRect(8.6 * px + k * 1.2 * px, N - 5.6 * px, 0.6 * px, 11 * px - N + N);
    g.fillRect(N - 5.6 * px, 8.6 * px + k * 1.2 * px, 11 * px - N + N, 0.6 * px);
  }
  streetTex = new THREE.CanvasTexture(c);
  streetTex.wrapS = streetTex.wrapT = THREE.RepeatWrapping;
  streetTex.colorSpace = THREE.SRGBColorSpace;
  streetTex.anisotropy = 8;
  return streetTex;
};

export const CityGround: React.FC = () => {
  const tex = streets();
  const size = CITY_R * 2 + 200;
  tex.repeat.set(size / 96, size / 96);
  const off = ((((-size / 2) % 96) + 96) % 96) / 96;
  tex.offset.set(off, off);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      {/* the river runs the full width of the city */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, -19]}>
        <planeGeometry args={[size, 11]} />
        <meshStandardMaterial color="#3E80C4" roughness={0.25} metalness={0.15} />
      </mesh>
      {city.parks.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.02, p.z]} receiveShadow>
          <planeGeometry args={[p.w, p.d]} />
          <meshStandardMaterial color="#6E9A4E" roughness={1} />
        </mesh>
      ))}
    </group>
  );
};

/* ------------------------------------------------------------------ */
/* Buildings, roofs, trees, traffic (instanced)                         */
/* ------------------------------------------------------------------ */

const facadeCache: Record<string, THREE.Texture> = {};
/** A window grid for one storey x one bay, tinted per building by instance colour. */
const windowTex = (kind: number) => {
  const key = String(kind);
  if (facadeCache[key]) return facadeCache[key];
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, 64, 64);
  if (kind === 0) {
    g.fillStyle = "#5B6B82";
    g.fillRect(14, 14, 36, 38);
    g.fillStyle = "#8FA2BC";
    g.fillRect(14, 14, 36, 10);
  } else {
    // glass tower: horizontal bands
    g.fillStyle = "#4E6584";
    g.fillRect(0, 10, 64, 44);
    g.fillStyle = "#7F9AC0";
    g.fillRect(0, 10, 64, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  facadeCache[key] = t;
  return t;
};

/** Box whose side UVs are in metres / (bay, storey) so windows keep their size on any building. */
const unitBox = (bay: number, storey: number) => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  return { g, bay, storey };
};

const Buildings: React.FC = () => {
  const groups = useMemo(() => {
    // split into towers (glass) and the rest; each instance gets its own UV scale via per-instance geometry groups
    const towers = city.buildings.filter((b) => b.h > 70);
    const rest = city.buildings.filter((b) => b.h <= 70);
    return [
      { list: rest, kind: 0, storey: 3.4, bay: 3.2 },
      { list: towers, kind: 1, storey: 3.8, bay: 6 },
    ];
  }, []);
  return (
    <group>
      {groups.map((grp) => (
        <BuildingSet key={grp.kind} {...grp} />
      ))}
    </group>
  );
};

/** Buildings merged into one geometry per kind, with UVs scaled per building (no stretched windows). */
const BuildingSet: React.FC<{ list: typeof city.buildings; kind: number; storey: number; bay: number }> = ({
  list,
  kind,
  storey,
  bay,
}) => {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const base = unitBox(bay, storey).g;
    const bp = base.attributes.position;
    const bn = base.attributes.normal;
    const bi = base.index!;
    list.forEach((b) => {
      const off = pos.length / 3;
      const c = new THREE.Color(b.c);
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i) * b.w + b.x;
        const y = (bp.getY(i) + 0.5) * b.h;
        const z = bp.getZ(i) * b.d + b.z;
        pos.push(x, y, z);
        const nx = bn.getX(i);
        const ny = bn.getY(i);
        const nz = bn.getZ(i);
        nor.push(nx, ny, nz);
        // side faces: u along the face width, v along height; roofs get a flat tint (uv in a solid area)
        if (Math.abs(ny) > 0.5) uv.push(0.02, 0.02);
        else {
          const along = Math.abs(nx) > 0.5 ? (bp.getZ(i) + 0.5) * b.d : (bp.getX(i) + 0.5) * b.w;
          uv.push(along / bay, (bp.getY(i) + 0.5) * (b.h / storey));
        }
        const shade = Math.abs(ny) > 0.5 ? 0.82 : 1;
        col.push(c.r * shade, c.g * shade, c.b * shade);
      }
      for (let i = 0; i < bi.count; i++) idx.push(bi.getX(i) + off);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }, [list, bay, storey]);
  return (
    <mesh geometry={geo} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial
        map={windowTex(kind)}
        vertexColors
        roughness={kind ? 0.35 : 0.85}
        metalness={kind ? 0.25 : 0}
      />
    </mesh>
  );
};

/** Rooftop clutter: AC units and water tanks. */
const Roofs: React.FC = () => {
  const { boxes, tanks } = useMemo(() => {
    const boxes: THREE.Matrix4[] = [];
    const tanks: THREE.Matrix4[] = [];
    city.buildings.forEach((b, i) => {
      const n = 1 + Math.floor(b.roof * 3);
      for (let k = 0; k < n; k++) {
        const r = (s: string) => random(`rf${i}${k}${s}`);
        const m = new THREE.Matrix4();
        const w = 1.5 + r("w") * 3;
        m.compose(
          new THREE.Vector3(b.x + (r("x") - 0.5) * b.w * 0.6, b.h + 0.8, b.z + (r("z") - 0.5) * b.d * 0.6),
          new THREE.Quaternion(),
          new THREE.Vector3(w, 1.6, w * 0.7),
        );
        boxes.push(m);
      }
      if (b.roof > 0.7 && b.h < 70) {
        const m = new THREE.Matrix4();
        m.compose(
          new THREE.Vector3(b.x + b.w * 0.2, b.h + 2.4, b.z - b.d * 0.2),
          new THREE.Quaternion(),
          new THREE.Vector3(2.2, 4.8, 2.2),
        );
        tanks.push(m);
      }
    });
    return { boxes, tanks };
  }, []);
  return (
    <group>
      <Instanced matrices={boxes} color="#9A9690">
        <boxGeometry args={[1, 1, 1]} />
      </Instanced>
      <Instanced matrices={tanks} color="#7A5A3C">
        <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
      </Instanced>
    </group>
  );
};

const Instanced: React.FC<{
  matrices: THREE.Matrix4[];
  color: string;
  children: React.ReactNode;
  colors?: THREE.Color[];
  shadow?: boolean;
}> = ({ matrices, color, children, colors, shadow = true }) => {
  const ref = React.useRef<THREE.InstancedMesh>(null);
  React.useLayoutEffect(() => {
    const m = ref.current!;
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [matrices, colors]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, matrices.length)]}
      castShadow={shadow}
      receiveShadow
      frustumCulled={false}
    >
      {children}
      <meshStandardMaterial color={colors ? "#FFFFFF" : color} roughness={0.85} flatShading />
    </instancedMesh>
  );
};

const Trees: React.FC = () => {
  const { trunks, crowns, colors } = useMemo(() => {
    const trunks: THREE.Matrix4[] = [];
    const crowns: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    city.trees.forEach((t, i) => {
      const a = new THREE.Matrix4();
      a.compose(
        new THREE.Vector3(t.x, 1.6 * t.s, t.z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.35 * t.s, 3.2 * t.s, 0.35 * t.s),
      );
      trunks.push(a);
      const b = new THREE.Matrix4();
      b.compose(
        new THREE.Vector3(t.x, 4.4 * t.s, t.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random(`tr${i}`) * 3, 0)),
        new THREE.Vector3(2.6 * t.s, 2.4 * t.s, 2.6 * t.s),
      );
      crowns.push(b);
      colors.push(
        new THREE.Color().setHSL(0.28 + random(`tc${i}`) * 0.06, 0.42, 0.3 + random(`tl${i}`) * 0.1),
      );
    });
    return { trunks, crowns, colors };
  }, []);
  return (
    <group>
      <Instanced matrices={trunks} color="#6B4A2F">
        <cylinderGeometry args={[0.5, 0.6, 1, 6]} />
      </Instanced>
      <Instanced matrices={crowns} color="#4E9E43" colors={colors}>
        <icosahedronGeometry args={[1, 0]} />
      </Instanced>
    </group>
  );
};

const Traffic: React.FC<{ t: number }> = ({ t }) => {
  const cars = traffic(t);
  const { mats, cols } = useMemo(() => ({ mats: [] as THREE.Matrix4[], cols: [] as THREE.Color[] }), []);
  mats.length = 0;
  cols.length = 0;
  cars.forEach((c) => {
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(c.x, 0.8, c.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.rot, 0)),
      new THREE.Vector3(1.9, 1.4, 4.3),
    );
    mats.push(m);
    cols.push(new THREE.Color(c.c));
  });
  return (
    <Instanced matrices={[...mats]} color="#FFF" colors={[...cols]} shadow={false}>
      <boxGeometry args={[1, 1, 1]} />
    </Instanced>
  );
};

export const City: React.FC<{ t: number; alt: number }> = ({ t, alt }) => (
  <group>
    <CityGround />
    <Buildings />
    <Roofs />
    <Trees />
    {alt < 4000 ? <Traffic t={t} /> : null}
  </group>
);
