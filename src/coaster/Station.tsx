import React, { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Person3D, type Stance } from "./Person3D";
import { ADULT_F, ADULT_M } from "./face/sculpt";
import type { Person } from "./face/Head";
import type { Clothes } from "./riders";
import { ROW, SEATS, frameAt, rowS } from "./track";
import { TRACK_COL } from "./Track3D";
import { BEAT, FPS, smooth } from "./world";

/**
 * The station: a steel canopy over the track with LED strips under it and THE DROP on its fascia, the
 * loading platform with an air gate for every seat (the next riders waiting behind them), the exit
 * platform, the floor under the train that drops away before dispatch, and the operator at her console
 * giving the thumbs up.
 *
 * The track runs east along z = 0 through it; the platform's top is at y = 1.0.
 */

const X0 = -50;
const X1 = -1;
const ROOF_Y = 6.4;
const PLAT_Y = 1.0;
const EDGE = 2.25; // the platforms' edges either side of the track

const mats: Record<string, THREE.Material> = {};
const std = (k: string, p: THREE.MeshStandardMaterialParameters) => (mats[k] ??= new THREE.MeshStandardMaterial(p));

let signTex: THREE.CanvasTexture | null = null;
const sign = () => {
  if (signTex) return signTex;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16171B";
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = "#FF6A2B";
  g.font = "900 168px 'Arial Black', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("THE DROP", 512, 136);
  g.fillStyle = "#FFFFFF";
  g.font = "700 28px Arial, sans-serif";
  g.fillText("DIVE COASTER  ·  57 M  ·  115 KM/H", 512, 228);
  signTex = new THREE.CanvasTexture(c);
  signTex.colorSpace = THREE.SRGBColorSpace;
  signTex.anisotropy = 8;
  return signTex;
};

const Building: React.FC = () => {
  const g = useMemo(() => {
    const steel: THREE.BufferGeometry[] = [];
    const conc: THREE.BufferGeometry[] = [];
    const deck: THREE.BufferGeometry[] = [];
    const box = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = new THREE.BoxGeometry(w, h, d);
      b.translate(x, y, z);
      arr.push(b);
    };
    const L = X1 - X0;
    const cx = (X0 + X1) / 2;
    // platforms: loading (north), exit (south); their faces down to the track bed
    box(deck, L, 0.12, 6.0, cx, PLAT_Y - 0.06, -EDGE - 3.0);
    box(conc, L, PLAT_Y - 0.12, 6.0, cx, (PLAT_Y - 0.12) / 2, -EDGE - 3.0);
    box(deck, L, 0.12, 3.6, cx, PLAT_Y - 0.06, EDGE + 1.8);
    box(conc, L, PLAT_Y - 0.12, 3.6, cx, (PLAT_Y - 0.12) / 2, EDGE + 1.8);
    // the track bed: a shallow pit between them
    box(conc, L, 0.1, EDGE * 2, cx, -0.62, 0);
    // columns and the canopy's beams and roof
    for (let x = X0 + 1; x <= X1; x += 8) {
      for (const z of [-11.2, 6.6]) box(steel, 0.32, ROOF_Y, 0.32, x, ROOF_Y / 2, z);
      box(steel, 0.3, 0.55, 18.6, x, ROOF_Y - 0.3, -2.3);
    }
    box(conc, L + 2, 0.32, 19.2, cx, ROOF_Y + 0.12, -2.3);
    // the fascia round the roof (the sign goes on the east face)
    box(steel, L + 2.2, 1.1, 0.25, cx, ROOF_Y + 0.3, -12.0);
    box(steel, L + 2.2, 1.1, 0.25, cx, ROOF_Y + 0.3, 7.4);
    box(steel, 0.25, 1.1, 19.6, X0 - 1.1, ROOF_Y + 0.3, -2.3);
    // railings along the platforms' outer edges
    for (let x = X0 + 0.5; x <= X1; x += 1.6) {
      box(steel, 0.05, 1.1, 0.05, x, PLAT_Y + 0.55, -EDGE - 5.9);
      box(steel, 0.05, 1.1, 0.05, x, PLAT_Y + 0.55, EDGE + 3.5);
    }
    box(steel, L, 0.06, 0.06, cx, PLAT_Y + 1.1, -EDGE - 5.9);
    box(steel, L, 0.06, 0.06, cx, PLAT_Y + 1.1, EDGE + 3.5);
    return {
      steel: mergeGeometries(steel)!,
      conc: mergeGeometries(conc)!,
      deck: mergeGeometries(deck)!,
    };
  }, []);
  const leds = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let z = -10; z <= 6; z += 2.6) {
      const b = new THREE.BoxGeometry(X1 - X0 - 2, 0.04, 0.12);
      b.translate((X0 + X1) / 2, ROOF_Y - 0.06, z);
      parts.push(b);
    }
    return mergeGeometries(parts)!;
  }, []);
  return (
    <>
      <mesh geometry={g.steel} material={std("st-steel", { color: "#2C2F35", roughness: 0.45, metalness: 0.6 })} castShadow receiveShadow />
      <mesh geometry={g.conc} material={std("st-conc", { color: "#9C978E", roughness: 0.9 })} receiveShadow />
      <mesh geometry={g.deck} material={std("st-deck", { color: "#4B4E55", roughness: 0.75 })} receiveShadow />
      <mesh geometry={leds} material={new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 2.1) })} />
      {/* the sign hanging over the way out, facing the train */}
      <mesh position={[X1 + 0.6, ROOF_Y - 1.05, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[6.4, 1.6]} />
        <meshStandardMaterial map={sign()} emissive="#ffffff" emissiveMap={sign()} emissiveIntensity={0.6} roughness={0.6} />
      </mesh>
      {/* and on the north side, over the queue */}
      <mesh position={[(X0 + X1) / 2, ROOF_Y + 0.3, -12.14]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[16, 4]} />
        <meshStandardMaterial map={sign()} emissive="#ffffff" emissiveMap={sign()} emissiveIntensity={0.6} roughness={0.6} />
      </mesh>
    </>
  );
};

