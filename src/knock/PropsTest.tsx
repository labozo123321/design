import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import {
  AirMattress,
  BoxedDeskLamp,
  Candle,
  CornerShelf,
  DarkerCarpetPatch,
  DecorativePillow,
  DinoLamp,
  DinoRug,
  Earplug,
  EarplugTin,
  FairyLights,
  FoldedNote,
  GlowMoon,
  GlowStar,
  Laptop,
  LavenderRug,
  MiniFridge,
  MovingBox,
  Outlet,
  OutletBox,
  Phone,
  PhotoStrip,
  PillowStack,
  PineSprig,
  Poster,
  SoccerBall,
  Starfield,
  TRex,
  ToyBoxContents,
  guestDuvetMat,
  navyDuvetMat,
  patchworkQuiltMat,
  pillowcaseMat,
  plainSheetMat,
  racecarDuvetMat,
  sleepingBagMat,
  soccerDuvetMat,
  starQuiltMat,
  stripedSheetMat,
  spiralCurve,
  sagCurve,
} from "./props";
import { geo } from "./props/textures";
import { BED, OUTLET, PILLOW, PRESETS, ROOM, SHELF, WALL, cameraFor, type Preset } from "./layout";

/**
 * A contact sheet of every prop in this module, page by page (the frame picks the page): the film's
 * overhead view (18 deg from vertical, toward the back wall, long lens) and a 3/4 view, under warm interior
 * light (night cells for the glowing things), then states, the bedding swatches, and a film check with the
 * props placed in a rough stand-in of the house at the real camera presets.
 * inputProps: { page?: number, focus?: string (a cell id: render that one cell full frame), view?: "top"|"q" }.
 */

type View = "top" | "q";
type Cell = {
  id: string;
  label: string;
  /** bounding radius of what to frame (m) */
  r: number;
  /** centre of interest relative to the cell origin */
  c?: [number, number, number];
  node: React.ReactNode;
  night?: boolean;
  /** no floor card (things on a wall or in the air) */
  noFloor?: boolean;
  /** a fixed camera (film presets) */
  cam?: Preset;
  /** a custom view direction for this cell (unit-ish, from target to camera) */
  dir?: [number, number, number];
  up?: [number, number, number];
  /** which side the 3/4 view comes from (+1: from +z, the default; -1: from -z, for props facing -z) */
  front?: 1 | -1;
  /** an explicit camera (cell-local position and target), with its own fov */
  look?: { pos: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number };
};

const TILT = THREE.MathUtils.degToRad(18);
const TOP_DIR = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
const Q_DIR = new THREE.Vector3(0.533, 0.5, 0.682).normalize();

// ------------------------------------------------------------------------------------------ stand-ins
const wallMat = new THREE.MeshStandardMaterial({ color: "#E8E2D6", roughness: 0.9 });
const studMat = new THREE.MeshStandardMaterial({ color: "#D9B57E", roughness: 0.8 });
const floorMat = new THREE.MeshStandardMaterial({ color: "#8C8278", roughness: 0.95 });
const carpetN = new THREE.MeshStandardMaterial({ color: "#B4A898", roughness: 0.98 });
const carpetY = new THREE.MeshStandardMaterial({ color: "#A99D8E", roughness: 0.98 });
const bedFrame = new THREE.MeshStandardMaterial({ color: "#F1EEE8", roughness: 0.5 });

