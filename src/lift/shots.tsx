import React from "react";
import * as THREE from "three";
import { Cam, orbit, mixCam, shake } from "./rig";
import { Grade, Ink, Lens } from "./Post";
import { at, DURATION } from "./timeline";
import { V, smooth, easeOut, lerp, clamp01, hash, smoother } from "./toon";
import { Chibi, CAST, arm, mixArm, ChibiProps, walk, ArmPose, Look } from "./Chibi";
import { WarRoom } from "./sets/WarRoom";
import { Rooftop } from "./sets/Rooftop";
import { LaunchPad, IgnitionBurst } from "./sets/Rocket";
import { Height, SPACE_Y } from "./sets/Height";
import { Space, Capture, JunkField, GEO_R, TOP_R, R, Billboard } from "./sets/Space";
import { Steel } from "./sets/Steel";
import { FactoryHall, FactoryOutside, balanceTilt } from "./sets/Factory";
import { Ocean, DECK, Confetti, Wheel } from "./sets/Ocean";
import { Cabin, TopDeck } from "./sets/Cabin";
import { Label, Cloud } from "./sets/common";
import { flat, toon } from "./toon";
import { Fx } from "./Fx";

/**
 * The edit: every shot starts on a word of the narration (a hair before it, as an editor would cut).
 * make(t, u): t is the film's second, u the second into the shot.
 */

export type ShotState = {
  cam: Cam;
  content: React.ReactNode;
  lens?: Lens;
  grade?: Partial<Grade>;
  bloom?: { strength: number; radius?: number; threshold?: number };
  ink?: Ink;
  blur?: false;
  /** a point that stands still in the scene, so the blur sees the camera's travel too */
  blurRef?: THREE.Vector3;
};
export type Shot = { id: string; t0: number; make: (t: number, u: number) => ShotState };

const C = (px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 34, roll = 0): Cam => ({ pos: V(px, py, pz), target: V(tx, ty, tz), fov, roll });
const lens = (cam: Cam, focusAt: THREE.Vector3, aperture: number, maxR?: number): Lens => ({ focus: cam.pos.distanceTo(focusAt), aperture, maxR });

const blinkAt = (t: number, seed = 0) => {
  const period = 3.1 + (seed % 3) * 0.7;
  const ph = (t + seed * 1.37) % period;
  return ph < 0.06 ? ph / 0.06 : ph < 0.13 ? 1 - (ph - 0.06) / 0.07 : 0;
};

type P = Partial<ChibiProps> & { t: number; seed?: number };
const Person: React.FC<P & { look: Look }> = ({ t, seed = 0, look, ...p }) => <Chibi look={look} {...p} face={{ blink: blinkAt(t, seed), ...(p.face ?? {}) }} />;
const You: React.FC<P> = (p) => <Person look={CAST.you} {...p} />;

/** A breath: a slow bob for anyone standing still. */
const idle = (t: number, seed = 0) => 0.006 * Math.sin(t * 2.2 + seed);
/** A laugh: quick bounces. */
const laughBob = (t: number, seed = 0) => Math.abs(Math.sin(t * 13 + seed)) * 0.03;
const yawTo = (from: [number, number], to: [number, number]) => Math.atan2(to[0] - from[0], to[1] - from[1]);

const S: Shot[] = [];
const shot = (id: string, t0: number, make: Shot["make"]) => S.push({ id, t0, make });
const cut = (i: number, w: number | string = 0, lead = 0.1) => at(i, w) - lead;

// ======================================================================= 0-2: the roof, the dream, the fear
const LAUNCH_FAR = 3.95;
shot("roof-wide", 0, (t, u) => {
  const k = smoother(u / 1.5);
  const cam = mixCam(C(1.6, 5.2, 8.8, 0, 2.2, -8, 36), C(0.3, 1.55, 2.8, 0.05, 2.6, -10, 34), k);
  return {
    cam,
    content: (
      <>
        <Rooftop t={t} />
        <You t={t} pos={[0, 0, 0]} yaw={Math.PI} head={{ pitch: -0.38 }} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(0, 1, 0), 0.03),
    grade: { fade: smooth(0, 0.45, t) },
  };
});
shot("roof-face", cut(0, "more", 0.12), (t, u) => {
  const cam = C(0.22 - 0.05 * u, 0.86, -1.45 + 0.12 * u, 0, 1.02, 0, 32);
  return {
    cam,
    content: (
      <>
        <Rooftop t={t} />
        <You t={t} yaw={Math.PI} head={{ pitch: -0.32 }} face={{ eyes: "open", look: [0, 0.9], brows: "up", mouth: "smile", blush: true }} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(0, 1.02, -0.2), 0.1),
  };
});
shot("roof-problem", cut(1, 0, 0.12), (t, u) => {
  const cam = C(-1.15 + 0.1 * u, 1.05, -2.5 + 0.15 * u, 0, 0.95, 0, 34);
  const turn = smooth(0.55, 0.95, u);
  return {
    cam,
    content: (
      <>
        <Rooftop t={t} launch={LAUNCH_FAR} />
        <You
          t={t}
          yaw={Math.PI}
          head={{ pitch: lerp(-0.25, 0.02, turn), yaw: lerp(0, -0.42, turn) }}
          face={{ eyes: turn > 0.5 ? "half" : "open", look: [lerp(0, -0.8, turn), lerp(0.6, 0, turn)], brows: turn > 0.5 ? "worry" : "up", mouth: turn > 0.5 ? "flat" : "smile" }}
          bob={idle(t)}
        />
      </>
    ),
    lens: lens(cam, V(0, 1, 0), 0.08),
  };
});
shot("roof-launch", cut(2, 0, 0.1), (t, u) => {
  const cam = shake(C(-0.75, 1.55, 1.7, 8, 2.5, -60, 30), t, 0.02 * smooth(0.1, 0.4, u), 3);
  const jump = Math.sin(clamp01((u - 0.25) / 0.35) * Math.PI) * 0.12;
  return {
    cam,
    content: (
      <>
        <Rooftop t={t} launch={LAUNCH_FAR} />
        <You t={t} yaw={Math.PI} bob={jump} squash={1 - jump * 0.6} head={{ yaw: -0.3 }} arms={{ right: arm("cover"), left: arm("cover", "left") }} />
      </>
    ),
    lens: lens(cam, V(8, 2, -60), 0.04),
  };
});
shot("roof-scared", cut(2, "terrify", -0.05), (t) => {
  const cam = shake(C(0.12, 0.98, -1.15, 0, 0.98, 0, 32), t, 0.012, 4);
  const shiver = Math.sin(t * 47) * 0.02;
  return {
    cam,
    content: (
      <>
        <Rooftop t={t} launch={LAUNCH_FAR} />
        <pointLight position={[1.2, 1.2, -1.6]} intensity={2.4 + 0.6 * Math.sin(t * 31)} distance={4} color="#ff9a3c" />
        <You t={t} yaw={Math.PI} tilt={shiver} face={{ eyes: "spiral", mouth: "wavy", brows: "worry" }} sweat={1} arms={{ right: arm("cheeks"), left: arm("cheeks", "left") }} />
      </>
    ),
    lens: lens(cam, V(0, 0.98, -0.25), 0.11),
    blur: false,
  };
});