/** Air gates: a pair of half doors at each seat, a metre back from the platform's edge. */
const Gates: React.FC = () => {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const frame0 = frameAt(rowS(0, 0));
    void SEATS;
    for (let r = 0; r < 3; r++) {
      const rx = frame0.P.x - r * ROW;
      for (const gx of [rx - 0.85, rx + 0.85]) {
        for (const half of [-1, 1]) {
          const d = new THREE.BoxGeometry(0.56, 1.05, 0.04);
          d.translate(gx + half * 0.29, PLAT_Y + 0.6, -EDGE - 1.0);
          parts.push(d);
        }
        for (const px of [gx - 0.6, gx + 0.6]) {
          const post = new THREE.BoxGeometry(0.07, 1.25, 0.07);
          post.translate(px, PLAT_Y + 0.62, -EDGE - 1.0);
          parts.push(post);
        }
      }
      // fixed fence panels between the rows' gates
      const fence = new THREE.BoxGeometry(ROW - 3.5, 1.05, 0.04);
      fence.translate(rx - ROW / 2, PLAT_Y + 0.6, -EDGE - 1.0);
      parts.push(fence);
    }
    return mergeGeometries(parts)!;
  }, []);
  return <mesh geometry={geo} material={std("gate", { color: "#C9CDD3", roughness: 0.35, metalness: 0.5 })} castShadow />;
};

/** The floor under each row, that drops away a moment before dispatch. */
const Floors: React.FC<{ u: number }> = ({ u }) => {
  const drop = smooth(BEAT.dispatch - 1.0, BEAT.dispatch - 0.5, u);
  const f = frameAt(rowS(0, 0));
  return (
    <>
      {[0, 1, 2].map((r) => (
        <mesh key={r} position={[f.P.x - r * ROW, PLAT_Y - 0.06 - 0.6 * drop, 0]} material={std("floor", { color: "#55585F", roughness: 0.8 })} receiveShadow>
          <boxGeometry args={[ROW - 0.15, 0.12, EDGE * 2 - 0.1]} />
        </mesh>
      ))}
    </>
  );
};

const hash = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};
const SKINS = ["#F3D2B5", "#EBC09C", "#D9A37A", "#C08A60", "#9A6844", "#6E4730"];
const HAIRS = ["#1B1410", "#2E2018", "#4A3222", "#6B4A2F", "#A47B4F", "#D7B576"];

const waiter = (i: number): { who: Person; clothes: Clothes; stance: Stance } => {
  const female = hash(i) < 0.5;
  const tone = SKINS[Math.floor(hash(i + 1) * SKINS.length)];
  const hair = HAIRS[Math.floor(hash(i + 2) * HAIRS.length)];
  const style = female ? (["pony", "long", "bun", "curly"] as const)[Math.floor(hash(i + 3) * 4)] : (["short", "buzz", "curly", "short"] as const)[Math.floor(hash(i + 3) * 4)];
  const who: Person = {
    name: `q${i}`,
    shape: female ? ADULT_F : ADULT_M,
    skin: { tone, blush: 0.5, freckles: 0, lip: "#B97B72", seed: 300 + i, browTint: hair },
    iris: "#3B2A1E",
    hair: { style, color: hair },
    brow: hair,
    lashes: female ? 0.8 : 0.3,
  };
  const tops = ["#E05A4F", "#3E6FB0", "#F2C14E", "#4E9A6A", "#F4F1EA", "#2F2F3A", "#E98A3B", "#5DA9C9"];
  const clothes: Clothes = {
    top: tops[Math.floor(hash(i + 4) * tops.length)],
    sleeves: "short",
    bottom: ["#2E3A55", "#3B4A6B", "#262A33", "#6B5A47"][Math.floor(hash(i + 5) * 4)],
    legs: hash(i + 6) < 0.5 ? "shorts" : "pants",
    shoe: ["#F4F4F2", "#1C1C1F", "#C0392B"][Math.floor(hash(i + 7) * 3)],
    sole: "#EDEDED",
  };
  const stance: Stance = hash(i + 8) < 0.25 ? "phone" : hash(i + 8) < 0.4 ? "wave" : "stand";
  return { who, clothes, stance };
};

