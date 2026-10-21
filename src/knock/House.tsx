import { floorboardsMat } from "./props/house";
import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, mat, rand } from "../roadster/materials";
import { oak, paint, trim } from "../home/materials";
import { DOOR, HALL, PORCH, ROOM, WALL, WINDOWS } from "./layout";

/**
 * The house slice: two upstairs bedrooms side by side, roofless, every wall cut so its cross-section shows on
 * top (plaster skins, the dark cavity, pine studs). The shared wall between the rooms is cut low (1.1 m), the
 * rest at 2.1 m. Carpet in the bedrooms, oak boards in the hallway behind the back wall, a stairwell beyond
 * it going down into the dark, the front wall's lap siding and the porch roof below the windows, the back
 * garden far below at the top of frame.
 *
 * Built from boxes so every cut face is capped. Paint per room and per era comes in as props.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- textures
/** Wall-to-wall carpet: a soft cut pile (fine speckle, a faint large-scale shading). */
const carpetTex = (key: string, base: string) =>
  canvasTex(
    `carpet-${key}`,
    512,
    512,
    (g, w, h) => {
      const r = rand(31);
      const c = new THREE.Color(base);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        const k = r();
        const l = 0.82 + r() * 0.3;
        const cc = c.clone().multiplyScalar(l);
        g.fillStyle = `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},${0.35 + k * 0.4})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
      }
    },
    [6, 8],
  );
export const carpet = (key: string, base: string) =>
  mat(`carpet-${key}`, () => {
    const map = carpetTex(key, base);
    return new THREE.MeshStandardMaterial({ map, roughness: 1, bumpMap: map, bumpScale: 0.6 });
  });

/** The cut top of an ordinary wall, along its length (u in metres): two white plaster skins either side of
 * a dark cavity, a pine stud's end grain every 40 cm. v runs across the thickness. */
const cutTopTex = () =>
  canvasTex(
    "cutTop",
    256,
    64,
    (g, w, h) => {
      // the cavity
      g.fillStyle = "#2A2421";
      g.fillRect(0, 0, w, h);
      // insulation-less dust
      const r = rand(7);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(160,140,120,${r() * 0.15})`;
        g.fillRect(r() * w, 10 + r() * (h - 20), 2, 2);
      }
      // the stud's end grain (one per tile; the tile is 0.4 m)
      const sx = w * 0.45;
      const sw = (w * 0.038) / 0.4;
      g.fillStyle = "#C9A06A";
      g.fillRect(sx, 9, sw, h - 18);
      g.strokeStyle = "rgba(120,80,40,0.6)";
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(sx + sw * 0.5, h * 0.5 + 30, 12 + k * 6, -Math.PI * 0.65, -Math.PI * 0.35);
        g.stroke();
      }
      // the skins (plaster white, the paper line on the inside)
      g.fillStyle = "#F2EEE6";
      g.fillRect(0, 0, w, 9);
      g.fillRect(0, h - 9, w, 9);
      g.fillStyle = "#B8AE9C";
      g.fillRect(0, 8, w, 1);
      g.fillRect(0, h - 9, w, 1);
    },
  );
const cutTopMat = () =>
  mat("cutTopMat", () => {
    const map = cutTopTex().clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  });

/** White lap siding on the outside walls (horizontal boards with a shadow line). */
const sidingTex = () =>
  canvasTex(
    "siding",
    256,
    256,
    (g, w, h) => {
      for (let y = 0; y < h; y += 32) {
        const grad = g.createLinearGradient(0, y, 0, y + 32);
        grad.addColorStop(0, "#B9BDBF");
        grad.addColorStop(0.12, "#E9ECEC");
        grad.addColorStop(1, "#DCE0E1");
        g.fillStyle = grad;
        g.fillRect(0, y, w, 32);
      }
    },
    [2, 8],
  );
const siding = () => mat("siding", () => new THREE.MeshStandardMaterial({ map: sidingTex(), roughness: 0.7 }));

// ------------------------------------------------------------------------------------------- geometry
/** A box with a material per face: [+x, -x, +y, -y, +z, -z] (three's BoxGeometry group order). */
const Slab: React.FC<{ a: [number, number, number]; b: [number, number, number]; mats: THREE.Material | THREE.Material[]; cast?: boolean }> = ({ a, b, mats, cast = true }) => {
  const size: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  if (size[0] <= 1e-4 || size[1] <= 1e-4 || size[2] <= 1e-4) return null;
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} material={mats} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
};