// ======================================================================= 3: every launch is a controlled explosion
const IGNITE = 6.0;
const LIFTOFF = 7.95;
const riseAt = (t: number) => {
  const u = t - LIFTOFF;
  return u > 0 ? 0.9 * u * u + 0.6 * u : 0;
};
shot("pad-ignite", cut(3, 0, 0.08), (t, u) => {
  const cam = shake(C(7.5 - 0.5 * u, 2.6, 13.5 - 0.8 * u, 0, 3.4, 0, 34), t, 0.03 * smooth(IGNITE, IGNITE + 0.3, t), 2.5);
  return {
    cam,
    content: (
      <>
        <LaunchPad t={t} ignite={IGNITE} liftoff={LIFTOFF} spread={4.2} />
        <IgnitionBurst t={t} t0={IGNITE + 0.05} />
      </>
    ),
    lens: lens(cam, V(0, 1.2, 0), 0.04),
    bloom: { strength: 0.45, radius: 0.4, threshold: 1.05 },
  };
});
shot("pad-liftoff", cut(3, "explosion,", -0.42), (t, u) => {
  const y = riseAt(t);
  const cam = shake(C(0, 2.2 + u * 0.6, 23, 0, 4.8 + y * 0.75, 0, 40), t, 0.06, 2);
  return {
    cam,
    content: <LaunchPad t={t} ignite={IGNITE} liftoff={LIFTOFF} spread={4.2} />,
    bloom: { strength: 0.5, radius: 0.45, threshold: 1.05 },
  };
});
shot("pad-crew", cut(3, "people", 0.1), (t, u) => {
  const y = riseAt(t) + 0.5;
  const k = smoother(u / 0.9);
  const a = C(2.6, y + 0.4, 6.0, 0, y + 1.2, 0, 40);
  const b = C(0.18, y + 7.66, 2.0, 0, y + 7.6, 0.6, 32);
  const cam = shake(mixCam(a, b, k), t, 0.006, 3);
  return {
    cam,
    content: <LaunchPad t={t} ignite={IGNITE} liftoff={LIFTOFF} crew spread={4.2} />,
    lens: lens(cam, V(0, y + 7.6, 0.65), 0.05 * k),
    bloom: { strength: 0.5, radius: 0.45, threshold: 1.05 },
  };
});

// ======================================================================= 4-6: the master plan
const ROOM_YOU: [number, number, number] = [0, 0, 0.6];
shot("plan-room", cut(4, 0, 0.12), (t, u) => {
  const k = smooth(0, 2.2, u);
  const cam = orbit(V(0, 1.0, 0.6), lerp(4.6, 3.6, easeOut(u / 2.2)), lerp(-0.6, -0.22, k), lerp(0.08, 0.13, k), 34);
  return {
    cam,
    content: (
      <>
        <WarRoom t={t} />
        <You t={t} pos={ROOM_YOU} yaw={0.15} arms={{ right: arm("cross"), left: arm("cross", "left") }} face={{ eyes: "half", brows: "smug", mouth: "smirk", look: [0.45, 0] }} head={{ yaw: 0.28, pitch: -0.04 }} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(0, 1.0, 0.6), 0.07),
  };
});
shot("plan-face", cut(4, "master", 0.1), (t, u) => {
  const cam = orbit(V(0.0, 0.98, 0.62), lerp(1.8, 1.55, easeOut(u / 1.1)), 0.14, 0.05, 32);
  return {
    cam,
    content: (
      <>
        <WarRoom t={t} />
        <You t={t} pos={ROOM_YOU} yaw={0.15} arms={{ right: arm("cross"), left: arm("cross", "left") }} face={{ eyes: "half", brows: "down", mouth: "grin" }} head={{ yaw: 0.0, pitch: 0.02 }} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(0, 0.98, 0.75), 0.1),
  };
});
const BOARD = V(-5.57, 1.95, -1.6);
shot("plan-board", cut(5, 0, 0.12), (t, u) => {
  const k = easeOut(u / 1.0);
  const cam = C(lerp(-1.9, -2.6, k), 2.15, lerp(1.6, 1.0, k), BOARD.x, 2.2, BOARD.z, 36);
  return {
    cam,
    content: <WarRoom t={t} sketch={smooth(0.05, 1.05, u)} />,
    lens: lens(cam, BOARD, 0.04),
  };
});
const PRESENT: [number, number, number] = [-4.3, 0, -0.1];
const presenter = (t: number, u: number, o: { hl?: number; checked?: number; sketch?: number; face: ChibiProps["face"]; arms: ChibiProps["arms"]; side?: number }): ShotState => {
  const sd = o.side ?? 0;
  const cam = C(-1.55 + sd * 0.3 - 0.15 * u, 1.12, 1.3 - 0.12 * u, -4.75, 1.32, -0.85, 36);
  const yaw = yawTo([PRESENT[0], PRESENT[2]], [cam.pos.x, cam.pos.z]);
  return {
    cam,
    content: (
      <>
        <WarRoom t={t} sketch={o.sketch ?? 1} hl={o.hl ?? -1} checked={o.checked ?? 0} />
        <You t={t} pos={PRESENT} yaw={yaw} arms={o.arms} face={o.face} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(PRESENT[0], 1.0, PRESENT[2]), 0.04),
  };
};
shot("plan-point", cut(5, "the", 0.08), (t, u) =>
  presenter(t, u, { arms: { right: arm("hip"), left: mixArm(arm("rest", "left"), arm("pointUp", "left"), smooth(0, 0.25, u)) }, face: { eyes: "half", brows: "smug", mouth: "grin" } }),
);
const boardShot = (hl: number, checked: number, side = 0) => (t: number, u: number): ShotState =>
  presenter(t, u, {
    hl,
    checked,
    side,
    arms: side > 0 ? { right: arm("hip"), left: arm("pointUp", "left") } : { right: arm("chin"), left: arm("cross", "left") },
    face: side > 0 ? { eyes: "half", brows: "smug", mouth: "smirk" } : { eyes: "half", brows: "raise", mouth: "flat", look: [0.5, 0.2] },
  });
shot("plan-height", cut(6, 0, 0.12), boardShot(0, 0));

// ======================================================================= 7: how high space is
shot("height-rise", cut(7, 0, 0.12), (t, u) => {
  const k = clamp01(u / 2.3);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const y = lerp(1.25, SPACE_Y - 1.2, e);
  const cam = C(0.4, y, 3.2 + 6 * Math.sin(e * Math.PI) , 0, y + lerp(2.6, 1.1, e), -9, lerp(36, 40, e));
  return {
    cam,
    content: (
      <>
        <Height camY={y} plane={clamp01((t - 17.4) / 2.4)} />
        <You t={t} pos={[0, 0, 0]} yaw={Math.PI} head={{ pitch: -0.45 }} bob={idle(t)} />
      </>
    ),
    lens: { focus: 20, aperture: 0 },
    blurRef: V(0, y + 8, -12),
  };
});
shot("height-stack", cut(7, "That's", 0.1), (_t, u) => {
  const cam = C(14, 33, 96 - 4 * u, 0, 32, 0, 40);
  return {
    cam,
    content: <Height camY={60} stack={clamp01((u - 0.05) / 1.1)} plane={1} bigLabel />,
  };
});