/** A short wall stub with a face at z = 0 facing +z (for wall props). */
const WallStub: React.FC<{ w?: number; h?: number; y0?: number }> = ({ w = 0.5, h = 0.5, y0 = 0 }) => (
  <mesh geometry={geo(`pt-1-${w}-${h}`, () => new THREE.BoxGeometry(w, h, 0.12))} material={wallMat} position={[0, y0 + h / 2, -0.06]} />
);
/** The cavity around the outlet box: two studs, the drywall skins (one with the box's cut-out), the plate. */
const CavityStandIn: React.FC = () => {
  // local frame of the outlet: x along the wall, z out of Nora's wall face; studs at x = +0.14 and -0.26
  const sk = 0.016;
  const top = 0.52;
  const bottom = -0.58;
  const hole = { x0: -0.0295, x1: 0.0295, y0: -0.047, y1: 0.047 };
  return (
    <group>
      {[0.14, -0.26].map((x) => (
        <mesh key={x} geometry={geo(`pt-2`, () => new THREE.BoxGeometry(0.038, top - bottom, 0.089))} material={studMat} position={[x, (top + bottom) / 2, -sk - 0.0445]} />
      ))}
      <mesh geometry={geo(`pt-3`, () => new THREE.BoxGeometry(0.6, 0.038, 0.089))} material={studMat} position={[-0.06, -0.542 - 0.019, -sk - 0.0445]} />
      {/* Nora's skin with the cut-out, built from four pieces */}
      <mesh geometry={geo(`pt-4`, () => new THREE.BoxGeometry(0.6, top - hole.y1, sk))} material={wallMat} position={[-0.06, (top + hole.y1) / 2, -sk / 2]} />
      <mesh geometry={geo(`pt-5`, () => new THREE.BoxGeometry(0.6, hole.y0 - bottom, sk))} material={wallMat} position={[-0.06, (hole.y0 + bottom) / 2, -sk / 2]} />
      <mesh geometry={geo(`pt-6`, () => new THREE.BoxGeometry(hole.x0 + 0.36, hole.y1 - hole.y0, sk))} material={wallMat} position={[(hole.x0 - 0.36) / 2, 0, -sk / 2]} />
      <mesh geometry={geo(`pt-7`, () => new THREE.BoxGeometry(0.24 - hole.x1, hole.y1 - hole.y0, sk))} material={wallMat} position={[(hole.x1 + 0.24) / 2, 0, -sk / 2]} />
      {/* the far skin */}
      <mesh geometry={geo(`pt-8`, () => new THREE.BoxGeometry(0.6, top - bottom, sk))} material={wallMat} position={[-0.06, (top + bottom) / 2, -0.105 - sk / 2]} />
    </group>
  );
};
const headboardCurve = () => spiralCurve(new THREE.LineCurve3(new THREE.Vector3(-0.42, 0.95, 0), new THREE.Vector3(0.42, 0.95, 0)), 0.03, 9);
const Headboard: React.FC = () => (
  <group>
    <mesh geometry={geo(`pt-9`, () => new RoundedBoxGeometry(0.95, 0.05, 0.04, 2, 0.01))} material={bedFrame} position={[0, 0.95, 0]} />
    {[-0.45, 0.45].map((x) => (
      <mesh key={x} geometry={geo(`pt-10`, () => new RoundedBoxGeometry(0.05, 0.95, 0.05, 2, 0.01))} material={bedFrame} position={[x, 0.475, 0]} />
    ))}
  </group>
);
/** A bed-sized slab carrying a bedding material (UVs 0..1 over 0.95 x 2). */
const BeddingSwatch: React.FC<{ m: THREE.Material; pillow?: THREE.Material }> = ({ m, pillow }) => (
  <group>
    <mesh geometry={geo(`pt-11`, () => new THREE.BoxGeometry(0.95, 0.3, 1.95))} material={bedFrame} position={[0, 0.15, 0]} />
    <mesh geometry={geo("pt-duvet", () => new RoundedBoxGeometry(0.97, 0.06, 2.0, 3, 0.025))} material={m} position={[0, 0.33, 0]} />
    {pillow && <mesh geometry={geo("pt-pillow", () => new RoundedBoxGeometry(0.62, 0.12, 0.4, 4, 0.05))} material={pillow} position={[0, 0.42, -0.72]} />}
  </group>
);