/** A flat cap over a wall top, its texture running along the wall in metres (u = length / 0.4). */
const Cap: React.FC<{ x0: number; x1: number; z0: number; z1: number; y: number; alongX: boolean }> = ({ x0, x1, z0, z1, y, alongX }) => {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i) + (x0 + x1) / 2;
      const pz = pos.getZ(i) + (z0 + z1) / 2;
      if (alongX) uv.setXY(i, px / 0.4, (pz - z0) / (z1 - z0));
      else uv.setXY(i, pz / 0.4, (px - x0) / (x1 - x0));
    }
    return g;
  }, [x0, x1, z0, z1, alongX]);
  return <mesh geometry={geo} material={cutTopMat()} position={[(x0 + x1) / 2, y + 0.0006, (z0 + z1) / 2]} receiveShadow />;
};

export type HousePaint = { nora: string; you: string; noraCarpet: string; youCarpet: string };

/** The ordinary walls (outer, back with the doors, front with the windows), cut at 2.1 m, capped. */
const Walls: React.FC<{ paint: HousePaint }> = ({ paint: p }) => {
  const H = ROOM.cut;
  const T = ROOM.wallT;
  const nora = paint(p.nora);
  const you = paint(p.you);
  const hallPaint = paint("#EDE6D8");
  const ext = siding();
  const tr = trim();
  const B = ROOM.back;
  const O = ROOM.outer;
  // back wall: rooms on its front face (+z), the hallway behind it (-z)
  const backSegs: [number, number][] = [
    [-O - T, -DOOR.x1],
    [-DOOR.x0, DOOR.x0],
    [DOOR.x1, O + T],
  ];
  const faceFor = (x: number) => (x < 0 ? nora : you);
  const back = backSegs.map(([x0, x1], i) => {
    // split at the shared wall so each room's face has its paint
    const parts: [number, number][] = x0 < 0 && x1 > 0 ? [[x0, 0], [0, x1]] : [[x0, x1]];
    return parts.map(([a, b], j) => (
      <Slab key={`b${i}${j}`} a={[a, 0, B - T]} b={[b, H, B]} mats={[tr, tr, tr, tr, faceFor((a + b) / 2), hallPaint]} />
    ));
  });
  // door lintels
  const lintels = [-1, 1].map((s) => {
    const x0 = s < 0 ? -DOOR.x1 : DOOR.x0;
    const x1 = s < 0 ? -DOOR.x0 : DOOR.x1;
    return <Slab key={`l${s}`} a={[x0, DOOR.h, B - T]} b={[x1, H, B]} mats={[tr, tr, tr, tr, faceFor(s), hallPaint]} />;
  });
  // front wall with two windows per room
  const fz0 = ROOM.front;
  const fz1 = ROOM.front + T;
  const xs = [...WINDOWS.xs.map((x) => -x), ...WINDOWS.xs].sort((a, b) => a - b);
  const front: React.ReactNode[] = [];
  let cur = -O - T;
  xs.forEach((cx, i) => {
    const w0 = cx - WINDOWS.w / 2;
    const w1 = cx + WINDOWS.w / 2;
    const parts: [number, number][] = cur < 0 && w0 > 0 ? [[cur, 0], [0, w0]] : [[cur, w0]];
    parts.forEach(([a, b], j) => front.push(<Slab key={`f${i}${j}`} a={[a, 0, fz0]} b={[b, H, fz1]} mats={[tr, tr, tr, tr, ext, faceFor((a + b) / 2)]} />));
    front.push(<Slab key={`fs${i}`} a={[w0, 0, fz0]} b={[w1, WINDOWS.sill, fz1]} mats={[tr, tr, tr, tr, ext, faceFor(cx)]} />);
    front.push(<Slab key={`fh${i}`} a={[w0, WINDOWS.head, fz0]} b={[w1, H, fz1]} mats={[tr, tr, tr, tr, ext, faceFor(cx)]} />);
    cur = w1;
  });
  front.push(<Slab key="fend" a={[cur, 0, fz0]} b={[O + T, H, fz1]} mats={[tr, tr, tr, tr, ext, you]} />);
  // outer walls
  const outer = [-1, 1].map((s) => (
    <Slab key={`o${s}`} a={[s < 0 ? -O - T : O, 0, B]} b={[s < 0 ? -O : O + T, H, fz0]} mats={s < 0 ? [nora, ext, tr, tr, tr, tr] : [ext, you, tr, tr, tr, tr]} />
  ));
  // hallway: its far side is the stairwell's banister; its ends are walls
  const hz0 = HALL.z1;
  const ends = [-1, 1].map((s) => <Slab key={`he${s}`} a={[s < 0 ? -O - T : O, 0, hz0 - T]} b={[s < 0 ? -O : O + T, H, B - T]} mats={[hallPaint, hallPaint, tr, tr, hallPaint, hallPaint]} />);
  // caps on every cut top
  const caps = (
    <>
      <Cap x0={-O - T} x1={O + T} z0={B - T} z1={B} y={H} alongX />
      <Cap x0={-O - T} x1={O + T} z0={fz0} z1={fz1} y={H} alongX />
      <Cap x0={-O - T} x1={-O} z0={B} z1={fz0} y={H} alongX={false} />
      <Cap x0={O} x1={O + T} z0={B} z1={fz0} y={H} alongX={false} />
      <Cap x0={-O - T} x1={-O} z0={hz0 - T} z1={B - T} y={H} alongX={false} />
      <Cap x0={O} x1={O + T} z0={hz0 - T} z1={B - T} y={H} alongX={false} />
    </>
  );
  return (
    <group>
      {back}
      {lintels}
      {front}
      {outer}
      {ends}
      {caps}
    </group>
  );
};

