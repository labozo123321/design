import React, { useMemo } from "react";
import * as THREE from "three";
import { canvasTex, flat, gloss, hash, toon, clamp01 } from "../toon";
import { Fx } from "../Fx";
import { SkyDome, Cloud, Label } from "./common";
import { Climber } from "./Space";

/**
 * The floating base in the middle of the ocean: a white hexagon with a yellow edge, the anchor tower and
 * the ribbon going up out of sight, the laser dish that powers the climbers, the lobby with its big
 * doors, a helipad, containers, cranes. The sea is drawn by a little shader.
 *
 * The deck is at y = 0.5. `sail` moves the whole base (x, z) and draws its wake.
 */

export const DECK = 0.5;

const oceanMat = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uDeep: { value: new THREE.Color("#1d6fd0") },
      uLight: { value: new THREE.Color("#4a9be6") },
      uHorizon: { value: new THREE.Color("#bfe2fb") },
      uCam: { value: new THREE.Vector3() },
      uWake: { value: 0 },
      uBase: { value: new THREE.Vector2() },
      uDir: { value: new THREE.Vector2(1, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uT; uniform vec3 uDeep; uniform vec3 uLight; uniform vec3 uHorizon; uniform vec3 uCam;
      uniform float uWake; uniform vec2 uBase; uniform vec2 uDir;
      varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = vW.xz;
        float w = sin(p.x * 0.35 + uT * 0.8) * 0.5 + sin(p.y * 0.27 - uT * 0.6 + p.x * 0.1) * 0.5;
        float band = smoothstep(0.62, 0.8, sin(p.x * 0.16 + p.y * 0.29 + uT * 0.5 + w * 1.2));
        vec3 col = mix(uDeep, uLight, band * 0.55);
        // foam round the hull
        vec2 q = p - uBase;
        float r = length(q);
        float foam = smoothstep(9.6, 8.4, r) * smoothstep(7.6, 8.4, r) * (0.55 + 0.45 * sin(atan(q.y, q.x) * 18.0 + uT * 2.0));
        // the wake: a widening V behind the base
        float along = -dot(q, uDir);
        float across = abs(q.x * uDir.y - q.y * uDir.x);
        float v = uWake * smoothstep(0.0, 6.0, along) * (1.0 - smoothstep(10.0, 90.0, along)) * smoothstep(8.0 + along * 0.32, 5.0 + along * 0.32, across) * (0.6 + 0.4 * sin(along * 0.9 - uT * 6.0));
        col = mix(col, vec3(0.93, 0.97, 1.0), clamp(foam + v, 0.0, 1.0));
        float d = length(vW - uCam);
        col = mix(col, uHorizon, smoothstep(90.0, 420.0, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

const hazardTex = () =>
  canvasTex(
    "hazard",
    256,
    32,
    (g) => {
      g.fillStyle = "#ffcc22";
      g.fillRect(0, 0, 256, 32);
      g.fillStyle = "#1e1e24";
      for (let i = -1; i < 9; i++) {
        g.beginPath();
        g.moveTo(i * 32, 32);
        g.lineTo(i * 32 + 16, 32);
        g.lineTo(i * 32 + 32, 0);
        g.lineTo(i * 32 + 16, 0);
        g.closePath();
        g.fill();
      }
    },
    { repeat: [24, 1] },
  );

const helipadTex = () =>
  canvasTex("helipad", 256, 256, (g) => {
    g.fillStyle = "#4b5263";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#f5f5f5";
    g.lineWidth = 12;
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#f5f5f5";
    g.font = "900 150px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("H", 128, 138);
  });

const gaugeTex = (v: number) =>
  canvasTex(`gauge|${Math.round(v * 20)}`, 256, 256, (g) => {
    g.fillStyle = "#f7f7f7";
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#2a2d36";
    g.stroke();
    // the dial: red to green
    const seg = (a0: number, a1: number, c: string) => {
      g.strokeStyle = c;
      g.lineWidth = 22;
      g.beginPath();
      g.arc(128, 140, 84, a0, a1);
      g.stroke();
    };
    seg(Math.PI * 1.0, Math.PI * 1.25, "#e5484d");
    seg(Math.PI * 1.25, Math.PI * 1.55, "#f5c542");
    seg(Math.PI * 1.55, Math.PI * 2.0, "#5bd08a");
    g.fillStyle = "#2a2d36";
    g.font = "900 34px sans-serif";
    g.textAlign = "center";
    g.fillText("FUEL", 128, 200);
    g.fillText("E", 52, 160);
    g.fillText("F", 204, 160);
    const a = Math.PI * (1.0 + v);
    g.strokeStyle = "#e5484d";
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(128, 140);
    g.lineTo(128 + Math.cos(a) * 70, 140 + Math.sin(a) * 70);
    g.stroke();
    g.fillStyle = "#2a2d36";
    g.beginPath();
    g.arc(128, 140, 14, 0, Math.PI * 2);
    g.fill();
  });

export type OceanProps = {
  t: number;
  sail?: [number, number];
  wake?: number;
  /** the climber's height above the anchor (undefined: none) */
  climb?: number;
  laser?: number;
  doors?: number;
  gauge?: number;
  cranes?: boolean;
  sunArc?: number;
  children?: React.ReactNode;
  /** a plane far off, turning back (0..1) */
  planeTurn?: number;
  gull?: number;
};

export const Ocean: React.FC<OceanProps> = ({ t, sail = [0, 0], wake = 0, climb, laser = 0, doors = 0, gauge, cranes = false, sunArc, children, planeTurn, gull }) => {
  const sea = useMemo(() => oceanMat(), []);
  sea.uniforms.uT.value = t;
  sea.uniforms.uWake.value = wake;
  sea.uniforms.uBase.value.set(sail[0], sail[1]);
  const sun = sunArc === undefined ? new THREE.Vector3(12, 20, 14) : new THREE.Vector3(Math.cos(sunArc) * 30, Math.max(2, Math.sin(sunArc) * 30), 10);
  const climberY = climb === undefined ? 0 : 4.8 + climb;
  return (
    <group>
      <SkyDome stops={[[0, "#3d84dc"], [0.4, "#7dbdf0"], [0.5, "#cfeafc"], [1, "#9fc9ee"]]} />
      <hemisphereLight args={["#eef7ff", "#4f8fd6", 1.2]} />
      <directionalLight position={sun.toArray()} intensity={1.7} color="#fff8ec" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={90} shadow-bias={-0.0006} />
      {/* the sea */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={sea} onBeforeRender={(_r, _s, cam) => sea.uniforms.uCam.value.copy(cam.position)}>
        <circleGeometry args={[700, 96]} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => (
        <Cloud key={i} pos={[Math.cos(i * 0.63) * (150 + hash(i) * 80), 30 + hash(i * 2.1) * 25, Math.sin(i * 0.63) * (150 + hash(i) * 80)]} s={9 + hash(i * 3.3) * 7} seed={i + 70} />
      ))}
      {planeTurn !== undefined ? (
        <group position={[30 - 26 * Math.sin(planeTurn * Math.PI), 70, -120 + 20 * (1 - Math.cos(planeTurn * Math.PI))]} rotation={[0, Math.PI / 2 + planeTurn * Math.PI, -0.5 * Math.sin(planeTurn * Math.PI)]} scale={2.2}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={toon("#f4f6fa")}>
            <capsuleGeometry args={[0.35, 3.2, 8, 16]} />
          </mesh>
          <mesh material={toon("#d8dde7")}>
            <boxGeometry args={[0.9, 0.08, 4.4]} />
          </mesh>
          <mesh position={[-1.7, 0.45, 0]} material={toon("#e5484d")}>
            <boxGeometry args={[0.55, 0.9, 0.08]} />
          </mesh>
        </group>
      ) : null}
      {gull !== undefined ? (
        <group position={[-6 + gull * 14, 9 + Math.sin(gull * 6) * 0.4, 6 - gull * 4]} rotation={[0, -0.4, 0]} scale={1.1}>
          <mesh material={toon("#ffffff")} scale={[0.6, 0.25, 0.25]}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.1, s * 0.55]} rotation={[s * (0.3 + 0.5 * Math.sin(t * 9)), 0, 0]} material={toon("#ffffff", { side: THREE.DoubleSide })}>
              <boxGeometry args={[0.4, 0.04, 1.0]} />
            </mesh>
          ))}
          <mesh position={[0.62, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={toon("#ffb02e")}>
            <coneGeometry args={[0.08, 0.25, 8]} />
          </mesh>
        </group>
      ) : null}
      {/* the base */}
      <group position={[sail[0], 0, sail[1]]}>
        <mesh position={[0, -0.25, 0]} rotation={[0, Math.PI / 6, 0]} material={toon("#d7dde6")} castShadow receiveShadow>
          <cylinderGeometry args={[8, 7.4, 1.5, 6]} />
        </mesh>
        <mesh position={[0, DECK - 0.03, 0]} rotation={[0, Math.PI / 6, 0]} material={toon("#eef1f5")} receiveShadow>
          <cylinderGeometry args={[7.75, 7.75, 0.08, 6]} />
        </mesh>
        <mesh position={[0, DECK - 0.12, 0]} rotation={[0, Math.PI / 6, 0]} material={toon("#ffffff", { map: hazardTex() })}>
          <cylinderGeometry args={[8.02, 8.02, 0.22, 6, 1, true]} />
        </mesh>
        {/* railings */}
        {Array.from({ length: 6 }, (_, side) => {
          const a0 = (side / 6) * Math.PI * 2;
          const a1 = ((side + 1) / 6) * Math.PI * 2;
          const p0 = new THREE.Vector3(Math.cos(a0) * 7.7, 0, -Math.sin(a0) * 7.7);
          const p1 = new THREE.Vector3(Math.cos(a1) * 7.7, 0, -Math.sin(a1) * 7.7);
          const mid = p0.clone().add(p1).multiplyScalar(0.5);
          const len = p0.distanceTo(p1);
          const ang = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
          return (
            <group key={side} position={[mid.x, DECK, mid.z]} rotation={[0, ang, 0]}>
              <mesh position={[0, 0.55, 0]} material={toon("#ffcc22")}>
                <boxGeometry args={[len, 0.06, 0.06]} />
              </mesh>
              {Array.from({ length: 6 }, (_, k) => (
                <mesh key={k} position={[-len / 2 + (k + 0.5) * (len / 6), 0.28, 0]} material={toon("#9aa3b5")}>
                  <boxGeometry args={[0.05, 0.56, 0.05]} />
                </mesh>
              ))}
            </group>
          );
        })}
        {/* the anchor, the ribbon */}
        <mesh position={[0, DECK + 1.6, 0]} material={toon("#c9d0dc")} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 1.15, 3.2, 32]} />
        </mesh>
        <mesh position={[0, DECK + 3.3, 0]} material={toon("#e5484d")} castShadow>
          <cylinderGeometry args={[1.0, 1.0, 0.3, 32]} />
        </mesh>
        <mesh position={[0, DECK + 3.3 + 250, 0]} material={toon("#2b2e38", { emissive: "#9fb4d8", ei: 0.25 })}>
          <boxGeometry args={[0.55, 500, 0.04]} />
        </mesh>
        {/* the climber on the ribbon */}
        {climb !== undefined ? (
          <group position={[0, DECK + climberY, 0]}>
            <Climber s={1.15} lit={laser} />
            {gauge !== undefined ? (
              <mesh position={[0, 0.1, 0.72]} material={toon("#ffffff", { map: gaugeTex(gauge) })}>
                <circleGeometry args={[0.42, 40]} />
              </mesh>
            ) : null}
          </group>
        ) : null}
        {/* the laser dish */}
        <group position={[3.2, DECK, 2.4]}>
          <mesh position={[0, 0.5, 0]} material={toon("#9aa3b5")} castShadow>
            <cylinderGeometry args={[0.18, 0.3, 1.0, 16]} />
          </mesh>
          <group position={[0, 1.15, 0]} rotation={[0.0, 0, 0.0]}>
            <mesh rotation={[Math.PI, 0, 0]} material={toon("#eef1f5", { side: THREE.DoubleSide })} castShadow>
              <sphereGeometry args={[0.9, 28, 12, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38]} />
            </mesh>
            <mesh position={[0, 0.25, 0]} material={toon("#4fd2ff", { emissive: "#4fd2ff", ei: 0.5 + laser * 2 })}>
              <sphereGeometry args={[0.16, 16, 12]} />
            </mesh>
          </group>
        </group>
        {laser > 0.01 && climb !== undefined ? (
          <Fx>
            {(() => {
              const from = new THREE.Vector3(3.2, DECK + 1.4, 2.4);
              const to = new THREE.Vector3(0, DECK + climberY - 0.95, 0);
              const mid = from.clone().add(to).multiplyScalar(0.5);
              const len = from.distanceTo(to);
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
              return (
                <group position={mid} quaternion={q}>
                  <mesh material={flat("#7fe6ff", 3.5, { additive: true, opacity: clamp01(laser) })}>
                    <cylinderGeometry args={[0.07, 0.07, len, 10, 1, true]} />
                  </mesh>
                  <mesh material={flat("#3fb8ff", 1.6, { additive: true, opacity: 0.35 * clamp01(laser) })}>
                    <cylinderGeometry args={[0.28, 0.28, len, 14, 1, true]} />
                  </mesh>
                </group>
              );
            })()}
          </Fx>
        ) : null}
        {/* the lobby, its doors and its sign */}
        <group position={[-3.6, DECK, 2.6]} rotation={[0, 0.35, 0]}>
          <mesh position={[0, 1.3, 0]} material={toon("#f6f7fa")} castShadow receiveShadow>
            <boxGeometry args={[3.4, 2.6, 2.4]} />
          </mesh>
          <mesh position={[0, 2.75, 0]} material={toon("#2f6fd6")} castShadow>
            <boxGeometry args={[3.6, 0.3, 2.6]} />
          </mesh>
          <Fx>
            <mesh position={[0, 1.0, 1.205]} material={flat("#fff1c4", 2.2)}>
              <planeGeometry args={[1.6, 1.9]} />
            </mesh>
          </Fx>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (0.4 + doors * 0.78), 1.0, 1.23]} material={toon("#b9c3d3")}>
              <boxGeometry args={[0.8, 1.95, 0.06]} />
            </mesh>
          ))}
          <mesh position={[0, 2.15, 1.23]} material={toon("#1e2230")}>
            <boxGeometry args={[1.0, 0.36, 0.05]} />
          </mesh>
          <Label text="▲ UP" h={0.26} pos={[0, 2.15, 1.27]} o={{ size: 120, color: doors > 0.5 ? "#5cff8a" : "#ffd23f" }} glow={1.6} />
        </group>
        {/* the control house */}
        <group position={[4.2, DECK, -3.0]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 1.0, 0]} material={toon("#eef1f5")} castShadow receiveShadow>
            <boxGeometry args={[2.4, 2.0, 2.0]} />
          </mesh>
          <mesh position={[0, 1.3, 1.01]} material={flat("#7fc3ff", 1.0)}>
            <planeGeometry args={[1.9, 0.6]} />
          </mesh>
          <mesh position={[0, 2.15, 0]} material={toon("#e5484d")}>
            <boxGeometry args={[2.6, 0.3, 2.2]} />
          </mesh>
        </group>
        {/* the helipad */}
        <mesh position={[-3.4, DECK + 0.02, -3.4]} rotation={[-Math.PI / 2, 0, 0]} material={toon("#ffffff", { map: helipadTex() })} receiveShadow>
          <circleGeometry args={[1.8, 40]} />
        </mesh>
        {/* containers */}
        {[
          [5.6, 1.6, "#e5484d"],
          [5.9, 0.0, "#2f6fd6"],
          [5.4, -1.0, "#f5a524"],
        ].map(([x, z, c], i) => (
          <mesh key={i} position={[x as number, DECK + 0.45, z as number]} rotation={[0, 0.3, 0]} material={toon(c as string)} castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.9, 1.9]} />
          </mesh>
        ))}
        {cranes
          ? [-1, 1].map((s) => (
              <group key={s} position={[2.6 + s * 1.45, DECK, -1.4]}>
                <mesh position={[0, 2.5, 0]} material={toon("#ffcc22")} castShadow>
                  <boxGeometry args={[0.25, 5, 0.25]} />
                </mesh>
                <mesh position={[-s * 1.2, 4.9, 0]} rotation={[0, 0, s * 0.08]} material={toon("#ffcc22")} castShadow>
                  <boxGeometry args={[3.0, 0.2, 0.2]} />
                </mesh>
              </group>
            ))
          : null}
        {children}
      </group>
    </group>
  );
};