// ----------------------------------------------------------------------------------------- film set
const FilmSet: React.FC<{ era: 2004 | 2025; t: number }> = ({ era, t }) => {
  const xN = -(WALL.half + BED.w / 2);
  const xY = WALL.half + BED.w / 2;
  const bedZ = ROOM.back + BED.len / 2;
  return (
    <group>
      {/* floors */}
      <mesh geometry={geo(`pt-12`, () => new THREE.PlaneGeometry(2.4, 3.6).rotateX(-Math.PI / 2))} material={carpetN} position={[-1.26, 0, -1.8]} />
      <mesh geometry={geo(`pt-13`, () => new THREE.PlaneGeometry(2.4, 3.6).rotateX(-Math.PI / 2))} material={carpetY} position={[1.26, 0, -1.8]} />
      {/* hallway floor and the cut walls */}
      <mesh geometry={geo(`pt-14`, () => new THREE.PlaneGeometry(5.2, 1.1).rotateX(-Math.PI / 2))} material={floorMat} position={[0, 0, -4.3]} />
      <mesh geometry={geo(`pt-15`, () => new THREE.BoxGeometry(0.12, WALL.cut, 3.6))} material={wallMat} position={[0, WALL.cut / 2, -1.8]} />
      <mesh geometry={geo(`pt-16`, () => new THREE.BoxGeometry(5.22, ROOM.cut, 0.15))} material={wallMat} position={[0, ROOM.cut / 2, -3.675]} />
      <mesh geometry={geo(`pt-17`, () => new THREE.BoxGeometry(5.22, ROOM.cut, 0.15))} material={wallMat} position={[0, ROOM.cut / 2, 0.075]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo(`pt-18`, () => new THREE.BoxGeometry(0.15, ROOM.cut, 3.9))} material={wallMat} position={[s * 2.535, ROOM.cut / 2, -1.8]} />
      ))}
      {/* beds */}
      {era === 2004 && (
        <>
          {[xN, xY].map((x, i) => (
            <group key={i}>
              <mesh geometry={geo(`pt-19`, () => new THREE.BoxGeometry(BED.w, 0.3, BED.len))} material={bedFrame} position={[x, 0.15, bedZ]} />
              <mesh geometry={geo(`pt-20`, () => new RoundedBoxGeometry(BED.w + 0.02, 0.2, BED.len, 3, 0.05))} material={i === 0 ? starQuiltMat() : racecarDuvetMat()} position={[x, 0.4, bedZ]} />
              <mesh geometry={geo(`pt-21`, () => new RoundedBoxGeometry(PILLOW.w, PILLOW.h, PILLOW.d, 4, 0.05))} material={pillowcaseMat(i === 0 ? "lilac" : "white")} position={[i === 0 ? -0.4 : 0.4, BED.top + PILLOW.h / 2, PILLOW.z]} />
            </group>
          ))}
          <group position={[-1.6, 0, -1.4]}>
            <LavenderRug />
          </group>
          <group position={[1.65, 0, -1.3]} rotation={[0, Math.PI / 2, 0]}>
            <DinoRug />
          </group>
          <group position={[-1.75, 0, -0.55]} rotation={[0, 0.2, 0]}>
            <MovingBox text={"NORA'S STUFF — KEEP OUT"} color="#5B2E91" seed={2} />
          </group>
          <group position={[-1.9, 0, -2.6]} rotation={[0, -0.1, 0]}>
            <MovingBox text={"NORA'S STUFF — KEEP OUT"} color="#5B2E91" seed={3} w={0.42} h={0.3} d={0.34} />
          </group>
          <group position={[1.85, 0, -0.7]} rotation={[0, -0.25, 0]}>
            <MovingBox open={1} seed={4}>
              <ToyBoxContents />
            </MovingBox>
          </group>
          <group position={[-0.55, 1.55, ROOM.back]}>
            <Poster kind="unicorn" />
          </group>
          <group position={[0.6, 1.55, ROOM.back]}>
            <Poster kind="trex" />
          </group>
          <mesh geometry={geo(`pt-22`, () => new THREE.BoxGeometry(0.4, 0.55, 0.38))} material={bedFrame} position={[1.27, 0.275, -3.38]} />
          <group position={[1.27, 0.55, -3.38]} rotation={[0, -0.6, 0]}>
            <DinoLamp on={0} />
          </group>
          <Starfield count={40} glow={1} />
        </>
      )}
      {era === 2025 && (
        <>
          <group position={[-(WALL.half + 0.495), 0, ROOM.back + 0.95 + 0.02]}>
            <AirMattress />
          </group>
          <mesh geometry={geo(`pt-23`, () => new THREE.BoxGeometry(BED.w, 0.3, BED.len))} material={bedFrame} position={[xY, 0.15, bedZ]} />
          <mesh geometry={geo(`pt-24`, () => new RoundedBoxGeometry(BED.w + 0.02, 0.2, BED.len, 3, 0.05))} material={guestDuvetMat()} position={[xY, 0.4, bedZ]} />
          <group position={[1.35, 0, -2.6]}>
            <PillowStack />
          </group>
          <Starfield count={4} glow={1} />
        </>
      )}
      {/* the outlet on Nora's side of the wall, the shelf on yours */}
      <group position={OUTLET} rotation={[0, -Math.PI / 2, 0]}>
        <Outlet crooked nightlight={era === 2004} on={1} light={era === 2004 ? 0.6 : 0} lightRange={1.0} />
      </group>
      <group position={SHELF.at} rotation={[0, Math.PI / 2, 0]}>
        <CornerShelf />
        {/* the verified shelf layout: the T-rex along the back, head to +x, falls toward the room (+z) */}
        <group position={[-0.03, 0, 0.036]} rotation={[0, -Math.PI / 2, 0]}>
          <TRex tip={era === 2025 ? 1 : 0} dir={1} />
        </group>
        {era === 2025 && (
          <>
            <group position={[0.0812, 0, 0.034]}>
              <Candle lit={1} t={t} light={0.15} />
            </group>
            <group position={[0.08, 0, 0.128]} rotation={[0, Math.PI / 2, 0]} scale={0.55}>
              <PineSprig />
            </group>
          </>
        )}
      </group>
    </group>
  );
};