// ======================================================================= 8-9: geostationary
shot("space-pullback", cut(8, 0, 0.12), (t, u) => {
  const k = smoother(u / 2.7);
  const d = lerp(13.2, 165, Math.pow(k, 1.6));
  const cam = C(lerp(-2, 0, k), lerp(1.2, 30, k), d, 0, lerp(-1.6, 0, k), 0, lerp(42, 36, k));
  return {
    cam,
    content: <Space t={t} spin={1.9 + t * 0.03} base={false} up />,
    bloom: { strength: 0.5, radius: 0.5, threshold: 1.0 },
    blurRef: V(0, 0, 0),
  };
});
const tapeDots = (n: number, k: number) => (
  <Fx>
    {Array.from({ length: n }, (_, i) =>
      i / n <= k ? (
        <mesh key={i} position={[0, R + 1.6 + (i / (n - 1)) * (GEO_R - R - 3.2), 0]} material={flat("#ffd23f", 2.2)}>
          <sphereGeometry args={[0.7, 10, 8]} />
        </mesh>
      ) : null,
    )}
  </Fx>
);
shot("space-geo", cut(8, "Thirty-six", 0.1), (t, u) => {
  const cam = C(62 - 6 * u, 34, 212 - 6 * u, 0, 32, 0, 38);
  return {
    cam,
    content: (
      <Space t={t} spin={1.9 + t * 0.03} geo={1} base={false} up labels={[{ text: "36,000 km", at: [-14, 40, 4], h: 9, k: smooth(0.2, 0.5, u) }]}>
        {tapeDots(26, smooth(0, 0.7, u))}
      </Space>
    ),
  };
});
const SYNC = 0.75; // rad/s: Earth and the satellite turning together, sped up
shot("space-day", cut(9, 0, 0.12), (t, u) => {
  const spin = 0.35 - u * SYNC;
  // upright frame: the equator's +x is up the screen, so the satellite circles in the yz plane
  const satPos: [number, number, number] = [10, GEO_R * Math.cos(spin) + 9, -GEO_R * Math.sin(spin)];
  const cam = C(70, 4, 200, 0, 4, 0, 40);
  return {
    cam,
    content: <Space t={t} spin={spin} geo={1} sat up tether={smooth(0.2, 0.5, u)} labels={[{ text: "24 h", at: satPos, h: 9, k: smooth(0.5, 0.8, u) }]} />,
  };
});
shot("space-spoke", cut(9, "so", 0.1), (t, u) => {
  const spin = 0.2 + u * 0.9;
  const cam = C(0, 245, 36, 0, 0, 0, 36);
  return {
    cam,
    content: <Space t={t} spin={spin} geo={0.55} ribbon={{ len: GEO_R + 2, width: 1.6, glow: 1.2 }} station />,
  };
});
shot("space-nofall", cut(9, "and", 0.1), (t, u) => {
  const cam = orbit(V(GEO_R, 0, 0), 15 - u * 0.6, 0.9 + 0.12 * u, 0.18, 34);
  return {
    cam,
    content: <Space t={t} spin={0} ribbon={{ len: GEO_R + 30, width: 0.45, glow: 0.8 }} station />,
    lens: lens(cam, V(GEO_R, 0, 0), 0.05),
  };
});

// ======================================================================= 10-11: the cable, and steel
shot("plan-cable", cut(10, 0, 0.12), boardShot(1, 1, 1));
shot("steel-hang", cut(11, 0, 0.12), (t, u) => {
  const k = smoother(u / 1.8);
  const cam = mixCam(C(5, 18, 20, 0, 31, 0, 38), C(3.6, 25, 13, 0, 29, 0, 36), k);
  return {
    cam,
    content: (
      <>
        <Steel t={t} stretch={0.35 * smooth(0, 1.8, u)} snap={-1} />
        <Billboard pos={[2.6, 22, 0]}>
          <Label text="25 km" h={1.8} o={{ size: 130, color: "#ffffff", stroke: "#0b1b3a", strokeW: 20 }} opacity={smooth(0.9, 1.3, u)} />
        </Billboard>
      </>
    ),
  };
});
shot("steel-neck", cut(11, "after", 0.1), (t, u) => {
  const cam = shake(C(1.7, 30.3, 4.2 - 0.6 * u, 0, 30.1, 0, 34), t, 0.01 * u, 5);
  return {
    cam,
    content: <Steel t={t} stretch={lerp(0.4, 1, smooth(0, 1.4, u))} snap={-1} />,
    lens: lens(cam, V(0, 30, 0), 0.05),
    bloom: { strength: 0.55, radius: 0.4, threshold: 1.0 },
  };
});
const SNAP = 38.6;
shot("steel-snap", SNAP, (t, u) => {
  const cam = shake(C(9, 25, 27, 0, 22 - u * 3, 0, 38), t, 0.08 * Math.exp(-u * 3), 3);
  return {
    cam,
    content: <Steel t={t} stretch={1} snap={t - SNAP} />,
    grade: { flash: 0.5 * Math.exp(-u * 18) },
    bloom: { strength: 0.55, radius: 0.4, threshold: 1.0 },
  };
});