/** The floors: carpet in the rooms (by era), oak boards in the hallway, the stairwell going down beyond it. */
const Floors: React.FC<{ paint: HousePaint }> = ({ paint: p }) => {
  const O = ROOM.outer;
  const hall = floorboardsMat(2 * (O + ROOM.wallT), HALL.z0 - HALL.z1);
  const slab = paint("#6E665C");
  return (
    <group>
      <Slab a={[-O, -0.25, ROOM.back]} b={[-WALL.half, 0, ROOM.front]} mats={[slab, slab, carpet(`n${p.noraCarpet}`, p.noraCarpet), slab, slab, slab]} cast={false} />
      <Slab a={[WALL.half, -0.25, ROOM.back]} b={[O, 0, ROOM.front]} mats={[slab, slab, carpet(`y${p.youCarpet}`, p.youCarpet), slab, slab, slab]} cast={false} />
      <Slab a={[-WALL.half, -0.25, ROOM.back]} b={[WALL.half, 0, ROOM.front]} mats={slab} cast={false} />
      <Slab a={[-O - ROOM.wallT, -0.25, HALL.z1]} b={[O + ROOM.wallT, 0, ROOM.back - ROOM.wallT]} mats={[slab, slab, hall, slab, slab, slab]} cast={false} />
    </group>
  );
};

/** Beyond the hallway: the stairwell (a banister along the hallway's far edge, the stairs going down into
 * the dark), and far below at the top of frame the back garden at night. */
const Beyond: React.FC = () => {
  const O = ROOM.outer;
  const z0 = HALL.z1;
  const tr = trim();
  const treads = oak("stairs", "#9A6A3E", [0.4, 0.2]);
  const risers = paint("#E8E2D6");
  const steps = Array.from({ length: 12 }, (_, i) => {
    const y = -0.19 * (i + 1);
    const z = z0 - 0.27 * i;
    return (
      <group key={i}>
        <Slab a={[-0.55, y - 0.04, z - 0.27]} b={[0.55, y, z]} mats={[tr, tr, treads, risers, risers, risers]} cast={false} />
        <Slab a={[-0.55, y, z - 0.02]} b={[0.55, y + 0.19, z]} mats={risers} cast={false} />
      </group>
    );
  });
  return (
    <group>
      {/* the hallway's far edge: a landing nosing and the banister over the stairwell */}
      <Slab a={[-O, -0.25, z0 - 0.06]} b={[O, 0, z0]} mats={tr} cast={false} />
      {steps}
      {/* the stairwell's walls going down, and the dark below */}
      <Slab a={[-O, -3.0, z0 - 3.6]} b={[-0.55, 0, z0 - 0.06]} mats={paint("#3A3632")} cast={false} />
      <Slab a={[0.55, -3.0, z0 - 3.6]} b={[O, 0, z0 - 0.06]} mats={paint("#3A3632")} cast={false} />
      {/* the back garden at night, far below */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5.2, -9]} receiveShadow>
        <planeGeometry args={[30, 14]} />
        <meshStandardMaterial color="#141A14" roughness={1} />
      </mesh>
    </group>
  );
};

/** Outside the front wall: the porch roof (a placeholder slope until the shingled one is in) and the
 * ground far below. */
const Front: React.FC<{ porch?: React.ReactNode }> = ({ porch }) => (
  <group>
    {porch ?? (
      <mesh
        position={[0, (PORCH.yWall + PORCH.yEdge) / 2, (PORCH.z0 + PORCH.z1) / 2]}
        rotation={[Math.atan2(PORCH.yWall - PORCH.yEdge, PORCH.z1 - PORCH.z0), 0, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[2 * ROOM.outer + 0.6, 0.04, Math.hypot(PORCH.z1 - PORCH.z0, PORCH.yWall - PORCH.yEdge)]} />
        <meshStandardMaterial color="#4A4644" roughness={0.95} />
      </mesh>
    )}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5.2, 6]} receiveShadow>
      <planeGeometry args={[30, 12]} />
      <meshStandardMaterial color="#1C201B" roughness={1} />
    </mesh>
  </group>
);

export const House: React.FC<{ paint: HousePaint; porch?: React.ReactNode; children?: React.ReactNode }> = ({ paint: p, porch, children }) => (
  <group>
    <Walls paint={p} />
    <Floors paint={p} />
    <Beyond />
    <Front porch={porch} />
    {children}
  </group>
);

export { Slab, V };