// -------------------------------------------------------------------------------------------- pages
const night = { night: true };
const pagesFor = (t: number): { title: string; cols: number; rows: number; view: View; cells: Cell[] }[] => {
  const headCurve = headboardCurve();
  const sag = sagCurve([new THREE.Vector3(-0.5, 0.2, 0), new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(0.5, 0.2, 0)], 0.12);
  const wallA: Cell[] = [
    { id: "outlet", label: "Outlet", r: 0.09, c: [0, 0.3, 0.02], noFloor: true, node: <group><WallStub w={0.3} h={0.5} y0={0.05} /><group position={[0, 0.3, 0]}><Outlet /></group></group> },
    { id: "outletCrooked", label: "Outlet crooked + nightlight", r: 0.1, c: [0.01, 0.31, 0.02], noFloor: true, ...night, node: <group><WallStub w={0.3} h={0.5} y0={0.05} /><group position={[0, 0.3, 0]}><Outlet crooked nightlight on={1} light={0.05} lightRange={0.5} /></group></group> },
    { id: "outletBox", label: "OutletBox (cavity macro)", r: 0.32, noFloor: true, look: { pos: [-0.06, 0.82, -0.06], target: [-0.06, -0.55, -0.06], up: [1, 0, 0], fov: 60 }, node: <group><CavityStandIn /><OutletBox leak={0.6} /></group> },
    { id: "note", label: "FoldedNote open 1", r: 0.075, c: [0, 0.02, 0.03], node: <FoldedNote open={1} /> },
    { id: "noteShut", label: "FoldedNote open 0", r: 0.07, c: [0, 0.01, 0.035], node: <FoldedNote open={0} /> },
    { id: "shelf", label: "CornerShelf + TRex", r: 0.17, c: [0, 1.0, 0.07], noFloor: true, node: <group><WallStub w={0.4} h={0.5} y0={0.55} /><group position={[0, 1.0, 0]}><CornerShelf /><group position={[0.0, 0, 0.065]} rotation={[0, Math.PI / 2, 0]}><TRex /></group></group></group> },
    { id: "trex", front: -1, label: "TRex", r: 0.1, c: [0, 0.06, 0.0], node: <TRex /> },
    { id: "stars", label: "GlowStar / GlowMoon", r: 0.12, c: [0, 0, 0], noFloor: true, ...night, node: <group><GlowStar /><group position={[0.08, 0, 0.02]}><GlowMoon /></group><group position={[-0.06, 0, 0.06]}><GlowStar size={0.045} rot={0.6} glow={0.5} /></group></group> },
    { id: "posterU", label: "Poster unicorn", r: 0.36, c: [0, 0.3, 0], noFloor: true, node: <group><WallStub w={0.7} h={0.8} y0={-0.1} /><group position={[0, 0.3, 0]}><Poster kind="unicorn" /></group></group> },
    { id: "posterT", label: "Poster T-rex", r: 0.36, c: [0, 0.3, 0], noFloor: true, node: <group><WallStub w={0.7} h={0.8} y0={-0.1} /><group position={[0, 0.3, 0]}><Poster kind="trex" /></group></group> },
    { id: "posterS", label: "Poster soccer", r: 0.36, c: [0, 0.3, 0], noFloor: true, node: <group><WallStub w={0.7} h={0.8} y0={-0.1} /><group position={[0, 0.3, 0]}><Poster kind="soccer" /></group></group> },
    { id: "posterB", label: "Poster band", r: 0.36, c: [0, 0.3, 0], noFloor: true, node: <group><WallStub w={0.7} h={0.8} y0={-0.1} /><group position={[0, 0.3, 0]}><Poster kind="band" /></group></group> },
    { id: "strip", label: "PhotoStrip", r: 0.09, c: [0, 0.3, 0], noFloor: true, node: <group><WallStub w={0.2} h={0.3} y0={0.15} /><group position={[0, 0.3, 0]}><PhotoStrip /></group></group> },
    { id: "tin", label: "EarplugTin + Earplug", r: 0.075, c: [0.03, 0.01, 0.01], node: <group><EarplugTin /><group position={[0.02, 0.006, 0.055]} rotation={[0, 0.7, 0]}><Earplug /></group></group> },
    { id: "phone", label: "Phone (chat, face-down)", r: 0.12, c: [0, 0.004, 0], night: true, node: <group><group position={[-0.05, 0, 0]}><Phone screenKind="chat" /></group><group position={[0.05, 0, 0]} rotation={[0, 0.2, 0]}><Phone faceDown color="#C9C3B8" /></group></group> },
    { id: "laptop", label: "Laptop open", r: 0.25, c: [0, 0.08, -0.04], node: <Laptop open={1} screen={1} /> },
    { id: "laptopC", label: "Laptop closed", r: 0.2, c: [0, 0.02, 0], node: <Laptop open={0} /> },
    { id: "ball", front: -1, label: "SoccerBall", r: 0.13, c: [0, 0.1, 0], node: <SoccerBall /> },
    { id: "candle", label: "Candle lit", r: 0.07, c: [0, 0.05, 0], ...night, node: <Candle lit={1} t={t} light={0.05} /> },
    { id: "sprig", label: "PineSprig", r: 0.12, c: [0, 0.01, 0.01], node: <PineSprig /> },
    { id: "fairy", label: "FairyLights (headboard)", r: 0.55, c: [0, 0.6, 0], ...night, node: <group><Headboard /><FairyLights curve={headCurve} count={70} on={1} t={t} /></group> },
    { id: "fairySag", label: "FairyLights (sag)", r: 0.55, c: [0, 0.2, 0], ...night, noFloor: true, node: <FairyLights curve={sag} count={40} on={1} t={t} /> },
  ];
  const big: Cell[] = [
    { id: "boxN", label: "MovingBox NORA'S STUFF", r: 0.34, c: [0, 0.17, 0], node: <MovingBox text={"NORA'S STUFF — KEEP OUT"} color="#5B2E91" seed={2} /> },
    { id: "boxB", label: "MovingBox DORM — BOOKS", r: 0.32, c: [0, 0.15, 0], node: <MovingBox text={"DORM — BOOKS"} color="#1E1E1E" seed={5} w={0.4} h={0.3} d={0.32} /> },
    { id: "boxF", label: "MovingBox DORM — FRAGILE", r: 0.34, c: [0, 0.17, 0], node: <MovingBox text={"DORM — FRAGILE"} color="#1E1E1E" seed={6} w={0.48} h={0.34} d={0.36} /> },
    { id: "boxT", label: "MovingBox open + toys", r: 0.42, c: [0, 0.17, 0], node: <MovingBox open={1} seed={4}><ToyBoxContents /></MovingBox> },
    { id: "lampOff", front: -1, label: "DinoLamp off", r: 0.24, c: [0, 0.2, -0.02], node: <DinoLamp on={0} /> },
    { id: "lampOn", front: -1, label: "DinoLamp on", r: 0.24, c: [0, 0.2, -0.02], ...night, node: <DinoLamp on={1} light={0.4} /> },
    { id: "rugL", label: "LavenderRug", r: 0.65, c: [0, 0, 0], node: <LavenderRug /> },
    { id: "rugD", label: "DinoRug", r: 0.72, c: [0, 0, 0], node: <DinoRug /> },
    { id: "patch", label: "DarkerCarpetPatch", r: 0.7, c: [0, 0, 0], node: <group><mesh geometry={geo(`pt-25`, () => new THREE.PlaneGeometry(1.6, 1.2).rotateX(-Math.PI / 2))} material={carpetN} position={[0, 0.0003, 0]} /><DarkerCarpetPatch /></group> },
    { id: "fridge", front: -1, label: "MiniFridge (packed)", r: 0.38, c: [0, 0.25, 0], node: <MiniFridge /> },
    { id: "lampBox", label: "BoxedDeskLamp", r: 0.26, c: [0, 0.15, 0], node: <BoxedDeskLamp /> },
    { id: "pillows", label: "DecorativePillows 0-5", r: 0.9, c: [0, 0.07, 0], node: <group>{[0, 1, 2, 3, 4, 5].map((i) => <group key={i} position={[(i % 3) * 0.58 - 0.58, 0, Math.floor(i / 3) * 0.55 - 0.27]}><DecorativePillow index={i} /></group>)}</group> },
    { id: "stack", label: "PillowStack", r: 0.48, c: [0, 0.4, 0], node: <PillowStack /> },
    { id: "mattress", label: "AirMattress", r: 1.08, c: [0, 0.22, 0], node: <AirMattress /> },
    { id: "mattressBare", label: "AirMattress (no sheet)", r: 1.08, c: [0, 0.22, 0], node: <AirMattress sheet={false} quilt={false} /> },
  ];
  const states: Cell[] = [
    ...[0, 0.25, 0.5, 0.75, 1].map((k) => ({ id: `tip${k}`, label: `TRex tip ${k}`, r: 0.11, c: [0.04, 0.05, 0] as [number, number, number], dir: [0, 0.25, 1] as [number, number, number], node: <TRex tip={k} /> })),
    ...[0, 0.35, 0.7, 1].map((k) => ({ id: `note${k}`, label: `FoldedNote open ${k}`, r: 0.07, c: [0, 0.02, 0.03] as [number, number, number], dir: [0.9, 0.35, 0.4] as [number, number, number], node: <FoldedNote open={k} /> })),
    ...[0, 0.3, 0.6, 1].map((k) => ({ id: `box${k}`, label: `MovingBox open ${k}`, r: 0.4, c: [0, 0.18, 0] as [number, number, number], node: <MovingBox open={k} text={"DORM — BOOKS"} color="#1E1E1E" seed={5} w={0.4} h={0.3} d={0.32} /> })),
    { id: "lap05", label: "Laptop open 0.5", r: 0.22, c: [0, 0.06, -0.03], node: <Laptop open={0.5} screen={0.6} /> },
    { id: "outletSide", label: "crooked gap (side)", r: 0.07, c: [0, 0.33, 0.01], noFloor: true, dir: [1, 0.15, 0.25], node: <group><WallStub w={0.3} h={0.5} y0={0.05} /><group position={[0, 0.3, 0]}><Outlet crooked nightlight={false} /></group></group> },
    { id: "gapTop", label: "crooked gap (from above)", r: 0.035, c: [0, 0.355, 0.0], noFloor: true, dir: [0.25, 1, 0.35], node: <group><WallStub w={0.3} h={0.33} y0={0.05} /><group position={[0, 0.3, 0]}><Outlet crooked nightlight /></group></group> },
    { id: "boxClose", label: "OutletBox close", r: 0.16, noFloor: true, look: { pos: [-0.02, 0.2, -0.06], target: [0.03, -0.25, -0.06], up: [1, 0, 0], fov: 60 }, node: <group><CavityStandIn /><OutletBox leak={0.6} /></group> },
    { id: "plugSq", label: "Earplug squeeze 0 / 1", r: 0.04, c: [0, 0, 0], noFloor: true, node: <group><group position={[-0.012, 0, 0]}><Earplug /></group><group position={[0.012, 0, 0]}><Earplug squeeze={1} /></group></group> },
    { id: "tin6", label: "EarplugTin count 6", r: 0.05, c: [0, 0.01, 0], node: <EarplugTin count={6} lid="none" /> },
    { id: "tinOff", label: "Nightlight off (night)", r: 0.09, c: [0.01, 0.31, 0.02], noFloor: true, ...night, node: <group><WallStub w={0.3} h={0.5} y0={0.05} /><group position={[0, 0.3, 0]}><Outlet crooked nightlight on={0} /></group></group> },
  ];
  const bedding: Cell[] = [
    { id: "b-star", label: "starQuilt 2004", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={starQuiltMat()} pillow={pillowcaseMat("lilac")} /> },
    { id: "b-patch", label: "patchworkQuilt 2007", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={patchworkQuiltMat()} pillow={pillowcaseMat("cream")} /> },
    { id: "b-race", label: "racecarDuvet 2004", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={racecarDuvetMat()} pillow={pillowcaseMat("racecar")} /> },
    { id: "b-soccer", label: "soccerDuvet 2007", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={soccerDuvetMat()} pillow={pillowcaseMat("soccer")} /> },
    { id: "b-navy", label: "navyDuvet 2011", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={navyDuvetMat()} pillow={pillowcaseMat("navy")} /> },
    { id: "b-guest", label: "guestDuvet 2016+", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={guestDuvetMat()} pillow={pillowcaseMat("beige")} /> },
    { id: "b-stripe", label: "stripedSheet 2009", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={stripedSheetMat()} pillow={pillowcaseMat("striped")} /> },
    { id: "b-plain", label: "plainSheet white/cream", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={plainSheetMat("cream")} pillow={pillowcaseMat("white")} /> },
    { id: "b-bag", label: "sleepingBag 2013", r: 1.05, c: [0, 0.3, 0], node: <BeddingSwatch m={sleepingBagMat()} pillow={pillowcaseMat("white")} /> },
    { id: "b-starQ", label: "starQuilt close", r: 0.3, c: [0.2, 0.36, -0.5], node: <BeddingSwatch m={starQuiltMat()} pillow={pillowcaseMat("lilac")} /> },
    { id: "b-patchQ", label: "patchwork close", r: 0.3, c: [0.2, 0.36, -0.5], node: <BeddingSwatch m={patchworkQuiltMat()} pillow={pillowcaseMat("cream")} /> },
    { id: "b-bagQ", label: "sleepingBag close", r: 0.3, c: [0.2, 0.36, -0.5], node: <BeddingSwatch m={sleepingBagMat()} pillow={pillowcaseMat("white")} /> },
  ];
  const film: Cell[] = [
    { id: "f-wide04", label: "PLAN WIDE 2004 (stars 40)", r: 1, cam: PRESETS.wide, ...night, noFloor: true, node: <FilmSet era={2004} t={t} /> },
    { id: "f-wide25", label: "PLAN WIDE 2025 (stars 4)", r: 1, cam: PRESETS.wide, ...night, noFloor: true, node: <FilmSet era={2025} t={t} /> },
    { id: "f-med04", label: "MEDIUM 2004", r: 1, cam: PRESETS.medium, ...night, noFloor: true, node: <FilmSet era={2004} t={t} /> },
    { id: "f-two25", label: "TWO-SHOT 2025", r: 1, cam: PRESETS.two, ...night, noFloor: true, node: <FilmSet era={2025} t={t} /> },
    { id: "f-shelf04", label: "shelf 2004 (from above)", r: 0.2, c: [SHELF.at.x + 0.08, SHELF.at.y, SHELF.at.z], noFloor: true, node: <FilmSet era={2004} t={t} /> },
    { id: "f-shelf25", label: "shelf 2025 (from above)", r: 0.2, c: [SHELF.at.x + 0.08, SHELF.at.y, SHELF.at.z], noFloor: true, node: <FilmSet era={2025} t={t} /> },
  ];
  return [
    { title: "A · film overhead", cols: 4, rows: 6, view: "top", cells: wallA },
    { title: "B · film overhead", cols: 3, rows: 5, view: "top", cells: big },
    { title: "A · 3/4", cols: 4, rows: 6, view: "q", cells: wallA },
    { title: "B · 3/4", cols: 3, rows: 5, view: "q", cells: big },
    { title: "states", cols: 4, rows: 6, view: "q", cells: states },
    { title: "bedding (overhead)", cols: 3, rows: 4, view: "top", cells: bedding },
    { title: "film check (presets)", cols: 2, rows: 3, view: "top", cells: film },
  ];
};

