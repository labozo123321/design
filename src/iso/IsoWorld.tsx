import React from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import CUES from "./cues.json";
import { ISO } from "./look";
import {
  Apartment,
  CHAIR,
  Figure,
  GoldLine,
  Haze,
  Lamps,
  Mailbox,
  PATH,
  PLAZA,
  PathStones,
  Plaza,
  Storefront,
  Studio,
  Tile,
  Towers,
  Track,
  V3,
} from "./parts";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SMOOTH = Easing.bezier(0.45, 0, 0.2, 1);

/* ------------------------------------------------------------------ */
/* Figure route                                                         */
/* ------------------------------------------------------------------ */

const SEAT: V3 = [CHAIR[0], 0.06, CHAIR[2]];
const STOOD: V3 = [CHAIR[0], 0, CHAIR[2] + 0.16];
const PLAZA_SPOT: V3 = [PLAZA[0] - 0.5, 0.07, PLAZA[2] - 0.5];

/** (frame, x, y, z) keyframes: off the chair, onto each stone just after it lands, into the plaza. */
const ROUTE: [number, number, number, number][] = [
  [CUES.stand[1], STOOD[0], STOOD[1], STOOD[2]],
  [CUES.stones[0] + 6, PATH[0][0], 0.06, PATH[0][1]],
  ...PATH.slice(1).map(
    ([x, z], i) => [CUES.stones[i + 1] + 6, x, 0.06, z] as [number, number, number, number],
  ),
  [CUES.plazaArrive, PLAZA_SPOT[0], PLAZA_SPOT[1], PLAZA_SPOT[2]],
];
const RF = ROUTE.map((r) => r[0]);

const routeAt = (f: number): V3 => [
  interpolate(
    f,
    RF,
    ROUTE.map((r) => r[1]),
    CLAMP,
  ),
  interpolate(
    f,
    RF,
    ROUTE.map((r) => r[2]),
    CLAMP,
  ),
  interpolate(
    f,
    RF,
    ROUTE.map((r) => r[3]),
    CLAMP,
  ),
];

const figureAt = (frame: number) => {
  const [s0, s1] = CUES.stand;
  const standT = interpolate(frame, [s0, s1], [0, 1], { ...CLAMP, easing: SMOOTH });
  const seated = frame < s1;
  const pos: V3 = seated
    ? [SEAT[0], SEAT[1] + (STOOD[1] - SEAT[1]) * standT, SEAT[2] + (STOOD[2] - SEAT[2]) * standT]
    : routeAt(frame);
  const a = routeAt(frame - 4);
  const b = routeAt(frame + 4);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const moving = Math.hypot(dx, dz);
  // facing: desk (-z) while seated, then along the route; at the plaza, toward the monument
  let heading = Math.PI;
  if (frame >= CUES.plazaArrive - 2) heading = Math.atan2(PLAZA[0] - pos[0], PLAZA[2] - pos[2]);
  else if (moving > 0.01) heading = Math.atan2(dx, dz);
  else if (!seated) heading = Math.atan2(PATH[0][0] - STOOD[0], PATH[0][1] - STOOD[2]);
  if (frame < s1 + 8) {
    const towardPath = Math.atan2(PATH[0][0] - STOOD[0], PATH[0][1] - STOOD[2]);
    const turn = interpolate(frame, [s1 - 10, s1 + 8], [0, 1], { ...CLAMP, easing: SMOOTH });
    heading = Math.PI + (towardPath - Math.PI) * turn;
  }
  return {
    pos,
    heading,
    sit: 1 - standT,
    walking: Math.min(1, moving / 0.12),
  };
};

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

const ELEV = (30 * Math.PI) / 180;

