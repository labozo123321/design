import React, { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, getInputProps, useCurrentFrame, useDelayRender } from "remotion";
import { useThree } from "@react-three/fiber";
import { canvasTex, mat } from "../roadster/materials";
import { paint, trim } from "../home/materials";
import { DOOR, HALL, PORCH, PRESETS, ROOM, TILT, WINDOWS, cameraFor } from "./layout";
import { House } from "./House";
import { NightLights } from "./Lights";
import { Baseboard, Banister, CeilingFixture, Door, DoorCasing, Floorboards, HallNightlight, PineGarland, PuppyBed, Window, floorboardsMat } from "./props/house";
import { TREADMILL, Treadmill } from "./props/treadmill";
import { ChristmasGutterLights, DryLeaves, Gutter, Porch, PorchRoof, RainSplash, SnowDrift, roofFrame } from "./props/porch";

/**
 * Contact sheet for props set B (the house fabric and the outside): every piece from the film's overhead
 * angle (18 degrees from vertical, fov 30, the camera on the +z side looking toward the back wall) and in a
 * 3/4 view, each lit for night and for day, labelled. One WebGL canvas: each cell is a scissored viewport
 * rendering its own scene. Pages change every 8 frames:
 *  0 door, window . 1 treadmill and its laundry . 2 hallway lights, dog bed, banister, garland, mouldings
 *  3 porch: autumn, storm . 4 porch: snow, Christmas lights . 5 in the house, 2004 night (WIDE)
 *  6 in the house, Christmas 2025 (WIDE) . 7 close-ups.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = 1080;
const H = 1920;

// ------------------------------------------------------------------------------------------- rigs
/** A warm practical (2700 K) that casts shadows, aimed at the piece. */
const WarmSpot: React.FC<{ at: THREE.Vector3; c: THREE.Vector3 }> = ({ at, c }) => {
  const s = useMemo(() => {
    const l = new THREE.SpotLight("#FFC98A", 3.2, 7, 1.1, 0.8, 1.4);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.01;
    l.shadow.camera.near = 0.1;
    l.shadow.camera.far = 8;
    return l;
  }, []);
  s.position.copy(at);
  s.target.position.copy(c);
  return (
    <>
      <primitive object={s} />
      <primitive object={s.target} />
    </>
  );
};
const Rig: React.FC<{ mode: "night" | "day"; c: THREE.Vector3; r: number; warm?: THREE.Vector3 | null; sun?: THREE.Vector3 }> = ({ mode, c, r, warm, sun }) => {
  const L = useMemo(() => {
    const d = new THREE.DirectionalLight();
    d.castShadow = true;
    d.shadow.mapSize.set(2048, 2048);
    d.shadow.bias = -0.0003;
    d.shadow.normalBias = 0.015;
    const t = new THREE.Object3D();
    d.target = t;
    return { d, t };
  }, []);
  const dir = sun ?? (mode === "day" ? V(1.2, 3.2, 1.6) : V(-1.4, 3.0, 2.2));
  L.d.position.copy(c).addScaledVector(dir.clone().normalize(), 8);
  L.t.position.copy(c);
  L.d.shadow.camera.left = L.d.shadow.camera.bottom = -r;
  L.d.shadow.camera.right = L.d.shadow.camera.top = r;
  L.d.shadow.camera.near = 0.5;
  L.d.shadow.camera.far = 20;
  L.d.shadow.camera.updateProjectionMatrix();
  L.d.color.set(mode === "day" ? "#FFF1DC" : "#B9C9E6");
  L.d.intensity = mode === "day" ? 2.6 : 0.55;
  return (
    <>
      <primitive object={L.d} />
      <primitive object={L.t} />
      <hemisphereLight args={mode === "day" ? ["#CFE0F4", "#7A6A58", 1.25] : ["#3B4C78", "#1A1612", 0.9]} />
      {mode === "night" && warm ? <WarmSpot at={warm} c={c} /> : null}
    </>
  );
};