// --------------------------------------------------------------------------------------- the renderer
const W = 1080;
const H = 1920;
const SP = 14; // cells sit this far apart in the world

type Placed = Cell & { origin: THREE.Vector3; rect: [number, number, number, number] };

const MultiView: React.FC<{ cells: Placed[]; view: View }> = ({ cells, view }) => {
  const { gl, scene } = useThree();
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const cam = useMemo(() => new THREE.PerspectiveCamera(30, 1, 0.01, 100), []);
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    pm.dispose();
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl, scene]);
  useFrame(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    gl.autoClear = false;
    gl.setScissorTest(true);
    gl.setViewport(0, 0, W, H);
    gl.setScissor(0, 0, W, H);
    gl.setClearColor("#15130F");
    gl.clear();
    for (const c of cells) {
      const [x, y, w, h] = c.rect;
      const vy = H - y - h;
      gl.setViewport(x, vy, w, h);
      gl.setScissor(x, vy, w, h);
      gl.setClearColor(c.night ? "#07080C" : "#3A342C");
      gl.clear();
      const target = c.origin.clone().add(new THREE.Vector3(...(c.c ?? [0, 0, 0])));
      if (c.cam) {
        const pr = { ...c.cam, target: c.cam.target.clone().add(c.origin) };
        const k = cameraFor(pr);
        cam.position.copy(k.pos);
        cam.quaternion.copy(k.quat);
        cam.fov = k.fov;
        cam.near = 0.05;
        cam.far = 40;
      } else if (c.look) {
        cam.position.copy(c.origin).add(new THREE.Vector3(...c.look.pos));
        cam.up.set(...c.look.up);
        cam.lookAt(c.origin.clone().add(new THREE.Vector3(...c.look.target)));
        cam.fov = c.look.fov;
        cam.near = 0.01;
        cam.far = 5;
      } else {
        const dir = c.dir ? new THREE.Vector3(...c.dir).normalize() : view === "top" ? TOP_DIR : Q_DIR.clone().multiply(new THREE.Vector3(c.front === -1 ? -1 : 1, 1, c.front === -1 ? -1 : 1));
        const aspect = w / h;
        const vh = THREE.MathUtils.degToRad(15);
        const hh = Math.atan(Math.tan(vh) * aspect);
        const dist = (c.r / Math.sin(Math.min(vh, hh))) * 1.04;
        cam.position.copy(target).addScaledVector(dir, dist);
        cam.up.set(...(c.up ?? (view === "top" && !c.dir ? [0, 0, -1] : [0, 1, 0])));
        cam.lookAt(target);
        cam.fov = 30;
        cam.near = Math.max(0.005, dist - c.r * 3);
        cam.far = dist + c.r * 4;
      }
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const kl = key.current!;
      const R = c.cam ? 3.5 : Math.max(0.15, c.r * 1.6);
      kl.position.copy(target).add(new THREE.Vector3(-0.55, 1.0, 0.45).multiplyScalar(R * 2.5));
      kl.target.position.copy(target);
      kl.target.updateMatrixWorld();
      const sc = kl.shadow.camera;
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.near = 0.01;
      sc.far = R * 6;
      sc.updateProjectionMatrix();
      kl.shadow.bias = -0.0002 * R;
      kl.shadow.normalBias = 0.002 * R;
      kl.intensity = c.night ? 0.12 : 2.3;
      kl.color.set(c.night ? "#8FA6D8" : "#FFD6A6");
      hemi.current!.intensity = c.night ? 0.06 : 0.75;
      scene.environmentIntensity = c.night ? 0.03 : 0.32;
      gl.render(scene, cam);
    }
    gl.setScissorTest(false);
  }, 1);
  return (
    <>
      <directionalLight ref={key} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <hemisphereLight ref={hemi} args={["#FFE7C9", "#4A3B2E", 0.75]} />
      {cells.map((c) => (
        <group key={c.id} position={c.origin}>
          {!c.noFloor && !c.cam && <mesh geometry={floorGeo(c.r)} material={floorMat} receiveShadow position={[0, -0.0005, 0]} />}
          {c.node}
        </group>
      ))}
    </>
  );
};
const floorGeos = new Map<number, THREE.BufferGeometry>();
const floorGeo = (r: number) => {
  const k = Math.max(0.3, r * 5);
  if (!floorGeos.has(k)) floorGeos.set(k, new THREE.PlaneGeometry(k, k).rotateX(-Math.PI / 2));
  return floorGeos.get(k)!;
};