const CameraRig: React.FC = () => {
  const frame = useCurrentFrame();
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;

  // zoom = pixels per world unit
  const zoom = interpolate(
    frame,
    [0, 90, 170, 215, 330, 395, 450, 528],
    [205, 190, 125, 100, 96, 78, 76, 66],
    { ...CLAMP, easing: SMOOTH },
  );
  // camera loosely trails the figure through Shot 3
  const lag = figureAt(frame - 10).pos;
  const desk: V3 = [-3.2, 0.35, -3.7];
  const mid: V3 = [-2.6, 0.25, -2.6];
  const follow: V3 = [lag[0] * 0.75, 1.4, lag[2] * 0.75];
  const city: V3 = [0.5, 1.6, 0.4];
  const high: V3 = [0.2, 4.4, 0.2];
  const keys: [number, V3][] = [
    [0, desk],
    [95, desk],
    [175, mid],
    [215, follow],
    [328, follow],
    [395, city],
    [450, city],
    [528, high],
  ];
  const target = [0, 1, 2].map((k) =>
    interpolate(
      frame,
      keys.map((x) => x[0]),
      keys.map((x) => x[1][k]),
      { ...CLAMP, easing: SMOOTH },
    ),
  ) as V3;
  // slow orbit, about 15 degrees over the whole piece
  const az = ((38 + interpolate(frame, [0, 528], [0, 15], { ...CLAMP, easing: SMOOTH })) * Math.PI) / 180;
  const dist = 40;
  camera.position.set(
    target[0] + Math.sin(az) * Math.cos(ELEV) * dist,
    target[1] + Math.sin(ELEV) * dist,
    target[2] + Math.cos(az) * Math.cos(ELEV) * dist,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(target[0], target[1], target[2]);
  camera.zoom = zoom;
  camera.near = 0.1;
  camera.far = 200;
  camera.updateProjectionMatrix();
  return null;
};

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

export const IsoWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fig = figureAt(frame);
  const slump = 1 - spring({ frame: frame - CUES.sitUp, fps, config: { damping: 18, stiffness: 90 } });
  const laptop = interpolate(frame, [CUES.laptopOn, CUES.laptopOn + 10], [0, 1], CLAMP);
  const line = interpolate(frame, CUES.line, [0, 1], { ...CLAMP, easing: SMOOTH });
  const [p0, p1] = CUES.pullback;

  // the world wakes up: from a single desk lamp to full moonlit key
  const wake = interpolate(frame, [CUES.laptopOn, 200, 340], [0, 0.55, 1], CLAMP);
  const keyI = 0.5 + wake * 2.3;
  const ambI = 0.22 + wake * 0.4;

  // progress rail: studio, store, mailbox, monument
  const rail = interpolate(
    frame,
    [
      CUES.studio[1],
      CUES.studio[1] + 10,
      CUES.store[1],
      CUES.store[1] + 10,
      CUES.mailbox[1],
      CUES.mailbox[1] + 10,
      CUES.monument[0],
      CUES.monument[1],
    ],
    [0, 0.2, 0.2, 0.45, 0.45, 0.7, 0.7, 1],
    { ...CLAMP, easing: SMOOTH },
  );
  const fill = interpolate(frame, CUES.monument, [0, 1], {
    ...CLAMP,
    easing: Easing.bezier(0.3, 0, 0.25, 1),
  });
  // the tile turns a few degrees and rests with a small settle
  const rest = spring({ frame: frame - p0, fps, config: { damping: 16, stiffness: 40, mass: 1.4 } });
  const tileTurn = ((-6 * Math.PI) / 180) * rest;
  const lift = interpolate(frame, [p0, p1], [0, 0.25], { ...CLAMP, easing: SMOOTH });

  return (
    <>
      <CameraRig />
      <ambientLight intensity={ambI} color="#8EA2C8" />
      <hemisphereLight args={["#6E7FA6", "#0A0F1E", 0.25 + wake * 0.35]} />
      <directionalLight
        position={[-7, 12, 6]}
        intensity={keyI}
        color="#E9E3D8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0006}
        shadow-radius={4}
      />
      {/* warm rim from behind */}
      <directionalLight position={[6, 5, -9]} intensity={0.35 + wake * 0.75} color={ISO.amber} />

      <group rotation={[0, tileTurn, 0]} position={[0, lift, 0]}>
        <Tile rail={rail} />
        <Apartment laptop={laptop} lamp={1} build={1} />
        <GoldLine progress={line} />
        <PathStones />
        <Studio />
        <Storefront />
        <Mailbox />
        <Towers />
        <Track />
        <Lamps />
        <Plaza fill={fill} />
        <Figure
          position={fig.pos}
          heading={fig.heading}
          sit={fig.sit}
          walk={frame * 0.62}
          walking={fig.walking}
          slump={slump}
        />
        <Haze amount={0.4 + wake * 0.6} />
      </group>
    </>
  );
};
