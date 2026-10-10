import React, { useMemo } from "react";
import * as THREE from "three";
import { EV, HR, HX, HZ } from "../timeline";
import { clipOutsideShaft, glowMat, std } from "../mats";

/**
 * 105 m down: the shaft cuts straight through a metro tunnel (east-west). A train crosses the shaft just
 * below you and its last car clears the gap a moment before you fall through it.
 */

export const TUNNEL_R = 2.9;
const TRAIN_V = 28; // m/s
const CAR_L = 17.6;
const GAP = 1.0;
const CARS = 4;
const TRAIN_L = CARS * CAR_L + (CARS - 1) * GAP;
/** When the last car's tail leaves the shaft (s). */
const CLEAR_AT = 6.85;
/** Front of the train (world x) at time t. */
export const trainHead = (t: number) => HX + HR + TRAIN_L + TRAIN_V * (t - CLEAR_AT);

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
};

let tunnelTex: { map: THREE.Texture; glow: THREE.Texture } | null = null;
/** Segmented concrete lining, 12 m per tile along the tunnel: ring joints every 1.5 m, two lamps a side. */
const tunnelTextures = () => {
  if (tunnelTex) return tunnelTex;
  const W = 256;
  const H = 512;
  const a = canvas(W, H);
  const b = canvas(W, H);
  a.g.fillStyle = "#77736C";
  a.g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const v = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const x = Math.abs((Math.sin(i * 78.233) * 12345.678) % 1) * W;
    const y = Math.abs((Math.sin(i * 39.425) * 9876.543) % 1) * H;
    a.g.fillStyle = v > 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    a.g.fillRect(x, y, 3, 3);
  }
  // ring joints
  a.g.fillStyle = "#3E3B37";
  for (let k = 0; k < 8; k++) a.g.fillRect(0, (k * H) / 8, W, 3);
  // cable trays along both sides
  a.g.fillStyle = "#2B2B2E";
  for (const u of [0.31, 0.69]) a.g.fillRect(u * W - 5, 0, 10, H);
  // light: black base, bright fixtures, warm pools round them
  b.g.fillStyle = "#000";
  b.g.fillRect(0, 0, W, H);
  for (const u of [0.25, 0.75])
    for (const v of [0.25, 0.75]) {
      const x = u * W;
      const y = v * H;
      const grd = b.g.createRadialGradient(x, y, 0, x, y, 120);
      grd.addColorStop(0, "rgba(255,226,170,0.55)");
      grd.addColorStop(0.4, "rgba(255,210,150,0.18)");
      grd.addColorStop(1, "rgba(255,200,140,0)");
      b.g.fillStyle = grd;
      b.g.fillRect(0, 0, W, H);
      b.g.fillStyle = "#FFF4DE";
      b.g.fillRect(x - 6, y - 16, 12, 32);
      a.g.fillStyle = "#EEE";
      a.g.fillRect(x - 6, y - 16, 12, 32);
    }
  const mk = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 300 / 12);
    t.anisotropy = 4;
    return t;
  };
  tunnelTex = { map: mk(a.c), glow: mk(b.c) };
  return tunnelTex;
};

let windowTex: THREE.Texture | null = null;
/** A car's side: eight lit windows with dark frames and a few silhouettes. */
const windows = () => {
  if (windowTex) return windowTex;
  const { c, g } = canvas(512, 64);
  g.fillStyle = "#15171B";
  g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 8; i++) {
    const x = 8 + i * 63;
    g.fillStyle = "#FFE9C2";
    g.fillRect(x, 8, 52, 48);
    // a passenger or two
    if (i % 3 !== 1) {
      g.fillStyle = "rgba(40,30,30,0.55)";
      g.beginPath();
      g.arc(x + 18 + (i % 2) * 14, 30, 7, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 10 + (i % 2) * 14, 38, 16, 18);
    }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.colorSpace = THREE.SRGBColorSpace;
  return windowTex;
};

