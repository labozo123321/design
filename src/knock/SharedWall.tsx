import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, mat, rand } from "../roadster/materials";
import { ROOM, WALL } from "./layout";
import { rippled } from "./ripple";

/**
 * The narrator: the wall between the two rooms, cut just above the beds so its whole cross-section shows
 * from above: a 5/8" drywall skin either side (painted lavender on Nora's side, blue on yours), pine 2x4
 * studs every 40 cm with their end grain on the cut, the bottom plate on the floor, and between them the
 * dark cavity: the backs of the drywall (grey-brown paper, a few screw tips), dust on the plate that thickens
 * over the years, a cobweb across one slot from 2016. Every surface shows the knock rings.
 */

const pineTex = () =>
  canvasTex("pineEnd", 128, 128, (g, w, h) => {
    g.fillStyle = "#D1A66C";
    g.fillRect(0, 0, w, h);
    // growth rings, off centre
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `rgba(140,90,40,${0.25 + (k % 3) * 0.12})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(w * 0.8, h * 1.6, 40 + k * 7, Math.PI * 1.1, Math.PI * 1.75);
      g.stroke();
    }
    const r = rand(3);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90,60,30,${r() * 0.15})`;
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  });
const pineSideTex = () =>
  canvasTex(
    "pineSide",
    64,
    256,
    (g, w, h) => {
      g.fillStyle = "#CFA36A";
      g.fillRect(0, 0, w, h);
      const r = rand(9);
      for (let k = 0; k < 14; k++) {
        const x = r() * w;
        g.strokeStyle = `rgba(150,100,50,${0.2 + r() * 0.2})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h);
        g.stroke();
      }
    },
    [1, 2],
  );
/** The back of drywall: grey-brown paper with faint fibres and the odd screw tip. */
const paperTex = () =>
  canvasTex(
    "drywallBack",
    128,
    256,
    (g, w, h) => {
      g.fillStyle = "#8C8173";
      g.fillRect(0, 0, w, h);
      const r = rand(5);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "40,32,24" : "200,190,170"},${r() * 0.12})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = "#2B2B2E";
        g.beginPath();
        g.arc(r() * w, r() * h, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    },
    [1, 3],
  );
/** Dust on the bottom plate: soft grey drifts, heavier with the years (amount 0..1 picks a level). */
const dustTex = (level: number) =>
  canvasTex(
    `plateDust${level}`,
    64,
    512,
    (g, w, h) => {
      g.fillStyle = "#C59A62";
      g.fillRect(0, 0, w, h);
      const r = rand(13 + level);
      const n = 300 + level * 1600;
      for (let i = 0; i < n; i++) {
        const a = 0.05 + r() * 0.14;
        g.fillStyle = `rgba(150,145,140,${a})`;
        const s = 1 + r() * (2 + level * 2);
        g.beginPath();
        g.arc(r() * w, r() * h, s, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < level * 40; i++) {
        g.strokeStyle = `rgba(200,195,190,${0.2 + r() * 0.2})`;
        g.lineWidth = 0.6;
        g.beginPath();
        const x = r() * w;
        const y = r() * h;
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10);
        g.stroke();
      }
    },
    [1, 4],
  );

const plaster = () => rippled("wallPlaster", new THREE.MeshStandardMaterial({ color: "#F1ECE3", roughness: 0.85 }), 1.3);
/** The simple cut's cap over the wall's top: plain plaster (the rings pass under it, never as a band on it). */
let CAP: THREE.Material | null = null;
const capMat = () => (CAP ??= new THREE.MeshStandardMaterial({ color: "#F1ECE3", roughness: 0.85 }));
const face = (c: string) => rippled(`wallFace${c}`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.88 }), 0.9);
const pineEnd = () => rippled("pineEnd", new THREE.MeshStandardMaterial({ map: pineTex(), roughness: 0.75 }), 1.6);
const pineSide = () => rippled("pineSide", new THREE.MeshStandardMaterial({ map: pineSideTex(), roughness: 0.8 }), 1.6);
const paper = () => rippled("drywallBack", new THREE.MeshStandardMaterial({ map: paperTex(), roughness: 0.95 }), 1.8);
const plateMat = (level: number) => rippled(`plate${level}`, new THREE.MeshStandardMaterial({ map: dustTex(level), roughness: 0.95 }), 1.8);

const Box: React.FC<{ a: [number, number, number]; b: [number, number, number]; mats: THREE.Material | THREE.Material[]; cast?: boolean }> = ({ a, b, mats, cast = true }) => (
  <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} material={mats} castShadow={cast} receiveShadow>
    <boxGeometry args={[b[0] - a[0], b[1] - a[1], b[2] - a[2]]} />
  </mesh>
);

/** A cobweb strung across a slot near the top: fine radial and spiral threads (catching the light). */
const Cobweb: React.FC<{ z0: number; z1: number; k: number }> = ({ z0, z1, k }) => {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const cx = 0;
    const cy = WALL.cut - 0.12;
    const cz = (z0 + z1) / 2;
    const R = (z1 - z0) / 2;
    const rr = rand(21);
    const spokes = 9;
    const anchor = (a: number) => {
      const dz = Math.cos(a) * R;
      const dy = Math.sin(a) * R * 0.9;
      return [cx + (rr() - 0.5) * 0.04, cy + dy, cz + dz];
    };
    const ends: number[][] = [];
    for (let i = 0; i < spokes; i++) {
      const e = anchor((i / spokes) * Math.PI * 2);
      ends.push(e);
      pts.push(cx, cy, cz, e[0], e[1], e[2]);
    }
    for (let ring = 1; ring < 8; ring++) {
      const f = ring / 8;
      for (let i = 0; i < spokes; i++) {
        const a = ends[i];
        const b = ends[(i + 1) % spokes];
        pts.push(cx + (a[0] - cx) * f, cy + (a[1] - cy) * f, cz + (a[2] - cz) * f, cx + (b[0] - cx) * f, cy + (b[1] - cy) * f, cz + (b[2] - cz) * f);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [z0, z1]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#E8E4DC" transparent opacity={0.55 * k} />
    </lineSegments>
  );
};

/** capped: the cut top closed over with a plaster cap (the simple cut never looks inside the wall). */
export const SharedWall: React.FC<{ noraPaint: string; youPaint: string; dust: number; cobweb: number; capped?: boolean; children?: React.ReactNode }> = ({ noraPaint, youPaint, dust, cobweb, capped, children }) => {
  const H = WALL.cut;
  const X = WALL.half;
  const s = WALL.skin;
  const z0 = ROOM.back;
  const z1 = ROOM.front;
  const pl = plaster();
  const nf = face(noraPaint);
  const yf = face(youPaint);
  const pp = paper();
  const pe = pineEnd();
  const ps = pineSide();
  const level = Math.round(dust * 3);
  const plate = plateMat(level);
  // skins: [+x, -x, +y, -y, +z, -z]
  return (
    <group>
      <Box a={[-X, 0, z0]} b={[-X + s, H, z1]} mats={[pp, nf, pl, pl, pl, pl]} />
      <Box a={[X - s, 0, z0]} b={[X, H, z1]} mats={[yf, pp, pl, pl, pl, pl]} />
      {/* the bottom plate on the floor between the skins */}
      <Box a={[-X + s, 0, z0]} b={[X - s, WALL.plateH, z1]} mats={[ps, ps, plate, ps, ps, ps]} cast={false} />
      {/* the studs, cut at the top: end grain up */}
      {WALL.studs.map((z, i) => (
        <Box key={i} a={[-X + s, WALL.plateH, z - WALL.studW / 2]} b={[X - s, H, z + WALL.studW / 2]} mats={[ps, ps, pe, ps, ps, ps]} />
      ))}
      {capped ? <Box a={[-X, H, z0]} b={[X, H + 0.004, z1]} mats={capMat()} cast={false} /> : null}
      {/* a cobweb across the slot by her pillow, from 2016 */}
      {cobweb > 0 ? <Cobweb z0={-2.84 - WALL.studW / 2} z1={-2.44 + WALL.studW / 2} k={cobweb} /> : null}
      {children}
    </group>
  );
};

export { mat };
