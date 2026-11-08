import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, flat, gloss, toon, clamp01, smooth, backOut } from "../toon";
import { Fx } from "../Fx";
import { SkyDome, Cloud, Label } from "./common";
import { StripGeometry } from "../hose";

/**
 * Where the ribbon is made: a clean white hall with yellow ceiling panels; the reactor where a glowing
 * carbon lattice tube grows inside a glass column; the spool that winds the black ribbon; a big balance
 * with a steel beam on one pan and a coil of ribbon on the other. Plus the hall from outside.
 */

const tileTex = () =>
  canvasTex(
    "fac-floor",
    256,
    256,
    (g) => {
      g.fillStyle = "#e9ecf1";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "#cfd5de";
      g.lineWidth = 4;
      for (let k = 0; k <= 2; k++) {
        g.beginPath();
        g.moveTo(k * 128, 0);
        g.lineTo(k * 128, 256);
        g.moveTo(0, k * 128);
        g.lineTo(256, k * 128);
        g.stroke();
      }
    },
    { repeat: [14, 14] },
  );

const hexTex = () =>
  canvasTex(
    "hex-lattice",
    256,
    256,
    (g) => {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(140,240,255,1)";
      g.lineWidth = 5;
      const r = 22;
      const w = r * Math.sqrt(3);
      for (let row = -1; row < 9; row++)
        for (let col = -1; col < 8; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0);
          const cy = row * r * 1.5;
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
    },
    { repeat: [3, 4] },
  );

const ribbonTex = () =>
  canvasTex(
    "ribbon-sheen",
    64,
    256,
    (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, "#15161c");
      gr.addColorStop(0.45, "#2c2f3a");
      gr.addColorStop(0.55, "#4a4f60");
      gr.addColorStop(1, "#15161c");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 256);
      g.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 16; i++) g.fillRect(0, i * 16, 64, 2);
    },
    { repeat: [1, 6] },
  );

