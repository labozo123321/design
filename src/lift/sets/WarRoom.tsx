import React from "react";
import * as THREE from "three";
import { canvasTex, flat, FONT, gloss, hash, toon } from "../toon";
import { HoloGlobe } from "../Globe";
import { Fx } from "../Fx";

/**
 * The hub, as in the reel: a dark navy room with big windows on a pink sky, a cyan neon strip, the
 * hologram globe on its pedestal inside a yellow floor ring, the master plan on a green board, and a
 * desk of screens.
 */

const floorTex = () =>
  canvasTex(
    "wr-floor",
    512,
    512,
    (g) => {
      g.fillStyle = "#1f2654";
      g.fillRect(0, 0, 512, 512);
      // a few darker tiles
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          if (hash(i * 7 + j * 13) > 0.7) {
            g.fillStyle = "#1a2049";
            g.fillRect(i * 128, j * 128, 128, 128);
          }
        }
      g.strokeStyle = "#141936";
      g.lineWidth = 5;
      for (let k = 0; k <= 4; k++) {
        g.beginPath();
        g.moveTo(k * 128, 0);
        g.lineTo(k * 128, 512);
        g.moveTo(0, k * 128);
        g.lineTo(512, k * 128);
        g.stroke();
      }
    },
    { repeat: [7, 7] },
  );

const skyTex = () =>
  canvasTex("wr-sky", 1024, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#f39aa5");
    gr.addColorStop(0.6, "#f6b3aa");
    gr.addColorStop(1, "#f8c7b0");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    // soft cloud bands
    g.fillStyle = "rgba(255,225,220,0.55)";
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(hash(i * 3.3) * 1024, 120 + hash(i * 1.9) * 200, 120 + hash(i) * 120, 18 + hash(i * 2) * 12, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the city's far towers
    g.fillStyle = "#c97a8e";
    for (let i = 0; i < 40; i++) {
      const w = 18 + hash(i * 5.1) * 30;
      const h = 30 + hash(i * 2.7) * 110;
      const x = hash(i * 9.7) * 1024;
      g.fillRect(x, 512 - h, w, h);
    }
    g.fillStyle = "#a96079";
    for (let i = 0; i < 26; i++) {
      const w = 26 + hash(i * 4.1) * 36;
      const h = 20 + hash(i * 3.7) * 70;
      const x = hash(i * 8.3) * 1024;
      g.fillRect(x, 512 - h, w, h);
    }
  });

/** The master plan board, portrait: the title, a chalk sketch (a planet, a line straight up, a rock at
 * the top, a little box on the line), then the checklist. */