// ======================================================================= 12-13: the ribbon works
const Worker: React.FC<{ t: number; i: number; pos: [number, number, number]; yaw: number; walking?: boolean; face?: ChibiProps["face"]; arms?: ChibiProps["arms"] }> = ({ t, i, pos, yaw, walking, face, arms }) => {
  const w = walk(t * 1.6 + i * 0.37);
  return (
    <Person
      t={t}
      seed={i + 3}
      look={CAST.worker(i)}
      pos={pos}
      yaw={yaw}
      feet={walking ? w.feet : undefined}
      bob={walking ? w.bob : idle(t, i)}
      arms={arms ?? (walking ? { right: mixArm(arm("rest"), { hand: [-0.2, 0.06, 0.12] }, 0.5 + 0.5 * w.swing), left: mixArm(arm("rest", "left"), { hand: [0.2, 0.06, 0.12] }, 0.5 - 0.5 * w.swing) } : undefined)}
      face={face ?? { eyes: "open", mouth: "smile" }}
    />
  );
};
shot("factory-out", cut(12, 0, 0.12), (t, u) => {
  const k = smoother(u / 1.6);
  const cam = mixCam(C(5, 7, 20, 0, 3.4, -2, 38), C(1.4, 1.6, 11.2, 0.3, 2.7, 0, 38), k);
  return {
    cam,
    content: (
      <FactoryOutside t={t}>
        {[0, 1, 2].map((i) => (
          <Worker key={i} t={t} i={i} pos={[-1.5 + i * 0.9, 0, 4.4 - ((u * 0.9 + i * 0.5) % 3.2)]} yaw={Math.PI} walking />
        ))}
        <You t={t} pos={[0.9, 0, 4.6]} yaw={0.25} arms={{ right: arm("hip"), left: arm("hip", "left") }} face={{ eyes: "half", brows: "smug", mouth: "smirk" }} bob={idle(t)} />
      </FactoryOutside>
    ),
    lens: lens(cam, V(0.9, 1, 4.6), 0.03 * k),
  };
});
shot("factory-reactor", cut(12, "carbon", 0.1), (t, u) => {
  const cam = orbit(V(0, 2.1, -1.6), 5.2 - 0.4 * u, 0.55 - 0.2 * u, 0.12, 36);
  return {
    cam,
    content: (
      <FactoryHall t={t} grow={lerp(0.12, 1, smooth(0.05, 1.7, u))}>
        <Person t={t} seed={7} look={CAST.scientist} pos={[1.7, 0, -0.2]} yaw={-1.0} arms={{ right: arm("front"), left: arm("front", "left") }} face={{ eyes: "wide", mouth: "o", brows: "up" }} />
        <Worker t={t} i={1} pos={[-1.9, 0, 0.0]} yaw={1.0} face={{ eyes: "open", mouth: "o", brows: "up" }} />
      </FactoryHall>
    ),
    lens: lens(cam, V(0, 2.1, -1.6), 0.05),
    bloom: { strength: 0.4, radius: 0.4, threshold: 1.1 },
    grade: { exposure: 0.92 },
  };
});
shot("factory-balance", cut(12, 9, 0.08), (t, u) => {
  const cam = C(4.3, 2.6, 10.6 - 0.4 * u, 4.2, 2.75, 1.0, 36);
  return {
    cam,
    content: (
      <FactoryHall t={t} balance={balanceTilt((u - 0.1) / 0.9)} labels={u > 0.25 ? (t > at(12, "sixth") - 0.1 ? 2 : 1) : 0}>
        <You t={t} pos={[3.05, 0, 3.6]} yaw={0.15} arms={{ right: arm("hip"), left: arm("pointUp", "left") }} face={{ eyes: "half", brows: "smug", mouth: "grin" }} bob={idle(t)} />
      </FactoryHall>
    ),
    lens: lens(cam, V(3.8, 2.0, 1.6), 0.03),
  };
});
shot("factory-spool", cut(13, 0, 0.12), (t, u) => {
  const cam = C(-7.7 + 0.3 * u, 2.5, 4.9 - 0.2 * u, -3.1, 1.2, 2.2, 36);
  return {
    cam,
    content: (
      <FactoryHall t={t} spool={-u * 3.2}>
        <Worker t={t} i={3} pos={[-2.4, 0, 3.6]} yaw={1.2} arms={{ right: arm("front"), left: arm("front", "left") }} face={{ eyes: "happy", mouth: "smile" }} />
      </FactoryHall>
    ),
    lens: lens(cam, V(-3.0, 1.3, 2.6), 0.04),
  };
});
shot("factory-paper", cut(13, "thinner", 0.1), (t, u) => {
  const cam = C(0.03, 1.1, 4.85 - 0.12 * u, 0, 1.07, 3.4, 22);
  return {
    cam,
    content: (
      <FactoryHall t={t}>
        <mesh position={[0, 0.48, 3.4]} material={toon("#a0683f")} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.96, 0.8]} />
        </mesh>
        {/* a sheet of paper seen edge-on, and the ribbon laid on it */}
        <mesh position={[0, 0.96 + 0.06, 3.4]} material={toon("#fbfbf6")} castShadow>
          <boxGeometry args={[0.26, 0.12, 0.5]} />
        </mesh>
        <mesh position={[0, 0.96 + 0.12 + 0.008, 3.4]} material={toon("#16171d")} castShadow>
          <boxGeometry args={[0.22, 0.012, 0.46]} />
        </mesh>
        <Label text="PAPER" h={0.045} pos={[0, 1.02, 3.66]} o={{ size: 110, color: "#2a2f3c" }} fx={false} />
        <Label text={"RIBBON ▼"} h={0.05} pos={[0.0, 1.135, 3.66]} o={{ size: 110, color: "#2fd36a", stroke: "#0b2a17", strokeW: 16 }} fx={false} />
      </FactoryHall>
    ),
    lens: lens(cam, V(0, 1.07, 3.65), 0.03),
    blur: false,
  };
});

// ======================================================================= 14-15: where it plugs in
shot("plan-plug", cut(14, 0, 0.12), (t, u) => {
  const cam = C(1.75 - 0.1 * u, 1.12, 3.5 - 0.15 * u, 0.95, 1.02, 0.9, 34);
  return {
    cam,
    content: (
      <>
        <WarRoom t={t} sketch={1} hl={2} checked={2} />
        <You t={t} pos={[1.0, 0, 0.9]} yaw={0.32} holding="plug" arms={{ right: { hand: [-0.1, 0.17, 0.28], bend: [-0.12, -0.06, 0.02] }, left: arm("chin", "left") }} face={{ eyes: "open", brows: "raise", mouth: "tiny", look: [-0.5, -0.4] }} head={{ yaw: -0.2, pitch: 0.16 }} bob={idle(t)} />
      </>
    ),
    lens: lens(cam, V(1.0, 1.0, 0.9), 0.07),
  };
});
shot("plan-equator", cut(15, 0, 0.1), (t, u) => {
  const cam = orbit(V(0, 1.85, -1.5), 3.9 - 0.3 * u, -1.62 + 0.12 * u, -0.08, 40);
  return {
    cam,
    content: <WarRoom t={t} sketch={1} hl={2} checked={2} equator={smooth(0.2, 0.9, u)} globeSpin={2.0 + u * 0.6} />,
    lens: lens(cam, V(0, 1.75, -1.5), 0.04),
    bloom: { strength: 0.55, radius: 0.45, threshold: 1.0 },
  };
});