/** Confetti over the crowd. */
export const Confetti: React.FC<{ t: number; t0: number; center: [number, number, number]; n?: number }> = ({ t, t0, center, n = 90 }) => {
  const u = t - t0;
  if (u <= 0) return null;
  const cols = ["#ff5d6c", "#ffd23f", "#5cff8a", "#4fd2ff", "#c77dff", "#ffffff"];
  return (
    <Fx>
      {Array.from({ length: n }, (_, i) => {
        const h = (k: number) => hash(i * 11.3 + k);
        const vx = (h(1) - 0.5) * 3;
        const vz = (h(2) - 0.5) * 3;
        const vy = 3 + h(3) * 3;
        const y = vy * u - 3.2 * u * u;
        const drift = Math.min(u, 2.5);
        const p: [number, number, number] = [center[0] + vx * drift + Math.sin(u * 3 + i) * 0.2, center[1] + Math.max(-3, y), center[2] + vz * drift];
        return (
          <mesh key={i} position={p} rotation={[u * (3 + h(4) * 4), u * 2 + i, u * (2 + h(5) * 3)]} material={flat(cols[i % cols.length], 1.2, { side: THREE.DoubleSide })}>
            <planeGeometry args={[0.09, 0.14]} />
          </mesh>
        );
      })}
    </Fx>
  );
};

/** A big ship's wheel (for steering the base out of the junk's way). */
export const Wheel: React.FC<{ turn: number; pos: [number, number, number]; rot?: [number, number, number] }> = ({ turn, pos, rot = [0, 0, 0] }) => (
  <group position={pos} rotation={rot}>
    <mesh position={[0, -0.45, -0.1]} material={toon("#7a5236")}>
      <boxGeometry args={[0.16, 0.9, 0.16]} />
    </mesh>
    <group rotation={[0, 0, turn]}>
      <mesh material={toon("#a0683f")}>
        <torusGeometry args={[0.45, 0.04, 10, 36]} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} rotation={[0, 0, (i / 8) * Math.PI * 2]}>
          <mesh position={[0, 0.32, 0]} material={toon("#a0683f")}>
            <cylinderGeometry args={[0.025, 0.025, 0.64, 6]} />
          </mesh>
          <mesh position={[0, 0.58, 0]} material={toon("#7a5236")}>
            <cylinderGeometry args={[0.035, 0.03, 0.16, 8]} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={gloss("#c79a3b", 0.3)}>
        <cylinderGeometry args={[0.09, 0.09, 0.12, 16]} />
      </mesh>
    </group>
  </group>
);