export const PLAN = ["HEIGHT", "CABLE", "BASE", "WEIGHT", "POWER"];
export const boardTex = (checked: number, hl: number, sketch: number) =>
  canvasTex(`wr-board|${checked}|${hl}|${Math.round(sketch * 8)}`, 768, 1024, (g) => {
    g.fillStyle = "#c79a3b";
    g.fillRect(0, 0, 768, 1024);
    g.fillStyle = "#1e4a37";
    g.fillRect(20, 20, 728, 984);
    g.fillStyle = "#ffd23f";
    g.font = `900 66px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("THE MASTER PLAN", 384, 96);
    g.strokeStyle = "rgba(255,255,255,0.88)";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = 8;
    const s = Math.round(sketch * 8) / 8;
    if (s > 0) {
      g.beginPath();
      g.arc(384, 640, 150, Math.PI * 1.08, Math.PI * (1.08 + 0.84 * Math.min(1, s * 2.2)));
      g.stroke();
      if (s > 0.4) {
        const top = 490 - ((s - 0.4) / 0.6) * 290;
        g.beginPath();
        g.moveTo(384, 490);
        g.lineTo(384, Math.max(205, top));
        g.stroke();
      }
      if (s > 0.85) {
        g.beginPath();
        g.ellipse(384, 190, 36, 26, 0.3, 0, Math.PI * 2);
        g.stroke();
        g.strokeRect(362, 330, 44, 36);
      }
    }
    g.textAlign = "left";
    g.font = `900 50px ${FONT}`;
    PLAN.forEach((it, i) => {
      const y = 712 + i * 62;
      const on = i === hl;
      if (on) {
        g.fillStyle = "rgba(255,210,63,0.25)";
        g.beginPath();
        g.roundRect(150, y - 29, 470, 58, 14);
        g.fill();
      }
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 5;
      g.strokeRect(176, y - 19, 38, 38);
      g.fillStyle = on ? "#ffd23f" : "#ffffff";
      g.fillText(it, 240, y + 3);
      if (i < checked) {
        g.strokeStyle = "#5cff8a";
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(178, y - 2);
        g.lineTo(194, y + 16);
        g.lineTo(224, y - 28);
        g.stroke();
      }
    });
  });

const screenTex = (k: number) =>
  canvasTex(`wr-screen|${k}`, 256, 160, (g) => {
    g.fillStyle = "#0b1230";
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = "#47e0ff";
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = 14 + i * 11.4;
      const y = 120 - (Math.sin(i * 0.7 + k) * 0.4 + 0.5 + i * 0.02) * 70;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = "#ffd23f";
    for (let i = 0; i < 5; i++) g.fillRect(16 + i * 46, 136, 30, 10 - (i % 2) * 4);
  });

export type WarRoomState = { t: number; checked?: number; hl?: number; sketch?: number; alarm?: number; equator?: number; ribbon?: number; globeSpin?: number };

export const WarRoom: React.FC<WarRoomState> = ({ t, checked = 0, hl = -1, sketch = 0, alarm = 0, equator = 0, ribbon = 0, globeSpin }) => {
  const neon = alarm > 0 ? new THREE.Color("#3fe6ff").lerp(new THREE.Color("#ff3b4e"), alarm) : new THREE.Color("#3fe6ff");
  const blink = alarm > 0 ? 0.55 + 0.45 * Math.round(0.5 + 0.5 * Math.sin(t * 14)) : 1;
  const neonHex = `#${neon.getHexString()}`;
  return (
    <group>
      <color attach="background" args={["#0d1030"]} />
      <hemisphereLight args={["#aab4ff", "#1a1f44", alarm > 0 ? 0.9 - 0.3 * alarm : 1.0]} />
      <directionalLight
        position={[3, 7, 6]}
        intensity={1.5}
        color={alarm > 0 ? "#ffb0b0" : "#ffe1d6"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 2.0, -1.5]} intensity={alarm > 0 ? 6 * blink : 5} distance={7} color={alarm > 0.5 ? "#ff4a5a" : "#4fe0ff"} />
      {alarm > 0 ? <pointLight position={[0, 4.2, 1]} intensity={14 * alarm * blink} distance={12} color="#ff2a3c" /> : null}
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1]} receiveShadow material={toon("#ffffff", { map: floorTex() })}>
        <planeGeometry args={[16, 16]} />
      </mesh>
      {/* the yellow ring round the pedestal */}
      <Fx>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -1.5]} material={flat("#ffcc33", 1.6)}>
          <ringGeometry args={[2.1, 2.16, 128]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -1.5]} material={flat("#45e0ff", 1.3, { opacity: 0.85 })}>
          <ringGeometry args={[1.32, 1.36, 96]} />
        </mesh>
      </Fx>
      {/* back wall with the windows */}
      <group position={[0, 0, -5.2]}>
        <mesh position={[0, 0.3, 0]} material={toon("#222b60")} receiveShadow>
          <boxGeometry args={[16, 0.6, 0.3]} />
        </mesh>
        <mesh position={[0, 4.1, 0]} material={toon("#222b60")}>
          <boxGeometry args={[16, 1.6, 0.3]} />
        </mesh>
        {[-6, -4, -2, 0, 2, 4, 6].map((x) => (
          <mesh key={x} position={[x, 2.0, 0.05]} material={toon("#1b2252")} castShadow>
            <boxGeometry args={[0.16, 3.0, 0.2]} />
          </mesh>
        ))}
        <mesh position={[0, 2.0, -0.6]} material={flat("#ffffff", 1, { map: skyTex() })}>
          <planeGeometry args={[18, 4.4]} />
        </mesh>
        {/* a lattice tower out there */}
        <group position={[4.6, 0, -1.6]}>
          {[0, 1].map((s) => (
            <mesh key={s} position={[s * 0.6 - 0.3, 2.4, 0]} material={toon("#3a2f52")}>
              <boxGeometry args={[0.07, 4.8, 0.07]} />
            </mesh>
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <mesh key={i} position={[0, 0.4 + i * 0.36, 0]} rotation={[0, 0, i % 2 ? 0.55 : -0.55]} material={toon("#3a2f52")}>
              <boxGeometry args={[0.72, 0.04, 0.04]} />
            </mesh>
          ))}
        </group>
        {/* the neon strip */}
        <Fx>
          <mesh position={[0, 3.36, 0.17]} material={flat(neonHex, 2.4 * blink)}>
            <boxGeometry args={[16, 0.07, 0.04]} />
          </mesh>
        </Fx>
      </group>
      {/* left wall with the board */}
      <group position={[-5.6, 0, -1.2]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 2.4, -0.1]} material={toon("#202a5e")} receiveShadow>
          <boxGeometry args={[9, 4.8, 0.2]} />
        </mesh>
        <mesh position={[0.4, 1.95, 0.03]} material={toon("#ffffff", { map: boardTex(checked, hl, sketch), emissive: "#ffffff", ei: 0.25, emap: true })}>
          <planeGeometry args={[1.8, 2.4]} />
        </mesh>
        <Fx>
          <mesh position={[0, 3.36, 0.02]} material={flat(neonHex, 2.4 * blink)}>
            <boxGeometry args={[9, 0.07, 0.04]} />
          </mesh>
        </Fx>
      </group>
      {/* right: the desk of screens */}
      <group position={[3.7, 0, -2.4]} rotation={[0, -0.7, 0]}>
        <mesh position={[0, 0.42, 0]} material={toon("#2a3470")} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.84, 0.9]} />
        </mesh>
        <mesh position={[0, 0.86, 0]} material={toon("#323d80")}>
          <boxGeometry args={[2.5, 0.05, 1.0]} />
        </mesh>
        {[-0.8, 0, 0.8].map((x, i) => (
          <group key={i} position={[x, 1.25, -0.22]} rotation={[-0.12, (i - 1) * -0.25, 0]}>
            <mesh material={gloss("#11152c", 0.4)} castShadow>
              <boxGeometry args={[0.72, 0.48, 0.05]} />
            </mesh>
            <Fx>
              <mesh position={[0, 0, 0.03]} material={flat("#ffffff", 1.35, { map: screenTex(i) })}>
                <planeGeometry args={[0.64, 0.4]} />
              </mesh>
            </Fx>
            <mesh position={[0, -0.32, 0.0]} material={toon("#11152c")}>
              <boxGeometry args={[0.05, 0.2, 0.05]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* the pedestal and the globe */}
      <group position={[0, 0, -1.5]}>
        <mesh position={[0, 0.25, 0]} material={toon("#151b3e")} castShadow receiveShadow>
          <cylinderGeometry args={[1.05, 1.15, 0.5, 64]} />
        </mesh>
        <Fx>
          <mesh position={[0, 0.505, 0]} rotation={[-Math.PI / 2, 0, 0]} material={flat("#43dcff", 1.8)}>
            <ringGeometry args={[0.86, 0.95, 96]} />
          </mesh>
          <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]} material={flat("#0f6d8a", 1, { additive: true, opacity: 0.6 })}>
            <circleGeometry args={[0.86, 64]} />
          </mesh>
        </Fx>
        <HoloGlobe r={0.92} spin={globeSpin ?? t * 0.25} t={t} pos={[0, 1.75, 0]} equator={equator} ribbon={ribbon} alarm={alarm} />
      </group>
    </group>
  );
};