// ======================================================================= 16: the floating base
shot("ocean-aerial", cut(16, 0, 0.12), (t, u) => {
  const k = smoother(u / 2.0);
  const cam = mixCam(C(34, 70, 60, 0, 0, 0, 38), C(15, 13, 24, 0, 2.6, 0, 38), k);
  return { cam, content: <Ocean t={t} /> };
});
const OceanWorkers: React.FC<{ t: number }> = ({ t }) => (
  <>
    {[0, 1, 2].map((i) => {
      const a = -0.6 + i * 1.9 + t * 0.12;
      const r = 4.5 + i * 0.7;
      const p: [number, number, number] = [Math.cos(a) * r, DECK, Math.sin(a) * r];
      return <Worker key={i} t={t} i={i} pos={p} yaw={-a + Math.PI} walking />;
    })}
  </>
);
shot("ocean-orbit", cut(16, "ocean.", 0.1), (t, u) => {
  const cam = orbit(V(0, 2.0, 0), 22, 0.55 + 0.2 * u, 0.3, 38);
  return {
    cam,
    content: (
      <Ocean t={t}>
        <OceanWorkers t={t} />
      </Ocean>
    ),
  };
});
const Lounger: React.FC<{ pos: [number, number, number]; yaw: number }> = ({ pos, yaw }) => (
  <group position={pos} rotation={[0, yaw, 0]}>
    <mesh position={[0, 0.26, 0.1]} rotation={[-0.08, 0, 0]} material={toon("#f5a524")} castShadow receiveShadow>
      <boxGeometry args={[0.55, 0.06, 0.95]} />
    </mesh>
    <mesh position={[0, 0.55, -0.45]} rotation={[0.85, 0, 0]} material={toon("#f5a524")} castShadow>
      <boxGeometry args={[0.55, 0.06, 0.7]} />
    </mesh>
    {[
      [-0.24, 0.45],
      [0.24, 0.45],
      [-0.24, -0.35],
      [0.24, -0.35],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x, 0.12, z]} material={toon("#ffffff")}>
        <boxGeometry args={[0.04, 0.24, 0.04]} />
      </mesh>
    ))}
  </group>
);
shot("ocean-nostorm", cut(16, 12, 0.08), (t, u) => {
  const cam = C(2.75 - 0.1 * u, 1.45, 7.3 - 0.25 * u, 2.0, 0.95, 4.4, 34);
  return {
    cam,
    content: (
      <Ocean t={t}>
        <Lounger pos={[2.0, DECK, 4.4]} yaw={0} />
        <You t={t} pos={[2.0, DECK + 0.02, 4.32]} yaw={0} sit lean={-0.42} feet={{ right: [-0.08, 0.2, 0.55], left: [0.08, 0.2, 0.55] }} holding="mug" arms={{ right: arm("hold"), left: arm("rest", "left") }} face={{ eyes: "half", mouth: "smirk", shades: true }} head={{ pitch: 0.1 }} />
      </Ocean>
    ),
    lens: lens(cam, V(2.0, 0.9, 4.4), 0.07),
  };
});
shot("ocean-noplanes", cut(16, 14, 0.08), (t, u) => {
  const cam = C(1.4, 1.0, 7.4, 14, 48, -100, 40);
  return {
    cam,
    content: (
      <Ocean t={t} planeTurn={smooth(0.0, 0.85, u)}>
        <You t={t} pos={[2.4, DECK, 5.2]} yaw={Math.PI - 0.2} head={{ pitch: -0.4 }} face={{ eyes: "half", mouth: "smirk", shades: true }} holding="mug" arms={{ right: arm("hold"), left: arm("hip", "left") }} />
      </Ocean>
    ),
  };
});
shot("ocean-noneighbors", cut(16, 16, 0.08), (t, u) => {
  const h = lerp(26, 140, Math.pow(smooth(0, 1.1, u), 1.4));
  const cam = C(0, h, h * 0.18, 0, 0, 0, 40);
  return { cam, content: <Ocean t={t} gull={u / 1.1} /> };
});

// ======================================================================= 17-18: the counterweight
shot("plan-weight", cut(17, 0, 0.12), boardShot(3, 3, -1));
shot("space-slack", cut(17, "to", 0.1), (t, u) => {
  const cam = C(30, 72 + 3 * u, 210, 0, 74, 0, 44);
  return {
    cam,
    content: <Space t={t} up ribbon={{ len: TOP_R - 25, slack: 1, width: 1.6, glow: 1.0 }} spin={0} />,
  };
});
shot("space-catch", cut(18, 0, 0.1), (t, u) => {
  const cam = C(5.5 - 0.6 * u, 45, 74.5 - 0.8 * u, 0, 40.5, 60, 38);
  return {
    cam,
    content: (
      <Space t={t} up spin={0}>
        <Capture t={t} close={smooth(0.15, 1.2, u)} pos={[0, 40, 60]} />
      </Space>
    ),
    lens: lens(cam, V(0, 40, 60), 0.04),
  };
});
shot("space-park", cut(18, "and", 0.08), (t, u) => {
  const k = smoother(u / 2.4);
  const cam = mixCam(C(10, 160, 34, 0, TOP_R + 1, 0, 40), C(70, 92, 270, 0, 88, 0, 48), k);
  const taut = smooth(0.15, 0.55, u);
  return {
    cam,
    content: <Space t={t} up spin={0} ribbon={{ len: TOP_R, slack: 1 - taut, width: 1.6, glow: 1.0 }} weight={smooth(0, 0.2, u)} labels={[{ text: "100,000 km", at: [-20, 96, 0], h: 12, k: smooth(0.7, 1.1, u) }]} />,
  };
});

// ======================================================================= 19: the climber
shot("ocean-fuel", cut(19, 0, 0.12), (t, u) => {
  const cam = C(4.0 - 0.2 * u, 1.7, 9.4 - 0.3 * u, 0.7, 3.1, 0.8, 40);
  return {
    cam,
    content: (
      <Ocean t={t} climb={0} gauge={0}>
        <You t={t} pos={[1.45, DECK, 2.3]} yaw={0.2} arms={{ right: arm("shrug"), left: arm("shrug", "left") }} face={{ eyes: "half", brows: "smug", mouth: "smirk" }} bob={idle(t)} />
      </Ocean>
    ),
    lens: lens(cam, V(1.2, 2.4, 1.6), 0.03),
  };
});
shot("ocean-laser", cut(19, "It", 0.1), (t, u) => {
  const climb = u > 0.45 ? 3.2 * (u - 0.45) * (u - 0.45) + 0.8 * (u - 0.45) : 0;
  const cy = DECK + 4.8 + climb;
  const cam = C(7.5, 2.6 + climb * 0.55, 11, 0, cy - 0.6, 0, 40);
  return {
    cam,
    content: <Ocean t={t} climb={climb} laser={smooth(0.1, 0.3, u)} />,
    bloom: { strength: 0.6, radius: 0.5, threshold: 1.0 },
  };
});