/** The hall's inside. grow: the lattice tube's growth 0..1. spin: the spool's turn (radians). */
export const FactoryHall: React.FC<{ t: number; grow?: number; spool?: number; balance?: number; labels?: number; children?: React.ReactNode }> = ({ t, grow = 1, spool = 0, balance = -1, labels = 0, children }) => {
  const strip = useMemo(() => new StripGeometry(60), []);
  const rt = ribbonTex();
  rt.offset.y = -spool * 0.5;
  // the sheet runs from the rollers to the spool
  strip.update(
    (s) => new THREE.Vector3(-6.2 + s * 3.2, 1.05 + Math.sin(s * Math.PI) * 0.12 + s * 0.35, 2.2),
    () => new THREE.Vector3(0, 0, 1),
    () => 1.2,
  );
  return (
    <group>
      <color attach="background" args={["#c9d3e0"]} />
      <hemisphereLight args={["#ffffff", "#b9c4d4", 1.1]} />
      <directionalLight position={[4, 9, 7]} intensity={1.3} color="#fffaf0" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-0.0005} />
      <pointLight position={[0, 3, -1]} intensity={3 * grow} distance={7} color="#6fe8ff" />
      {/* floor, walls, the stripe, ceiling panels */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={toon("#ffffff", { map: tileTex() })} receiveShadow>
        <planeGeometry args={[40, 40]} />
      </mesh>
      <mesh position={[0, 4, -6]} material={toon("#dde3ec")} receiveShadow>
        <boxGeometry args={[40, 8, 0.3]} />
      </mesh>
      <mesh position={[0, 1.2, -5.82]} material={toon("#2f6fd6")}>
        <boxGeometry args={[40, 0.35, 0.05]} />
      </mesh>
      <mesh position={[-12, 4, 0]} rotation={[0, Math.PI / 2, 0]} material={toon("#d8dee8")} receiveShadow>
        <boxGeometry args={[40, 8, 0.3]} />
      </mesh>
      <Fx>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} position={[-8 + (i % 4) * 5.4, 6.6, -4 + Math.floor(i / 4) * 4.5]} rotation={[Math.PI / 2, 0, 0]} material={flat("#ffe9a6", 1.7)}>
            <planeGeometry args={[2.6, 1.0]} />
          </mesh>
        ))}
      </Fx>
      {/* the reactor */}
      <group position={[0, 0, -1.6]}>
        <mesh position={[0, 0.3, 0]} material={toon("#c9d0dc")} castShadow receiveShadow>
          <cylinderGeometry args={[1.5, 1.6, 0.6, 40]} />
        </mesh>
        <mesh position={[0, 4.2, 0]} material={toon("#c9d0dc")} castShadow>
          <cylinderGeometry args={[1.5, 1.5, 0.5, 40]} />
        </mesh>
        <Fx>
          <mesh position={[0, 2.25, 0]} material={flat("#bfefff", 1, { opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })}>
            <cylinderGeometry args={[1.25, 1.25, 3.4, 40, 1, true]} />
          </mesh>
          <group position={[0, 0.6, 0]} scale={[1, Math.max(0.001, grow), 1]}>
            <mesh position={[0, 1.65, 0]} rotation={[0, t * 0.8, 0]} material={flat("#4fd8f2", 1.0, { map: hexTex(), additive: true, side: THREE.DoubleSide })}>
              <cylinderGeometry args={[0.55, 0.55, 3.3, 32, 1, true]} />
            </mesh>
          </group>
          <mesh position={[0, 0.62 + 3.3 * grow, 0]} material={flat("#d8fbff", 1.5, { additive: true, opacity: 0.7 })}>
            <sphereGeometry args={[0.14, 16, 12]} />
          </mesh>
        </Fx>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 1.45, 2.25, Math.sin(i * 2.1) * 1.45]} material={toon("#9aa3b5")}>
            <cylinderGeometry args={[0.08, 0.08, 3.6, 8]} />
          </mesh>
        ))}
      </group>
      {/* the rollers, the sheet and the spool */}
      <group>
        {[-6.4, -5.6].map((x, i) => (
          <mesh key={i} position={[x, 1.0 - i * 0.2, 2.2]} rotation={[Math.PI / 2, 0, 0]} material={toon("#9aa3b5")}>
            <cylinderGeometry args={[0.18, 0.18, 1.5, 16]} />
          </mesh>
        ))}
        <mesh geometry={strip} material={toon("#ffffff", { map: rt, side: THREE.DoubleSide })} />
        <group position={[-2.6, 1.4, 2.2]} rotation={[0, 0, spool]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={gloss("#1c1d24", 0.25)} castShadow>
            <cylinderGeometry args={[0.85, 0.85, 1.25, 40]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0, s * 0.68]} rotation={[Math.PI / 2, 0, 0]} material={toon("#ffd23f")}>
              <cylinderGeometry args={[1.0, 1.0, 0.08, 40]} />
            </mesh>
          ))}
        </group>
        <mesh position={[-2.6, 0.7, 2.2]} material={toon("#5a6274")} castShadow>
          <boxGeometry args={[0.5, 1.4, 1.7]} />
        </mesh>
      </group>
      {/* the balance */}
      {balance >= 0 ? <Balance tilt={balance} labels={labels} /> : null}
      {children}
    </group>
  );
};

/** A big balance at (4, 0, 1): steel beam on the left pan, a coil of ribbon on the right. tilt -1..1
 * (positive: the steel side down). labels: 0 none, 1 "×100 stronger", 2 also "1/6 the weight". */
