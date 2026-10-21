import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AbsoluteFill, getInputProps, useCurrentFrame } from "remotion";
import { BEAGLE, Beagle, type BeaglePose } from "./Beagle";
import { PuppyBed } from "./props/house";
import { cameraFor, type Preset } from "./layout";

/**
 * Moose in every pose, adult and puppy, under warm interior light: the film's overhead angle (camera above,
 * 18 degrees from vertical, up the frame = -z, long lens) and a 3/4 view; the trot animates over the 60
 * frames (three strides). Page 1: the trot from the side and from above, big, for the gait. Page 2: film
 * scale (the WIDE and MEDIUM preset distances). inputProps: { page?: number, focus?: string (one cell id
 * full frame), view?: "top" | "q" | "side" }.
 */

type View = "top" | "q" | "side" | "front";
type Cell = {
  id: string;
  label: string;
  /** bounding radius of what to frame (m) and its centre relative to the cell origin */
  r: number;
  c: [number, number, number];
  node: (t: number, f: number) => React.ReactNode;
  view: View;
  /** a film preset (relative to the cell origin) instead of the framing */
  cam?: Preset;
  floor?: number;
};

const TILT = THREE.MathUtils.degToRad(18);
const DIRS: Record<View, THREE.Vector3> = {
  top: new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT)),
  q: new THREE.Vector3(0.62, 0.42, 0.66).normalize(),
  side: new THREE.Vector3(1, 0.12, 0).normalize(),
  front: new THREE.Vector3(0.15, 0.25, -1).normalize(),
};

const floorMat = new THREE.MeshStandardMaterial({ color: "#8A6E52", roughness: 0.85 });
const rugMat = new THREE.MeshStandardMaterial({ color: "#B9AFA2", roughness: 0.97 });
const bedMat = new THREE.MeshStandardMaterial({ color: "#E9E3D8", roughness: 0.8 });
const wallMat = new THREE.MeshStandardMaterial({ color: "#D8CFC2", roughness: 0.9 });

/** the poses on the contact sheet, with how each one is turned for the two views */
const rows = (f: number): { id: string; label: string; pose: (t: number) => BeaglePose; yawTop: number; yawQ: number; bed?: boolean; r: [number, number] }[] => [
  { id: "stand", label: "stand", pose: (t) => ({ kind: "stand", t, wag: 0.6 }), yawTop: 0.55, yawQ: -2.0, r: [0.4, 0.24] },
  { id: "trot", label: "trot", pose: (t) => ({ kind: "trot", t, phase: f / 20 }), yawTop: 0.55, yawQ: -2.0, r: [0.4, 0.24] },
  { id: "lieDown", label: "lie, chin on paws", pose: (t) => ({ kind: "lie", t, headUp: 0 }), yawTop: 0.55, yawQ: -2.0, r: [0.36, 0.22] },
  { id: "lieUp", label: "lie, head up, ear flipped", pose: (t) => ({ kind: "lie", t, headUp: 1, earFlip: Math.min(1, f / 40), wag: 0.5 }), yawTop: 0.55, yawQ: -2.0, r: [0.36, 0.22] },
  { id: "flop", label: "flop, eyes closing", pose: (t) => ({ kind: "flop", t, blink: 0.25 + 0.75 * Math.min(1, f / 50), faceUp: 0.55 }), yawTop: 0.3, yawQ: -2.0, r: [0.4, 0.24] },
  { id: "curl", label: "curl (puppy in its bed)", pose: (t) => ({ kind: "curl", t }), yawTop: 0.4, yawQ: -1.7, bed: true, r: [0.34, 0.27] },
];