// ------------------------------------------------------------------------------------------- sets
const sidingTex = () =>
  canvasTex(
    "b-test-siding",
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
const siding = () => mat("b-test-sidingMat", () => new THREE.MeshStandardMaterial({ map: sidingTex(), roughness: 0.7 }));
const carpetMat = (c: string) => mat(`b-test-carpet-${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
const capMat = () => mat("b-test-cap", () => new THREE.MeshStandardMaterial({ color: "#2A2421", roughness: 0.9 }));

/** A wall along x (z0..z1) from y0 to y1 with rectangular openings [x0, x1, oy0, oy1]; capped on top. */
const WallStub: React.FC<{ x0: number; x1: number; z0: number; z1: number; y0?: number; y1?: number; holes?: [number, number, number, number][]; inside?: THREE.Material; outside?: THREE.Material }> = ({
  x0,
  x1,
  z0,
  z1,
  y0 = 0,
  y1 = ROOM.cut,
  holes = [],
  inside,
  outside,
}) => {
  const tr = trim();
  const inn = inside ?? paint("#C9B6DC");
  const out = outside ?? paint("#EDE6D8");
  const mats = [tr, tr, capMat(), tr, out, inn];
  const boxes: [number, number, number, number][] = [];
  let cx = x0;
  for (const [a, b, oy0, oy1] of [...holes].sort((p, q) => p[0] - q[0])) {
    boxes.push([cx, a, y0, y1]);
    if (oy0 > y0) boxes.push([a, b, y0, oy0]);
    if (oy1 < y1) boxes.push([a, b, oy1, y1]);
    cx = b;
  }
  boxes.push([cx, x1, y0, y1]);
  return (
    <group>
      {boxes
        .filter(([a, b, c, d]) => b - a > 1e-4 && d - c > 1e-4)
        .map(([a, b, c, d], i) => (
          <mesh key={i} position={[(a + b) / 2, (c + d) / 2, (z0 + z1) / 2]} material={mats} castShadow receiveShadow>
            <boxGeometry args={[b - a, d - c, z1 - z0]} />
          </mesh>
        ))}
    </group>
  );
};
const Floor: React.FC<{ w: number; d: number; c?: THREE.Vector3; kind?: "oak" | string }> = ({ w, d, c = V(), kind = "oak" }) => (
  <mesh position={[c.x, c.y - 0.0005, c.z]} rotation={[-Math.PI / 2, 0, 0]} material={kind === "oak" ? floorboardsMat(w, d) : carpetMat(kind)} receiveShadow>
    <planeGeometry args={[w, d]} />
  </mesh>
);

// ------------------------------------------------------------------------------------------- pieces
type Cam = { pos: THREE.Vector3; target: THREE.Vector3; up?: THREE.Vector3; fov?: number; quat?: THREE.Quaternion };
const over = (target: THREE.Vector3, dist: number): Cam => ({ pos: target.clone().add(V(0, Math.cos(TILT), Math.sin(TILT)).multiplyScalar(dist)), target, up: V(0, 0, -1), fov: 30 });
const q34 = (target: THREE.Vector3, dir: THREE.Vector3, dist: number, fov = 30): Cam => ({ pos: target.clone().addScaledVector(dir.clone().normalize(), dist), target, fov });

type Piece = {
  name: string;
  /** the set, given the light mode and the time */
  set: (mode: "night" | "day", t: number) => React.ReactNode;
  c: THREE.Vector3;
  r: number;
  warm?: THREE.Vector3 | null;
  over: Cam;
  q1: Cam;
  q2?: Cam;
  q1Label?: string;
  q2Label?: string;
  bg?: [string, string];
};

const doorPiece: Piece = {
  name: "Door: shut (hinge +x) | open 1.2 rad toward +z (hinge +x)",
  set: () => (
    <group>
      <WallStub x0={-2.2} x1={2.2} z0={-0.075} z1={0.075} holes={[[-1.5, -0.7, 0, DOOR.h], [0.7, 1.5, 0, DOOR.h]]} inside={paint("#9FB9D6")} />
      <group position={[-1.1, 0, 0]}>
        <Door hinge={1} swing={1} open={0} />
      </group>
      <group position={[1.1, 0, 0]}>
        <Door hinge={1} swing={1} open={1.2} />
      </group>
      <Floor w={4.6} d={4} c={V(0, 0, 0)} />
    </group>
  ),
  c: V(0, 1, 0.3),
  r: 3,
  warm: V(0.2, 1.8, -1.0),
  over: over(V(0, 0.9, 0.35), 8.4),
  q1: q34(V(0, 1.0, 0.1), V(0.9, 0.55, 1.4), 6.2),
  q2: q34(V(1.2, 1.0, 0), V(-0.6, 0.35, 1.0), 3.4),
  q2Label: "3/4 close (open door, hinges, knob) · day",
};

const winXs = [-1.8, -0.6, 0.6, 1.8];
const windowPiece: Piece = {
  name: "Window: plain | curtains | rain | snow corners (porch roof below)",
  set: (_m, t) => (
    <group>
      <WallStub x0={-2.4} x1={2.4} z0={-0.075} z1={0.075} y0={-0.3} holes={winXs.map((x) => [x - WINDOWS.w / 2, x + WINDOWS.w / 2, WINDOWS.sill, WINDOWS.head] as [number, number, number, number])} outside={siding()} />
      {winXs.map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <Window
            seed={i + 1}
            curtains={i === 0 ? null : i === 1 ? { color: "#C9B6DC", open: 0.75 } : i === 2 ? { color: "#9FB9D6", open: 1, length: "floor" } : { color: "#8E3B36", open: 0.55 }}
            rain={i === 2 ? 1 : 0}
            time={t}
            snowCorner={i === 3 ? 1 : 0}
          />
        </group>
      ))}
      <Floor w={4.8} d={2.2} c={V(0, 0, -1.175)} kind="#CFC3B2" />
      <group position={[0, PORCH.yWall, 0.075]}>
        <PorchRoof width={4.8} depth={1.7} rise={0.6} />
      </group>
    </group>
  ),
  c: V(0, 1.2, 0.2),
  r: 3.2,
  warm: V(0, 1.6, -1.2),
  over: over(V(0, 1.0, 0.25), 7.6),
  q1: q34(V(-0.6, 1.35, 0), V(-0.35, 0.3, -1.0), 3.6),
  q1Label: "3/4 inside (curtains, stool, glass) · night",
  q2: q34(V(1.2, 1.35, 0), V(0.5, 0.45, 1.0), 3.8),
  q2Label: "3/4 outside (rain, snow, sill, drip cap) · day",
};

const treadPiece = (a: number, b: number): Piece => ({
  name: `Treadmill: laundry ${a} | laundry ${b}${a === 0 ? " (belt running, console on)" : ""}`,
  set: (_m, t) => (
    <group>
      <group position={[-0.62, 0, 0]}>
        <Treadmill laundry={a} belt={a === 0 ? t * 1.4 : 0} on={a === 0} />
      </group>
      <group position={[0.62, 0, 0]}>
        <Treadmill laundry={b} />
      </group>
      <Floor w={3.4} d={3.4} kind="#CFC3B2" />
    </group>
  ),
  c: V(0, 0.6, 0),
  r: 2.2,
  warm: V(0, 2.2, 0.6),
  over: over(V(0, 0.55, -0.05), 6.4),
  q1: q34(V(0, 0.65, -0.05), V(1.4, 1.0, 1.35), 5.0),
  q2: q34(V(0, 0.7, -0.1), V(-1.2, 0.8, 1.5), 5.0),
});

const hallPiece: Piece = {
  name: "Hall: ceiling dome (cut, on) | (closed, off) · plug-in nightlight · dog bed",
  set: () => (
    <group>
      <group position={[-0.55, ROOM.ceiling, -0.15]}>
        <CeilingFixture on={1} cut />
      </group>
      <group position={[0.15, ROOM.ceiling, -0.15]}>
        <CeilingFixture on={0} cut={false} />
      </group>
      <WallStub x0={-1.3} x1={1.3} z0={-0.75} z1={-0.6} y1={1.0} outside={paint("#EDE6D8")} inside={paint("#EDE6D8")} />
      <group position={[-0.5, 0, -0.6]} rotation={[0, Math.PI, 0]}>
        <HallNightlight on={1} />
      </group>
      <group position={[0.55, 0, 0.1]}>
        <PuppyBed />
      </group>
      <Floor w={2.6} d={2.0} c={V(0, 0, 0.1)} />
    </group>
  ),
  c: V(0, 1.0, -0.1),
  r: 2.2,
  warm: V(0.6, 1.9, 1.0),
  over: over(V(0, 0.9, -0.1), 6.6),
  q1: q34(V(-0.1, 1.1, -0.2), V(0.55, 1.15, 1.3), 4.8),
  q2: q34(V(0.0, 0.2, -0.25), V(0.2, 0.75, 1.0), 2.0),
  q2Label: "3/4 close (nightlight, dog bed) · day",
};

const banisterPiece: Piece = {
  name: "Banister + garland (lights on) · baseboard · door casing · floorboards",
  set: () => (
    <group>
      <Banister length={2.6} garland={{ on: 1, seed: 2 }} />
      <WallStub x0={-1.5} x1={1.5} z0={-0.95} z1={-0.8} y1={1.2} inside={paint("#EDE6D8")} outside={paint("#EDE6D8")} />
      <group position={[0, 0, -0.8]} rotation={[0, Math.PI, 0]}>
        <Baseboard length={2.0} />
        <group position={[0.6, 0, 0]}>
          <DoorCasing w={0.5} h={0.9} />
        </group>
      </group>
      <group position={[0, 0, 0.55]}>
        <Floorboards w={3.2} d={3.0} />
      </group>
    </group>
  ),
  c: V(0, 0.6, -0.1),
  r: 2.2,
  warm: V(0.3, 1.6, 0.6),
  over: over(V(0, 0.55, -0.15), 6.0),
  q1: q34(V(0, 0.7, -0.1), V(0.7, 0.55, 1.4), 4.2),
  q2: q34(V(-0.7, 0.85, 0), V(0.15, 0.6, 1.0), 1.6),
  q2Label: "3/4 close (garland, newel cap) · day",
};

/** A porch cell: the house wall with a window over a 2.4 m roof segment, its gutter, and a dressing. */
const porchSet = (o: { leaves?: number; snow?: number; rain?: number; wet?: number; overflow?: number; lights?: number | null; winRain?: number; winSnow?: number }) => (_m: "night" | "day", t: number) => (
  <group>
    <WallStub x0={-1.3} x1={1.3} z0={0} z1={ROOM.wallT} y0={-0.4} holes={[[-WINDOWS.w / 2, WINDOWS.w / 2, WINDOWS.sill, WINDOWS.head]]} outside={siding()} />
    <group position={[0, 0, ROOM.wallT / 2]}>
      <Window rain={o.winRain ?? 0} time={t} snowCorner={o.winSnow ?? 0} curtains={{ color: "#C9B6DC", open: 0.8 }} />
    </group>
    <Floor w={2.6} d={1.2} c={V(0, 0, -0.6)} kind="#CFC3B2" />
    <group position={[0, PORCH.yWall, PORCH.z0]}>
      <Porch width={2.4} depth={1.7} rise={0.6} leaves={o.leaves ?? 0} snow={o.snow ?? 0} rain={o.rain ?? 0} wet={o.wet ?? 0} overflow={o.overflow ?? 0} lights={o.lights ?? null} time={t} seed={3} />
    </group>
  </group>
);
const porchCams = {
  over: over(V(0, 0.4, 0.95), 6.2),
  q1: q34(V(0.2, 0.15, 1.3), V(1.1, 0.8, 1.3), 3.6),
  q2: q34(V(-0.5, 0.0, 1.7), V(-0.5, 0.35, 1.0), 2.2),
};
const porchAutumn: Piece = { name: "Porch roof: dry leaves (autumn), gutter, downspout", set: porchSet({ leaves: 34 }), c: V(0, 0.3, 1.0), r: 2.2, warm: null, ...porchCams, q2Label: "3/4 low (gutter, outlet, leaves in the trough) · day" };
const porchStorm: Piece = { name: "Porch roof: storm (wet shingles, splashes, gutter overflow, rain on glass)", set: porchSet({ rain: 1, wet: 1, overflow: 0.8, winRain: 1 }), c: V(0, 0.3, 1.0), r: 2.2, warm: null, ...porchCams };
const porchSnowA: Piece = { name: "Porch roof: first snow (0.3) · C9 lights off", set: porchSet({ snow: 0.3, lights: 0, winSnow: 0.3 }), c: V(0, 0.3, 1.0), r: 2.2, warm: null, ...porchCams };
const porchSnowB: Piece = { name: "Porch roof: deep snow (1.0) · C9 lights on, icicles", set: porchSet({ snow: 1, lights: 1, winSnow: 1 }), c: V(0, 0.3, 1.0), r: 2.2, warm: null, ...porchCams };

type Page = { pieces: Piece[] } | { situ: "2004" | "2025" } | { close: true };
const PAGES: Page[] = [
  { pieces: [doorPiece, windowPiece] },
  { pieces: [treadPiece(0, 0.3), treadPiece(0.65, 1)] },
  { pieces: [hallPiece, banisterPiece] },
  { pieces: [porchAutumn, porchStorm] },
  { pieces: [porchSnowA, porchSnowB] },
  { situ: "2004" },
  { situ: "2025" },
  { close: true },
];

// ------------------------------------------------------------------------------------------- in situ
const PAINT = { nora: "#C9B6DC", you: "#9FB9D6", noraCarpet: "#CFC3B2", youCarpet: "#C8C0B2" };
const Situ: React.FC<{ era: "2004" | "2025"; t: number }> = ({ era, t }) => {
  const xmas = era === "2025";
  const hallZ = (HALL.z0 + HALL.z1) / 2;
  const doorZ = ROOM.back - ROOM.wallT / 2;
  return (
    <group>
      <House paint={PAINT} porch={<group position={[0, PORCH.yWall, PORCH.z0]}><Porch leaves={xmas ? 0 : 70} snow={xmas ? 0.85 : 0} lights={xmas ? 1 : null} time={t} /></group>} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (DOOR.x0 + DOOR.x1) / 2, 0, doorZ]}>
          <Door hinge={s as -1 | 1} swing={1} open={xmas ? (s < 0 ? 1.15 : 0.95) : s < 0 ? 0.35 : 1.25} />
        </group>
      ))}
      {[-1, 1].flatMap((s) =>
        WINDOWS.xs.map((x, i) => (
          <group key={`${s}${i}`} position={[s * x, 0, ROOM.front + ROOM.wallT / 2]}>
            <Window seed={i + (s > 0 ? 3 : 1)} snowCorner={xmas ? 0.8 : 0} curtains={xmas || s > 0 ? { color: s < 0 ? "#C9B6DC" : "#9FB9D6", open: 0.85 } : null} />
          </group>
        )),
      )}
      {xmas ? (
        <>
          <group position={[-0.06 - 0.003 - TREADMILL.w / 2, 0, -1.25]}>
            <Treadmill laundry={1} />
          </group>
          <group position={[0, 0.92, HALL.z1 - 0.015]}>
            <PineGarland length={2 * ROOM.outer - 0.3} on={1} rail={{ w: 0.07, h: 0.06 }} />
          </group>
        </>
      ) : (
        <>
          <group position={[0.35, ROOM.ceiling, hallZ]}>
            <CeilingFixture on={1} />
          </group>
          <group position={[-1.52, 0, hallZ + 0.05]}>
            <PuppyBed />
          </group>
        </>
      )}
      <NightLights t={t} hall={xmas ? 0 : 1} strings={xmas ? 1 : 0} street={1} moon={xmas ? 0.6 : 0} nightlight={0} />
    </group>
  );
};

// ------------------------------------------------------------------------------------------- close-ups
type Close = { label: string; set: (t: number) => React.ReactNode; cam: Cam; mode: "night" | "day"; c: THREE.Vector3; r: number; warm?: THREE.Vector3 };
const CLOSE: Close[] = [
  {
    label: "window inside: curtains, stool, lock, snow (night)",
    set: () => (
      <group>
        <WallStub x0={-0.9} x1={0.9} z0={-0.075} z1={0.075} holes={[[-0.37, 0.37, WINDOWS.sill, WINDOWS.head]]} outside={siding()} />
        <Window snowCorner={1} curtains={{ color: "#C9B6DC", open: 0.8 }} />
        <Floor w={2} d={1} c={V(0, 0, -0.6)} kind="#CFC3B2" />
      </group>
    ),
    cam: q34(V(0, 1.3, 0), V(-0.45, 0.4, -1.0), 2.6),
    mode: "night",
    c: V(0, 1.2, 0),
    r: 1.2,
    warm: V(-0.5, 2.0, -1.4),
  },
  {
    label: "treadmill console, stop key, cord (day)",
    set: () => <Treadmill laundry={0.5} on />,
    cam: q34(V(0, 1.1, -0.35), V(0.25, 0.9, 1.0), 1.5),
    mode: "day",
    c: V(0, 1, -0.3),
    r: 1.2,
  },
  {
    label: "C9 bulbs on the gutter in deep snow (night)",
    set: () => (
      <group>
        <WallStub x0={-1.3} x1={1.3} z0={0} z1={ROOM.wallT} y0={-0.4} y1={1.0} outside={siding()} />
        <group position={[0, PORCH.yWall, PORCH.z0]}>
          <Porch width={2.4} depth={1.7} rise={0.6} snow={1} lights={1} seed={3} />
        </group>
      </group>
    ),
    cam: q34(V(0.1, -0.08, 1.95), V(0.8, 0.55, 1.0), 1.2),
    mode: "night",
    c: V(0, 0, 1.9),
    r: 1.2,
  },
  {
    label: "pine garland and mini lights (night)",
    set: () => <Banister length={1.6} garland={{ on: 1, seed: 4 }} />,
    cam: q34(V(0.2, 0.9, 0), V(0.4, 0.7, 1.0), 1.0),
    mode: "night",
    c: V(0, 0.9, 0),
    r: 1.0,
    warm: V(0, 1.8, 0.8),
  },
  {
    label: "door hinge side and knob (day)",
    set: () => (
      <group>
        <WallStub x0={-1.0} x1={1.0} z0={-0.075} z1={0.075} holes={[[-0.4, 0.4, 0, DOOR.h]]} inside={paint("#9FB9D6")} />
        <Door hinge={1} swing={1} open={0.9} />
        <Floor w={2} d={2} />
      </group>
    ),
    cam: q34(V(0.36, 1.0, 0.1), V(0.9, 0.3, 1.0), 1.5),
    mode: "day",
    c: V(0.3, 1, 0.3),
    r: 1.4,
  },
  {
    label: "dog bed (day)",
    set: () => (
      <group>
        <PuppyBed />
        <Floor w={1.2} d={1.2} />
      </group>
    ),
    cam: q34(V(0, 0.06, 0), V(0.2, 0.9, 1.0), 1.15),
    mode: "day",
    c: V(0, 0.1, 0),
    r: 0.6,
  },
  {
    label: "shingles, leaves, flashing at the wall (day)",
    set: () => (
      <group>
        <WallStub x0={-1.3} x1={1.3} z0={0} z1={ROOM.wallT} y0={-0.4} y1={1.2} outside={siding()} />
        <group position={[0, PORCH.yWall, PORCH.z0]}>
          <Porch width={2.4} depth={1.7} rise={0.6} leaves={34} seed={3} />
        </group>
      </group>
    ),
    cam: q34(V(0.0, 0.45, 0.5), V(0.5, 1.0, 1.0), 1.4),
    mode: "day",
    c: V(0, 0.4, 0.6),
    r: 1.4,
  },
  {
    label: "rain splashes on wet shingles (night)",
    set: (t) => (
      <group>
        <group position={[0, PORCH.yWall, PORCH.z0]}>
          <PorchRoof width={2.4} depth={1.7} rise={0.6} wet={1} />
          <RainSplash width={2.4} depth={1.7} rise={0.6} time={t} amount={1} seed={5} />
          <group position={[0, roofFrame({ width: 2.4, depth: 1.7, rise: 0.6 }).gutter.y, roofFrame({ width: 2.4, depth: 1.7, rise: 0.6 }).gutter.z]}>
            <Gutter width={2.4} overflow={1} time={t} />
            <ChristmasGutterLights width={2.4} on={0} />
          </group>
          <DryLeaves width={2.4} depth={1.7} rise={0.6} count={6} seed={9} />
          <SnowDrift width={2.4} depth={1.7} rise={0.6} amount={0} />
        </group>
      </group>
    ),
    cam: q34(V(0.0, 0.25, 1.1), V(0.3, 1.2, 1.0), 1.7),
    mode: "night",
    c: V(0, 0.3, 1.0),
    r: 1.6,
  },
];

// ------------------------------------------------------------------------------------------- render
type ViewDef = { node: React.ReactNode; cam: Cam; rect: [number, number, number, number]; bg: string; label: string; logDepth?: boolean };

/** The cell's camera (the canvas's default camera). */
const CamRig: React.FC<{ c: Cam }> = ({ c }) => {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  camera.position.copy(c.pos);
  camera.up.copy(c.up ?? V(0, 1, 0));
  if (c.quat) camera.quaternion.copy(c.quat);
  else camera.lookAt(c.target);
  camera.fov = c.fov ?? 30;
  camera.near = 0.03;
  camera.far = 80;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

/**
 * One cell = one canvas (its own renderer). Materials are shared between cells through the module caches,
 * and three wires a material's light uniforms to the render state of the scene it was last set up in; one
 * renderer per cell keeps every scene's lights (and shadow maps) its own. The cells use a standard depth
 * buffer (the stricter test for z-fighting; also, in three r186, PCF shadows from spot and point lights
 * compare against log-encoded depth when logarithmicDepthBuffer is on). The in-situ pages use the film's
 * settings (log depth on).
 */
const CellCanvas: React.FC<{ v: ViewDef }> = ({ v }) => (
  <div style={{ position: "absolute", left: v.rect[0], top: v.rect[1], width: v.rect[2], height: v.rect[3] }}>
    <ThreeCanvas width={v.rect[2]} height={v.rect[3]} shadows gl={{ antialias: true, logarithmicDepthBuffer: !!v.logDepth, preserveDrawingBuffer: true }} camera={{ fov: 30, position: [0, 5, 5] }}>
      <color attach="background" args={[v.bg]} />
      <CamRig c={v.cam} />
      {v.node}
    </ThreeCanvas>
  </div>
);

const pieceViews = (p: Piece, top: number, t: number): ViewDef[] => {
  const cw = W / 2;
  const ch = 480;
  const nightBg = p.bg?.[0] ?? "#0B0E14";
  const dayBg = p.bg?.[1] ?? "#B9C6D2";
  const node = (mode: "night" | "day") => (
    <>
      {p.set(mode, t)}
      <Rig mode={mode} c={p.c} r={p.r} warm={p.warm === undefined ? V(p.c.x, p.c.y + 1.2, p.c.z + 0.5) : p.warm} />
    </>
  );
  return [
    { node: node("night"), cam: p.over, rect: [0, top, cw, ch], bg: nightBg, label: "overhead 18° · night" },
    { node: node("day"), cam: p.over, rect: [cw, top, cw, ch], bg: dayBg, label: "overhead 18° · day" },
    { node: node("night"), cam: p.q1, rect: [0, top + ch, cw, ch], bg: nightBg, label: p.q1Label ?? "3/4 · night" },
    { node: node("day"), cam: p.q2 ?? p.q1, rect: [cw, top + ch, cw, ch], bg: dayBg, label: p.q2Label ?? "3/4 · day" },
  ];
};


// ------------------------------------------------------------------------------------------- verification
/**
 * A measurement mode (input prop verify: "laundry"): the treadmill at full laundry is triangulated from the
 * live scene graph and every laundry piece is tested against every other piece and against the frame
 * (edge-triangle crossings, a 2 cm hash grid), plus the wall-side bound. The report goes to the console.
 */
const VERIFY = (getInputProps() as { verify?: string }).verify ?? "";
type Tri = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; g: string };
const segTri = (p: THREE.Vector3, q: THREE.Vector3, t: Tri) => {
  const e1 = t.b.clone().sub(t.a);
  const e2 = t.c.clone().sub(t.a);
  const d = q.clone().sub(p);
  const h = d.clone().cross(e2);
  const det = e1.dot(h);
  if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det;
  const sv = p.clone().sub(t.a);
  const u = f * sv.dot(h);
  if (u < 0 || u > 1) return false;
  const qv = sv.clone().cross(e1);
  const v = f * d.dot(qv);
  if (v < 0 || u + v > 1) return false;
  const tt = f * e2.dot(qv);
  return tt > 1e-6 && tt < 1 - 1e-6;
};
const triTri = (A: Tri, B: Tri) => segTri(A.a, A.b, B) || segTri(A.b, A.c, B) || segTri(A.c, A.a, B) || segTri(B.a, B.b, A) || segTri(B.b, B.c, A) || segTri(B.c, B.a, A);
const runVerify = (scene: THREE.Scene) => {
  scene.updateMatrixWorld(true);
  const tris: Tri[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry || (m as unknown as THREE.Sprite).isSprite) return;
    let g = "frame";
    for (let a: THREE.Object3D | null = m; a; a = a.parent) {
      if (a.name.startsWith("laundry:")) {
        g = a.name.split(":")[1];
        break;
      }
      if (a.name.startsWith("v:")) {
        g = a.name;
        break;
      }
    }
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i + 2 < n; i += 3) tris.push({ a: v(i), b: v(i + 1), c: v(i + 2), g });
  });
  const C = 0.02;
  const grid = new Map<string, number[]>();
  const cells = (t: Tri) => {
    const mn = t.a.clone().min(t.b).min(t.c);
    const mx = t.a.clone().max(t.b).max(t.c);
    const out: string[] = [];
    for (let x = Math.floor(mn.x / C); x <= Math.floor(mx.x / C); x++)
      for (let y = Math.floor(mn.y / C); y <= Math.floor(mx.y / C); y++) for (let z = Math.floor(mn.z / C); z <= Math.floor(mx.z / C); z++) out.push(`${x},${y},${z}`);
    return out;
  };
  tris.forEach((t, i) => {
    for (const k of cells(t)) {
      const l = grid.get(k);
      if (l) l.push(i);
      else grid.set(k, [i]);
    }
  });
  const hits = new Map<string, { n: number; at: string[] }>();
  const cen = (t: Tri) => `${((t.a.x + t.b.x + t.c.x) / 3).toFixed(3)},${((t.a.y + t.b.y + t.c.y) / 3).toFixed(3)},${((t.a.z + t.b.z + t.c.z) / 3).toFixed(3)}`;
  let maxX = -9;
  tris.forEach((t, i) => {
    if (t.g === "frame") return;
    if (!t.g.startsWith("v:")) maxX = Math.max(maxX, t.a.x, t.b.x, t.c.x);
    const seen = new Set<number>();
    for (const k of cells(t))
      for (const j of grid.get(k) ?? []) {
        if (j === i || seen.has(j)) continue;
        seen.add(j);
        const u = tris[j];
        if (u.g === t.g) continue;
        if (u.g !== "frame" && j < i) continue;
        if (triTri(t, u)) {
          const key = [t.g, u.g].sort().join(" x ");
          const h = hits.get(key);
          const at = `${t.g}@${cen(t)}|${u.g}@${cen(u)}`;
          if (h) {
            h.n++;
            if (h.at.length < 4 && h.n % 7 === 1) h.at.push(at);
          } else hits.set(key, { n: 1, at: [at] });
        }
      }
  });
  return { triangles: tris.length, laundryMaxX: +maxX.toFixed(4), hits: Object.fromEntries(hits) };
};
const Verify: React.FC = () => {
  const scene = useThree((st) => st.scene);
  const { delayRender, continueRender } = useDelayRender();
  const [h] = React.useState(() => delayRender("verify"));
  React.useEffect(() => {
    const id = setTimeout(() => {
      const r = runVerify(scene);
      console.error("VERIFY " + JSON.stringify(r));
      continueRender(h);
    }, 50);
    return () => clearTimeout(id);
  }, [scene, h, continueRender]);
  return null;
};
const VerifyScene: React.FC<{ what: string }> = ({ what }) => {
  if (what === "door")
    return (
      <>
        {[0, 0.6, 1.2, 1.6].flatMap((o, i) =>
          ([-1, 1] as const).map((sw) => (
            <group key={`${i}${sw}`} position={[i * 2.2, 0, sw * 3]}>
              <Door open={o} swing={sw} hinge={i % 2 ? 1 : -1} />
            </group>
          )),
        )}
      </>
    );
  if (what === "garland") return <Banister length={3.2} garland={{ on: 1, seed: 2 }} />;
  if (what === "window")
    return (
      <>
        <Window rain={1} time={1} snowCorner={1} curtains={{ color: "#C9B6DC", open: 0.8 }} />
        <group position={[2, 0, 0]}>
          <Window curtains={{ color: "#9FB9D6", open: 0, length: "floor" }} snowCorner={0.4} />
        </group>
        <group position={[4, 0, 0]}>
          <Window curtains={{ color: "#9FB9D6", open: 1 }} />
        </group>
      </>
    );
  if (what === "porchA") return <Porch leaves={110} lights={1} overflow={1} time={1.3} />;
  if (what === "porchB") return <Porch snow={0.3} lights={1} />;
  if (what === "porchC") return <Porch snow={1} lights={1} />;
  if (what === "hall")
    return (
      <>
        <CeilingFixture on={1} cut />
        <group position={[1, 0, 0]}>
          <CeilingFixture on={1} cut={false} />
        </group>
        <group position={[0, -2, 0]}>
          <HallNightlight />
        </group>
        <group position={[2, -2, 0]}>
          <PuppyBed />
        </group>
      </>
    );
  return <Treadmill laundry={1} />;
};
const VerifyPage: React.FC = () => (
  <AbsoluteFill style={{ background: "#111" }}>
    <ThreeCanvas width={540} height={480} gl={{ preserveDrawingBuffer: true }} camera={{ fov: 30, position: [2, 3, 3] }}>
      <VerifyScene what={VERIFY} />
      <Verify />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const PropsTestB: React.FC = () => {
  const frame = useCurrentFrame();
  if (VERIFY) return <VerifyPage />;
  return <PropsTestBMain frame={frame} />;
};
const PropsTestBMain: React.FC<{ frame: number }> = ({ frame }) => {
  const page = Math.min(PAGES.length - 1, Math.floor(frame / 8));
  const t = frame / 30;
  const pg = PAGES[page];
  const { views, titles } = useMemo(() => {
    if ("pieces" in pg) {
      const vs = pg.pieces.flatMap((p, i) => pieceViews(p, i * 960, t));
      return { views: vs, titles: pg.pieces.map((p, i) => ({ y: i * 960, text: p.name })) };
    }
    if ("situ" in pg) {
      const c = cameraFor(PRESETS.wide);
      const target = c.pos.clone().add(V(0, 0, -1).applyQuaternion(c.quat));
      return {
        views: [{ node: <Situ era={pg.situ} t={t} />, cam: { pos: c.pos, target, quat: c.quat, fov: c.fov }, rect: [0, 0, W, H] as [number, number, number, number], bg: "#000000", label: "", logDepth: true }],
        titles: [{ y: 0, text: pg.situ === "2004" ? "In the house · PRESETS.wide · 2004 night: doors, windows, porch with leaves, hall dome, dog bed" : "In the house · PRESETS.wide · Christmas 2025: snow, C9 lights, garland, treadmill rack" }],
      };
    }
    const cw = W / 2;
    const ch = 480;
    const vs: ViewDef[] = CLOSE.map((c, i) => ({
      node: (
        <>
          {c.set(t)}
          <Rig mode={c.mode} c={c.c} r={c.r} warm={c.warm ?? null} />
        </>
      ),
      cam: c.cam,
      rect: [(i % 2) * cw, Math.floor(i / 2) * ch, cw, ch] as [number, number, number, number],
      bg: c.mode === "night" ? "#0B0E14" : "#B9C6D2",
      label: c.label,
    }));
    return { views: vs, titles: [] };
  }, [pg, t]);
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {views.map((v, i) => (
        <CellCanvas key={`${page}-${i}`} v={v} />
      ))}
      {views.map((v, i) =>
        v.label ? (
          <div key={i} style={{ position: "absolute", left: v.rect[0] + 10, top: v.rect[1] + v.rect[3] - 34, font: "500 17px Inter, Helvetica, Arial, sans-serif", color: "#fff", background: "rgba(0,0,0,0.55)", padding: "3px 8px", borderRadius: 4 }}>
            {v.label}
          </div>
        ) : null,
      )}
      {titles.map((tt, i) => (
        <div key={`t${i}`} style={{ position: "absolute", left: 10, top: tt.y + 8, font: "600 20px Inter, Helvetica, Arial, sans-serif", color: "#fff", background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: 4 }}>
          {tt.text}
        </div>
      ))}
      <div style={{ position: "absolute", right: 10, top: 8, font: "500 16px Inter, Helvetica, Arial, sans-serif", color: "#ddd", background: "rgba(0,0,0,0.6)", padding: "3px 8px", borderRadius: 4 }}>
        props B · page {page + 1}/{PAGES.length}
      </div>
      {[0, 1, 2, 3].map((i) =>
        "pieces" in pg || "close" in pg ? <div key={`gx${i}`} style={{ position: "absolute", left: 539, top: i * 480, width: 2, height: 480, background: "#111" }} /> : null,
      )}
      {[1, 2, 3].map((i) => ("pieces" in pg || "close" in pg ? <div key={`gy${i}`} style={{ position: "absolute", left: 0, top: i * 480 - 1, width: W, height: 2, background: i === 2 ? "#444" : "#111" }} /> : null))}
    </AbsoluteFill>
  );
};