const Car: React.FC<{ x: number; front: boolean; back: boolean }> = ({ x, front, back }) => {
  const winMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: windows(), color: new THREE.Color(2.2, 2.1, 1.9) }),
    [],
  );
  const bodyY = -0.42;
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, bodyY, 0]} material={std("#C9CDD3", { metalness: 0.55, roughness: 0.35 })}>
        <boxGeometry args={[CAR_L, 3.0, 2.75]} />
      </mesh>
      {/* blue band and the dark window strip, both sides */}
      <mesh position={[0, bodyY - 0.75, 0]} material={std("#1F5FA8", { roughness: 0.4 })}>
        <boxGeometry args={[CAR_L + 0.02, 0.32, 2.77]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[0, bodyY + 0.35, s * 1.39]}
          rotation={[0, s > 0 ? 0 : Math.PI, 0]}
          material={winMat}
        >
          <planeGeometry args={[CAR_L - 1.2, 1.05]} />
        </mesh>
      ))}
      {/* roof: a dark strip, two air-conditioning units, a vent line */}
      <mesh position={[0, bodyY + 1.56, 0]} material={std("#565B62", { roughness: 0.6 })}>
        <boxGeometry args={[CAR_L - 0.2, 0.14, 2.3]} />
      </mesh>
      {[-4.6, 4.6].map((ax) => (
        <mesh
          key={ax}
          position={[ax, bodyY + 1.8, 0]}
          material={std("#9AA0A8", { metalness: 0.4, roughness: 0.5 })}
        >
          <boxGeometry args={[2.4, 0.36, 1.7]} />
        </mesh>
      ))}
      {[-4.6, 4.6].map((ax) => (
        <mesh key={`f${ax}`} position={[ax, bodyY + 1.99, 0]} material={std("#2A2D31")}>
          <cylinderGeometry args={[0.42, 0.42, 0.03, 20]} />
        </mesh>
      ))}
      {/* lights: headlamps on the front car, red tail lamps on the last */}
      {front
        ? [-0.85, 0.85].map((z) => (
            <mesh key={z} position={[CAR_L / 2 + 0.02, bodyY - 0.9, z]} material={glowMat("#FFFFFF", 9)}>
              <boxGeometry args={[0.05, 0.22, 0.4]} />
            </mesh>
          ))
        : null}
      {back
        ? [-0.95, 0.95].map((z) => (
            <mesh key={z} position={[-CAR_L / 2 - 0.02, bodyY - 0.9, z]} material={glowMat("#FF2020", 7)}>
              <boxGeometry args={[0.05, 0.2, 0.3]} />
            </mesh>
          ))
        : null}
      {/* the gangway to the next car */}
      {!back ? (
        <mesh position={[-CAR_L / 2 - GAP / 2, bodyY, 0]} material={std("#1B1C1F")}>
          <boxGeometry args={[GAP, 2.6, 2.2]} />
        </mesh>
      ) : null}
    </group>
  );
};

/** Tunnel and train, in world space; `y` is the tunnel axis height (surface - w). */
export const Metro: React.FC<{ y: number; t: number }> = ({ y, t }) => {
  const mats = useMemo(() => {
    const tx = tunnelTextures();
    return {
      lining: clipOutsideShaft(
        new THREE.MeshStandardMaterial({
          map: tx.map,
          emissiveMap: tx.glow,
          emissive: new THREE.Color("#FFFFFF"),
          emissiveIntensity: 2.2,
          roughness: 0.9,
          side: THREE.BackSide,
        }),
      ),
      bed: clipOutsideShaft(new THREE.MeshStandardMaterial({ color: "#3A3733", roughness: 0.95 })),
      rail: clipOutsideShaft(
        new THREE.MeshStandardMaterial({ color: "#B8B4AC", metalness: 0.8, roughness: 0.3 }),
      ),
    };
  }, []);
  const head = trainHead(t);
  // only while it's anywhere near the shaft
  const showTrain = head > HX - 140 && head - TRAIN_L < HX + 140;
  return (
    <group position={[0, y, HZ]}>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[HX, 0, 0]} material={mats.lining}>
        <cylinderGeometry args={[TUNNEL_R, TUNNEL_R, 300, 40, 1, true]} />
      </mesh>
      <mesh position={[HX, -2.25, 0]} material={mats.bed}>
        <boxGeometry args={[300, 0.3, 3.4]} />
      </mesh>
      {[-0.72, 0.72].map((z) => (
        <mesh key={z} position={[HX, -2.02, z]} material={mats.rail}>
          <boxGeometry args={[300, 0.16, 0.08]} />
        </mesh>
      ))}
      {showTrain
        ? Array.from({ length: CARS }).map((_, i) => (
            <Car key={i} x={head - CAR_L / 2 - i * (CAR_L + GAP)} front={i === 0} back={i === CARS - 1} />
          ))
        : null}
    </group>
  );
};

/** Where the train's light is (for the shaft's light rig), or null when it's gone. */
export const trainLight = (t: number, surf: number) => {
  const head = trainHead(t);
  const mid = head - TRAIN_L / 2;
  const x = Math.max(HX - 30, Math.min(HX + 30, mid));
  if (head < HX - 140 || head - TRAIN_L > HX + 140) return null;
  return new THREE.Vector3(x, surf - EV.train, HZ);
};