// ======================================================================= 20-22: the wall, the junk, the dodge
shot("plan-alarm", cut(20, 0, 0.12), (t, u) => {
  const cam = shake(C(0.25, 1.05, 2.95 - 0.15 * u, 0, 0.98, 0.6, 34), t, 0.012, 4);
  const jump = Math.sin(clamp01(u / 0.3) * Math.PI) * 0.1;
  return {
    cam,
    content: (
      <>
        <WarRoom t={t} sketch={1} hl={4} checked={4} alarm={smooth(0, 0.15, u)} />
        <You t={t} pos={ROOM_YOU} bob={jump} squash={1 - jump} face={{ eyes: "wide", mouth: "bigo", brows: "up" }} sweat={smooth(0.2, 0.4, u)} arms={{ right: arm("cheeks"), left: arm("cheeks", "left") }} />
      </>
    ),
    lens: lens(cam, V(0, 0.98, 0.7), 0.09),
  };
});
shot("junk-close", cut(21, 0, 0.1), (t, u) => {
  const cam = C(5.5 - 0.4 * u, 13.6, 14.6 - 0.5 * u, 0, 9.4, 6.4, 40);
  return {
    cam,
    content: (
      <Space t={t} spin={1.2 + t * 0.03} base={false}>
        <JunkField t={t} at={[3.6, 12.3, 11.6]} n={46} spread={1.9} big />
      </Space>
    ),
    lens: lens(cam, V(3.6, 12.3, 11.6), 0.03),
  };
});
shot("junk-cloud", cut(21, "A", 0.08), (t, u) => {
  const cam = orbit(V(0, 0, 0), 46 - 4 * u, 0.4 + 0.12 * u, 0.32, 36);
  return { cam, content: <Space t={t} spin={1.2 + t * 0.03} base={false} junk={smooth(0.0, 0.9, u)} /> };
});
shot("junk-bullet", cut(21, "flying", 0.08), (t, u) => {
  const cam = shake(C(-4.5, 12.6, 16.5, 0, 10.6, 6, 38), t, 0.02, 3);
  const chunks = [0.15, 0.9, 1.55].map((t0, i) => {
    const k = (u - t0) / 0.45;
    if (k < 0 || k > 1) return null;
    const x = lerp(-16, 16, k);
    return (
      <group key={i} position={[x, 12.4 + i * 0.7, 13.6 - i * 1.0]} scale={[3.6, 1.3, 1.3]}>
        <mesh material={toon("#dfe4ec", { emissive: "#8a94aa", ei: 0.4 })} scale={0.7}>
          <boxGeometry args={[1, 0.6, 0.8]} />
        </mesh>
        <Fx>
          <mesh position={[-1.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={flat("#bfe9ff", 1.6, { additive: true, opacity: 0.5 })}>
            <coneGeometry args={[0.25, 2.4, 10, 1, true]} />
          </mesh>
        </Fx>
      </group>
    );
  });
  return {
    cam,
    content: (
      <Space t={t} spin={1.2 + t * 0.03} base={false}>
        <JunkField t={t} at={[1.5, 12.2, 9]} n={24} spread={3.2} seed={2} />
        {chunks}
      </Space>
    ),
  };
});
shot("ocean-wheel", cut(22, 0, 0.1), (t, u) => {
  const sx = u * 0.8;
  const cam = C(2.25 + sx - 0.1 * u, 1.38, 1.55, 1.8 + sx, 1.25, -1.05, 38);
  return {
    cam,
    content: (
      <Ocean t={t} sail={[sx, 0]} wake={0.6}>
        <group position={[1.8, DECK + 0.5, -0.87]} scale={0.62}>
          <Wheel turn={u * 7} pos={[0, 0, 0]} />
        </group>
        <You t={t} pos={[1.8, DECK, -1.2]} yaw={0} arms={{ right: { hand: [-0.2, 0.12, 0.3], bend: [-0.08, -0.05, 0] }, left: { hand: [0.2, 0.16, 0.3], bend: [0.08, -0.05, 0] } }} face={{ eyes: "half", brows: "down", mouth: "grin" }} lean={0.08} bob={idle(t)} />
      </Ocean>
    ),
    lens: lens(cam, V(1.8 + sx, 1.3, -1.05), 0.06),
  };
});
shot("ocean-sail", cut(22, "out", -0.25), (t, u) => {
  const sx = -8 + u * 7;
  const cam = C(sx - 30, 26, 30, sx + 2, 0, 0, 38);
  return { cam, content: <Ocean t={t} sail={[sx, 0]} wake={1} /> };
});
shot("space-dodge", cut(22, "and", 0.08), (t, u) => {
  const cam = C(5, 24, 50, 0, 22, 0, 40);
  const dodge = smooth(0.0, 0.7, u) * 4.5;
  const k = (u - 0.65) / 0.55;
  return {
    cam,
    content: (
      <Space t={t} up spin={0} ribbon={{ len: TOP_R, dodge, width: 1.0, glow: 1.0 }}>
        {k > 0 && k < 1 ? (
          <group position={[0.4, 22.5, lerp(-70, 60, k)]} scale={[1, 1, 3.4]}>
            <mesh material={toon("#d5dbe6", { emissive: "#8a94aa", ei: 0.5 })} scale={0.9}>
              <boxGeometry args={[1, 0.7, 0.9]} />
            </mesh>
          </group>
        ) : null}
      </Space>
    ),
  };
});

// ======================================================================= 23: the rocket guys laugh
const RIVAL_A: [number, number, number] = [-0.4, 0, 4.2];
const RIVAL_B: [number, number, number] = [0.42, 0, 4.4];
shot("rivals-laugh", cut(23, 0, 0.12), (t, u) => {
  const cam = C(0.15, 1.1, 8.2 - 0.3 * u, 0, 1.25, 4.2, 36);
  return {
    cam,
    content: (
      <>
        <LaunchPad t={t} />
        <Person t={t} look={CAST.rivalA} pos={RIVAL_A} yaw={0.15} bob={laughBob(t)} arms={{ right: arm("point"), left: arm("belly", "left") }} face={{ eyes: "happy", mouth: "laugh", brows: "up" }} head={{ pitch: -0.12 }} />
        <Person t={t} look={CAST.rivalB} pos={RIVAL_B} yaw={-0.15} bob={laughBob(t, 1.3)} arms={{ right: arm("belly"), left: arm("belly", "left") }} lean={0.15} face={{ eyes: "closed", mouth: "laugh", brows: "up" }} />
      </>
    ),
    lens: lens(cam, V(0, 1, 4.3), 0.06),
  };
});
shot("rivals-crazy", cut(23, "you've", 0.1), (t, u) => {
  const cam = C(-0.28, 1.0, 5.75 - 0.12 * u, -0.38, 0.99, 4.2, 32);
  const tw = t * 9;
  const twirl: ArmPose = { hand: [-0.33 + 0.03 * Math.cos(tw), 0.66 + 0.03 * Math.sin(tw), 0.06], bend: [-0.1, -0.06, 0.02] };
  return {
    cam,
    content: (
      <>
        <LaunchPad t={t} />
        <Person t={t} look={CAST.rivalA} pos={RIVAL_A} yaw={0.15} bob={laughBob(t)} arms={{ right: twirl, left: arm("belly", "left") }} face={{ eyes: "happy", mouth: "laugh", brows: "up" }} head={{ roll: 0.12 }} />
        <Person t={t} look={CAST.rivalB} pos={RIVAL_B} yaw={-0.15} bob={laughBob(t, 1.3)} arms={{ right: arm("belly"), left: arm("belly", "left") }} lean={0.2} face={{ eyes: "closed", mouth: "laugh", brows: "up" }} />
      </>
    ),
    lens: lens(cam, V(-0.6, 1, 4.2), 0.09),
  };
});

// ======================================================================= 24: ten years later
shot("ocean-10years", cut(24, 0, 0.12), (t, u) => {
  const cam = C(3.6, 4.0, 12.5, 2.0, 3.8, -1.2, 40);
  return {
    cam,
    content: (
      <Ocean t={t} cranes sunArc={0.3 + u * 2.6}>
        <OceanWorkers t={t * 6} />
        {/* the banner between the cranes */}
        <group position={[2.6, DECK + 4.0, -1.3]}>
          <mesh material={toon("#e5484d", { side: 2 as THREE.Side })}>
            <planeGeometry args={[2.8, 1.1]} />
          </mesh>
          <Label text={"10 YEARS\nLATER"} h={0.95} pos={[0, 0, 0.02]} o={{ size: 120, color: "#ffffff" }} fx={false} />
        </group>
      </Ocean>
    ),
    grade: { exposure: 1.0 - 0.15 * Math.sin(u * 4) ** 2 },
  };
});
const DOOR = { x: -3.6 + 1.2 * Math.sin(0.35), z: 2.6 + 1.2 * Math.cos(0.35) };
const FRONT = { x: Math.sin(0.35), z: Math.cos(0.35) };
const SIDE = { x: Math.cos(0.35), z: -Math.sin(0.35) };
const crowdAt = (i: number): [number, number, number] => {
  const row = Math.floor(i / 5);
  const col = (i % 5) - 2;
  const d = 2.3 + row * 0.75 + (hash(i * 3.1) - 0.5) * 0.2;
  const s = col * 0.62 + (row % 2) * 0.3;
  return [DOOR.x + FRONT.x * d + SIDE.x * s, DECK, DOOR.z + FRONT.z * d + SIDE.z * s];
};
const Crowd: React.FC<{ t: number; open: number }> = ({ t, open }) => (
  <>
    {Array.from({ length: 14 }, (_, i) => {
      const p = crowdAt(i);
      const cheer = open > 0.5;
      return (
        <Person
          key={i}
          t={t}
          seed={i}
          look={CAST.crowd(i)}
          pos={p}
          yaw={yawTo([p[0], p[2]], [DOOR.x, DOOR.z]) + (hash(i) - 0.5) * 0.4}
          bob={cheer ? laughBob(t, i) * 1.4 : idle(t, i)}
          arms={cheer ? { right: arm("cheer"), left: arm("cheer", "left") } : undefined}
          face={cheer ? { eyes: "happy", mouth: "open", brows: "up" } : { eyes: "open", mouth: "o" }}
        />
      );
    })}
  </>
);
shot("ocean-cheer", cut(24, "open.", -0.27), (t) => {
  const cam = C(DOOR.x + FRONT.x * 0.35 + SIDE.x * 0.3, 1.75, DOOR.z + FRONT.z * 0.35 + SIDE.z * 0.3, DOOR.x + FRONT.x * 3.6, 1.0, DOOR.z + FRONT.z * 3.6, 46);
  return {
    cam,
    content: (
      <Ocean t={t} doors={1}>
        <Crowd t={t} open={1} />
        <Confetti t={t} t0={at(24, "open.") - 0.1} center={[DOOR.x + FRONT.x * 2.4, DECK + 2.6, DOOR.z + FRONT.z * 2.4]} />
        <pointLight position={[DOOR.x + FRONT.x * 0.3, 1.6, DOOR.z + FRONT.z * 0.3]} intensity={3} distance={6} color="#fff1c4" />
      </Ocean>
    ),
    lens: lens(cam, V(DOOR.x + FRONT.x * 3.0, 1.0, DOOR.z + FRONT.z * 3.0), 0.03),
  };
});
shot("ocean-doors", cut(24, "the", 0.08), (t, u) => {
  const cam = C(DOOR.x + FRONT.x * 6.4 + SIDE.x * 0.9, 2.1, DOOR.z + FRONT.z * 6.4 + SIDE.z * 0.9, DOOR.x + FRONT.x * 0.3, 1.35, DOOR.z + FRONT.z * 0.3, 40);
  const open = smooth(0.15, 0.5, u);
  return {
    cam,
    content: (
      <Ocean t={t} doors={open}>
        <Crowd t={t} open={open} />
        <Confetti t={t} t0={at(24, "open.") - 0.1} center={[DOOR.x + FRONT.x * 2.4, DECK + 2.6, DOOR.z + FRONT.z * 2.4]} />
      </Ocean>
    ),
    lens: lens(cam, V(DOOR.x + FRONT.x * 1.5, 1.2, DOOR.z + FRONT.z * 1.5), 0.05),
  };
});

// ======================================================================= 25: the ride
shot("ride-up", cut(25, 0, 0.1), (t, u) => {
  const climb = 34 + u * 9;
  const cy = DECK + 4.8 + climb;
  const cam = C(5.8, cy + 2.2, 7.5, 0, cy - 0.5, 0, 38);
  return {
    cam,
    content: (
      <Ocean t={t} climb={climb}>
        {Array.from({ length: 12 }, (_, i) => {
          const x = (hash(i * 2.2) - 0.5) * 34;
          const z = (hash(i * 4.1) - 0.5) * 34;
          return Math.hypot(x, z) < 5 ? null : <Cloud key={i} pos={[x, 30 + hash(i * 1.7) * 26, z]} s={2.6 + hash(i) * 2} seed={i + 90} />;
        })}
        <Billboard pos={[0.5, cy + 1.6, 1.4]}>
          <Label text="7 DAYS" h={1.0} o={{ size: 130, color: "#ffffff", stroke: "#0b1b3a", strokeW: 20 }} opacity={smooth(0.3, 0.6, u)} />
        </Billboard>
      </Ocean>
    ),
  };
});
const SEAT: [number, number, number] = [0.15, 0.09, -0.1];
const Sitting: React.FC<{ t: number; face: ChibiProps["face"]; sip?: number; head?: ChibiProps["head"]; sweat?: number; tilt?: number }> = ({ t, face, sip = 0, head, sweat, tilt }) => (
  <You
    t={t}
    pos={SEAT}
    yaw={Math.PI}
    sit
    lean={-0.12}
    tilt={tilt}
    feet={{ right: [-0.09, -0.09, 0.42], left: [0.09, -0.09, 0.42] }}
    holding="mug"
    arms={{ right: mixArm(arm("hold"), { hand: [-0.03, 0.43, 0.24], bend: [-0.12, -0.1, 0.02] }, sip), left: { hand: [0.24, 0.06, 0.08], bend: [0.06, 0, 0] } }}
    face={face}
    head={head}
    sweat={sweat}
  />
);
shot("cabin-nofire", cut(25, "No", 0.08), (t, u) => {
  const cam = C(1.25 - 0.1 * u, 1.42, 1.2 - 0.1 * u, -0.3, 1.18, -1.6, 40);
  return {
    cam,
    content: (
      <Cabin t={t}>
        <Sitting t={t} face={{ eyes: "half", mouth: "smile" }} />
      </Cabin>
    ),
    lens: lens(cam, V(0.15, 0.9, -0.1), 0.05),
  };
});
shot("cabin-sip", cut(25, 9, 0.08), (t, u) => {
  const cam = C(0.42, 1.0, -1.25, 0.15, 0.95, -0.1, 32);
  const sip = smooth(0.15, 0.45, u) * (1 - smooth(0.8, 1.0, u));
  return {
    cam,
    content: (
      <Cabin t={t}>
        <Sitting t={t} sip={sip} face={{ eyes: sip > 0.5 ? "happy" : "half", mouth: sip > 0.5 ? "tiny" : "smile" }} head={{ pitch: -0.1 * sip }} />
      </Cabin>
    ),
    lens: lens(cam, V(0.15, 0.95, -0.15), 0.1),
  };
});
shot("cabin-view", cut(25, "Just", 0.1), (t, u) => {
  const cam = C(0.75 - 0.12 * u, 1.45, 1.35 - 0.15 * u, -0.2, 1.25, -3, 42);
  return {
    cam,
    content: (
      <Cabin t={t}>
        <Sitting t={t} face={{ eyes: "happy", mouth: "smile" }} head={{ yaw: 0.2 }} />
      </Cabin>
    ),
    lens: lens(cam, V(0.15, 1.0, -0.1), 0.04),
  };
});

// ======================================================================= 26: the rocket guys, in line
const queueAt = (i: number): { p: [number, number, number]; yaw: number } => {
  if (i < 4) {
    const d = 0.95 + i * 0.6;
    return { p: [DOOR.x + FRONT.x * d, DECK, DOOR.z + FRONT.z * d], yaw: Math.atan2(-FRONT.x, -FRONT.z) };
  }
  const d0 = 0.95 + 3 * 0.6;
  const s = (i - 3) * 0.6;
  return { p: [DOOR.x + FRONT.x * d0 + SIDE.x * s, DECK, DOOR.z + FRONT.z * d0 + SIDE.z * s], yaw: Math.atan2(-SIDE.x, -SIDE.z) };
};
const Queue: React.FC<{ t: number; turned?: boolean }> = ({ t, turned = false }) => (
  <>
    {Array.from({ length: 10 }, (_, i) => {
      const { p, yaw } = queueAt(i);
      if (i >= 8) {
        // the rocket guys, last in line; caught on camera, they turn round, sheepish
        const look = i === 8 ? CAST.rivalA : CAST.rivalB;
        const back = Math.atan2(SIDE.x, SIDE.z) + (i === 8 ? -0.35 : 0.3);
        return (
          <Person
            key={i}
            t={t}
            seed={i}
            look={look}
            pos={p}
            yaw={turned ? back : yaw + (i === 8 ? 0.5 : -0.4)}
            holding="ticket"
            arms={{ right: arm("hold"), left: arm("rest", "left") }}
            face={turned ? { eyes: "half", mouth: "wavy", brows: "worry", look: [i === 8 ? 0.4 : -0.4, 0] } : { eyes: "half", mouth: "wavy", brows: "worry", look: [i === 8 ? -0.6 : 0.6, 0] }}
            sweat={1}
            bob={idle(t, i)}
          />
        );
      }
      return <Person key={i} t={t} seed={i} look={CAST.crowd(i + 3)} pos={p} yaw={yaw} holding="ticket" arms={{ right: arm("hold"), left: arm("rest", "left") }} face={{ eyes: "open", mouth: "smile" }} bob={idle(t, i)} />;
    })}
  </>
);
shot("lobby-line", cut(26, 0, 0.1), (t, u) => {
  const a = queueAt(1).p;
  const b = queueAt(8).p;
  const k = smoother(u / 1.4);
  const foc = V(lerp(a[0], b[0], k), 1.0, lerp(a[2], b[2], k));
  const cam = C(foc.x + 1.4, 1.55, foc.z - 2.9, foc.x, 1.0, foc.z, 38);
  return {
    cam,
    content: (
      <Ocean t={t} doors={1}>
        <Queue t={t} />
      </Ocean>
    ),
    lens: lens(cam, foc, 0.05),
  };
});
shot("lobby-rivals", cut(26, "They're", 0.1), (t, u) => {
  const a = queueAt(8).p;
  const b = queueAt(9).p;
  const mid = V((a[0] + b[0]) / 2, 1.4, (a[2] + b[2]) / 2);
  const cam = C(mid.x + SIDE.x * 2.4 - FRONT.x * 1.5, 1.55, mid.z + SIDE.z * 2.4 - FRONT.z * 1.5 - 0.1 * u, mid.x, 1.38, mid.z, 36);
  return {
    cam,
    content: (
      <Ocean t={t} doors={1}>
        <Queue t={t} turned />
      </Ocean>
    ),
    lens: lens(cam, mid, 0.09),
  };
});

// ======================================================================= 27: you still hate rockets
shot("cabin-rocket", cut(27, 0, 0.12), (t, u) => {
  const cam = C(0.7, 1.55, 1.45, -0.1, 1.3, -3, 44);
  const jump = smooth(0.3, 0.4, u) * Math.exp(-Math.max(0, u - 0.4) * 5);
  return {
    cam,
    content: (
      <Cabin t={t} rocket={(u - 0.05) / 0.5}>
        <Sitting t={t} face={{ eyes: "half", mouth: "smile" }} tilt={jump * 0.15} />
      </Cabin>
    ),
    bloom: { strength: 0.55, radius: 0.45, threshold: 1.0 },
  };
});
shot("cabin-flinch", cut(27, "rockets.", 0.1), (t, u) => {
  const cam = shake(C(0.42, 1.0, -1.25, 0.15, 0.95, -0.1, 32), t, 0.01 * (1 - smooth(0.2, 0.6, u)), 4);
  const fright = 1 - smooth(0.55, 0.62, u);
  return {
    cam,
    content: (
      <Cabin t={t}>
        <Sitting t={t} face={fright > 0.5 ? { eyes: "spiral", mouth: "wavy", brows: "worry" } : { eyes: "half", mouth: "frown", brows: "down" }} sweat={fright} tilt={fright * Math.sin(t * 45) * 0.05} />
      </Cabin>
    ),
    lens: lens(cam, V(0.15, 0.95, -0.15), 0.1),
    blur: false,
  };
});

// ======================================================================= 28-29: the only door to space; going up?
const TOP_YOU: [number, number, number] = [0.6, 0, 1.4];
shot("top-reveal", cut(28, 0, 0.12), (t, u) => {
  const k = smoother(u / 2.6);
  const cam = mixCam(C(0.95, 1.05, 3.2, 0.6, 0.98, 1.4, 34), C(9, 8, 19, 0, -6, -6, 40), k);
  return {
    cam,
    content: (
      <TopDeck t={t}>
        <You t={t} pos={TOP_YOU} yaw={0.1} arms={{ right: arm("cross"), left: arm("cross", "left") }} face={{ eyes: "half", brows: "smug", mouth: "smirk" }} bob={idle(t)} />
      </TopDeck>
    ),
    lens: lens(cam, V(0.6, 1, 1.4), 0.05 * (1 - k)),
  };
});
shot("top-wink", cut(29, 0, 0.15), (t, u) => {
  const cam = C(0.78 - 0.04 * u, 1.0, 3.05 - 0.12 * u, 0.6, 0.98, 1.4, 32);
  const wink = u > 0.32;
  return {
    cam,
    content: (
      <TopDeck t={t} ding={smooth(0.2, 0.3, u)}>
        <You t={t} pos={TOP_YOU} yaw={0.1} arms={{ right: arm("cross"), left: arm("cross", "left") }} face={wink ? { eyes: "wink", brows: "smug", mouth: "smile" } : { eyes: "half", brows: "smug", mouth: "smirk" }} head={{ roll: wink ? 0.08 : 0, pitch: -0.03 }} bob={idle(t)} />
      </TopDeck>
    ),
    lens: lens(cam, V(0.6, 0.98, 1.6), 0.1),
    grade: { fade: 1 - smooth(DURATION - 0.55, DURATION - 0.05, t) },
  };
});

export const SHOTS = S.sort((a, b) => a.t0 - b.t0);
export const shotAt = (t: number): { shot: Shot; u: number } => {
  let s = SHOTS[0];
  for (const x of SHOTS) if (x.t0 <= t) s = x;
  return { shot: s, u: Math.max(0, t - s.t0) };
};
