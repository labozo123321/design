import React from "react";
import * as THREE from "three";
import type { PState, Spec } from "../pov/crowd";
import { Human, lookFor, type Direction, type Look } from "../pov/Human";
import { PEOPLE, groundY, headingAt, pathAt, smooth, type Who } from "./world";

/**
 * The people on the beach (the same articulated, faced people as the other POV pieces), in beachwear and
 * mostly barefoot. They paddle and stroll, stop and stare as the sea goes out, point, and then run for it,
 * straight past you. The lifeguard waves everyone in; one woman sleeps through all of it.
 */

const bare = (skin: string) => ({ up: skin, sole: new THREE.Color(skin).multiplyScalar(0.8).getStyle() });

const OUTFIT: Record<string, Partial<Look>> = {
  kid: {
    female: false,
    skin: "#C08A60",
    hair: "#2E2018",
    hairStyle: "short",
    top: "#C08A60",
    sleeves: "short",
    bottom: "#F77F00",
    legs: "shorts",
    glasses: false,
    beard: false,
  },
  her: {
    female: true,
    skin: "#EBC09C",
    hair: "#6B4A2F",
    hairStyle: "long",
    top: "#E86A92",
    sleeves: "short",
    bottom: "#E86A92",
    legs: "dress",
    glasses: false,
  },
  him: {
    female: false,
    skin: "#D9A37A",
    hair: "#1B1410",
    hairStyle: "short",
    beard: true,
    top: "#D9A37A",
    sleeves: "short",
    bottom: "#2F7FD1",
    legs: "shorts",
    glasses: false,
  },
  filmer: {
    female: false,
    skin: "#F3D2B5",
    hair: "#A47B4F",
    hairStyle: "cap",
    capColor: "#C0392B",
    beard: false,
    top: "#F4F1EA",
    sleeves: "short",
    bottom: "#C9A66B",
    legs: "shorts",
    glasses: true,
  },
  pointer: {
    female: false,
    skin: "#9A6844",
    hair: "#1B1410",
    hairStyle: "curly",
    beard: false,
    top: "#E98A3B",
    sleeves: "short",
    bottom: "#2E3A55",
    legs: "shorts",
    glasses: false,
  },
  lifeguard: {
    female: false,
    skin: "#C08A60",
    hair: "#4A3222",
    hairStyle: "short",
    beard: false,
    top: "#D62828",
    sleeves: "short",
    bottom: "#D62828",
    legs: "shorts",
    glasses: true,
  },
  sleeper: {
    female: true,
    skin: "#F3D2B5",
    hair: "#D7B576",
    hairStyle: "long",
    top: "#2EC4B6",
    sleeves: "short",
    bottom: "#2EC4B6",
    legs: "shorts",
    glasses: true,
  },
  far1: { legs: "shorts", sleeves: "short", top: "#3E6FB0" },
  far2: { female: true, legs: "dress", sleeves: "short", top: "#F2C14E", hairStyle: "pony" },
  far3: { legs: "shorts", sleeves: "short", top: "#D9A37A", skin: "#D9A37A", beard: false },
  far4: { legs: "shorts", sleeves: "short", top: "#4E9A6A", glasses: false },
};

/** Sleeper's towel orientation (see Props): she lies along it, head toward the far end. */
export const SLEEPER_ROT = Math.PI;

const specOf = (w: Who, i: number): Spec => ({
  i: 300 + i * 7,
  role: "walk",
  kid: !!w.kid,
  height: w.h,
  speed: 1.3,
  jumpEvery: 0,
  v0: 0,
  route: [[w.path[0].x, w.path[0].z]],
  start: [w.path[0].x, w.path[0].z],
  face0: w.face,
  liftAt: 1e9,
  seed: w.seed,
});

const SPECS = PEOPLE.map(specOf);
const LOOKS: Look[] = PEOPLE.map((w, i) => {
  const base = lookFor(SPECS[i]);
  const o = OUTFIT[w.name] ?? {};
  const look: Look = { ...base, ...o, backpack: false };
  look.shoe = bare(look.skin);
  if (w.name === "filmer") look.shoe = { up: "#2F2F3A", sole: "#1C1C1F" };
  return look;
});

const state = (
  x: number,
  y: number,
  z: number,
  heading: number,
  phase: number,
  speed: number,
  tx = 0,
): PState => ({
  x,
  y,
  z,
  vx: 0,
  vy: 0,
  vz: 0,
  heading,
  phase,
  wp: 0,
  air: false,
  free: false,
  freeAt: 1e9,
  tx,
  ty: 0,
  tz: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  landAt: -10,
  impact: 0,
  nextJump: 1e9,
  jumpAt: -10,
  jumpKind: 0,
  speed,
});

export const People: React.FC<{ u: number; cam: THREE.Vector3 }> = ({ u, cam }) => (
  <group>
    {PEOPLE.map((w, i) => {
      const sp = SPECS[i];
      const look = LOOKS[i];
      const k = w.h / 1.78;
      if (w.act === "lie") {
        const p = w.path[0];
        const st = state(0, groundY(p.x, p.z) + 0.13 - 0.95 * k, 0, 0, 0, 0, -Math.PI / 2);
        return (
          <group key={w.name} position={[p.x, 0, p.z]} rotation={[0, SLEEPER_ROT, 0]}>
            <Human sp={sp} look={look} st={st} t={u} cam={cam} detail dir={{ sleep: true }} />
          </group>
        );
      }
      const p = pathAt(w.path, u);
      const speed = Math.hypot(p.vx, p.vz);
      const heading = headingAt(w, u);
      // strides: ~1.5 m a cycle walking, longer flat out (shorter legs, shorter strides)
      const stride = (w.kid ? 0.85 : 1) * (1.45 + 1.1 * smooth(1.6, 4.5, speed));
      const phase = (p.dist / stride) * Math.PI * 2;
      const y = groundY(p.x, p.z) + (w.y ?? 0);
      const shock = w.shock !== undefined ? smooth(w.shock, w.shock + 0.6, u) : 0;
      const run = smooth(1.6, 3.4, speed);
      const dir: Direction = {
        act: w.act === "film" ? "film" : undefined,
        react: shock * (w.name === "filmer" ? 0.4 : 1),
        stareW: w.act === "film" ? 0 : shock * (1 - smooth(0.15, 1.2, speed)),
        run,
        point: w.point
          ? smooth(w.point[0], w.point[0] + 0.5, u) * (1 - smooth(w.point[1], w.point[1] + 0.4, u))
          : 0,
        wave2: w.act === "wave2" ? shock : 0,
      };
      const st = state(p.x, y, p.z, heading, phase, speed);
      const dist = Math.hypot(p.x - cam.x, y + 1.5 - cam.y, p.z - cam.z);
      return <Human key={w.name} sp={sp} look={look} st={st} t={u} cam={cam} detail={dist < 30} dir={dir} />;
    })}
  </group>
);