const OPERATOR: { who: Person; clothes: Clothes } = {
  who: {
    name: "operator",
    shape: ADULT_F,
    skin: { tone: "#C98E66", blush: 0.4, freckles: 0, lip: "#B06060", seed: 77, browTint: "#1E1612" },
    iris: "#3B2A1E",
    hair: { style: "pony", color: "#1E1612" },
    brow: "#1E1612",
    lashes: 0.8,
  },
  clothes: { top: "#FF6A2B", sleeves: "short", bottom: "#1F2228", legs: "pants", shoe: "#1C1C1F", sole: "#2A2A2E" },
};

const Y = new THREE.Vector3(0, 1, 0);
/** A world point in the frame of someone standing at pos turned by theta about y. */
const toLocal = (p: THREE.Vector3, pos: THREE.Vector3, theta: number) => p.clone().sub(pos).applyAxisAngle(Y, -theta);

export const Station: React.FC<{ frame: number; cam: THREE.Vector3 }> = ({ frame, cam }) => {
  const u = frame / FPS;
  const f0 = frameAt(rowS(0, 0));
  // the next riders: one at each of the front row's gates and a few behind
  const queue = useMemo(() => Array.from({ length: 9 }).map((_, i) => waiter(i)), []);
  const near = cam.distanceTo(f0.P) < 60;
  if (!near) {
    return (
      <>
        <Building />
        <Gates />
      </>
    );
  }
  const opPos = new THREE.Vector3(X1 - 2.4, PLAT_Y, -EDGE - 2.5);
  const opTheta = Math.PI - 0.5;
  const opLook = toLocal(cam, opPos, opTheta);
  const thumb = smooth(0.9, 1.2, u) * (1 - smooth(1.9, 2.2, u));
  return (
    <>
      <Building />
      <Gates />
      <Floors u={u} />
      {/* the operator at the console at the platform's east end, facing the train */}
      <group position={opPos} rotation={[0, opTheta, 0]}>
        <Person3D who={OPERATOR.who} clothes={OPERATOR.clothes} k={0.97} stance={thumb > 0.5 ? "thumb" : "stand"} t={u} lookAt={opLook} e={{ smile: 0.7 }} />
      </group>
      <mesh position={[X1 - 2.4, PLAT_Y + 0.5, -EDGE - 1.7]} material={std("console", { color: "#2C2F35", roughness: 0.5, metalness: 0.3 })} castShadow>
        <boxGeometry args={[1.2, 1.0, 0.6]} />
      </mesh>
      <mesh position={[X1 - 2.4, PLAT_Y + 1.02, -EDGE - 1.75]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[1.0, 0.04, 0.5]} />
        <meshStandardMaterial color="#1A1B1E" emissive="#3AFF7A" emissiveIntensity={0.4} />
      </mesh>
      {/* the next riders behind the gates, waiting their turn and watching you go */}
      {queue.map((q, i) => {
        // two lines per row (one per gate), front to back
        const row = Math.floor(i / 3);
        const line = i % 3;
        const gx = f0.P.x - row * ROW + (line === 1 ? 0.85 : -0.85);
        const z = -EDGE - 1.55 - (line === 2 ? 0.75 : 0) - hash(i + 9) * 0.15;
        const pos = new THREE.Vector3(gx + (hash(i + 13) - 0.5) * 0.3, PLAT_Y, z);
        const theta = Math.PI + (hash(i + 10) - 0.5) * 0.5;
        return (
          <group key={i} position={pos} rotation={[0, theta, 0]}>
            <Person3D who={q.who} clothes={q.clothes} k={0.95 + hash(i + 11) * 0.08} stance={q.stance} t={u + i} lookAt={toLocal(cam, pos, theta)} e={{ smile: 0.3 + hash(i + 12) * 0.5 }} />
          </group>
        );
      })}
    </>
  );
};

export const STATION = { X0, X1, ROOF_Y, PLAT_Y, EDGE, TRACK_COL, BEAT };