export const PropsTest: React.FC = () => {
  const frame = useCurrentFrame();
  const ip = getInputProps() as { page?: number; focus?: string; view?: View; ids?: string[]; cols?: number; rows?: number };
  const t = frame / 30;
  const pages = pagesFor(t);
  let page = pages[Math.min(pages.length - 1, Math.floor(frame / 9))];
  if (ip.page !== undefined) page = pages[ip.page];
  if (ip.ids) {
    const all = pages.flatMap((p) => p.cells);
    const cells = ip.ids.map((id) => all.find((e) => e.id === id)!).filter(Boolean);
    page = { title: "selection", cols: ip.cols ?? 2, rows: ip.rows ?? Math.ceil(cells.length / (ip.cols ?? 2)), view: ip.view ?? "top", cells };
  }
  let placed: Placed[];
  let view: View = page.view;
  if (ip.focus && !ip.ids) {
    const all = pages.flatMap((p) => p.cells);
    const c = all.find((e) => e.id === ip.focus) ?? all[0];
    view = ip.view ?? "top";
    placed = [{ ...c, origin: new THREE.Vector3(0, 0, 0), rect: [0, 0, W, H] }];
    page = { title: `${c.label} · ${view}`, cols: 1, rows: 1, view, cells: [c] };
  } else {
    const cw = W / page.cols;
    const ch = H / page.rows;
    placed = page.cells.map((c, i) => ({
      ...c,
      origin: new THREE.Vector3((i % 6) * SP, 0, Math.floor(i / 6) * SP),
      rect: [(i % page.cols) * cw, Math.floor(i / page.cols) * ch, cw, ch],
    }));
  }
  return (
    <AbsoluteFill style={{ background: "#15130F" }}>
      <ThreeCanvas width={W} height={H} gl={{ antialias: true }} camera={{ fov: 30, position: [0, 5, 5] }}>
        <MultiView cells={placed} view={view} />
      </ThreeCanvas>
      {placed.map((c) => (
        <div key={c.id} style={{ position: "absolute", left: c.rect[0] + 8, top: c.rect[1] + 6, fontFamily: "sans-serif", fontSize: 17, color: "#fff", background: "rgba(0,0,0,0.45)", padding: "2px 7px", borderRadius: 4 }}>
          {c.label}
        </div>
      ))}
      {placed.length > 1 &&
        placed.map((c) => <div key={`${c.id}-b`} style={{ position: "absolute", left: c.rect[0], top: c.rect[1], width: c.rect[2], height: c.rect[3], boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }} />)}
      <div style={{ position: "absolute", right: 10, bottom: 8, fontFamily: "sans-serif", fontSize: 18, color: "rgba(255,255,255,0.7)" }}>{page.title}</div>
    </AbsoluteFill>
  );
};