export const Balance: React.FC<{ tilt: number; labels: number }> = ({ tilt, labels }) => {
  const a = tilt * 0.3;
  const arm = 1.15;
  // the pans hang from the beam's ends (the left end goes down as the beam turns by -a)
  const l: [number, number, number] = [-arm * Math.cos(a), 3.0 - arm * Math.sin(a), 0];
  const r: [number, number, number] = [arm * Math.cos(a), 3.0 + arm * Math.sin(a), 0];
  return (
    <group position={[4.2, 0, 1.0]}>
      <mesh position={[0, 0.1, 0]} material={toon("#3a3f4c")} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.8, 0.2, 32]} />
      </mesh>
      <mesh position={[0, 1.55, 0]} material={toon("#c79a3b")} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 2.9, 12]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} rotation={[0, 0, a]} material={toon("#c79a3b")} castShadow>
        <boxGeometry args={[arm * 2 + 0.2, 0.14, 0.14]} />
      </mesh>
      <mesh position={[0, 3.12, 0]} material={toon("#c79a3b")}>
        <sphereGeometry args={[0.16, 16, 12]} />
      </mesh>
      {[l, r].map((p, i) => (
        <group key={i} position={[p[0], p[1], 0]}>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[sd * 0.3, -0.6, 0]} rotation={[0, 0, sd * 0.45]} material={toon("#8c7a4a")}>
              <cylinderGeometry args={[0.015, 0.015, 1.3, 4]} />
            </mesh>
          ))}
          <mesh position={[0, -1.2, 0]} material={toon("#c79a3b")} castShadow receiveShadow>
            <cylinderGeometry args={[0.6, 0.5, 0.12, 32]} />
          </mesh>
          {i === 0 ? (
            // a steel I-beam, heavy
            <group position={[0, -0.85, 0]}>
              <mesh material={toon("#8e97a8")} castShadow>
                <boxGeometry args={[0.95, 0.08, 0.45]} />
              </mesh>
              <mesh position={[0, 0.25, 0]} material={toon("#8e97a8")} castShadow>
                <boxGeometry args={[0.95, 0.45, 0.1]} />
              </mesh>
              <mesh position={[0, 0.5, 0]} material={toon("#8e97a8")} castShadow>
                <boxGeometry args={[0.95, 0.08, 0.45]} />
              </mesh>
            </group>
          ) : (
            // a neat coil of ribbon
            <mesh position={[0, -1.02, 0]} material={gloss("#17181e", 0.25)} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.24, 32]} />
            </mesh>
          )}
        </group>
      ))}
      <Label text="STEEL" h={0.3} pos={[l[0], l[1] - 1.55, 0.62]} o={{ size: 110, color: "#ffffff", stroke: "#1b1f2c", strokeW: 18 }} />
      <Label text="RIBBON" h={0.3} pos={[r[0], r[1] - 1.55, 0.62]} o={{ size: 110, color: "#ffffff", stroke: "#1b1f2c", strokeW: 18 }} />
      {labels >= 1 ? <Label text={"100×\nSTRONGER"} h={0.7} pos={[0, 4.0, 0.3]} o={{ size: 120, color: "#5cff8a", stroke: "#0b2a17", strokeW: 20 }} /> : null}
      {labels >= 2 ? <Label text={"1/6 THE\nWEIGHT"} h={0.7} pos={[0, 4.85, 0.3]} o={{ size: 120, color: "#ffd23f", stroke: "#2a2208", strokeW: 20 }} /> : null}
    </group>
  );
};

/** The hall from outside: white, a saw-tooth roof, the lift's mark on a big sign, blue sky. */
export const FactoryOutside: React.FC<{ t: number; children?: React.ReactNode }> = ({ children }) => (
  <group>
    <SkyDome stops={[[0, "#3f86de"], [0.45, "#8cc8f4"], [0.5, "#d4ecfb"], [0.52, "#a7d47a"], [1, "#7fbf5a"]]} />
    <hemisphereLight args={["#f2f8ff", "#86b46a", 1.25]} />
    <directionalLight position={[10, 16, 12]} intensity={1.6} color="#fffaf0" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-far={80} shadow-bias={-0.0005} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={toon("#8fcf6a")} receiveShadow>
      <planeGeometry args={[300, 300]} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4]} material={toon("#c9cdd6")} receiveShadow>
      <planeGeometry args={[30, 7]} />
    </mesh>
    <group position={[0, 0, -6]}>
      <mesh position={[0, 3, 0]} material={toon("#f4f6f9")} castShadow receiveShadow>
        <boxGeometry args={[22, 6, 12]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[-9.2 + i * 3.7, 6, 0]}>
          <mesh rotation={[0, 0, 0.5]} position={[0.6, 0.85, 0]} material={toon("#e3e8f0")} castShadow>
            <boxGeometry args={[2.6, 0.12, 12]} />
          </mesh>
          <mesh position={[1.75, 0.9, 0]} material={flat("#9fd3ff", 1.0)}>
            <boxGeometry args={[0.06, 1.7, 11.8]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.6, 6.02]} material={toon("#2f6fd6")}>
        <boxGeometry args={[22, 0.4, 0.05]} />
      </mesh>
      {/* the door */}
      <mesh position={[0, 1.4, 6.03]} material={toon("#c9d0dc")}>
        <boxGeometry args={[4, 2.8, 0.05]} />
      </mesh>
      {/* the sign */}
      <mesh position={[0, 4.2, 6.1]} material={toon("#ffffff")}>
        <boxGeometry args={[4.6, 1.2, 0.15]} />
      </mesh>
      <Label text="RIBBON WORKS" h={0.7} pos={[0, 4.2, 6.2]} o={{ size: 110, color: "#2f6fd6" }} fx={false} />
    </group>
    <Cloud pos={[-20, 18, -40]} s={4} seed={3} />
    <Cloud pos={[16, 22, -50]} s={5} seed={4} />
    {children}
  </group>
);

/** Scale tilt as the balance settles: steel side drops with a little overshoot. */
export const balanceTilt = (u: number) => {
  const k = clamp01(u);
  return backOut(smooth(0, 1, k), 2.2) * 0.85;
};