const cellsFor = (page: number, f: number): { title: string; cols: number; rowsN: number; cells: Cell[] } => {
  if (page === 1) {
    const mk = (puppy: boolean, view: View, yaw: number): Cell => ({
      id: `gait-${puppy ? "p" : "a"}-${view}`,
      label: `${puppy ? "puppy" : "adult"} trot · ${view}`,
      r: puppy ? 0.24 : 0.4,
      c: [0, puppy ? 0.13 : 0.24, 0],
      view,
      node: (t, fr) => <Beagle at={new THREE.Vector3()} yaw={yaw} pose={{ kind: "trot", t, phase: fr / 20 }} puppy={puppy} />,
    });
    return { title: "gait (3 strides over 60 frames)", cols: 2, rowsN: 2, cells: [mk(false, "side", 0), mk(true, "side", 0), mk(false, "top", Math.PI / 2), mk(true, "top", Math.PI / 2)] };
  }
  if (page === 2) {
    const scene = (t: number, fr: number) => {
      // a moving trot across your room (the paws must not slide), the puppy curled in Nora's doorway, an adult
      // flopped on the rug by your bed
      const ph = fr / 20;
      const x = 0.5 + ((ph * BEAGLE.stride(false)) % 1.6);
      return (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, -1.8]} material={floorMat} receiveShadow>
            <planeGeometry args={[5.2, 4.4]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.6, 0.002, -2.2]} material={rugMat} receiveShadow>
            <planeGeometry args={[1.2, 1.6]} />
          </mesh>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.535, 0.25, -2.625]} material={bedMat} castShadow receiveShadow>
              <boxGeometry args={[0.95, 0.5, 1.95]} />
            </mesh>
          ))}
          <mesh position={[0, 0.55, -1.8]} material={wallMat} castShadow receiveShadow>
            <boxGeometry args={[0.12, 1.1, 3.6]} />
          </mesh>
          <group position={[-1.52, 0, -3.35]}>
            <PuppyBed />
            <Beagle at={new THREE.Vector3()} yaw={0.4} pose={{ kind: "curl", t }} puppy inBed />
          </group>
          <Beagle at={new THREE.Vector3(1.75, 0.002, -2.45)} yaw={-1.2} pose={{ kind: "flop", t, blink: 0.7, faceUp: 0.55 }} />
          <Beagle at={new THREE.Vector3(x, 0, -1.1)} yaw={-Math.PI / 2} pose={{ kind: "trot", t, phase: ph }} />
        </group>
      );
    };
    return {
      title: "film scale: PLAN WIDE (11.9 m) and MEDIUM distance (5.0 m)",
      cols: 1,
      rowsN: 2,
      cells: [
        { id: "wide", label: "PLAN WIDE", r: 1, c: [0, 0, 0], view: "top", cam: { target: new THREE.Vector3(0, 0.55, -1.75), dist: 11.9 }, node: scene },
        { id: "medium", label: "MEDIUM distance, on the dogs", r: 1, c: [0, 0, 0], view: "top", cam: { target: new THREE.Vector3(0.6, 0.2, -2.2), dist: 5.0 }, node: scene },
      ],
    };
  }
  const cells: Cell[] = [];
  for (const row of rows(f))
    for (const puppy of [false, true])
      for (const view of ["top", "q"] as View[]) {
        const r = row.r[puppy ? 1 : 0] * (view === "top" ? 1.12 : 1);
        const inBed = !!row.bed && puppy;
        // frame the dog's middle: along its length from its feet origin, turned with it
        const yaw = view === "top" ? row.yawTop : row.yawQ;
        const k = puppy ? 0.6 : 1;
        const along = inBed ? 0 : row.id === "curl" ? 0.06 * k : row.id === "flop" ? -0.05 * k : row.id.startsWith("lie") ? -0.14 * k : -0.09 * k;
        const cx = Math.sin(yaw) * along;
        const cz = Math.cos(yaw) * along;
        cells.push({
          id: `${row.id}-${puppy ? "p" : "a"}-${view}`,
          label: `${puppy ? "puppy" : "adult"} · ${row.label}`,
          r,
          c: [cx, r * (row.id.startsWith("stand") || row.id === "trot" ? 0.55 : 0.3), cz],
          view,
          node: (t) => (
            <group>
              {inBed ? <PuppyBed /> : null}
              <Beagle at={new THREE.Vector3()} yaw={view === "top" ? row.yawTop : row.yawQ} pose={row.pose(t)} puppy={puppy} inBed={inBed} />
            </group>
          ),
        });
      }
  return { title: "Moose: adult (left two) and puppy (right two), film overhead · 3/4", cols: 4, rowsN: 6, cells };
};

// --------------------------------------------------------------------------------------------- render
const W = 1080;
const H = 1920;
const SP = 8;
type Placed = Cell & { origin: THREE.Vector3; rect: [number, number, number, number] };

const MultiView: React.FC<{ cells: Placed[]; t: number; f: number }> = ({ cells, t, f }) => {
  const { gl, scene } = useThree();
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const cam = useMemo(() => new THREE.PerspectiveCamera(30, 1, 0.01, 100), []);
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    pm.dispose();
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl, scene]);
  useFrame(() => {
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
      gl.setClearColor("#2E2924");
      gl.clear();
      const target = c.origin.clone().add(new THREE.Vector3(...c.c));
      let R = Math.max(0.2, c.r * 1.8);
      if (c.cam) {
        const k = cameraFor({ ...c.cam, target: c.cam.target.clone().add(c.origin) });
        cam.position.copy(k.pos);
        cam.quaternion.copy(k.quat);
        cam.fov = k.fov;
        cam.near = 0.1;
        cam.far = 40;
        target.copy(c.cam.target).add(c.origin);
        R = 3.2;
      } else {
        const dir = DIRS[c.view];
        const aspect = w / h;
        const vh = THREE.MathUtils.degToRad(15);
        const hh = Math.atan(Math.tan(vh) * aspect);
        const dist = (c.r / Math.sin(Math.min(vh, hh))) * 1.02;
        cam.position.copy(target).addScaledVector(dir, dist);
        cam.up.set(...((c.view === "top" ? [0, 0, -1] : [0, 1, 0]) as [number, number, number]));
        cam.lookAt(target);
        cam.fov = 30;
        cam.near = Math.max(0.01, dist - c.r * 4);
        cam.far = dist + c.r * 6;
      }
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      // a warm lamp high to one side, a soft cool-ish bounce opposite
      const kl = key.current!;
      kl.position.copy(target).add(new THREE.Vector3(-0.6, 1.0, 0.5).multiplyScalar(R * 2.2));
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
      kl.shadow.bias = -0.0001 * R;
      kl.shadow.normalBias = 0.0015 * R;
      kl.intensity = 2.4;
      const fl = fill.current!;
      fl.position.copy(target).add(new THREE.Vector3(0.8, 0.6, -0.3).multiplyScalar(R * 2));
      fl.target.position.copy(target);
      fl.target.updateMatrixWorld();
      fl.intensity = 0.45;
      gl.render(scene, cam);
    }
    gl.setScissorTest(false);
  }, 1);
  return (
    <>
      <directionalLight ref={key} color="#FFD7A8" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight ref={fill} color="#D9E2F0" />
      <hemisphereLight ref={hemi} args={["#FFE6C7", "#4A3B2E", 0.7]} />
      {cells.map((c) => (
        <group key={c.id} position={c.origin}>
          {!c.cam ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0008, 0]} material={floorMat} receiveShadow>
              <planeGeometry args={[Math.max(1.5, c.r * 8), Math.max(1.5, c.r * 8)]} />
            </mesh>
          ) : null}
          {c.node(t, f)}
        </group>
      ))}
    </>
  );
};

export const BeagleTest: React.FC = () => {
  const frame = useCurrentFrame();
  const ip = getInputProps() as { page?: number; focus?: string; view?: View; ids?: string[]; cols?: number };
  const t = frame / 30;
  const page = cellsFor(ip.page ?? 0, frame);
  let placed: Placed[];
  let title = page.title;
  if (ip.ids) {
    const all = [0, 1, 2].flatMap((p) => cellsFor(p, frame).cells);
    const sel = ip.ids.map((id) => all.find((e) => e.id === id)!).filter(Boolean);
    const cols = ip.cols ?? 2;
    const rowsN = Math.ceil(sel.length / cols);
    const cw = W / cols;
    const ch = H / rowsN;
    placed = sel.map((c, i) => ({ ...c, origin: new THREE.Vector3((i % 6) * SP, 0, Math.floor(i / 6) * SP), rect: [(i % cols) * cw, Math.floor(i / cols) * ch, cw, ch] }));
    title = "selection";
  } else if (ip.focus) {
    const all = [0, 1, 2].flatMap((p) => cellsFor(p, frame).cells);
    const c = all.find((e) => e.id === ip.focus) ?? all[0];
    const cell = { ...c, view: ip.view ?? c.view };
    placed = [{ ...cell, origin: new THREE.Vector3(), rect: [0, 0, W, H] }];
    title = `${c.label} · ${cell.view}`;
  } else {
    const cw = W / page.cols;
    const ch = H / page.rowsN;
    placed = page.cells.map((c, i) => ({ ...c, origin: new THREE.Vector3((i % 6) * SP, 0, Math.floor(i / 6) * SP), rect: [(i % page.cols) * cw, Math.floor(i / page.cols) * ch, cw, ch] }));
  }
  return (
    <AbsoluteFill style={{ background: "#15130F" }}>
      <ThreeCanvas width={W} height={H} gl={{ antialias: true }} camera={{ fov: 30, position: [0, 5, 5] }}>
        <MultiView cells={placed} t={t} f={frame} />
      </ThreeCanvas>
      {placed.map((c) => (
        <div key={c.id} style={{ position: "absolute", left: c.rect[0] + 8, top: c.rect[1] + 6, fontFamily: "sans-serif", fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.45)", padding: "2px 7px", borderRadius: 4 }}>
          {c.label} · {c.view === "q" ? "3/4" : c.view}
        </div>
      ))}
      {placed.length > 1 ? placed.map((c) => <div key={`${c.id}-b`} style={{ position: "absolute", left: c.rect[0], top: c.rect[1], width: c.rect[2], height: c.rect[3], boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }} />) : null}
      <div style={{ position: "absolute", right: 10, bottom: 8, fontFamily: "sans-serif", fontSize: 18, color: "rgba(255,255,255,0.75)" }}>
        {title} · frame {frame}
      </div>
    </AbsoluteFill>
  );
};
